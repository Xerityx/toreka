import type { SqlDb } from "./sql";

export async function getSetting(db: SqlDb, key: string): Promise<string | null> {
  const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setSetting(db: SqlDb, key: string, value: string): Promise<void> {
  await db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export async function getJsonSetting<T>(db: SqlDb, key: string): Promise<T | null> {
  const raw = await getSetting(db, key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJsonSetting(db: SqlDb, key: string, value: unknown): Promise<void> {
  await setSetting(db, key, JSON.stringify(value));
}

/** Well-known settings keys. */
export const SETTING_KEYS = {
  pokemonTcgIoApiKey: "pokemontcgio_api_key",
  lastPriceRefresh: "last_price_refresh",
  lastSnapshotDate: "last_snapshot_date",
  gradingFees: "grading_fees",
  gradedMultipliers: "graded_multipliers",
} as const;
