import { MIGRATIONS, runMigrations } from "../migrations";
import { NodeSqlDb } from "../../testing/nodeDb";

describe("migrations", () => {
  it("applies cleanly to a fresh database", async () => {
    const db = new NodeSqlDb();
    await runMigrations(db);
    const v = await db.get<{ user_version: number }>("PRAGMA user_version");
    expect(v?.user_version).toBe(MIGRATIONS.length);

    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    for (const expected of [
      "collection_items",
      "sealed_products",
      "want_list",
      "price_alerts",
      "prices",
      "price_history",
      "portfolio_snapshots",
      "grading_reports",
      "transactions",
      "settings",
    ]) {
      expect(names).toContain(expected);
    }
    db.close();
  });

  it("is idempotent (re-running does nothing)", async () => {
    const db = new NodeSqlDb();
    await runMigrations(db);
    await expect(runMigrations(db)).resolves.toBeUndefined();
    db.close();
  });

  it("enforces check constraints", async () => {
    const db = new NodeSqlDb();
    await runMigrations(db);
    await expect(
      db.run(
        "INSERT INTO price_alerts (card_id, direction, threshold, created_at) VALUES ('x','sideways',1,'now')",
      ),
    ).rejects.toThrow();
    db.close();
  });
});
