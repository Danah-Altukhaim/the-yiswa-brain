/**
 * Seed dev fixtures: the Yiswa tenant with canonical modules, sample entries,
 * and an API key.
 *
 * The `yiswa` tenant is seeded from the static snapshot at `api/_fixtures.ts`
 * so local Postgres ends up with the same content that the Vercel demo serves.
 *
 * Run: `pnpm seed`
 */
import bcrypt from "bcrypt";
import { randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// `api/_fixtures.ts` sits under the root package (no `type: module`), so tsx
// transpiles it as CJS. A static ESM named import fails to link. Going through
// `await import(...)` works in both ESM-tsx and plain Node by unwrapping the
// CJS interop object under `.default`.
type Fixtures = typeof import("../../api/_fixtures");
const fixturesMod = (await import("../../api/_fixtures")) as unknown as Fixtures & {
  default?: Fixtures;
};
const MODULES = fixturesMod.default?.MODULES ?? fixturesMod.MODULES;
const ENTRIES_BY_SLUG = fixturesMod.default?.ENTRIES_BY_SLUG ?? fixturesMod.ENTRIES_BY_SLUG;

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL! } },
});

type EntryStatus = "draft" | "scheduled" | "active" | "expired" | "archived";

async function upsertTenantUsers(tenantId: string) {
  const editor = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: "demo@example.com" } },
    create: {
      tenantId,
      email: "demo@example.com",
      name: "Demo (Editor)",
      role: "CLIENT_EDITOR",
      passwordHash: await bcrypt.hash("password1", 10),
      walkthroughCompleted: true,
    },
    update: { walkthroughCompleted: true },
  });
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: "admin@pairai.com" } },
    create: {
      tenantId,
      email: "admin@pairai.com",
      name: "PAIR Admin",
      role: "PAIR_ADMIN",
      passwordHash: await bcrypt.hash("password1", 10),
    },
    update: {},
  });
  return { editor, admin };
}

async function issueApiKey(tenantId: string, slug: string) {
  const raw = `tb_live_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  await prisma.apiKey.upsert({
    where: { keyHash: hash },
    create: {
      tenantId,
      keyHash: hash,
      keyPrefix: raw.slice(0, 12),
      label: "Seed bot key",
      scopes: ["read:kb", "write:analytics"],
    },
    update: {},
  });
  console.log(`Seeded ${slug}: api_key = ${raw}`);
}

async function seedYiswa() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "yiswa" },
    create: { slug: "yiswa", name: "Yiswa", timezone: "Asia/Kuwait" },
    update: {},
  });
  const { editor } = await upsertTenantUsers(tenant.id);

  const moduleIdBySlug = new Map<string, string>();
  for (const mod of MODULES) {
    const row = await prisma.module.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: mod.slug } },
      create: {
        tenantId: tenant.id,
        slug: mod.slug,
        label: mod.label,
        icon: mod.icon ?? null,
        fieldDefinitions: mod.fieldDefinitions as unknown as object,
      },
      update: {
        label: mod.label,
        icon: mod.icon ?? null,
        fieldDefinitions: mod.fieldDefinitions as unknown as object,
      },
    });
    moduleIdBySlug.set(mod.slug, row.id);
  }

  let entryCount = 0;
  for (const [slug, entries] of Object.entries(ENTRIES_BY_SLUG)) {
    const moduleId = moduleIdBySlug.get(slug);
    if (!moduleId) {
      console.warn(`Skipping ${entries.length} entries: no module for slug "${slug}"`);
      continue;
    }
    for (const entry of entries) {
      await prisma.entry.upsert({
        where: {
          tenantId_moduleId_externalId: {
            tenantId: tenant.id,
            moduleId,
            externalId: entry.id,
          },
        },
        create: {
          tenantId: tenant.id,
          moduleId,
          externalId: entry.id,
          createdBy: editor.id,
          status: entry.status as EntryStatus,
          data: entry.data as object,
        },
        update: {
          data: entry.data as object,
          status: entry.status as EntryStatus,
        },
      });
      entryCount++;
    }
  }

  await issueApiKey(tenant.id, "yiswa");
  console.log(`Seeded yiswa: ${MODULES.length} modules, ${entryCount} entries`);
}

async function main() {
  await seedYiswa();
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
