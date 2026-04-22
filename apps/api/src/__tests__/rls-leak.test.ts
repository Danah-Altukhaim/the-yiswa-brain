/**
 * Cross-tenant RLS leak test. CI gate.
 *
 * Uses TWO Prisma clients:
 *   - `adminPrisma` connects as the BYPASSRLS migrate role (for setup lookups only).
 *   - `runtimePrisma` connects as the app_runtime role (no BYPASSRLS); this is what the
 *     app uses, and RLS policies must enforce isolation against it.
 *
 * Requires DATABASE_URL + DATABASE_MIGRATE_URL; run `pnpm seed` first.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL! } },
});
const runtimePrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

describe("RLS cross-tenant isolation", () => {
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    const a = await adminPrisma.tenant.findUnique({ where: { slug: "future-kid" } });
    if (!a) throw new Error("Run `pnpm seed` first");
    tenantA = a.id;

    const b = await adminPrisma.tenant.upsert({
      where: { slug: "rls-test-peer" },
      create: { slug: "rls-test-peer", name: "RLS Test Peer", timezone: "Asia/Kuwait" },
      update: {},
    });
    tenantB = b.id;
    const editor = await adminPrisma.user.upsert({
      where: { tenantId_email: { tenantId: tenantB, email: "rls-peer@example.com" } },
      create: {
        tenantId: tenantB,
        email: "rls-peer@example.com",
        name: "RLS Peer",
        role: "CLIENT_EDITOR",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012",
      },
      update: {},
    });
    const mod = await adminPrisma.module.upsert({
      where: { tenantId_slug: { tenantId: tenantB, slug: "faqs" } },
      create: { tenantId: tenantB, slug: "faqs", label: "FAQs", icon: "help-circle", fieldDefinitions: [] },
      update: {},
    });
    await adminPrisma.entry.upsert({
      where: { tenantId_moduleId_externalId: { tenantId: tenantB, moduleId: mod.id, externalId: "rls-probe" } },
      create: {
        tenantId: tenantB,
        moduleId: mod.id,
        externalId: "rls-probe",
        createdBy: editor.id,
        status: "active",
        data: { question_en: "probe", answer_en: "probe" },
      },
      update: {},
    });
  });

  afterAll(async () => {
    await adminPrisma.entry.deleteMany({ where: { tenantId: tenantB } });
    await adminPrisma.module.deleteMany({ where: { tenantId: tenantB } });
    await adminPrisma.user.deleteMany({ where: { tenantId: tenantB } });
    await adminPrisma.tenant.deleteMany({ where: { id: tenantB } });
    await Promise.all([adminPrisma.$disconnect(), runtimePrisma.$disconnect()]);
  });

  it("a query bound to tenant A sees zero tenant B rows", async () => {
    const leaked = await runtimePrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
      return tx.entry.findMany({ where: { tenantId: tenantB } });
    });
    expect(leaked).toHaveLength(0);
  });

  it("a query without tenant context returns zero rows", async () => {
    const leaked = await runtimePrisma.$transaction(async (tx) => {
      // no SET, current_tenant_id() returns NULL so policy filters everything
      return tx.entry.findMany();
    });
    expect(leaked).toHaveLength(0);
  });

  it("scoping to tenant B returns only tenant B rows", async () => {
    const rows = await runtimePrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantB}, true)`;
      return tx.entry.findMany();
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tenantId).toBe(tenantB);
    }
  });
});
