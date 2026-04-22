import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { unauthorized } from "../lib/errors.js";

/**
 * API key auth for the public REST API (bot).
 * Header: `Authorization: Bearer tb_live_<key>`. Stored as sha256 hash.
 */
const plugin: FastifyPluginAsync = async (app) => {
  app.decorate("apiKeyAuth", async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized("Missing API key");
    const token = header.slice(7);
    if (!token.startsWith("tb_live_")) throw unauthorized("Invalid key format");
    const hash = createHash("sha256").update(token).digest("hex");

    // Pre-auth lookup: must bypass RLS since we don't know the tenant yet.
    const key = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_admin = 'true'`);
      return tx.apiKey.findUnique({ where: { keyHash: hash } });
    });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) {
      throw unauthorized("Invalid API key");
    }

    req.tenantId = key.tenantId;
    req.apiKeyScopes = key.scopes;

    // Best-effort last-used update, wrapped in a tenant-scoped tx.
    prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${key.tenantId}, true)`;
        await tx.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
      })
      .catch((err) => req.log.warn({ err }, "api-key lastUsedAt update failed"));
  });
};

declare module "fastify" {
  interface FastifyInstance {
    apiKeyAuth: (req: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    apiKeyScopes?: string[];
  }
}

export default fp(plugin, { name: "api-key" });
