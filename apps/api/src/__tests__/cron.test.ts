/**
 * Cron handler integration tests. Exercises the scheduled side effects that
 * neither routes nor users trigger directly.
 *
 * Deployment note: cron queries `scheduled_jobs` and `entries` without setting
 * `app.tenant_id`, so in production DATABASE_URL for the cron runner must point
 * to the BYPASSRLS migrate role (or to a role that sets `app.is_admin='true'`
 * on every connection). This test mirrors that configuration by stubbing
 * DATABASE_URL to DATABASE_MIGRATE_URL before importing the cron module.
 *
 * Covers:
 *  - publish cron promotes a pending scheduled_job's entry from scheduled to active
 *  - publish cron is a no-op when CRON_PUBLISH_ENABLED=false
 *  - expire cron flips past-due active entries to expired and writes an audit row
 *  - expire cron leaves future-dated entries alone
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const MIGRATE_URL = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL!;

// Cron handlers live outside apps/api's rootDir. Loading them via a computed
// path string avoids pulling them into tsc's type graph for this project,
// while still resolving at runtime under vitest.
type CronModule = { runPublishCron: () => Promise<void>; runExpireCron: () => Promise<void> };
async function loadCron(name: "publish.js" | "expire.js"): Promise<CronModule> {
  const parts = ["..", "..", "..", "..", "infra", "cron", name];
  return (await import(parts.join("/"))) as CronModule;
}

describe("cron: publish", () => {
  const admin = new PrismaClient({ datasources: { db: { url: MIGRATE_URL } } });
  let tenantId: string;
  let moduleId: string;
  const createdEntryIds: string[] = [];
  const createdJobIds: string[] = [];

  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", MIGRATE_URL);
    const tenant = await admin.tenant.findUnique({ where: { slug: "future-kid" } });
    if (!tenant) throw new Error("run pnpm seed first");
    tenantId = tenant.id;
    const mod = await admin.module.findFirst({ where: { tenantId, slug: "faqs" } });
    if (!mod) throw new Error("seed must include faqs module");
    moduleId = mod.id;
  });

  afterAll(async () => {
    if (createdJobIds.length > 0) {
      await admin.scheduledJob.deleteMany({ where: { id: { in: createdJobIds } } });
    }
    if (createdEntryIds.length > 0) {
      await admin.entry.deleteMany({ where: { id: { in: createdEntryIds } } });
    }
    await admin.$disconnect();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    delete process.env.CRON_PUBLISH_ENABLED;
    delete process.env.CRON_EXPIRY_ENABLED;
  });

  it("promotes a due scheduled publish to active and marks the job done", async () => {
    const entry = await admin.entry.create({
      data: {
        tenantId,
        moduleId,
        status: "scheduled",
        data: {
          question_en: "Scheduled publish test",
          question_ar: "اختبار نشر مجدول",
          answer_en: "Pending activation.",
          answer_ar: "معلق التفعيل.",
        },
      },
    });
    createdEntryIds.push(entry.id);

    const job = await admin.scheduledJob.create({
      data: {
        tenantId,
        entryId: entry.id,
        action: "publish",
        scheduledAt: new Date(Date.now() - 60_000),
        status: "pending",
      },
    });
    createdJobIds.push(job.id);

    vi.resetModules();
    const { runPublishCron } = await loadCron("publish.js");
    await runPublishCron();

    const after = await admin.entry.findUnique({ where: { id: entry.id } });
    expect(after?.status).toBe("active");
    const jobAfter = await admin.scheduledJob.findUnique({ where: { id: job.id } });
    expect(jobAfter?.status).toBe("done");
    expect(jobAfter?.executedAt).not.toBeNull();

    const audit = await admin.auditLog.findFirst({
      where: { entityType: "entry", entityId: entry.id, action: "scheduled_publish" },
    });
    expect(audit).not.toBeNull();
  });

  it("is a no-op when CRON_PUBLISH_ENABLED=false", async () => {
    const entry = await admin.entry.create({
      data: {
        tenantId,
        moduleId,
        status: "scheduled",
        data: {
          question_en: "Disabled cron test",
          question_ar: "اختبار إلغاء المهمة",
          answer_en: "Should stay scheduled.",
          answer_ar: "يجب أن يبقى مجدولا.",
        },
      },
    });
    createdEntryIds.push(entry.id);
    const job = await admin.scheduledJob.create({
      data: {
        tenantId,
        entryId: entry.id,
        action: "publish",
        scheduledAt: new Date(Date.now() - 60_000),
        status: "pending",
      },
    });
    createdJobIds.push(job.id);

    process.env.CRON_PUBLISH_ENABLED = "false";
    vi.resetModules();
    const { runPublishCron } = await loadCron("publish.js");
    await runPublishCron();

    const after = await admin.entry.findUnique({ where: { id: entry.id } });
    expect(after?.status).toBe("scheduled");
  });
});

describe("cron: expire", () => {
  const admin = new PrismaClient({ datasources: { db: { url: MIGRATE_URL } } });
  let tenantId: string;
  let moduleId: string;
  const createdEntryIds: string[] = [];

  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", MIGRATE_URL);
    const tenant = await admin.tenant.findUnique({ where: { slug: "future-kid" } });
    if (!tenant) throw new Error("run pnpm seed first");
    tenantId = tenant.id;
    const mod = await admin.module.findFirst({ where: { tenantId, slug: "faqs" } });
    if (!mod) throw new Error("seed must include faqs module");
    moduleId = mod.id;
  });

  afterAll(async () => {
    if (createdEntryIds.length > 0) {
      await admin.entry.deleteMany({ where: { id: { in: createdEntryIds } } });
    }
    await admin.$disconnect();
    vi.unstubAllEnvs();
  });

  it("flips a past-due active entry to expired and writes an audit row", async () => {
    const entry = await admin.entry.create({
      data: {
        tenantId,
        moduleId,
        status: "active",
        expiresAt: new Date(Date.now() - 60_000),
        data: {
          question_en: "Past-due entry",
          question_ar: "إدخال منتهي",
          answer_en: "Should become expired.",
          answer_ar: "يجب أن ينتهي.",
        },
      },
    });
    createdEntryIds.push(entry.id);

    vi.resetModules();
    const { runExpireCron } = await loadCron("expire.js");
    await runExpireCron();

    const after = await admin.entry.findUnique({ where: { id: entry.id } });
    expect(after?.status).toBe("expired");

    const audit = await admin.auditLog.findFirst({
      where: { entityType: "entry", entityId: entry.id, action: "auto_expire" },
    });
    expect(audit).not.toBeNull();
  });

  it("leaves a future-dated active entry alone", async () => {
    const entry = await admin.entry.create({
      data: {
        tenantId,
        moduleId,
        status: "active",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        data: {
          question_en: "Future-dated entry",
          question_ar: "إدخال مستقبلي",
          answer_en: "Should stay active.",
          answer_ar: "يجب أن يبقى نشطا.",
        },
      },
    });
    createdEntryIds.push(entry.id);

    vi.resetModules();
    const { runExpireCron } = await loadCron("expire.js");
    await runExpireCron();

    const after = await admin.entry.findUnique({ where: { id: entry.id } });
    expect(after?.status).toBe("active");
  });
});
