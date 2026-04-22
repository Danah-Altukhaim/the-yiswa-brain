/**
 * Port Danah's Flare Fitness + Macro dataset into the `flare` tenant.
 *
 * Reads the verbatim snapshot at `infra/flare-fixtures.ts` (copied from
 * github.com/Danah-Altukhaim/theflarebrain/api/_fixtures.ts) and upserts
 * all modules + entries into our prod tenant.
 *
 * Idempotent: entry IDs are deterministic UUIDv5 from Danah's build script.
 *
 * Run (from the-brain root):
 *   bash scripts/import-flare-data.sh
 */

import { PrismaClient } from "@prisma/client";
import { MODULES, ENTRIES_BY_SLUG } from "../infra/flare-fixtures.js";

const TENANT_SLUG = "flare";
const TENANT_NAME = "Flare Fitness";
const TENANT_TIMEZONE = "Asia/Kuwait";
const BATCH_SIZE = 50;

type ModuleFixture = (typeof MODULES)[number];
type EntryFixture = (typeof ENTRIES_BY_SLUG)[keyof typeof ENTRIES_BY_SLUG][number];

// Short-lived transactions keep each one under Prisma's interactive-tx
// timeout even on slow pooled connections. Admin bypass is re-set per tx.
async function withAdminTx<T>(
  prisma: PrismaClient,
  fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 30_000 },
  );
}

async function main() {
  const prisma = new PrismaClient();

  // 1. Tenant lookup + rename.
  const tenant = await withAdminTx(prisma, async (tx) => {
    const existing = await tx.tenant.findUnique({ where: { slug: TENANT_SLUG } });
    if (!existing) {
      throw new Error(`Tenant "${TENANT_SLUG}" not found. Run onboard-flare.sh first.`);
    }
    return tx.tenant.update({
      where: { id: existing.id },
      data: { name: TENANT_NAME, timezone: TENANT_TIMEZONE },
    });
  });
  console.log(`Tenant: ${tenant.name} (${tenant.slug})  [${tenant.id}]`);

  // 2. Modules: one small transaction per module.
  const moduleIdBySlug = new Map<string, string>();
  let modCreated = 0;
  let modUpdated = 0;
  for (const mod of MODULES as ModuleFixture[]) {
    const id = await withAdminTx(prisma, async (tx) => {
      const existing = await tx.module.findUnique({
        where: { tenantId_slug: { tenantId: tenant.id, slug: mod.slug } },
      });
      if (existing) {
        await tx.module.update({
          where: { id: existing.id },
          data: {
            label: mod.label,
            icon: mod.icon,
            fieldDefinitions: mod.fieldDefinitions,
            isActive: true,
          },
        });
        modUpdated++;
        return existing.id;
      }
      const created = await tx.module.create({
        data: {
          tenantId: tenant.id,
          slug: mod.slug,
          label: mod.label,
          icon: mod.icon,
          fieldDefinitions: mod.fieldDefinitions,
          isActive: true,
        },
      });
      modCreated++;
      return created.id;
    });
    moduleIdBySlug.set(mod.slug, id);
  }
  console.log(`Modules: ${modCreated} created, ${modUpdated} updated`);

  // 3. Entries: batched upserts (BATCH_SIZE per transaction).
  let entriesCreated = 0;
  let entriesUpdated = 0;
  for (const [slug, entries] of Object.entries(ENTRIES_BY_SLUG) as Array<
    [string, EntryFixture[]]
  >) {
    const moduleId = moduleIdBySlug.get(slug);
    if (!moduleId) {
      console.warn(`[skip] no module for slug ${slug}`);
      continue;
    }
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);
      const ids = chunk.map((e) => e.id);
      const existingIds = new Set(
        (
          await withAdminTx(prisma, (tx) =>
            tx.entry.findMany({
              where: { id: { in: ids }, tenantId: tenant.id },
              select: { id: true },
            }),
          )
        ).map((r) => r.id),
      );
      await withAdminTx(prisma, async (tx) => {
        for (const entry of chunk) {
          if (existingIds.has(entry.id)) {
            await tx.entry.update({
              where: { id: entry.id },
              data: { moduleId, tenantId: tenant.id, data: entry.data, status: "active" },
            });
            entriesUpdated++;
          } else {
            await tx.entry.create({
              data: {
                id: entry.id,
                tenantId: tenant.id,
                moduleId,
                data: entry.data,
                status: "active",
              },
            });
            entriesCreated++;
          }
        }
      });
    }
    process.stdout.write(`  ${slug}: ${entries.length} done\n`);
  }
  console.log(`\nEntries: ${entriesCreated} created, ${entriesUpdated} updated`);
  console.log("\nSmoke test: https://flare-brain.vercel.app");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
