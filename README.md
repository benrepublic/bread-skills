# bread-skills

Portable agent skills you can drop into Claude Code, GPT Codex, OpenCode, or
any code-agent harness that supports a `SKILL.md` + companion CLI.

Each skill lives in its own subdirectory under `skills/` and is independently
installable via a one-line bootstrap.

## Available skills

| Skill | What it does |
| --- | --- |
| [`polymarket`](skills/polymarket) | Natural-language betting on Polymarket CLOB V2 from a mnemonic-derived Polygon EOA. |

## Install

### polymarket

```bash
curl -sSL https://raw.githubusercontent.com/benrepublic/bread-skills/main/skills/polymarket/bootstrap.sh | bash
```

This clones the repo to `~/.local/share/bread-skills`, builds the TypeScript
CLI, and `npm link`s `poly` onto your `PATH`. Re-run any time to update.

After install, point your agent at `skills/polymarket/SKILL.md` (paste it into
the system prompt or load it via your harness's skill mechanism).

For details, options (`--no-link`, `--branch`, `--dir`), and the full agent
contract, see [`skills/polymarket/README.md`](skills/polymarket/README.md) and
[`skills/polymarket/SKILL.md`](skills/polymarket/SKILL.md).

## Adding a new skill

1. Create `skills/<your-skill>/` with at minimum: `SKILL.md`, an `install.sh`,
   and a `bootstrap.sh` whose `SKILL_SUBPATH` points at `skills/<your-skill>`.
2. Add a row to the table above.
3. Open a PR.

## License

[MIT](LICENSE).
