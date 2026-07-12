import { getUsdMarketPrices } from "../db/prices";
import { getSealedTotals } from "../db/sealed";
import { getSetting, setSetting, SETTING_KEYS } from "../db/settings";
import type { SqlDb } from "../db/sql";

/**
 * Resolve the USD unit value of one collection item.
 * Precedence: manual override → exact-variant market → sole available variant.
 */
export function resolveUnitValue(
  item: { valueOverride: number | null; variant: string },
  cardPrices: Map<string, number> | undefined,
): number | null {
  if (item.valueOverride != null) return item.valueOverride;
  if (!cardPrices || cardPrices.size === 0) return null;
  const exact = cardPrices.get(item.variant);
  if (exact != null) return exact;
  if (cardPrices.size === 1) return [...cardPrices.values()][0];
  return null;
}

export interface TopItem {
  cardId: string;
  name: string;
  setName: string;
  imageSmall: string | null;
  quantity: number;
  unitValue: number;
  totalValue: number;
  isGraded: boolean;
  gradeLabel: string | null;
}

export interface PortfolioSummary {
  totalValue: number;
  costBasis: number;
  itemCount: number;
  pricedCount: number;
  unpricedCount: number;
  byLanguage: { en: number; ja: number };
  sealedValue: number;
  sealedCost: number;
  topItems: TopItem[];
}

interface ItemRow {
  card_id: string;
  quantity: number;
  variant: string;
  language: string;
  value_override: number | null;
  purchase_price: number | null;
  is_graded: number;
  grade_company: string | null;
  grade_value: number | null;
  name: string | null;
  setName: string | null;
  imageSmall: string | null;
}

export async function computePortfolio(db: SqlDb, topN = 5): Promise<PortfolioSummary> {
  const items = await db.all<ItemRow>(
    `SELECT ci.card_id, ci.quantity, ci.variant, ci.language, ci.value_override,
            ci.purchase_price, ci.is_graded, ci.grade_company, ci.grade_value,
            c.name, s.name AS setName, c.image_small AS imageSmall
     FROM collection_items ci
     LEFT JOIN catalog.cards c ON c.id = ci.card_id
     LEFT JOIN catalog.sets s ON s.id = c.set_id`,
  );
  const prices = await getUsdMarketPrices(db);
  const sealed = await getSealedTotals(db);

  let totalValue = 0;
  let costBasis = 0;
  let itemCount = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  const byLanguage = { en: 0, ja: 0 };
  const tops: TopItem[] = [];

  for (const item of items) {
    itemCount += item.quantity;
    costBasis += (item.purchase_price ?? 0) * item.quantity;
    const unit = resolveUnitValue(
      { valueOverride: item.value_override, variant: item.variant },
      prices.get(item.card_id),
    );
    if (unit == null) {
      unpricedCount += item.quantity;
      continue;
    }
    pricedCount += item.quantity;
    const total = unit * item.quantity;
    totalValue += total;
    byLanguage[item.language === "ja" ? "ja" : "en"] += total;
    tops.push({
      cardId: item.card_id,
      name: item.name ?? item.card_id,
      setName: item.setName ?? "",
      imageSmall: item.imageSmall,
      quantity: item.quantity,
      unitValue: unit,
      totalValue: total,
      isGraded: item.is_graded === 1,
      gradeLabel:
        item.is_graded === 1
          ? `${item.grade_company ?? ""} ${item.grade_value ?? ""}`.trim() || null
          : null,
    });
  }

  tops.sort((a, b) => b.totalValue - a.totalValue);

  return {
    totalValue,
    costBasis,
    itemCount,
    pricedCount,
    unpricedCount,
    byLanguage,
    sealedValue: sealed.value,
    sealedCost: sealed.costBasis,
    topItems: tops.slice(0, topN),
  };
}

export interface SnapshotPoint {
  date: string;
  totalValue: number;
  costBasis: number;
}

/** Write today's snapshot once per day (called on app open / after refresh). */
export async function writeDailySnapshotIfNeeded(db: SqlDb, force = false): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const last = await getSetting(db, SETTING_KEYS.lastSnapshotDate);
  if (!force && last === today) return false;

  const summary = await computePortfolio(db, 0);
  await db.run(
    `INSERT INTO portfolio_snapshots (date, game_id, total_value, cost_basis, item_count, sealed_value)
     VALUES (?, 'pokemon', ?, ?, ?, ?)
     ON CONFLICT (date, game_id) DO UPDATE SET
       total_value = excluded.total_value, cost_basis = excluded.cost_basis,
       item_count = excluded.item_count, sealed_value = excluded.sealed_value`,
    [
      today,
      summary.totalValue + summary.sealedValue,
      summary.costBasis + summary.sealedCost,
      summary.itemCount,
      summary.sealedValue,
    ],
  );
  await setSetting(db, SETTING_KEYS.lastSnapshotDate, today);
  return true;
}

export async function getSnapshots(db: SqlDb, days: number): Promise<SnapshotPoint[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  return await db.all<SnapshotPoint>(
    `SELECT date, total_value AS totalValue, cost_basis AS costBasis
     FROM portfolio_snapshots WHERE game_id = 'pokemon' AND date >= ?
     ORDER BY date`,
    [since],
  );
}
