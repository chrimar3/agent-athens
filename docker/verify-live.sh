#!/bin/bash
# Runs inside the container (docker/aa-run.sh verify-live) with only
# NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID. Prints the live deploy id as
#   LIVE deploy_id=<id>
# The Mac compares it with its own record of pipeline deploys and alerts on a
# mismatch; this script decides nothing itself.
set -euo pipefail
: "${NETLIFY_AUTH_TOKEN:?NETLIFY_AUTH_TOKEN not set — add it to the env file}"
: "${NETLIFY_SITE_ID:?NETLIFY_SITE_ID not set — add it to the env file (Netlify site settings, Site ID)}"
case "$NETLIFY_SITE_ID" in *[!A-Za-z0-9-]*) echo "verify-live: NETLIFY_SITE_ID has unexpected characters" >&2; exit 2 ;; esac
json="$(curl -fsS -m 30 -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
    "https://api.netlify.com/api/v1/sites/$NETLIFY_SITE_ID")" \
    || { echo "verify-live: Netlify API request failed — check the token and site id" >&2; exit 1; }
id="$(printf '%s' "$json" | jq -r '.published_deploy.id // empty')"
[ -n "$id" ] || { echo "verify-live: no published deploy in the API response" >&2; exit 1; }
echo "LIVE deploy_id=$id"
