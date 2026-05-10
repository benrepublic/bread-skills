import { HDNodeWallet, Mnemonic, Wallet } from "ethers";
import * as bip39 from "bip39";

export const POLYMARKET_DERIVATION_PATH = "m/44'/60'/0'/0/0";

export function isValidMnemonic(phrase: string): boolean {
  return bip39.validateMnemonic(phrase.trim());
}

export function mnemonicToWallet(
  phrase: string,
  derivationPath: string = POLYMARKET_DERIVATION_PATH,
): Wallet {
  const trimmed = phrase.trim();
  if (!isValidMnemonic(trimmed)) {
    throw new Error("Invalid BIP-39 mnemonic");
  }
  const mnemonic = Mnemonic.fromPhrase(trimmed);
  const hd = HDNodeWallet.fromMnemonic(mnemonic, derivationPath);
  const wallet = new Wallet(hd.privateKey);
  // @polymarket/clob-client-v2 detects ethers signers by the ethers v5
  // method `_signTypedData`. ethers v6 renamed it to `signTypedData` (no
  // underscore), so the SDK falls through to its viem branch and fails with
  // "wallet client is missing account address". Alias the v6 method to the
  // v5 name so the SDK's ethers path matches.
  (wallet as unknown as { _signTypedData: Wallet["signTypedData"] })._signTypedData =
    wallet.signTypedData.bind(wallet);
  return wallet;
}
