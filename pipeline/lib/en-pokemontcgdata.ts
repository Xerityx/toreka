/**
 * English catalog loader — PokemonTCG/pokemon-tcg-data GitHub repo (free bulk
 * JSON maintained by the pokemontcg.io team). One file per set.
 */
import { NotFoundError, fetchJson } from "./http.ts";
import type { NormalCard, NormalSet } from "./normalized.ts";

const RAW = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master";

interface PtcgioSet {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  ptcgoCode?: string;
  releaseDate: string; // "2024/11/08"
  images?: { symbol?: string; logo?: string };
}

interface PtcgioCard {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  number: string;
  artist?: string;
  rarity?: string;
  nationalPokedexNumbers?: number[];
  images?: { small?: string; large?: string };
}

export async function loadEnglish(): Promise<{ sets: NormalSet[]; cards: NormalCard[] }> {
  const rawSets = await fetchJson<PtcgioSet[]>(`${RAW}/sets/en.json`);
  const sets: NormalSet[] = [];
  const cards: NormalCard[] = [];

  for (const s of rawSets) {
    const setId = `en:${s.id}`;
    sets.push({
      id: setId,
      gameId: "pokemon",
      code: s.ptcgoCode ?? null,
      name: s.name,
      series: s.series ?? null,
      language: "en",
      releaseDate: s.releaseDate ? s.releaseDate.replaceAll("/", "-") : null,
      printedTotal: s.printedTotal ?? null,
      total: s.total ?? null,
      symbolUrl: s.images?.symbol ?? null,
      logoUrl: s.images?.logo ?? null,
    });

    let rawCards: PtcgioCard[];
    try {
      rawCards = await fetchJson<PtcgioCard[]>(`${RAW}/cards/en/${s.id}.json`, { delayMs: 40 });
    } catch (e) {
      if (e instanceof NotFoundError) {
        console.warn(`  [en] no card file for set ${s.id} (${s.name}) — skipped`);
        continue;
      }
      throw e;
    }

    for (const c of rawCards) {
      cards.push({
        id: `en:${c.id}`,
        gameId: "pokemon",
        setId,
        number: c.number,
        name: c.name,
        nameLocal: null,
        supertype: c.supertype ?? null,
        subtypes: c.subtypes ?? null,
        rarity: c.rarity ?? null,
        language: "en",
        imageSmall: c.images?.small ?? null,
        imageLarge: c.images?.large ?? null,
        tcgplayerId: null,
        externalIds: { ptcgio: c.id },
        attributes: {
          hp: c.hp,
          types: c.types,
          artist: c.artist,
          dexIds: c.nationalPokedexNumbers,
        },
        setName: s.name,
      });
    }
  }

  return { sets, cards };
}
