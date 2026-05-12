import { spawnSync, type SpawnSyncReturns } from "node:child_process";

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

export const KEYCHAIN_SERVICE = "polymarket-skill";
export const KEYCHAIN_ACCOUNT = "creds";

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

/** Run a command synchronously and throw a uniformly-formatted error on non-zero exit. */
function run(
  bin: string,
  args: string[],
  opts: { input?: string; capture?: "stdout" } & { errorPrefix: string },
): SpawnSyncReturns<Buffer> {
  const stdio: ("ignore" | "pipe")[] = [
    opts.input !== undefined ? "pipe" : "ignore",
    opts.capture === "stdout" ? "pipe" : "ignore",
    "pipe",
  ];
  const r = spawnSync(bin, args, { input: opts.input, stdio: stdio as never });
  if (r.status !== 0) {
    const stderr = r.stderr?.toString().trim() || "unknown error";
    throw new Error(`${opts.errorPrefix} (exit ${r.status}): ${stderr}`);
  }
  return r;
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
    // The value passes through argv because macOS `security` has no documented
    // stdin form for add-generic-password; argv is visible only to same-uid
    // processes (i.e. the user themselves) for sub-millisecond local IPC.
    run(
      "security",
      ["add-generic-password", "-s", KEYCHAIN_SERVICE, "-a", key, "-w", value, "-U", "-A"],
      { errorPrefix: "macOS Keychain write failed" },
    );
  }

  get(key: string): string {
    const r = spawnSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", key, "-w"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    if (r.status !== 0) {
      const stderr = r.stderr?.toString() ?? "";
      if (stderr.includes("could not be found")) {
        throw new Error(
          `macOS Keychain: no item for service=${KEYCHAIN_SERVICE} account=${key}. Run \`poly login\`.`,
        );
      }
      throw new Error(
        `macOS Keychain read failed (exit ${r.status}): ${stderr.trim() || "unknown error"}`,
      );
    }
    // `security ... -w` prints the value followed by a newline. Strip the
    // trailing newline only — the value itself may contain spaces and tabs.
    const out = r.stdout.toString();
    return out.endsWith("\n") ? out.slice(0, -1) : out;
  }

  delete(key: string): boolean {
    const r = spawnSync(
      "security",
      ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", key],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    if (r.status === 0) return true;
    // Exit code 44 = "The specified item could not be found in the keychain."
    const stderr = r.stderr?.toString() ?? "";
    if (r.status === 44 || stderr.includes("could not be found")) return false;
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
    run(
      "secret-tool",
      [
        "store",
        "--label",
        `polymarket-skill ${key}`,
        "service",
        KEYCHAIN_SERVICE,
        "account",
        key,
      ],
      { input: value, errorPrefix: "libsecret write failed" },
    );
  }

  get(key: string): string {
    const r = spawnSync(
      "secret-tool",
      ["lookup", "service", KEYCHAIN_SERVICE, "account", key],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    if (r.status !== 0 || r.stdout.length === 0) {
      throw new Error(
        `libsecret: no item for service=${KEYCHAIN_SERVICE} account=${key}. Run \`poly login\`.`,
      );
    }
    return r.stdout.toString();
  }

  delete(key: string): boolean {
    // `secret-tool clear` succeeds even when there's nothing to clear, so we
    // probe with `lookup` first to give an accurate return value.
    const probe = spawnSync(
      "secret-tool",
      ["lookup", "service", KEYCHAIN_SERVICE, "account", key],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const existed = probe.status === 0 && probe.stdout.length > 0;
    if (!existed) return false;
    run(
      "secret-tool",
      ["clear", "service", KEYCHAIN_SERVICE, "account", key],
      { errorPrefix: "libsecret delete failed" },
    );
    return true;
  }
}

let cached: KeychainBackend | null | undefined;

/**
 * Returns the keychain backend for this platform, or null if no native
 * keychain is available (e.g. headless Linux without libsecret, or Windows
 * which isn't implemented here).
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
