import type { SqlDb, SqlParam } from "./sql";
import type { CardSummary, CatalogCard, CatalogSet, Language } from "./types";

/**
 * Read-only queries against the attached catalog database, joined with the
 * user's collection for owned counts.
 */

const CARD_SUMMARY_SELECT = `
  SELECT c.id, c.name, c.name_local AS nameLocal, c.number, c.rarity, c.language,
         c.image_small AS imageSmall, c.set_id AS setId, s.name AS setName, s.code AS setCode,
         COALESCE(o.qty, 0) AS ownedQuantity
  FROM catalog.cards c
  JOIN catalog.sets s ON s.id = c.set_id
  LEFT JOIN (
    SELECT card_id, SUM(quantity) AS qty FROM collection_items GROUP BY card_id
  ) o ON o.card_id = c.id
`;

export interface SearchOptions {
  query: string;
  /** Restrict to a language; omit for all. */
  language?: Language;
  setId?: string;
  rarity?: string;
  ownedOnly?: boolean;
  limit?: number;
  /** From TorekaDb.ftsAvailable — falls back to LIKE when false. */
  ftsAvailable: boolean;
}

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿]/;

/** Build an FTS5 prefix query: each token quoted, prefix-matched. */
export function buildFtsQuery(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" ");
}

function filterClauses(opts: SearchOptions, params: SqlParam[]): string {
  let sql = "";
  if (opts.language) {
    sql += " AND c.language = ?";
    params.push(opts.language);
  }
  if (opts.setId) {
    sql += " AND c.set_id = ?";
    params.push(opts.setId);
  }
  if (opts.rarity) {
    sql += " AND c.rarity = ?";
    params.push(opts.rarity);
  }
  if (opts.ownedOnly) {
    sql += " AND COALESCE(o.qty, 0) > 0";
  }
  return sql;
}

export async function searchCards(db: SqlDb, opts: SearchOptions): Promise<CardSummary[]> {
  const q = opts.query.trim();
  if (!q) return [];
  const limit = opts.limit ?? 30;

  const results: CardSummary[] = [];
  const seen = new Set<string>();

  const push = (rows: CardSummary[]) => {
    for (const r of rows) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        results.push(r);
      }
    }
  };

  const isCjk = CJK_RE.test(q);

  if (opts.ftsAvailable) {
    // Primary: unicode61 FTS with prefix matching (names, set names, numbers).
    const params: SqlParam[] = [];
    let sql = `${CARD_SUMMARY_SELECT}
      JOIN catalog.cards_fts f ON f.card_id = c.id
      WHERE f.cards_fts MATCH ?`;
    params.push(buildFtsQuery(q));
    // bm25 weights per column (card_id, name, set_name, number): prioritize name hits.
    sql += " AND rank MATCH 'bm25(0.0, 10.0, 2.0, 5.0)'";
    sql += filterClauses(opts, params);
    sql += " ORDER BY rank LIMIT ?";
    params.push(limit);
    push(await db.all<CardSummary>(sql, params));

    // Japanese substring search via the trigram index (needs >= 3 chars).
    if (isCjk && q.length >= 3 && results.length < limit) {
      const params2: SqlParam[] = [];
      let sql2 = `${CARD_SUMMARY_SELECT}
        JOIN catalog.cards_fts_ja fj ON fj.card_id = c.id
        WHERE fj.cards_fts_ja MATCH ?`;
      params2.push(`"${q.replace(/"/g, '""')}"`);
      sql2 += filterClauses(opts, params2);
      sql2 += " ORDER BY fj.rank LIMIT ?";
      params2.push(limit - results.length);
      push(await db.all<CardSummary>(sql2, params2));
    }
  }

  // LIKE fallback: no FTS available, short CJK queries, or FTS found nothing.
  if (results.length === 0) {
    const params: SqlParam[] = [];
    const like = `%${q.replace(/[%_]/g, " ")}%`;
    let sql = `${CARD_SUMMARY_SELECT}
      WHERE (c.name LIKE ? OR c.name_local LIKE ? OR c.number LIKE ?)`;
    params.push(like, like, `${q}%`);
    sql += filterClauses(opts, params);
    sql += " ORDER BY c.name LIMIT ?";
    params.push(limit);
    push(await db.all<CardSummary>(sql, params));
  }

  return results.slice(0, limit);
}

