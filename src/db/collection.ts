import type { SqlDb, SqlParam } from "./sql";
import type {
  CardCondition,
  CardVariant,
  CollectionItem,
  GradeCompany,
  Language,
} from "./types";

/** Insertable collection item (ids/timestamps handled here). */
export interface NewCollectionItem {
  cardId: string;
  quantity?: number;
  condition?: CardCondition;
  variant?: CardVariant;
  language?: Language;
  isGraded?: boolean;
  gradeCompany?: GradeCompany | null;
  gradeValue?: number | null;
  certNumber?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  valueOverride?: number | null;
  storageLocation?: string | null;
  notes?: string | null;
}

interface CollectionItemRow {
  id: number;
  card_id: string;
  quantity: number;
  condition: string;
  variant: string;
  language: string;
  is_graded: number;
  grade_company: string | null;
  grade_value: number | null;
  cert_number: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  value_override: number | null;
  storage_location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(r: CollectionItemRow): CollectionItem {
  return {
    id: r.id,
    cardId: r.card_id,
    quantity: r.quantity,
    condition: r.condition as CardCondition,
    variant: r.variant as CardVariant,
    language: r.language as Language,
    isGraded: r.is_graded === 1,
    gradeCompany: (r.grade_company as GradeCompany) ?? null,
    gradeValue: r.grade_value,
    certNumber: r.cert_number,
    purchasePrice: r.purchase_price,
    purchaseDate: r.purchase_date,
    valueOverride: r.value_override,
    storageLocation: r.storage_location,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const ROW_SELECT = `
  SELECT id, card_id, quantity, condition, variant, language, is_graded,
         grade_company, grade_value, cert_number, purchase_price, purchase_date,
         value_override, storage_location, notes, created_at, updated_at
  FROM collection_items
`;

export async function addCollectionItem(db: SqlDb, item: NewCollectionItem): Promise<number> {
  const now = new Date().toISOString();
  const res = await db.run(
    `INSERT INTO collection_items
       (card_id, quantity, condition, variant, language, is_graded, grade_company,
        grade_value, cert_number, purchase_price, purchase_date, value_override,
        storage_location, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.cardId,
      item.quantity ?? 1,
      item.condition ?? "NM",
      item.variant ?? "normal",
      item.language ?? "en",
      item.isGraded ? 1 : 0,
      item.gradeCompany ?? null,
      item.gradeValue ?? null,
      item.certNumber ?? null,
      item.purchasePrice ?? null,
      item.purchaseDate ?? null,
      item.valueOverride ?? null,
      item.storageLocation ?? null,
      item.notes ?? null,
      now,
      now,
    ],
  );
  return res.lastInsertRowId;
}

export async function updateCollectionItem(
  db: SqlDb,
  id: number,
  patch: Partial<NewCollectionItem>,
): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  const map: Record<string, string> = {
    cardId: "card_id",
    quantity: "quantity",
    condition: "condition",
    variant: "variant",
    language: "language",
    isGraded: "is_graded",
    gradeCompany: "grade_company",
    gradeValue: "grade_value",
    certNumber: "cert_number",
    purchasePrice: "purchase_price",
    purchaseDate: "purchase_date",
    valueOverride: "value_override",
    storageLocation: "storage_location",
    notes: "notes",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      const v = patch[key as keyof NewCollectionItem];
      params.push(typeof v === "boolean" ? (v ? 1 : 0) : (v ?? null));
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);
  await db.run(`UPDATE collection_items SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteCollectionItem(db: SqlDb, id: number): Promise<void> {
  await db.run("DELETE FROM collection_items WHERE id = ?", [id]);
}

export async function getCollectionItem(db: SqlDb, id: number): Promise<CollectionItem | null> {
  const row = await db.get<CollectionItemRow>(`${ROW_SELECT} WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

export async function getItemsForCard(db: SqlDb, cardId: string): Promise<CollectionItem[]> {
  const rows = await db.all<CollectionItemRow>(
    `${ROW_SELECT} WHERE card_id = ? ORDER BY created_at`,
    [cardId],
  );
  return rows.map(mapRow);
}

/** A collection item joined with catalog card display info. */
export interface CollectionEntry extends CollectionItem {
  cardName: string;
  cardNumber: string;
  rarity: string | null;
  imageSmall: string | null;
  setId: string;
  setName: string;
}

export interface ListCollectionOptions {
  setId?: string;
  language?: Language;
  gradedOnly?: boolean;
  storageLocation?: string;
  sort?: "added" | "name" | "set";
  limit?: number;
  offset?: number;
}

export async function listCollection(
  db: SqlDb,
  opts: ListCollectionOptions = {},
): Promise<CollectionEntry[]> {
  const params: SqlParam[] = [];
  let where = "WHERE 1=1";
  if (opts.setId) {
    where += " AND c.set_id = ?";
    params.push(opts.setId);
  }
  if (opts.language) {
    where += " AND ci.language = ?";
    params.push(opts.language);
  }
  if (opts.gradedOnly) {
    where += " AND ci.is_graded = 1";
  }
  if (opts.storageLocation) {
    where += " AND ci.storage_location = ?";
    params.push(opts.storageLocation);
  }
  const order =
    opts.sort === "name"
      ? "ORDER BY c.name, ci.created_at"
      : opts.sort === "set"
        ? "ORDER BY s.release_date DESC, c.number_sort, c.number"
        : "ORDER BY ci.created_at DESC";
  const limit = opts.limit ?? 500;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);

  const rows = await db.all<CollectionItemRow & {
    cardName: string;
    cardNumber: string;
    rarity: string | null;
    imageSmall: string | null;
    setId: string;
    setName: string;
  }>(
    `
    SELECT ci.id, ci.card_id, ci.quantity, ci.condition, ci.variant, ci.language,
           ci.is_graded, ci.grade_company, ci.grade_value, ci.cert_number,
           ci.purchase_price, ci.purchase_date, ci.value_override,
           ci.storage_location, ci.notes, ci.created_at, ci.updated_at,
           c.name AS cardName, c.number AS cardNumber, c.rarity,
           c.image_small AS imageSmall, c.set_id AS setId, s.name AS setName
    FROM collection_items ci
    JOIN catalog.cards c ON c.id = ci.card_id
    JOIN catalog.sets s ON s.id = c.set_id
    ${where} ${order} LIMIT ? OFFSET ?
    `,
    params,
  );
  return rows.map((r) => ({
    ...mapRow(r),
    cardName: r.cardName,
    cardNumber: r.cardNumber,
    rarity: r.rarity,
    imageSmall: r.imageSmall,
    setId: r.setId,
    setName: r.setName,
  }));
}

export interface CollectionCounts {
  totalCards: number;
  distinctCards: number;
  gradedCards: number;
}

export async function getCollectionCounts(db: SqlDb): Promise<CollectionCounts> {
  const row = await db.get<{ total: number; distinct_cards: number; graded: number }>(
    `SELECT COALESCE(SUM(quantity), 0) AS total,
            COUNT(DISTINCT card_id) AS distinct_cards,
            COALESCE(SUM(CASE WHEN is_graded = 1 THEN quantity ELSE 0 END), 0) AS graded
     FROM collection_items`,
  );
  return {
    totalCards: row?.total ?? 0,
    distinctCards: row?.distinct_cards ?? 0,
    gradedCards: row?.graded ?? 0,
  };
}

/** Distinct storage locations in use (for pickers). */
export async function getStorageLocations(db: SqlDb): Promise<string[]> {
  const rows = await db.all<{ storage_location: string }>(
    `SELECT DISTINCT storage_location FROM collection_items
     WHERE storage_location IS NOT NULL AND storage_location != ''
     ORDER BY storage_location`,
  );
  return rows.map((r) => r.storage_location);
}
