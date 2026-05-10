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
      `EOA ${eoa} has no MATIC for gas. Send a small amount (~$0.50) of MATIC to this address before funding.`,
    );
  }

  const steps: Array<{ step: string; tx?: string }> = [];

  if (usdAmount > 0) {
    const amountRaw = parseSixDecimal(usdAmount);
    if (before.raw.usdcE < amountRaw) {
      fail(
        jsonOutput,
        `INSUFFICIENT_USDC_E: have ${before.usdcE} USDC.e, need ${usdAmount}. ` +
          `Polymarket only accepts the bridged USDC.e token (0x2791Bca1...), not Polygon's native USDC. ` +
          `Bridge USDC.e to ${eoa} via \`grid-wallet-cli orchestra withdraw ${usdAmount} USDC.e --to polygon --recipient ${eoa} --reason "<purpose>"\`.`,
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
