import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticate } from "../../_auth";
import { withTenant } from "../../_db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: { message: "Method not allowed" } });
  }

  const auth = await authenticate(req.headers.authorization as string);
  if (!auth) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });

  const q = ((req.query.q as string) || "").trim();
  if (!q || q.length > 200) {
    return res
      .status(400)
      .json({ success: false, error: { message: "q is required (1-200 chars)" } });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 25, 1), 50);
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const results = await withTenant(
    auth.tenantId,
    async (tx: any) => {
      // Explicit tenantId filter on every join — prod DB may bypass RLS.
      return tx.$queryRawUnsafe(
        `SELECT e.id, e.module_id, m.slug AS module_slug, m.label AS module_label,
              e.data, e.updated_at,
              u.name AS created_by_name
       FROM entries e
       JOIN modules m ON m.id = e.module_id AND m.tenant_id = $3
       LEFT JOIN users u ON u.id = e.created_by AND u.tenant_id = $3
       WHERE e.tenant_id = $3
         AND e.status = 'active'
         AND (
           e.data::text ILIKE $1
           OR m.label ILIKE $1
           OR u.name ILIKE $1
         )
       ORDER BY e.updated_at DESC
       LIMIT $2`,
        pattern,
        limit,
        auth.tenantId,
      );
    },
    auth.isAdmin,
  );

  return res.json({ success: true, data: results });
}
