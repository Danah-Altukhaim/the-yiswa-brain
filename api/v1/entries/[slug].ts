import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticate } from "../../_auth";
import { withTenant } from "../../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticate(req.headers.authorization as string);
  if (!auth) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });

  const slug = req.query.slug as string;

  if (req.method === "GET") {
    const entries = await withTenant(
      auth.tenantId,
      async (tx: any) => {
        // Explicit tenant filters — prod DB may not enforce RLS.
        const mod = await tx.module.findFirst({ where: { slug, tenantId: auth.tenantId } });
        if (!mod) return null;
        return tx.entry.findMany({
          where: { moduleId: mod.id, tenantId: auth.tenantId },
          orderBy: { updatedAt: "desc" },
          take: 200,
        });
      },
      auth.isAdmin,
    );

    if (entries === null)
      return res.status(404).json({ success: false, error: { message: "Module not found" } });
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.json({ success: true, data: entries });
  }

  if (req.method === "POST") {
    const { data, publishAt, expiresAt, externalId } = req.body ?? {};
    if (!data)
      return res.status(400).json({ success: false, error: { message: "data is required" } });

    const entry = await withTenant(
      auth.tenantId,
      async (tx: any) => {
        const mod = await tx.module.findFirst({ where: { slug, tenantId: auth.tenantId } });
        if (!mod) return null;

        const created = await tx.entry.create({
          data: {
            tenantId: auth.tenantId,
            moduleId: mod.id,
            data,
            status: publishAt ? "scheduled" : "active",
            publishAt: publishAt ? new Date(publishAt) : null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            externalId: externalId ?? null,
          },
        });

        await tx.entryVersion.create({
          data: {
            entryId: created.id,
            tenantId: auth.tenantId,
            versionNumber: 1,
            dataSnapshot: data,
            changedBy: auth.userId,
            changeSummary: "created",
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: auth.tenantId,
            userId: auth.userId,
            action: "create",
            entityType: "entry",
            entityId: created.id,
            diff: data,
          },
        });

        return created;
      },
      auth.isAdmin,
    );

    if (entry === null)
      return res.status(404).json({ success: false, error: { message: "Module not found" } });
    return res.json({ success: true, data: entry });
  }

  return res.status(405).json({ success: false, error: { message: "Method not allowed" } });
}
