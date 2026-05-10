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
  return new Wallet(hd.privateKey);
}
