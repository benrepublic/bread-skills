import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  isValidMnemonic,
  mnemonicToWallet,
  POLYMARKET_DERIVATION_PATH,
} from "../src/wallet";

// BIP-39 test vector: the canonical "abandon × 11 about" 12-word phrase.
// Public test vector — not a real wallet. Address derived at m/44'/60'/0'/0/0.
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const EXPECTED_EOA = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";

describe("mnemonic → wallet", () => {
  it("validates a known good mnemonic", () => {
    assert.ok(isValidMnemonic(TEST_MNEMONIC));
  });

  it("rejects garbage", () => {
    assert.equal(isValidMnemonic("not a real mnemonic phrase"), false);
    assert.equal(isValidMnemonic(""), false);
  });

  it("trims whitespace before validating", () => {
    assert.ok(isValidMnemonic(`  ${TEST_MNEMONIC}  `));
  });

  it("derives the canonical Ethereum address from the standard path", async () => {
    const wallet = mnemonicToWallet(TEST_MNEMONIC);
    assert.equal(await wallet.getAddress(), EXPECTED_EOA);
  });

  it("uses m/44'/60'/0'/0/0 by default", () => {
    assert.equal(POLYMARKET_DERIVATION_PATH, "m/44'/60'/0'/0/0");
  });

  it("throws on an invalid mnemonic", () => {
    assert.throws(
      () => mnemonicToWallet("nope nope nope"),
      /Invalid BIP-39 mnemonic/,
    );
  });

  // The Polymarket CLOB v2 SDK detects ethers signers by the v5 method name
  // `_signTypedData`. ethers v6 renamed it to `signTypedData`. Without an
  // alias the SDK treats the wallet as a viem WalletClient and throws
  // "wallet client is missing account address". Guard the alias here.
  it("exposes the ethers-v5 _signTypedData alias the CLOB SDK looks for", () => {
    const wallet = mnemonicToWallet(TEST_MNEMONIC);
    const aliased = (wallet as unknown as {
      _signTypedData?: unknown;
    })._signTypedData;
    assert.equal(typeof aliased, "function");
  });
});
