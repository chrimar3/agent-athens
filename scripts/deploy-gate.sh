#!/usr/bin/env bash
# Clean-tree + origin deploy gate (Option 3, Phase 1 — 2026-07-07; origin
# gate moved here in security loop round 3).
#
# Refuses a FORWARD deploy unless dist/ provably corresponds to committed,
# REVIEWED code at HEAD. Closes the 2026-07-06 23:17Z breach: dist/ is both
# build output and live deploy source, so a local `bun run build` from an
# uncommitted tree (the stashed dedup-301 strand) reached production.
# "A local build is a production action" — this gate makes the deploy the
# checkpoint. NOTE: this deliberately does NOT gate `netlify rollback` /
# restoreSiteDeploy (emergency egress stays fast); it gates every forward
# deploy path, and each of them calls it with NO flag (full predicate):
#   1. scripts/daily-automated.sh run_deploy (producing run and `publish`)
#   2. package.json "deploy" (the manual path — the breach was hand-reachable)
#   3. scripts/redeploy.sh (manual gated redeploy)
# Guard tests: scripts/__tests__/deploy-gate.test.ts (fail on removal/weaken).
#
# CORRESPONDENCE PREDICATE — all five, or exit 1 naming the failure:
#   (1) dist/.build-provenance exists and records sourceDirty=0
#   (2) its sha == current HEAD
#   (3) SOURCE scope (config/deploy-gate-scope.json) clean: no uncommitted,
#       unstaged, or untracked changes
#   (4) the dist/ content hash recomputed now == the stamp's distHash
#       (dist/ was not edited, extended or trimmed after the build)
#   (5) ORIGIN GATE: after a bounded, non-interactive fetch of origin/main,
#       HEAD is origin/main or an ancestor of it — reviewed and merged code
#       only, no local commits of any kind. (The pipeline's data-artifact
#       commits live on the separate pipeline-data branch and never touch
#       HEAD, so there is no exception for them.) An unreachable remote
#       refuses too: without the remote tip nothing can be called reviewed.
# Fail-closed: missing stamp, missing distHash or missing scope config refuse.
#
# --allow-descendant (used ONLY by `daily-automated.sh publish`): relaxes (2)
# to "the stamp sha is an ancestor of HEAD and no SOURCE-scope path differs
# between them" (HEAD may have been fast-forwarded to newer reviewed commits
# between the deferred build and publish). Any source change committed after
# the build still refuses; (5) still applies in full.
#
# --local-only (used ONLY by a deferred producing run, AA_DEFER_PUBLISH=1,
# which never deploys and holds no network credentials): checks (1)-(4) and
# skips (5). It authorises nothing: `publish` re-runs the full gate before any
# push or deploy. It cannot be combined with --allow-descendant.

set -euo pipefail

# replace-objects:begin (security loop round 5; pinned by scripts/__tests__/deploy-gate.test.ts)
# Git must judge the real object graph. A refs/replace/* entry (writable by a
# compromised container run through .git/refs) makes every git read — rev-list,
# ls-tree, merge-base, show — substitute one object for another, while git push
# still sends the real objects. Honoured, it would let the origin gate call an
# unreviewed HEAD reviewed and the pipeline-data content gate pass a commit
# carrying code. Exported before the first git call; child processes inherit it.
export GIT_NO_REPLACE_OBJECTS=1
# replace-objects:end

# The only branch whose tip counts as reviewed code (main's ruleset requires a
# PR). Not overridable: an env or flag here would be a one-line gate bypass.
readonly PRODUCTION_BRANCH="main"

ALLOW_DESCENDANT=0
LOCAL_ONLY=0
for arg in "$@"; do
    case "$arg" in
        --allow-descendant) ALLOW_DESCENDANT=1 ;;
        --local-only) LOCAL_ONLY=1 ;;
        *) echo "deploy-gate: REFUSED — unknown argument '$arg' (only --allow-descendant or --local-only is accepted)" >&2; exit 1 ;;
    esac
done
if [[ "$ALLOW_DESCENDANT" == "1" && "$LOCAL_ONLY" == "1" ]]; then
    echo "deploy-gate: REFUSED — --local-only and --allow-descendant cannot be combined (publish must run the full gate)" >&2
    exit 1
