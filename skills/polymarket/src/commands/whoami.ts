import { loadConfig } from "../config";
import { loadCreds, readEoaWithoutDecrypting } from "../creds";
import { readBalances, pUsdAllowance, ctfApprovedForAll } from "../chain";
import { emit, fail, getPassphrase } from "../util/io";

export async function whoamiCommand(opts: { json?: boolean }): Promise<void> {
  const config = loadConfig();
  const jsonOutput = !!opts.json;

  const eoaQuick = readEoaWithoutDecrypting(config.credsPath);
  if (!eoaQuick) {
    fail(jsonOutput, `No creds at ${config.credsPath}. Run \`poly login\` first.`);
  }

  let balances;
  let allowance: bigint;
  let ctfApproved: boolean;
  try {
    [balances, allowance, ctfApproved] = await Promise.all([
      readBalances(config, eoaQuick),
      pUsdAllowance(config, eoaQuick),
      ctfApprovedForAll(config, eoaQuick),
    ]);
  } catch (err) {
    fail(
      jsonOutput,
      "RPC call failed reading balances",
      err instanceof Error ? err.message : err,
    );
  }

  // Try to read API key info if passphrase is set, but don't require it.
  let apiKeyShort: string | null = null;
  if (process.env.POLYMARKET_PASSPHRASE) {
    try {
      const creds = loadCreds(config.credsPath, getPassphrase());
      apiKeyShort = creds.apiKey.key.slice(0, 8) + "…";
    } catch {
      apiKeyShort = null;
    }
  }

  const text = [
    `EOA:               ${eoaQuick}`,
    `Chain:             ${config.chainId} (Polygon)`,
    `MATIC balance:     ${balances.matic}`,
    `USDC.e balance:    ${balances.usdcE}`,
    `pUSD balance:      ${balances.pUsd}`,
    `pUSD allowance:    ${allowance > 0n ? "set" : "NOT SET — run `poly fund`"}`,
    `CTF approval:      ${ctfApproved ? "set" : "NOT SET — run `poly fund`"}`,
    apiKeyShort ? `API key:           ${apiKeyShort}` : "API key:           (set POLYMARKET_PASSPHRASE to display)",
  ].join("\n");

  emit(jsonOutput, text, {
    eoa: eoaQuick,
    chainId: config.chainId,
    balances: {
      matic: balances.matic,
      usdcE: balances.usdcE,
      pUsd: balances.pUsd,
    },
    pUsdAllowance: allowance.toString(),
    ctfApproved,
    apiKeyPrefix: apiKeyShort,
  });
}
