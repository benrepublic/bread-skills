import * as readline from "node:readline";

export function emit(jsonOutput: boolean, text: string, json: unknown): void {
  if (jsonOutput) {
    process.stdout.write(JSON.stringify(json, null, 2) + "\n");
  } else {
    process.stdout.write(text + "\n");
  }
}

export function fail(jsonOutput: boolean, message: string, detail?: unknown): never {
  if (jsonOutput) {
    process.stderr.write(
      JSON.stringify({ error: message, detail: detail ?? null }, null, 2) + "\n",
    );
  } else {
    process.stderr.write(`error: ${message}\n`);
    if (detail !== undefined) {
      const text =
        typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
      process.stderr.write(text + "\n");
    }
  }
  process.exit(1);
}

export function promptHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const stdin = process.stdin;
    process.stdout.write(prompt);
    let muted = true;
    const origWrite = (process.stdout as unknown as { write: typeof process.stdout.write }).write.bind(process.stdout);
    (process.stdout as unknown as { write: typeof process.stdout.write }).write = ((chunk: unknown, encoding?: BufferEncoding, cb?: () => void) => {
      if (muted && typeof chunk === "string" && !chunk.includes(prompt)) {
        return origWrite("", encoding, cb);
      }
      return origWrite(chunk as string, encoding, cb);
    }) as typeof process.stdout.write;
    if (stdin.isTTY) {
      try {
        stdin.setRawMode?.(true);
      } catch {
        // ignore — non-TTY environments will still work
      }
    }
    rl.question("", (answer) => {
      muted = false;
      (process.stdout as unknown as { write: typeof process.stdout.write }).write = origWrite;
      process.stdout.write("\n");
      try {
        stdin.setRawMode?.(false);
      } catch {
        // ignore
      }
      rl.close();
      resolve(answer);
    });
  });
}

export function getPassphrase(): string {
  const env = process.env.POLYMARKET_PASSPHRASE;
  if (!env) {
    throw new Error(
      "POLYMARKET_PASSPHRASE not set. Export the encryption passphrase before running this command.",
    );
  }
  return env;
}
