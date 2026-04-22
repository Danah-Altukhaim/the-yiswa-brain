import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { adminBypassTotal } from "../lib/metrics.js";

const SlugParam = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
});

// Public, unauthenticated endpoints that the web app needs before a user has a session.
// Exposes only non-sensitive tenant branding so the login page can render with the right
// colors, logo, and title when a client visits `<slug>.thebrain.app`.
const routes: FastifyPluginAsync = async (app) => {
  app.get("/tenants", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async () => {
    const tenants = await prisma.$transaction(async (tx) => {
      adminBypassTotal.labels("public-tenant-list").inc();
      await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
      return tx.tenant.findMany({
        select: { slug: true, name: true, logoUrl: true, primaryColor: true },
        orderBy: { name: "asc" },
      });
    });
    return { success: true, data: tenants };
  });

  app.get(
    "/tenant/:slug",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { slug } = SlugParam.parse(req.params);
      // No tenant context yet: set is_admin for this tx only so the cross-tenant
      // lookup clears RLS. Same pattern as the pre-auth lookup in routes/auth.ts.
      const tenant = await prisma.$transaction(async (tx) => {
        adminBypassTotal.labels("public-tenant-lookup").inc();
        await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
        return tx.tenant.findUnique({
          where: { slug },
          select: {
            slug: true,
            name: true,
            logoUrl: true,
            primaryColor: true,
            faviconUrl: true,
          },
        });
      });
      if (!tenant) {
        reply.code(404);
        return {
          success: false,
          error: { code: "tenant_not_found", status: 404, message: "Workspace not found." },
        };
      }
      return { success: true, data: tenant };
    },
  );
};

export default routes;
