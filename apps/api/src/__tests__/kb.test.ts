/**
 * Public KB route integration test. Exercises the bot-facing API surface.
 *
 * Covers:
 *  - missing or malformed auth header returns 401
 *  - unknown key returns 401
 *  - revoked key returns 401
 *  - key without read:kb scope is rejected (403)
 *  - /knowledge-base returns grouped modules for the key's tenant
 *  - /modules/:slug/entries returns that module's entries only
 *  - /search rejects empty q
 *  - /kb-health returns a version and fallback flag
 *  - analytics event write requires write:analytics or read:kb
 *
 * Seed dependency: `pnpm seed` must have run; uses `future-kid` tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../server.js";

const TENANT_SLUG = "future-kid";

type MintedKey = { raw: string; id: string };

async function mintKey(
  admin: PrismaClient,
  tenantId: string,
  scopes: string[],
  opts: { revoked?: boolean } = {},
): Promise<MintedKey> {
  const raw = `tb_live_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const row = await admin.apiKey.create({
    data: {
      tenantId,
      keyHash: hash,
      keyPrefix: raw.slice(0, 12),
      label: `test-${scopes.join("+")}`,
      scopes,
      revokedAt: opts.revoked ? new Date() : null,
    },
  });
  return { raw, id: row.id };
}

describe("public KB API", () => {
  let app: FastifyInstance;
  const admin = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL! },
    },
  });
  let tenantId: string;
  let readKey: MintedKey;
  let writeKey: MintedKey;
  let noScopeKey: MintedKey;
  let revokedKey: MintedKey;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const tenant = await admin.tenant.findUnique({ where: { slug: TENANT_SLUG } });
    if (!tenant) throw new Error("seed the future-kid tenant first (pnpm seed)");
    tenantId = tenant.id;

    readKey = await mintKey(admin, tenantId, ["read:kb"]);
    writeKey = await mintKey(admin, tenantId, ["read:kb", "write:analytics"]);
    noScopeKey = await mintKey(admin, tenantId, []);
    revokedKey = await mintKey(admin, tenantId, ["read:kb"], { revoked: true });
  });

  afterAll(async () => {
    await admin.apiKey.deleteMany({
      where: { id: { in: [readKey.id, writeKey.id, noScopeKey.id, revokedKey.id] } },
    });
    await admin.$disconnect();
    await app.close();
  });

  function auth(k: MintedKey) {
    return { authorization: `Bearer ${k.raw}` };
  }

  it("rejects request with no authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/knowledge-base" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/knowledge-base",
      headers: { authorization: "Bearer wrong-prefix" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unknown (well-formed) key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/knowledge-base",
      headers: { authorization: `Bearer tb_live_${"0".repeat(48)}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a revoked key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/knowledge-base",
      headers: auth(revokedKey),
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a key without read:kb scope with 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/knowledge-base",
      headers: auth(noScopeKey),
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns the KB grouped by module slug for a valid key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/knowledge-base",
      headers: auth(readKey),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.meta.tenant_id).toBe(tenantId);
    expect(typeof body.data).toBe("object");
    expect(Object.keys(body.data).length).toBeGreaterThan(0);
  });

  it("serves a single module's active entries", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/modules/faqs/entries",
      headers: auth(readKey),
    });
    expect(res.statusCode).toBe(200);
    const entries = res.json().data as Array<{ status: string }>;
    for (const e of entries) expect(e.status).toBe("active");
  });

  it("returns 404 for unknown module slug", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/modules/no-such-module/entries",
      headers: auth(readKey),
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects empty search query with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=",
      headers: auth(readKey),
    });
    expect(res.statusCode).toBe(400);
  });

  it("kb-health returns a version and fallback flag", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/kb-health",
      headers: auth(readKey),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { last_updated_version: number; has_fallback: boolean };
    expect(typeof data.last_updated_version).toBe("number");
    expect(typeof data.has_fallback).toBe("boolean");
  });

  it("analytics event is accepted on a write:analytics key", async () => {
    const anyEntry = await admin.entry.findFirst({ where: { tenantId, status: "active" } });
    if (!anyEntry) throw new Error("seed should include at least one active entry");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analytics/event",
      headers: auth(writeKey),
      payload: {
        entry_id: anyEntry.id,
        module: "faqs",
        event_type: "served",
        bot_conversation_id: "test-convo-1",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(true);
  });

  it("analytics event is rejected on a no-scope key", async () => {
    const anyEntry = await admin.entry.findFirst({ where: { tenantId, status: "active" } });
    if (!anyEntry) throw new Error("seed should include at least one active entry");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/analytics/event",
      headers: auth(noScopeKey),
      payload: {
        entry_id: anyEntry.id,
        module: "faqs",
        event_type: "served",
        bot_conversation_id: "test-convo-2",
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