fi

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

if [[ "$LOCAL_ONLY" == "1" ]]; then
    echo "deploy-gate: PASS (--local-only) — dist/ corresponds to HEAD ${HEAD_SHA:0:9}, source scope clean, dist hash verified. Origin gate NOT run: this is NOT a deploy authorisation (publish runs the full gate)."
    exit 0
fi

# awake-bounded:begin (keep both markers)
# Run "$@" in the background with an AWAKE-time limit of $1 seconds (15 s
# ticks of kernel-paused sleep, the same policy as the pipeline's push and
# deploy watchdogs: a suspended laptop is not a stalled command), then TERM,
# then KILL after 4 more ticks. Returns the command's status, or 124 on timeout.
run_awake_bounded() {
    local limit="$1"; shift
    local flag
    flag=$(mktemp) || return 125
    "$@" &
    local pid=$!
    ( ticks=0
      while [ "$(( ticks * 15 ))" -lt "$limit" ]; do
        kill -0 "$pid" 2>/dev/null || exit 0
        sleep 15
        ticks=$(( ticks + 1 ))
      done
      kill -0 "$pid" 2>/dev/null || exit 0
      echo timeout > "$flag"
      kill "$pid" 2>/dev/null || true
      ticks=0
      while [ "$ticks" -lt 4 ]; do
        kill -0 "$pid" 2>/dev/null || exit 0
        sleep 5
        ticks=$(( ticks + 1 ))
      done
      kill -9 "$pid" 2>/dev/null || true
    ) &
    local wd=$! rc=0
    wait "$pid" || rc=$?
    kill "$wd" 2>/dev/null || true
    wait "$wd" 2>/dev/null || true
    if [[ -s "$flag" ]]; then rc=124; fi
    rm -f "$flag"
    return "$rc"
}
# awake-bounded:end

# ---- condition 5: origin gate — only reviewed code ships --------------------
# origin-gate:begin (keep both markers; pinned by scripts/__tests__/deploy-gate.test.ts)
og_fail() {
    echo "deploy-gate: REFUSED — [origin-gate] REFUSED — $1" >&2
    echo "deploy-gate: nothing was deployed. Get the code reviewed and merged to origin/$PRODUCTION_BRANCH, reset the checkout to it (git fetch origin && git reset --hard origin/$PRODUCTION_BRANCH), rebuild, retry." >&2
    exit 1
}
og_ref="refs/remotes/origin/$PRODUCTION_BRANCH"
og_rc=0
run_awake_bounded "${FETCH_TIMEOUT:-120}" env GIT_TERMINAL_PROMPT=0 \
    git -C "$ROOT" -c credential.helper='!gh auth git-credential' fetch --quiet --no-tags \
    origin "+refs/heads/$PRODUCTION_BRANCH:$og_ref" >&2 || og_rc=$?
if [[ "$og_rc" -ne 0 ]]; then
    og_what="failed (exit $og_rc)"
    [[ "$og_rc" -eq 124 ]] && og_what="timed out after ${FETCH_TIMEOUT:-120}s of awake time"
    og_fail "fetching origin/$PRODUCTION_BRANCH $og_what; cannot prove HEAD is reviewed code. Check network/credentials (git fetch origin $PRODUCTION_BRANCH)"
fi
og_tip="$(git -C "$ROOT" rev-parse --verify -q "$og_ref^{commit}")" \
    || og_fail "cannot resolve $og_ref after the fetch"
if ! git -C "$ROOT" merge-base --is-ancestor "$HEAD_SHA" "$og_tip"; then
    og_local="$(git -C "$ROOT" rev-list --max-count=10 "$og_tip..$HEAD_SHA" | cut -c1-12 | tr '\n' ' ')"
    og_fail "HEAD ${HEAD_SHA:0:12} is not on origin/$PRODUCTION_BRANCH (${og_tip:0:12}); local commit(s) not reviewed: ${og_local:-unknown}"
fi
# origin-gate:end

echo "deploy-gate: PASS — dist/ corresponds to HEAD ${HEAD_SHA:0:9}, source scope clean, dist hash verified, HEAD is reviewed code on origin/$PRODUCTION_BRANCH (${og_tip:0:9})"
exit 0
