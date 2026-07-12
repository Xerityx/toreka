import type { CardVariant, PriceSource } from "../../db/types";

/** One price observation for a card+variant from one source. */
export interface PriceUpdate {
  cardId: string;
  source: PriceSource;
  variant: CardVariant;
  currency: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
}

/** A card the provider should price (catalog id + source-specific ids). */
export interface PriceTarget {
  cardId: string;
  externalIds: Record<string, string>;
}

export interface PriceProvider {
  readonly source: PriceSource;
  /** Which targets this provider can price. */
  supports(target: PriceTarget): boolean;
  /** Fetch prices for a batch of targets. */
  fetchPrices(targets: PriceTarget[], apiKey?: string): Promise<PriceUpdate[]>;
}
