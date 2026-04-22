import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticate } from "../../../_auth";
import { withTenant } from "../../../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticate(req.headers.authorization as string);
  if (!auth) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });

  const id = req.query.id as string;

  if (req.method === "GET") {
    // Explicit tenant filter via findFirst (findUnique can't take composite where).
    const entry = await withTenant(
      auth.tenantId,
      (tx: any) => tx.entry.findFirst({ where: { id, tenantId: auth.tenantId } }),
      auth.isAdmin,
    );
    if (!entry) return res.status(404).json({ success: false, error: { message: "Not found" } });
    return res.json({ success: true, data: entry });
  }

  if (req.method === "PATCH") {
    const { data, changeSummary } = req.body ?? {};
    if (!data)
      return res.status(400).json({ success: false, error: { message: "data is required" } });

    const updated = await withTenant(
      auth.tenantId,
      async (tx: any) => {
        // Verify ownership explicitly before update.
        const existing = await tx.entry.findFirst({ where: { id, tenantId: auth.tenantId } });
        if (!existing) return null;

        const lastVersion = await tx.entryVersion.findFirst({
          where: { entryId: id, tenantId: auth.tenantId },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const nextVersion = (lastVersion?.versionNumber ?? 0) + 1;

        const result = await tx.entry.update({
          where: { id },
          data: { data, updatedAt: new Date() },
        });

        await tx.entryVersion.create({
          data: {
            entryId: id,
            tenantId: auth.tenantId,
            versionNumber: nextVersion,
            dataSnapshot: data,
            changedBy: auth.userId,
            changeSummary: changeSummary ?? "updated",
          },
        });

        return result;
      },
      auth.isAdmin,
    );

    if (!updated) return res.status(404).json({ success: false, error: { message: "Not found" } });
    return res.json({ success: true, data: updated });
  }

  if (req.method === "DELETE") {
    await withTenant(
      auth.tenantId,
      async (tx: any) => {
        // Verify ownership explicitly before delete.
        const existing = await tx.entry.findFirst({
          where: { id, tenantId: auth.tenantId },
          select: { data: true },
        });
        if (!existing) return;
        await tx.entry.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            tenantId: auth.tenantId,
            userId: auth.userId,
            action: "delete",
            entityType: "entry",
            entityId: id,
            diff: existing.data ?? null,
          },
        });
      },
      auth.isAdmin,
    );
    return res.json({ success: true, data: { deleted: id } });
  }

  return res.status(405).json({ success: false, error: { message: "Method not allowed" } });
}
