import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

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

interface EncryptedFile {
  version: 1;
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  eoa: string;
}

const PBKDF2_ITERATIONS = 200_000;

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

export function saveCreds(filePath: string, creds: Creds, passphrase: string): void {
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Encryption passphrase must be at least 8 characters");
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(creds), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload: EncryptedFile = {
    version: 1,
    kdf: "pbkdf2-sha256",
    iterations: PBKDF2_ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    eoa: creds.eoa,
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

export function loadCreds(filePath: string, passphrase: string): Creds {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No credentials at ${filePath}. Run \`poly login\` first.`,
    );
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw) as EncryptedFile;
  if (payload.version !== 1 || payload.kdf !== "pbkdf2-sha256") {
    throw new Error(`Unsupported creds file version/kdf: ${payload.version}/${payload.kdf}`);
  }
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const key = deriveKey(passphrase, salt);
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
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export function credsExist(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function readEoaWithoutDecrypting(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw) as EncryptedFile;
  return payload.eoa ?? null;
}
