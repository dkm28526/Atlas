import { Redis } from "@upstash/redis";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * A tiny get/set cache, backed by whichever store is actually configured.
 *
 * City profiles never go stale in a way that matters for this app (a
 * restaurant closing doesn't invalidate the whole trip), so there is no TTL
 * here — a cached city stays cached. The point is cost control: generate a
 * city once, ever, then every later request for it — from anyone, on any
 * deploy — is free.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * Upstash Redis — a REST-based store, so it works the same from a serverless
 * function as from a long-running server, with no platform lock-in. This is
 * the backend used once UPSTASH_REDIS_REST_URL / _TOKEN are set (e.g. for a
 * real deploy); see README for setup.
 */
class UpstashCacheStore implements CacheStore {
  private redis: Redis;

  constructor() {
    this.redis = Redis.fromEnv();
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get<T>(key);
    return value ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.redis.set(key, value);
  }
}

/**
 * Local-dev fallback: one JSON file per key under .cache/. Zero setup, and
 * exactly what you want while iterating on a single machine — but it does
 * not survive a serverless deploy (fresh instance, empty disk), which is why
 * this is a fallback and not the default once real credentials exist.
 */
class FileCacheStore implements CacheStore {
  private dir: string;

  constructor() {
    this.dir = path.join(process.cwd(), ".cache");
  }

  private fileFor(key: string): string {
    // Keys are already slugs (city ids) in practice; strip anything that
    // isn't filename-safe defensively rather than trusting that.
    const safe = key.replace(/[^a-z0-9_-]/gi, "_");
    return path.join(this.dir, `${safe}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await readFile(this.fileFor(key), "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.fileFor(key), JSON.stringify(value, null, 2), "utf8");
  }
}

let store: CacheStore | null = null;

/**
 * The active cache store, chosen once per process: Upstash when credentials
 * are present (the deploy-ready path), a local file cache otherwise (the
 * zero-setup local-dev path). Same "upgrade automatically when configured"
 * pattern as the Claude API key in llm.ts.
 */
export function getCacheStore(): CacheStore {
  if (!store) {
    const hasUpstash = Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
    );
    store = hasUpstash ? new UpstashCacheStore() : new FileCacheStore();
  }
  return store;
}
