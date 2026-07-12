import Papa from "papaparse";

import type { CollectionEntry, NewCollectionItem } from "../db/collection";
import { addCollectionItem } from "../db/collection";
import type { SqlDb } from "../db/sql";
import type { CardCondition, CardVariant, GradeCompany, Language } from "../db/types";
import { withTransaction } from "../db/sql";

/** Column order for exports; imports accept any subset with these headers. */
export const CSV_COLUMNS = [
  "card_id",
  "name",
  "set_name",
  "set_id",
  "number",
  "language",
  "quantity",
  "condition",
  "variant",
  "is_graded",
  "grade_company",
  "grade_value",
  "cert_number",
  "purchase_price",
  "purchase_date",
  "value_override",
  "storage_location",
  "notes",
] as const;

export function exportCollectionCsv(entries: CollectionEntry[]): string {
  const rows = entries.map((e) => ({
    card_id: e.cardId,
    name: e.cardName,
    set_name: e.setName,
    set_id: e.setId,
    number: e.cardNumber,
    language: e.language,
    quantity: e.quantity,
    condition: e.condition,
    variant: e.variant,
    is_graded: e.isGraded ? "1" : "0",
    grade_company: e.gradeCompany ?? "",
    grade_value: e.gradeValue ?? "",
    cert_number: e.certNumber ?? "",
    purchase_price: e.purchasePrice ?? "",
    purchase_date: e.purchaseDate ?? "",
    value_override: e.valueOverride ?? "",
    storage_location: e.storageLocation ?? "",
    notes: e.notes ?? "",
  }));
  return Papa.unparse({ fields: [...CSV_COLUMNS], data: rows.map((r) => CSV_COLUMNS.map((c) => r[c])) });
}

export interface CsvImportRow {
  cardId: string | null;
  setId: string | null;
  number: string | null;
  name: string | null;
  item: Omit<NewCollectionItem, "cardId">;
}

const CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"]);
const COMPANIES = new Set(["PSA", "BGS", "CGC", "TAG", "SGC"]);

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(v: unknown): number | null {
  const s = str(v);
  if (s == null) return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseCollectionCsv(csv: string): { rows: CsvImportRow[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  const errors = parsed.errors.map((e) => `Row ${e.row ?? "?"}: ${e.message}`);
  const rows: CsvImportRow[] = [];

  for (const raw of parsed.data) {
    const conditionRaw = str(raw.condition)?.toUpperCase();
    const companyRaw = str(raw.grade_company)?.toUpperCase();
    const gradedRaw = str(raw.is_graded)?.toLowerCase();
    const language = str(raw.language)?.toLowerCase() === "ja" ? "ja" : "en";

    rows.push({
      cardId: str(raw.card_id),
      setId: str(raw.set_id),
      number: str(raw.number),
      name: str(raw.name),
      item: {
        quantity: Math.max(1, Math.round(num(raw.quantity) ?? 1)),
        condition: (conditionRaw && CONDITIONS.has(conditionRaw)
          ? conditionRaw
          : "NM") as CardCondition,
        variant: (str(raw.variant) ?? "normal") as CardVariant,
        language: language as Language,
        isGraded: gradedRaw === "1" || gradedRaw === "true" || gradedRaw === "yes",
        gradeCompany: (companyRaw && COMPANIES.has(companyRaw)
          ? companyRaw
          : null) as GradeCompany | null,
        gradeValue: num(raw.grade_value),
        certNumber: str(raw.cert_number),
        purchasePrice: num(raw.purchase_price),
        purchaseDate: str(raw.purchase_date),
        valueOverride: num(raw.value_override),
        storageLocation: str(raw.storage_location),
        notes: str(raw.notes),
      },
    });
  }

  return { rows, errors };
}

export interface ImportReport {
  imported: number;
  skipped: { row: number; reason: string }[];
}

/**
 * Resolve each parsed row to a catalog card and insert it.
 * Match precedence: card_id → set_id+number → name+number → name (unique hit only).
 */
export async function importCollectionRows(db: SqlDb, rows: CsvImportRow[]): Promise<ImportReport> {
  const report: ImportReport = { imported: 0, skipped: [] };

  await withTransaction(db, async () => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cardId = await resolveCardId(db, row);
      if (!cardId) {
        report.skipped.push({
          row: i + 2, // 1-based + header line
          reason: `No catalog match (${row.cardId ?? row.name ?? "empty row"})`,
        });
        continue;
      }
      await addCollectionItem(db, { ...row.item, cardId });
      report.imported++;
    }
  });

  return report;
}

async function resolveCardId(db: SqlDb, row: CsvImportRow): Promise<string | null> {
  if (row.cardId) {
    const hit = await db.get<{ id: string }>("SELECT id FROM catalog.cards WHERE id = ?", [
      row.cardId,
    ]);
    if (hit) return hit.id;
  }
  if (row.setId && row.number) {
    const hit = await db.get<{ id: string }>(
      "SELECT id FROM catalog.cards WHERE set_id = ? AND number = ?",
      [row.setId, row.number],
    );
    if (hit) return hit.id;
  }
  if (row.name && row.number) {
    const hits = await db.all<{ id: string }>(
      "SELECT id FROM catalog.cards WHERE name = ? COLLATE NOCASE AND number = ? LIMIT 2",
      [row.name, row.number],
    );
    if (hits.length === 1) return hits[0].id;
  }
  if (row.name) {
    const hits = await db.all<{ id: string }>(
      "SELECT id FROM catalog.cards WHERE name = ? COLLATE NOCASE LIMIT 2",
      [row.name],
    );
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}
