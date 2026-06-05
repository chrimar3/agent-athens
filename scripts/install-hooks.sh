#!/usr/bin/env bash
#
# S178 — Install the pre-commit hook (one-time per clone).
#
# Idempotent: re-running just refreshes the symlink and the executable bit.
#
# Usage:
#   bash scripts/install-hooks.sh
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_SRC="$REPO_ROOT/scripts/precommit-tsc.sh"
HOOK_DST="$REPO_ROOT/.git/hooks/pre-commit"

if [ ! -d "$REPO_ROOT/.git" ]; then
  echo "error: $REPO_ROOT is not a git repo (no .git/ directory)" >&2
  exit 1
fi

if [ ! -f "$HOOK_SRC" ]; then
  echo "error: hook source missing: $HOOK_SRC" >&2
  exit 1
fi

chmod +x "$HOOK_SRC"
mkdir -p "$REPO_ROOT/.git/hooks"
ln -sf "$HOOK_SRC" "$HOOK_DST"

echo "✓ installed pre-commit hook → $HOOK_DST"
echo "  (symlinks to scripts/precommit-tsc.sh; bypass with \`git commit --no-verify\`)"
