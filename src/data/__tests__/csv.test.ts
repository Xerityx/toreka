import { exportCollectionCsv, importCollectionRows, parseCollectionCsv } from "../csv";
import { addCollectionItem, listCollection } from "../../db/collection";
import { createTestDb, type NodeSqlDb } from "../../testing/nodeDb";

const CARDS = [
  { id: "en:sv8-57", setId: "en:sv8", number: "57/191", name: "Pikachu ex", setName: "Surging Sparks", rarity: "Double Rare" },
  { id: "en:sv8-58", setId: "en:sv8", number: "58/191", name: "Raichu", setName: "Surging Sparks" },
  { id: "en:base1-58", setId: "en:base1", number: "58", name: "Pikachu", setName: "Base Set" },
];
const SETS = [
  { id: "en:sv8", name: "Surging Sparks", total: 191 },
  { id: "en:base1", name: "Base Set", total: 102 },
];

describe("CSV round-trip", () => {
  let db: NodeSqlDb;
  beforeEach(async () => {
    db = await createTestDb(CARDS, SETS);
  });
  afterEach(() => db.close());

  it("exports and re-imports losslessly", async () => {
    await addCollectionItem(db, {
      cardId: "en:sv8-57",
      quantity: 2,
      condition: "LP",
      variant: "holofoil",
      purchasePrice: 45.5,
      purchaseDate: "2026-01-15",
      storageLocation: "Binder A",
      notes: 'has a "whitening" spot',
    });
    await addCollectionItem(db, {
      cardId: "en:base1-58",
      isGraded: true,
      gradeCompany: "PSA",
      gradeValue: 9,
      certNumber: "87654321",
      valueOverride: 120,
    });

    const entries = await listCollection(db);
    const csv = exportCollectionCsv(entries);
    expect(csv).toContain("card_id");
    expect(csv).toContain("en:sv8-57");

    // fresh db, import
    const db2 = await createTestDb(CARDS, SETS);
    const { rows, errors } = parseCollectionCsv(csv);
    expect(errors).toHaveLength(0);
    const report = await importCollectionRows(db2, rows);
    expect(report.imported).toBe(2);
    expect(report.skipped).toHaveLength(0);

    const restored = await listCollection(db2);
    const pika = restored.find((e) => e.cardId === "en:sv8-57");
    expect(pika).toMatchObject({
      quantity: 2,
      condition: "LP",
      variant: "holofoil",
      purchasePrice: 45.5,
      storageLocation: "Binder A",
      notes: 'has a "whitening" spot',
    });
    const graded = restored.find((e) => e.cardId === "en:base1-58");
    expect(graded).toMatchObject({
      isGraded: true,
      gradeCompany: "PSA",
      gradeValue: 9,
      certNumber: "87654321",
      valueOverride: 120,
    });
    db2.close();
  });

  it("imports third-party CSV matched by set_id + number", async () => {
    const csv = [
      "set_id,number,quantity,condition",
      "en:sv8,57/191,3,NM",
      "en:sv8,58/191,1,MP",
    ].join("\n");
    const { rows } = parseCollectionCsv(csv);
    const report = await importCollectionRows(db, rows);
    expect(report.imported).toBe(2);
    const entries = await listCollection(db);
    expect(entries.find((e) => e.cardId === "en:sv8-57")?.quantity).toBe(3);
  });

  it("matches by unique name when ids are missing", async () => {
    const csv = ["name,quantity", "Raichu,1"].join("\n");
    const { rows } = parseCollectionCsv(csv);
    const report = await importCollectionRows(db, rows);
    expect(report.imported).toBe(1);
  });

  it("reports unmatched rows with reasons", async () => {
    const csv = ["name,quantity", "Nonexistent Card,1", "Pikachu,1"].join("\n");
    const { rows } = parseCollectionCsv(csv);
    const report = await importCollectionRows(db, rows);
    // "Pikachu" is unique (Pikachu ex is a different name string) -> imported
    expect(report.imported).toBe(1);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toContain("Nonexistent Card");
  });

  it("sanitizes bad values to safe defaults", async () => {
    const csv = [
      "card_id,quantity,condition,is_graded,grade_company,purchase_price",
      "en:sv8-57,not-a-number,MINTY,maybe,ACME,$45.50",
    ].join("\n");
    const { rows } = parseCollectionCsv(csv);
    expect(rows[0].item.quantity).toBe(1);
    expect(rows[0].item.condition).toBe("NM");
    expect(rows[0].item.isGraded).toBe(false);
    expect(rows[0].item.gradeCompany).toBeNull();
    expect(rows[0].item.purchasePrice).toBe(45.5);
  });
});
