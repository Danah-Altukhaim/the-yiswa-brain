import type { Prisma } from "@prisma/client";

export async function audit(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    diff?: unknown;
  },
) {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      userId: args.userId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      diff: (args.diff ?? null) as Prisma.InputJsonValue,
    },
  });
}

export async function activity(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    userId?: string;
    action: string;
    moduleSlug?: string;
    entryTitle?: string;
    detail?: string;
  },
) {
  await tx.activityFeedEvent.create({
    data: {
      tenantId: args.tenantId,
      userId: args.userId,
      action: args.action,
      moduleSlug: args.moduleSlug,
      entryTitle: args.entryTitle,
      detail: args.detail,
    },
  });
}
