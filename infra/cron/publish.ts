/**
 * Every 15 minutes: promote scheduled entries whose publish_at has arrived.
 * Runs as its own process; reads tenant_id per row and sets the session var per statement.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function runPublishCron() {
  if (process.env.CRON_PUBLISH_ENABLED === "false") return;
  const due = await prisma.scheduledJob.findMany({
    where: { status: "pending", action: "publish", scheduledAt: { lte: new Date() } },
    take: 500,
  });
  for (const job of due) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${job.tenantId}, true)`;
      await tx.entry.update({
        where: { id: job.entryId },
        data: { status: "active" },
      });
      await tx.scheduledJob.update({
        where: { id: job.id },
        data: { status: "done", executedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: job.tenantId,
          action: "scheduled_publish",
          entityType: "entry",
          entityId: job.entryId,
        },
      });
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPublishCron().then(() => process.exit(0));
}
