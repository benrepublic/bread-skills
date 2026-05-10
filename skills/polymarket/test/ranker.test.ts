import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { rankByQueryRelevance } from "../src/ranker";
import type { GammaMarket } from "../src/gamma";

function mkMarket(over: Partial<GammaMarket>): GammaMarket {
  return {
    conditionId: over.conditionId ?? "0xdead",
    slug: over.slug ?? "x",
    question: over.question ?? "",
    description: over.description,
    outcomes: ["Yes", "No"],
    clobTokenIds: ["1", "2"],
    liquidityNum: over.liquidityNum ?? 0,
    volumeNum: over.volumeNum ?? 0,
    endDate: "2026-12-31T00:00:00Z",
    active: true,
    closed: false,
    enableOrderBook: true,
    negRisk: false,
    ...over,
  };
}

describe("rankByQueryRelevance", () => {
  it("scores a topical match higher than an unrelated big-liquidity market", () => {
    const markets: GammaMarket[] = [
      mkMarket({
        question: "Will there be a hantavirus pandemic in 2026?",
        slug: "hantavirus-pandemic-2026",
        liquidityNum: 5_000,
      }),
      mkMarket({
        question: "Will the Lakers win the NBA championship?",
        slug: "lakers-championship",
        liquidityNum: 5_000_000,
      }),
    ];
    const ranked = rankByQueryRelevance(markets, "hantavirus pandemic 2026");
    assert.equal(ranked[0]!.market.slug, "hantavirus-pandemic-2026");
  });

  it("breaks ties by liquidity when relevance is equal", () => {
    const markets: GammaMarket[] = [
      mkMarket({
        question: "Will Bitcoin close above $200k?",
        slug: "btc-low",
        liquidityNum: 1_000,
      }),
      mkMarket({
        question: "Will Bitcoin close above $200k?",
        slug: "btc-high",
        liquidityNum: 100_000,
      }),
    ];
    const ranked = rankByQueryRelevance(markets, "bitcoin 200k");
    assert.equal(ranked[0]!.market.slug, "btc-high");
  });

  it("filters out stop-words from the query", () => {
    const markets: GammaMarket[] = [
      mkMarket({ question: "Will the GOP win the 2026 midterms?", slug: "gop", liquidityNum: 1_000 }),
      mkMarket({ question: "Will the Eagles win the Super Bowl?", slug: "eagles", liquidityNum: 1_000 }),
    ];
    // "the" / "will" / "win" are noise; "gop midterms" should hit the GOP market.
    const ranked = rankByQueryRelevance(markets, "will the gop win the midterms");
    assert.equal(ranked[0]!.market.slug, "gop");
  });

  it("returns a stable order for empty input", () => {
    assert.deepEqual(rankByQueryRelevance([], "anything"), []);
  });
});
