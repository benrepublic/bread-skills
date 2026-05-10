import { getBook, getTickSize, estimateSellFill } from "../clob";
import {
  loadAuthedContext,
  parseSide,
  fetchActiveMarketOrFail,
  requireSellReady,
} from "../context";
import { emit, fail } from "../util/io";

export interface SellOptions {
  json?: boolean;
  confirm?: boolean;
  type?: "FOK" | "FAK" | "GTC";
  limitPrice?: number;
  maxSlippageBps?: number;
}

export async function sellCommand(
  conditionId: string,
  side: string,
  sharesStr: string,
  opts: SellOptions,
): Promise<void> {
  const jsonOutput = !!opts.json;

  if (!opts.confirm) {
    fail(
      jsonOutput,
      "refusing to place a sell order without --confirm. Show the user the quote first, get explicit approval, then re-run with --confirm.",
    );
  }

  const sideUpper = parseSide(jsonOutput, side);
  const shares = Number(sharesStr);
  if (!Number.isFinite(shares) || shares <= 0) {
    fail(jsonOutput, `shares must be a positive number, got ${sharesStr}`);
  }
  if (opts.type != null && !["FOK", "FAK", "GTC"].includes(opts.type)) {
    fail(jsonOutput, `--type must be FOK, FAK, or GTC, got ${opts.type}`);
  }
  if (opts.type === "GTC" && opts.limitPrice == null) {
    fail(jsonOutput, "--type GTC requires --limit-price");
  }
  if (opts.limitPrice != null && (opts.limitPrice <= 0 || opts.limitPrice >= 1)) {
    fail(jsonOutput, `--limit-price must be strictly between 0 and 1, got ${opts.limitPrice}`);
  }

  const { config, clob, eoa } = loadAuthedContext(jsonOutput);
  await requireSellReady(jsonOutput, config, eoa);

  const market = await fetchActiveMarketOrFail(jsonOutput, config, conditionId);
  const tokenId = market.clobTokenIds[sideUpper];

  const [book, tickSize] = await Promise.all([
    getBook(clob, tokenId),
    getTickSize(clob, tokenId),
  ]);

  const fill = estimateSellFill(book.bids, shares);

  if (opts.maxSlippageBps != null && fill.averagePrice > 0) {
    const topBid = book.bids[0]?.price ?? fill.averagePrice;
    if (topBid > 0) {
      // Sells are worse when price drops. Compare top-bid - avg, not avg - top.
      const slippageBps = ((topBid - fill.averagePrice) / topBid) * 10_000;
      if (slippageBps > opts.maxSlippageBps) {
        fail(
          jsonOutput,
          `Slippage guard tripped: average sell ${fill.averagePrice.toFixed(4)} is ${slippageBps.toFixed(0)} bps below top-of-book ${topBid.toFixed(4)} (limit ${opts.maxSlippageBps} bps).`,
        );
      }
    }
  }

  const orderType = opts.type ?? (opts.limitPrice == null ? "FOK" : "GTC");
  let response: unknown;
  try {
    if (orderType === "GTC" && opts.limitPrice != null) {
      response = await clob.client.createAndPostOrder(
        {
          tokenID: tokenId,
          price: opts.limitPrice,
          side: clob.Side.SELL,
          size: shares,
        },
        { tickSize, negRisk: market.negRisk },
        clob.OrderType.GTC,
      );
    } else {
      const fokType = orderType === "FAK" ? clob.OrderType.FAK : clob.OrderType.FOK;
      response = await clob.client.createAndPostMarketOrder(
        {
          // Market sells: `amount` is shares (token units), not USD.
          tokenID: tokenId,
          amount: shares,
          side: clob.Side.SELL,
          orderType: fokType,
        },
        { tickSize, negRisk: market.negRisk },
        fokType,
      );
    }
  } catch (err) {
    fail(jsonOutput, "Sell rejected by CLOB", err instanceof Error ? err.message : err);
  }

  emit(
    jsonOutput,
    `Sell submitted.\n${JSON.stringify(response, null, 2)}`,
    {
      market: {
        conditionId: market.conditionId,
        question: market.question,
        slug: market.slug,
      },
      side: sideUpper,
      shares,
      orderType,
      tickSize,
      preFlightFill: fill,
      response,
    },
  );
}
