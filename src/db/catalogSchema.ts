/**
 * DDL for the read-only catalog database (catalog.db).
 *
 * Built by pipeline/build-catalog.ts on the PC, published as a GitHub Release
 * asset, downloaded by the app on first launch, and ATTACHed as `catalog`.
 * Shared so the pipeline, the app, and tests agree on one schema.
 */
export const CATALOG_DDL = `
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE sets (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    code TEXT,
    name TEXT NOT NULL,
    series TEXT,
    language TEXT NOT NULL,
    release_date TEXT,
    printed_total INTEGER,
    total INTEGER,
    symbol_url TEXT,
    logo_url TEXT
  );
  CREATE INDEX idx_sets_lang ON sets(language, release_date);

  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    set_id TEXT NOT NULL,
    number TEXT NOT NULL,
    number_sort INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    name_local TEXT,
    supertype TEXT,
    subtypes TEXT,
    rarity TEXT,
    language TEXT NOT NULL,
    image_small TEXT,
    image_large TEXT,
    tcgplayer_id INTEGER,
    external_ids TEXT,
    attributes TEXT
  );
  CREATE INDEX idx_cards_set ON cards(set_id, number_sort);
  CREATE INDEX idx_cards_lang ON cards(language);

  -- English/romaji prefix search: names, set names, card numbers.
  CREATE VIRTUAL TABLE cards_fts USING fts5(
    card_id UNINDEXED, name, set_name, number,
    tokenize = 'unicode61', prefix = '2 3 4'
  );

  -- Japanese substring search (trigram works on CJK text without word breaks).
  CREATE VIRTUAL TABLE cards_fts_ja USING fts5(
    card_id UNINDEXED, text,
    tokenize = 'trigram'
  );

  -- Perceptual hashes for the scanner (filled by the image-hash pipeline step).
  CREATE TABLE card_hashes (
    card_id TEXT PRIMARY KEY,
    dhash INTEGER,
    phash BLOB
  );
`;

/** Parse a leading integer out of a card number for in-set ordering ("172/191" -> 172, "SV049" -> 49). */
export function numberSortKey(number: string): number {
  const m = number.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}
