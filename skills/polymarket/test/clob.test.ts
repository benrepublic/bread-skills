import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { estimateBuyFill, estimateSellFill } from "../src/clob";

describe("estimateBuyFill", () => {
  it("fills entirely at the best ask when depth is enough", () => {
    const fill = estimateBuyFill([{ price: 0.05, size: 10_000 }], 100);
    assert.equal(fill.unfilledUsd, 0);
    assert.equal(fill.filledUsd, 100);
    assert.equal(fill.shares, 100 / 0.05);
    assert.equal(fill.averagePrice, 0.05);
    assert.equal(fill.worstPrice, 0.05);
  });

  it("walks the book when the top level is too small", () => {
    const fill = estimateBuyFill(
      [
        { price: 0.04, size: 1_000 }, // $40 of liquidity
        { price: 0.05, size: 1_000 }, // $50 of liquidity
        { price: 0.06, size: 1_000 }, // $60 of liquidity
      ],
      100,
    );
    assert.equal(fill.filledUsd, 100);
    assert.equal(fill.unfilledUsd, 0);
    // Spent $40 at 0.04, $50 at 0.05, $10 at 0.06 → 1000 + 1000 + 166.67 = 2166.67 shares
    assert.ok(Math.abs(fill.shares - (1000 + 1000 + 10 / 0.06)) < 1e-6);
    assert.equal(fill.worstPrice, 0.06);
    assert.ok(fill.averagePrice > 0.04 && fill.averagePrice < 0.06);
  });

  it("reports unfilled when the book is too thin", () => {
    const fill = estimateBuyFill([{ price: 0.10, size: 100 }], 1_000);
    // book holds $10 of liquidity at $0.10
    assert.equal(fill.filledUsd, 10);
    assert.equal(fill.unfilledUsd, 990);
    assert.equal(fill.shares, 100);
    assert.equal(fill.averagePrice, 0.10);
  });

  it("handles an empty book", () => {
    const fill = estimateBuyFill([], 50);
    assert.equal(fill.shares, 0);
    assert.equal(fill.filledUsd, 0);
    assert.equal(fill.unfilledUsd, 50);
    assert.equal(fill.averagePrice, 0);
  });

  it("sorts asks even if the book arrives out of order", () => {
    const fill = estimateBuyFill(
      [
        { price: 0.07, size: 1_000 },
        { price: 0.04, size: 1_000 },
      ],
      40,
    );
    assert.equal(fill.worstPrice, 0.04);
    assert.equal(fill.averagePrice, 0.04);
  });
});

describe("estimateSellFill", () => {
  it("fills entirely at the best bid when depth is enough", () => {
    const fill = estimateSellFill([{ price: 0.30, size: 1_000 }], 100);
    assert.equal(fill.filledShares, 100);
    assert.equal(fill.unfilledShares, 0);
    assert.equal(fill.usdReceived, 30);
    assert.equal(fill.averagePrice, 0.30);
    assert.equal(fill.worstPrice, 0.30);
  });

  it("walks bids high → low when the top level is too small", () => {
    const fill = estimateSellFill(
      [
        { price: 0.30, size: 50 },
        { price: 0.28, size: 50 },
        { price: 0.25, size: 50 },
      ],
      120,
    );
    // 50 @ 0.30 = $15, 50 @ 0.28 = $14, 20 @ 0.25 = $5 → $34 for 120 shares
    assert.equal(fill.filledShares, 120);
    assert.equal(fill.unfilledShares, 0);
    assert.ok(Math.abs(fill.usdReceived - 34) < 1e-9);
    assert.equal(fill.worstPrice, 0.25);
    assert.ok(fill.averagePrice < 0.30 && fill.averagePrice > 0.25);
  });

  it("reports unfilled when the book is too thin", () => {
    const fill = estimateSellFill([{ price: 0.20, size: 10 }], 100);
    assert.equal(fill.filledShares, 10);
    assert.equal(fill.unfilledShares, 90);
    assert.equal(fill.usdReceived, 2);
    assert.equal(fill.averagePrice, 0.20);
  });

  it("handles an empty book", () => {
    const fill = estimateSellFill([], 50);
    assert.equal(fill.filledShares, 0);
    assert.equal(fill.unfilledShares, 50);
    assert.equal(fill.usdReceived, 0);
    assert.equal(fill.averagePrice, 0);
  });

  it("sorts bids even if they arrive out of order", () => {
    const fill = estimateSellFill(
      [
        { price: 0.20, size: 1_000 },
        { price: 0.40, size: 1_000 },
      ],
      100,
    );
    // Should sell at 0.40 first.
    assert.equal(fill.worstPrice, 0.40);
    assert.equal(fill.averagePrice, 0.40);
    assert.equal(fill.usdReceived, 40);
  });
});
