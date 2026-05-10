import type { GammaMarket } from "./gamma";

const STOP_WORDS = new Set([
  "a", "an", "and", "or", "the", "is", "are", "was", "were", "be", "been",
  "to", "of", "in", "on", "at", "by", "for", "with", "about", "as", "from",
  "will", "would", "should", "can", "could", "may", "might", "must", "shall",
  "i", "you", "we", "they", "it", "this", "that", "these", "those",
  "do", "does", "did", "have", "has", "had", "if", "than", "then",
  "bet", "bets", "betting", "wager", "want", "would", "like",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s%$.]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export interface ScoredMarket {
  market: GammaMarket;
  score: number;
}

export function rankByQueryRelevance(
  markets: GammaMarket[],
  query: string,
): ScoredMarket[] {
  const qTokens = new Set(tokenize(query));
  const scored: ScoredMarket[] = markets.map((m) => {
    const docTokens = new Set([
      ...tokenize(m.question),
      ...tokenize(m.description ?? ""),
      ...tokenize(m.slug.replace(/-/g, " ")),
    ]);
    const relevance = jaccard(qTokens, docTokens);
    const liquidityWeight = Math.log10(Math.max(1, m.liquidityNum)) / 6; // ~$1M liquidity ≈ 1.0
    const score = 0.7 * relevance + 0.3 * Math.min(1, liquidityWeight);
    return { market: m, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.market.liquidityNum - a.market.liquidityNum;
  });
  return scored;
}