export interface SetWithProgress extends CatalogSet {
  ownedCount: number;
}

export async function getSets(db: SqlDb, language?: Language): Promise<SetWithProgress[]> {
  const params: SqlParam[] = [];
  let where = "";
  if (language) {
    where = "WHERE s.language = ?";
    params.push(language);
  }
  return await db.all<SetWithProgress>(
    `
    SELECT s.id, s.game_id AS gameId, s.code, s.name, s.series, s.language,
           s.release_date AS releaseDate, s.printed_total AS printedTotal, s.total,
           s.symbol_url AS symbolUrl, s.logo_url AS logoUrl,
           COALESCE(oc.owned, 0) AS ownedCount
    FROM catalog.sets s
    LEFT JOIN (
      SELECT c.set_id, COUNT(DISTINCT c.id) AS owned
      FROM catalog.cards c
      JOIN collection_items ci ON ci.card_id = c.id
      GROUP BY c.set_id
    ) oc ON oc.set_id = s.id
    ${where}
    ORDER BY s.release_date DESC, s.name
    `,
    params,
  );
}

export async function getSet(db: SqlDb, setId: string): Promise<CatalogSet | null> {
  return await db.get<CatalogSet>(
    `SELECT id, game_id AS gameId, code, name, series, language,
            release_date AS releaseDate, printed_total AS printedTotal, total,
            symbol_url AS symbolUrl, logo_url AS logoUrl
     FROM catalog.sets WHERE id = ?`,
    [setId],
  );
}

export async function getSetCards(db: SqlDb, setId: string): Promise<CardSummary[]> {
  return await db.all<CardSummary>(
    `${CARD_SUMMARY_SELECT} WHERE c.set_id = ? ORDER BY c.number_sort, c.number`,
    [setId],
  );
}

export interface CardDetail extends CatalogCard {
  setName: string;
  setCode: string | null;
  setReleaseDate: string | null;
  setPrintedTotal: number | null;
  ownedQuantity: number;
}

export async function getCard(db: SqlDb, cardId: string): Promise<CardDetail | null> {
  return await db.get<CardDetail>(
    `
    SELECT c.id, c.game_id AS gameId, c.set_id AS setId, c.number, c.name,
           c.name_local AS nameLocal, c.supertype, c.subtypes, c.rarity, c.language,
           c.image_small AS imageSmall, c.image_large AS imageLarge,
           c.tcgplayer_id AS tcgplayerId, c.external_ids AS externalIds, c.attributes,
           s.name AS setName, s.code AS setCode, s.release_date AS setReleaseDate,
           s.printed_total AS setPrintedTotal,
           COALESCE(o.qty, 0) AS ownedQuantity
    FROM catalog.cards c
    JOIN catalog.sets s ON s.id = c.set_id
    LEFT JOIN (
      SELECT card_id, SUM(quantity) AS qty FROM collection_items GROUP BY card_id
    ) o ON o.card_id = c.id
    WHERE c.id = ?
    `,
    [cardId],
  );
}

export async function getCardsByIds(db: SqlDb, ids: string[]): Promise<CardSummary[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return await db.all<CardSummary>(
    `${CARD_SUMMARY_SELECT} WHERE c.id IN (${placeholders})`,
    ids,
  );
}

export interface CatalogMeta {
  version: string | null;
  builtAt: string | null;
  cardCount: number;
  setCount: number;
}

export async function getCatalogMeta(db: SqlDb): Promise<CatalogMeta> {
  const version = await db.get<{ value: string }>(
    "SELECT value FROM catalog.meta WHERE key = 'version'",
  );
  const builtAt = await db.get<{ value: string }>(
    "SELECT value FROM catalog.meta WHERE key = 'built_at'",
  );
  const cards = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM catalog.cards");
  const sets = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM catalog.sets");
  return {
    version: version?.value ?? null,
    builtAt: builtAt?.value ?? null,
    cardCount: cards?.n ?? 0,
    setCount: sets?.n ?? 0,
  };
}
