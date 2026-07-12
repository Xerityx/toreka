import type { PriceProvider, PriceTarget, PriceUpdate } from "./types";
import type { CardVariant } from "../../db/types";

/**
 * pokemontcg.io price provider (free; API key raises rate limits).
 * Returns TCGplayer prices per variant (USD) and Cardmarket trend (EUR).
 */

const BASE = "https://api.pokemontcg.io/v2";
const BATCH_SIZE = 40;

interface ApiPriceBlock {
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
  directLow?: number;
}

interface ApiCard {
  id: string;
  tcgplayer?: { prices?: Record<string, ApiPriceBlock> };
  cardmarket?: { prices?: { averageSellPrice?: number; trendPrice?: number; lowPrice?: number } };
}

const VARIANT_KEYS: Record<string, CardVariant> = {
  normal: "normal",
  holofoil: "holofoil",
  reverseHolofoil: "reverseHolofoil",
  "1stEditionNormal": "firstEditionNormal",
  "1stEditionHolofoil": "firstEditionHolofoil",
  unlimited: "unlimited",
  unlimitedHolofoil: "holofoil",
};

/** Map one API card to price updates. Exported for tests. */
export function mapApiCard(card: ApiCard, cardId: string): PriceUpdate[] {
  const updates: PriceUpdate[] = [];

  const tcg = card.tcgplayer?.prices;
  if (tcg) {
    for (const [key, block] of Object.entries(tcg)) {
      const variant = VARIANT_KEYS[key];
      if (!variant || !block) continue;
      updates.push({
        cardId,
        source: "tcgplayer",
        variant,
        currency: "USD",
        market: block.market ?? null,
        low: block.low ?? null,
        mid: block.mid ?? null,
        high: block.high ?? null,
      });
    }
  }

  const cm = card.cardmarket?.prices;
  if (cm && (cm.trendPrice != null || cm.averageSellPrice != null)) {
    updates.push({
      cardId,
      source: "cardmarket",
      variant: "normal",
      currency: "EUR",
      market: cm.trendPrice ?? cm.averageSellPrice ?? null,
      low: cm.lowPrice ?? null,
      mid: cm.averageSellPrice ?? null,
      high: null,
    });
  }

  return updates;
}

async function fetchBatch(
  ids: { apiId: string; cardId: string }[],
  apiKey?: string,
): Promise<PriceUpdate[]> {
  const q = ids.map((i) => `id:"${i.apiId}"`).join(" OR ");
  const url = `${BASE}/cards?q=(${encodeURIComponent(q)})&select=id,tcgplayer,cardmarket&pageSize=${ids.length}`;
  const res = await fetch(url, {
    headers: apiKey ? { "X-Api-Key": apiKey } : {},
  });
  if (!res.ok) throw new Error(`pokemontcg.io HTTP ${res.status}`);
  const body = (await res.json()) as { data?: ApiCard[] };

  const byApiId = new Map(ids.map((i) => [i.apiId, i.cardId]));
  const updates: PriceUpdate[] = [];
  for (const card of body.data ?? []) {
    const cardId = byApiId.get(card.id);
    if (cardId) updates.push(...mapApiCard(card, cardId));
  }
  return updates;
}

export const pokemonTcgIoProvider: PriceProvider = {
  source: "tcgplayer",

  supports(target: PriceTarget): boolean {
    return typeof target.externalIds.ptcgio === "string";
  },

  async fetchPrices(targets: PriceTarget[], apiKey?: string): Promise<PriceUpdate[]> {
    const ids = targets
      .filter((t) => this.supports(t))
      .map((t) => ({ apiId: t.externalIds.ptcgio, cardId: t.cardId }));

    const all: PriceUpdate[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      all.push(...(await fetchBatch(batch, apiKey)));
      if (i + BATCH_SIZE < ids.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return all;
  },
};
