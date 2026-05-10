import { deleteCreds } from "../creds";
import { loadConfig } from "../config";
import { emit } from "../util/io";

export async function logoutCommand(opts: { json?: boolean }): Promise<void> {
  const config = loadConfig();
  const removed = deleteCreds(config.credsPath);
  emit(
    !!opts.json,
    removed
      ? `Removed ${config.credsPath}`
      : `Nothing to remove (no creds at ${config.credsPath})`,
    { removed, credsPath: config.credsPath },
  );
}
