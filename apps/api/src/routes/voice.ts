import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { putObject } from "../services/r2.js";
import { transcribe } from "../services/whisper.js";
import { badRequest } from "../lib/errors.js";

const routes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.post("/transcribe", async (req) => {
    const file = await req.file();
    if (!file) throw badRequest("No audio");
    const buf = await file.toBuffer();
    if (buf.byteLength > 25 * 1024 * 1024) throw badRequest("Audio >25MB");

    const tenantId = req.tenantId!;
    const key = `${tenantId}/voice/${Date.now()}-${randomUUID()}.${file.filename.split(".").pop() ?? "webm"}`;
    await putObject(key, buf, file.mimetype);

    const language = (req.query as { lang?: "en" | "ar" }).lang;
    const text = await transcribe(buf, file.filename, language);

    const record = await req.withTenant(async (tx) => {
      const session = z
        .object({ sessionId: z.string().uuid() })
        .parse(req.query);
      return tx.voiceTranscript.create({
        data: {
          tenantId,
          chatSessionId: session.sessionId,
          audioR2Key: key,
          transcriptText: text,
          durationMs: 0, // client can PATCH with actual duration
        },
      });
    });

    return { success: true, data: { id: record.id, text, audio_r2_key: key } };
  });
};

export default routes;
