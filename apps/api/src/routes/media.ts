import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { putObject, presignedGet } from "../services/r2.js";
import { badRequest } from "../lib/errors.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const routes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.post("/upload", async (req) => {
    const file = await req.file();
    if (!file) throw badRequest("No file");
    if (!ALLOWED.has(file.mimetype)) throw badRequest(`Disallowed type ${file.mimetype}`);
    const buf = await file.toBuffer();
    if (buf.byteLength > 10 * 1024 * 1024) throw badRequest("File >10MB");

    const tenantId = req.tenantId!;
    const userId = (req.user as { sub: string } | undefined)?.sub;
    const key = `${tenantId}/media/${Date.now()}-${randomUUID()}-${file.filename}`;
    await putObject(key, buf, file.mimetype);

    const record = await req.withTenant((tx) =>
      tx.media.create({
        data: {
          tenantId,
          filename: file.filename,
          mimeType: file.mimetype,
          r2Key: key,
          sizeBytes: buf.byteLength,
          uploadedBy: userId,
        },
      }),
    );
    return { success: true, data: { id: record.id, filename: record.filename } };
  });

  app.get("/:id/url", async (req) => {
    const { id } = req.params as { id: string };
    const media = await req.withTenant((tx) => tx.media.findUnique({ where: { id } }));
    if (!media) return { success: false, error: { code: "NOT_FOUND", message: "media", status: 404 } };
    const url = await presignedGet(media.r2Key);
    return { success: true, data: { url } };
  });
};

export default routes;
