#!/bin/bash
#
# live-site-check.sh — body of the scheduled `live-site-check` workflow
# (security loop round 8).
#
# The pipeline's own checks run on the owner's Mac; this one runs off the
# machine, on GitHub's runners, so a compromised or broken Mac cannot vouch
# for itself. It GETs the live homepage and one event page (the first <loc> of
# the live sitemap-events.xml, accepted only when it is an https URL on the
# same origin) and fails unless each page answers:
#   - status 200, with no redirect followed (--max-redirs 0: a redirect to
#     another host would otherwise be judged instead of the site);
#   - an enforced Content-Security-Policy (not Report-Only) that restricts
#     scripts (script-src, or default-src where a policy has no script-src),
#     and no script source in any enforced policy that is 'unsafe-inline',
#     'unsafe-eval', a whole scheme (https:, http:, data:, blob:, *), or the
#     whole googletagmanager.com host — only exact paths such as
#     https://www.googletagmanager.com/gtag/js (a host source would run any
#     container on that host);
#   - Strict-Transport-Security with max-age >= 15552000 (180 days);
#   - X-Content-Type-Options: nosniff.
# A failure exits 1, which fails the workflow, and GitHub emails the owner.
# It needs no token and writes nothing (it cannot open an issue by design).
#
# Every value quoted from a response has non-printable characters replaced
# and is cut short, so a hostile response cannot inject log commands.
#
# Env: SITE (default https://agentathens.com; must be https://<host>),
# CURL_BIN (default curl; the test seam), CURL_MAX_TIME (default 30 s).
# Tested by tests/security/live-site-check.test.ts with a stub curl.
set -u

SITE="${SITE:-https://agentathens.com}"
CURL="${CURL_BIN:-curl}"
MAX_TIME="${CURL_MAX_TIME:-30}"
MIN_HSTS=15552000

refuse() {
  echo "live-site-check: FAILED — $1" >&2
  exit 1
}

