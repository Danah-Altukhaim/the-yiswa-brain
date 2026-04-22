/**
 * Daily 03:00 tenant TZ: run Claude gap scan per tenant, write to ai_suggestions,
 * WhatsApp-alert critical findings.
 */
import { PrismaClient } from "@prisma/client";
import { runGapScan } from "@brain/prompts";
import { sendWhatsApp } from "../../apps/api/src/services/whatsapp.js";

const prisma = new PrismaClient();

export async function runGapScanCron() {
  if (process.env.CRON_GAP_SCAN_ENABLED === "false") return;
  const tenants = await prisma.tenant.findMany();
  for (const tenant of tenants) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
      const modules = await tx.module.findMany({ where: { isActive: true } });
      const kbSummary = await Promise.all(
        modules.map(async (m) => {
          const entries = await tx.entry.findMany({
            where: { moduleId: m.id, status: "active" },
            select: { id: true, data: true, updatedAt: true },
            take: 200,
          });
          return {
            module: m.slug,
            entries: entries.map((e) => ({ id: e.id, data: e.data, updated_at: e.updatedAt.toISOString() })),
          };
        }),
      );
      const analyticsAgg = await tx.contentAnalyticsEvent.groupBy({
        by: ["entryId"],
        where: { eventType: "served", timestamp: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
        _count: true,
      });
      const analytics = analyticsAgg
        .filter((a) => a.entryId)
        .map((a) => ({ entry_id: a.entryId!, served_count: a._count }));

      const { suggestions } = await runGapScan({
        tenantName: tenant.name,
        kbSummary,
        analytics,
      });

      for (const s of suggestions) {
        const mod = modules.find((m) => m.slug === s.module_slug);
        await tx.aiSuggestion.create({
          data: {
            tenantId: tenant.id,
            type: s.type,
            moduleId: mod?.id,
            description: s.description,
          },
        });
      }

      const critical = suggestions.filter((s) => s.type === "consistency" || s.type === "missing");
      if (critical.length && tenant.weeklyReportEmail) {
        await sendWhatsApp({
          to: tenant.weeklyReportEmail,
          template: "gap_scan_alert",
          body: `⚠️ The Brain gap scan: ${critical.length} critical finding(s). Open the dashboard.`,
        });
      }
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGapScanCron().then(() => process.exit(0));
}
