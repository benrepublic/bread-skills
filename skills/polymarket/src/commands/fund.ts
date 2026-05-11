import {
  readBalances,
  pUsdAllowance,
  ctfApprovedForAll,
  ensureUsdcAllowanceForOnramp,
  wrapUsdcToPusd,
  approveExchangeForPusd,
  approveCtfForExchange,
  parseSixDecimal,
} from "../chain";
import { loadSignerContext } from "../context";
import { emit, fail } from "../util/io";

export interface FundOptions {
  json?: boolean;
  confirm?: boolean;
}

export async function fundCommand(
  usdAmountStr: string,
  opts: FundOptions,
): Promise<void> {
  const jsonOutput = !!opts.json;
  if (!opts.confirm) {
    fail(
      jsonOutput,
      "refusing to send on-chain transactions without --confirm. Re-run with --confirm after the user approves.",
    );
  }
  const usdAmount = Number(usdAmountStr);
  if (!Number.isFinite(usdAmount) || usdAmount < 0) {
    fail(jsonOutput, `usdAmount must be a non-negative number, got ${usdAmountStr}`);
  }

  const { config, signer, eoa } = loadSignerContext(jsonOutput);
  const before = await readBalances(config, eoa);
  if (before.raw.matic === 0n) {
    fail(
      jsonOutput,
      `Your wallet ${eoa} has no MATIC to pay transaction fees. Send a small amount (around $0.50 worth) of MATIC to this address, then try again. MATIC is Polygon's transaction-fee currency — sold on most major exchanges. Choose "Polygon" or "MATIC" as the network when withdrawing.`,
    );
  }

  const steps: Array<{ step: string; tx?: string }> = [];

  if (usdAmount > 0) {
    const amountRaw = parseSixDecimal(usdAmount);
    if (before.raw.usdcE < amountRaw) {
      fail(
        jsonOutput,
        `Not enough USDC.e in your wallet: you have ${before.usdcE}, you need ${usdAmount}. ` +
          `Polymarket only accepts USDC.e (sometimes called "Bridged USDC", contract 0x2791Bca1...) — NOT Polygon's newer regular USDC, which looks identical but won't work. ` +
          `Send ${usdAmount} USDC.e to ${eoa} on Polygon (e.g., withdraw USDC from Coinbase to "Polygon" network) and try again. ` +
          `If you're on Bread, your agent can do this for you: ` +
          `\`grid-wallet-cli orchestra withdraw ${usdAmount} USDC.e --to polygon --recipient ${eoa} --reason "<purpose>"\`.`,
      );
    }
    const allowanceTx = await ensureUsdcAllowanceForOnramp(config, signer, amountRaw);
    if (allowanceTx) steps.push({ step: "USDC.e approve onramp", tx: allowanceTx.hash });
    const wrapTx = await wrapUsdcToPusd(config, signer, amountRaw);
    steps.push({ step: `wrap ${usdAmount} USDC.e → pUSD`, tx: wrapTx.hash });
  }

  if ((await pUsdAllowance(config, eoa)) === 0n) {
    const tx = await approveExchangeForPusd(config, signer);
    steps.push({ step: "pUSD approve exchange (max)", tx: tx.hash });
  }

  if (!(await ctfApprovedForAll(config, eoa))) {
    const tx = await approveCtfForExchange(config, signer);
    steps.push({ step: "CTF setApprovalForAll(exchange)", tx: tx.hash });
  }

  const after = await readBalances(config, eoa);

  emit(
    jsonOutput,
    [
      "Funding complete.",
      ...steps.map((s) => `  ✓ ${s.step}${s.tx ? ` (${s.tx})` : ""}`),
      `pUSD before: ${before.pUsd}`,
      `pUSD after:  ${after.pUsd}`,
    ].join("\n"),
    { eoa, before, after, steps },
  );
}
