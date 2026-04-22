import type { VercelRequest, VercelResponse } from "@vercel/node";
import { prisma } from "../../_db";
import { authenticate } from "../../_auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ success: false, error: { message: "Method not allowed" } });

  const auth = await authenticate(req.headers.authorization as string);
  if (!auth) return res.status(401).json({ success: false, error: { message: "Unauthorized" } });

  // Verify ownership (user belongs to the JWT's tenant) before updating.
  const existing = await prisma.user.findFirst({
    where: { id: auth.userId, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!existing) {
    return res.status(404).json({ success: false, error: { message: "User not found" } });
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { walkthroughCompleted: true },
  });

  return res.json({ success: true, data: { walkthroughCompleted: true } });
}
