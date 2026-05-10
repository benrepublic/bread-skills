import { spawnSync } from "node:child_process";

// Keychain-backed credential storage. The mnemonic + Polymarket API key never
// touch disk in plaintext — they live in the OS keychain (macOS Keychain on
// Darwin, libsecret/Secret Service on Linux). Access is gated by the user's
// login session: when the user is logged out or the machine is locked, the
// keychain seals and no process can read it. When the user is logged in, the
// CLI can fetch the secret without prompting for a passphrase, which is what
// makes the agent flow seamless.
//
// We use ONE keychain item per credential — the whole `Creds` object is
// serialized to a single value. That keeps lookups atomic and avoids leaving
// the user with partial state if a multi-item write is interrupted.

const SERVICE = "polymarket-skill";
const ACCOUNT = "creds";

export interface KeychainBackend {
  /** True if the OS-native keychain tool is on PATH and looks usable. */
  isAvailable(): boolean;
  /** Backend name for error messages. */
  name(): string;
  /** Store a value, overwriting any existing entry for the same key. */
  set(key: string, value: string): void;
  /** Fetch a value. Throws if not found. */
  get(key: string): string;
  /** Delete a value. Returns true if something was removed, false if nothing to remove. */
  delete(key: string): boolean;
}

class MacOsBackend implements KeychainBackend {
  name(): string {
    return "macOS Keychain";
  }

  isAvailable(): boolean {
    return spawnSync("security", ["help"], { stdio: "ignore" }).status === 0;
  }

  set(key: string, value: string): void {
    // -U overwrites if a matching item exists.
    // -A opens the per-app ACL so any process running as the user can read the
    //    item without a GUI prompt. Without this, the FIRST read from any new
    //    binary triggers a SecurityAgent dialog ("allow `poly` to access...")
    //    that can only be dismissed at the Mac. Since the entire point of
    //    keychain mode is a seamless agent flow, -A is the right posture; the
    //    item is still sealed when the user logs out or the Mac locks. Matches
    //    Linux libsecret behavior (no per-app ACL) and the convention used by
    //    gh, gcloud, ssh-agent, npm, etc. for CLI-with-keychain storage.
    // Pass the value via -w argument — there's no documented stdin form for
    // add-generic-password on macOS, but the argv is visible only to processes
    // with same-uid access, which on a personal Mac is just the user's own
    // processes. The mnemonic only lives in argv for the duration of this
    // `security` invocation (sub-millisecond on local IPC to securityd).
    const r = spawnSync(
      "security",
      ["add-generic-password", "-s", SERVICE, "-a", key, "-w", value, "-U", "-A"],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    if (r.status !== 0) {
      throw new Error(
        `macOS Keychain write failed (exit ${r.status}): ${r.stderr?.toString().trim() || "unknown error"}`,
      );
    }
  }

  get(key: string): string {
    const r = spawnSync(
      "security",
      ["find-generic-password", "-s", SERVICE, "-a", key, "-w"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    if (r.status !== 0) {
      const stderr = r.stderr?.toString() ?? "";
      if (stderr.includes("could not be found")) {
        throw new Error(
          `macOS Keychain: no item for service=${SERVICE} account=${key}. Run \`poly login\`.`,
        );
      }
      throw new Error(
        `macOS Keychain read failed (exit ${r.status}): ${stderr.trim() || "unknown error"}`,
      );
    }
    // `security ... -w` prints the value followed by a newline. Strip the
    // trailing newline only (the value itself may contain spaces and tabs).
    const out = r.stdout.toString();
    return out.endsWith("\n") ? out.slice(0, -1) : out;
  }

  delete(key: string): boolean {
    const r = spawnSync(
      "security",
      ["delete-generic-password", "-s", SERVICE, "-a", key],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    if (r.status === 0) return true;
    // Exit code 44 = "The specified item could not be found in the keychain."
    const stderr = r.stderr?.toString() ?? "";
    if (r.status === 44 || stderr.includes("could not be found")) {
      return false;
    }
    throw new Error(
      `macOS Keychain delete failed (exit ${r.status}): ${stderr.trim() || "unknown error"}`,
    );
  }
}

class LinuxSecretToolBackend implements KeychainBackend {
  name(): string {
    return "libsecret (secret-tool)";
  }

  isAvailable(): boolean {
    return spawnSync("secret-tool", ["--version"], { stdio: "ignore" }).status === 0;
  }

  set(key: string, value: string): void {
    // secret-tool reads the value from stdin — keeps it out of argv entirely.
    const r = spawnSync(
      "secret-tool",
      [
        "store",
        "--label",
        `polymarket-skill ${key}`,
        "service",
        SERVICE,
        "account",
        key,
      ],
      { input: value, stdio: ["pipe", "ignore", "pipe"] },
    );
    if (r.status !== 0) {
      throw new Error(
        `libsecret write failed (exit ${r.status}): ${r.stderr?.toString().trim() || "unknown error"}`,
      );
    }
  }

  get(key: string): string {
    const r = spawnSync(
      "secret-tool",
      ["lookup", "service", SERVICE, "account", key],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    if (r.status !== 0 || r.stdout.length === 0) {
      throw new Error(
        `libsecret: no item for service=${SERVICE} account=${key}. Run \`poly login\`.`,
      );
    }
    return r.stdout.toString();
  }

  delete(key: string): boolean {
    // `secret-tool clear` succeeds even when there's nothing to clear, so we
    // probe with `lookup` first to give an accurate return value.
    const probe = spawnSync(
      "secret-tool",
      ["lookup", "service", SERVICE, "account", key],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const existed = probe.status === 0 && probe.stdout.length > 0;
    if (!existed) return false;
    const r = spawnSync(
      "secret-tool",
      ["clear", "service", SERVICE, "account", key],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    if (r.status !== 0) {
      throw new Error(
        `libsecret delete failed (exit ${r.status}): ${r.stderr?.toString().trim() || "unknown error"}`,
      );
    }
    return true;
  }
}

let cached: KeychainBackend | null | undefined;

/**
 * Returns the keychain backend for this platform, or null if no native
 * keychain is available (e.g. headless Linux without libsecret, or Windows
 * which isn't implemented here yet).
 */
export function getKeychain(): KeychainBackend | null {
  if (cached !== undefined) return cached;
  if (process.platform === "darwin") {
    const b = new MacOsBackend();
    cached = b.isAvailable() ? b : null;
  } else if (process.platform === "linux") {
    const b = new LinuxSecretToolBackend();
    cached = b.isAvailable() ? b : null;
  } else {
    cached = null;
  }
  return cached;
}

/** Test-only: replace the cached backend with a fake. */
export function _setKeychainForTests(backend: KeychainBackend | null): void {
  cached = backend;
}

export const KEYCHAIN_ACCOUNT = ACCOUNT;
export const KEYCHAIN_SERVICE = SERVICE;
