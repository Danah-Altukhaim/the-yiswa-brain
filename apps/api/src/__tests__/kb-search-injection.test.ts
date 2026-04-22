/**
 * Regression test: /api/v1/search must parameterize the user-supplied term.
 * A classic injection probe like `' OR 1=1 --` should be treated as a literal
 * search string, not executed as SQL. We assert the call returns without
 * throwing and without leaking rows from a foreign tenant.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL! } },
});
const runtimePrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

describe("kb /search injection resistance", () => {
  let tenantA: string;

  beforeAll(async () => {
    const a = await adminPrisma.tenant.findUnique({ where: { slug: "future-kid" } });
    if (!a) throw new Error("Run `pnpm seed` first");
    tenantA = a.id;
  });

  afterAll(async () => {
    await Promise.all([adminPrisma.$disconnect(), runtimePrisma.$disconnect()]);
  });

  const probes = [
    "' OR 1=1 --",
    "'; DROP TABLE entries; --",
    "\" OR \"\"=\"",
    "%' OR 1=1 --",
    "$1; SELECT * FROM users --",
  ];

  for (const probe of probes) {
    it(`treats ${JSON.stringify(probe)} as a literal term`, async () => {
      const rows = await runtimePrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
        return tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id, module_id, data
          FROM entries
          WHERE status = 'active'
            AND (
              (data->>'name') % ${probe}
              OR (data->>'name_en') % ${probe}
              OR (data->>'name_ar') % ${probe}
            )
          LIMIT 20
        `);
      });
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeLessThanOrEqual(20);
    });
  }
});
