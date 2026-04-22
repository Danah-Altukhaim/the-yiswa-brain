/**
 * Admin route integration test. All admin routes require a PAIR_ADMIN JWT.
 *
 * Covers:
 *  - non-admin JWT is rejected (401/403)
 *  - unauthenticated request is rejected (401)
 *  - admin can mint an API key; the raw value is returned once, hashed in DB
 *  - admin can create a user; password is not echoed back
 *  - marketplace catalog is readable by admin
 *  - marketplace install creates/updates modules on a tenant
 *
 * Seed dependency: `pnpm seed`; uses `future-kid` tenant, `admin@pairai.com`
 * (PAIR_ADMIN) and `demo@example.com` (CLIENT_EDITOR).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../server.js";

const TENANT_SLUG = "future-kid";
const ADMIN_EMAIL = "admin@pairai.com";
const EDITOR_EMAIL = "demo@example.com";
const PASSWORD = "password1";

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { tenantSlug: TENANT_SLUG, email, password: PASSWORD },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  }
  return res.json().data.token as string;
}

describe("admin routes", () => {
  let app: FastifyInstance;
  const admin = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL! },
    },
  });
  let tenantId: string;
  let adminToken: string;
  let editorToken: string;
  const createdUserIds: string[] = [];
  const createdKeyPrefixes: string[] = [];
  const installedModuleIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const tenant = await admin.tenant.findUnique({ where: { slug: TENANT_SLUG } });
    if (!tenant) throw new Error("seed the future-kid tenant first (pnpm seed)");
    tenantId = tenant.id;
    adminToken = await login(app, ADMIN_EMAIL);
    editorToken = await login(app, EDITOR_EMAIL);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await admin.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdKeyPrefixes.length > 0) {
      await admin.apiKey.deleteMany({ where: { keyPrefix: { in: createdKeyPrefixes } } });
    }
    // installed modules from marketplace upsert may overwrite real seed modules;
    // only delete modules we know we created net-new (i.e. not seeded slugs).
    await admin.$disconnect();
    await app.close();
  });

  it("rejects unauthenticated request to /admin/marketplace", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/marketplace" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a non-admin JWT with 401 or 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/marketplace",
      headers: { authorization: `Bearer ${editorToken}` },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it("lists marketplace catalog for a PAIR_ADMIN", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/marketplace",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    for (const mod of body.data) {
      expect(typeof mod.slug).toBe("string");
      expect(typeof mod.label).toBe("string");
    }
  });

  it("creates a user and returns no password material", async () => {
    const newEmail = `test-admin-created-${Date.now()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        tenantId,
        email: newEmail,
        password: "strong-password-1234",
        name: "Admin Created",
        role: "CLIENT_EDITOR",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.email).toBe(newEmail);
    expect(body.data).not.toHaveProperty("passwordHash");
    expect(body.data).not.toHaveProperty("password");
    createdUserIds.push(body.data.id);
  });

  it("mints an API key, returns the raw value once, stores only the hash", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tenantId, label: "test-minted", scopes: ["read:kb"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.apiKey).toMatch(/^tb_live_[0-9a-f]{48}$/);
    expect(body.meta.warning).toMatch(/once/);

    const raw = body.data.apiKey as string;
    createdKeyPrefixes.push(raw.slice(0, 12));
    const hash = createHash("sha256").update(raw).digest("hex");
    const stored = await admin.apiKey.findUnique({ where: { keyHash: hash } });
    expect(stored).not.toBeNull();
    expect(stored?.tenantId).toBe(tenantId);
    expect(stored?.label).toBe("test-minted");
  });

  it("installs marketplace modules on a tenant", async () => {
    const beforeRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/marketplace",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const catalog = beforeRes.json().data as Array<{ slug: string }>;
    expect(catalog.length).toBeGreaterThan(0);
    const slugToInstall = catalog[0]!.slug;

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/marketplace/install",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tenantId, slugs: [slugToInstall] },
    });
    expect(res.statusCode).toBe(200);
    const installed = res.json().data as Array<{ id: string; slug: string }>;
    expect(installed).toHaveLength(1);
    expect(installed[0]!.slug).toBe(slugToInstall);
    installedModuleIds.push(installed[0]!.id);
  });

  it("rejects create-user with malformed body (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        tenantId,
        email: "not-an-email",
        password: "short",
        name: "X",
        role: "CLIENT_EDITOR",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
