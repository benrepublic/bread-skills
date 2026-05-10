# Permissions

This skill calls a separate CLI — `grid-wallet-cli` — to fund the Polymarket
EOA from a Bread Spark wallet (see `SKILL.md → Funding Flow`). On agent
harnesses that gate shell access (Claude Code, etc.), the first call to
`grid-wallet-cli` will prompt the user for permission.

This file documents which command patterns to allow and what each one does,
so an agent can show the list to the user up front instead of surprising
them with prompts mid-flow.

## What this skill does NOT do

The skill installer (`install.sh`) **does not** modify your agent's
`settings.json` and **will not** auto-grant any permissions. Granting
permissions is always a user action through the agent's UI (`/permissions`)
or by editing `~/.claude/settings.json` / `.claude/settings.local.json`
yourself. This is by design — anything else would let a malicious install
script silently grant itself wallet access.

## Recommended allow-list

For Claude Code, add these to your `permissions.allow` array (either via
`/permissions add` in the UI, or by editing
`.claude/settings.local.json` — gitignored, personal scope):

| Rule | Purpose | Side effect |
|---|---|---|
| `Bash(grid-wallet-cli agent me)` | Show the linked agent profile and policy. | none — read-only |
| `Bash(grid-wallet-cli account list *)` | List Spark + external accounts and balances. | none — read-only |
| `Bash(grid-wallet-cli orchestra routes *)` | List available cross-chain swap routes. | none — read-only |
| `Bash(grid-wallet-cli orchestra estimate *)` | Quote a withdrawal — preview fees and delivered amount. | none — read-only |
| `Bash(grid-wallet-cli orchestra status *)` | Poll the status of an in-flight withdrawal. | none — read-only |
| `Bash(grid-wallet-cli orchestra withdraw *)` | **Move funds** from your Spark wallet to an external chain. | **spends real money** |

Five of the six are read-only and safe to grant once. The sixth —
`orchestra withdraw *` — actually moves money. A well-behaved agent
should still ask the user to confirm the amount, recipient, and reason
in chat before executing each individual withdraw, even with the rule
allowed.

If you'd rather only grant the read-only ones up front and approve each
withdraw at runtime, omit `Bash(grid-wallet-cli orchestra withdraw *)`
from the allow-list. You'll get a permission prompt every time the
agent attempts a withdraw, which is a perfectly reasonable choice for a
wallet CLI.

## Why this skill calls `grid-wallet-cli`

Polymarket settles in pUSD on Polygon, which wraps **USDC.e** specifically
— the original bridged USDC token (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`),
not Polygon's newer native USDC. Bridging USDC.e to the Polymarket EOA is
what `grid-wallet-cli orchestra withdraw <amt> USDC.e --to polygon ...`
does. Once the EOA holds USDC.e, `poly fund` wraps it into pUSD and sets
exchange allowances. Native USDC sitting on the EOA is invisible to
`poly fund` and produces a confusing `INSUFFICIENT_USDC_E` error.

If you don't have `grid-wallet-cli` installed, the skill still works
end-to-end — you just fund the EOA via any other rail (CEX withdrawal,
cross-chain bridge, etc.). In that case you don't need any of these
permissions.

## How to add the rules

### Option 1: `/permissions` UI (recommended)

In Claude Code, type `/permissions` and add each rule above one at a
time. The UI confirms the write and the rule lands in your
`settings.json`.

### Option 2: edit `.claude/settings.local.json` directly

Personal, gitignored scope. Merge into the existing `permissions.allow`
array — do not replace the file:

```json
{
  "permissions": {
    "allow": [
      "Bash(grid-wallet-cli agent me)",
      "Bash(grid-wallet-cli account list *)",
      "Bash(grid-wallet-cli orchestra routes *)",
      "Bash(grid-wallet-cli orchestra estimate *)",
      "Bash(grid-wallet-cli orchestra status *)"
    ]
  }
}
```

(Omit the `withdraw` rule from the allow-list if you want a confirmation
prompt on every withdraw — see the "Why" note above.)

### Option 3: respond "Yes, always" when prompted

The first time the agent calls each pattern, the harness will ask. Pick
"Yes, always for this pattern" and the rule lands automatically.
Equivalent to Option 1 but spread across the first few calls instead of
done up front.
