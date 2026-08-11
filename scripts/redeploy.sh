#!/bin/bash
# Gate-respecting standalone redeploy (Phase 2A). Used by the STALE_DEPLOY
# responder and by humans. Refuses when the deploy-gate refuses; verifies
# platform-side state=ready (CLI exit 0 ≠ published — banked gotcha,
# mistakes.md:622+). Does NOT write deploy-cadence lines: only the pipeline's
# run_deploy records cadence (manual success lines masked a real drought
# once — S193).
set -o pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR" || exit 1
bash scripts/deploy-gate.sh || { echo "[redeploy] deploy-gate refused" >&2; exit 2; }
OUT=$(mktemp); ERR=$(mktemp)
trap 'rm -f "$OUT" "$ERR"' EXIT
netlify deploy --prod --no-build --dir=dist --message "Responder redeploy $(date +%Y-%m-%dT%H:%M)" --json >"$OUT" 2>"$ERR" &
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
