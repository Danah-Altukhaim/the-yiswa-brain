import { Redis } from "ioredis";
import { env } from "./env.js";

function createRedis(): Redis {
  if (!env.REDIS_URL) {
    // Return a stub that no-ops for serverless environments without Redis
    return new Proxy({} as Redis, {
      get(_target, prop) {
        if (prop === "quit" || prop === "disconnect") return () => Promise.resolve();
        if (prop === "ping") return () => Promise.resolve("PONG");
        if (prop === "get") return () => Promise.resolve(null);
        if (prop === "set" || prop === "del" || prop === "incr") return () => Promise.resolve(0);
        if (prop === "status") return "ready";
        return () => Promise.resolve(null);
      },
    });
  }
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
}

export const redis = createRedis();
