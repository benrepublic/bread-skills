import { getBook, estimateBuyFill, estimateSellFill } from "../clob";
import {
  loadAuthedContext,
  parseSide,
  fetchActiveMarketOrFail,
} from "../context";
import { emit, fail } from "../util/io";

export interface QuoteOptions {
  json?: boolean;
  sell?: boolean;
}

export async function quoteCommand(
  conditionId: string,
  side: string,
  amountStr: string,
  opts: QuoteOptions,
): Promise<void> {
  const jsonOutput = !!opts.json;
  const sideUpper = parseSide(jsonOutput, side);
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    fail(
      jsonOutput,
      opts.sell
        ? `shares must be a positive number, got ${amountStr}`
        : `usdAmount must be a positive number, got ${amountStr}`,
    );
  }

  const { config, clob } = loadAuthedContext(jsonOutput);
  const market = await fetchActiveMarketOrFail(jsonOutput, config, conditionId);
  const tokenId = market.clobTokenIds[sideUpper];

  let book;
  try {
    book = await getBook(clob, tokenId);
  } catch (err) {
    fail(jsonOutput, "Failed to fetch order book", err instanceof Error ? err.message : err);
  }

  if (opts.sell) {
    const fill = estimateSellFill(book.bids, amount);
    const text = [
      `Market:           ${market.question}`,
      `Slug:             https://polymarket.com/event/${market.slug}`,
      `Action:           SELL ${sideUpper}`,
      `Shares in:        ${amount}`,
      `Filled shares:    ${fill.filledShares}`,
      fill.unfilledShares > 0
        ? `UNFILLED:         ${fill.unfilledShares} shares — book is too thin`
        : "Filled fully:     yes",
      `USD received:     $${fill.usdReceived.toFixed(2)}`,
      `Avg sell price:   $${fill.averagePrice.toFixed(4)} (implied ${(fill.averagePrice * 100).toFixed(2)}%)`,
      `Worst price hit:  $${fill.worstPrice.toFixed(4)}`,
      `End date:         ${market.endDate}`,
      `Liquidity:        $${market.liquidityNum.toLocaleString()}`,
    ].join("\n");
    emit(jsonOutput, text, {
      market: {
        conditionId: market.conditionId,
        question: market.question,
        slug: market.slug,
        endDate: market.endDate,
        liquidityNum: market.liquidityNum,
        negRisk: market.negRisk,
      },
      action: "SELL",
      side: sideUpper,
      tokenId,
      shares: amount,
      fill,
    });
    return;
  }

  const fill = estimateBuyFill(book.asks, amount);
  const text = [
    `Market:           ${market.question}`,
    `Slug:             https://polymarket.com/event/${market.slug}`,
    `Action:           BUY ${sideUpper}`,
    `USD in:           $${amount.toFixed(2)}`,
    `Filled USD:       $${fill.filledUsd.toFixed(2)}`,
    fill.unfilledUsd > 0
      ? `UNFILLED:         $${fill.unfilledUsd.toFixed(2)} — book is too thin for this size`
      : "Filled fully:     yes",
    `Expected shares:  ${fill.shares.toFixed(4)}`,
    `Avg fill price:   $${fill.averagePrice.toFixed(4)} (implied ${(fill.averagePrice * 100).toFixed(2)}%)`,
    `Worst price hit:  $${fill.worstPrice.toFixed(4)}`,
    `End date:         ${market.endDate}`,
    `Liquidity:        $${market.liquidityNum.toLocaleString()}`,
  ].join("\n");

  emit(jsonOutput, text, {
    market: {
      conditionId: market.conditionId,
      question: market.question,
      slug: market.slug,
      endDate: market.endDate,
      liquidityNum: market.liquidityNum,
      negRisk: market.negRisk,
    },
    action: "BUY",
    side: sideUpper,
    tokenId,
    usdAmount: amount,
    fill,
  });
}
