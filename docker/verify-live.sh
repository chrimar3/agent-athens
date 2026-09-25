#!/bin/bash
# Runs inside the container (docker/aa-run.sh verify-live) with only
# NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID. Prints strict machine lines that the
# Mac (docker/check-live.sh) compares with its own records; this script
# decides nothing itself:
#
#   LIVE deploy_id=<id>                 the published deploy
#   LIVE settings_hash=<sha256>         of the security-relevant site settings
#   LIVE snippets=<n>                   Netlify snippet-injection entries
#   LIVE snippets_hash=<sha256>         of their canonical JSON
#   LIVE page <home|event> status=<n>   HTTPS GET of the live pages (000: failed)
#   LIVE header <home|event> <name>=<sha256 of the value>
#                                       content-security-policy,
#                                       strict-transport-security,
#                                       x-content-type-options (absent: no line)
#   LIVE csp_ok=<yes|no>                every fetched page serves a CSP with a
#                                       script-src allowing neither
#                                       'unsafe-inline' nor 'unsafe-eval'
#
# Everything fetched is untrusted: it is only hashed, counted or matched
# against fixed patterns, never printed. The token is never printed.
set -euo pipefail
: "${NETLIFY_AUTH_TOKEN:?NETLIFY_AUTH_TOKEN not set — add it to the env file}"
: "${NETLIFY_SITE_ID:?NETLIFY_SITE_ID not set — add it to the env file (Netlify site settings, Site ID)}"
case "$NETLIFY_SITE_ID" in *[!A-Za-z0-9-]*) echo "verify-live: NETLIFY_SITE_ID has unexpected characters" >&2; exit 2 ;; esac
SITE="https://agentathens.com"
SITE_RE='https://agentathens\.com'
API="https://api.netlify.com/api/v1/sites/$NETLIFY_SITE_ID"

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
api_get() {  # $1 URL → body. The token travels in a header only.
    curl -fsS -m 30 --proto '=https' -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" "$1"
}

json="$(api_get "$API")" \
    || { echo "verify-live: Netlify API request failed — check the token and site id" >&2; exit 1; }
id="$(printf '%s' "$json" | jq -r '.published_deploy.id // empty')"
printf '%s' "$id" | grep -qE '^[0-9a-f]{20,40}$' \
    || { echo "verify-live: no well-formed published deploy id in the API response" >&2; exit 1; }
echo "LIVE deploy_id=$id"

# Site settings someone holding the Netlify token could change to serve other
# content without a new deploy, or to weaken HTTPS: domains, password
# protection, SSL, prerendering, asset/HTML post-processing and the build
# settings (build env: key names only, so rotating a value does not alert).
settings="$(printf '%s' "$json" | jq -cS '{
    custom_domain, domain_aliases, branch_deploy_custom_domain, deploy_preview_custom_domain,
    has_password: ((((.password // "") | tostring | length) > 0) or (.has_password // false)),
    ssl, force_ssl, managed_dns, prerender, processing_settings,
    build_settings: ((.build_settings // {}) | {provider, repo_url, repo_branch, repo_path, cmd, dir,
        functions_dir, allowed_branches, stop_builds, env_keys: ((.env // {}) | keys)})
}' 2>/dev/null || true)"
if [ -n "$settings" ]; then
    echo "LIVE settings_hash=$(printf '%s' "$settings" | sha256)"
else
    echo "verify-live: could not read the site settings" >&2
fi

# Snippet injection adds HTML to every served page, outside any deploy.
if snippets="$(api_get "$API/snippets" 2>/dev/null | jq -cS 'if type == "array" then . else error("not a list") end' 2>/dev/null)"; then
    echo "LIVE snippets=$(printf '%s' "$snippets" | jq 'length')"
    echo "LIVE snippets_hash=$(printf '%s' "$snippets" | sha256)"
else
    echo "verify-live: could not list snippet injection (does the token have access?)" >&2
fi

# yes if some served policy (combined policies are comma-separated) has a
# script-src directive without 'unsafe-inline' or 'unsafe-eval'. Value on stdin.
csp_script_src_ok() {
    awk -v q="'" 'BEGIN { RS = ","; ok = "no" }
        { n = split(tolower($0), d, ";")
          for (i = 1; i <= n; i++) {
              s = d[i]; sub(/^[ \t\r\n]+/, "", s)
              if (s ~ /^script-src([ \t]|$)/ && !index(s, q "unsafe-inline" q) && !index(s, q "unsafe-eval" q)) ok = "yes"
          } }
        END { print ok }'
}

header_value() {  # $1 lower-case header name; headers on stdin → all its values joined with ","
    awk -v n="$1" '{ i = index($0, ":")
        if (i > 1 && tolower(substr($0, 1, i - 1)) == n) {
            v = substr($0, i + 1); sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v)
            out = (c++ ? out "," : "") v } }
        END { printf "%s", out }'
}

csp_all=yes
check_page() {  # $1 label, $2 URL
    local headers status name value
    headers="$(curl -sS -m 30 --proto '=https' --max-redirs 0 -o /dev/null -D - "$2" 2>/dev/null | tr -d '\r' || true)"
    status="$(printf '%s\n' "$headers" | sed -n '1s/^HTTP\/[0-9.]* \([0-9][0-9][0-9]\).*/\1/p')"
    echo "LIVE page $1 status=${status:-000}"
    for name in content-security-policy strict-transport-security x-content-type-options; do
        value="$(printf '%s\n' "$headers" | header_value "$name")"
        if [ -n "$value" ]; then
            echo "LIVE header $1 $name=$(printf '%s' "$value" | sha256)"
            if [ "$name" = "content-security-policy" ] && [ "$(printf '%s' "$value" | csp_script_src_ok)" != "yes" ]; then csp_all=no; fi
        elif [ "$name" = "content-security-policy" ]; then
            csp_all=no
        fi
    done
}

check_page home "$SITE/"
# One event page, so the event template's headers are checked too: the first
# entry of the live sitemap-events.xml. It exists in whatever deploy is live
# now, unlike a fixed path (events expire) or dist/ (may hold a build not yet
# published). Header rules are site-wide paths, and a deploy that changed
# them is already caught by the deploy-id check. Only a same-origin path of
# plain URL characters is accepted.
event="$(curl -fsS -m 30 --proto '=https' --max-redirs 0 --max-filesize 50000000 "$SITE/sitemap-events.xml" 2>/dev/null \
    | grep -oE "<loc>$SITE_RE/[A-Za-z0-9/_.%~-]+</loc>" | head -1 | sed -e 's/^<loc>//' -e 's/<\/loc>$//' || true)"
if [ -n "$event" ]; then
    check_page event "$event"
else
    echo "verify-live: no event page found in $SITE/sitemap-events.xml" >&2
    csp_all=no
fi
echo "LIVE csp_ok=$csp_all"
