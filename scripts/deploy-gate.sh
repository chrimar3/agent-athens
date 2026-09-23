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
# CORRESPONDENCE PREDICATE — all four, or exit 1 naming the failure:
#   (1) dist/.build-provenance exists and records sourceDirty=0
#   (2) its sha == current HEAD
#   (3) SOURCE scope (config/deploy-gate-scope.json) clean: no uncommitted,
#       unstaged, or untracked changes
#   (4) the dist/ content hash recomputed now == the stamp's distHash
#       (dist/ was not edited, extended or trimmed after the build)
# Fail-closed: missing stamp, missing distHash or missing scope config refuse.
#
# --allow-descendant (used ONLY by `daily-automated.sh publish`): relaxes (2)
# to "the stamp sha is an ancestor of HEAD and no SOURCE-scope path differs
# between them". A deferred run builds at sha X, then makes its allowlisted
# data-artifact commit X+1 before stopping; publish runs later at HEAD X+1.
# Any source change committed after the build still refuses.

set -euo pipefail

ALLOW_DESCENDANT=0
for arg in "$@"; do
    case "$arg" in
        --allow-descendant) ALLOW_DESCENDANT=1 ;;
        *) echo "deploy-gate: REFUSED — unknown argument '$arg' (only --allow-descendant is accepted)" >&2; exit 1 ;;
    esac
done

GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
STAMP_DIST_HASH="$(sed -n 's/^distHash=//p' "$STAMP" | head -1)"
[[ -n "$STAMP_SHA" && -n "$STAMP_DIRTY" ]] || fail "provenance stamp malformed — failing closed"
[[ -n "$STAMP_DIST_HASH" ]] || fail "provenance stamp has no distHash (built before dist hashing existed) — rebuild with \`bun run build\`"
[[ "$STAMP_DIRTY" == "0" ]] || fail "dist/ was built from a DIRTY source tree (sourceDirty=$STAMP_DIRTY) — rebuild from a clean, committed state"

# ---- condition 2: provenance == HEAD --------------------------------------
HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
if [[ "$STAMP_SHA" != "$HEAD_SHA" ]]; then
    [[ "$ALLOW_DESCENDANT" == "1" ]] || fail "dist/ provenance (${STAMP_SHA:0:9}) != HEAD (${HEAD_SHA:0:9}) — dist/ was not built from the current commit; rebuild"
    git -C "$ROOT" merge-base --is-ancestor "$STAMP_SHA" HEAD 2>/dev/null \
        || fail "dist/ provenance (${STAMP_SHA:0:9}) is not an ancestor of HEAD (${HEAD_SHA:0:9}) — rebuild"
    SCOPE_CHANGED="$(git -C "$ROOT" diff --name-only "$STAMP_SHA" HEAD -- "${SOURCE_SCOPE[@]}")" \
        || fail "could not diff ${STAMP_SHA:0:9}..HEAD — failing closed"
    [[ -z "$SCOPE_CHANGED" ]] || fail "source scope changed between the build (${STAMP_SHA:0:9}) and HEAD (${HEAD_SHA:0:9}) — rebuild:
$SCOPE_CHANGED"
fi

# ---- condition 3: source scope clean now -----------------------------------
DIRTY="$(git -C "$ROOT" status --porcelain -- "${SOURCE_SCOPE[@]}")"
[[ -z "$DIRTY" ]] || fail "source scope not clean (uncommitted/untracked changes):
$DIRTY"

# ---- condition 4: dist/ bytes == what the build stamped ---------------------
# One hash implementation (src/utils/build-provenance.ts), resolved next to
# this script so fixture repos exercise the same code.
command -v bun >/dev/null 2>&1 || fail "bun not on PATH — cannot verify the dist hash; failing closed"
DIST_HASH_NOW="$(bun "$GATE_DIR/../src/utils/build-provenance.ts" dist-hash "$ROOT/dist")" \
    || fail "could not compute the dist hash — failing closed"
[[ "$DIST_HASH_NOW" == "$STAMP_DIST_HASH" ]] || fail "dist hash mismatch — dist/ changed after the build stamped it (stamp ${STAMP_DIST_HASH:0:12}, now ${DIST_HASH_NOW:0:12}); rebuild"

echo "deploy-gate: PASS — dist/ corresponds to HEAD ${HEAD_SHA:0:9}, source scope clean, dist hash verified"
exit 0
