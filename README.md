# Toreka トレカ

A personal, best-in-class **Pokémon TCG collection tracker for iPhone** (English + Japanese cards) — built with Expo/React Native, compiled on GitHub Actions (no Mac needed), and sideloaded with SideStore using a free Apple ID.

<p align="center"><img src="assets/images/icon.png" width="120" alt="Toreka icon"/></p>

## Features

- **Full collection tracking** — copies with condition, variant, graded slabs (PSA/BGS/CGC/TAG/SGC + cert), purchase price/date, storage location; sealed products with barcode entry; want lists.
- **Offline card database** — 26,000+ cards (EN + JA), instant FTS search with typeahead (English prefix + Japanese trigram), set browsing with completion %.
- **Live prices & portfolio** — TCGplayer per-variant prices + Cardmarket trend via pokemontcg.io (free), value-over-time charts, cost basis & gain/loss, most-valuable list, price alerts with local notifications.
- **Card scanner** — photograph a card and it's identified on-device by perceptual-hash matching against the full catalog (no cloud, no fees); barcode scanning for sealed products.
- **AI grade prediction (flagship)** — photograph front/back and get predicted grades for PSA, BGS, CGC and TAG with ranges, honest confidence levels, a component-by-component explanation (centering measured geometrically, corner/edge whitening detection, surface analysis), and a grading ROI calculator (expected value vs fees).
- **Data freedom** — CSV import/export, one-tap database backup, everything stored locally in SQLite.

## Architecture

```
src/app        Expo Router screens (5 native tabs + modals)
src/db         SQLite layer: migrations, DAOs, FTS search (same SQL runs in app + tests)
src/data       Price providers, catalog download, CSV, backup
src/scanner    dHash perceptual hashing + matching (pure TS)
src/grading    Metrics engine, per-company rulebook (data), explainer, ROI
src/portfolio  Valuation, daily snapshots
pipeline       Node scripts (Windows-friendly): build catalog.db + image hash index
```

The **catalog** (cards, sets, FTS index, image hashes) is built by `npm run pipeline:catalog` + `node pipeline/build-hashes.ts` and published as a GitHub Release asset; the app downloads it on first launch and can update it from More → Card database.

## Development

```bash
npm install
npm run typecheck   # strict TS
npm test            # 69 jest tests (DB, search, CSV, prices, scanner, grading)
npm start           # Expo dev server (Expo Go covers everything except camera flows)
```

## Building the IPA (no Mac)

Push a tag like `v1.0.0` (or run the **iOS Build** workflow manually) — a `macos-latest` runner produces an **unsigned** `Toreka.ipa` artifact. Install it with **SideStore** (one-time setup: [docs/SIDESTORE-SETUP.md](docs/SIDESTORE-SETUP.md)), which signs it on-device with your free Apple ID and auto-renews the 7-day signature.

## Data sources & costs

| Source | Used for | Cost |
|---|---|---|
| [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) | EN catalog | free |
| [TCGdex](https://tcgdex.dev) | JA catalog | free |
| [pokemontcg.io](https://pokemontcg.io) | prices (key raises limits) | free |

Total running cost: **$0/month**. Card data & images © Nintendo/Creatures/GAME FREAK/TPCi — personal use only; this app is not distributed.

---

🤖 Built with [Claude Code](https://claude.com/claude-code)
