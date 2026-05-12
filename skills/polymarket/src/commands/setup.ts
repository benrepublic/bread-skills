import { loadConfig } from "../config";
import { credsExist, readEoaWithoutDecrypting } from "../creds";
import { readBalances, pUsdAllowance, ctfApprovedForAll } from "../chain";
import { emit, fail } from "../util/io";

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
    matic: string;
    usdcE: string;
    pUsd: string;
  } | null;
  allowances: {
    pUsd: boolean;
    ctf: boolean;
  } | null;
}

const NO_WALLET_SNAPSHOT: SetupSnapshot = {
  state: "no-wallet",
  eoa: null,
  balances: null,
  allowances: null,
};

/**
 * Onboards a fresh user with a chat-pasteable, state-aware next-action
 * message. The output is designed to render legibly on terminal AND when
 * forwarded verbatim to WhatsApp/Telegram by an agent — code fences become
 * tap-to-copy monospace blocks, plain text wraps cleanly. Written for
 * non-technical readers — no jargon (no "EOA", "mnemonic", "wrap",
 * "allowance", "TTY", "CTF") in user-facing prose.
 */
export async function setupCommand(opts: SetupOptions): Promise<void> {
  const jsonOutput = !!opts.json;
  const config = loadConfig();

  // State 1: no wallet yet (file missing, or file present but no EOA in marker)
  if (!credsExist(config.credsPath)) {
    emit(jsonOutput, renderNoWallet(), NO_WALLET_SNAPSHOT);
    return;
  }
  const eoa = readEoaWithoutDecrypting(config.credsPath);
  if (!eoa) {
    emit(jsonOutput, renderNoWallet(), NO_WALLET_SNAPSHOT);
    return;
  }

  let balances, pUsdAllow: bigint, ctfApproved: boolean;
  try {
    [balances, pUsdAllow, ctfApproved] = await Promise.all([
      readBalances(config, eoa),
      pUsdAllowance(config, eoa),
      ctfApprovedForAll(config, eoa),
    ]);
  } catch (err) {
    fail(
      jsonOutput,
      "Couldn't reach Polygon to check your wallet state. Check your internet connection and try again.",
      err instanceof Error ? err.message : err,
    );
  }

  const snapshotBase = {
    eoa,
    balances: { matic: balances.matic, usdcE: balances.usdcE, pUsd: balances.pUsd },
    allowances: { pUsd: pUsdAllow > 0n, ctf: ctfApproved },
  };
  const hasGas = balances.raw.matic > 0n;
  const hasUsdcE = balances.raw.usdcE > 0n;
  const hasPusd = balances.raw.pUsd > 0n;
  const allowancesSet = pUsdAllow > 0n && ctfApproved;

  // State 2: no MATIC for fees (blocks all on-chain transactions)
  if (!hasGas) {
    emit(jsonOutput, renderNoGas(eoa, balances), { state: "no-gas", ...snapshotBase });
    return;
  }
  // State 3: has fees but no USDC.e or pUSD yet
  if (!hasUsdcE && !hasPusd) {
    emit(jsonOutput, renderNoUsdce(eoa, balances), { state: "no-usdce", ...snapshotBase });
    return;
  }
  // State 4: USDC.e on hand but not yet activated for betting
  if (hasUsdcE && (!hasPusd || !allowancesSet)) {
    const whole = Math.floor(Number(balances.usdcE));
    const suggested = whole > 0 ? whole : Number(balances.usdcE);
    emit(
      jsonOutput,
      renderNeedsWrap(eoa, balances, suggested),
      { state: "needs-wrap", ...snapshotBase },
    );
    return;
  }
  // State 5: pUSD present but allowances missing (rare — only happens if
  // someone hand-funded pUSD or migrated mid-allowance-setup)
  if (hasPusd && !allowancesSet) {
    emit(
      jsonOutput,
      renderNeedsAllowances(eoa, balances),
      { state: "needs-allowances", ...snapshotBase },
    );
    return;
  }
  // State 6: fully ready
  emit(jsonOutput, renderReady(eoa, balances), { state: "ready", ...snapshotBase });
}

// ─── Text renderers ──────────────────────────────────────────────────────
// Plain-language. No EOA / mnemonic / wrap / allowance / TTY / CTF. Code
// fences (```) render as tap-to-copy monospace on WhatsApp/Telegram.

function renderNoWallet(): string {
  return [
    "Polymarket setup — let's get you set up to bet",
    "",
    "Step 1 of 3: Connect your wallet.",
    "",
    "You need to do this step yourself (your agent can't paste a recovery phrase for you, and shouldn't be able to). On the same computer where you just installed the skill, open a Terminal window and run:",
    "",
    "```",
    "poly login",
    "```",
    "",
    "It'll ask you to paste in your 12-word recovery phrase — the kind any crypto wallet (MetaMask, Rabby, Coinbase Wallet, etc.) gives you when you create one. Your phrase stays on your computer, locked in your system's secure password storage. It's never sent to any chat, server, or person.",
    "",
    "Don't have a wallet yet? Make a brand-new one in any wallet app and use it only for Polymarket betting — keep it separate from your main savings.",
    "",
    "Once you've logged in, run this again (or have your agent run it):",
    "",
    "```",
    "poly setup",
    "```",
    "",
    "and it'll tell you what to do next. Login is the only step that needs you at a keyboard — after this your agent can handle the rest.",
  ].join("\n");
}

