import { ethers } from "ethers";
import type { Creds } from "./creds";
import type { Config } from "./config";

// The V2 SDK exports change shape with patch releases; we type-import loosely
// and validate the methods we touch at runtime so older patch versions still load.
type AnyClobClient = {
  createOrDeriveApiKey: () => Promise<{
    key: string;
    secret: string;
    passphrase: string;
  }>;
  getOrderBook: (tokenId: string) => Promise<{
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
  }>;
  getTickSize?: (tokenId: string) => Promise<string>;
  createAndPostOrder: (
    args: { tokenID: string; price: number; side: "BUY" | "SELL"; size: number },
    config: { tickSize: string; negRisk?: boolean },
    orderType: "GTC" | "FOK" | "FAK" | "GTD",
  ) => Promise<unknown>;
  createAndPostMarketOrder: (
    args: {
      tokenID: string;
      amount: number;
      side: "BUY" | "SELL";
      orderType: "FOK" | "FAK";
    },
    config: { tickSize: string; negRisk?: boolean },
    orderType: "FOK" | "FAK",
  ) => Promise<unknown>;
};

interface ClobModule {
  ClobClient: new (opts: {
    host: string;
    chain: number;
    signer: ethers.Wallet;
    creds?: { key: string; secret: string; passphrase: string };
  }) => AnyClobClient;
  Side: { BUY: "BUY"; SELL: "SELL" };
  OrderType: { GTC: "GTC"; FOK: "FOK"; FAK: "FAK"; GTD: "GTD" };
}

let cached: ClobModule | null = null;
function loadSdk(): ClobModule {
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@polymarket/clob-client-v2") as Partial<ClobModule>;
  if (!mod.ClobClient) {
    throw new Error(
      "Polymarket CLOB SDK not installed. Run `npm install` in the skill directory.",
    );
  }
  cached = mod as ClobModule;
  return cached;
}

export interface ClobContext {
  client: AnyClobClient;
  signer: ethers.Wallet;
  Side: ClobModule["Side"];
  OrderType: ClobModule["OrderType"];
}

export function buildClient(
  config: Config,
  creds: Creds,
  signer: ethers.Wallet,
): ClobContext {
  const sdk = loadSdk();
  const client = new sdk.ClobClient({
    host: config.clobHost,
    chain: config.chainId,
    signer,
    creds: creds.apiKey,
  });
  return { client, signer, Side: sdk.Side, OrderType: sdk.OrderType };
}

export async function deriveApiKey(
  config: Config,
  signer: ethers.Wallet,
): Promise<{ key: string; secret: string; passphrase: string }> {
  const sdk = loadSdk();
  const client = new sdk.ClobClient({
    host: config.clobHost,
    chain: config.chainId,
    signer,
  });
  return client.createOrDeriveApiKey();
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
}

export async function getBook(
  ctx: ClobContext,
  tokenId: string,
): Promise<OrderBook> {
  const raw = await ctx.client.getOrderBook(tokenId);
  return {
    bids: raw.bids.map((b) => ({ price: Number(b.price), size: Number(b.size) })),
    asks: raw.asks.map((a) => ({ price: Number(a.price), size: Number(a.size) })),
  };
}

/**
 * Fetches the per-market tick size, falling back to "0.01" (the most common
 * Polymarket value) if the SDK build doesn't expose getTickSize. Tick sizes on
 * Polymarket are one of "0.1" / "0.01" / "0.001" / "0.0001".
 */
export async function getTickSize(
  ctx: ClobContext,
  tokenId: string,
): Promise<string> {
  if (typeof ctx.client.getTickSize !== "function") return "0.01";
  try {
    const ts = await ctx.client.getTickSize(tokenId);
    return ts && /^0\.(1|01|001|0001)$/.test(ts) ? ts : "0.01";
  } catch {
    return "0.01";
  }
}

export interface BuyFillEstimate {
  shares: number;
  averagePrice: number;
  worstPrice: number;
  filledUsd: number;
  unfilledUsd: number;
}

export interface SellFillEstimate {
  filledShares: number;
  unfilledShares: number;
  usdReceived: number;
  averagePrice: number;
  worstPrice: number;
}

/**
 * Walks the ask side computing how many shares $usdAmount fills, the average
 * fill price, and the worst price hit. Pure function — no orders posted.
 */
export function estimateBuyFill(
  asks: BookLevel[],
  usdAmount: number,
): BuyFillEstimate {
  // Asks are usually low→high; sort to be safe.
  const sorted = [...asks].sort((a, b) => a.price - b.price);
  let remainingUsd = usdAmount;
  let shares = 0;
  let weightedPriceUsd = 0;
  let worstPrice = 0;
  for (const level of sorted) {
    if (remainingUsd <= 0) break;
    if (level.price <= 0 || level.size <= 0) continue;
    const levelUsd = level.price * level.size;
    const takeUsd = Math.min(remainingUsd, levelUsd);
    const takeShares = takeUsd / level.price;
    shares += takeShares;
    weightedPriceUsd += takeUsd;
    worstPrice = level.price;
    remainingUsd -= takeUsd;
  }
  return {
    shares,
    averagePrice: shares > 0 ? weightedPriceUsd / shares : 0,
    worstPrice,
    filledUsd: usdAmount - remainingUsd,
    unfilledUsd: remainingUsd,
  };
}

/**
 * Walks the bid side computing how much pUSD a `shares`-share sell receives.
 * Pure function — no orders posted.
 */
export function estimateSellFill(
  bids: BookLevel[],
  shares: number,
): SellFillEstimate {
  // Bids are usually high→low; sort to be safe.
  const sorted = [...bids].sort((a, b) => b.price - a.price);
  let remainingShares = shares;
  let usdReceived = 0;
  let worstPrice = 0;
  for (const level of sorted) {
    if (remainingShares <= 0) break;
    if (level.price <= 0 || level.size <= 0) continue;
    const take = Math.min(remainingShares, level.size);
    usdReceived += take * level.price;
    worstPrice = level.price;
    remainingShares -= take;
  }
  const filledShares = shares - remainingShares;
  return {
    filledShares,
    unfilledShares: remainingShares,
    usdReceived,
    averagePrice: filledShares > 0 ? usdReceived / filledShares : 0,
    worstPrice,
  };
}
