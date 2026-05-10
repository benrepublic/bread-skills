import { mnemonicToWallet, isValidMnemonic } from "../wallet";
import { saveCreds, credsExist } from "../creds";
import { getKeychain } from "../creds-keychain";
import { deriveApiKey } from "../clob";
import { loadConfig } from "../config";
import { emit, fail, promptHidden } from "../util/io";

export interface LoginOptions {
  json?: boolean;
  force?: boolean;
  encryptedFile?: boolean;
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

  const keychain = getKeychain();
  const useEncryptedFile = !!opts.encryptedFile || keychain === null;
  if (opts.encryptedFile && keychain) {
    // user explicitly chose --encrypted-file even though keychain is available
  } else if (keychain === null && !opts.encryptedFile) {
    // tell the user we're falling back; they may want to know
    process.stderr.write(
      `note: no OS keychain available on this platform; falling back to passphrase-encrypted file at ${config.credsPath}\n`,
    );
  }

  const mnemonic = (await promptHidden("Mnemonic (12/24 words, hidden): ")).trim();
  if (!isValidMnemonic(mnemonic)) {
    fail(jsonOutput, "Invalid BIP-39 mnemonic");
  }

  let passphrase: string | undefined;
  if (useEncryptedFile) {
    passphrase = await promptHidden("Encryption passphrase (min 8 chars, hidden): ");
    const passphrase2 = await promptHidden("Confirm passphrase: ");
    if (passphrase !== passphrase2) {
      fail(jsonOutput, "Passphrases do not match");
    }
    if (passphrase.length < 8) {
      fail(jsonOutput, "Passphrase must be at least 8 characters");
    }
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
    useEncryptedFile
      ? { mode: "encrypted-file", passphrase }
      : { mode: "keychain" },
  );

  const storageDescription = useEncryptedFile
    ? `passphrase-encrypted file at ${config.credsPath}`
    : `${keychain?.name() ?? "OS keychain"} (marker at ${config.credsPath})`;
  const followup = useEncryptedFile
    ? `Set POLYMARKET_PASSPHRASE in your shell to unlock other commands without re-entering it.`
    : `No passphrase needed — future commands read the wallet from the keychain automatically while you're logged in.`;

  emit(
    jsonOutput,
    `Logged in. EOA: ${eoa}\nCreds stored in ${storageDescription}.\n${followup}`,
    {
      eoa,
      credsPath: config.credsPath,
      storage: useEncryptedFile ? "encrypted-file" : "keychain",
    },
  );
}
