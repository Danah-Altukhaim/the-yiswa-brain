import { redis } from "../lib/redis.js";

const DEFAULT_TTL = 60;
const FALLBACK_TTL = 24 * 60 * 60;

/** Write a snapshot to the emergency fallback keyspace. 24h TTL, separate from live cache. */
export async function writeFallback(tenantId: string, payload: unknown) {
  await redis.set(`kb_fallback:${tenantId}`, JSON.stringify(payload), "EX", FALLBACK_TTL);
}

export async function readFallback<T>(tenantId: string): Promise<T | null> {
  const raw = await redis.get(`kb_fallback:${tenantId}`);
  return raw ? (JSON.parse(raw) as T) : null;
}

/** Tenant-scoped version counter. Incremented on every write. */
export async function bumpVersion(tenantId: string, module?: string): Promise<number> {
  const key = module ? `ver:${tenantId}:${module}` : `ver:${tenantId}`;
  return redis.incr(key);
}

export async function currentVersion(tenantId: string, module?: string): Promise<number> {
  const key = module ? `ver:${tenantId}:${module}` : `ver:${tenantId}`;
  const v = await redis.get(key);
  return v ? parseInt(v, 10) : 0;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function cacheSet<T>(key: string, value: T, ttl = DEFAULT_TTL): Promise<void> {
  await redis.set(key, JSON.stringify(value), "EX", ttl);
}

/** Single-flight: first caller computes, others wait for result. */
export async function withSingleFlight<T>(
  key: string,
  compute: () => Promise<T>,
  ttl = DEFAULT_TTL,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached) return cached;

  const lockKey = `${key}:lock`;
  const got = await redis.set(lockKey, "1", "EX", 5, "NX");
  if (got) {
    try {
      const value = await compute();
      await cacheSet(key, value, ttl);
      return value;
    } finally {
      await redis.del(lockKey);
    }
  }
  // Lost the race; poll briefly for populated cache
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const cached2 = await cacheGet<T>(key);
    if (cached2) return cached2;
  }
  return compute();
}
