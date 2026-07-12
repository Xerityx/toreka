import { File, Paths } from "expo-file-system";
import * as SQLite from "expo-sqlite";

import { runMigrations } from "./migrations";
import type { SqlDb, SqlParam } from "./sql";

/** Adapter: expo-sqlite -> SqlDb. */
class ExpoSqlDb implements SqlDb {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async run(sql: string, params: SqlParam[] = []) {
    const res = await this.db.runAsync(sql, params);
    return { changes: res.changes, lastInsertRowId: res.lastInsertRowId };
  }

  async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return await this.db.getAllAsync<T>(sql, params);
  }

  async get<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    return await this.db.getFirstAsync<T>(sql, params);
  }
}

export interface TorekaDb {
  db: SqlDb;
  /** True when a catalog database has been downloaded and attached. */
  hasCatalog: boolean;
  /** True when the attached catalog's FTS5 tables are queryable on this device. */
  ftsAvailable: boolean;
}

/** Where the downloaded catalog database lives. */
export function catalogFile(): File {
  return new File(Paths.document, "catalog.db");
}

async function attachCatalog(db: SqlDb): Promise<{ hasCatalog: boolean; ftsAvailable: boolean }> {
  const file = catalogFile();
  if (!file.exists) return { hasCatalog: false, ftsAvailable: false };

  const path = file.uri.replace(/^file:\/\//, "");
  try {
    await db.run("ATTACH DATABASE ? AS catalog", [path]);
  } catch {
    return { hasCatalog: false, ftsAvailable: false };
  }

  // The catalog ships FTS5 virtual tables; confirm this device's SQLite build
  // can read them (falls back to LIKE search when not).
  let ftsAvailable = true;
  try {
    await db.get("SELECT rowid FROM catalog.cards_fts LIMIT 1");
  } catch {
    ftsAvailable = false;
  }
  return { hasCatalog: true, ftsAvailable };
}

let initPromise: Promise<TorekaDb> | null = null;

async function init(): Promise<TorekaDb> {
  const raw = await SQLite.openDatabaseAsync("toreka.db");
  const db = new ExpoSqlDb(raw);
  await db.exec("PRAGMA journal_mode = WAL");
  await db.exec("PRAGMA foreign_keys = ON");
  await runMigrations(db);
  const { hasCatalog, ftsAvailable } = await attachCatalog(db);
  return { db, hasCatalog, ftsAvailable };
}

/** App-wide database singleton. Safe to call from anywhere. */
export function getDb(): Promise<TorekaDb> {
  if (!initPromise) initPromise = init();
  return initPromise;
}

/** Re-attach after the catalog file has been (re)downloaded. */
export async function refreshCatalogAttachment(): Promise<TorekaDb> {
  const current = await getDb();
  try {
    await current.db.run("DETACH DATABASE catalog");
  } catch {
    // was not attached — fine
  }
  const { hasCatalog, ftsAvailable } = await attachCatalog(current.db);
  const updated: TorekaDb = { db: current.db, hasCatalog, ftsAvailable };
  initPromise = Promise.resolve(updated);
  return updated;
}
