import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { getKeychain, KEYCHAIN_ACCOUNT } from "./creds-keychain";

export interface Creds {
  mnemonic: string;
  eoa: string;
  apiKey: {
    key: string;
    secret: string;
    passphrase: string;
  };
  chainId: number;
  clobHost: string;
}

export type CredsMode = "keychain" | "encrypted-file";

interface KeychainMarker {
  version: 2;
  mode: "keychain";
  eoa: string;
}

interface EncryptedFile {
  version: 1 | 2;
  /** Present only in version 2 — older v1 files implicitly use encrypted-file mode. */
  mode?: "encrypted-file";
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  eoa: string;
}

type StoredFile = KeychainMarker | EncryptedFile;

const PBKDF2_ITERATIONS = 200_000;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

function readStoredFile(filePath: string): StoredFile {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as StoredFile;
}

function writeStoredFile(filePath: string, data: StoredFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/** Returns the current storage mode, or null if no creds are saved. */
export function getCredsMode(filePath: string): CredsMode | null {
  if (!fs.existsSync(filePath)) return null;
  const f = readStoredFile(filePath);
  if ("mode" in f && f.mode === "keychain") return "keychain";
  // Files without an explicit mode (v1) are encrypted-file by definition.
  return "encrypted-file";
}

export interface SaveCredsOptions {
  mode: CredsMode;
  /** Required when mode === "encrypted-file"; ignored for keychain. */
  passphrase?: string;
}

export function saveCreds(filePath: string, creds: Creds, options: SaveCredsOptions): void {
  if (options.mode === "keychain") {
    const kc = getKeychain();
    if (!kc) {
      throw new Error(
        "No OS keychain available on this platform. Re-run `poly login --encrypted-file` to use the passphrase-encrypted file instead.",
      );
    }
    // Serialize the WHOLE creds bundle into one keychain item. The on-disk
    // marker only records the EOA + mode — no secret material in the file.
    kc.set(KEYCHAIN_ACCOUNT, JSON.stringify(creds));
    const marker: KeychainMarker = {
      version: 2,
      mode: "keychain",
      eoa: creds.eoa,
    };
    writeStoredFile(filePath, marker);
    return;
  }

  // encrypted-file mode (legacy / opt-in for users who don't want OS keychain)
  if (!options.passphrase || options.passphrase.length < 8) {
    throw new Error("Encryption passphrase must be at least 8 characters");
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(options.passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(creds), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload: EncryptedFile = {
    version: 2,
    mode: "encrypted-file",
    kdf: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    eoa: creds.eoa,
  };

  writeStoredFile(filePath, payload);
}

export interface LoadCredsOptions {
  /** Required when the stored mode is encrypted-file; ignored for keychain. */
  passphrase?: string;
}

export function loadCreds(filePath: string, options: LoadCredsOptions = {}): Creds {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No credentials at ${filePath}. Run \`poly login\` first.`);
  }
  const file = readStoredFile(filePath);

  if ("mode" in file && file.mode === "keychain") {
    const kc = getKeychain();
    if (!kc) {
      throw new Error(
        "Credentials are in keychain mode but no OS keychain is available on this platform.",
      );
    }
    const value = kc.get(KEYCHAIN_ACCOUNT);
    return JSON.parse(value) as Creds;
  }

  // encrypted-file mode (v1 implicitly, or v2 with mode === "encrypted-file")
  const ef = file as EncryptedFile;
  if (ef.kdf !== "pbkdf2-sha256") {
    throw new Error(`Unsupported creds file kdf: ${ef.kdf}`);
  }
  if (!options.passphrase) {
    throw new Error(
      "POLYMARKET_PASSPHRASE not set. Export the encryption passphrase, or re-run `poly login` (without --encrypted-file) to migrate to keychain mode.",
    );
  }
  const salt = Buffer.from(ef.salt, "base64");
  const iv = Buffer.from(ef.iv, "base64");
  const authTag = Buffer.from(ef.authTag, "base64");
  const ciphertext = Buffer.from(ef.ciphertext, "base64");
  const key = deriveKey(options.passphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Decryption failed — wrong passphrase or corrupted file");
  }
  return JSON.parse(plaintext.toString("utf8")) as Creds;
}

export function deleteCreds(filePath: string): boolean {
  let removed = false;
  if (fs.existsSync(filePath)) {
    const mode = getCredsMode(filePath);
    if (mode === "keychain") {
      const kc = getKeychain();
      // Best-effort: if the backend is unavailable now, still remove the
      // marker file so the user can `poly login` cleanly.
      try {
        kc?.delete(KEYCHAIN_ACCOUNT);
      } catch {
        // ignore — file removal is the main signal of "logged out"
      }
    }
    fs.unlinkSync(filePath);
    removed = true;
  }
  return removed;
}

export function credsExist(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function readEoaWithoutDecrypting(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const f = readStoredFile(filePath);
  return f.eoa ?? null;
}
