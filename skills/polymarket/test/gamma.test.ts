import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { normalize, toRanked } from "../src/gamma";

describe("Gamma market normalization", () => {
  it("parses string-encoded JSON arrays returned by the public API", () => {
    const raw = {
      conditionId: "0xabc",
      slug: "hanta-2026",
      question: "Hantavirus pandemic 2026?",
      outcomes: '["Yes","No"]',
      clobTokenIds: '["111","222"]',
      liquidityNum: "1234.5",
      volumeNum: "9876",
      endDate: "2026-12-31T00:00:00Z",
      active: true,
      closed: false,
      enableOrderBook: true,
    };
    const norm = normalize(raw);
    assert.ok(norm);
    assert.deepEqual(norm.outcomes, ["Yes", "No"]);
    assert.deepEqual(norm.clobTokenIds, ["111", "222"]);
    assert.equal(norm.liquidityNum, 1234.5);
    assert.equal(norm.volumeNum, 9876);
  });

  it("rejects markets with missing token ids", () => {
    const norm = normalize({
      conditionId: "0xabc",
      slug: "x",
      question: "x",
      clobTokenIds: '["only-one"]',
    });
    assert.equal(norm, null);
  });

  it("rejects markets with no conditionId", () => {
    assert.equal(normalize({ slug: "x", question: "x" }), null);
  });
});

describe("toRanked YES/NO assignment", () => {
  it("maps YES to the first token when outcomes start with Yes", () => {
    const market = normalize({
      conditionId: "0xabc",
      slug: "x",
      question: "x",
      outcomes: '["Yes","No"]',
      clobTokenIds: '["yes-id","no-id"]',
      enableOrderBook: true,
      active: true,
    })!;
    const ranked = toRanked(market, 0.5);
    assert.equal(ranked.clobTokenIds.YES, "yes-id");
    assert.equal(ranked.clobTokenIds.NO, "no-id");
    assert.equal(ranked.matchScore, 0.5);
  });

  it("maps YES correctly even when outcomes are reversed", () => {
    const market = normalize({
      conditionId: "0xabc",
      slug: "x",
      question: "x",
      outcomes: '["No","Yes"]',
      clobTokenIds: '["no-id","yes-id"]',
      enableOrderBook: true,
      active: true,
    })!;
    const ranked = toRanked(market);
    assert.equal(ranked.clobTokenIds.YES, "yes-id");
    assert.equal(ranked.clobTokenIds.NO, "no-id");
  });
});
