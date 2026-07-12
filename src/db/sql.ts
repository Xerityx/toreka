/**
 * Minimal SQL executor interface.
 *
 * The app implements it with expo-sqlite (see client.ts); jest tests and the
 * catalog pipeline implement it with node:sqlite. Keeping every query against
 * this interface means the exact SQL that ships in the app is exercised by
 * tests on Windows.
 */

export type SqlParam = string | number | null | Uint8Array;

export interface SqlDb {
  /** Run multiple statements (DDL, migrations). No parameters. */
  exec(sql: string): Promise<void>;
  /** Run a single statement with parameters; returns affected row count and last insert id. */
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number; lastInsertRowId: number }>;
  /** Fetch all rows. */
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  /** Fetch first row or null. */
  get<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
}

/** Wrap a series of writes in a transaction. */
export async function withTransaction<T>(db: SqlDb, fn: () => Promise<T>): Promise<T> {
  await db.exec("BEGIN");
  try {
    const result = await fn();
    await db.exec("COMMIT");
    return result;
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
