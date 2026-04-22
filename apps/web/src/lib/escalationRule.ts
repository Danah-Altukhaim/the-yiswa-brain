// Parses and serializes the `trigger` blob used by escalation rule entries.
// The blob has two known shapes, both produced out in the wild:
//   1. Importer output (scripts/import-fk-drive.ts): newline-separated with
//      explicit prefixes (Keywords:, To:, SLA:, Script:).
//   2. Seed/hand-entered data: one-line prose,
//      "<Category> - <keywords>. Escalate to <target>. SLA: <value>. Auto: <script>."
//      Entries without escalation use "Handled by <x>. No escalation needed."
// parseTrigger tries format 1 first and falls back to format 2.
// serializeTrigger always writes format 1 (the importer's format) so saved
// data is easier to round-trip going forward.

export type ParsedEscalationRule = {
  category: string;
  keywords: string;
  escalationTarget: string;
  slaHours: number | null;
  autoResponse: string;
};

const PREFIX_RE = /^(keywords|to|sla|script)\s*:\s*(.*)$/i;

export function parseTrigger(trigger: string): ParsedEscalationRule {
  const out: ParsedEscalationRule = {
    category: "",
    keywords: "",
    escalationTarget: "",
    slaHours: null,
    autoResponse: "",
  };
  if (!trigger) return out;

  const normalized = trigger.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const leading: string[] = [];
  let sawPrefix = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(PREFIX_RE);
    if (!m) {
      if (!sawPrefix) leading.push(line);
      continue;
    }
    sawPrefix = true;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === "keywords") out.keywords = val;
    else if (key === "to") out.escalationTarget = val;
    else if (key === "sla") out.slaHours = parseSla(val);
    else if (key === "script") out.autoResponse = val;
  }

  if (sawPrefix) {
    out.category = leading.join(" ").trim() || lines[0]?.trim() || "";
    return out;
  }

  return parseProseTrigger(normalized);
}

function parseProseTrigger(s: string): ParsedEscalationRule {
  const out: ParsedEscalationRule = {
    category: "",
    keywords: "",
    escalationTarget: "",
    slaHours: null,
    autoResponse: "",
  };
  let rest = s;

  const autoMatch = rest.match(/\bAuto\s*:\s*([\s\S]+?)\s*$/i);
  if (autoMatch) {
    out.autoResponse = autoMatch[1]!.trim().replace(/\.$/, "");
    rest = rest
      .slice(0, autoMatch.index)
      .trim()
      .replace(/\.\s*$/, "")
      .trim();
  }

  const slaMatch = rest.match(/\bSLA\s*:\s*([^.]+?)\s*(?:\.|$)/i);
  if (slaMatch) {
    out.slaHours = parseSla(slaMatch[1]!.trim());
    rest = (rest.slice(0, slaMatch.index) + rest.slice(slaMatch.index! + slaMatch[0].length))
      .replace(/\s+/g, " ")
      .replace(/\.\s*$/, "")
      .trim();
  }

  // After upstream removal of SLA and Auto sections, any trailing "Escalate to X"
  // runs to end-of-string. Use a greedy-to-end capture with optional trailing
  // period so dotted domains (e.g. finance@pairai.com) parse as a single token.
  const escalateMatch = rest.match(/\bEscalate[sd]?\s+to\s+(.+?)\s*\.?\s*$/i);
  if (escalateMatch) {
    out.escalationTarget = escalateMatch[1]!.trim();
    rest = (
      rest.slice(0, escalateMatch.index) +
      rest.slice(escalateMatch.index! + escalateMatch[0].length)
    )
      .replace(/\s+/g, " ")
      .replace(/\.\s*$/, "")
      .trim();
  } else {
    const handledMatch = rest.match(/\bHandled\s+by\s+[^.]+?\.\s*No\s+escalation\s+needed\.?/i);
    if (handledMatch) {
      rest = rest
        .replace(handledMatch[0], "")
        .replace(/\s+/g, " ")
        .replace(/\.\s*$/, "")
        .trim();
    }
  }

  const dashIdx = rest.indexOf(" - ");
  if (dashIdx > 0) {
    out.category = rest.slice(0, dashIdx).trim();
    out.keywords = rest
      .slice(dashIdx + 3)
      .trim()
      .replace(/\.$/, "");
  } else {
    out.category = rest.replace(/\.$/, "").trim();
  }

  return out;
}

function parseSla(v: string): number | null {
  const s = v.toLowerCase().trim();
  let m = s.match(/^([\d.]+)\s*(h|hr|hour|hours)?$/);
  if (m) return Number(m[1]);
  m = s.match(/^([\d.]+)\s*(m|min|mins|minute|minutes)$/);
  if (m) return Number(m[1]) / 60;
  m = s.match(/^([\d.]+)/);
  return m ? Number(m[1]) : null;
}

export function serializeTrigger(p: ParsedEscalationRule): string {
  const parts: string[] = [];
  if (p.category.trim()) parts.push(p.category.trim());
  if (p.keywords.trim()) parts.push(`Keywords: ${p.keywords.trim()}`);
  if (p.escalationTarget.trim()) parts.push(`To: ${p.escalationTarget.trim()}`);
  if (p.slaHours != null && !Number.isNaN(p.slaHours)) {
    const n = p.slaHours;
    const formatted = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
    parts.push(`SLA: ${formatted}h`);
  }
  if (p.autoResponse.trim()) parts.push(`Script: ${p.autoResponse.trim()}`);
  return parts.join("\n");
}

export function hasEscalationTarget(p: ParsedEscalationRule): boolean {
  return p.escalationTarget.trim().length > 0;
}

export type SlaUrgency = "urgent" | "high" | "normal" | "low" | "none";

export function slaUrgency(h: number | null): SlaUrgency {
  if (h == null) return "none";
  if (h <= 0.5) return "urgent";
  if (h <= 2) return "high";
  if (h <= 4) return "normal";
  return "low";
}
