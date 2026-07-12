/**
 * Japanese catalog loader — TCGdex API (free, no key).
 * One request per set (~180). Set details include the card list (id, localId,
 * name, image). Rarity/dex data would need one request per card (~30k) — kept
 * out of v1; Japanese cards are searchable by Japanese name and set/number.
 */
import { fetchJson } from "./http.ts";
import type { NormalCard, NormalSet } from "./normalized.ts";

const BASE = "https://api.tcgdex.net/v2/ja";

interface TcgdexSetBrief {
  id: string;
  name: string;
  cardCount: { total: number; official: number };
}

interface TcgdexSetDetail {
  id: string;
  name: string;
  serie?: { id: string; name: string };
  releaseDate?: string;
  cardCount: { total: number; official: number };
  symbol?: string;
  logo?: string;
  cards: { id: string; localId: string; name: string; image?: string }[];
}

/** TCGdex images need a quality + extension suffix. */
function img(base: string | undefined, quality: "low" | "high"): string | null {
  return base ? `${base}/${quality}.webp` : null;
}

export async function loadJapanese(): Promise<{ sets: NormalSet[]; cards: NormalCard[] }> {
  const briefs = await fetchJson<TcgdexSetBrief[]>(`${BASE}/sets`);
  const sets: NormalSet[] = [];
  const cards: NormalCard[] = [];

  for (const brief of briefs) {
    let detail: TcgdexSetDetail;
    try {
      detail = await fetchJson<TcgdexSetDetail>(`${BASE}/sets/${encodeURIComponent(brief.id)}`, {
        delayMs: 80,
      });
    } catch (e) {
      console.warn(`  [ja] failed set ${brief.id}: ${(e as Error).message} — skipped`);
      continue;
    }

    const setId = `ja:${detail.id}`;
    sets.push({
      id: setId,
      gameId: "pokemon",
      code: detail.id,
      name: detail.name,
      series: detail.serie?.name ?? null,
      language: "ja",
      releaseDate: detail.releaseDate ?? null,
      printedTotal: detail.cardCount?.official ?? null,
      total: detail.cardCount?.total ?? null,
      symbolUrl: img(detail.symbol, "low"),
      logoUrl: img(detail.logo, "low"),
    });

    for (const c of detail.cards ?? []) {
      cards.push({
        id: `ja:${c.id}`,
        gameId: "pokemon",
        setId,
        number: c.localId,
        name: c.name, // Japanese — also stored as nameLocal for the trigram index
        nameLocal: c.name,
        supertype: null,
        subtypes: null,
        rarity: null,
        language: "ja",
        imageSmall: img(c.image, "low"),
        imageLarge: img(c.image, "high"),
        tcgplayerId: null,
        externalIds: { tcgdex: c.id },
        attributes: {},
        setName: detail.name,
      });
    }
  }

  return { sets, cards };
}
