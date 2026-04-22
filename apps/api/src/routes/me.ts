import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";

const routes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.post("/walkthrough-complete", async (req) => {
    const userId = (req.user as { sub: string }).sub;
    await prisma.user.update({
      where: { id: userId },
      data: { walkthroughCompleted: true },
    });
    return { success: true, data: { walkthroughCompleted: true } };
  });

  app.get("/", async (req) => {
    const userId = (req.user as { sub: string }).sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, walkthroughCompleted: true },
    });
    return { success: true, data: user };
  });
};

export default routes;
