/**
 * Fetch helpers for the catalog pipeline (Node 24, run via native type stripping).
 * Every response is cached on disk so re-runs are incremental and gentle on the
 * upstream services.
 */
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cachePath(url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const slug = url.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 80);
  return join(CACHE_DIR, `${slug}.${hash}.json`);
}

export interface FetchOptions {
  /** Delay before a network request (politeness), ms. */
  delayMs?: number;
  /** Skip the disk cache. */
  fresh?: boolean;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const file = cachePath(url);
  if (!opts.fresh && existsSync(file)) {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  }

  if (opts.delayMs) await sleep(opts.delayMs);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "toreka-catalog-pipeline/1.0 (personal collection app)" },
      });
      if (res.status === 404) throw new NotFoundError(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const data = (await res.json()) as T;
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(data));
      return data;
    } catch (e) {
      if (e instanceof NotFoundError) throw e;
      lastError = e;
      await sleep(1000 * attempt * attempt);
    }
  }
  throw lastError;
}

export class NotFoundError extends Error {
  constructor(url: string) {
    super(`404: ${url}`);
    this.name = "NotFoundError";
  }
}
