# polymarket-skill

A portable agent skill for placing **natural-language bets on Polymarket CLOB V2** from any code-agent harness that loads a `SKILL.md` (Claude Code, GPT Codex, Hermes, Openclaw).

The agent contract lives in [`SKILL.md`](./SKILL.md). The protocol reference (V2 EIP-712, pUSD, contract addresses, auth) lives in [`RESEARCH.md`](./RESEARCH.md). This README is the human install and demo guide.

## What it does

- Logs in with a **BIP-39 mnemonic** (stdin only, never argv). Encrypts to disk with AES-256-GCM under a passphrase.
- Derives the Polymarket API key from your wallet signature.
- Searches Polymarket via the Gamma API and ranks results by topical relevance × liquidity.
- Quotes a hypothetical fill against the live order book before any order is sent.
- Places fill-or-kill USD-denominated market orders (or GTC limit orders) through `@polymarket/clob-client-v2`.
- Wraps USDC.e → pUSD and sets exchange/CTF allowances on Polygon when the wallet is funded for the first time.
- Refuses to bet on thin markets without an explicit override; refuses to send any order without `--confirm`.

## What it does not do

- No Gnosis Safe proxy signing — EOA only (`signatureType=0`). If your funds are inside a polymarket.com email/Magic proxy, this skill cannot reach them.
- No order cancellation, no liquidity provision, no resolution claiming.
- No testnet by default. Set `POLYMARKET_CHAIN_ID=80002` if you want Amoy.

## Install

Requires Node ≥ 20.

### One-liner from the web (recommended for users)

Once you've hosted `bootstrap.sh` somewhere public (see *Hosting the one-liner* below), users install with:

```bash
curl -sSL https://your.domain/poly | bash
```

That clones the repo to `~/.local/share/polymarket-skill`, runs the in-tree `install.sh`, and links `poly` globally.

### Local install (if you already have the repo cloned)

```bash
cd .agents/skills/polymarket-skill
./install.sh                # installs deps, builds, links `poly` globally
```

That's it — `poly --help` works from anywhere afterwards. The installer is idempotent; re-run it after pulling.

Other modes:

```bash
./install.sh --no-link      # build only, don't put `poly` on PATH (use bin/poly directly)
./install.sh --uninstall    # remove the global link and built artifacts
                            # (credentials at ~/.polymarket-skill/ are left alone)
```

If you'd rather drive npm yourself:

```bash
npm install && npm run build && npm test && npm link
```

### Hosting the one-liner

`bootstrap.sh` in this directory is the script users pipe into bash. It clones the repo and runs `install.sh` for them. **It needs the repo to be reachable without auth** — i.e. either the repo is public, or the user has already configured git credentials for it.

Three realistic ways to make `curl -sSL https://your.domain/poly | bash` work:

| Option                                                                | Public repo needed? | What you do                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Static-host `bootstrap.sh` on your site, clone from public repo** | Yes                 | Upload `bootstrap.sh` to your site (e.g. `https://your.domain/poly`). Make the GitHub repo public. Done.                                                 |
| **B. Static-host on GitHub Pages / Vercel, clone from public repo**   | Yes                 | Drop `bootstrap.sh` into a public repo, enable Pages. Stable raw URL, no domain needed: `https://raw.githubusercontent.com/<you>/<repo>/main/bootstrap.sh`. |
| **C. Mirror the skill to its own public repo**                         | New public repo     | Copy this directory into a fresh public GitHub repo. Edit `POLYMARKET_REPO_URL` in `bootstrap.sh` to point there. Then host `bootstrap.sh` anywhere.       |

For (A): your website just needs to serve `bootstrap.sh` raw at the URL of your choice. If you're on Vercel/Netlify/Cloudflare Pages, drop the file in and add a header so the browser doesn't try to render it as text:

```
# vercel.json or _headers
/poly  →  Content-Type: text/plain; charset=utf-8
```

### Trying the one-liner before you ship it

You can verify the bootstrap end-to-end against your local repo without any hosting:

```bash
./bootstrap.sh --repo "$PWD/../../.." --branch "$(git branch --show-current)" --dir /tmp/poly-test
/tmp/poly-test/.agents/skills/polymarket-skill/bin/poly --help
rm -rf /tmp/poly-test
```

## Environment

