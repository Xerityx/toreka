import * as LegacyFS from "expo-file-system/legacy";

import { CATALOG_DB_URL, CATALOG_MANIFEST_URL } from "./config";
import { catalogFile, refreshCatalogAttachment } from "../db/client";

export interface CatalogManifest {
  version: string;
  builtAt: string;
  cardCount: number;
  setCount: number;
  sizeBytes: number;
}

export async function fetchRemoteManifest(): Promise<CatalogManifest | null> {
  try {
    const res = await fetch(CATALOG_MANIFEST_URL, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as CatalogManifest;
  } catch {
    return null;
  }
}

/**
 * Download catalog.db to a temp file, then swap it into place and re-attach.
 * onProgress receives 0..1 (best-effort; -1 when total size unknown).
 */
export async function downloadCatalog(
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const tmpUri = `${LegacyFS.cacheDirectory}catalog-download.db`;
  const task = LegacyFS.createDownloadResumable(CATALOG_DB_URL, tmpUri, {}, (p) => {
    if (!onProgress) return;
    const total = p.totalBytesExpectedToWrite;
    onProgress(total > 0 ? p.totalBytesWritten / total : -1);
  });

  const result = await task.downloadAsync();
  if (!result || (result.status !== 200 && result.status !== 0)) {
    throw new Error(`Catalog download failed (HTTP ${result?.status ?? "?"})`);
  }

  const target = catalogFile();
  // Detach before overwriting so SQLite doesn't hold the old file open.
  try {
    const { getDb } = await import("../db/client");
    const { db } = await getDb();
    await db.run("DETACH DATABASE catalog");
  } catch {
    // not attached yet — fine
  }
  await LegacyFS.moveAsync({ from: tmpUri, to: target.uri });
  await refreshCatalogAttachment();
}
