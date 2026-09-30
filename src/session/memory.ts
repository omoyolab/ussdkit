import type { Session, SessionStore } from "../types.js";

interface Entry {
  session: Session;
  expiresAt: number;
}

/**
 * In-memory session store. Fine for development, tests and single-process apps.
 * Use `createRedisStore` when you run more than one server.
 */
export class MemoryStore implements SessionStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(id: string): Promise<Session | undefined> {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(id);
      return undefined;
    }
    return structuredClone(entry.session);
  }

  async set(session: Session, ttlSeconds: number): Promise<void> {
    this.entries.set(session.id, {
      session: structuredClone(session),
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  /** Number of live sessions. Expired ones are dropped lazily on `get`. */
  get size(): number {
    return this.entries.size;
  }

  /** Drops every expired session. Call it on an interval in long-running processes. */
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
