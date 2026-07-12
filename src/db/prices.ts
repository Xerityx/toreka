import type { SqlDb } from "./sql";
import { withTransaction } from "./sql";
import type { PriceRow, PriceSource, CardVariant } from "./types";
import type { PriceUpdate } from "../data/providers/types";

/** Upsert latest prices and append today's price-history points. */
export async function storePriceUpdates(db: SqlDb, updates: PriceUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  await withTransaction(db, async () => {
    for (const u of updates) {
      await db.run(
        `INSERT INTO prices (card_id, source, variant, currency, market, low, mid, high, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (card_id, source, variant) DO UPDATE SET
           currency = excluded.currency, market = excluded.market, low = excluded.low,
           mid = excluded.mid, high = excluded.high, updated_at = excluded.updated_at`,
        [u.cardId, u.source, u.variant, u.currency, u.market, u.low, u.mid, u.high, now],
      );
      if (u.market != null) {
        await db.run(
          `INSERT INTO price_history (card_id, source, variant, date, market)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (card_id, source, variant, date) DO UPDATE SET market = excluded.market`,
          [u.cardId, u.source, u.variant, today, u.market],
        );
      }
    }
  });
}

interface Row {
  id: number;
  card_id: string;
  source: string;
  variant: string;
  currency: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  updated_at: string;
}

function mapRow(r: Row): PriceRow {
  return {
    id: r.id,
    cardId: r.card_id,
    source: r.source as PriceSource,
    variant: r.variant as CardVariant,
    currency: r.currency,
    market: r.market,
    low: r.low,
    mid: r.mid,
    high: r.high,
    updatedAt: r.updated_at,
  };
}

export async function getPricesForCard(db: SqlDb, cardId: string): Promise<PriceRow[]> {
  const rows = await db.all<Row>(
    `SELECT id, card_id, source, variant, currency, market, low, mid, high, updated_at
     FROM prices WHERE card_id = ? ORDER BY source, variant`,
    [cardId],
  );
  return rows.map(mapRow);
}

export interface HistoryPoint {
  date: string;
  market: number;
}

export async function getPriceHistory(
  db: SqlDb,
  cardId: string,
  variant: CardVariant | null,
  days: number,
): Promise<HistoryPoint[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  if (variant) {
    return await db.all<HistoryPoint>(
      `SELECT date, market FROM price_history
       WHERE card_id = ? AND source = 'tcgplayer' AND variant = ? AND date >= ?
       ORDER BY date`,
      [cardId, variant, since],
    );
  }
  // No variant preference: take the highest-priced variant per day (usually holo).
  return await db.all<HistoryPoint>(
    `SELECT date, MAX(market) AS market FROM price_history
     WHERE card_id = ? AND source = 'tcgplayer' AND date >= ?
     GROUP BY date ORDER BY date`,
    [cardId, since],
  );
}

/**
 * Best USD market price per (card, variant) — used for portfolio valuation.
 * Returns a nested map cardId -> variant -> market.
 */
export async function getUsdMarketPrices(db: SqlDb): Promise<Map<string, Map<string, number>>> {
  const rows = await db.all<{ card_id: string; variant: string; market: number }>(
    `SELECT card_id, variant, market FROM prices
     WHERE source = 'tcgplayer' AND market IS NOT NULL`,
  );
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let inner = map.get(r.card_id);
    if (!inner) {
      inner = new Map();
      map.set(r.card_id, inner);
    }
    inner.set(r.variant, r.market);
  }
  return map;
}
