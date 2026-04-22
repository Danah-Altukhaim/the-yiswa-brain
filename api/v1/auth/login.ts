import type { VercelRequest, VercelResponse } from "@vercel/node";
import { prisma } from "../../_db";
import { signJwt } from "../../_auth";
import bcrypt from "bcrypt";

const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ success: false, error: { message: "Method not allowed" } });

  const { tenantSlug, email, password } = req.body ?? {};
  if (!email || !password)
    return res
      .status(400)
      .json({ success: false, error: { message: "Email and password required" } });

  try {
    const auth = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
      const tenant = await tx.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant) return null;
      const user = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email } },
      });
      if (!user) return null;
      return { tenant, user };
    });

    const ok = await bcrypt.compare(password, auth?.user?.passwordHash ?? DUMMY_HASH);
    if (!auth || !ok)
      return res.status(401).json({ success: false, error: { message: "Invalid credentials" } });

    const { tenant, user } = auth;
    const token = signJwt({ sub: user.id, tenantId: tenant.id, role: user.role });

    const isDemoAccount = user.email === "demo@example.com";
    const walkthroughCompleted = isDemoAccount ? true : user.walkthroughCompleted;

    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
      await tx.user.update({
        where: { id: user.id },
        data: isDemoAccount
          ? { lastLogin: new Date(), walkthroughCompleted: true }
          : { lastLogin: new Date() },
      });
    });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          walkthroughCompleted,
        },
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      },
    });
  } catch (err: any) {
    console.error("[auth/login] failed:", err);
    return res.status(500).json({
      success: false,
      error: {
        message: err?.message ?? "Login handler crashed",
        code: err?.code ?? "LOGIN_CRASH",
        stack: err?.stack?.split("\n").slice(0, 8),
      },
    });
  }
}
