import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticate } from "../_auth";
import { withTenant } from "../_db";

const TITLE_KEYS = ["title", "name_en", "name", "q_en", "question_en", "flow_id"] as const;

function pickTitle(data: unknown): string {
  if (!data || typeof data !== "object") return "(untitled)";
  const d = data as Record<string, unknown>;
  for (const k of TITLE_KEYS) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const v of Object.values(d)) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "(untitled)";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET")
    return res.status(405).json({ success: false, error: { message: "Method not allowed" } });

  const auth = await authenticate(req.headers.authorization as string);
  if (!auth) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });

  const moduleSlug = (req.query.moduleSlug as string) || "";
  const actionFilter = (req.query.action as string) || "";
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const events = await withTenant(
    auth.tenantId,
    async (tx: any) => {
      // Every query below filters by tenantId explicitly — prod DB may bypass RLS.
      const [modules, users] = await Promise.all([
        tx.module.findMany({
          where: { tenantId: auth.tenantId },
          select: { id: true, slug: true, label: true },
        }),
        tx.user.findMany({
          where: { tenantId: auth.tenantId },
          select: { id: true, name: true },
        }),
      ]);
      const moduleById = new Map<string, any>(modules.map((m: any) => [m.id, m]));
      const moduleBySlug = new Map<string, any>(modules.map((m: any) => [m.slug, m]));
      const userById = new Map<string, any>(users.map((u: any) => [u.id, u]));

      const moduleFilterId = moduleSlug ? moduleBySlug.get(moduleSlug)?.id : undefined;
      if (moduleSlug && !moduleFilterId) return [];

      const out: any[] = [];

      // Entry versions (create, update, rollback)
      if (!actionFilter || actionFilter !== "delete") {
        const versions = await tx.entryVersion.findMany({
          where: {
            tenantId: auth.tenantId,
            entry: moduleFilterId
              ? { moduleId: moduleFilterId, tenantId: auth.tenantId }
              : { tenantId: auth.tenantId },
          },
          orderBy: { changedAt: "desc" },
          take: limit * 3,
          select: {
            id: true,
            versionNumber: true,
            changedAt: true,
            changedBy: true,
            changeSummary: true,
            dataSnapshot: true,
            entry: { select: { id: true, moduleId: true } },
          },
        });

        for (const v of versions) {
          let action = v.versionNumber === 1 ? "create" : "update";
          if (v.changeSummary && /^rollback/i.test(v.changeSummary)) action = "rollback";
          if (actionFilter && actionFilter !== action) continue;

          const mod = moduleById.get(v.entry.moduleId);
          const user = v.changedBy ? userById.get(v.changedBy) : null;
          out.push({
            id: `ver-${v.id}`,
            action,
            timestamp: v.changedAt.toISOString(),
            user: user ? { id: user.id, name: user.name } : null,
            module: mod ? { slug: mod.slug, label: mod.label } : null,
            entry: { id: v.entry.id, title: pickTitle(v.dataSnapshot) },
            detail:
              v.changeSummary && !/^(created|updated)$/i.test(v.changeSummary)
                ? v.changeSummary
                : null,
          });
        }
      }

      // Audit log (deletes)
      if (!actionFilter || actionFilter === "delete") {
        const audits = await tx.auditLog.findMany({
          where: { tenantId: auth.tenantId, action: "delete", entityType: "entry" },
          orderBy: { timestamp: "desc" },
          take: limit * 3,
          select: { id: true, userId: true, entityId: true, diff: true, timestamp: true },
        });

        for (const a of audits) {
          const user = a.userId ? userById.get(a.userId) : null;
          const title = a.diff ? pickTitle(a.diff) : "(deleted entry)";
          out.push({
            id: `aud-${a.id}`,
            action: "delete",
            timestamp: a.timestamp.toISOString(),
            user: user ? { id: user.id, name: user.name } : null,
            module: null,
            entry: a.entityId ? { id: a.entityId, title } : null,
            detail: null,
          });
        }
      }

      out.sort((a: any, b: any) => (a.timestamp < b.timestamp ? 1 : -1));
      return out.slice(0, limit);
    },
    auth.isAdmin,
  );

  return res.json({ success: true, data: events });
}
