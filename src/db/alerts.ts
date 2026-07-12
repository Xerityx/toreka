import type { SqlDb } from "./sql";
import type { PriceAlert } from "./types";

export interface NewAlert {
  cardId: string;
  direction: "above" | "below";
  threshold: number;
}

export async function createAlert(db: SqlDb, alert: NewAlert): Promise<number> {
  const res = await db.run(
    `INSERT INTO price_alerts (card_id, direction, threshold, active, created_at)
     VALUES (?, ?, ?, 1, ?)`,
    [alert.cardId, alert.direction, alert.threshold, new Date().toISOString()],
  );
  return res.lastInsertRowId;
}

export async function deleteAlert(db: SqlDb, id: number): Promise<void> {
  await db.run("DELETE FROM price_alerts WHERE id = ?", [id]);
}

interface Row {
  id: number;
  card_id: string;
  direction: string;
  threshold: number;
  active: number;
  last_triggered_at: string | null;
  created_at: string;
}

function mapRow(r: Row): PriceAlert {
  return {
    id: r.id,
    cardId: r.card_id,
    direction: r.direction as "above" | "below",
    threshold: r.threshold,
    active: r.active === 1,
    lastTriggeredAt: r.last_triggered_at,
    createdAt: r.created_at,
  };
}

export async function getAlertsForCard(db: SqlDb, cardId: string): Promise<PriceAlert[]> {
  const rows = await db.all<Row>(
    `SELECT id, card_id, direction, threshold, active, last_triggered_at, created_at
     FROM price_alerts WHERE card_id = ? ORDER BY created_at DESC`,
    [cardId],
  );
  return rows.map(mapRow);
}

export interface TriggeredAlert {
  alert: PriceAlert;
  cardName: string;
  currentPrice: number;
}

/**
 * Evaluate all active alerts against the freshest USD market price.
 * Marks fired alerts (24h cool-down) and returns them for notification.
 */
export async function evaluateAlerts(db: SqlDb): Promise<TriggeredAlert[]> {
  const rows = await db.all<Row & { name: string | null; price: number | null }>(
    `SELECT a.id, a.card_id, a.direction, a.threshold, a.active, a.last_triggered_at, a.created_at,
            c.name,
            (SELECT MAX(p.market) FROM prices p
             WHERE p.card_id = a.card_id AND p.source = 'tcgplayer' AND p.market IS NOT NULL) AS price
     FROM price_alerts a
     LEFT JOIN catalog.cards c ON c.id = a.card_id
     WHERE a.active = 1`,
  );

  const now = Date.now();
  const triggered: TriggeredAlert[] = [];
  for (const r of rows) {
    if (r.price == null) continue;
    const hit = r.direction === "above" ? r.price >= r.threshold : r.price <= r.threshold;
    if (!hit) continue;
    if (r.last_triggered_at && now - Date.parse(r.last_triggered_at) < 24 * 3600_000) continue;
    await db.run("UPDATE price_alerts SET last_triggered_at = ? WHERE id = ?", [
      new Date(now).toISOString(),
      r.id,
    ]);
    triggered.push({
      alert: mapRow(r),
      cardName: r.name ?? r.card_id,
      currentPrice: r.price,
    });
  }
  return triggered;
}
