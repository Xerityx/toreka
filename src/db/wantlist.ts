import type { SqlDb } from "./sql";
import type { CardSummary, WantListItem } from "./types";

export async function toggleWant(db: SqlDb, cardId: string): Promise<boolean> {
  const existing = await db.get<{ id: number }>(
    "SELECT id FROM want_list WHERE card_id = ?",
    [cardId],
  );
  if (existing) {
    await db.run("DELETE FROM want_list WHERE id = ?", [existing.id]);
    return false;
  }
  await db.run(
    "INSERT INTO want_list (card_id, priority, created_at) VALUES (?, 1, ?)",
    [cardId, new Date().toISOString()],
  );
  return true;
}

export async function isWanted(db: SqlDb, cardId: string): Promise<boolean> {
  const row = await db.get<{ id: number }>("SELECT id FROM want_list WHERE card_id = ?", [cardId]);
  return row != null;
}

export async function updateWant(
  db: SqlDb,
  cardId: string,
  patch: { maxPrice?: number | null; priority?: number; notes?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if ("maxPrice" in patch) {
    sets.push("max_price = ?");
    params.push(patch.maxPrice ?? null);
  }
  if (patch.priority !== undefined) {
    sets.push("priority = ?");
    params.push(patch.priority);
  }
  if ("notes" in patch) {
    sets.push("notes = ?");
    params.push(patch.notes ?? null);
  }
  if (sets.length === 0) return;
  params.push(cardId);
  await db.run(`UPDATE want_list SET ${sets.join(", ")} WHERE card_id = ?`, params);
}

export interface WantEntry extends WantListItem {
  card: CardSummary | null;
}

export async function listWantList(db: SqlDb): Promise<WantEntry[]> {
  const rows = await db.all<{
    id: number;
    card_id: string;
    max_price: number | null;
    priority: number;
    notes: string | null;
    created_at: string;
    name: string | null;
    nameLocal: string | null;
    number: string | null;
    rarity: string | null;
    language: string | null;
    imageSmall: string | null;
    setId: string | null;
    setName: string | null;
    ownedQuantity: number | null;
  }>(
    `SELECT w.id, w.card_id, w.max_price, w.priority, w.notes, w.created_at,
            c.name, c.name_local AS nameLocal, c.number, c.rarity, c.language,
            c.image_small AS imageSmall, c.set_id AS setId, s.name AS setName,
            COALESCE(o.qty, 0) AS ownedQuantity
     FROM want_list w
     LEFT JOIN catalog.cards c ON c.id = w.card_id
     LEFT JOIN catalog.sets s ON s.id = c.set_id
     LEFT JOIN (SELECT card_id, SUM(quantity) qty FROM collection_items GROUP BY card_id) o
       ON o.card_id = w.card_id
     ORDER BY w.priority DESC, w.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    cardId: r.card_id,
    maxPrice: r.max_price,
    priority: r.priority,
    notes: r.notes,
    createdAt: r.created_at,
    card:
      r.name == null
        ? null
        : {
            id: r.card_id,
            name: r.name,
            nameLocal: r.nameLocal,
            number: r.number ?? "",
            rarity: r.rarity,
            language: (r.language ?? "en") as CardSummary["language"],
            imageSmall: r.imageSmall,
            setId: r.setId ?? "",
            setName: r.setName ?? "",
            setCode: null,
            ownedQuantity: r.ownedQuantity ?? 0,
          },
  }));
}
