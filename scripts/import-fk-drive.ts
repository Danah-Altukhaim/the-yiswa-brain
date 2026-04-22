/**
 * One-shot Future Kid Drive data importer.
 *
 * Parses the pre-rendered natural-language sheet file (JSON { fileContent: string }),
 * installs/creates the required modules in The Brain for tenant future-kid, and
 * bulk-imports rows with idempotent externalIds.
 *
 * Run:
 *   cd /Users/mac/Documents/The\ Brain/the-brain && \
 *   export $(grep -v '^#' .env | xargs) && \
 *   node --import tsx scripts/import-fk-drive.ts
 */

import { readFileSync } from "node:fs";

// ---------- config ----------
const API_BASE = process.env.API_BASE ?? "http://localhost:3100/api/v1";
const TENANT_SLUG = "future-kid";
const TENANT_ID = "37cec7e9-c76d-44ba-af41-0162af00f4a7";
const EMAIL = "admin@pairai.com";
const PASSWORD = "password1";

const SOURCE_FILE = process.env.SOURCE_FILE ?? "/tmp/fk-drive/master-sheet.json";

// ---------- util ----------
type Counts = { imported: number; skipped: number; errored: number };
const stats: Record<string, Counts> = {};
function bump(mod: string, k: keyof Counts) {
  stats[mod] ??= { imported: 0, skipped: 0, errored: 0 };
  stats[mod][k]++;
}

function cleanCell(raw: string): string {
  // remove markdown-escapes and trim
  return raw
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\-/g, "-")
    .replace(/\\\|/g, "|")
    .replace(/\\\\/g, "\\")
    .trim();
}

function splitRow(line: string): string[] {
  // lines look like: | a | b | c |
  if (!line.startsWith("|")) return [];
  const inner = line.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => cleanCell(c));
}

function isSeparator(line: string): boolean {
  // A proper markdown-table separator row: only pipes, colons, dashes, and spaces.
  // Reject if any alphanumeric content appears (real content rows contain text).
  if (!line.startsWith("|")) return false;
  return /^[|:\-\s]+$/.test(line) && /[-:]{3,}|:-:/.test(line);
}

/** Parse a table that starts at `headerIdx` in `lines`. Rows stop at blank line or end. */
function parseTable(lines: string[], headerIdx: number): { headers: string[]; rows: string[][] } {
  const headers = splitRow(lines[headerIdx]);
  const rows: string[][] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const L = lines[i];
    if (!L || !L.startsWith("|") || isSeparator(L)) break;
    const cells = splitRow(L);
    // pad to header length
    while (cells.length < headers.length) cells.push("");
    rows.push(cells);
  }
  return { headers, rows };
}

function findHeaderLine(lines: string[], matcher: (headerLine: string) => boolean): number {
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith("|") && isSeparator(lines[i + 1] ?? "") && matcher(lines[i])) {
      return i;
    }
  }
  return -1;
}