[[ "$SITE" =~ ^https://[a-z0-9.-]+$ ]] || refuse "SITE must be https://<host> with no path (got a malformed value)"
[[ "$MAX_TIME" =~ ^[0-9]{1,3}$ ]] || refuse "CURL_MAX_TIME must be a whole number of seconds"
WORK="$(mktemp -d)" || refuse "could not create a temp dir"
trap 'rm -rf "$WORK"' EXIT

clean() { printf '%s' "$1" | LC_ALL=C tr -c '[:print:]' '?' | cut -c1-"${2:-200}"; }

# fetch <url> <name>: headers to $WORK/<name>.h, body to $WORK/<name>.b,
# prints the HTTP status. https only, no redirects, bounded time and size.
fetch() {
  "$CURL" -sS --proto '=https' --proto-redir '=https' --max-redirs 0 \
    --connect-timeout 10 --max-time "$MAX_TIME" --max-filesize 20000000 \
    -A 'agent-athens-live-site-check' \
    -D "$WORK/$2.h" -o "$WORK/$2.b" -w '%{http_code}' --url "$1" 2>"$WORK/$2.err"
}

# All values of header <name> (case-insensitive), one per line, CR removed.
header_values() {
  tr -d '\r' < "$1" | awk -v n="$2" '
    { i = index($0, ":"); if (i == 0) next
      k = tolower(substr($0, 1, i - 1)); if (k != n) next
      v = substr($0, i + 1); sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v); print v }'
}

problems=()

# check_page <label> <name>: judge the headers fetched into $WORK/<name>.h
check_page() {
  local label="$1" h="$WORK/$2.h" csp policies restricted=0 hsts age xcto
  csp="$(header_values "$h" content-security-policy)"
  if [ -z "$csp" ]; then
    problems+=("$label: no enforced Content-Security-Policy header")
  else
    # Several headers, or one header with comma-separated policies: each is a policy.
    policies="$(printf '%s\n' "$csp" | tr ',' '\n')"
    while IFS= read -r policy; do
      [ -n "$policy" ] || continue
      local d name value script_dirs="" has_script_src=0 default_src=""
      while IFS= read -r d; do
        d="$(printf '%s' "$d" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
        [ -n "$d" ] || continue
        name="$(printf '%s' "${d%%[[:space:]]*}" | tr '[:upper:]' '[:lower:]')"
        value=""
        [[ "$d" == *[[:space:]]* ]] && value="${d#*[[:space:]]}"
        case "$name" in
          script-src) has_script_src=1; script_dirs+="$value"$'\n' ;;
          script-src-elem|script-src-attr) script_dirs+="$value"$'\n' ;;
          default-src) default_src="$value" ;;
        esac
      done < <(printf '%s\n' "$policy" | tr ';' '\n')
      if [ "$has_script_src" = 0 ] && [ -n "$default_src" ]; then
        script_dirs+="$default_src"$'\n'
        has_script_src=1
      fi
      [ "$has_script_src" = 1 ] && restricted=1
      local tok low
      set -f # a '*' source must stay a word, never a glob
      for tok in $script_dirs; do
        low="$(printf '%s' "$tok" | tr '[:upper:]' '[:lower:]')"
        case "$low" in
          "'unsafe-inline'"|"'unsafe-eval'"|"'unsafe-hashes'")
            problems+=("$label: script source $(clean "$tok" 60) is allowed") ;;
          '*'|'https:'|'http:'|'data:'|'blob:')
            problems+=("$label: script source $(clean "$tok" 60) allows a whole scheme") ;;
        esac
        if [[ "$low" =~ ^(https?://)?([a-z0-9*.-]+\.)?googletagmanager\.com(:[0-9]+)?/?$ ]]; then
          problems+=("$label: script source $(clean "$tok" 80) allows the whole googletagmanager.com host (name exact paths such as https://www.googletagmanager.com/gtag/js)")
        fi
      done
      set +f
    done <<< "$policies"
    [ "$restricted" = 1 ] || problems+=("$label: no enforced policy restricts scripts (no script-src or default-src)")
  fi

  hsts="$(header_values "$h" strict-transport-security | head -1)"
  if [ -z "$hsts" ]; then
    problems+=("$label: no Strict-Transport-Security header")
  else
    age="$(printf '%s' "$hsts" | tr '[:upper:]' '[:lower:]' | sed -n 's/.*max-age="\{0,1\}\([0-9]\{1,12\}\)"\{0,1\}.*/\1/p')"
    if [ -z "$age" ] || [ "$age" -lt "$MIN_HSTS" ]; then
      problems+=("$label: Strict-Transport-Security max-age is ${age:-missing}, below $MIN_HSTS ($(clean "$hsts" 80))")
    fi
  fi

  xcto="$(header_values "$h" x-content-type-options | head -1 | tr '[:upper:]' '[:lower:]')"
  [ "$xcto" = "nosniff" ] || problems+=("$label: X-Content-Type-Options is not nosniff ($(clean "${xcto:-missing}" 40))")
}

# fetch_page <label> <url> <name>: fetch and require status 200.
fetch_page() {
  local status rc=0
  status="$(fetch "$2" "$3")" || rc=$?
  if [ "$rc" -ne 0 ]; then
    problems+=("$1: request failed (curl exit $rc: $(clean "$(head -1 "$WORK/$3.err" 2>/dev/null)" 160))")
    return 1
  fi
  if [ "$status" != "200" ]; then
    problems+=("$1: HTTP status $(clean "$status" 5), expected 200 (redirects are not followed)")
    return 1
  fi
  return 0
}

fetch_page "homepage $SITE/" "$SITE/" home && check_page "homepage $SITE/" home

EVENT_URL=""
if fetch_page "sitemap $SITE/sitemap-events.xml" "$SITE/sitemap-events.xml" sitemap; then
  loc="$(tr -d '\r\n' < "$WORK/sitemap.b" | grep -o '<loc>[^<]*</loc>' | head -1 | sed 's#^<loc>##; s#</loc>$##' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  if [ -z "$loc" ]; then
    problems+=("sitemap $SITE/sitemap-events.xml: no <loc> entry")
  elif [[ "$loc" =~ ^https://[a-z0-9.-]+(/[A-Za-z0-9._~%/-]*)?$ ]] && [ "${loc#"$SITE"/}" != "$loc" ]; then
    EVENT_URL="$loc"
  else
    problems+=("sitemap $SITE/sitemap-events.xml: the first <loc> is not an https URL on $SITE ($(clean "$loc" 120)); not fetched")
  fi
fi
if [ -n "$EVENT_URL" ]; then
  fetch_page "event page $EVENT_URL" "$EVENT_URL" event && check_page "event page $EVENT_URL" event
fi

if [ ${#problems[@]} -gt 0 ]; then
  printf 'live-site-check: FAILED — %s\n' "${problems[@]}" >&2
  echo "live-site-check: Next: check what is live (Netlify → Deploys) and the headers the build ships (dist/_headers, netlify.toml); if the site was not deployed by the pipeline, follow docs/security/incident-response.md" >&2
  exit 1
fi
echo "live-site-check: PASS — $SITE/ and $EVENT_URL answer 200 with a script-restricting CSP (no unsafe-inline/unsafe-eval, no host-wide googletagmanager.com), HSTS max-age >= $MIN_HSTS and nosniff"
exit 0
