import { File, Paths } from "expo-file-system";

import { CATALOG_DB_URL, CATALOG_MANIFEST_URL } from "./config";
import { catalogFile, getDb, refreshCatalogAttachment } from "../db/client";

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
 * onProgress receives 0..1 when the size is known, -1 otherwise.
 */
export async function downloadCatalog(
  onProgress?: (fraction: number) => void,
): Promise<void> {
  onProgress?.(-1);

  // Clean slate: iOS refuses to move a download onto an existing file.
  const tmp = new File(Paths.cache, "catalog-download.db");
  try {
    if (tmp.exists) tmp.delete();
  } catch {
    // stale handle — continue; downloadFileAsync will error if truly blocked
  }

  let downloaded: File;
  try {
    downloaded = await File.downloadFileAsync(CATALOG_DB_URL, tmp);
  } catch (e) {
    throw new Error(`Download failed: ${shortMessage(e)}`);
  }

  onProgress?.(0.9);

  // Detach the old catalog before overwriting it.
  try {
    const { db } = await getDb();
    await db.run("DETACH DATABASE catalog");
  } catch {
    // not attached yet — fine
  }

  const target = catalogFile();
  try {
    if (target.exists) target.delete();
    downloaded.move(target);
  } catch (e) {
    throw new Error(`Could not save catalog: ${shortMessage(e)}`);
  }

  await refreshCatalogAttachment();
  onProgress?.(1);
}

/** Keep iOS's novel-length NSError descriptions out of the UI. */
function shortMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const firstLine = msg.split("\n")[0];
  return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine;
}
