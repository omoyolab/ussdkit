import { describe, expect, it, vi } from "vitest";

import { MemoryStore } from "../src/session/memory.js";
import { createRedisStore } from "../src/session/redis.js";
import type { Session } from "../src/types.js";

const session: Session = {
  id: "abc",
  phone: "+2348000000000",
  serviceCode: "*1#",
  screen: "home",
  history: [],
  data: { n: 1 },
  startedAt: 0,
  updatedAt: 0,
};

describe("MemoryStore", () => {
  it("stores copies and expires them", async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    await store.set(session, 10);
    const loaded = await store.get("abc");
    expect(loaded).toEqual(session);
    expect(loaded).not.toBe(session);
    loaded!.data.n = 2;
    expect((await store.get("abc"))!.data.n).toBe(1);
    now = 10_001;
    expect(await store.get("abc")).toBeUndefined();
  });

  it("deletes and sweeps", async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    await store.set(session, 1);
    await store.set({ ...session, id: "other" }, 100);
    expect(store.size).toBe(2);
    now = 5_000;
    expect(store.sweep()).toBe(1);
    expect(store.size).toBe(1);
    await store.delete("other");
    expect(store.size).toBe(0);
  });
});

describe("createRedisStore", () => {
  it("speaks ioredis by default", async () => {
    const data = new Map<string, string>();
    const client = {
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      set: vi.fn(async (k: string, v: string, _m: "EX", _s: number) => {
        data.set(k, v);
      }),
      del: vi.fn(async (k: string) => data.delete(k)),
    };
    const store = createRedisStore(client);
    await store.set(session, 30);
    expect(client.set).toHaveBeenCalledWith(
      "ussdkit:session:abc",
      JSON.stringify(session),
      "EX",
      30,
    );
    expect(await store.get("abc")).toEqual(session);
    await store.delete("abc");
    expect(await store.get("abc")).toBeUndefined();
  });

  it("speaks node-redis when asked and tolerates bad JSON", async () => {
    const client = {
      get: vi.fn(async () => "{not json"),
      set: vi.fn(async () => "OK"),
      del: vi.fn(async () => 1),
    };
    const store = createRedisStore(client, { client: "node-redis", prefix: "p:" });
    await store.set(session, 45);
    expect(client.set).toHaveBeenCalledWith("p:abc", JSON.stringify(session), { EX: 45 });
    expect(await store.get("abc")).toBeUndefined();
  });
});
