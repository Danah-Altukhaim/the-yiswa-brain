import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticate } from "../_auth";
import { withTenant } from "../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: { message: "Method not allowed" } });
  }

  const auth = await authenticate(req.headers.authorization as string);
  if (!auth) {
    return res.status(401).json({ success: false, error: { message: "Unauthorized" } });
  }

  const modules = await withTenant(
    auth.tenantId,
    async (tx: any) => {
      return tx.module.findMany({
        // Explicit tenant filter: prod DB may connect with a BYPASSRLS role,
        // so we can't rely on set_config('app.tenant_id') alone.
        where: { isActive: true, tenantId: auth.tenantId },
        select: {
          id: true,
          slug: true,
          label: true,
          icon: true,
          _count: { select: { entries: { where: { tenantId: auth.tenantId } } } },
        },
        orderBy: { createdAt: "asc" },
      });
    },
    auth.isAdmin,
  );

  const data = modules.map((m: any) => ({
    id: m.id,
    slug: m.slug,
    label: m.label,
    icon: m.icon,
    entryCount: m._count.entries,
  }));

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  return res.json({ success: true, data });
}
