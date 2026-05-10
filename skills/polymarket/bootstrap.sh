#!/usr/bin/env bash
# polymarket-skill — one-line web installer (bread-skills).
#
# Quick install:
#
#   curl -sSL https://raw.githubusercontent.com/benrepublic/bread-skills/main/skills/polymarket/bootstrap.sh | bash
#
# With overrides:
#
#   ... | bash -s -- --branch some-branch
#   POLYMARKET_INSTALL_DIR=~/poly ... | bash
#
# Idempotent: pulls + reinstalls if already present.

set -euo pipefail

# === Configurable defaults =====================================================
# Override at install time via env vars or flags below.
REPO_URL="${POLYMARKET_REPO_URL:-https://github.com/benrepublic/bread-skills.git}"
BRANCH="${POLYMARKET_BRANCH:-main}"
INSTALL_DIR="${POLYMARKET_INSTALL_DIR:-$HOME/.local/share/bread-skills}"
SKILL_SUBPATH="skills/polymarket"
NO_LINK=0
# ==============================================================================

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
ok()    { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
fail()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)   BRANCH="$2"; shift 2 ;;
    --dir)      INSTALL_DIR="$2"; shift 2 ;;
    --repo)     REPO_URL="$2"; shift 2 ;;
    --no-link)  NO_LINK=1; shift ;;
    -h|--help)
      sed -n '2,/^# ====/p' "$0" | sed 's/^# \{0,1\}//' | sed '/^====/d'
      exit 0 ;;
    *) fail "unknown flag: $1" ;;
  esac
done

bold "polymarket-skill installer"
echo "  repo:    $REPO_URL"
echo "  branch:  $BRANCH"
echo "  dir:     $INSTALL_DIR"
echo

# 1. Prereqs.
for cmd in git node npm; do
  command -v "$cmd" >/dev/null 2>&1 || fail "missing prerequisite: \`$cmd\`. Install it and re-run."
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 20 )) || fail "Node $(node -v) is too old. This skill needs Node ≥ 20."
ok "git $(git --version | awk '{print $3}'), node $(node -v)"

# 2. Clone or update.
mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  bold "Updating existing checkout"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH" \
    || fail "git fetch failed. If the repo is private, make sure your git credentials are set up."
  git -C "$INSTALL_DIR" reset --hard "FETCH_HEAD"
  ok "updated to latest $BRANCH"
else
  bold "Cloning"
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR" \
    || fail "git clone failed. If the repo is private, set up a credential helper or use --repo with an authenticated URL."
  ok "cloned to $INSTALL_DIR"
fi

# 3. Run the in-tree installer.
SKILL_DIR="$INSTALL_DIR/$SKILL_SUBPATH"
[[ -x "$SKILL_DIR/install.sh" ]] || fail "expected installer not found at $SKILL_DIR/install.sh"

bold "Handing off to in-tree installer"
echo
if (( NO_LINK )); then
  "$SKILL_DIR/install.sh" --no-link
else
  "$SKILL_DIR/install.sh"
fi
