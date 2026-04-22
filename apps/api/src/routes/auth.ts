import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { unauthorized } from "../lib/errors.js";
import { authLoginTotal } from "../lib/metrics.js";

const LoginBody = z.object({
  tenantSlug: z.string(),
  email: z.string().email(),
  password: z.string().min(8),
});

// Pre-computed hash used for constant-time comparison when user is not found.
// Prevents timing attacks that could enumerate valid email addresses.
const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";

const routes: FastifyPluginAsync = async (app) => {
  app.post(
    "/login",
    { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      const body = LoginBody.parse(req.body);
      // Pre-auth lookup: allow cross-tenant by flagging is_admin for this tx only.
      const auth = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
        const tenant = await tx.tenant.findUnique({ where: { slug: body.tenantSlug } });
        if (!tenant) return null;
        const user = await tx.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email: body.email } },
        });
        if (!user) return null;
        return { tenant, user };
      });
      // Always run bcrypt comparison to prevent timing-based email enumeration
      const ok = await bcrypt.compare(body.password, auth?.user.passwordHash ?? DUMMY_HASH);
      if (!auth || !ok) {
        authLoginTotal.labels("fail").inc();
        throw unauthorized();
      }
      authLoginTotal.labels("success").inc();

      const { tenant, user } = auth;
      const token = app.jwt.sign({
        sub: user.id,
        tenantId: tenant.id,
        role: user.role,
      });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        await tx.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
      });
      return reply.send({
        success: true,
        data: {
          token,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
          tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        },
      });
    },
  );
};

export default routes;