function renderNoGas(
  eoa: string,
  balances: { matic: string; usdcE: string; pUsd: string },
): string {
  return [
    "Polymarket setup — step 2 of 3",
    "",
    "Wallet connected ✓",
    "",
    "Your Polymarket wallet address:",
    "",
    "```",
    eoa,
    "```",
    "",
    "Current balances:",
    `  MATIC (transaction fees):  ${balances.matic}`,
    `  USDC.e (your betting $):   ${balances.usdcE}`,
    `  pUSD (ready-to-bet $):     ${balances.pUsd}`,
    "",
    "Next: send a small amount of MATIC (also called POL) to your wallet to cover transaction fees. Polygon is a low-fee network — each bet only costs about $0.001 in fees, so about $0.50 worth of MATIC is plenty for a long time.",
    "",
    "How to get MATIC to your wallet:",
    "  • Most exchanges (Coinbase, Binance, Kraken) sell MATIC and let you withdraw it directly. Choose \"Polygon\" or \"MATIC\" as the network when withdrawing.",
    "  • Or ask a friend to send a tiny amount.",
    "",
    "You'll also need USDC.e (the actual money for your bets) — see the next step. You can send both in one withdrawal if your exchange lets you.",
    "",
    "After your transfer arrives, run (or have your agent run):",
    "",
    "```",
    "poly setup",
    "```",
  ].join("\n");
}

function renderNoUsdce(
  eoa: string,
  balances: { matic: string; usdcE: string; pUsd: string },
): string {
  return [
    "Polymarket setup — step 2 of 3 (continued)",
    "",
    "Wallet connected ✓",
    `Transaction fees ready ✓ (${balances.matic} MATIC in your wallet)`,
    "",
    "Your Polymarket wallet address:",
    "",
    "```",
    eoa,
    "```",
    "",
    "Next: send USDC.e — the digital dollars you'll use for bets — to that address.",
    "",
    "IMPORTANT: Polymarket uses a specific kind of USDC called USDC.e (sometimes labeled \"Bridged USDC\" on exchanges). Polygon also has a newer regular USDC that looks identical but won't work — Polymarket can only accept the USDC.e version. If your wallet or exchange shows two USDCs, pick the one labeled USDC.e or Bridged.",
    "",
    "Easiest ways to send USDC.e:",
    "  • Coinbase: choose \"Withdraw USDC\", select \"Polygon\" as the network, and paste your wallet address. Coinbase sends USDC.e by default.",
    "  • If you have a Bread balance and your agent has access to it, your agent can transfer it for you.",
    "  • Most other exchanges: look for an option that explicitly says \"USDC.e\" or \"Bridged USDC\".",
    "",
    "After the transfer arrives (usually within a minute), run (or have your agent run):",
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
    "Polymarket setup — step 3 of 3",
    "",
    "Wallet connected ✓",
    `Transaction fees ready ✓ (${balances.matic} MATIC)`,
    `Money ready ✓ (${balances.usdcE} USDC.e in your wallet)`,
    "",
    "Last step: activate your USDC.e so Polymarket can use it for bets. This is a one-time setup — you only do it once per wallet.",
    "",
    "Run on your computer (or have your agent run it):",
    "",
    "```",
    `poly fund ${suggestedAmount} --confirm`,
    "```",
    "",
    "Replace " + suggestedAmount + " with however many dollars you want available for betting. Whatever's left over stays in your wallet untouched.",
    "",
    "Behind the scenes this converts your USDC.e into the token Polymarket actually uses (called pUSD) and gives Polymarket permission to spend it on bets you confirm. Costs a fraction of a cent in fees.",
    "",
    "After it finishes, run (or have your agent run):",
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
    "Polymarket setup — almost done",
    "",
    `Wallet: ${eoa}`,
    `Ready-to-bet balance: ${balances.pUsd} pUSD ✓`,
    "",
    "You're one step away. Polymarket needs your permission to use your pUSD when you place bets — a one-time approval that costs about a cent.",
    "",
    "Run (or have your agent run):",
    "",
    "```",
    "poly fund 0 --confirm",
    "```",
    "",
    "The 0 tells it to skip converting any more money and just set up the permission.",
  ].join("\n");
}

function renderReady(
  eoa: string,
  balances: { matic: string; usdcE: string; pUsd: string },
): string {
  return [
    "Polymarket — you're ready to bet ✓",
    "",
    `Wallet:                     ${eoa}`,
    `Transaction fees (MATIC):   ${balances.matic}`,
    `USDC.e (savings):           ${balances.usdcE}`,
    `Ready to bet (pUSD):        ${balances.pUsd}`,
    "",
    "Setup is done. From here on, just chat with your agent — it can find markets, place bets, check your positions, and cash out winners for you. You won't need to touch a terminal again unless you want to add more money to your wallet.",
    "",
    "Try asking your agent things like:",
    "  • \"What does Polymarket think about Bitcoin hitting $200k this year?\"",
    "  • \"Bet $5 on YES for the next Fed rate cut\"",
    "  • \"How are my bets doing?\"",
    "",
    "Or if you want to drive it from the terminal:",
    "",
    "```",
    "poly search \"bitcoin price end of year\"",
    "```",
    "",
    "and then:",
    "",
    "```",
    "poly bet <market-id-from-search> YES 5 --confirm",
    "```",
  ].join("\n");
}
