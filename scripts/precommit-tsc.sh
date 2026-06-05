#!/usr/bin/env bash
#
# S178 — Pre-commit type check against POST-COMMIT state.
#
# Problem: working-tree `bunx tsc --noEmit` cannot catch the staging-strand
# (importer staged + imported util on disk but unstaged) because TypeScript
# resolves modules via the filesystem with zero git-awareness — the unstaged
# file is right there. By the time we discover the strand, HEAD ships with a
# dangling import (S164 / S165 / S174 — three instances in four sessions
# closed this mitigation gap, see .claude/notes/patterns.md S178).
#
# Solution: stash everything that ISN'T staged so the working tree matches
# exactly what the commit will create, then run tsc against that view.
# Bypass via `git commit --no-verify` for intentional WIP commits (intact —
# this is a git feature, not something the script enforces).
set -e

# Brand-new repo (no HEAD yet) — first commit ever cannot strand anything
# because there's nothing to strand from. Skip stash dance, just type-check.
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  exec bunx tsc --noEmit
fi

STASH_MSG="precommit-tsc-$$-$(date +%s)"

restore_stash() {
  # Conditional on marker presence: handles "nothing to stash" cleanly.
  # `git stash list --format='%s'` emits `"On <branch>: <msg>"` — so we want
  # substring match (-F fixed-string, no -x exact-line). The marker carries
  # PID + epoch, so a collision against an unrelated user stash is not a
  # realistic concern.
  if git stash list --format='%s' | grep -qF "$STASH_MSG"; then
    # `|| true` swallows pop-conflicts so the trap can't itself fail — a pop
    # conflict means the WT is left half-applied, which the test suite's
    # working-tree-preservation case catches.
    git stash pop --quiet >/dev/null 2>&1 || true
  fi
}
trap restore_stash EXIT INT TERM

# --keep-index leaves the STAGED version in the working tree (= post-commit view).
# --include-untracked stashes new files too; .gitignore is respected so dist/,
#   node_modules/, data/ aren't touched.
# `|| true`: some git versions exit non-zero when there's nothing to stash; that
#   case is not an error here.
git stash push --keep-index --include-untracked --message "$STASH_MSG" --quiet 2>/dev/null || true

bunx tsc --noEmit
