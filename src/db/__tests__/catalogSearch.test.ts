import { addCollectionItem } from "../collection";
import { buildFtsQuery, getCard, getSetCards, getSets, searchCards } from "../catalog";
import { createTestDb, type NodeSqlDb } from "../../testing/nodeDb";

const CARDS = [
  { id: "en:sv8-57", setId: "en:sv8", number: "57/191", name: "Pikachu ex", setName: "Surging Sparks", rarity: "Double Rare" },
  { id: "en:sv8-58", setId: "en:sv8", number: "58/191", name: "Raichu", setName: "Surging Sparks" },
  { id: "en:sv8-4", setId: "en:sv8", number: "4/191", name: "Exeggutor", setName: "Surging Sparks" },
  { id: "en:base1-58", setId: "en:base1", number: "58/102", name: "Pikachu", setName: "Base Set", rarity: "Common" },
  { id: "ja:SV11B-24", setId: "ja:SV11B", number: "024", name: "Pikachu", nameLocal: "ピカチュウ", language: "ja" as const, setName: "Black Bolt" },
];
const SETS = [
  { id: "en:sv8", name: "Surging Sparks", total: 191 },
  { id: "en:base1", name: "Base Set", total: 102 },
  { id: "ja:SV11B", name: "Black Bolt", language: "ja" as const, total: 86 },
];

describe("buildFtsQuery", () => {
  it("quotes and prefixes tokens", () => {
    expect(buildFtsQuery("pika")).toBe('"pika"*');
    expect(buildFtsQuery("surging spark")).toBe('"surging"* "spark"*');
  });
  it("escapes embedded quotes", () => {
    expect(buildFtsQuery('pi"ka')).toBe('"pi""ka"*');
  });
});

describe("searchCards", () => {
  let db: NodeSqlDb;
  beforeEach(async () => {
    db = await createTestDb(CARDS, SETS);
  });
  afterEach(() => db.close());

  it("finds cards by name prefix via FTS", async () => {
    const results = await searchCards(db, { query: "pika", ftsAvailable: true });
    const names = results.map((r) => r.name);
    expect(names).toContain("Pikachu ex");
    expect(names).toContain("Pikachu");
    expect(names).not.toContain("Raichu");
  });

  it("finds Japanese cards by trigram substring", async () => {
    const results = await searchCards(db, { query: "カチュウ", ftsAvailable: true });
    expect(results.map((r) => r.id)).toContain("ja:SV11B-24");
  });

  it("falls back to LIKE for short CJK queries", async () => {
    const results = await searchCards(db, { query: "ピカ", ftsAvailable: true });
    expect(results.map((r) => r.id)).toContain("ja:SV11B-24");
  });

  it("falls back to LIKE when FTS unavailable", async () => {
    const results = await searchCards(db, { query: "pikachu", ftsAvailable: false });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("applies language and set filters", async () => {
    const jaOnly = await searchCards(db, { query: "pika", language: "ja", ftsAvailable: true });
    expect(jaOnly.every((r) => r.language === "ja")).toBe(true);

    const sv8Only = await searchCards(db, { query: "pika", setId: "en:sv8", ftsAvailable: true });
    expect(sv8Only.map((r) => r.id)).toEqual(["en:sv8-57"]);
  });

  it("returns owned quantities and supports ownedOnly", async () => {
    await addCollectionItem(db, { cardId: "en:base1-58", quantity: 3 });
    const all = await searchCards(db, { query: "pikachu", ftsAvailable: true });
    const base = all.find((r) => r.id === "en:base1-58");
    expect(base?.ownedQuantity).toBe(3);

    const owned = await searchCards(db, { query: "pikachu", ownedOnly: true, ftsAvailable: true });
    expect(owned.map((r) => r.id)).toEqual(["en:base1-58"]);
  });

  it("matches by card number", async () => {
    const results = await searchCards(db, { query: "57", ftsAvailable: true });
    expect(results.map((r) => r.id)).toContain("en:sv8-57");
  });
});

describe("set browsing", () => {
  let db: NodeSqlDb;
  beforeEach(async () => {
    db = await createTestDb(CARDS, SETS);
  });
  afterEach(() => db.close());

  it("lists sets with owned progress", async () => {
    await addCollectionItem(db, { cardId: "en:sv8-57" });
    await addCollectionItem(db, { cardId: "en:sv8-57", condition: "LP" }); // same card, still 1 distinct
    await addCollectionItem(db, { cardId: "en:sv8-58" });
    const sets = await getSets(db, "en");
    const sv8 = sets.find((s) => s.id === "en:sv8");
    expect(sv8?.ownedCount).toBe(2);
    expect(sv8?.total).toBe(191);
  });

  it("orders set cards by number", async () => {
    const cards = await getSetCards(db, "en:sv8");
    expect(cards.map((c) => c.number)).toEqual(["4/191", "57/191", "58/191"]);
  });

  it("returns full card detail", async () => {
    const card = await getCard(db, "ja:SV11B-24");
    expect(card?.name).toBe("Pikachu");
    expect(card?.nameLocal).toBe("ピカチュウ");
    expect(card?.setName).toBe("Black Bolt");
  });
});
