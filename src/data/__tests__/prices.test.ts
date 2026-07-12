import { mapApiCard } from "../providers/pokemontcgio";
import { getPriceHistory, getPricesForCard, storePriceUpdates } from "../../db/prices";
import { createAlert, evaluateAlerts, getAlertsForCard } from "../../db/alerts";
import { createTestDb, type NodeSqlDb } from "../../testing/nodeDb";

const CARDS = [
  { id: "en:sv8-57", setId: "en:sv8", number: "57/191", name: "Pikachu ex", setName: "Surging Sparks" },
];
const SETS = [{ id: "en:sv8", name: "Surging Sparks", total: 191 }];

describe("mapApiCard", () => {
  it("maps tcgplayer variants and cardmarket trend", () => {
    const updates = mapApiCard(
      {
        id: "sv8-57",
        tcgplayer: {
          prices: {
            holofoil: { low: 20, mid: 24, high: 40, market: 25.31 },
            reverseHolofoil: { low: 30, mid: 38, high: 60, market: 39.5 },
            weirdFutureVariant: { market: 1 },
          },
        },
        cardmarket: { prices: { trendPrice: 22.4, averageSellPrice: 21.9, lowPrice: 18 } },
      },
      "en:sv8-57",
    );

    const tcg = updates.filter((u) => u.source === "tcgplayer");
    expect(tcg).toHaveLength(2); // unknown variant key dropped
    expect(tcg.find((u) => u.variant === "holofoil")).toMatchObject({
      cardId: "en:sv8-57",
      market: 25.31,
      currency: "USD",
    });

    const cm = updates.find((u) => u.source === "cardmarket");
    expect(cm).toMatchObject({ market: 22.4, currency: "EUR" });
  });

  it("returns nothing for cards without price blocks", () => {
    expect(mapApiCard({ id: "x" }, "en:x")).toHaveLength(0);
  });
});

describe("price storage", () => {
  let db: NodeSqlDb;
  beforeEach(async () => {
    db = await createTestDb(CARDS, SETS);
  });
  afterEach(() => db.close());

  it("upserts latest prices and appends daily history", async () => {
    await storePriceUpdates(db, [
      { cardId: "en:sv8-57", source: "tcgplayer", variant: "holofoil", currency: "USD", market: 25, low: 20, mid: 24, high: 30 },
    ]);
    await storePriceUpdates(db, [
      { cardId: "en:sv8-57", source: "tcgplayer", variant: "holofoil", currency: "USD", market: 27, low: 21, mid: 25, high: 31 },
    ]);

    const prices = await getPricesForCard(db, "en:sv8-57");
    expect(prices).toHaveLength(1); // upserted, not duplicated
    expect(prices[0].market).toBe(27);

    const history = await getPriceHistory(db, "en:sv8-57", "holofoil", 7);
    expect(history).toHaveLength(1); // same day overwrites
    expect(history[0].market).toBe(27);
  });
});

describe("price alerts", () => {
  let db: NodeSqlDb;
  beforeEach(async () => {
    db = await createTestDb(CARDS, SETS);
  });
  afterEach(() => db.close());

  it("triggers above/below alerts with 24h cool-down", async () => {
    await createAlert(db, { cardId: "en:sv8-57", direction: "above", threshold: 24 });
    await createAlert(db, { cardId: "en:sv8-57", direction: "below", threshold: 10 });

    await storePriceUpdates(db, [
      { cardId: "en:sv8-57", source: "tcgplayer", variant: "holofoil", currency: "USD", market: 25, low: null, mid: null, high: null },
    ]);

    const first = await evaluateAlerts(db);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ cardName: "Pikachu ex", currentPrice: 25 });
    expect(first[0].alert.direction).toBe("above");

    // Cool-down: same alert doesn't fire twice in a day.
    expect(await evaluateAlerts(db)).toHaveLength(0);

    const alerts = await getAlertsForCard(db, "en:sv8-57");
    expect(alerts.find((a) => a.direction === "above")?.lastTriggeredAt).toBeTruthy();
    expect(alerts.find((a) => a.direction === "below")?.lastTriggeredAt).toBeNull();
  });
});