function isPlaceholder(s: string): boolean {
  if (!s) return true;
  const t = s.trim();
  return (
    t === "" ||
    /place\s*eng\s*text\s*here/i.test(t) ||
    /place\s*arb\s*text\s*here/i.test(t) ||
    t === "N/A" ||
    t === "TBD"
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Kuwait-month short to ISO date string (YYYY-MM-DD). */
function parseSheetDate(s: string): string | null {
  if (!s) return null;
  const t = s.trim().replace(/\s+/g, " ");
  // e.g. "2026-Mar-16", "2026-Apr-01"
  const m = /^(\d{4})-([A-Za-z]{3})-(\d{1,2})/.exec(t);
  if (m) {
    const months: Record<string, string> = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    const mm = months[m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()];
    if (!mm) return null;
    return `${m[1]}-${mm}-${String(Number(m[3])).padStart(2, "0")}`;
  }
  return null;
}

function toIsoDatetime(dateStr: string | null): string | undefined {
  if (!dateStr) return undefined;
  return `${dateStr}T00:00:00.000Z`;
}

// ---------- HTTP ----------
let TOKEN = "";
async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function login(): Promise<void> {
  const r = await api("POST", "/auth/login", { tenantSlug: TENANT_SLUG, email: EMAIL, password: PASSWORD });
  if (!r.ok) throw new Error(`Login failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { data: { token: string } };
  TOKEN = j.data.token;
  console.log("[auth] logged in as", EMAIL, "tenant", TENANT_SLUG);
}

async function installMarketplace(slugs: string[]): Promise<void> {
  const r = await api("POST", "/admin/marketplace/install", { tenantId: TENANT_ID, slugs });
  if (!r.ok) throw new Error(`Marketplace install failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { data: unknown[] };
  console.log(`[marketplace] installed ${j.data.length} modules:`, slugs.join(", "));
}

async function createCustomModule(mod: {
  slug: string;
  label: string;
  icon: string;
  fields: Array<Record<string, unknown>>;
}): Promise<void> {
  const r = await api("POST", "/admin/modules", {
    tenantId: TENANT_ID,
    slug: mod.slug,
    label: mod.label,
    icon: mod.icon,
    fields: mod.fields,
    behaviors: {},
  });
  if (r.ok) {
    console.log(`[module] created ${mod.slug}`);
    return;
  }
  const txt = await r.text();
  if (r.status === 409 || /duplicate|unique|already exists/i.test(txt)) {
    console.log(`[module] ${mod.slug} already exists, skipping`);
    return;
  }
  if (r.status === 500) {
    // API returns generic 500 for unique-slug conflicts; attempt to insert into it. If it truly doesn't exist, entry inserts will 404.
    console.log(`[module] ${mod.slug} create returned 500, assuming already exists, continuing`);
    return;
  }
  throw new Error(`Create module ${mod.slug} failed: ${r.status} ${txt}`);
}

// Pre-fetched set of existing externalIds per module slug (populated by preloadExisting()).
const existingExt: Record<string, Set<string>> = {};

async function preloadExisting(moduleSlug: string): Promise<void> {
  const r = await api("GET", `/entries/${moduleSlug}`);
  existingExt[moduleSlug] = new Set<string>();
  if (!r.ok) return;
  const j = (await r.json()) as { data?: Array<{ externalId?: string | null }> };
  for (const e of j.data ?? []) if (e.externalId) existingExt[moduleSlug].add(e.externalId);
}

async function insertEntry(
  moduleSlug: string,
  externalId: string,
  data: Record<string, unknown>,
  extras?: { publishAt?: string; expiresAt?: string },
): Promise<void> {
  // Pre-check against server snapshot to avoid swallowed-P2002 500s.
  if (existingExt[moduleSlug]?.has(externalId)) {
    bump(moduleSlug, "skipped");
    return;
  }
  const r = await api("POST", `/entries/${moduleSlug}`, {
    data,
    externalId,
    ...(extras?.publishAt ? { publishAt: extras.publishAt } : {}),
    ...(extras?.expiresAt ? { expiresAt: extras.expiresAt } : {}),
  });
  if (r.ok) {
    bump(moduleSlug, "imported");
    existingExt[moduleSlug]?.add(externalId);
    return;
  }
  const txt = await r.text();
  if (r.status === 409 || (/duplicate|unique/i.test(txt) && /externalId|external_id/i.test(txt))) {
    bump(moduleSlug, "skipped");
    return;
  }
  // Retry once on generic 500 (observed flakiness, sometimes Prisma conn hiccup)
  if (r.status === 500) {
    const r2 = await api("POST", `/entries/${moduleSlug}`, {
      data,
      externalId,
      ...(extras?.publishAt ? { publishAt: extras.publishAt } : {}),
      ...(extras?.expiresAt ? { expiresAt: extras.expiresAt } : {}),
    });
    if (r2.ok) {
      bump(moduleSlug, "imported");
      existingExt[moduleSlug]?.add(externalId);
      return;
    }
    const t2 = await r2.text();
    bump(moduleSlug, "errored");
    console.warn(`[${moduleSlug}] ${externalId} -> ${r2.status}: ${t2.slice(0, 220)}`);
    return;
  }
  bump(moduleSlug, "errored");
  console.warn(`[${moduleSlug}] ${externalId} -> ${r.status}: ${txt.slice(0, 220)}`);
}

// ---------- parsing helpers ----------
type Sheet = { headers: string[]; rows: string[][] };

function loadSheets(): Record<string, Sheet> {
  const raw = readFileSync(SOURCE_FILE, "utf8");
  const payload = JSON.parse(raw) as { fileContent: string };
  const lines = payload.fileContent.split("\n");
  const sheets: Record<string, Sheet> = {};

  const find = (pred: (h: string) => boolean): Sheet | null => {
    const idx = findHeaderLine(lines, pred);
    if (idx < 0) return null;
    return parseTable(lines, idx);
  };

  sheets.policy_matrix = find((h) => /\|\s*Policy Area\s*\|/.test(h))!;
  sheets.branches_regular = find((h) => /Branch \(Arabic\)/.test(h))!;
  // Ramadan-hours table is `# | Branch | Governorate | SUN | MON | ...` (no Arabic column)
  sheets.branches_ramadan = find((h) => /\|\s*Branch\s*\|\s*Governorate\s*\|\s*SUN\s*\|/.test(h))!;
  sheets.escalation = find((h) => /Trigger Type/.test(h) && /To Whom/.test(h))!;
  sheets.faqs = find((h) => /Question \(EN\)/.test(h) && /Answer \(EN\)/.test(h))!;
  sheets.response_templates = find((h) => /Template ID/.test(h) && /Script \(EN\)/.test(h))!;
  sheets.intents = find((h) => /Intent ID/.test(h) && /Intent Name/.test(h))!;
  sheets.booking_flows = find((h) => /Flow ID/.test(h) && /Trigger/.test(h) && /Booking Link/.test(h))!;
  // Approval_Gate starts with AI_Record_ID as the FIRST column (not Raw_Row). Raw_Archive also contains
  // AI_Record_ID but it's the 3rd column, so we must skip it.
  sheets.approval_gate = find((h) => /^\|\s*AI[\\_]*Record[\\_]*ID\s*\|/.test(h) && /Review[\\_]*Status/.test(h))!;

  // --- New section matchers ---
  sheets.change_requests = find((h) => /Change Type/.test(h) && /AI[\\_]*Pivot[\\_]*Strategy/.test(h))!;
  sheets.priority_matrix = find((h) => /Priority Info Only/.test(h))!;
  sheets.risks = find((h) => /Risk Scenario/.test(h) && /Mitigation/.test(h))!;
  sheets.announcements = find((h) => /\|\s*Date\s*\|/.test(h) && /Action Required/.test(h) && /Deadline/.test(h))!;
  sheets.known_issues = find((h) => /\|\s*Issue\s*\|/.test(h) && /PAIR AI Fix/.test(h))!;
  sheets.data_gaps = find((h) => /Data Gap/.test(h) && /Priority/.test(h))!;
  sheets.promotions_master = find((h) => /Promo[\\_]*Type/.test(h) && /Push Online/.test(h))!;
  sheets.enums = find((h) => /List[\\_]*Name/.test(h) && /Aux[\\_]*1/.test(h))!;
  sheets.bot_flow_steps = find((h) => /Step/.test(h) && /Bot Action/.test(h))!;
  sheets.bot_buttons = find((h) => /Button Label/.test(h) && /Action/.test(h) && /Context/.test(h))!;
  sheets.update_routing = find((h) => /Raw[\\_]*Update[\\_]*Type/.test(h) && /AI[\\_]*Category/.test(h))!;
  sheets.priority_tiers = find((h) => /Priority[\\_]*Tier/.test(h) && /Priority[\\_]*Label/.test(h))!;
  sheets.branch_groups = find((h) => /Branch[\\_]*Name/.test(h) && /Branch[\\_]*Group/.test(h))!;

  for (const [k, v] of Object.entries(sheets)) {
    console.log(`[sheet] ${k}: ${v ? v.rows.length + " rows" : "NOT FOUND"}`);
  }
  return sheets;
}

// ---------- importers ----------
function buildRamadanMap(s: Sheet | null): Map<string, string> {
  const m = new Map<string, string>();
  if (!s) return m;
  // headers: # | Branch | Governorate | SUN..SAT
  for (const r of s.rows) {
    const [, name, , sun, mon, tue, wed, thu, fri, sat] = r;
    if (!name) continue;
    const hours = [
      `SUN: ${sun}`, `MON: ${mon}`, `TUE: ${tue}`, `WED: ${wed}`,
      `THU: ${thu}`, `FRI: ${fri}`, `SAT: ${sat}`,
    ].join("\n");
    m.set(slugify(name), hours);
  }
  return m;
}

/** After branch inserts, patch any existing branches missing hours_ramadan. */
async function patchRamadanHours(ramadan: Map<string, string>) {
  if (ramadan.size === 0) return;
  const r = await api("GET", "/entries/branches");
  if (!r.ok) { console.warn(`[ramadan] GET branches -> ${r.status}`); return; }
  const j = (await r.json()) as { data?: Array<{ id: string; externalId?: string | null; data?: Record<string, unknown> }> };
  let patched = 0;
  for (const entry of j.data ?? []) {
    const name = (entry.data as Record<string, unknown> | undefined)?.name_en as string | undefined;
    if (!name) continue;
    const ram = ramadan.get(slugify(name));
    if (!ram) continue;
    const existing = (entry.data as Record<string, unknown> | undefined)?.hours_ramadan;
    if (existing && String(existing).trim() === ram.trim()) continue;
    const merged = { ...(entry.data as Record<string, unknown>), hours_ramadan: ram };
    const resp = await api("PATCH", `/entries/branches/${entry.id}`, { data: merged, changeSummary: "Sync Ramadan hours from master sheet" });
    if (resp.ok) patched++;
    else console.warn(`[ramadan] PATCH ${name} -> ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
  }
  console.log(`[ramadan] patched ${patched} branch(es) with hours_ramadan`);
}

async function importBranches(s: Sheet, ramadan: Map<string, string>) {
  if (!s) return;
  // headers: # | Branch | Branch (Arabic) | Governorate | Status | Google Location | SUN..SAT
  for (const r of s.rows) {
    const [, nameEn, nameAr, governorate, status, mapsUrl, sun, mon, tue, wed, thu, fri, sat] = r;
    if (!nameEn || nameEn === "" ) { bump("branches", "skipped"); continue; }
    if (/CLOSED/i.test(status) || /CLOSED/i.test(nameEn)) { bump("branches", "skipped"); continue; }
    if (/Souq Sharq Mall/i.test(nameEn) || /Safat Al Mubarakiya/i.test(nameEn)) { bump("branches", "skipped"); continue; }
    const gov = ["Hawalli", "Jahra", "Ahmadi", "Farwaniya", "Al-Asimah"].includes(governorate)
      ? governorate
      : "Al-Asimah";
    const st = /Active/i.test(status) ? "Active" : /CLOSED/i.test(status) ? "CLOSED" : "Active";
    const hours = [
      `SUN: ${sun}`, `MON: ${mon}`, `TUE: ${tue}`, `WED: ${wed}`,
      `THU: ${thu}`, `FRI: ${fri}`, `SAT: ${sat}`,
    ].join("\n");
    const data: Record<string, unknown> = {
      name_en: nameEn,
      name_ar: nameAr || nameEn,
      governorate: gov,
      status: st,
      hours_regular: hours,
    };
    const ramHours = ramadan.get(slugify(nameEn));
    if (ramHours) data.hours_ramadan = ramHours;
    if (mapsUrl && /^https?:/.test(mapsUrl)) data.google_maps_url = mapsUrl;
    const ext = `branch-${slugify(nameEn).slice(0, 60)}`;
    await insertEntry("branches", ext, data);
  }
}

async function importFaqs(s: Sheet) {
  if (!s) return;
  // headers: # | Question (EN) | Answer (EN) | Answer (AR) | Category | Source | Date Added | AI Approved?
  for (const r of s.rows) {
    const [num, qEn, aEn, aAr, category] = r;
    if (!qEn || isPlaceholder(qEn) || !aEn || isPlaceholder(aEn)) { bump("faqs", "skipped"); continue; }
    const data: Record<string, unknown> = {
      question_en: qEn,
      question_ar: qEn, // sheet has no Arabic question; mirror EN
      answer_en: aEn,
    };
    if (aAr && !isPlaceholder(aAr)) data.answer_ar = aAr;
    else data.answer_ar = aEn;
    if (category && !isPlaceholder(category)) data.category = category;
    const n = num?.padStart ? num.padStart(3, "0") : String(num ?? "").padStart(3, "0");
    const ext = `faq-${n}`;
    await insertEntry("faqs", ext, data);
  }
}

async function importResponseTemplates(s: Sheet) {
  if (!s) return;
  // headers: Template ID | Category | Use_Case | Script (EN) | Script (AR) | Variables_Used | Tone | Editable?
  for (const r of s.rows) {
    const [tid, category, useCase, scriptEn, scriptAr, , tone] = r;
    if (!tid || tid === "N/A" || isPlaceholder(tid)) { bump("response_templates", "skipped"); continue; }
    if (!scriptEn || isPlaceholder(scriptEn)) { bump("response_templates", "skipped"); continue; }
    const data: Record<string, unknown> = {
      intent: category || tid,
      message_en: scriptEn,
      message_ar: scriptAr && !isPlaceholder(scriptAr) ? scriptAr : scriptEn,
      // passthrough extras
      template_id: tid,
      category,
      use_case: useCase,
      tone,
    };
    await insertEntry("response_templates", `tpl-${slugify(tid)}`, data);
  }
}

async function importEscalation(s: Sheet) {
  if (!s) return;
  // headers: Trigger Type | Example Keywords | Escalate? | To Whom | SLA (Hours) | Auto Response Script
  for (const r of s.rows) {
    const [triggerType, keywords, , toWhom, sla, script] = r;
    if (!triggerType || isPlaceholder(triggerType)) { bump("escalation_rules", "skipped"); continue; }
    let channel = "human_chat";
    if (/whatsapp/i.test(toWhom)) channel = "whatsapp";
    else if (/phone|hotline|call/i.test(toWhom)) channel = "phone";
    else if (/email/i.test(toWhom)) channel = "email";
    const trigger = [`${triggerType}`, keywords && `Keywords: ${keywords}`, toWhom && `To: ${toWhom}`, sla && `SLA: ${sla}h`, script && `Script: ${script}`]
      .filter(Boolean)
      .join("\n");
    await insertEntry("escalation_rules", `esc-${slugify(triggerType).slice(0, 60)}`, {
      trigger,
      channel,
    });
  }
}

async function importPolicyMatrix(s: Sheet) {
  if (!s) return;
  // headers: Policy Area | Rule / Response | Applies To | Exception? | Escalate? | Final Authority | Notes
  let idx = 0;
  for (const r of s.rows) {
    idx++;
    const [area, rule, , exception] = r;
    if (!area || isPlaceholder(area)) { bump("policy_matrix", "skipped"); continue; }
    if (!rule || isPlaceholder(rule)) { bump("policy_matrix", "skipped"); continue; }
    const data: Record<string, unknown> = {
      scenario_en: area,
      scenario_ar: area,
      policy_en: rule,
      policy_ar: rule,
    };
    if (exception && !isPlaceholder(exception) && exception.toLowerCase() !== "no") {
      data.exception_en = exception;
      data.exception_ar = exception;
    }
    await insertEntry("policy_matrix", `pol-${slugify(area).slice(0, 60)}-${idx}`, data);
  }
}

async function importPartners() {
  // Derived from the response-templates third-party block and known FK partners.
  const partners = [
    { name: "Al-Arfaj", type: "Corporate", notes: "20% discount for first responders (government/armed-forces/ministry employees). ID required at branch." },
    { name: "Sheeel", type: "Loyalty", notes: "Recharge offers: Buy 5KD get 10KD; Buy 10KD get 20KD." },
    { name: "KNCC", type: "Corporate", notes: "Partner terms; see documents module." },
  ];
  for (const p of partners) {
    await insertEntry("partners", `partner-${slugify(p.name)}`, {
      name: p.name,
      type: p.type,
      notes_en: p.notes,
      notes_ar: p.notes,
    });
  }
}

async function importApprovedPromotions(s: Sheet) {
  if (!s) return;
  // Approval_Gate headers: AI_Record_ID | Update_Name | Raw_Customer_Message | Message_EN_Approved | Message_AR_Approved |
  // AI_Category | Start_Date | End_Date | Active_Status | Priority_Tier | Override | Submitted_By | Approved_By_Source |
  // Review_Status | Review_Notes | Push_to_AI
  const seenNames = new Set<string>();
  for (const r of s.rows) {
    const [aiId, updateName, rawMsg, msgEn, msgAr, aiCategory, startRaw, endRaw, activeStatus, , , , , reviewStatus] = r;
    if (!aiId || isPlaceholder(aiId)) { bump("promotions", "skipped"); continue; }
    // Skip test/junk rows
    const junkIds = new Set(["FK-001", "FK-002", "FK-006", "FK-007"]);
    if (junkIds.has(aiId.trim())) { bump("promotions", "skipped"); continue; }
    if (/test/i.test(updateName) && !/testing eid offer/i.test(updateName)) { /* allow; final guard below */ }
    // Review must be Approved, not Expired
    if (!/Approved/i.test(reviewStatus || "")) { bump("promotions", "skipped"); continue; }
    if (/Expired/i.test(activeStatus || "")) { bump("promotions", "skipped"); continue; }
    // Message must be real English content
    const effectiveEn = msgEn && !isPlaceholder(msgEn) ? msgEn : rawMsg && !isPlaceholder(rawMsg) ? rawMsg : "";
    if (!effectiveEn) { bump("promotions", "skipped"); continue; }
    // De-dup near-duplicate Al-Arfaj rows by update_name
    const nameKey = (updateName || "").trim().toLowerCase();
    if (seenNames.has(nameKey)) { bump("promotions", "skipped"); continue; }
    seenNames.add(nameKey);

    const cat = (aiCategory || "").toLowerCase();
    let type = "Promo";
    if (cat.includes("bank")) type = "Bank";
    else if (cat.includes("season") || cat.includes("eid") || cat.includes("ramadan")) type = "Seasonal";
    else if (cat.includes("system") || cat.includes("update")) type = "Update";
    else if (cat.includes("operational") || cat.includes("ops")) type = "Ops";
    else if (cat.includes("partner")) type = "Promo";

    const startIso = toIsoDatetime(parseSheetDate(startRaw));
    const endIso = toIsoDatetime(parseSheetDate(endRaw));

    const data: Record<string, unknown> = {
      name: updateName || aiId,
      type,
      message_en: effectiveEn,
      message_ar: msgAr && !isPlaceholder(msgAr) ? msgAr : effectiveEn,
    };
    if (startIso) data.start_date = startIso;
    if (endIso) data.end_date = endIso;

    await insertEntry("promotions", `promo-${slugify(aiId)}`, data);
  }
}

async function importIntents(s: Sheet) {
  if (!s) return;
  // headers: Intent ID | Intent Name | Description | Response Template Ref | Requires CRM? | Escalation Check? | Revenue Opportunity?
  for (const r of s.rows) {
    const [iid, name, description, templateRef] = r;
    if (!iid || isPlaceholder(iid)) { bump("intents", "skipped"); continue; }
    await insertEntry("intents", `intent-${slugify(iid)}`, {
      name: name || iid,
      description: description || "",
      ai_instructions: templateRef || "",
    });
  }
}

async function importBookingFlows(s: Sheet) {
  if (!s) return;
  // headers: Flow ID | Trigger | Questions to Ask | Booking Link | Upsell Option | Branch Limitation | Status | Notes
  for (const r of s.rows) {
    const [fid, trigger, questions, bookingLink, upsell, branchLim, status] = r;
    if (!fid || isPlaceholder(fid)) { bump("booking_flows", "skipped"); continue; }
    const data: Record<string, unknown> = {
      flow_id: fid,
      trigger: trigger || "",
      questions: questions || "",
      upsell: upsell || "",
      branch_limit: branchLim || "",
      status: status || "",
    };
    // Only include booking_link if it's a real URL (module field is type url, which validates z.string() so any string works, but be tidy)
    if (bookingLink && /^https?:/.test(bookingLink)) data.booking_link = bookingLink;
    await insertEntry("booking-flows", `flow-${slugify(fid)}`, data);
  }
}

async function importDocuments() {
  const docs = [
    {
      title: "A4 Membership Promotion (v2)",
      description: "Membership promotion collateral (A4).",
      source_url: "https://drive.google.com/file/d/1hwBgJwTYc4hgRpZxwIFkPxx9lOowRElO/view",
      mime_type: "application/pdf",
      kind: "pdf",
      id: "1hwBgJwTYc4hgRpZxwIFkPxx9lOowRElO",
    },
    {
      title: "KNCC Terms and Conditions (AR)",
      description: "KNCC partner terms and conditions (Arabic).",
      source_url: "https://drive.google.com/file/d/1dx74bSdeWltIC-SmAoUKB5c41ydq2eSh/view",
      mime_type: "application/pdf",
      kind: "pdf",
      id: "1dx74bSdeWltIC-SmAoUKB5c41ydq2eSh",
    },
    {
      title: "FK Photo 2026-03-21",
      description: "Marketing / operations photo.",
      source_url: "https://drive.google.com/file/d/1V8eU2k2kLOs91u3ExOjEaNfNq4nnq6Fb/view",
      mime_type: "image/jpeg",
      kind: "image",
      id: "1V8eU2k2kLOs91u3ExOjEaNfNq4nnq6Fb",
    },
  ];
  for (const d of docs) {
    await insertEntry("documents", `doc-${d.id}`, {
      title: d.title,
      description_en: d.description,
      description_ar: d.description,
      source_url: d.source_url,
      mime_type: d.mime_type,
      kind: d.kind,
    });
  }
}

// ---------- new-section importers ----------

function nonEmptyRow(r: string[]): boolean {
  return r.some((c) => c && !isPlaceholder(c));
}

async function importChangeRequests(s: Sheet) {
  if (!s) return;
  // Change Type | Status | Yes/No | Category | Tone Level | Probability | Impact | Branches |
  // Audience | Offer_Category | Direct_Priority | Visibility_Type | AI_Pivot_Strategy
  let idx = 0;
  for (const r of s.rows) {
    idx++;
    const [changeType, status, yn, category, tone, probability, impact, branches, audience, offerCat, directPriority, visibilityType, pivot] = r;
    if (!changeType || isPlaceholder(changeType)) { bump("change-requests", "skipped"); continue; }
    if (!nonEmptyRow(r)) { bump("change-requests", "skipped"); continue; }
    const data = {
      change_type: changeType,
      status: status || "",
      yes_no: yn || "",
      category: category || "",
      tone_level: tone || "",
      probability: probability || "",
      impact: impact || "",
      branches: branches || "",
      audience: audience || "",
      offer_category: offerCat || "",
      direct_priority: directPriority || "",
      visibility_type: visibilityType || "",
      ai_pivot_strategy: pivot || "",
    };
    await insertEntry("change-requests", `change-${slugify(changeType)}-${idx}`, data);
  }
}

async function importPriorityMatrix(s: Sheet) {
  if (!s) return;
  // Priority Info Only (AI) | Category Explained | Why
  for (const r of s.rows) {
    const [priority, category, why] = r;
    if (!priority || !category) { bump("priority-matrix", "skipped"); continue; }
    await insertEntry("priority-matrix", `priority-${slugify(category)}`, {
      priority_number: priority,
      category,
      why: why || "",
    });
  }
}

async function importRisks(s: Sheet) {
  if (!s) return;
  // Risk Scenario | Probability | Impact | Mitigation | Owner | Last Reviewed
  for (const r of s.rows) {
    const [scenario, probability, impact, mitigation, owner, lastReviewed] = r;
    if (!scenario || isPlaceholder(scenario)) { bump("risks", "skipped"); continue; }
    await insertEntry("risks", `risk-${slugify(scenario).slice(0, 60)}`, {
      scenario,
      probability: probability || "",
      impact: impact || "",
      mitigation: mitigation || "",
      owner: owner || "",
      last_reviewed: lastReviewed || "",
    });
  }
}

async function importAnnouncements(s: Sheet) {
  if (!s) return;
  // Date | Title | Category | Audience | Action Required | Owner | Deadline | Status | Notes
  let idx = 0;
  for (const r of s.rows) {
    idx++;
    const [date, title, category, audience, actionRequired, owner, deadline, status, notes] = r;
    if (!title || isPlaceholder(title)) { bump("announcements", "skipped"); continue; }
    await insertEntry("announcements", `ann-${slugify(title).slice(0, 60) || String(idx)}`, {
      date: date || "",
      title,
      category: category || "",
      audience: audience || "",
      action_required: actionRequired || "",
      owner: owner || "",
      deadline: deadline || "",
      status: status || "",
      notes: notes || "",
    });
  }
}

async function importKnownIssues(s: Sheet) {
  if (!s) return;
  // # | Issue | Severity | Impact | Status | PAIR AI Fix / Action
  for (const r of s.rows) {
    const [num, issue, severity, impact, status, fix] = r;
    if (!issue || isPlaceholder(issue)) { bump("known-issues", "skipped"); continue; }
    const n = String(num || "").padStart(3, "0");
    await insertEntry("known-issues", `issue-${n || slugify(issue).slice(0, 40)}`, {
      issue,
      severity: severity || "",
      impact: impact || "",
      status: status || "",
      pair_ai_fix: fix || "",
    });
  }
}

async function importDataGaps(s: Sheet) {
  if (!s) return;
  // # | Data Gap | Category | Priority | Owner | Status
  for (const r of s.rows) {
    const [num, gap, category, priority, owner, status] = r;
    if (!gap || isPlaceholder(gap)) { bump("data-gaps", "skipped"); continue; }
    const n = String(num || "").padStart(3, "0");
    await insertEntry("data-gaps", `gap-${n || slugify(gap).slice(0, 40)}`, {
      data_gap: gap,
      category: category || "",
      priority: priority || "",
      owner: owner || "",
      status: status || "",
    });
  }
}

async function importPromotionsMaster(s: Sheet) {
  if (!s) return;
  // Promo_Type | Promo_Status | Promotion_Tier | Customer_Eligibility_Type | Strategic_Objective |
  // Customer_Journey_Stage | Product_Scope | Product_Exclusions | Branch_List | Recurring_Type |
  // Days | AI_Trigger | AI_Priority | Push Online Sales on FK Platforms (Y/N)
  let idx = 0;
  for (const r of s.rows) {
    idx++;
    const [promoType, promoStatus, tier, eligibility, strategic, journey, scope, exclusions, branches, recurring, days, aiTrigger, aiPriority, pushOnline] = r;
    if (!promoType || isPlaceholder(promoType)) { bump("promotions-master", "skipped"); continue; }
    await insertEntry("promotions-master", `pm-${slugify(promoType)}-${idx}`, {
      promo_type: promoType,
      promo_status: promoStatus || "",
      promotion_tier: tier || "",
      customer_eligibility_type: eligibility || "",
      strategic_objective: strategic || "",
      customer_journey_stage: journey || "",
      product_scope: scope || "",
      product_exclusions: exclusions || "",
      branch_list: branches || "",
      recurring_type: recurring || "",
      days: days || "",
      ai_trigger: aiTrigger || "",
      ai_priority: aiPriority || "",
      push_online: pushOnline || "",
    });
  }
}

async function importEnums(s: Sheet) {
  if (!s) return;
  // List_Name | Value | Aux_1-Category | Aux_2-Priority | Aux_3-Severity
  for (const r of s.rows) {
    const [list, value, aux1, aux2, aux3] = r;
    if (!list || !value || isPlaceholder(list) || isPlaceholder(value)) { bump("enums", "skipped"); continue; }
    await insertEntry("enums", `enum-${slugify(list)}-${slugify(value).slice(0, 60)}`, {
      list_name: list,
      value,
      aux_1: aux1 || "",
      aux_2: aux2 || "",
      aux_3: aux3 || "",
    });
  }
}

async function importBotFlows(stepsSheet: Sheet, buttonsSheet: Sheet) {
  // Steps: Step # | Trigger / Condition | Bot Action | Data Required (for Devs) | Escalation?
  if (stepsSheet) {
    for (const r of stepsSheet.rows) {
      const [step, trigger, action, dataReq, esc] = r;
      if (!step || !action) { bump("bot-flows", "skipped"); continue; }
      await insertEntry("bot-flows", `step-${slugify(step)}`, {
        kind: "step",
        step_number: step,
        trigger,
        action,
        data_required: dataReq || "",
        context: "",
        escalation: esc || "",
      });
    }
  }
  // Buttons: Button Label | Action / Next Step | Context
  if (buttonsSheet) {
    for (const r of buttonsSheet.rows) {
      const [label, action, context] = r;
      if (!label || !action) { bump("bot-flows", "skipped"); continue; }
      await insertEntry("bot-flows", `button-${slugify(label)}`, {
        kind: "button",
        step_number: "",
        trigger: label,
        action,
        data_required: "",
        context: context || "",
        escalation: "",
      });
    }
  }
}

async function importUpdateRouting(s: Sheet) {
  if (!s) return;
  // Raw_Update_Type | AI_Category | Default_Template_ID | Owner_Function | Needs_Priority | Needs_Operational_Type | Default_Priority_Tier
  for (const r of s.rows) {
    const [rawType, aiCategory, tplId, ownerFn, needsPriority, needsOpType, defaultTier] = r;
    if (!rawType || isPlaceholder(rawType)) { bump("update-routing", "skipped"); continue; }
    await insertEntry("update-routing", `ur-${slugify(rawType).slice(0, 60)}`, {
      raw_update_type: rawType,
      ai_category: aiCategory || "",
      default_template_id: tplId || "",
      owner_function: ownerFn || "",
      needs_priority: needsPriority || "",
      needs_operational_type: needsOpType || "",
      default_priority_tier: defaultTier || "",
    });
  }
}

async function importPriorityTiers(s: Sheet) {
  if (!s) return;
  // Priority_Tier | Priority_Label | Recommended_Use
  for (const r of s.rows) {
    const [tier, label, use] = r;
    if (tier === "" || tier === undefined || !label) { bump("priority-tiers", "skipped"); continue; }
    await insertEntry("priority-tiers", `tier-${slugify(String(tier))}-${slugify(label).slice(0, 40)}`, {
      priority_tier: String(tier),
      priority_label: label,
      recommended_use: use || "",
    });
  }
}

async function importBranchGroups(s: Sheet) {
  if (!s) return;
  // Branch_Name | Branch_Group
  for (const r of s.rows) {
    const [name, group] = r;
    if (!name || !group) { bump("branch-groups", "skipped"); continue; }
    await insertEntry("branch-groups", `bg-${slugify(name).slice(0, 60)}`, {
      branch_name: name,
      branch_group: group,
    });
  }
}

// ---------- main ----------
async function main() {
  await login();

  await installMarketplace([
    "branches",
    "promotions",
    "faqs",
    "escalation_rules",
    "response_templates",
    "partners",
    "policy_matrix",
  ]);

  // Custom modules (labels required by schema)
  await createCustomModule({
    slug: "intents",
    label: "Instructions",
    icon: "target",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, localized: false },
      { key: "description", label: "Intent", type: "textarea", required: false, localized: false },
      { key: "ai_instructions", label: "AI Instructions", type: "textarea", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "booking-flows",
    label: "Booking Flows",
    icon: "git-branch",
    fields: [
      { key: "flow_id", label: "Flow ID", type: "text", required: true, localized: false },
      { key: "trigger", label: "Trigger", type: "text", required: true, localized: false },
      { key: "questions", label: "Questions", type: "textarea", required: false, localized: false },
      { key: "booking_link", label: "Booking Link", type: "url", required: false, localized: false },
      { key: "upsell", label: "Upsell", type: "text", required: false, localized: false },
      { key: "branch_limit", label: "Branch Limit", type: "text", required: false, localized: false },
      { key: "status", label: "Status", type: "text", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "documents",
    label: "Documents",
    icon: "file",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, localized: false },
      { key: "description", label: "Description", type: "textarea", required: false, localized: true },
      { key: "source_url", label: "Source URL", type: "url", required: true, localized: false },
      { key: "mime_type", label: "MIME Type", type: "text", required: false, localized: false },
      { key: "kind", label: "Kind", type: "select", required: true, localized: false, options: ["pdf", "image", "doc", "other"] },
    ],
  });

  // --- New custom modules for extended sheet sections ---

  await createCustomModule({
    slug: "change-requests",
    label: "Change Requests",
    icon: "git-pull-request",
    fields: [
      { key: "change_type", label: "Change Type", type: "text", required: true, localized: false },
      { key: "status", label: "Status", type: "text", required: false, localized: false },
      { key: "yes_no", label: "Yes/No", type: "text", required: false, localized: false },
      { key: "category", label: "Category", type: "text", required: false, localized: false },
      { key: "tone_level", label: "Tone Level", type: "text", required: false, localized: false },
      { key: "probability", label: "Probability", type: "text", required: false, localized: false },
      { key: "impact", label: "Impact", type: "text", required: false, localized: false },
      { key: "branches", label: "Branches", type: "text", required: false, localized: false },
      { key: "audience", label: "Audience", type: "text", required: false, localized: false },
      { key: "offer_category", label: "Offer Category", type: "text", required: false, localized: false },
      { key: "direct_priority", label: "Direct Priority", type: "text", required: false, localized: false },
      { key: "visibility_type", label: "Visibility Type", type: "text", required: false, localized: false },
      { key: "ai_pivot_strategy", label: "AI Pivot Strategy", type: "text", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "priority-matrix",
    label: "Priority Matrix",
    icon: "bar-chart",
    fields: [
      { key: "priority_number", label: "Priority Number", type: "text", required: true, localized: false },
      { key: "category", label: "Category", type: "text", required: true, localized: false },
      { key: "why", label: "Why", type: "textarea", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "risks",
    label: "Risks",
    icon: "shield",
    fields: [
      { key: "scenario", label: "Scenario", type: "text", required: true, localized: false },
      { key: "probability", label: "Probability", type: "text", required: false, localized: false },
      { key: "impact", label: "Impact", type: "text", required: false, localized: false },
      { key: "mitigation", label: "Mitigation", type: "textarea", required: false, localized: false },
      { key: "owner", label: "Owner", type: "text", required: false, localized: false },
      { key: "last_reviewed", label: "Last Reviewed", type: "text", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "announcements",
    label: "Announcements",
    icon: "megaphone",
    fields: [
      { key: "date", label: "Date", type: "text", required: false, localized: false },
      { key: "title", label: "Title", type: "text", required: true, localized: false },
      { key: "category", label: "Category", type: "text", required: false, localized: false },
      { key: "audience", label: "Audience", type: "text", required: false, localized: false },
      { key: "action_required", label: "Action Required", type: "textarea", required: false, localized: false },
      { key: "owner", label: "Owner", type: "text", required: false, localized: false },
      { key: "deadline", label: "Deadline", type: "text", required: false, localized: false },
      { key: "status", label: "Status", type: "text", required: false, localized: false },
      { key: "notes", label: "Notes", type: "textarea", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "known-issues",
    label: "Known Issues",
    icon: "bug",
    fields: [
      { key: "issue", label: "Issue", type: "textarea", required: true, localized: false },
      { key: "severity", label: "Severity", type: "text", required: false, localized: false },
      { key: "impact", label: "Impact", type: "textarea", required: false, localized: false },
      { key: "status", label: "Status", type: "text", required: false, localized: false },
      { key: "pair_ai_fix", label: "PAIR AI Fix", type: "textarea", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "data-gaps",
    label: "Data Gaps",
    icon: "alert-circle",
    fields: [
      { key: "data_gap", label: "Data Gap", type: "text", required: true, localized: false },
      { key: "category", label: "Category", type: "text", required: false, localized: false },
      { key: "priority", label: "Priority", type: "text", required: false, localized: false },
      { key: "owner", label: "Owner", type: "text", required: false, localized: false },
      { key: "status", label: "Status", type: "text", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "promotions-master",
    label: "Promotions Master",
    icon: "sparkles",
    fields: [
      { key: "promo_type", label: "Promo Type", type: "text", required: true, localized: false },
      { key: "promo_status", label: "Promo Status", type: "text", required: false, localized: false },
      { key: "promotion_tier", label: "Promotion Tier", type: "text", required: false, localized: false },
      { key: "customer_eligibility_type", label: "Eligibility Type", type: "text", required: false, localized: false },
      { key: "strategic_objective", label: "Strategic Objective", type: "text", required: false, localized: false },
      { key: "customer_journey_stage", label: "Journey Stage", type: "text", required: false, localized: false },
      { key: "product_scope", label: "Product Scope", type: "text", required: false, localized: false },
      { key: "product_exclusions", label: "Product Exclusions", type: "text", required: false, localized: false },
      { key: "branch_list", label: "Branch List", type: "text", required: false, localized: false },
      { key: "recurring_type", label: "Recurring Type", type: "text", required: false, localized: false },
      { key: "days", label: "Days", type: "text", required: false, localized: false },
      { key: "ai_trigger", label: "AI Trigger", type: "text", required: false, localized: false },
      { key: "ai_priority", label: "AI Priority", type: "text", required: false, localized: false },
      { key: "push_online", label: "Push Online", type: "text", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "enums",
    label: "Enums",
    icon: "list",
    fields: [
      { key: "list_name", label: "List Name", type: "text", required: true, localized: false },
      { key: "value", label: "Value", type: "text", required: true, localized: false },
      { key: "aux_1", label: "Aux 1 (Category)", type: "text", required: false, localized: false },
      { key: "aux_2", label: "Aux 2 (Priority)", type: "text", required: false, localized: false },
      { key: "aux_3", label: "Aux 3 (Severity)", type: "text", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "bot-flows",
    label: "Bot Flows",
    icon: "message-circle",
    fields: [
      { key: "kind", label: "Kind", type: "select", required: true, localized: false, options: ["step", "button"] },
      { key: "step_number", label: "Step #", type: "text", required: false, localized: false },
      { key: "trigger", label: "Trigger / Label", type: "text", required: true, localized: false },
      { key: "action", label: "Action", type: "textarea", required: true, localized: false },
      { key: "data_required", label: "Data Required", type: "textarea", required: false, localized: false },
      { key: "context", label: "Context", type: "text", required: false, localized: false },
      { key: "escalation", label: "Escalation", type: "text", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "update-routing",
    label: "Update Routing",
    icon: "route",
    fields: [
      { key: "raw_update_type", label: "Raw Update Type", type: "text", required: true, localized: false },
      { key: "ai_category", label: "AI Category", type: "text", required: false, localized: false },
      { key: "default_template_id", label: "Default Template", type: "text", required: false, localized: false },
      { key: "owner_function", label: "Owner Function", type: "text", required: false, localized: false },
      { key: "needs_priority", label: "Needs Priority", type: "text", required: false, localized: false },
      { key: "needs_operational_type", label: "Needs Op Type", type: "text", required: false, localized: false },
      { key: "default_priority_tier", label: "Default Priority Tier", type: "text", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "priority-tiers",
    label: "Priority Tiers",
    icon: "layers",
    fields: [
      { key: "priority_tier", label: "Priority Tier", type: "text", required: true, localized: false },
      { key: "priority_label", label: "Priority Label", type: "text", required: true, localized: false },
      { key: "recommended_use", label: "Recommended Use", type: "textarea", required: false, localized: false },
    ],
  });

  await createCustomModule({
    slug: "branch-groups",
    label: "Branch Groups",
    icon: "users",
    fields: [
      { key: "branch_name", label: "Branch Name", type: "text", required: true, localized: false },
      { key: "branch_group", label: "Branch Group", type: "text", required: true, localized: false },
    ],
  });

  // Pre-load existing entries so we can skip dups without relying on 500 heuristics.
  const allModules = [
    "branches", "faqs", "response_templates", "escalation_rules", "policy_matrix",
    "partners", "promotions", "intents", "booking-flows", "documents",
    "change-requests", "priority-matrix", "risks", "announcements", "known-issues",
    "data-gaps", "promotions-master", "enums", "bot-flows", "update-routing",
    "priority-tiers", "branch-groups",
  ];
  for (const m of allModules) {
    await preloadExisting(m);
    console.log(`[preload] ${m}: ${existingExt[m].size} existing externalIds`);
  }

  // Parse sheets
  const sheets = loadSheets();
  const ramadanMap = buildRamadanMap(sheets.branches_ramadan);

  await importBranches(sheets.branches_regular, ramadanMap);
  await patchRamadanHours(ramadanMap);
  await importFaqs(sheets.faqs);
  await importResponseTemplates(sheets.response_templates);
  await importEscalation(sheets.escalation);
  await importPolicyMatrix(sheets.policy_matrix);
  await importPartners();
  await importApprovedPromotions(sheets.approval_gate);
  await importIntents(sheets.intents);
  await importBookingFlows(sheets.booking_flows);
  await importDocuments();

  // --- New imports ---
  await importChangeRequests(sheets.change_requests);
  await importPriorityMatrix(sheets.priority_matrix);
  await importRisks(sheets.risks);
  await importAnnouncements(sheets.announcements);
  await importKnownIssues(sheets.known_issues);
  await importDataGaps(sheets.data_gaps);
  await importPromotionsMaster(sheets.promotions_master);
  await importEnums(sheets.enums);
  await importBotFlows(sheets.bot_flow_steps, sheets.bot_buttons);
  await importUpdateRouting(sheets.update_routing);
  await importPriorityTiers(sheets.priority_tiers);
  await importBranchGroups(sheets.branch_groups);

  console.log("\n========== SUMMARY ==========");
  for (const m of allModules) {
    const c = stats[m] ?? { imported: 0, skipped: 0, errored: 0 };
    console.log(`${m.padEnd(22)} imported=${c.imported}  skipped=${c.skipped}  errored=${c.errored}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
