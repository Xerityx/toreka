import * as DocumentPicker from "expo-document-picker";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { exportCollectionCsv, importCollectionRows, parseCollectionCsv, type ImportReport } from "./csv";
import { listCollection } from "../db/collection";
import type { SqlDb } from "../db/sql";

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Export the whole collection as CSV and open the iOS share sheet. */
export async function exportCollectionCsvFile(db: SqlDb): Promise<number> {
  const entries = await listCollection(db, { limit: 100_000 });
  const csv = exportCollectionCsv(entries);
  const uri = `${LegacyFS.cacheDirectory}toreka-collection-${stamp()}.csv`;
  await LegacyFS.writeAsStringAsync(uri, csv, { encoding: LegacyFS.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export collection" });
  }
  return entries.length;
}

/** Pick a CSV file and import it into the collection. Returns null if cancelled. */
export async function importCollectionCsvFile(db: SqlDb): Promise<ImportReport | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["text/csv", "text/comma-separated-values", "text/plain", "public.comma-separated-values-text"],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || picked.assets.length === 0) return null;

  const csv = await LegacyFS.readAsStringAsync(picked.assets[0].uri, {
    encoding: LegacyFS.EncodingType.UTF8,
  });
  const { rows, errors } = parseCollectionCsv(csv);
  const report = await importCollectionRows(db, rows);
  for (const err of errors) {
    report.skipped.push({ row: -1, reason: err });
  }
  return report;
}

/**
 * Share a copy of the user database (collection, prices, grading reports —
 * catalog excluded, it can always be re-downloaded).
 */
export async function backupUserDatabase(db: SqlDb): Promise<void> {
  // Flush the WAL so the main db file is complete on its own.
  await db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const src = `${LegacyFS.documentDirectory}SQLite/toreka.db`;
  const dest = `${LegacyFS.cacheDirectory}toreka-backup-${stamp()}.db`;
  await LegacyFS.copyAsync({ from: src, to: dest });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, { dialogTitle: "Back up Toreka data" });
  }
}
