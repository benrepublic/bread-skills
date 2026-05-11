import { loadConfig } from "../config";
import { credsExist, readEoaWithoutDecrypting } from "../creds";
import { readBalances, pUsdAllowance, ctfApprovedForAll } from "../chain";
import { emit } from "../util/io";

export interface SetupOptions {
  json?: boolean;
}

type SetupState =
  | "no-wallet"
  | "no-gas"
  | "no-usdce"
  | "needs-wrap"
  | "needs-allowances"
  | "ready";

interface SetupSnapshot {
  state: SetupState;
  eoa: string | null;
  balances: {
    pol: string;
    usdcE: string;
    pUsd: string;
  } | null;
  allowances: {
    pUsd: boolean;
    ctf: boolean;
  } | null;
}

/**
 * Onboards a fresh user with a chat-pasteable, state-aware next-action
 * message. The output is designed to render legibly on terminal AND when
 * forwarded verbatim to WhatsApp/Telegram by an agent — code fences become
 * monospace blocks the user can tap-to-copy, plain text wraps cleanly.
 */
export async function setupCommand(opts: SetupOptions): Promise<void> {
  const jsonOutput = !!opts.json;
  const config = loadConfig();

  // State 1: no wallet yet
  if (!credsExist(config.credsPath)) {
    const snapshot: SetupSnapshot = {
      state: "no-wallet",
      eoa: null,
      balances: null,
      allowances: null,
    };
    emit(jsonOutput, renderNoWallet(), snapshot);
    return;
  }

  const eoa = readEoaWithoutDecrypting(config.credsPath);
  if (!eoa) {
    // Shouldn't happen — creds exist but no EOA in marker. Tell them to re-login.
    emit(jsonOutput, renderNoWallet(), {
      state: "no-wallet",
      eoa: null,
      balances: null,
      allowances: null,
    });
    return;
  }

  const [balances, pUsdAllow, ctfApproved] = await Promise.all([
    readBalances(config, eoa),
    pUsdAllowance(config, eoa),
    ctfApprovedForAll(config, eoa),
  ]);

  const hasGas = balances.raw.matic > 0n;
  const hasUsdcE = balances.raw.usdcE > 0n;
  const hasPusd = balances.raw.pUsd > 0n;
  const allowancesSet = pUsdAllow > 0n && ctfApproved;

  // State 2: wallet exists but no POL for gas (always blocks any tx)
  if (!hasGas) {
    emit(jsonOutput, renderNoGas(eoa, balances), {
      state: "no-gas",
      eoa,
      balances: pickBalances(balances),
      allowances: { pUsd: pUsdAllow > 0n, ctf: ctfApproved },
    });
    return;
  }

  // State 3: has gas but no USDC.e — user needs to send USDC.e first
  if (!hasUsdcE && !hasPusd) {
    emit(jsonOutput, renderNoUsdce(eoa, balances), {
      state: "no-usdce",
      eoa,
      balances: pickBalances(balances),
      allowances: { pUsd: pUsdAllow > 0n, ctf: ctfApproved },
    });
    return;
  }

  // State 4: has USDC.e but it isn't wrapped into pUSD yet (or allowances missing)
  if (hasUsdcE && (!hasPusd || !allowancesSet)) {
    const wholeUsdcE = Math.floor(Number(balances.usdcE));
    const suggestedAmount = wholeUsdcE > 0 ? wholeUsdcE : Number(balances.usdcE);
    emit(jsonOutput, renderNeedsWrap(eoa, balances, suggestedAmount), {
      state: "needs-wrap",
      eoa,
      balances: pickBalances(balances),
      allowances: { pUsd: pUsdAllow > 0n, ctf: ctfApproved },
    });
    return;
  }

  // State 5: pUSD present but allowances not set (rare — fund.ts sets these
  // automatically when wrapping, but a hand-funded wallet can hit this)
  if (hasPusd && !allowancesSet) {
    emit(jsonOutput, renderNeedsAllowances(eoa, balances), {
      state: "needs-allowances",
      eoa,
      balances: pickBalances(balances),
      allowances: { pUsd: pUsdAllow > 0n, ctf: ctfApproved },
    });
    return;
  }

  // State 6: fully ready
  emit(jsonOutput, renderReady(eoa, balances), {
    state: "ready",
    eoa,
    balances: pickBalances(balances),
    allowances: { pUsd: pUsdAllow > 0n, ctf: ctfApproved },
  });
}

function pickBalances(b: { matic: string; usdcE: string; pUsd: string }) {
  return { pol: b.matic, usdcE: b.usdcE, pUsd: b.pUsd };
}

// ─── Text renderers ──────────────────────────────────────────────────────
// All output uses fenced code blocks for commands and EOAs so they render
// as tap-to-copy monospace in WhatsApp/Telegram when forwarded by an agent.
// Plain text everywhere else — no headers, no inline markdown that mobile
// chat clients drop on the floor.

function renderNoWallet(): string {
  return [
    "Polymarket skill — setup",
    "",
    "Step 1 of 3: Create your betting wallet.",
    "",
    "Run this in a terminal on your computer:",
    "",
    "```",
    "poly login",
    "```",
    "",
    "It will prompt you to paste a 12-word BIP-39 mnemonic. The mnemonic is stored in your OS keychain (macOS Keychain or Linux libsecret) and never crosses any chat.",
    "",
    "If you don't already have a mnemonic, generate a fresh one in any wallet (MetaMask, Rabby, etc.) — this becomes your dedicated Polymarket betting wallet, separate from your main funds.",
    "",
    "After login, run:",
    "",
    "```",
    "poly setup",
    "```",
    "",
    "and it will show you the next step.",
  ].join("\n");
}

