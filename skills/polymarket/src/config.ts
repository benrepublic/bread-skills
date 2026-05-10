import * as path from "node:path";
import * as os from "node:os";

export interface Config {
  clobHost: string;
  gammaHost: string;
  dataApiHost: string;
  polygonRpc: string;
  chainId: number;
  credsPath: string;
  defaultMinLiquidityUsd: number;
  contracts: {
    pUsd: string;
    usdcE: string;
    onramp: string;
    ctfExchange: string;
    negRiskExchange: string;
    conditionalTokens: string;
  };
}

const DEFAULTS = {
  clobHost: "https://clob.polymarket.com",
  gammaHost: "https://gamma-api.polymarket.com",
  dataApiHost: "https://data-api.polymarket.com",
  polygonRpc: "https://polygon-rpc.com",
  chainId: 137,
  defaultMinLiquidityUsd: 500,
  contracts: {
    pUsd: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
    usdcE: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    onramp: "0x93070a847efEf7F70739046A929D47a521F5B8ee",
    ctfExchange: "0xE111180000d2663C0091e4f400237545B87B996B",
    negRiskExchange: "0xe2222d279d744050d28e00520010520000310F59",
    conditionalTokens: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  },
};

export function loadConfig(): Config {
  const credsPath =
    process.env.POLYMARKET_CREDS_PATH ??
    path.join(os.homedir(), ".polymarket-skill", "creds.json");
  return {
    clobHost: process.env.POLYMARKET_CLOB_HOST ?? DEFAULTS.clobHost,
    gammaHost: process.env.POLYMARKET_GAMMA_HOST ?? DEFAULTS.gammaHost,
    dataApiHost: process.env.POLYMARKET_DATA_API_HOST ?? DEFAULTS.dataApiHost,
    polygonRpc: process.env.POLYGON_RPC_URL ?? DEFAULTS.polygonRpc,
    chainId: process.env.POLYMARKET_CHAIN_ID
      ? Number(process.env.POLYMARKET_CHAIN_ID)
      : DEFAULTS.chainId,
    credsPath,
    defaultMinLiquidityUsd: process.env.POLYMARKET_MIN_LIQUIDITY
      ? Number(process.env.POLYMARKET_MIN_LIQUIDITY)
      : DEFAULTS.defaultMinLiquidityUsd,
    contracts: {
      pUsd: process.env.POLYMARKET_PUSD_ADDRESS ?? DEFAULTS.contracts.pUsd,
      usdcE: process.env.POLYMARKET_USDCE_ADDRESS ?? DEFAULTS.contracts.usdcE,
      onramp: process.env.POLYMARKET_ONRAMP_ADDRESS ?? DEFAULTS.contracts.onramp,
      ctfExchange:
        process.env.POLYMARKET_EXCHANGE_ADDRESS ?? DEFAULTS.contracts.ctfExchange,
      negRiskExchange:
        process.env.POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS ??
        DEFAULTS.contracts.negRiskExchange,
      conditionalTokens:
        process.env.POLYMARKET_CTF_ADDRESS ??
        DEFAULTS.contracts.conditionalTokens,
    },
  };
}
