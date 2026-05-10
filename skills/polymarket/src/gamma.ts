import { rankByQueryRelevance } from "./ranker";

export interface GammaMarket {
  conditionId: string;
  slug: string;
  question: string;
  description?: string;
  outcomes: string[];
  clobTokenIds: string[];
  liquidityNum: number;
  volumeNum: number;
  endDate: string;
  active: boolean;
  closed: boolean;
  enableOrderBook: boolean;
  negRisk?: boolean;
}

export interface RankedMarket {
  conditionId: string;
  slug: string;
  question: string;
  outcomes: string[];
  clobTokenIds: { YES: string; NO: string };
  liquidityNum: number;
  volumeNum: number;
  endDate: string;
  negRisk: boolean;
  matchScore: number;
}

interface GammaMarketRaw {
  conditionId?: string;
  slug?: string;
  question?: string;
  description?: string;
  outcomes?: string | string[];
  clobTokenIds?: string | string[];
  liquidityNum?: number | string;
  volumeNum?: number | string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  enableOrderBook?: boolean;
  negRisk?: boolean;
}

function parseStringArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toNumber(v: number | string | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalize(raw: GammaMarketRaw): GammaMarket | null {
  if (!raw.conditionId || !raw.question || !raw.slug) return null;
  const outcomes = parseStringArray(raw.outcomes);
  const clobTokenIds = parseStringArray(raw.clobTokenIds);
  if (outcomes.length !== 2 || clobTokenIds.length !== 2) return null;
  // Reject non-Yes/No markets so we never silently bet the wrong direction on
  // markets that use other binary phrasings (e.g. "Higher"/"Lower").
  const lower = outcomes.map((o) => o.toLowerCase().trim());
  if (!lower.includes("yes") || !lower.includes("no")) return null;
  return {
    conditionId: raw.conditionId,
    slug: raw.slug,
    question: raw.question,
    description: raw.description,
    outcomes,
    clobTokenIds,
    liquidityNum: toNumber(raw.liquidityNum),
    volumeNum: toNumber(raw.volumeNum),
    endDate: raw.endDate ?? "",
    active: raw.active ?? false,
    closed: raw.closed ?? false,
    enableOrderBook: raw.enableOrderBook ?? false,
    negRisk: raw.negRisk ?? false,
  };
}

export function toRanked(market: GammaMarket, matchScore = 0): RankedMarket {
  // normalize() guarantees outcomes contain "yes" and "no" (case-insensitive).
  const yesIdx = market.outcomes[0]!.toLowerCase().trim() === "yes" ? 0 : 1;
  const noIdx = 1 - yesIdx;
  return {
    conditionId: market.conditionId,
    slug: market.slug,
    question: market.question,
    outcomes: market.outcomes,
    clobTokenIds: {
      YES: market.clobTokenIds[yesIdx]!,
      NO: market.clobTokenIds[noIdx]!,
    },
    liquidityNum: market.liquidityNum,
    volumeNum: market.volumeNum,
    endDate: market.endDate,
    negRisk: market.negRisk ?? false,
    matchScore,
  };
}

async function gammaGet<T>(host: string, pathAndQuery: string): Promise<T> {
  const url = `${host}${pathAndQuery}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gamma ${res.status} ${url}: ${body}`);
  }
  return (await res.json()) as T;
}

export interface SearchOptions {
  limit?: number;
  minLiquidity?: number;
  host: string;
}

export async function searchMarkets(
  query: string,
  opts: SearchOptions,
): Promise<RankedMarket[]> {
  const limit = opts.limit ?? 5;
  const minLiquidity = opts.minLiquidity ?? 0;

  const candidates: GammaMarket[] = [];

  // Primary path: Gamma full-text search.
  const searchUrl = `/public-search?q=${encodeURIComponent(query)}&events_status=active&limit_per_type=20`;
  try {
    const result = await gammaGet<{ events?: Array<{ markets?: GammaMarketRaw[] }> }>(
      opts.host,
      searchUrl,
    );
    for (const event of result.events ?? []) {
      for (const m of event.markets ?? []) {
        const norm = normalize(m);
        if (norm && norm.active && !norm.closed && norm.enableOrderBook) {
          candidates.push(norm);
        }
      }
    }
  } catch {
    // fall through to list-markets keyword match
  }

  // Fallback / supplement: top-liquidity active markets, filtered by query terms.
  if (candidates.length < limit) {
    try {
      const result = await gammaGet<GammaMarketRaw[]>(
        opts.host,
        `/markets?closed=false&active=true&order=liquidityNum&ascending=false&limit=200`,
      );
      for (const m of result) {
        const norm = normalize(m);
        if (!norm || !norm.enableOrderBook) continue;
        if (candidates.some((c) => c.conditionId === norm.conditionId)) continue;
        candidates.push(norm);
      }
    } catch {
      // ignore
    }
  }

  const filtered = candidates.filter((m) => m.liquidityNum >= minLiquidity);
  const ranked = rankByQueryRelevance(filtered, query);
  return ranked.slice(0, limit).map((r) => toRanked(r.market, r.score));
}

export async function getMarket(
  host: string,
  conditionId: string,
): Promise<RankedMarket | null> {
  const result = await gammaGet<GammaMarketRaw[]>(
    host,
    `/markets?condition_ids=${encodeURIComponent(conditionId)}&closed=false&active=true`,
  );
  const first = result[0];
  if (!first) return null;
  const norm = normalize(first);
  return norm ? toRanked(norm) : null;
}
