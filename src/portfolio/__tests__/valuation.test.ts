import { computePortfolio, getSnapshots, resolveUnitValue, writeDailySnapshotIfNeeded } from "../valuation";
import { storePriceUpdates } from "../../db/prices";
import { addCollectionItem } from "../../db/collection";
import { addSealedProduct } from "../../db/sealed";
import { createTestDb, type NodeSqlDb } from "../../testing/nodeDb";

const CARDS = [
  { id: "en:sv8-57", setId: "en:sv8", number: "57/191", name: "Pikachu ex", setName: "Surging Sparks" },
  { id: "en:sv8-58", setId: "en:sv8", number: "58/191", name: "Raichu", setName: "Surging Sparks" },
  { id: "ja:SV11B-24", setId: "ja:SV11B", number: "024", name: "ピカチュウ", nameLocal: "ピカチュウ", language: "ja" as const, setName: "Black Bolt" },
];
const SETS = [
  { id: "en:sv8", name: "Surging Sparks", total: 191 },
  { id: "ja:SV11B", name: "Black Bolt", language: "ja" as const, total: 86 },
];

describe("resolveUnitValue", () => {
  const prices = new Map([
    ["normal", 2.5],
    ["holofoil", 12.0],
  ]);

  it("prefers the manual override", () => {
    expect(resolveUnitValue({ valueOverride: 100, variant: "normal" }, prices)).toBe(100);
  });
  it("uses the exact variant match", () => {
    expect(resolveUnitValue({ valueOverride: null, variant: "holofoil" }, prices)).toBe(12.0);
  });
  it("falls back to a sole available variant", () => {
    const only = new Map([["holofoil", 9]]);
    expect(resolveUnitValue({ valueOverride: null, variant: "normal" }, only)).toBe(9);
  });
  it("returns null when ambiguous or missing", () => {
    expect(resolveUnitValue({ valueOverride: null, variant: "reverseHolofoil" }, prices)).toBeNull();
    expect(resolveUnitValue({ valueOverride: null, variant: "normal" }, undefined)).toBeNull();
  });
});

describe("computePortfolio", () => {
  let db: NodeSqlDb;
  beforeEach(async () => {
    db = await createTestDb(CARDS, SETS);
  });
  afterEach(() => db.close());

  it("computes totals from prices, overrides, and sealed products", async () => {
    await addCollectionItem(db, { cardId: "en:sv8-57", quantity: 2, variant: "holofoil", purchasePrice: 10 });
    await addCollectionItem(db, { cardId: "ja:SV11B-24", valueOverride: 40, purchasePrice: 25, language: "ja" });
    await addCollectionItem(db, { cardId: "en:sv8-58" }); // unpriced
    await addSealedProduct(db, { name: "SV8 Booster Box", purchasePrice: 90, currentValue: 130 });

    await storePriceUpdates(db, [
      { cardId: "en:sv8-57", source: "tcgplayer", variant: "holofoil", currency: "USD", market: 25, low: 20, mid: 24, high: 30 },
    ]);

    const p = await computePortfolio(db);
    expect(p.totalValue).toBe(2 * 25 + 40);
    expect(p.costBasis).toBe(2 * 10 + 25);
    expect(p.itemCount).toBe(4);
    expect(p.pricedCount).toBe(3);
    expect(p.unpricedCount).toBe(1);
    expect(p.byLanguage.en).toBe(50);
    expect(p.byLanguage.ja).toBe(40);
    expect(p.sealedValue).toBe(130);
    expect(p.sealedCost).toBe(90);
    expect(p.topItems[0]).toMatchObject({ cardId: "en:sv8-57", totalValue: 50 });
  });

  it("writes one snapshot per day including sealed value", async () => {
    await addCollectionItem(db, { cardId: "en:sv8-57", valueOverride: 10 });
    await addSealedProduct(db, { name: "Box", currentValue: 100 });

    expect(await writeDailySnapshotIfNeeded(db)).toBe(true);
    expect(await writeDailySnapshotIfNeeded(db)).toBe(false); // same day
    expect(await writeDailySnapshotIfNeeded(db, true)).toBe(true); // forced

    const snaps = await getSnapshots(db, 7);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].totalValue).toBe(110);
  });
});
