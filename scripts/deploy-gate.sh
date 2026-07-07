#!/usr/bin/env bash
# Clean-tree deploy gate (Option 3, Phase 1 — 2026-07-07).
#
# Refuses a FORWARD deploy unless dist/ provably corresponds to committed
# code at HEAD. Closes the 2026-07-06 23:17Z breach: dist/ is both build
# output and live deploy source, so a local `bun run build` from an
# uncommitted tree (the stashed dedup-301 strand) reached production.
# "A local build is a production action" — this gate makes the deploy the
# checkpoint. NOTE: this deliberately does NOT gate `netlify rollback`
# (emergency egress stays fast); it gates only the forward deploy paths:
#   1. scripts/daily-automated.sh run_deploy (invoked BEFORE the pipeline's
#      allowlist artifact commit, so strict sha equality holds)
#   2. package.json "deploy" (the manual path — the breach was hand-reachable)
# Guard tests: scripts/__tests__/deploy-gate.test.ts (fail on removal/weaken).
#
# CORRESPONDENCE PREDICATE — all three, or exit 1 naming the failure:
#   (1) dist/.build-provenance exists and records sourceDirty=0
#   (2) its sha == current HEAD
#   (3) SOURCE scope (config/deploy-gate-scope.json) clean: no uncommitted,
#       unstaged, or untracked changes
# Fail-closed: missing stamp or missing scope config also refuse.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "deploy-gate: REFUSED — not inside a git repository" >&2; exit 1; }

SCOPE_CONFIG="$ROOT/config/deploy-gate-scope.json"
STAMP="$ROOT/dist/.build-provenance"

fail() {
    echo "deploy-gate: REFUSED — $1" >&2
    echo "deploy-gate: nothing was deployed. Fix the condition, rebuild, retry." >&2
    exit 1
}

# ---- fail-closed preconditions -------------------------------------------
[[ -f "$SCOPE_CONFIG" ]] || fail "scope config missing ($SCOPE_CONFIG) — cannot establish clean-scope, failing closed"
[[ -f "$STAMP" ]] || fail "no dist/.build-provenance stamp — dist/ has unknown provenance (build before deploying); failing closed"

# jq is a run_deploy dependency already; fall back to grep-parse if absent.
SOURCE_SCOPE=()
while IFS= read -r p; do SOURCE_SCOPE+=("$p"); done \
    < <(jq -r '.sourceScope[]' "$SCOPE_CONFIG" 2>/dev/null)
[[ ${#SOURCE_SCOPE[@]} -gt 0 ]] || fail "scope config unreadable/empty — failing closed"

# ---- condition 1: stamp integrity + built-from-clean ----------------------
STAMP_SHA="$(sed -n 's/^sha=//p' "$STAMP" | head -1)"
STAMP_DIRTY="$(sed -n 's/^sourceDirty=//p' "$STAMP" | head -1)"
[[ -n "$STAMP_SHA" && -n "$STAMP_DIRTY" ]] || fail "provenance stamp malformed — failing closed"
[[ "$STAMP_DIRTY" == "0" ]] || fail "dist/ was built from a DIRTY source tree (sourceDirty=$STAMP_DIRTY) — rebuild from a clean, committed state"

# ---- condition 2: provenance == HEAD --------------------------------------
HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
[[ "$STAMP_SHA" == "$HEAD_SHA" ]] || fail "dist/ provenance (${STAMP_SHA:0:9}) != HEAD (${HEAD_SHA:0:9}) — dist/ was not built from the current commit; rebuild"

# ---- condition 3: source scope clean now -----------------------------------
DIRTY="$(git -C "$ROOT" status --porcelain -- "${SOURCE_SCOPE[@]}")"
[[ -z "$DIRTY" ]] || fail "source scope not clean (uncommitted/untracked changes):
$DIRTY"

echo "deploy-gate: PASS — dist/ corresponds to HEAD ${HEAD_SHA:0:9}, source scope clean"
exit 0
