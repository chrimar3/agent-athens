#!/bin/bash
# Judges the output of the verify-live container run on the Mac (called by
# aa-run.sh's check_live; bash 3.2). Only strict "LIVE ..." lines are read
# (see docker/verify-live.sh); nothing is evaluated.
#
#   docker/check-live.sh OUTPUT_FILE DEPLOYS_LOG BASELINE_FILE
#
# Prints "ok ...", "note ..." and "ALERT ..." lines. Exit 0 when the live site
# looks as the pipeline left it, 8 on any alert, 2 on bad usage. Alerts when:
#   - the live deploy is not one the pipeline recorded in deploys.log, or is
#     not the newest recorded one (someone rolled the site back) — the newest
#     line may be a restore record ("<time> <id> restore"), which makes that
#     restored deploy the expected one;
#   - any snippet injection is configured (it adds HTML to every page);
#   - the security-relevant site settings (domains, password/SSL, build and
#     post-processing) differ from the baseline in BASELINE_FILE. The first
#     clean run creates the baseline; after reviewing an intended change,
#     re-baseline with AA_ACCEPT_LIVE_BASELINE=1 docker/aa-run.sh verify-live;
#   - a page did not answer 200, lacks Content-Security-Policy,
#     Strict-Transport-Security or X-Content-Type-Options (or the last is not
#     "nosniff"), or the CSP allows inline/eval scripts (csp_ok=no).
set -u
OUT="${1:-}"; DEPLOYS_LOG="${2:-}"; BASELINE="${3:-}"
if [ -z "$OUT" ] || [ -z "$DEPLOYS_LOG" ] || [ -z "$BASELINE" ] || [ ! -f "$OUT" ]; then
    echo "ALERT check-live: usage: $0 OUTPUT_FILE DEPLOYS_LOG BASELINE_FILE (output file missing?)"
    exit 2
fi
NOSNIFF_SHA=f495210addd4c5882999afa5e924569823b6f504f3c95c760b36a0e1ba9e633e  # sha256 of "nosniff"
HOW="See docs/security/incident-response.md"

alerts=0
alert() { echo "ALERT $*"; alerts=$((alerts + 1)); }
ok() { echo "ok $*"; }

LIVE="$(tr -d '\r' < "$OUT" | grep -E '^LIVE ' || true)"
last() {  # $1 ERE for the whole line (after "LIVE ") → last matching line
    printf '%s\n' "$LIVE" | grep -E "^LIVE $1\$" | tail -1
}
value() { sed -E 's/^[^=]*=//'; }

# 1. Which deploy is live.
live="$(last 'deploy_id=[0-9a-f]{20,40}' | value)"
records="$( { [ -f "$DEPLOYS_LOG" ] && grep -E '^[0-9][0-9TZ:.+-]{9,39} [0-9a-f]{20,40} ([0-9a-f]{64}|restore)$' "$DEPLOYS_LOG"; } || true)"
if [ -z "$live" ]; then
    alert "verify-live could not read the live deploy id. $HOW"
elif ! printf '%s\n' "$records" | awk '{print $2}' | grep -qxF "$live"; then
    alert "Live site runs deploy $live, which the pipeline did not make (it is not one the pipeline recorded in $DEPLOYS_LOG). $HOW"
else
    newest="$(printf '%s\n' "$records" | tail -1)"
    newest_id="$(printf '%s\n' "$newest" | awk '{print $2}')"
    newest_kind="$(printf '%s\n' "$newest" | awk '{print $3}')"
    if [ "$live" = "$newest_id" ]; then
        ok "live site is pipeline deploy $live"
    elif [ "$newest_kind" = "restore" ]; then
        alert "Live site runs deploy $live, but the last pipeline action restored $newest_id — someone changed the live deploy since. $HOW"
    else
        alert "Live site runs deploy $live, older than the newest pipeline deploy $newest_id — the site was rolled back outside the pipeline. $HOW"
    fi
fi

# 2. Snippet injection.
snippets="$(last 'snippets=[0-9]{1,6}' | value)"
if [ -z "$snippets" ]; then
    alert "verify-live did not report Netlify snippet injection (API failure or missing permission)"
elif [ "$snippets" -gt 0 ]; then
    alert "Netlify injects $snippets snippet(s) into every page (Site configuration → Build & deploy → Post processing → Snippet injection); the pipeline never sets any. $HOW"
else
    ok "no snippet injection"
fi

# 3. Site settings against the host-only baseline.
settings="$(last 'settings_hash=[0-9a-f]{64}' | value)"
baseline=""
[ -f "$BASELINE" ] && baseline="$(grep -E '^settings_hash=[0-9a-f]{64}$' "$BASELINE" | tail -1 | value)"
write_baseline() {
    ( umask 077 && printf 'settings_hash=%s\n' "$settings" > "$BASELINE.tmp" && mv -f "$BASELINE.tmp" "$BASELINE" )
}
new_baseline=no
if [ -z "$settings" ]; then
    alert "verify-live did not report the Netlify site settings hash"
elif [ -n "${AA_ACCEPT_LIVE_BASELINE:-}" ]; then
    if write_baseline; then echo "note accepted the current Netlify site settings as the baseline ($BASELINE, settings hash $settings)"
    else alert "could not write the live-site baseline $BASELINE"; fi
elif [ ! -f "$BASELINE" ]; then
    new_baseline=yes
elif [ -z "$baseline" ]; then
    alert "live-site baseline $BASELINE is malformed; review the Netlify site settings, then re-baseline: AA_ACCEPT_LIVE_BASELINE=1 docker/aa-run.sh verify-live"
elif [ "$settings" != "$baseline" ]; then
    alert "Netlify site settings changed (domains, password/SSL, build or post-processing): hash $settings, baseline $baseline. Review them in Netlify; if the change was yours: AA_ACCEPT_LIVE_BASELINE=1 docker/aa-run.sh verify-live. $HOW"
else
    ok "site settings match the baseline"
fi

# 4. Pages and security headers.
for page in home event; do
    status="$(last "page $page status=[0-9]{3}" | value)"
    if [ "$status" != "200" ]; then
        alert "the live $page page answered status ${status:-(no answer)}, expected 200"
        continue
    fi
    for name in content-security-policy strict-transport-security x-content-type-options; do
        h="$(last "header $page $name=[0-9a-f]{64}" | value)"
        if [ -z "$h" ]; then
            alert "the live $page page is missing the $name header"
        elif [ "$name" = "x-content-type-options" ] && [ "$h" != "$NOSNIFF_SHA" ]; then
            alert "the live $page page's x-content-type-options header is not \"nosniff\""
        fi
    done
done
csp_ok="$(last 'csp_ok=(yes|no)' | value)"
if [ "$csp_ok" = "yes" ]; then
    ok "served CSP restricts scripts (no 'unsafe-inline' or 'unsafe-eval' in script-src)"
else
    alert "the live site's Content-Security-Policy does not restrict scripts (csp_ok=${csp_ok:-missing}). $HOW"
fi

if [ "$alerts" -gt 0 ]; then exit 8; fi
if [ "$new_baseline" = "yes" ]; then
    write_baseline
    echo "note created the live-site baseline $BASELINE (settings hash $settings). Review the Netlify site settings now — domains, password, HTTPS, build and post-processing, snippet injection — because later changes are measured against this state"
fi
exit 0
