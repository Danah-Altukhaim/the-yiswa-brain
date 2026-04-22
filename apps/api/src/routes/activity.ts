import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const Query = z.object({
  userId: z.string().uuid().optional(),
  moduleSlug: z.string().optional(),
  action: z.enum(["create", "update", "delete", "rollback"]).optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

type ActivityEvent = {
  id: string;
  action: "create" | "update" | "delete" | "rollback";
  timestamp: string;
  user: { id: string; name: string } | null;
  module: { slug: string; label: string } | null;
  entry: { id: string; title: string } | null;
  detail: string | null;
};

const TITLE_CANDIDATES = [
  "title",
  "name_en",
  "name",
  "update_name",
  "q_en",
  "question_en",
  "question",
  "flow_id",
  "intent_id",
  "ai_record_id",
] as const;

function pickTitle(data: unknown): string {
  if (!data || typeof data !== "object") return "(untitled)";
  const d = data as Record<string, unknown>;
  for (const k of TITLE_CANDIDATES) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const v of Object.values(d)) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "(untitled)";
}

function classifyVersion(versionNumber: number, summary: string | null): ActivityEvent["action"] {
  if (summary && /^rollback/i.test(summary)) return "rollback";
  return versionNumber === 1 ? "create" : "update";
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => {
    const q = Query.parse(req.query);
    const events = await req.withTenant<ActivityEvent[]>(async (tx) => {
      const sinceDate = q.since ? new Date(q.since) : undefined;
      const fetchLimit = Math.min(q.limit * 3, 600);

      const [modules, users] = await Promise.all([
        tx.module.findMany({ select: { id: true, slug: true, label: true } }),
        tx.user.findMany({ select: { id: true, name: true } }),
      ]);
      const moduleById = new Map(modules.map((m) => [m.id, m]));
      const moduleBySlug = new Map(modules.map((m) => [m.slug, m]));
      const userById = new Map(users.map((u) => [u.id, u]));
      const moduleFilterId = q.moduleSlug ? moduleBySlug.get(q.moduleSlug)?.id : undefined;
      if (q.moduleSlug && !moduleFilterId) return [];

      const wantsCreate = !q.action || q.action === "create";
      const wantsUpdate = !q.action || q.action === "update";
      const wantsRollback = !q.action || q.action === "rollback";
      const wantsDelete = !q.action || q.action === "delete";

      const versionPromise =
        wantsCreate || wantsUpdate || wantsRollback
          ? tx.entryVersion.findMany({
              where: {
                changedBy: q.userId,
                changedAt: sinceDate ? { gte: sinceDate } : undefined,
                entry: moduleFilterId ? { moduleId: moduleFilterId } : undefined,
              },
              orderBy: { changedAt: "desc" },
              take: fetchLimit,
              select: {
                id: true,
                versionNumber: true,
                changedAt: true,
                changedBy: true,
                changeSummary: true,
                dataSnapshot: true,
                entry: { select: { id: true, moduleId: true } },
              },
            })
          : Promise.resolve([] as Array<never>);

      const auditPromise = wantsDelete
        ? tx.auditLog.findMany({
            where: {
              action: "delete",
              entityType: "entry",
              userId: q.userId,
              timestamp: sinceDate ? { gte: sinceDate } : undefined,
            },
            orderBy: { timestamp: "desc" },
            take: fetchLimit,
            select: {
              id: true,
              userId: true,
              entityId: true,
              diff: true,
              timestamp: true,
            },
          })
        : Promise.resolve([] as Array<never>);

      const [versions, audits] = await Promise.all([versionPromise, auditPromise]);

      const out: ActivityEvent[] = [];

      for (const v of versions) {
        const action = classifyVersion(v.versionNumber, v.changeSummary);
        if (q.action && q.action !== action) continue;
        const mod = moduleById.get(v.entry.moduleId) ?? null;
        const user = v.changedBy ? userById.get(v.changedBy) ?? null : null;
        out.push({
          id: `ver-${v.id}`,
          action,
          timestamp: v.changedAt.toISOString(),
          user,
          module: mod ? { slug: mod.slug, label: mod.label } : null,
          entry: { id: v.entry.id, title: pickTitle(v.dataSnapshot) },
          detail: v.changeSummary && !/^(created|updated)$/i.test(v.changeSummary) ? v.changeSummary : null,
        });
      }

      for (const a of audits) {
        const user = a.userId ? userById.get(a.userId) ?? null : null;
        const diff = (a.diff ?? null) as Record<string, unknown> | null;
        const title = diff ? pickTitle(diff) : null;
        out.push({
          id: `aud-${a.id}`,
          action: "delete",
          timestamp: a.timestamp.toISOString(),
          user,
          module: null,
          entry: a.entityId ? { id: a.entityId, title: title ?? "(deleted entry)" } : null,
          detail: null,
        });
      }

      out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
      return out.slice(0, q.limit);
    });
    return { success: true, data: events };
  });
};

export default routes;