function renderNoGas(eoa: string, balances: { matic: string; usdcE: string; pUsd: string }): string {
  return [
    "Polymarket skill — setup",
    "",
    "Wallet ready ✓",
    "",
    "Your Polymarket EOA:",
    "",
    "```",
    eoa,
    "```",
    "",
    "Current balances:",
    `  POL (gas):  ${balances.matic}`,
    `  USDC.e:     ${balances.usdcE}`,
    `  pUSD:       ${balances.pUsd}`,
    "",
    "Step 2 of 3: Send a small amount of POL (Polygon's native gas token, formerly MATIC) to this address.",
    "",
    "About $0.50 is plenty — gas on Polygon is ~$0.001 per transaction. Many CEX withdrawals deliver POL natively. Or use a Polygon faucet if you only need a tiny amount.",
    "",
    "You'll also need USDC.e (the bridged USDC, contract `0x2791Bca1...`) — see below. POL and USDC.e can be sent in the same step.",
    "",
    "After sending, run:",
    "",
    "```",
    "poly setup",
    "```",
  ].join("\n");
}

function renderNoUsdce(eoa: string, balances: { matic: string; usdcE: string; pUsd: string }): string {
  return [
    "Polymarket skill — setup",
    "",
    "Wallet ready ✓",
    `POL (gas) ready ✓ (${balances.matic} POL)`,
    "",
    "Your Polymarket EOA:",
    "",
    "```",
    eoa,
    "```",
    "",
    "Step 2 of 3: Send USDC.e to this address on the Polygon network.",
    "",
    "IMPORTANT: Polymarket only accepts USDC.e — the original BRIDGED USDC contract:",
    "",
    "```",
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "```",
    "",
    "Polygon also has a NEWER native USDC (`0x3c499c...`) that looks identical in most wallets but is INCOMPATIBLE. If you send native USDC to this EOA, the skill won't see it.",
    "",
    "Source options:",
    "  • Coinbase: withdraw USDC → choose Polygon network → paste this address. Coinbase delivers USDC.e on Polygon directly.",
    "  • Bread Spark: run `grid-wallet-cli orchestra withdraw <amount> USDC.e --to polygon --recipient " + eoa + " --reason \"Funding Polymarket\"`",
    "  • Any DEX or bridge that explicitly supports USDC.e on Polygon.",
    "",
    "After the transfer confirms (~30s on Polygon), run:",
    "",
    "```",
    "poly setup",
    "```",
  ].join("\n");
}

function renderNeedsWrap(
  eoa: string,
  balances: { matic: string; usdcE: string; pUsd: string },
  suggestedAmount: number,
): string {
  return [
    "Polymarket skill — setup",
    "",
    "Wallet ready ✓",
    `POL (gas) ready ✓ (${balances.matic} POL)`,
    `USDC.e ready ✓ (${balances.usdcE} USDC.e)`,
    "",
    "Step 3 of 3: Wrap USDC.e into pUSD (Polymarket's collateral token) and set the trading allowances. This is a one-time setup.",
    "",
    "Run on your computer:",
    "",
    "```",
    `poly fund ${suggestedAmount} --confirm`,
    "```",
    "",
    "(Replace " + suggestedAmount + " with however much USDC.e you want available for betting. The remainder stays as USDC.e on the EOA.)",
    "",
    "This does three things in sequence:",
    "  1. Approves the Polymarket on-ramp to pull your USDC.e",
    "  2. Wraps USDC.e → pUSD",
    "  3. Sets the CTF exchange allowance so you can place orders",
    "",
    "After it finishes, run:",
    "",
    "```",
    "poly setup",
    "```",
  ].join("\n");
}

function renderNeedsAllowances(
  eoa: string,
  balances: { matic: string; usdcE: string; pUsd: string },
): string {
  return [
    "Polymarket skill — setup",
    "",
    `Wallet: ${eoa}`,
    `pUSD balance: ${balances.pUsd} ✓`,
    "",
    "Almost done — the trading allowances aren't set yet. Run this one-time approval:",
    "",
    "```",
    "poly fund 0 --confirm",
    "```",
    "",
    "Passing 0 skips the wrap and just sets the pUSD → exchange allowance and CTF setApprovalForAll. Costs ~$0.01 in gas.",
  ].join("\n");
}

function renderReady(
  eoa: string,
  balances: { matic: string; usdcE: string; pUsd: string },
): string {
  return [
    "Polymarket skill — ready to bet ✓",
    "",
    `EOA:         ${eoa}`,
    `POL (gas):   ${balances.matic}`,
    `USDC.e:      ${balances.usdcE}`,
    `pUSD:        ${balances.pUsd}`,
    "Allowances:  set",
    "",
    "You're all set. Try:",
    "",
    "```",
    "poly search \"bitcoin price end of year\"",
    "```",
    "",
    "then quote and place a bet:",
    "",
    "```",
    "poly quote <conditionId> YES 5",
    "poly bet   <conditionId> YES 5 --confirm",
    "```",
  ].join("\n");
}
