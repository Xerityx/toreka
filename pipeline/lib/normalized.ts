/** Normalized shapes shared by the language-specific loaders. */

export interface NormalSet {
  id: string;
  gameId: string;
  code: string | null;
  name: string;
  series: string | null;
  language: "en" | "ja";
  releaseDate: string | null;
  printedTotal: number | null;
  total: number | null;
  symbolUrl: string | null;
  logoUrl: string | null;
}

export interface NormalCard {
  id: string;
  gameId: string;
  setId: string;
  number: string;
  name: string;
  nameLocal: string | null;
  supertype: string | null;
  subtypes: string[] | null;
  rarity: string | null;
  language: "en" | "ja";
  imageSmall: string | null;
  imageLarge: string | null;
  tcgplayerId: number | null;
  externalIds: Record<string, string>;
  attributes: Record<string, unknown>;
  /** Extra text indexed for search (e.g. set name). */
  setName: string;
}
