import type { SqlDb, SqlParam } from "./sql";
import type { GameId, SealedProduct, SealedProductType } from "./types";

export interface NewSealedProduct {
  gameId?: GameId;
  name: string;
  productType?: SealedProductType;
  barcode?: string | null;
  quantity?: number;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  currentValue?: number | null;
  imageUri?: string | null;
  notes?: string | null;
}

interface Row {
  id: number;
  game_id: string;
  name: string;
  product_type: string;
  barcode: string | null;
  quantity: number;
  purchase_price: number | null;
  purchase_date: string | null;
  current_value: number | null;
  value_updated_at: string | null;
  image_uri: string | null;
  notes: string | null;
  created_at: string;
}

function mapRow(r: Row): SealedProduct {
  return {
    id: r.id,
    gameId: r.game_id as GameId,
    name: r.name,
    productType: r.product_type as SealedProductType,
    barcode: r.barcode,
    quantity: r.quantity,
    purchasePrice: r.purchase_price,
    purchaseDate: r.purchase_date,
    currentValue: r.current_value,
    valueUpdatedAt: r.value_updated_at,
    imageUri: r.image_uri,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

const SELECT = `
  SELECT id, game_id, name, product_type, barcode, quantity, purchase_price,
         purchase_date, current_value, value_updated_at, image_uri, notes, created_at
  FROM sealed_products
`;

export async function addSealedProduct(db: SqlDb, p: NewSealedProduct): Promise<number> {
  const now = new Date().toISOString();
  const res = await db.run(
    `INSERT INTO sealed_products
       (game_id, name, product_type, barcode, quantity, purchase_price, purchase_date,
        current_value, value_updated_at, image_uri, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.gameId ?? "pokemon",
      p.name,
      p.productType ?? "other",
      p.barcode ?? null,
      p.quantity ?? 1,
      p.purchasePrice ?? null,
      p.purchaseDate ?? null,
      p.currentValue ?? null,
      p.currentValue != null ? now : null,
      p.imageUri ?? null,
      p.notes ?? null,
      now,
    ],
  );
  return res.lastInsertRowId;
}

export async function updateSealedProduct(
  db: SqlDb,
  id: number,
  patch: Partial<NewSealedProduct>,
): Promise<void> {
  const map: Record<string, string> = {
    gameId: "game_id",
    name: "name",
    productType: "product_type",
    barcode: "barcode",
    quantity: "quantity",
    purchasePrice: "purchase_price",
    purchaseDate: "purchase_date",
    currentValue: "current_value",
    imageUri: "image_uri",
    notes: "notes",
  };
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const [key, col] of Object.entries(map)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      params.push((patch[key as keyof NewSealedProduct] as SqlParam) ?? null);
    }
  }
  if ("currentValue" in patch) {
    sets.push("value_updated_at = ?");
    params.push(new Date().toISOString());
  }
  if (sets.length === 0) return;
  params.push(id);
  await db.run(`UPDATE sealed_products SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function deleteSealedProduct(db: SqlDb, id: number): Promise<void> {
  await db.run("DELETE FROM sealed_products WHERE id = ?", [id]);
}

export async function getSealedProduct(db: SqlDb, id: number): Promise<SealedProduct | null> {
  const row = await db.get<Row>(`${SELECT} WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

export async function listSealedProducts(db: SqlDb): Promise<SealedProduct[]> {
  const rows = await db.all<Row>(`${SELECT} ORDER BY created_at DESC`);
  return rows.map(mapRow);
}

export async function getSealedTotals(
  db: SqlDb,
): Promise<{ count: number; value: number; costBasis: number }> {
  const row = await db.get<{ count: number; value: number; cost: number }>(
    `SELECT COALESCE(SUM(quantity), 0) AS count,
            COALESCE(SUM(quantity * COALESCE(current_value, 0)), 0) AS value,
            COALESCE(SUM(quantity * COALESCE(purchase_price, 0)), 0) AS cost
     FROM sealed_products`,
  );
  return { count: row?.count ?? 0, value: row?.value ?? 0, costBasis: row?.cost ?? 0 };
}
