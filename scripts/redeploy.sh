#!/bin/bash
# Gate-respecting standalone redeploy (Phase 2A) — a MANUAL tool since
# security loop round 3: the deadman STALE_DEPLOY responder no longer calls
# it (it restores the last host-verified Netlify deploy instead, see
# src/watchdog/responders.ts). Verifies platform-side state=ready (CLI exit 0
# ≠ published — banked gotcha, mistakes.md:622+). Does NOT write
# deploy-cadence lines: only the pipeline's run_deploy records cadence
# (manual success lines masked a real drought once — S193). A deploy shipped
# with this script is not in the host's verified-deploys record, so a later
# STALE_DEPLOY responder may restore the last pipeline-verified deploy over it.
#
# Credentials (security loop round 5): this script — and `bun run deploy`,
# which runs it — calls the netlify CLI on the Mac, so it needs the
# host Netlify login (`netlify login`). Nothing scheduled depends on it: the
# pipeline deploys from the container, and the watchdog's rollback runs the
# container job `bash docker/aa-run.sh restore <deploy_id>`. Removing the
# host login therefore only disables this manual path.
#
# Refuses, in this order, before anything reaches Netlify:
#   exit 6  the host quarantine marker exists
#           (${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/QUARANTINE):
#           a container run failed its integrity check, so dist/ is suspect
#   exit 2  scripts/deploy-gate.sh refuses (full predicate, origin gate
#           included: HEAD must be reviewed code on origin/main)
#   exit 7  the published-artifact gate fails on dist/
# Then: exit 3 CLI failed · 4 no deploy id · 5 deploy not state=ready.
set -o pipefail
# replace-objects:begin (security loop round 5; pinned by scripts/__tests__/deploy-gate.test.ts)
# Git must judge the real object graph. A refs/replace/* entry (writable by a
# compromised container run through .git/refs) makes every git read — rev-list,
# ls-tree, merge-base, show — substitute one object for another, while git push
# still sends the real objects. Honoured, it would let the origin gate call an
# unreviewed HEAD reviewed and the pipeline-data content gate pass a commit
# carrying code. Exported before the first git call; child processes inherit it.
export GIT_NO_REPLACE_OBJECTS=1
# replace-objects:end
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR" || exit 1
QUARANTINE_MARKER="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/QUARANTINE"
if [ -e "$QUARANTINE_MARKER" ]; then
    echo "[redeploy] REFUSED — quarantine marker $QUARANTINE_MARKER exists: a pipeline run failed its integrity check and dist/ may be hostile. Nothing deployed. Review the evidence it names, delete the marker, rebuild, then retry." >&2
    exit 6
fi
bash scripts/deploy-gate.sh || { echo "[redeploy] deploy-gate refused — nothing deployed (see the named condition above)" >&2; exit 2; }
bun run scripts/check-published-artifacts.ts dist || { echo "[redeploy] published-artifact gate failed on dist/ — nothing deployed; fix the source and rebuild" >&2; exit 7; }
OUT=$(mktemp); ERR=$(mktemp)
trap 'rm -f "$OUT" "$ERR"' EXIT
netlify deploy --prod --no-build --dir=dist --message "Gated redeploy $(date +%Y-%m-%dT%H:%M)" --json >"$OUT" 2>"$ERR" &
PID=$!
# Wall-clock watchdog (Phase-1 pattern): a hanging CLI ate ~44 min silently
# on 2026-08-10; date +%s advances through sleep.
( END=$(( $(date +%s) + ${DEPLOY_TIMEOUT:-900} ))
  while [ "$(date +%s)" -lt "$END" ]; do
    kill -0 "$PID" 2>/dev/null || exit 0
    sleep 15
  done
  kill "$PID" 2>/dev/null
) &
WD=$!
RC=0; wait "$PID" || RC=$?
kill "$WD" 2>/dev/null; wait "$WD" 2>/dev/null
[ "$RC" -ne 0 ] && { echo "[redeploy] CLI exit=$RC $(head -c 300 "$ERR")" >&2; exit 3; }
SITE_ID=$(jq -r .siteId .netlify/state.json)
DID=$(tr -d '\000-\010\013\014\016-\037' <"$OUT" | jq -r '.deploy_id // .id // empty')
[ -z "$DID" ] && { echo "[redeploy] no deploy id in CLI output" >&2; exit 4; }
STATE=$(netlify api getSiteDeploy --data "{\"site_id\":\"$SITE_ID\",\"deploy_id\":\"$DID\"}" 2>/dev/null | jq -r .state)
[ "$STATE" = "ready" ] || { echo "[redeploy] state=$STATE (not ready)" >&2; exit 5; }
echo "[redeploy] verified ready deploy_id=$DID"
