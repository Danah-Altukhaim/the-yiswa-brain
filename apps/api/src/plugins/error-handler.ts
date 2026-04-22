import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { captureError } from "../lib/sentry.js";

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({
        success: false,
        error: { code: err.code, message: err.message, status: err.status },
      });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: "VALIDATION", message: err.message, status: 400 },
      });
    }
    // Fastify plugins (rate-limit, multipart, etc.) throw errors with a
    // `statusCode` field. Honour it for 4xx so client errors don't masquerade as 500s.
    const statusCode =
      typeof (err as { statusCode?: number }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;

    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: (err as { code?: string }).code ?? "CLIENT_ERROR",
          message: err.message,
          status: statusCode,
        },
      });
    }

    req.log.error({ err }, "unhandled error");
    captureError(err, {
      requestId: req.id,
      route: req.routeOptions?.url,
      method: req.method,
      tenantId: req.tenantId,
    });
    return reply.status(statusCode).send({
      success: false,
      error: { code: "INTERNAL", message: "Internal server error", status: statusCode },
    });
  });
};

export default fp(plugin, { name: "error-handler" });
