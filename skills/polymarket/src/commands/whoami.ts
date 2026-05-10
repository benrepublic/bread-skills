import { loadConfig } from "../config";
import { loadCreds, readEoaWithoutDecrypting, getCredsMode } from "../creds";
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

  // Try to read API key info. In keychain mode this just works (the OS
  // unseals the item for us while the user is logged in). In encrypted-file
  // mode we need POLYMARKET_PASSPHRASE to decrypt; if it's missing we leave
  // the field blank rather than failing the whole `whoami`.
  let apiKeyShort: string | null = null;
  const mode = getCredsMode(config.credsPath);
  const canDecrypt =
    mode === "keychain" || (mode === "encrypted-file" && !!getPassphrase());
  if (canDecrypt) {
    try {
      const creds = loadCreds(config.credsPath, { passphrase: getPassphrase() });
      apiKeyShort = creds.apiKey.key.slice(0, 8) + "…";
    } catch {
      apiKeyShort = null;
    }
  }
  const apiKeyLine = apiKeyShort
    ? `API key:           ${apiKeyShort}`
    : mode === "encrypted-file"
      ? "API key:           (set POLYMARKET_PASSPHRASE to display)"
      : "API key:           (unable to read from keychain)";

  const text = [
    `EOA:               ${eoaQuick}`,
    `Chain:             ${config.chainId} (Polygon)`,
    `MATIC balance:     ${balances.matic}`,
    `USDC.e balance:    ${balances.usdcE}`,
    `pUSD balance:      ${balances.pUsd}`,
    `pUSD allowance:    ${allowance > 0n ? "set" : "NOT SET — run `poly fund`"}`,
    `CTF approval:      ${ctfApproved ? "set" : "NOT SET — run `poly fund`"}`,
    apiKeyLine,
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
