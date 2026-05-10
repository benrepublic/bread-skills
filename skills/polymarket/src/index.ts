#!/usr/bin/env node
import { Command } from "commander";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { whoamiCommand } from "./commands/whoami";
import { searchCommand } from "./commands/search";
import { quoteCommand } from "./commands/quote";
import { betCommand } from "./commands/bet";
import { positionsCommand } from "./commands/positions";
import { fundCommand } from "./commands/fund";
import { marketsCommand } from "./commands/markets";
import { sellCommand } from "./commands/sell";
import { closeCommand } from "./commands/close";

const program = new Command();

program
  .name("poly")
  .description("Polymarket CLOB V2 betting CLI — natural-language friendly")
  .version("0.2.0");

program
  .command("login")
  .description(
    "Prompt for mnemonic and store creds in the OS keychain (default) or a passphrase-encrypted file (--encrypted-file).",
  )
  .option("--json", "machine-readable output")
  .option("--force", "overwrite existing creds")
  .option(
    "--encrypted-file",
    "store creds as an AES-256-GCM file gated by a user-chosen passphrase instead of the OS keychain",
  )
  .action((opts) =>
    loginCommand({
      json: opts.json,
      force: opts.force,
      encryptedFile: opts.encryptedFile,
    }),
  );

program
  .command("logout")
  .description("Delete stored credentials")
  .option("--json", "machine-readable output")
  .action((opts) => logoutCommand(opts));

program
  .command("whoami")
  .description("Show EOA, on-chain balances, and approval state")
  .option("--json", "machine-readable output")
  .action((opts) => whoamiCommand(opts));

program
  .command("search <query...>")
  .description("Search Gamma for markets matching a natural-language query")
  .option("--json", "machine-readable output")
  .option("--limit <n>", "max results", (v) => Number(v), 5)
  .option("--min-liquidity <n>", "filter markets below this USD liquidity", (v) =>
    Number(v),
  )
  .action((tokens: string[], opts) =>
    searchCommand(tokens.join(" "), {
      json: opts.json,
      limit: opts.limit,
      minLiquidity: opts.minLiquidity,
    }),
  );

program
  .command("quote <conditionId> <side> <amount>")
  .description(
    "Preview a fill. amount = USD for a buy, shares for a sell (with --sell). No order placed.",
  )
  .option("--json", "machine-readable output")
  .option("--sell", "interpret amount as shares; quote a sell against bids")
  .action((conditionId: string, side: string, amount: string, opts) =>
    quoteCommand(conditionId, side, amount, opts),
  );

program
  .command("bet <conditionId> <side> <usdAmount>")
  .description("Place an order. Refuses without --confirm.")
  .option("--json", "machine-readable output")
  .option("--confirm", "explicit user confirmation; required to send")
  .option(
    "--type <type>",
    "FOK | FAK | GTC. Defaults to FOK for market orders, GTC when --limit-price is given.",
  )
  .option("--limit-price <p>", "GTC limit price between 0 and 1", (v) => Number(v))
  .option("--max-slippage-bps <bps>", "abort if avg fill exceeds top-of-book by this many bps", (v) =>
    Number(v),
  )
  .option("--override", "override the min-liquidity floor")
  .action((conditionId: string, side: string, usd: string, opts) =>
    betCommand(conditionId, side, usd, {
      json: opts.json,
      confirm: opts.confirm,
      type: opts.type,
      limitPrice: opts.limitPrice,
      maxSlippageBps: opts.maxSlippageBps,
      override: opts.override,
    }),
  );

program
  .command("sell <conditionId> <side> <shares>")
  .description("Sell <shares> of a YES or NO position. Refuses without --confirm.")
  .option("--json", "machine-readable output")
  .option("--confirm", "explicit user confirmation; required to send")
  .option(
    "--type <type>",
    "FOK | FAK | GTC. Defaults to FOK for market sells, GTC when --limit-price is given.",
  )
  .option("--limit-price <p>", "GTC limit price between 0 and 1", (v) => Number(v))
  .option("--max-slippage-bps <bps>", "abort if avg fill is worse than top-of-book by this many bps", (v) =>
    Number(v),
  )
  .action((conditionId: string, side: string, shares: string, opts) =>
    sellCommand(conditionId, side, shares, {
      json: opts.json,
      confirm: opts.confirm,
      type: opts.type,
      limitPrice: opts.limitPrice,
      maxSlippageBps: opts.maxSlippageBps,
    }),
  );

program
  .command("close <conditionId>")
  .description("Close (sell entirely) the open position(s) on a market. Refuses without --confirm.")
  .option("--json", "machine-readable output")
  .option("--confirm", "explicit user confirmation; required to send")
  .option("--side <side>", "limit close to YES or NO; default closes both if both held")
  .option("--type <type>", "FOK | FAK. Defaults to FOK.")
  .action((conditionId: string, opts) =>
    closeCommand(conditionId, {
      json: opts.json,
      confirm: opts.confirm,
      type: opts.type,
      side: opts.side,
    }),
  );

program
  .command("positions")
  .description("List open positions and unrealized PnL")
  .option("--json", "machine-readable output")
  .action((opts) => positionsCommand(opts));

program
  .command("fund <usdAmount>")
  .description(
    "Wrap USDC.e into pUSD and set exchange/CTF allowances. Pass 0 to only run allowances.",
  )
  .option("--json", "machine-readable output")
  .option("--confirm", "required to send transactions")
  .action((usd: string, opts) => fundCommand(usd, opts));

program
  .command("markets <conditionId>")
  .description("Show raw market metadata")
  .option("--json", "machine-readable output")
  .action((cid: string, opts) => marketsCommand(cid, opts));

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
