import {
  addCollectionItem,
  deleteCollectionItem,
  getCollectionCounts,
  getCollectionItem,
  getItemsForCard,
  getStorageLocations,
  listCollection,
  updateCollectionItem,
} from "../collection";
import { createTestDb, type NodeSqlDb } from "../../testing/nodeDb";

const CARDS = [
  { id: "en:sv8-1", setId: "en:sv8", number: "1/191", name: "Exeggcute", setName: "Surging Sparks" },
  { id: "en:sv8-57", setId: "en:sv8", number: "57/191", name: "Pikachu ex", setName: "Surging Sparks", rarity: "Double Rare" },
  { id: "ja:SV11B-1", setId: "ja:SV11B", number: "001", name: "Snivy", nameLocal: "ツタージャ", language: "ja" as const, setName: "Black Bolt" },
];
const SETS = [
  { id: "en:sv8", name: "Surging Sparks", total: 191 },
  { id: "ja:SV11B", name: "Black Bolt", language: "ja" as const, total: 86 },
];

describe("collection DAO", () => {
  let db: NodeSqlDb;

  beforeEach(async () => {
    db = await createTestDb(CARDS, SETS);
  });
  afterEach(() => db.close());

  it("adds and reads back an item with defaults", async () => {
    const id = await addCollectionItem(db, { cardId: "en:sv8-57" });
    const item = await getCollectionItem(db, id);
    expect(item).toMatchObject({
      cardId: "en:sv8-57",
      quantity: 1,
      condition: "NM",
      variant: "normal",
      language: "en",
      isGraded: false,
    });
    expect(item?.createdAt).toBeTruthy();
  });

  it("stores graded card details", async () => {
    const id = await addCollectionItem(db, {
      cardId: "en:sv8-57",
      isGraded: true,
      gradeCompany: "PSA",
      gradeValue: 10,
      certNumber: "12345678",
      valueOverride: 250,
    });
    const item = await getCollectionItem(db, id);
    expect(item?.isGraded).toBe(true);
    expect(item?.gradeCompany).toBe("PSA");
    expect(item?.gradeValue).toBe(10);
    expect(item?.valueOverride).toBe(250);
  });

  it("updates fields and bumps updated_at", async () => {
    const id = await addCollectionItem(db, { cardId: "en:sv8-1" });
    await updateCollectionItem(db, id, { quantity: 4, condition: "LP", storageLocation: "Binder A" });
    const item = await getCollectionItem(db, id);
    expect(item?.quantity).toBe(4);
    expect(item?.condition).toBe("LP");
    expect(item?.storageLocation).toBe("Binder A");
  });

  it("lists collection joined with catalog data", async () => {
    await addCollectionItem(db, { cardId: "en:sv8-57", quantity: 2 });
    await addCollectionItem(db, { cardId: "ja:SV11B-1", language: "ja" });
    const all = await listCollection(db);
    expect(all).toHaveLength(2);
    const pika = all.find((e) => e.cardId === "en:sv8-57");
    expect(pika?.cardName).toBe("Pikachu ex");
    expect(pika?.setName).toBe("Surging Sparks");

    const jaOnly = await listCollection(db, { language: "ja" });
    expect(jaOnly).toHaveLength(1);
    expect(jaOnly[0].cardName).toBe("Snivy");
  });

  it("counts totals, distinct and graded", async () => {
    await addCollectionItem(db, { cardId: "en:sv8-57", quantity: 3 });
    await addCollectionItem(db, { cardId: "en:sv8-57", isGraded: true, gradeCompany: "PSA", gradeValue: 9 });
    await addCollectionItem(db, { cardId: "en:sv8-1" });
    const counts = await getCollectionCounts(db);
    expect(counts.totalCards).toBe(5);
    expect(counts.distinctCards).toBe(2);
    expect(counts.gradedCards).toBe(1);
  });

  it("deletes items and tracks card copies", async () => {
    const a = await addCollectionItem(db, { cardId: "en:sv8-1" });
    await addCollectionItem(db, { cardId: "en:sv8-1", condition: "MP" });
    expect(await getItemsForCard(db, "en:sv8-1")).toHaveLength(2);
    await deleteCollectionItem(db, a);
    expect(await getItemsForCard(db, "en:sv8-1")).toHaveLength(1);
  });

  it("lists distinct storage locations", async () => {
    await addCollectionItem(db, { cardId: "en:sv8-1", storageLocation: "Binder A" });
    await addCollectionItem(db, { cardId: "en:sv8-57", storageLocation: "Box 1" });
    await addCollectionItem(db, { cardId: "ja:SV11B-1", storageLocation: "Binder A" });
    expect(await getStorageLocations(db)).toEqual(["Binder A", "Box 1"]);
  });
});
