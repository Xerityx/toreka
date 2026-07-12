/**
 * Domain types shared across the app.
 *
 * ID conventions:
 * - Card IDs are namespaced by language/source: "en:sv8-172", "ja:SV11B-001".
 * - Set IDs likewise: "en:sv8", "ja:SV11B".
 */

export type GameId = "pokemon" | "one_piece" | "lorcana" | "kayou_naruto";
export type Language = "en" | "ja";

export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";
export type GradeCompany = "PSA" | "BGS" | "CGC" | "TAG" | "SGC";

/** Print variants, matching pokemontcg.io tcgplayer price keys. */
export type CardVariant =
  | "normal"
  | "holofoil"
  | "reverseHolofoil"
  | "firstEditionNormal"
  | "firstEditionHolofoil"
  | "unlimited";

export type PriceSource = "tcgplayer" | "cardmarket" | "tcgdex" | "manual";

// ---------------------------------------------------------------------------
// Catalog rows (read-only, from the downloaded catalog.db)
// ---------------------------------------------------------------------------

export interface CatalogSet {
  id: string;
  gameId: GameId;
  code: string | null;
  name: string;
  series: string | null;
  language: Language;
  releaseDate: string | null;
  printedTotal: number | null;
  total: number | null;
  symbolUrl: string | null;
  logoUrl: string | null;
}

export interface CatalogCard {
  id: string;
  gameId: GameId;
  setId: string;
  number: string;
  name: string;
  /** Localized (Japanese) name when different from `name`. */
  nameLocal: string | null;
  supertype: string | null;
  /** JSON array of subtype strings. */
  subtypes: string | null;
  rarity: string | null;
  language: Language;
  imageSmall: string | null;
  imageLarge: string | null;
  tcgplayerId: number | null;
  /** JSON object of source-specific ids, e.g. {"ptcgio":"sv8-172"}. */
  externalIds: string | null;
  /** JSON object of game attributes (hp, types, artist, ...). */
  attributes: string | null;
}

/** Card search / list result with set info joined in. */
export interface CardSummary {
  id: string;
  name: string;
  nameLocal: string | null;
  number: string;
  rarity: string | null;
  language: Language;
  imageSmall: string | null;
  setId: string;
  setName: string;
  setCode: string | null;
  ownedQuantity: number;
}

// ---------------------------------------------------------------------------
// User rows (read-write, in toreka.db)
// ---------------------------------------------------------------------------

export interface CollectionItem {
  id: number;
  cardId: string;
  quantity: number;
  condition: CardCondition;
  variant: CardVariant;
  language: Language;
  isGraded: boolean;
  gradeCompany: GradeCompany | null;
  gradeValue: number | null;
  certNumber: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  /** Manual value override (e.g. graded cards, JP cards without market data). */
  valueOverride: number | null;
  storageLocation: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SealedProductType =
  | "booster_box"
  | "booster_bundle"
  | "elite_trainer_box"
  | "collection_box"
  | "tin"
  | "single_pack"
  | "other";

export interface SealedProduct {
  id: number;
  gameId: GameId;
  name: string;
  productType: SealedProductType;
  barcode: string | null;
  quantity: number;
  purchasePrice: number | null;
  purchaseDate: string | null;
  currentValue: number | null;
  valueUpdatedAt: string | null;
  imageUri: string | null;
  notes: string | null;
  createdAt: string;
}

export interface WantListItem {
  id: number;
  cardId: string;
  maxPrice: number | null;
  priority: number;
  notes: string | null;
  createdAt: string;
}

export interface PriceAlert {
  id: number;
  cardId: string;
  direction: "above" | "below";
  threshold: number;
  active: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface PriceRow {
  id: number;
  cardId: string;
  source: PriceSource;
  variant: CardVariant;
  currency: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  updatedAt: string;
}

export interface PriceHistoryRow {
  id: number;
  cardId: string;
  source: PriceSource;
  variant: CardVariant;
  /** YYYY-MM-DD */
  date: string;
  market: number;
}

export interface PortfolioSnapshot {
  id: number;
  /** YYYY-MM-DD */
  date: string;
  gameId: GameId;
  totalValue: number;
  costBasis: number;
  itemCount: number;
  sealedValue: number;
}

export interface GradingReport {
  id: number;
  cardId: string | null;
  frontUri: string;
  backUri: string | null;
  /** JSON: GradingMeasurements */
  measurements: string;
  /** JSON: CompanyPrediction[] */
  predictions: string;
  /** JSON: ExplanationBlock[] */
  explanation: string;
  createdAt: string;
}

export interface TransactionRow {
  id: number;
  type: "buy" | "sell";
  cardId: string | null;
  sealedProductId: number | null;
  quantity: number;
  price: number;
  fees: number;
  date: string;
  marketplace: string | null;
  notes: string | null;
  createdAt: string;
}
