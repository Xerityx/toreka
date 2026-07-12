/**
 * Builds catalog.db — the read-only card database shipped to the app.
 *
 *   node pipeline/build-catalog.ts [--en-only | --ja-only]
 *
 * Downloads are cached in pipeline/.cache (delete it to force fresh data).
 * Output: pipeline/out/catalog.db + catalog.json (version manifest).
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { CATALOG_DDL, numberSortKey } from "../src/db/catalogSchema.ts";
import { loadEnglish } from "./lib/en-pokemontcgdata.ts";
import { loadJapanese } from "./lib/ja-tcgdex.ts";
import type { NormalCard, NormalSet } from "./lib/normalized.ts";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");
const DB_PATH = join(OUT_DIR, "catalog.db");

async function main() {
  const args = process.argv.slice(2);
  const enOnly = args.includes("--en-only");
  const jaOnly = args.includes("--ja-only");

  const sets: NormalSet[] = [];
  const cards: NormalCard[] = [];

  if (!jaOnly) {
    console.log("Loading English catalog (pokemon-tcg-data)...");
    const en = await loadEnglish();
    console.log(`  ${en.sets.length} sets, ${en.cards.length} cards`);
    sets.push(...en.sets);
    cards.push(...en.cards);
  }
  if (!enOnly) {
    console.log("Loading Japanese catalog (TCGdex)...");
    const ja = await loadJapanese();
    console.log(`  ${ja.sets.length} sets, ${ja.cards.length} cards`);
    sets.push(...ja.sets);
    cards.push(...ja.cards);
  }

  console.log("Writing catalog.db...");
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(DB_PATH, { force: true });
  rmSync(`${DB_PATH}-journal`, { force: true });

  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = MEMORY");
  db.exec(CATALOG_DDL);
  db.exec("BEGIN");

  db.prepare("INSERT INTO games (id, name) VALUES (?, ?)").run("pokemon", "Pokémon");

  const insertSet = db.prepare(
    `INSERT INTO sets (id, game_id, code, name, series, language, release_date,
                       printed_total, total, symbol_url, logo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const s of sets) {
    insertSet.run(
      s.id, s.gameId, s.code, s.name, s.series, s.language, s.releaseDate,
      s.printedTotal, s.total, s.symbolUrl, s.logoUrl,
    );
  }

  const insertCard = db.prepare(
    `INSERT INTO cards (id, game_id, set_id, number, number_sort, name, name_local,
                        supertype, subtypes, rarity, language, image_small, image_large,
                        tcgplayer_id, external_ids, attributes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(
    "INSERT INTO cards_fts (card_id, name, set_name, number) VALUES (?, ?, ?, ?)",
  );
  const insertFtsJa = db.prepare("INSERT INTO cards_fts_ja (card_id, text) VALUES (?, ?)");

  let skipped = 0;
  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.id)) {
      skipped++;
      continue;
    }
    seen.add(c.id);
    insertCard.run(
      c.id, c.gameId, c.setId, c.number, numberSortKey(c.number), c.name, c.nameLocal,
      c.supertype, c.subtypes ? JSON.stringify(c.subtypes) : null, c.rarity, c.language,
      c.imageSmall, c.imageLarge, c.tcgplayerId, JSON.stringify(c.externalIds),
      JSON.stringify(c.attributes),
    );
    insertFts.run(c.id, c.name, c.setName, c.number);
    if (c.nameLocal) insertFtsJa.run(c.id, `${c.nameLocal} ${c.setName} ${c.number}`);
  }

  const version = new Date().toISOString().slice(0, 10).replaceAll("-", ".");
  const builtAt = new Date().toISOString();
  const insertMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  insertMeta.run("version", version);
  insertMeta.run("built_at", builtAt);
  insertMeta.run("card_count", String(seen.size));
  insertMeta.run("set_count", String(sets.length));

  db.exec("COMMIT");
  db.exec("PRAGMA optimize");
  db.exec("VACUUM");
  db.close();

  const sizeMb = (statSync(DB_PATH).size / (1024 * 1024)).toFixed(1);
  const manifest = {
    version,
    builtAt,
    cardCount: seen.size,
    setCount: sets.length,
    sizeBytes: statSync(DB_PATH).size,
  };
  writeFileSync(join(OUT_DIR, "catalog.json"), JSON.stringify(manifest, null, 2));

  console.log(`Done: ${DB_PATH} (${sizeMb} MB) — ${seen.size} cards, ${sets.length} sets` +
    (skipped ? `, ${skipped} duplicate ids skipped` : ""));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