| Variable                                | Default                              | Purpose                              |
| --------------------------------------- | ------------------------------------ | ------------------------------------ |
| `POLYMARKET_PASSPHRASE`                 | (only used by `--encrypted-file` mode) | Decrypts the AES-encrypted creds file; not used in default keychain mode |
| `POLYGON_RPC_URL`                       | `https://polygon-rpc.com`            | Polygon RPC for balances + funding   |
| `POLYMARKET_CLOB_HOST`                  | `https://clob.polymarket.com`        | CLOB API host                        |
| `POLYMARKET_GAMMA_HOST`                 | `https://gamma-api.polymarket.com`   | Gamma API host                       |
| `POLYMARKET_CHAIN_ID`                   | `137`                                | `80002` for Amoy testnet             |
| `POLYMARKET_MIN_LIQUIDITY`              | `500`                                | Refuse-to-bet floor (USD)            |
| `POLYMARKET_CREDS_PATH`                 | `~/.polymarket-skill/creds.json`     | Marker file location (mode + EOA in keychain mode; full encrypted blob in `--encrypted-file` mode) |
| `POLYMARKET_PUSD_ADDRESS`               | (doc'd default)                      | Override pUSD contract address       |
| `POLYMARKET_USDCE_ADDRESS`              | (doc'd default)                      | Override USDC.e contract address     |
| `POLYMARKET_ONRAMP_ADDRESS`             | (doc'd default)                      | Override CollateralOnramp address    |
| `POLYMARKET_EXCHANGE_ADDRESS`           | (doc'd default)                      | Override CTF Exchange address        |
| `POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS`  | (doc'd default)                      | Override Neg Risk Exchange address   |
| `POLYMARKET_CTF_ADDRESS`                | (doc'd default)                      | Override Conditional Tokens address  |

## End-to-end transcript

```text
$ poly login
Mnemonic (12/24 words, hidden): ········································
Logged in. EOA: 0xAbC…123
Creds stored in macOS Keychain (marker at /Users/me/.polymarket-skill/creds.json).
No passphrase needed — future commands read the wallet from the keychain automatically while you're logged in.

$ poly whoami
EOA:               0xAbC…123
Chain:             137 (Polygon)
MATIC balance:     0.842
USDC.e balance:    0.000000
pUSD balance:      0.000000
pUSD allowance:    NOT SET — run `poly fund`
CTF approval:      NOT SET — run `poly fund`
API key:           a1b2c3d4…

# Bridge $100 USDC from Spark → Polygon EOA via grid-wallet-cli
$ grid-wallet-cli orchestra withdraw 102000000 USDC \
    --to polygon --recipient 0xAbC…123 \
    --reason "Funding Polymarket bet on hantavirus pandemic 2026"
✓ orderId orch_XXX — pending

$ grid-wallet-cli orchestra status orch_XXX
✓ completed

$ poly fund 100 --confirm
  ✓ USDC.e approve onramp (0x…)
  ✓ wrap 100 USDC.e → pUSD (0x…)
  ✓ pUSD approve exchange (max) (0x…)
  ✓ CTF setApprovalForAll(exchange) (0x…)
pUSD before: 0.000000
pUSD after:  100.000000

$ poly search "hantavirus pandemic 2026" --limit 3
1. Will there be a hantavirus pandemic in 2026?
   conditionId: 0x…
   liquidity:   $12,400.55
   matchScore:  0.873
2. (other matches)

$ poly quote 0x… YES 100
Market:           Will there be a hantavirus pandemic in 2026?
Side:             YES
USD in:           $100.00
Filled USD:       $100.00
Filled fully:     yes
Expected shares:  2,500.0000
Avg fill price:   $0.0400 (implied 4.00%)

# Agent shows the quote to the user, gets explicit "yes", then:
$ poly bet 0x… YES 100 --confirm --max-slippage-bps 50
Order submitted.
{"orderID":"0x…","status":"matched","makingAmount":"100.000000",…}

$ poly positions
Will there be a hantavirus pandemic in 2026?
  outcome:    Yes
  size:       2500.00 shares @ avg $0.0400
  current:    $100.00
  PnL:        $0.00 (0.00%)
  ends:       2026-12-31T23:59:00Z
```

## Project layout

```
.agents/skills/polymarket-skill/
├── SKILL.md                # agent-facing contract
├── RESEARCH.md             # protocol reference (CLOB V2, pUSD, EIP-712)
├── README.md               # this file
├── package.json
├── tsconfig.json
├── bin/poly                # CLI entry shim
├── src/
│   ├── index.ts            # commander registry
│   ├── config.ts           # env-driven config
│   ├── wallet.ts           # mnemonic → ethers Wallet
│   ├── creds.ts            # AES-GCM encrypted credentials
│   ├── gamma.ts            # market discovery + ranking
│   ├── ranker.ts           # natural-language relevance
│   ├── clob.ts             # @polymarket/clob-client-v2 wrapper, fill estimator
│   ├── chain.ts            # Polygon RPC: balances, allowances, wrap
│   ├── commands/           # one file per subcommand
│   └── util/io.ts          # stdin/stdout helpers
└── test/                   # node:test, no network calls in CI
```

## Security posture

- Mnemonic accepted on stdin only, with the local TTY in raw mode and stdout muted while typing. Never logged, never serialized to argv or env vars, never written to disk in plaintext.
- **Keychain mode (default):** mnemonic + API key live in macOS Keychain / Linux libsecret, sealed when the user is logged out or the machine is locked. The on-disk marker file contains only `{ version, mode, eoa }` — no secret material. On macOS the item is stored with `-A` (no per-app ACL prompt) so the agent flow has zero GUI friction — matching the convention used by `gh`, `gcloud`, `ssh-agent`, `npm`. Threat model: as safe as your user-login session; an attacker with shell access to your *unlocked* machine can read it (same as your browser cookies, password manager, SSH keys).
- **`--encrypted-file` mode (opt-in):** AES-256-GCM with a fresh 16-byte salt and 12-byte IV per save; PBKDF2-HMAC-SHA256, 200 000 iterations; file is `0600`, parent dir is `0700`. Requires `POLYMARKET_PASSPHRASE` on every command. Wrong passphrase fails closed — never silently re-derives.
- The CLI never reads, prints, or transmits the API key secret. The first eight chars of the public key may be displayed by `whoami` for debugging.

## Cross-agent compatibility

The skill is a CLI plus a `SKILL.md`. It does not depend on any one agent harness. Drop-in instructions:

- **Claude Code:** placed under `.agents/skills/polymarket-skill/` per repo convention. Reference it from `AGENTS.md` if you want it auto-discovered.
- **GPT Codex / Hermes / Openclaw:** load `SKILL.md` as your system message addendum, ensure `poly` is on PATH, and the instructions in SKILL.md are agent-runtime-agnostic.

## Related

- [`packages/grid-wallet-cli/SKILL.md`](../../../packages/grid-wallet-cli/SKILL.md) — the funding side. `poly`'s funding flow is documented to integrate with `grid-wallet-cli orchestra`.
- [`RESEARCH.md`](./RESEARCH.md) — the source-cited V2 protocol reference. Read before debugging any signing or auth issue.
