/**
 * Build the /Users/mac/Documents/The Brain/knowledge/ file mirror of the
 * PAIR × FutureKid master sheet, a parallel to the live API ingest so the
 * knowledge is also auditable as organized markdown files on disk.
 *
 * Input:  /tmp/fk-drive/master-sheet.json  ({ fileContent: string })
 * Output: /Users/mac/Documents/The Brain/knowledge/{README.md, source/, sections/}
 *
 * Run:
 *   node --experimental-strip-types --no-warnings scripts/build-knowledge-mirror.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE_FILE = process.env.SOURCE_FILE ?? "/tmp/fk-drive/master-sheet.json";
const ROOT = "/Users/mac/Documents/The Brain/knowledge";
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1t4vDkp2iUX45E-CQDofPCIZKXxwHLWzEdJ81eFbOgsw/edit";

function write(path: string, body: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, "utf8");
}

function isSeparator(line: string): boolean {
  if (!line.startsWith("|")) return false;
  return /^[|:\-\s]+$/.test(line) && /[-:]{3,}|:-:/.test(line);
}

type Section = { slug: string; title: string; matcher: RegExp | ((h: string) => boolean); notes?: string };

// Section catalog, in the order they appear in the sheet.
const SECTIONS: Section[] = [
  { slug: "01-policy-matrix",     title: "Policy & Rules Matrix",         matcher: /\|\s*Policy Area\s*\|/ },
  { slug: "02-branches",          title: "Branch Operating Hours",        matcher: /Branch \(Arabic\)/, notes: "15 branches with SUN–SAT hours + Google Maps pins. 2 are CLOSED." },
  { slug: "03-branches-ramadan",  title: "Branch Ramadan / Special Hours",matcher: (h) => /\|\s*Branch\s*\|\s*Governorate\s*\|\s*SUN\s*\|/.test(h) },
  { slug: "04-escalation",        title: "Escalation Triggers & SLA",     matcher: (h) => /Trigger Type/.test(h) && /To Whom/.test(h) },
  { slug: "05-faqs",              title: "FAQ Database (EN + AR)",        matcher: (h) => /Question \(EN\)/.test(h) && /Answer \(EN\)/.test(h) },
  { slug: "06-response-templates",title: "Response Templates",            matcher: (h) => /Template ID/.test(h) && /Script \(EN\)/.test(h) },
  { slug: "07-intents",           title: "Intents",                       matcher: (h) => /Intent ID/.test(h) && /Intent Name/.test(h) },
  { slug: "08-bot-flow",          title: "Ramadan Top-Up Bot Flow",       matcher: (h) => /Step/.test(h) && /Bot Action/.test(h) },
  { slug: "09-bot-buttons",       title: "Bot Button Actions",            matcher: (h) => /Button Label/.test(h) && /Action/.test(h) && /Context/.test(h) },
  { slug: "10-booking-flows",     title: "Booking Flows",                 matcher: (h) => /Flow ID/.test(h) && /Booking Link/.test(h) },
  { slug: "11-enums",             title: "Enumeration Picklists",         matcher: (h) => /List[\\_]*Name/.test(h) && /Aux[\\_]*1/.test(h) },
  { slug: "12-priority-matrix",   title: "Priority Matrix",               matcher: /Priority Info Only/ },
  { slug: "13-risks",             title: "Risk Assessment",               matcher: (h) => /Risk Scenario/.test(h) && /Mitigation/.test(h) },
  { slug: "14-announcements",     title: "Announcements / Active Alerts", matcher: (h) => /\|\s*Date\s*\|/.test(h) && /Action Required/.test(h) && /Deadline/.test(h) },
  { slug: "15-known-issues",      title: "Known Issues & Bugs",           matcher: (h) => /\|\s*Issue\s*\|/.test(h) && /PAIR AI Fix/.test(h) },
  { slug: "16-data-gaps",         title: "Data Gaps & Action Items",      matcher: (h) => /Data Gap/.test(h) && /Priority/.test(h) },
  { slug: "17-promotions-master", title: "Promotions Master (Rules)",     matcher: (h) => /Promo[\\_]*Type/.test(h) && /Push Online/.test(h) },
  { slug: "18-active-promotions", title: "Active Promotions (FK-001…)",   matcher: (h) => /^\|\s*AI[\\_]*Record[\\_]*ID\s*\|/.test(h) && /Review[\\_]*Status/.test(h) },
  { slug: "19-change-requests",   title: "Change Control Matrix",         matcher: (h) => /Change Type/.test(h) && /AI[\\_]*Pivot[\\_]*Strategy/.test(h) },
  { slug: "20-update-routing",    title: "Form Update Routing",           matcher: (h) => /Raw[\\_]*Update[\\_]*Type/.test(h) && /AI[\\_]*Category/.test(h) },
  { slug: "21-priority-tiers",    title: "Priority Tiers",                matcher: (h) => /Priority[\\_]*Tier/.test(h) && /Priority[\\_]*Label/.test(h) },
  { slug: "22-branch-groups",     title: "Branch Groups",                 matcher: (h) => /Branch[\\_]*Name/.test(h) && /Branch[\\_]*Group/.test(h) },
];

function sliceSection(lines: string[], start: number): string[] {
  // include header + separator + data rows until a blank line (or end).
  const out: string[] = [lines[start], lines[start + 1]];
  for (let i = start + 2; i < lines.length; i++) {
    const L = lines[i];
    if (!L.trim()) break;
    if (!L.startsWith("|")) break;
    if (isSeparator(L)) break;
    out.push(L);
  }
  return out;
}

function findHeaderLine(lines: string[], matcher: Section["matcher"]): number {
  const pred = typeof matcher === "function" ? matcher : (h: string) => (matcher as RegExp).test(h);
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith("|") && isSeparator(lines[i + 1] ?? "") && pred(lines[i])) {
      return i;
    }
  }
  return -1;
}

function main() {
  const raw = readFileSync(SOURCE_FILE, "utf8");
  const payload = JSON.parse(raw) as { fileContent: string };
  const md = payload.fileContent;
  const lines = md.split("\n");

  // 1. Write the raw source
  write(`${ROOT}/source/master-sheet.md`, md);

  // 2. Per-section files
  const hits: { slug: string; title: string; rows: number; line: number }[] = [];
  for (const s of SECTIONS) {
    const idx = findHeaderLine(lines, s.matcher);
    if (idx < 0) {
      console.warn(`[section] ${s.slug} NOT FOUND`);
      continue;
    }
    const block = sliceSection(lines, idx);
    const rowCount = Math.max(0, block.length - 2);
    const body = [
      `# ${s.title}`,
      ``,
      `> **Source:** [PAIR × FutureKid Master Sheet](${SHEET_URL})`,
      `> **Section:** ${s.title}`,
      `> **Rows:** ${rowCount}`,
      s.notes ? `> **Notes:** ${s.notes}` : undefined,
      ``,
      ...block,
      ``,
    ].filter((v) => v !== undefined).join("\n");
    write(`${ROOT}/sections/${s.slug}.md`, body);
    hits.push({ slug: s.slug, title: s.title, rows: rowCount, line: idx + 1 });
  }

  // 3. Governance prose (non-table sections)
  //    Capture everything between "WHAT IS STATIC" and the next markdown table header.
  const govStart = lines.findIndex((L) => /WHAT IS STATIC/i.test(L));
  const govEnd = (() => {
    if (govStart < 0) return -1;
    for (let i = govStart + 1; i < lines.length - 1; i++) {
      if (lines[i].startsWith("|") && isSeparator(lines[i + 1] ?? "") && /Change Type/.test(lines[i])) return i;
    }
    return -1;
  })();
  if (govStart >= 0 && govEnd > govStart) {
    const proseBlock = lines.slice(govStart, govEnd).join("\n");
    const body = [
      `# Governance Rules (Static / Dynamic / Visibility)`,
      ``,
      `> **Source:** [PAIR × FutureKid Master Sheet](${SHEET_URL})`,
      `> **Section:** Governance prose covering static vs. dynamic knowledge, visibility rules, and FK manager workflow.`,
      ``,
      proseBlock,
      ``,
    ].join("\n");
    write(`${ROOT}/sections/00-governance-rules.md`, body);
    hits.unshift({ slug: "00-governance-rules", title: "Governance Rules", rows: 0, line: govStart + 1 });
  }

  // 4. Empty / template sections stub
  const emptyBody = [
    `# Empty Template Sections`,
    ``,
    `These sections exist in the master sheet as schemas/templates but contain no populated rows yet.`,
    `They're listed here for completeness; see the Google Sheet directly for the schema.`,
    ``,
    `- Change Log (Date | Change Type | Description | Requested By | Approved By | Implemented By | Status | Notes)`,
    `- Weekly Analytics Dashboard (Week | Total Chats | Escalation % | Promo Inquiries | Booking Conversions | Refund Mentions | CSAT)`,
    `- Knowledge Gap / FAQ Refinement Tracker (Question | Frequency | Correct Answer | Needs Clarification? | Action Required?)`,
    `- API / System Integration Skeleton (System | Data Pulled | Data Pushed | API Owner | Failure Response)`,
    ``,
  ].join("\n");
  write(`${ROOT}/sections/99-empty-templates.md`, emptyBody);
  hits.push({ slug: "99-empty-templates", title: "Empty Template Sections", rows: 0, line: 0 });

  // 5. README index
  const indexRows = hits
    .map((h) => `| \`${h.slug}.md\` | ${h.title} | ${h.rows} | L${h.line} |`)
    .join("\n");
  const readme = [
    `# The Brain: Knowledge Mirror`,
    ``,
    `Parallel **on-disk mirror** of the PAIR × FutureKid knowledge base that is live-ingested into The Brain (Prisma/Postgres via \`the-brain/apps/api\`).`,
    ``,
    `- **Source:** [Google Sheet: PAIR_AI_x_FutureKid_MASTER_Knowledge Base](${SHEET_URL})`,
    `- **Generator:** \`the-brain/scripts/build-knowledge-mirror.ts\``,
    `- **Last synced:** ${new Date().toISOString()}`,
    `- **Sheet snapshot:** \`source/master-sheet.md\` (full natural-language export)`,
    ``,
    `## Sections`,
    ``,
    `| File | Title | Rows | Sheet line |`,
    `|---|---|---:|---:|`,
    indexRows,
    ``,
    `## How to refresh`,
    ``,
    `1. Re-export the sheet (via the \`read_file_content\` tool) to \`/tmp/fk-drive/master-sheet.json\`.`,
    `2. \`cd the-brain && node --experimental-strip-types --no-warnings scripts/import-fk-drive.ts\` to ingest into the API (idempotent, skips existing).`,
    `3. \`node --experimental-strip-types --no-warnings scripts/build-knowledge-mirror.ts\` to regenerate this directory tree.`,
    ``,
    `## Conventions`,
    ``,
    `- Every section file is a **standalone markdown document** starting with a title + source block, followed by the raw markdown-table export.`,
    `- Sections are named \`NN-slug.md\` where \`NN\` matches the section's position in the original sheet.`,
    `- Files are **overwritten** on every sync. Do not hand-edit; edit the source Google Sheet instead.`,
    ``,
  ].join("\n");
  write(`${ROOT}/README.md`, readme);

  console.log(`\n[mirror] wrote ${hits.length} sections + README at ${ROOT}`);
}

main();
