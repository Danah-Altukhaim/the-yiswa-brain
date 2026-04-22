/**
 * Monday 07:00 tenant TZ: generate and email weekly PDF report.
 */
import { PrismaClient } from "@prisma/client";
import { renderWeeklyReportPdf } from "../../apps/api/src/services/pdf-report.js";
import { sendEmail } from "../../apps/api/src/services/email.js";

const prisma = new PrismaClient();

export async function runWeeklyPdfCron() {
  if (process.env.CRON_WEEKLY_PDF_ENABLED === "false") return;

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const tenants = await prisma.tenant.findMany({ where: { weeklyReportEmail: { not: null } } });
  for (const tenant of tenants) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

      const total = await tx.entry.count({ where: { status: "active" } });
      const newThisWeek = await tx.entry.count({
        where: { createdAt: { gte: weekStart }, status: "active" },
      });
      const updatedThisWeek = await tx.entryVersion.count({
        where: { changedAt: { gte: weekStart } },
      });
      const expiredThisWeek = await tx.entry.count({
        where: { status: "expired", updatedAt: { gte: weekStart } },
      });

      const topRaw = await tx.$queryRawUnsafe<Array<{ entry_id: string; count: bigint }>>(
        `SELECT entry_id, COUNT(*)::bigint AS count FROM content_analytics
         WHERE event_type='served' AND timestamp >= $1
         GROUP BY entry_id ORDER BY count DESC LIMIT 5`,
        weekStart,
      );
      const topServed = await Promise.all(
        topRaw.map(async (r) => {
          const e = await tx.entry.findUnique({ where: { id: r.entry_id } });
          const d = (e?.data ?? {}) as Record<string, unknown>;
          return { name: String(d.name ?? d.name_en ?? r.entry_id), count: Number(r.count) };
        }),
      );

      const suggestions = await tx.aiSuggestion.findMany({
        where: { status: "open" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      const activity = await tx.activityFeedEvent.findMany({
        where: { timestamp: { gte: weekStart } },
        orderBy: { timestamp: "desc" },
        take: 10,
      });

      // Health
      const entries = await tx.entry.findMany({
        where: { status: "active" },
        select: { data: true, mediaIds: true, updatedAt: true },
      });
      const fresh = entries.filter((e) => e.updatedAt >= weekStart).length;
      const translated = entries.filter((e) => {
        const d = e.data as Record<string, unknown>;
        const ks = Object.keys(d);
        const en = ks.some((k) => k.endsWith("_en") && typeof d[k] === "string");
        const ar = ks.some((k) => k.endsWith("_ar") && typeof d[k] === "string");
        return !en || ar;
      }).length;
      const withMedia = entries.filter((e) => e.mediaIds.length > 0).length;

      const pdf = await renderWeeklyReportPdf({
        tenantName: tenant.name,
        weekStart: weekStart.toISOString().slice(0, 10),
        weekEnd: now.toISOString().slice(0, 10),
        totals: { entries: total, newThisWeek, updatedThisWeek, expiredThisWeek },
        topServed,
        suggestions: suggestions.map((s) => ({ type: s.type, description: s.description })),
        activityHighlights: activity.map((a) => ({
          when: a.timestamp.toISOString().slice(0, 10),
          summary: `${a.action} ${a.moduleSlug ?? ""} ${a.entryTitle ?? ""}`.trim(),
        })),
        health: {
          freshPct: total ? Math.round((fresh / total) * 100) : 0,
          translatedPct: total ? Math.round((translated / total) * 100) : 0,
          withMediaPct: total ? Math.round((withMedia / total) * 100) : 0,
        },
      });

      await sendEmail({
        to: tenant.weeklyReportEmail!,
        subject: `The Brain: Weekly Report (${tenant.name})`,
        text: "Attached: your weekly knowledge-base report from The Brain.",
        attachments: [
          { filename: `brain-report-${now.toISOString().slice(0, 10)}.pdf`, content: pdf, contentType: "application/pdf" },
        ],
      });
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWeeklyPdfCron().then(() => process.exit(0));
}
