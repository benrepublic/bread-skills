import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  saveCreds,
  loadCreds,
  deleteCreds,
  credsExist,
  readEoaWithoutDecrypting,
} from "../src/creds";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "polymarket-creds-"));
const tmpFile = path.join(tmpDir, "creds.json");

const fixture = {
  mnemonic:
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  eoa: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
  apiKey: { key: "k-1", secret: "s-1", passphrase: "pp-1" },
  chainId: 137,
  clobHost: "https://clob.polymarket.com",
};

describe("creds encrypt/decrypt round-trip", () => {
  before(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with no creds file", () => {
    assert.equal(credsExist(tmpFile), false);
  });

  it("rejects short passphrases", () => {
    assert.throws(() => saveCreds(tmpFile, fixture, "short"), /at least 8/);
  });

  it("encrypts and round-trips with the right passphrase", () => {
    saveCreds(tmpFile, fixture, "correct-horse-battery");
    assert.ok(credsExist(tmpFile));
    const loaded = loadCreds(tmpFile, "correct-horse-battery");
    assert.deepEqual(loaded, fixture);
  });

  it("fails with the wrong passphrase", () => {
    assert.throws(() => loadCreds(tmpFile, "wrong-passphrase-zzz"), /Decryption failed/);
  });

  it("exposes the EOA without decrypting", () => {
    assert.equal(readEoaWithoutDecrypting(tmpFile), fixture.eoa);
  });

  it("does not persist the mnemonic in plaintext on disk", () => {
    const raw = fs.readFileSync(tmpFile, "utf8");
    assert.ok(!raw.includes("abandon"), "mnemonic should not appear in plaintext");
    assert.ok(!raw.includes(fixture.apiKey.secret), "secret should not appear in plaintext");
  });

  it("removes the file on logout", () => {
    assert.equal(deleteCreds(tmpFile), true);
    assert.equal(credsExist(tmpFile), false);
    assert.equal(deleteCreds(tmpFile), false); // idempotent
  });
});
