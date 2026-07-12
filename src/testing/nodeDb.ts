/**
 * node:sqlite implementation of SqlDb — used ONLY by jest tests (and mirrored
 * by the pipeline). Never import this from app code; node:sqlite does not
 * exist in React Native.
 */
import { DatabaseSync } from "node:sqlite";

import { CATALOG_DDL, numberSortKey } from "../db/catalogSchema";
import { runMigrations } from "../db/migrations";
import type { SqlDb, SqlParam } from "../db/sql";

export class NodeSqlDb implements SqlDb {
  readonly raw: DatabaseSync;

  constructor(path = ":memory:") {
    this.raw = new DatabaseSync(path);
  }

  async exec(sql: string): Promise<void> {
    this.raw.exec(sql);
  }

  async run(sql: string, params: SqlParam[] = []) {
    const res = this.raw.prepare(sql).run(...(params as never[]));
    return { changes: Number(res.changes), lastInsertRowId: Number(res.lastInsertRowid) };
  }

  async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return this.raw.prepare(sql).all(...(params as never[])) as T[];
  }

  async get<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    const row = this.raw.prepare(sql).get(...(params as never[]));
    return (row as T | undefined) ?? null;
  }

  close(): void {
    this.raw.close();
  }
}

export interface TestCard {
  id: string;
  setId: string;
  number: string;
  name: string;
  nameLocal?: string;
  rarity?: string;
  language?: "en" | "ja";
  setName?: string;
}

/**
 * Create a user DB (migrations applied) with an in-memory attached catalog
 * containing the given sets/cards — mirrors exactly what the app sees.
 */
export async function createTestDb(
  cards: TestCard[] = [],
  sets: { id: string; name: string; language?: "en" | "ja"; total?: number }[] = [],
): Promise<NodeSqlDb> {
  const db = new NodeSqlDb();
  await runMigrations(db);
  await db.exec("ATTACH DATABASE ':memory:' AS catalog");
  // node:sqlite exec runs in main schema; qualify by creating inside catalog.
  const ddlInCatalog = CATALOG_DDL.replace(
    /CREATE (TABLE|INDEX|VIRTUAL TABLE) (idx_\w+|\w+)/g,
    "CREATE $1 catalog.$2",
  );
  await db.exec(ddlInCatalog);

  await db.run("INSERT INTO catalog.meta (key, value) VALUES ('version','test'),('built_at','2026-01-01')", []);
  await db.run("INSERT INTO catalog.games (id, name) VALUES ('pokemon','Pokémon')", []);

  for (const s of sets) {
    await db.run(
      `INSERT INTO catalog.sets (id, game_id, code, name, series, language, release_date, printed_total, total)
       VALUES (?, 'pokemon', ?, ?, 'Test', ?, '2026-01-01', ?, ?)`,
      [s.id, s.id.split(":")[1] ?? s.id, s.name, s.language ?? "en", s.total ?? 100, s.total ?? 100],
    );
  }

  for (const c of cards) {
    await db.run(
      `INSERT INTO catalog.cards
         (id, game_id, set_id, number, number_sort, name, name_local, rarity, language)
       VALUES (?, 'pokemon', ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.setId,
        c.number,
        numberSortKey(c.number),
        c.name,
        c.nameLocal ?? null,
        c.rarity ?? "Common",
        c.language ?? "en",
      ],
    );
    await db.run(
      "INSERT INTO catalog.cards_fts (card_id, name, set_name, number) VALUES (?, ?, ?, ?)",
      [c.id, c.name, c.setName ?? "", c.number],
    );
    if (c.nameLocal) {
      await db.run("INSERT INTO catalog.cards_fts_ja (card_id, text) VALUES (?, ?)", [
        c.id,
        c.nameLocal,
      ]);
    }
  }
  return db;
}
