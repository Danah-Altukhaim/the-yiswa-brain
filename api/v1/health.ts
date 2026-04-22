import type { VercelRequest, VercelResponse } from "@vercel/node";
import { prisma } from "../_db";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    const tenantCount = await prisma.tenant.count();
    return res.json({ success: true, data: { db: "connected", tenants: tenantCount, raw: result } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message, stack: err.stack?.split("\n").slice(0, 5) } });
  }
}
