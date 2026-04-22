/**
 * Hourly: flip entries whose expires_at has passed from active → expired.
 * Also fires the 3-days-out expiry warning (once per entry) via WhatsApp.
 */
import { PrismaClient } from "@prisma/client";
import { sendWhatsApp } from "../../apps/api/src/services/whatsapp.js";

const prisma = new PrismaClient();

export async function runExpireCron() {
  if (process.env.CRON_EXPIRY_ENABLED === "false") return;

  // 1. Expire past-due
  const pastDue = await prisma.entry.findMany({
    where: { status: "active", expiresAt: { lte: new Date() } },
    take: 1000,
  });
  for (const e of pastDue) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${e.tenantId}, true)`;
      await tx.entry.update({ where: { id: e.id }, data: { status: "expired" } });
      await tx.auditLog.create({
        data: { tenantId: e.tenantId, action: "auto_expire", entityType: "entry", entityId: e.id },
      });
    });
  }

  // 2. Warn 3 days out (group per tenant)
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  const expiringSoon = await prisma.entry.findMany({
    where: { status: "active", expiresAt: { gt: new Date(), lte: soon } },
  });
  const byTenant = new Map<string, typeof expiringSoon>();
  for (const e of expiringSoon) {
    const list = byTenant.get(e.tenantId) ?? [];
    list.push(e);
    byTenant.set(e.tenantId, list);
  }
  for (const [tenantId, list] of byTenant) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.weeklyReportEmail) continue; // reuse field as alert contact for MVP
    const names = list
      .map((e) => {
        const d = e.data as Record<string, unknown>;
        return String(d.name ?? d.name_en ?? e.id);
      })
      .join(", ");
    try {
      await sendWhatsApp({
        to: tenant.weeklyReportEmail,
        template: "expiry_warning",
        body: `${list.length} entries expire within 3 days: ${names}. Open The Brain to extend or update them.`,
      });
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        cron: "expire",
        tenantId,
        message: `WhatsApp alert failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      }));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runExpireCron().then(() => process.exit(0));
}
