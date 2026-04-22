import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => {
    const mods = await req.withTenant((tx) =>
      tx.module.findMany({ where: { isActive: true }, orderBy: { label: "asc" } }),
    );
    return { success: true, data: mods };
  });
};

export default routes;
