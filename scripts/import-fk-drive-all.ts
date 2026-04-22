/**
 * Bulk-import every file in the Future Kid Google Drive subtree + top-level
 * as a `documents` entry in The Brain. Idempotent via externalId = drive-<id>.
 *
 * Run:
 *   cd /Users/mac/Documents/The\ Brain/the-brain && \
 *   export $(grep -v '^#' .env | xargs) && \
 *   node --import tsx scripts/import-fk-drive-all.ts
 */

import { readFileSync } from "node:fs";

const API_BASE = process.env.API_BASE ?? "http://localhost:3100/api/v1";
const TENANT_SLUG = "future-kid";
const EMAIL = "admin@pairai.com";
const PASSWORD = "password1";

const SUBTREE = "/tmp/fk-drive/files-subtree.json";
const TOP_LEVEL = "/tmp/fk-drive/top-level.json";

type DriveFile = {
  id: string;
  title: string;
  mimeType: string;
  viewUrl?: string;
};

type Counts = { imported: number; skipped: number; errored: number };
const byKind: Record<string, Counts> = {
  pdf: { imported: 0, skipped: 0, errored: 0 },
  image: { imported: 0, skipped: 0, errored: 0 },
  doc: { imported: 0, skipped: 0, errored: 0 },
  other: { imported: 0, skipped: 0, errored: 0 },
};
function bump(kind: string, k: keyof Counts) {
  byKind[kind] ??= { imported: 0, skipped: 0, errored: 0 };
  byKind[kind][k]++;
}

let TOKEN = "";
async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function login(): Promise<void> {
  const r = await api("POST", "/auth/login", {
    tenantSlug: TENANT_SLUG,
    email: EMAIL,
    password: PASSWORD,
  });
  if (!r.ok) throw new Error(`Login failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { data: { token: string } };
  TOKEN = j.data.token;
  console.log(`[auth] logged in as ${EMAIL}`);
}

async function preloadExisting(): Promise<Set<string>> {
  const out = new Set<string>();
  const r = await api("GET", `/entries/documents?limit=1000`);
  if (!r.ok) {
    console.warn(`[preload] documents list failed: ${r.status}`);
    return out;
  }
  const j = (await r.json()) as { data?: Array<{ externalId?: string | null }> };
  for (const e of j.data ?? []) if (e.externalId) out.add(e.externalId);
  console.log(`[preload] ${out.size} existing document externalIds`);
  return out;
}

/** Strip Notion-export hash tokens and file extension from a title. */
function cleanTitle(raw: string): string {
  let t = raw;
  // drop extension
  t = t.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  // drop trailing 32-hex Notion id (possibly separated by space/underscore/dash)
  t = t.replace(/[\s_-]+[0-9a-f]{24,}$/i, "");
  // drop any remaining stray long hex runs at end
  t = t.replace(/[\s_-]+[0-9a-f]{16,}$/i, "");
  t = t.replace(/_/g, " ").trim();
  return t || raw;
}

function deriveKind(mime: string, title: string): "pdf" | "image" | "doc" | "other" {
  const m = (mime || "").toLowerCase();
  const t = (title || "").toLowerCase();
  if (m.includes("pdf") || t.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/")) return "image";
  if (
    m.includes("markdown") ||
    m.includes("msword") ||
    m.includes("wordprocessingml") ||
    t.endsWith(".md") ||
    t.endsWith(".doc") ||
    t.endsWith(".docx")
  )
    return "doc";
  return "other";
}

function loadAll(): DriveFile[] {
  const a = JSON.parse(readFileSync(SUBTREE, "utf8")) as DriveFile[];
  const b = JSON.parse(readFileSync(TOP_LEVEL, "utf8")) as DriveFile[];
  const seen = new Set<string>();
  const merged: DriveFile[] = [];
  for (const f of [...a, ...b]) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    merged.push(f);
  }
  return merged;
}

async function insertDoc(
  f: DriveFile,
  existing: Set<string>,
  descriptionFallback: string | null,
  forceOtherKind: boolean,
): Promise<void> {
  const externalId = `drive-${f.id}`;
  const kind = forceOtherKind ? "other" : deriveKind(f.mimeType, f.title);
  if (existing.has(externalId)) {
    bump(kind, "skipped");
    return;
  }
  const title = cleanTitle(f.title);
  const source_url =
    f.viewUrl && /^https?:/.test(f.viewUrl)
      ? f.viewUrl
      : `https://drive.google.com/file/d/${f.id}/view`;

  const data: Record<string, unknown> = {
    title,
    source_url,
    mime_type: f.mimeType || "application/octet-stream",
    kind,
  };
  if (descriptionFallback) {
    data.description_en = descriptionFallback;
  }

  const r = await api("POST", "/entries/documents", { data, externalId });
  if (r.ok) {
    bump(kind, "imported");
    existing.add(externalId);
    return;
  }
  const txt = await r.text();
  // Already-exists signals
  if (
    r.status === 409 ||
    (/duplicate|unique|already exists/i.test(txt) && /external/i.test(txt))
  ) {
    bump(kind, "skipped");
    existing.add(externalId);
    return;
  }
  // 500 w/ unique-constraint -> treat as skipped
  if (r.status === 500 && /unique|duplicate|P2002/i.test(txt)) {
    bump(kind, "skipped");
    existing.add(externalId);
    return;
  }
  // Zod validation error mentioning description -> retry with fallback
  if (
    r.status === 400 &&
    /description/i.test(txt) &&
    !descriptionFallback
  ) {
    return insertDoc(f, existing, "Imported from Google Drive", forceOtherKind);
  }
  // kind enum rejected -> retry forcing 'other'
  if (r.status === 400 && /kind/i.test(txt) && !forceOtherKind) {
    return insertDoc(f, existing, descriptionFallback, true);
  }
  bump(kind, "errored");
  console.warn(`[doc] ${externalId} (${title}) -> ${r.status}: ${txt.slice(0, 240)}`);
}

async function main() {
  await login();
  const existing = await preloadExisting();

  const files = loadAll();
  console.log(`[input] ${files.length} total drive files to process`);

  let n = 0;
  for (const f of files) {
    n++;
    await insertDoc(f, existing, null, false);
    if (n % 25 === 0) {
      console.log(
        `[progress] ${n}/${files.length} | pdf=${byKind.pdf.imported}+${byKind.pdf.skipped} image=${byKind.image.imported}+${byKind.image.skipped} doc=${byKind.doc.imported}+${byKind.doc.skipped} other=${byKind.other.imported}+${byKind.other.skipped}`,
      );
    }
  }

  console.log("\n========== DOCUMENTS IMPORT SUMMARY ==========");
  let ti = 0,
    ts = 0,
    te = 0;
  for (const kind of ["pdf", "image", "doc", "other"]) {
    const c = byKind[kind];
    ti += c.imported;
    ts += c.skipped;
    te += c.errored;
    console.log(
      `${kind.padEnd(8)} imported=${c.imported}  skipped=${c.skipped}  errored=${c.errored}`,
    );
  }
  console.log(`${"TOTAL".padEnd(8)} imported=${ti}  skipped=${ts}  errored=${te}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
