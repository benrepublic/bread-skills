import type { Wallet } from "ethers";
import { loadConfig, type Config } from "./config";
import { loadCreds, type Creds } from "./creds";
import { mnemonicToWallet } from "./wallet";
import { buildClient, type ClobContext } from "./clob";
import { getMarket } from "./gamma";
import type { RankedMarket } from "./gamma";
import { ctfApprovedForAll, pUsdAllowance } from "./chain";
import { fail, getPassphrase } from "./util/io";

export interface SignerContext {
  config: Config;
  creds: Creds;
  signer: Wallet;
  eoa: string;
}

export interface AuthedContext extends SignerContext {
  clob: ClobContext;
}

/**
 * Resolves config + decrypted creds + signer for commands that touch the
 * wallet on-chain but don't need the CLOB SDK. Exits the process via fail()
 * with a clear error if creds are missing, the passphrase is wrong, or the
 * mnemonic is invalid.
 */
export function loadSignerContext(jsonOutput: boolean): SignerContext {
  const config = loadConfig();
  let creds: Creds;
  try {
    creds = loadCreds(config.credsPath, { passphrase: getPassphrase() });
  } catch (err) {
    fail(jsonOutput, err instanceof Error ? err.message : "Failed to load creds");
  }
  const signer = mnemonicToWallet(creds.mnemonic);
  return { config, creds, signer, eoa: signer.address };
}

/** Same as loadSignerContext but also constructs an authed CLOB client. */
export function loadAuthedContext(jsonOutput: boolean): AuthedContext {
  const ctx = loadSignerContext(jsonOutput);
  const clob = buildClient(ctx.config, ctx.creds, ctx.signer);
  return { ...ctx, clob };
}

export function parseSide(jsonOutput: boolean, raw: string): "YES" | "NO" {
  const upper = raw.toUpperCase();
  if (upper !== "YES" && upper !== "NO") {
    fail(jsonOutput, `side must be YES or NO, got ${raw}`);
  }
  return upper;
}

export function parsePositiveUsd(jsonOutput: boolean, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    fail(jsonOutput, `usdAmount must be a positive number, got ${raw}`);
  }
  return n;
}

export async function fetchActiveMarketOrFail(
  jsonOutput: boolean,
  config: Config,
  conditionId: string,
): Promise<RankedMarket> {
  const market = await getMarket(config.gammaHost, conditionId);
  if (!market) {
    fail(jsonOutput, `Market ${conditionId} not found, not active, or not binary YES/NO`);
  }
  return market;
}

/**
 * Pre-flights the on-chain allowance needed to BUY: pUSD must be approved to
 * the exchange. Without this, the CLOB returns NOT_ENOUGH_ALLOWANCE.
 */
export async function requireBuyReady(
  jsonOutput: boolean,
  config: Config,
  eoa: string,
): Promise<void> {
  const allowance = await pUsdAllowance(config, eoa);
  if (allowance === 0n) {
    fail(
      jsonOutput,
      `pUSD exchange allowance not set on ${eoa}. Run \`poly fund 0 --confirm\` to enable buying.`,
    );
  }
}

/**
 * Pre-flights the on-chain approval needed to SELL: the exchange must be set
 * as `setApprovalForAll(true)` on the Conditional Tokens contract so it can
 * pull the YES/NO tokens being sold. Without this, the CLOB returns
 * NOT_ENOUGH_ALLOWANCE on sells.
 */
export async function requireSellReady(
  jsonOutput: boolean,
  config: Config,
  eoa: string,
): Promise<void> {
  const approved = await ctfApprovedForAll(config, eoa);
  if (!approved) {
    fail(
      jsonOutput,
      `CTF setApprovalForAll not set on ${eoa}. Run \`poly fund 0 --confirm\` to enable selling.`,
    );
  }
}
