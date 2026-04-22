import { redis } from "../lib/redis.js";

/** Transient chat turns (last 10) in Redis, tenant-scoped. Durable summary lives in chat_sessions. */
const TTL_SECONDS = 24 * 60 * 60;

export type Turn = { role: "user" | "assistant"; content: string; at: number };

const key = (tenantId: string, sessionId: string) => `chat:${tenantId}:${sessionId}`;

export async function appendTurn(tenantId: string, sessionId: string, turn: Turn) {
  const k = key(tenantId, sessionId);
  await redis.rpush(k, JSON.stringify(turn));
  await redis.ltrim(k, -20, -1);
  await redis.expire(k, TTL_SECONDS);
}

export async function getTurns(tenantId: string, sessionId: string): Promise<Turn[]> {
  const raw = await redis.lrange(key(tenantId, sessionId), 0, -1);
  return raw.map((s: string) => JSON.parse(s) as Turn);
}
