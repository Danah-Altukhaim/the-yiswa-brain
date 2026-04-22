const API = (process.env.BRAIN_API ?? "http://127.0.0.1:3100").replace(/\/$/, "") + "/api/v1";
const EMAIL = "admin@pairai.com";
const PASSWORD = "password1";
const TENANT = "future-kid";

const TARGET_DRIVE_IDS = [
  "1hwBgJwTYc4hgRpZxwIFkPxx9lOowRElO",
  "1V8eU2k2kLOs91u3ExOjEaNfNq4nnq6Fb",
  "1dx74bSdeWltIC-SmAoUKB5c41ydq2eSh",
];

async function login(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, tenantSlug: TENANT }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const j = await res.json() as any;
  return j.data?.token ?? j.token ?? j.accessToken ?? j.access_token;
}

async function listAllDocs(token: string): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  const limit = 200;
  for (;;) {
    const res = await fetch(`${API}/entries/documents?limit=${limit}&offset=${offset}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
    const j = await res.json() as any;
    const items = j.items ?? j.data ?? j.results ?? j;
    const arr = Array.isArray(items) ? items : [];
    out.push(...arr);
    if (arr.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  const token = await login();
  console.log("logged in");

  const docs = await listAllDocs(token);
  console.log(`total docs before: ${docs.length}`);

  const toDelete = docs.filter((d) => {
    const ext = d.externalId ?? d.external_id ?? "";
    const url = d.data?.source_url ?? d.data?.sourceUrl ?? "";
    if (!ext.startsWith("doc-")) return false;
    return TARGET_DRIVE_IDS.some((id) => url.includes(id));
  });

  console.log(`candidates to delete: ${toDelete.length}`);
  let deleted = 0;
  for (const d of toDelete) {
    const res = await fetch(`${API}/entries/documents/${d.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      deleted++;
      console.log(`deleted ${d.id} ${d.externalId}`);
    } else {
      console.error(`delete failed ${d.id}: ${res.status} ${await res.text()}`);
    }
  }

  const sheetExt = "drive-1t4vDkp2iUX45E-CQDofPCIZKXxwHLWzEdJ81eFbOgsw";
  const existing = docs.find((d) => (d.externalId ?? d.external_id) === sheetExt);
  let inserted = false;
  if (!existing) {
    const body = {
      externalId: sheetExt,
      data: {
        title: "PAIR_AI_x_FutureKid_MASTER_Knowledge Base",
        description_en:
          "Imported from Google Drive (source spreadsheet parsed into faqs, branches, promotions, policy_matrix, escalation_rules, response_templates, partners, intents, booking-flows)",
        source_url:
          "https://docs.google.com/spreadsheets/d/1t4vDkp2iUX45E-CQDofPCIZKXxwHLWzEdJ81eFbOgsw/edit",
        mime_type: "application/vnd.google-apps.spreadsheet",
        kind: "doc",
      },
    };
    const res = await fetch(`${API}/entries/documents`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      inserted = true;
      console.log("sheet entry inserted");
    } else {
      console.error(`insert failed: ${res.status} ${await res.text()}`);
    }
  } else {
    console.log("sheet entry already present");
  }

  const after = await listAllDocs(token);
  console.log(`FINAL deleted=${deleted} inserted=${inserted} total=${after.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
