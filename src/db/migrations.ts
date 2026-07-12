import type { SqlDb } from "./sql";

/**
 * User-database migrations. Versioned via PRAGMA user_version.
 * NEVER edit an existing migration after it has shipped — append a new one.
 */
export const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE collection_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    condition TEXT NOT NULL DEFAULT 'NM',
    variant TEXT NOT NULL DEFAULT 'normal',
    language TEXT NOT NULL DEFAULT 'en',
    is_graded INTEGER NOT NULL DEFAULT 0,
    grade_company TEXT,
    grade_value REAL,
    cert_number TEXT,
    purchase_price REAL,
    purchase_date TEXT,
    value_override REAL,
    storage_location TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_collection_card ON collection_items(card_id);

  CREATE TABLE sealed_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL DEFAULT 'pokemon',
    name TEXT NOT NULL,
    product_type TEXT NOT NULL DEFAULT 'other',
    barcode TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    purchase_price REAL,
    purchase_date TEXT,
    current_value REAL,
    value_updated_at TEXT,
    image_uri TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE want_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL UNIQUE,
    max_price REAL,
    priority INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE price_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('above','below')),
    threshold REAL NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    last_triggered_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_alerts_card ON price_alerts(card_id);

  CREATE TABLE prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    source TEXT NOT NULL,
    variant TEXT NOT NULL DEFAULT 'normal',
    currency TEXT NOT NULL DEFAULT 'USD',
    market REAL,
    low REAL,
    mid REAL,
    high REAL,
    updated_at TEXT NOT NULL,
    UNIQUE (card_id, source, variant)
  );

  CREATE TABLE price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    source TEXT NOT NULL,
    variant TEXT NOT NULL DEFAULT 'normal',
    date TEXT NOT NULL,
    market REAL NOT NULL,
    UNIQUE (card_id, source, variant, date)
  );
  CREATE INDEX idx_history_card ON price_history(card_id, date);

  CREATE TABLE portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    game_id TEXT NOT NULL DEFAULT 'pokemon',
    total_value REAL NOT NULL,
    cost_basis REAL NOT NULL,
    item_count INTEGER NOT NULL,
    sealed_value REAL NOT NULL DEFAULT 0,
    UNIQUE (date, game_id)
  );

  CREATE TABLE grading_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT,
    front_uri TEXT NOT NULL,
    back_uri TEXT,
    measurements TEXT NOT NULL,
    predictions TEXT NOT NULL,
    explanation TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('buy','sell')),
    card_id TEXT,
    sealed_product_id INTEGER,
    quantity INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    marketplace TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

/** Bring the connected database up to the latest schema version. */
export async function runMigrations(db: SqlDb): Promise<void> {
  const row = await db.get<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.exec("BEGIN");
    try {
      await db.exec(MIGRATIONS[v]);
      await db.exec(`PRAGMA user_version = ${v + 1}`);
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
  }
}
