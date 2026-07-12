import { hammingBytes } from "./hash";
import type { SqlDb } from "../db/sql";
import type { CardSummary, Language } from "../db/types";
import { getCardsByIds } from "../db/catalog";

export interface HashIndexEntry {
  cardId: string;
  hash: Uint8Array;
  language: Language;
}

/** Load the catalog's hash index into memory (~1 MB for 26k cards). */
export async function loadHashIndex(db: SqlDb): Promise<HashIndexEntry[]> {
  const rows = await db.all<{ card_id: string; phash: Uint8Array | null; language: string }>(
    `SELECT h.card_id, h.phash, c.language
     FROM catalog.card_hashes h
     JOIN catalog.cards c ON c.id = h.card_id
     WHERE h.phash IS NOT NULL`,
  );
  return rows
    .filter((r): r is typeof r & { phash: Uint8Array } => r.phash != null && r.phash.length === 32)
    .map((r) => ({
      cardId: r.card_id,
      hash: r.phash instanceof Uint8Array ? r.phash : new Uint8Array(r.phash as ArrayBufferLike),
      language: (r.language === "ja" ? "ja" : "en") as Language,
    }));
}

export interface MatchResult {
  cardId: string;
  /** 0–256; lower is closer. ≲60 is usually the same card photographed. */
  distance: number;
}

/** Linear scan of the index (fast: one XOR/popcount pass per card). */
export function matchHash(
  query: Uint8Array,
  index: HashIndexEntry[],
  opts: { topN?: number; language?: Language } = {},
): MatchResult[] {
  const topN = opts.topN ?? 5;
  const results: MatchResult[] = [];
  for (const entry of index) {
    if (opts.language && entry.language !== opts.language) continue;
    const distance = hammingBytes(query, entry.hash);
    results.push({ cardId: entry.cardId, distance });
  }
  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, topN);
}

export interface ScanCandidate extends MatchResult {
  card: CardSummary;
}

/** Match + join card summaries for display. */
export async function findCandidates(
  db: SqlDb,
  query: Uint8Array,
  index: HashIndexEntry[],
  opts: { topN?: number; language?: Language } = {},
): Promise<ScanCandidate[]> {
  const matches = matchHash(query, index, opts);
  const cards = await getCardsByIds(db, matches.map((m) => m.cardId));
  const byId = new Map(cards.map((c) => [c.id, c]));
  return matches
    .filter((m) => byId.has(m.cardId))
    .map((m) => ({ ...m, card: byId.get(m.cardId)! }));
}
