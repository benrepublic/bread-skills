import { describe, it, before, after, afterEach } from "node:test";
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
  getCredsMode,
} from "../src/creds";
import {
  type KeychainBackend,
  _setKeychainForTests,
} from "../src/creds-keychain";

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

// ─── encrypted-file mode (legacy / opt-in) ────────────────────────────

describe("creds (encrypted-file mode) — encrypt/decrypt round-trip", () => {
  before(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with no creds file", () => {
    assert.equal(credsExist(tmpFile), false);
    assert.equal(getCredsMode(tmpFile), null);
  });

  it("rejects short passphrases", () => {
    assert.throws(
      () =>
        saveCreds(tmpFile, fixture, {
          mode: "encrypted-file",
          passphrase: "short",
        }),
      /at least 8/,
    );
  });

  it("encrypts and round-trips with the right passphrase", () => {
    saveCreds(tmpFile, fixture, {
      mode: "encrypted-file",
      passphrase: "correct-horse-battery",
    });
    assert.ok(credsExist(tmpFile));
    assert.equal(getCredsMode(tmpFile), "encrypted-file");
    const loaded = loadCreds(tmpFile, { passphrase: "correct-horse-battery" });
    assert.deepEqual(loaded, fixture);
  });

  it("fails with the wrong passphrase", () => {
    assert.throws(
      () => loadCreds(tmpFile, { passphrase: "wrong-passphrase-zzz" }),
      /Decryption failed/,
    );
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

// ─── keychain mode (default) ──────────────────────────────────────────

class FakeKeychain implements KeychainBackend {
  store = new Map<string, string>();
  name() {
    return "fake";
  }
  isAvailable() {
    return true;
  }
  set(key: string, value: string) {
    this.store.set(key, value);
  }
  get(key: string) {
    const v = this.store.get(key);
    if (v === undefined) throw new Error(`fake: no item for ${key}`);
    return v;
  }
  delete(key: string) {
    return this.store.delete(key);
  }
}

describe("creds (keychain mode)", () => {
  let kc: FakeKeychain;
  const keychainFile = path.join(tmpDir, "kc-creds.json");

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    _setKeychainForTests(null);
    if (fs.existsSync(keychainFile)) fs.unlinkSync(keychainFile);
  });
  after(() => {
    _setKeychainForTests(null);
  });

  it("stores the secret material in the keychain backend, not on disk", () => {
    kc = new FakeKeychain();
    _setKeychainForTests(kc);
    saveCreds(keychainFile, fixture, { mode: "keychain" });

    // The marker file should NOT contain the mnemonic or api-key secret.
    const raw = fs.readFileSync(keychainFile, "utf8");
    assert.ok(!raw.includes("abandon"), "mnemonic must not be on disk");
    assert.ok(!raw.includes(fixture.apiKey.secret), "api secret must not be on disk");

    // The keychain DOES contain the full creds blob.
    const stored = kc.store.get("creds");
    assert.ok(stored && stored.includes(fixture.mnemonic));
    assert.ok(stored.includes(fixture.apiKey.secret));
  });

  it("getCredsMode returns 'keychain' after save", () => {
    kc = new FakeKeychain();
    _setKeychainForTests(kc);
    saveCreds(keychainFile, fixture, { mode: "keychain" });
    assert.equal(getCredsMode(keychainFile), "keychain");
  });

  it("loads back the full Creds object from the keychain — no passphrase needed", () => {
    kc = new FakeKeychain();
    _setKeychainForTests(kc);
    saveCreds(keychainFile, fixture, { mode: "keychain" });
    const loaded = loadCreds(keychainFile, {}); // <-- no passphrase
    assert.deepEqual(loaded, fixture);
  });

  it("exposes the EOA from the marker without touching the keychain", () => {
    kc = new FakeKeychain();
    _setKeychainForTests(kc);
    saveCreds(keychainFile, fixture, { mode: "keychain" });
    // Swap in a backend that would throw if touched.
    _setKeychainForTests({
      name: () => "deny",
      isAvailable: () => true,
      set: () => {
        throw new Error("should not be called");
      },
      get: () => {
        throw new Error("should not be called");
      },
      delete: () => {
        throw new Error("should not be called");
      },
    });
    assert.equal(readEoaWithoutDecrypting(keychainFile), fixture.eoa);
  });

  it("logout removes both the keychain item and the marker file", () => {
    kc = new FakeKeychain();
    _setKeychainForTests(kc);
    saveCreds(keychainFile, fixture, { mode: "keychain" });
    assert.ok(kc.store.has("creds"));
    assert.ok(fs.existsSync(keychainFile));

    assert.equal(deleteCreds(keychainFile), true);
    assert.equal(kc.store.has("creds"), false);
    assert.equal(fs.existsSync(keychainFile), false);
  });

  it("save throws cleanly when no keychain backend is available", () => {
    _setKeychainForTests(null);
    assert.throws(
      () => saveCreds(keychainFile, fixture, { mode: "keychain" }),
      /No OS keychain available/,
    );
  });
});
