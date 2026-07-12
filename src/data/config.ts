/**
 * Where the app fetches its card catalog from.
 *
 * The catalog (catalog.db + catalog.json manifest) is built by
 * pipeline/build-catalog.ts and attached to GitHub Releases of this repo.
 * For local development you can point EXPO_PUBLIC_CATALOG_URL at any HTTP
 * directory serving those two files (e.g. `npx serve pipeline/out`).
 */

export const GITHUB_REPO = "xerityx/toreka";

const RELEASE_BASE = `https://github.com/${GITHUB_REPO}/releases/latest/download`;

const OVERRIDE = process.env.EXPO_PUBLIC_CATALOG_URL?.replace(/\/$/, "");

export const CATALOG_DB_URL = OVERRIDE ? `${OVERRIDE}/catalog.db` : `${RELEASE_BASE}/catalog.db`;
export const CATALOG_MANIFEST_URL = OVERRIDE
  ? `${OVERRIDE}/catalog.json`
  : `${RELEASE_BASE}/catalog.json`;
