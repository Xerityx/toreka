/**
 * Fills catalog.db's card_hashes table with perceptual hashes of every card
 * image. Run AFTER build-catalog.ts:
 *
 *   node pipeline/build-hashes.ts [--limit N]
 *
 * Images are cached in pipeline/.cache/images so re-runs only hash new cards.
 * Uses sharp for PNG/WebP decoding; hashing uses the same src/scanner/hash.ts
 * code the app runs on-device.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { dhash64, dhash256 } from "../src/scanner/hash.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(ROOT, "out", "catalog.db");
const IMG_CACHE = join(ROOT, ".cache", "images");

const CONCURRENCY = 8;

interface CardRow {
  id: string;
  image_small: string | null;
  image_large: string | null;
}

function cacheFile(id: string): string {
  return join(IMG_CACHE, id.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

async function download(url: string, dest: string): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "toreka-catalog-pipeline/1.0 (personal collection app)" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, buf);
      return buf;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * attempt * attempt));
    }
  }
  return null;
}

async function hashCard(card: CardRow): Promise<{ d64: bigint; d256: Uint8Array } | null> {
  const url = card.image_small ?? card.image_large;
  if (!url) return null;

  const file = cacheFile(card.id);
  let buf: Buffer | null = null;
  if (existsSync(file)) {
    buf = readFileSync(file);
  } else {
    buf = await download(url, file);
  }
  if (!buf || buf.length === 0) return null;

  try {
    // Decode + downscale + grayscale in native code, hash in shared TS.
    const { data, info } = await sharp(buf)
      .resize(128, 179, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const gray = new Float32Array(info.width * info.height);
    for (let i = 0; i < gray.length; i++) gray[i] = data[i];
    return {
      d64: dhash64(gray, info.width, info.height),
      d256: dhash256(gray, info.width, info.height),
    };
  } catch (e) {
    console.warn(`  decode failed for ${card.id}: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  mkdirSync(IMG_CACHE, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  const pending = db
    .prepare(
      `SELECT c.id, c.image_small, c.image_large
       FROM cards c
       LEFT JOIN card_hashes h ON h.card_id = c.id
       WHERE h.card_id IS NULL AND (c.image_small IS NOT NULL OR c.image_large IS NOT NULL)`,
    )
    .all() as unknown as CardRow[];

  const todo = pending.slice(0, limit === Infinity ? undefined : limit);
  console.log(`Hashing ${todo.length} card images (${pending.length} pending total)...`);

  const insert = db.prepare(
    "INSERT OR REPLACE INTO card_hashes (card_id, dhash, phash) VALUES (?, ?, ?)",
  );

  let done = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < todo.length) {
      const card = todo[cursor++];
      const result = await hashCard(card);
      if (result) {
        insert.run(card.id, result.d64, result.d256);
      } else {
        failed++;
      }
      done++;
      if (done % 500 === 0) {
        console.log(`  ${done}/${todo.length} (${failed} failed)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const total = db.prepare("SELECT COUNT(*) n FROM card_hashes").get() as { n: number };
  db.exec("PRAGMA optimize");
  db.close();
  console.log(`Done: ${done} processed, ${failed} failed, ${total.n} hashes total in catalog.db`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
