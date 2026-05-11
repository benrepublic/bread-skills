#!/usr/bin/env bash
# polymarket-skill installer.
#
#   ./install.sh                 # install + build + link `poly` globally
#   ./install.sh --no-link       # install + build only (skip global link)
#   ./install.sh --uninstall     # remove the global `poly` link
#
# Idempotent: safe to re-run after a pull.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="polymarket-skill"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()    { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

DO_LINK=1
DO_UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-link)    DO_LINK=0 ;;
    --uninstall)  DO_UNINSTALL=1 ;;
    -h|--help)    usage 0 ;;
    *)            warn "unknown flag: $arg"; usage 1 ;;
  esac
done

cd "$SCRIPT_DIR"

if (( DO_UNINSTALL )); then
  bold "Uninstalling $SKILL_NAME"
  if command -v poly >/dev/null 2>&1; then
    npm unlink -g "$SKILL_NAME" >/dev/null 2>&1 \
      && ok "removed global \`poly\` link" \
      || warn "npm unlink reported nothing to remove"
  else
    warn "\`poly\` not on PATH; nothing to unlink"
  fi
  rm -rf node_modules dist
  ok "removed node_modules and dist"
  ok "credentials at \$POLYMARKET_CREDS_PATH (default ~/.polymarket-skill/) were NOT touched"
  echo "  to wipe credentials too: rm -rf ~/.polymarket-skill"
  exit 0
fi

bold "Installing $SKILL_NAME"

# 1. Node version check.
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed. Install Node ≥ 20 first (e.g. \`brew install node\` or https://nodejs.org)."
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  fail "Node $(node -v) is too old. This skill needs Node ≥ 20."
fi
ok "Node $(node -v)"

# 2. npm install.
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
  bold "Installing dependencies"
  npm install --silent --no-audit --no-fund
fi
ok "dependencies installed"

# 3. Build.
bold "Compiling TypeScript"
npm run --silent build
ok "built dist/"

# 4. Smoke-test that the CLI loads.
if ! node ./bin/poly --version >/dev/null 2>&1; then
  fail "Built CLI failed to start. Check \`node ./bin/poly --version\` for details."
fi
ok "CLI smoke test passed"

# 5. Global link.
if (( DO_LINK )); then
  bold "Linking \`poly\` globally"
  if npm link --silent 2>/dev/null; then
    ok "linked — \`poly\` is on PATH"
  elif sudo -n true 2>/dev/null && sudo npm link --silent; then
    ok "linked with sudo — \`poly\` is on PATH"
  else
    warn "\`npm link\` failed (likely a permissions issue)"
    warn "you can re-run with sudo, or skip the link with: ./install.sh --no-link"
    warn "and use the binary directly via: $SCRIPT_DIR/bin/poly"
  fi
fi

# 6. Final instructions.
echo
bold "Installed."
echo

if command -v poly >/dev/null 2>&1; then
  POLY_PATH="$(command -v poly)"
  echo "  CLI:        $POLY_PATH"
else
  echo "  CLI:        $SCRIPT_DIR/bin/poly  (not on PATH; use full path or re-run with sudo)"
fi
echo "  SKILL.md:   $SCRIPT_DIR/SKILL.md"
echo "  RESEARCH:   $SCRIPT_DIR/RESEARCH.md"
echo

bold "Next step"
cat <<EOF
  Run this on THIS machine — the same one you just installed on:

      poly setup

  It detects what state you're in (no wallet / no funds / not wrapped /
  ready) and prints the next concrete action. Re-run after each step
  and it'll walk you through to "ready to bet."

  Who runs the commands?
    - If your agent (Claude Code, OpenClaw, Codex, Hermes, etc.) has
      shell access to this machine, the agent can run \`poly setup\`,
      \`poly fund\`, \`poly bet\`, etc. on your behalf and report back.
    - \`poly login\` is the one exception — it requires an interactive
      terminal prompt for the mnemonic, so you run it yourself once.

  Free, no-wallet sanity check:
      poly search "bitcoin price end of year" --limit 3

  Wire SKILL.md into your agent:
      cat $SCRIPT_DIR/SKILL.md
  Paste into your agent's system prompt or load via your harness.

  Uninstall: $SCRIPT_DIR/install.sh --uninstall
EOF
