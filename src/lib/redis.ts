import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Singleton — reuse across hot reloads in dev
const globalForRedis = globalThis as unknown as { redis?: Redis };
export const redis = globalForRedis.redis ?? new Redis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Suppress connection errors in dev when Redis isn't running
redis.on("error", () => {});

/** Cache-aside: return cached value or compute + store. */
export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // Redis down — fall through to compute
  }

  const value = await compute();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Redis down — ignore
  }

  return value;
}

/** Invalidate all cache keys matching a pattern (e.g. org:*) */
export async function invalidate(pattern: string): Promise<void> {
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    // Redis down — ignore
  }
}
