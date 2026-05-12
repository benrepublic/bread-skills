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
  const mode = getCredsMode(config.credsPath);
  const passphrase = getPassphrase();
  const skipDecrypt = mode === "encrypted-file" && !passphrase;
  let apiKeyShort: string | null = null;
  if (!skipDecrypt) {
    try {
      apiKeyShort = loadCreds(config.credsPath, { passphrase }).apiKey.key.slice(0, 8) + "…";
    } catch {
      // Encrypted-file decryption can fail on the wrong passphrase; keychain
      // can fail if the user has revoked access. Either way, show a blank
      // API-key line rather than aborting the whoami summary.
    }
  }
  const apiKeyLine = apiKeyShort
    ? `API key:                      ${apiKeyShort}`
    : skipDecrypt
      ? "API key:                      (set POLYMARKET_PASSPHRASE to display)"
      : "API key:                      (stored — couldn't read just now)";

  const text = [
    `Wallet:                       ${eoaQuick}`,
    `Network:                      Polygon`,
    `MATIC (for transaction fees): ${balances.matic}`,
    `USDC.e (your money):          ${balances.usdcE}`,
    `pUSD (ready to bet):          ${balances.pUsd}`,
    `Money activated for betting:  ${allowance > 0n ? "yes" : "not yet — run `poly fund`"}`,
    `Marketplace permission:       ${ctfApproved ? "granted" : "not yet — run `poly fund`"}`,
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
