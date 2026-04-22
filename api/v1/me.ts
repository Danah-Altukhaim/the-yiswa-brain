import type { VercelRequest, VercelResponse } from "@vercel/node";
import { prisma } from "../_db";
import { authenticate } from "../_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET")
    return res.status(405).json({ success: false, error: { message: "Method not allowed" } });

  const auth = await authenticate(req.headers.authorization as string);
  if (!auth) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });

  // Explicit tenantId filter via findFirst — prod DB may bypass RLS, and the
  // JWT's userId alone isn't a tenant-proof lookup.
  const user = await prisma.user.findFirst({
    where: { id: auth.userId, tenantId: auth.tenantId },
    select: { id: true, email: true, name: true, role: true, walkthroughCompleted: true },
  });
  if (!user) {
    return res.status(404).json({ success: false, error: { message: "User not found" } });
  }

  return res.json({ success: true, data: user });
}
