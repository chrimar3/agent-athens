#!/bin/bash
# Runs inside the container (docker/aa-run.sh restore <id>) with only
# NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID. aa-run.sh has already checked that the
# id is one the pipeline recorded in the host-only deploys.log. Restores that
# deploy as the live one and confirms Netlify reports it published.
set -euo pipefail
: "${NETLIFY_AUTH_TOKEN:?NETLIFY_AUTH_TOKEN not set}"
: "${NETLIFY_SITE_ID:?NETLIFY_SITE_ID not set}"
id="${1:-}"
case "$id" in ''|*[!0-9a-f]*) echo "restore-deploy: bad deploy id" >&2; exit 2 ;; esac
case "$NETLIFY_SITE_ID" in *[!A-Za-z0-9-]*) echo "restore-deploy: bad site id" >&2; exit 2 ;; esac
api="https://api.netlify.com/api/v1/sites/$NETLIFY_SITE_ID"
curl -fsS -m 60 -X POST -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" "$api/deploys/$id/restore" >/dev/null \
    || { echo "restore-deploy: Netlify refused the restore of $id" >&2; exit 1; }
live="$(curl -fsS -m 30 -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" "$api" | jq -r '.published_deploy.id // empty')"
[ "$live" = "$id" ] || { echo "restore-deploy: live deploy is ${live:-unknown}, expected $id" >&2; exit 1; }
echo "RESTORED deploy_id=$id"
