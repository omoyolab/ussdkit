import type { Session, SessionStore } from "../types.js";

/** The subset of a Redis client that ussdkit needs. Both ioredis and node-redis satisfy it. */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  /** ioredis style: `set(key, value, "EX", seconds)`. */
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
}

export interface NodeRedisLikeClient {
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  /** node-redis v4+ style: `set(key, value, { EX: seconds })`. */
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

export interface RedisStoreOptions {
  /** Key prefix. Default `ussdkit:session:`. */
  prefix?: string;
  /** Which `set` signature the client uses. Default `ioredis`. */
  client?: "ioredis" | "node-redis";
}

/**
 * Session store backed by any Redis client, so several server processes share sessions.
 *
 * @example
 * import Redis from "ioredis";
 * const store = createRedisStore(new Redis(process.env.REDIS_URL));
 *
 * @example
 * import { createClient } from "redis";
 * const store = createRedisStore(client, { client: "node-redis" });
 */
export function createRedisStore(
  client: RedisLikeClient | NodeRedisLikeClient,
  options: RedisStoreOptions = {},
): SessionStore {
  const prefix = options.prefix ?? "ussdkit:session:";
  const flavour = options.client ?? "ioredis";
  const key = (id: string): string => `${prefix}${id}`;

  return {
    async get(id) {
      const raw = await client.get(key(id));
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as Session;
      } catch {
        return undefined;
      }
    },
    async set(session, ttlSeconds) {
      const value = JSON.stringify(session);
      if (flavour === "node-redis") {
        await (client as NodeRedisLikeClient).set(key(session.id), value, { EX: ttlSeconds });
      } else {
        await (client as RedisLikeClient).set(key(session.id), value, "EX", ttlSeconds);
      }
    },
    async delete(id) {
      await client.del(key(id));
    },
  };
}
