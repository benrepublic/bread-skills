import { mnemonicToWallet, isValidMnemonic } from "../wallet";
import { saveCreds, credsExist } from "../creds";
import { deriveApiKey } from "../clob";
import { loadConfig } from "../config";
import { emit, fail, promptHidden } from "../util/io";

export interface LoginOptions {
  json?: boolean;
  force?: boolean;
}

export async function loginCommand(opts: LoginOptions): Promise<void> {
  const config = loadConfig();
  const jsonOutput = !!opts.json;

  if (credsExist(config.credsPath) && !opts.force) {
    fail(
      jsonOutput,
      `Credentials already exist at ${config.credsPath}. Use --force to overwrite or run \`poly logout\` first.`,
    );
  }

  if (!process.stdin.isTTY) {
    fail(
      jsonOutput,
      "login must run on an interactive TTY so the mnemonic can be read securely from stdin",
    );
  }

  const mnemonic = (await promptHidden("Mnemonic (12/24 words, hidden): ")).trim();
  if (!isValidMnemonic(mnemonic)) {
    fail(jsonOutput, "Invalid BIP-39 mnemonic");
  }

  const passphrase = await promptHidden("Encryption passphrase (min 8 chars, hidden): ");
  const passphrase2 = await promptHidden("Confirm passphrase: ");
  if (passphrase !== passphrase2) {
    fail(jsonOutput, "Passphrases do not match");
  }
  if (passphrase.length < 8) {
    fail(jsonOutput, "Passphrase must be at least 8 characters");
  }

  const wallet = mnemonicToWallet(mnemonic);
  const eoa = await wallet.getAddress();

  let apiKey;
  try {
    apiKey = await deriveApiKey(config, wallet);
  } catch (err) {
    fail(
      jsonOutput,
      "Failed to derive Polymarket API key",
      err instanceof Error ? err.message : err,
    );
  }

  saveCreds(
    config.credsPath,
    {
      mnemonic,
      eoa,
      apiKey,
      chainId: config.chainId,
      clobHost: config.clobHost,
    },
    passphrase,
  );

  emit(
    jsonOutput,
    `Logged in. EOA: ${eoa}\nCreds saved to ${config.credsPath} (encrypted).\n` +
      `Set POLYMARKET_PASSPHRASE in your shell to unlock other commands without re-entering it.`,
    { eoa, credsPath: config.credsPath },
  );
}
