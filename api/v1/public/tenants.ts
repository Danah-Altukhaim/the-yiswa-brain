import type { VercelRequest, VercelResponse } from "@vercel/node";
import { prisma } from "../../_db";

// Public tenant list used by both:
//   - apex login: dropdown of all tenants for one-click demo
//   - subdomain login: frontend filters for the matching slug to apply branding
//
// Single function on purpose: Hobby plan caps serverless functions at 12 and we
// can't afford a separate detail endpoint. Branding is non-sensitive so serving
// the whole list is acceptable.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, error: { code: "method_not_allowed", status: 405 } });
  }
  const tenants = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
    return tx.tenant.findMany({
      select: {
        slug: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        faviconUrl: true,
      },
      orderBy: { name: "asc" },
    });
  });
  return res.json({ success: true, data: tenants });
}
