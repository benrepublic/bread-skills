import { getBook, getTickSize, estimateBuyFill } from "../clob";
import {
  loadAuthedContext,
  parseSide,
  parsePositiveUsd,
  fetchActiveMarketOrFail,
} from "../context";
import { readBalances, parseSixDecimal, pUsdAllowance } from "../chain";
import { emit, fail } from "../util/io";

export interface BetOptions {
  json?: boolean;
  confirm?: boolean;
  type?: "FOK" | "FAK" | "GTC";
  limitPrice?: number;
  maxSlippageBps?: number;
  override?: boolean;
}

export async function betCommand(
  conditionId: string,
  side: string,
  usdAmountStr: string,
  opts: BetOptions,
): Promise<void> {
  const jsonOutput = !!opts.json;

  if (!opts.confirm) {
    fail(
      jsonOutput,
      "refusing to place an order without --confirm. Show the user the quote first, get explicit approval, then re-run with --confirm.",
    );
  }

  const sideUpper = parseSide(jsonOutput, side);
  const usdAmount = parsePositiveUsd(jsonOutput, usdAmountStr);

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
  const market = await fetchActiveMarketOrFail(jsonOutput, config, conditionId);

  if (market.liquidityNum < config.defaultMinLiquidityUsd && !opts.override) {
    fail(
      jsonOutput,
      `Market liquidity $${market.liquidityNum.toLocaleString()} is below the floor $${config.defaultMinLiquidityUsd}. Re-run with --override to proceed.`,
    );
  }

  const tokenId = market.clobTokenIds[sideUpper];

  // Pre-flight balance, book, tick size, AND allowance in parallel. Without
  // the pUSD-exchange allowance the CLOB returns NOT_ENOUGH_ALLOWANCE on
  // submit; check it locally up front rather than serializing a separate
  // RPC before the Promise.all.
  const [balances, book, tickSize, pUsdAllow] = await Promise.all([
    readBalances(config, eoa),
    getBook(clob, tokenId),
    getTickSize(clob, tokenId),
    pUsdAllowance(config, eoa),
  ]);
  if (pUsdAllow === 0n) {
    fail(
      jsonOutput,
      `pUSD exchange allowance not set on ${eoa}. Run \`poly fund 0 --confirm\` to enable buying.`,
    );
  }

  const requiredRaw = parseSixDecimal(usdAmount);
  if (balances.raw.pUsd < requiredRaw) {
    fail(
      jsonOutput,
      `Not enough money ready to bet: your wallet has ${balances.pUsd} pUSD, but this bet needs $${usdAmount}. ` +
        `If you have USDC.e in your wallet, run \`poly fund ${usdAmount} --confirm\` to activate it for betting. ` +
        `If you don't have USDC.e yet, send some to ${eoa} on Polygon (e.g., withdraw USDC from Coinbase to "Polygon" network), then run \`poly fund\`.`,
    );
  }

  const fill = estimateBuyFill(book.asks, usdAmount);
  if (opts.maxSlippageBps != null && fill.averagePrice > 0) {
    const topAsk = book.asks[0]?.price ?? fill.averagePrice;
    if (topAsk > 0) {
      const slippageBps = ((fill.averagePrice - topAsk) / topAsk) * 10_000;
      if (slippageBps > opts.maxSlippageBps) {
        fail(
          jsonOutput,
          `Slippage guard tripped: average fill ${fill.averagePrice.toFixed(4)} is ${slippageBps.toFixed(0)} bps over top-of-book ${topAsk.toFixed(4)} (limit ${opts.maxSlippageBps} bps).`,
        );
      }
    }
  }

  const orderType = opts.type ?? (opts.limitPrice == null ? "FOK" : "GTC");
  let response: unknown;
  try {
    if (orderType === "GTC" && opts.limitPrice != null) {
      // Limit-order size is in token units. Don't round here — let the SDK
      // handle precision per the market's tick size (e.g. 0.01 → 2dp size).
      const size = usdAmount / opts.limitPrice;
      response = await clob.client.createAndPostOrder(
        {
          tokenID: tokenId,
          price: opts.limitPrice,
          side: clob.Side.BUY,
          size,
        },
        { tickSize, negRisk: market.negRisk },
        clob.OrderType.GTC,
      );
    } else {
      const fokType = orderType === "FAK" ? clob.OrderType.FAK : clob.OrderType.FOK;
      response = await clob.client.createAndPostMarketOrder(
        {
          tokenID: tokenId,
          amount: usdAmount,
          side: clob.Side.BUY,
          orderType: fokType,
        },
        { tickSize, negRisk: market.negRisk },
        fokType,
      );
    }
  } catch (err) {
    fail(jsonOutput, "Order rejected by CLOB", err instanceof Error ? err.message : err);
  }

  emit(
    jsonOutput,
    `Order submitted.\n${JSON.stringify(response, null, 2)}`,
    {
      market: {
        conditionId: market.conditionId,
        question: market.question,
        slug: market.slug,
      },
      side: sideUpper,
      usdAmount,
      orderType,
      tickSize,
      preFlightFill: fill,
      response,
    },
  );
}
