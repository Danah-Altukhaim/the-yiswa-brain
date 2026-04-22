import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { translate } from "../services/translate.js";

const routes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.post("/", async (req) => {
    const body = z
      .object({
        text: z.string().min(1).max(8000),
        target: z.enum(["en", "ar"]),
      })
      .parse(req.body);
    const translated = await translate(body.text, body.target);
    return { success: true, data: { translated } };
  });
};

export default routes;
