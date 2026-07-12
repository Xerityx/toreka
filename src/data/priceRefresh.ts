import { pokemonTcgIoProvider } from "./providers/pokemontcgio";
import type { PriceTarget } from "./providers/types";
import { evaluateAlerts, type TriggeredAlert } from "../db/alerts";
import { storePriceUpdates } from "../db/prices";
import { getSetting, setSetting, SETTING_KEYS } from "../db/settings";
import type { SqlDb } from "../db/sql";
import { writeDailySnapshotIfNeeded } from "../portfolio/valuation";

export interface RefreshResult {
  targetCount: number;
  updateCount: number;
  triggeredAlerts: TriggeredAlert[];
}

/** Cards worth pricing: everything owned + wishlisted (+ alerts). */
export async function gatherTargets(db: SqlDb): Promise<PriceTarget[]> {
  const rows = await db.all<{ id: string; external_ids: string | null }>(
    `SELECT DISTINCT c.id, c.external_ids
     FROM catalog.cards c
     WHERE c.id IN (
       SELECT card_id FROM collection_items
       UNION SELECT card_id FROM want_list
       UNION SELECT card_id FROM price_alerts WHERE active = 1
     )`,
  );
  return rows.map((r) => ({
    cardId: r.id,
    externalIds: r.external_ids ? (JSON.parse(r.external_ids) as Record<string, string>) : {},
  }));
}

/**
 * Refresh prices for the whole tracked collection, then evaluate alerts and
 * write the daily portfolio snapshot.
 */
export async function refreshPrices(db: SqlDb): Promise<RefreshResult> {
  const apiKey = (await getSetting(db, SETTING_KEYS.pokemonTcgIoApiKey)) ?? undefined;
  const targets = await gatherTargets(db);
  const supported = targets.filter((t) => pokemonTcgIoProvider.supports(t));

  const updates = await pokemonTcgIoProvider.fetchPrices(supported, apiKey);
  await storePriceUpdates(db, updates);

  const triggeredAlerts = await evaluateAlerts(db);
  await writeDailySnapshotIfNeeded(db, true);
  await setSetting(db, SETTING_KEYS.lastPriceRefresh, new Date().toISOString());

  return { targetCount: supported.length, updateCount: updates.length, triggeredAlerts };
}
