#!/bin/bash
# Mac-side part of `docker/aa-run.sh doctor` (bash 3.2): checks that need the
# host's own view — the env file and the environment the scheduled runs
# inherit — before the in-container docker/doctor.sh runs. Same output format
# as doctor.sh; exits 1 if a check failed. Never prints a token value.
#
#   docker/doctor-checks.sh ENV_FILE [REPO]
#   docker/doctor-checks.sh --cli-logins    only the Mac CLI-login advice (always exit 0)
set -u

fails=0
ok()   { printf 'ok    %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n      → %s\n' "$1" "$2"; fails=$((fails + 1)); }
warn() { printf 'warn  %s\n      → %s\n' "$1" "$2"; }

# The Mac's own Netlify and GitHub CLI logins. The container runs publish with
# the scoped, expiring tokens in docker.env; a CLI login left on the Mac is a
# full-account credential (Netlify: every site and its settings; gh: every
# repository the account can reach) that any process running as you — a
# package install script, an agent session, a Mac-side job — can read and
# use. A warning, not a failure: logging out is the owner's step. Presence
# only: no token, and nothing gh prints, is ever shown.
netlify_login_files() {  # config.json files holding a non-empty "token" value
    local f
    for f in "$HOME/Library/Preferences/netlify/config.json" "${XDG_CONFIG_HOME:-$HOME/.config}/netlify/config.json"; do
        [ -f "$f" ] || continue
        grep -Eq '"token"[[:space:]]*:[[:space:]]*"[^"[:space:]]' "$f" 2>/dev/null && printf '%s\n' "$f"
    done | LC_ALL=C sort -u
}
gh_logged_in() {  # 0 logged in, 1 not (or no gh), 2 no answer in time
    local limit="${AA_GH_TIMEOUT_SEC:-10}" pid n=0 rc=0
    case "$limit" in ''|*[!0-9]*) limit=10 ;; esac
    command -v gh >/dev/null 2>&1 || return 1
    # A stored login only: tokens in this shell's environment do not count.
    # No GNU timeout on macOS: poll, and stop gh once the limit passes.
    env -u GH_TOKEN -u GITHUB_TOKEN -u GH_ENTERPRISE_TOKEN -u GITHUB_ENTERPRISE_TOKEN \
        GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1 gh auth status </dev/null >/dev/null 2>&1 &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
        if [ "$n" -ge "$limit" ]; then
            kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
            return 2
        fi
        sleep 1; n=$((n + 1))
    done
    wait "$pid" || rc=$?
    [ "$rc" -eq 0 ] && return 0
    return 1
}
cli_login_checks() {
    local files rc=0
    files="$(netlify_login_files)"
    if [ -n "$files" ]; then
        warn "this Mac is still logged in to the Netlify CLI ($(printf '%s' "$files" | tr '\n' ' ' | sed 's/ $//'))" \
             "run 'netlify logout' — publishing runs in the container with the scoped token in docker.env; a Mac login is a full-account token any process you run can use (docker/README.md, setup step 6)"
    else
        ok "no Netlify CLI login on this Mac"
    fi
    gh_logged_in || rc=$?
    case "$rc" in
        0) warn "this Mac is still logged in to the GitHub CLI (gh auth status succeeds)" \
                "run 'gh auth logout --hostname github.com' (once per account 'gh auth status' lists) — the container pushes with the fine-grained token in docker.env; a Mac login reaches every repository the account can (docker/README.md, setup step 6)" ;;
        2) warn "could not tell whether the GitHub CLI is logged in ('gh auth status' did not answer within ${AA_GH_TIMEOUT_SEC:-10}s)" \
                "run 'gh auth status' yourself; if it shows a login, run 'gh auth logout --hostname github.com'" ;;
        *) ok "no GitHub CLI login on this Mac" ;;
    esac
}

if [ "${1:-}" = "--cli-logins" ]; then
    cli_login_checks
    exit 0
fi

ENV_FILE="${1:-}"
REPO="${2:-}"
[ -n "$ENV_FILE" ] || { echo "usage: $0 ENV_FILE [REPO] | --cli-logins" >&2; exit 2; }

# GH_TOKEN must be a fine-grained token (github_pat_…), which can be limited
# to this one repository; a classic token (ghp_…) reaches every repo the
# account can. The env file is parsed as aa-run.sh parses it (the last
# GH_TOKEN= line wins), never sourced; only the prefix is looked at.
token_kind=missing
if [ -f "$ENV_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            GH_TOKEN=github_pat_?*) token_kind=fine-grained ;;
            GH_TOKEN=) token_kind=missing ;;
            GH_TOKEN=*) token_kind=other ;;
        esac
    done < "$ENV_FILE"
fi
case "$token_kind" in
    fine-grained) ok "GH_TOKEN is a fine-grained token (github_pat_ prefix)" ;;
    missing) bad "GH_TOKEN not set in $ENV_FILE" "add a fine-grained token limited to chrimar3/agent-athens (docs/security/credentials.md)" ;;
    *) bad "GH_TOKEN is not a fine-grained token (it does not start with github_pat_)" \
           "replace it with a fine-grained token limited to chrimar3/agent-athens: Contents read/write, Issues read/write, Metadata read, 90-day expiry" ;;
esac

# Off-machine backups: without AA_OFFSITE_CMD every backup lives on this Mac
# (one disk failure, theft or ransomware away from losing them all). A
# failure unless the owner opted out explicitly with AA_OFFSITE_OPTOUT=1.
if [ -n "${AA_OFFSITE_CMD:-}" ]; then
    ok "AA_OFFSITE_CMD set (backups are also copied off this Mac)"
elif [ "${AA_OFFSITE_OPTOUT:-}" = "1" ]; then
    warn "AA_OFFSITE_CMD not set — database backups exist only on this Mac (AA_OFFSITE_OPTOUT=1: accepted by you)" \
         "set AA_OFFSITE_CMD to a script that copies a file to storage this Mac can write but not delete, then re-run docker/install-launchd.sh --apply"
else
    bad "AA_OFFSITE_CMD not set — database backups exist only on this Mac" \
        "set it to a script that copies a file to storage this Mac can write but not delete, then re-run docker/install-launchd.sh --apply so scheduled runs inherit it (or set AA_OFFSITE_OPTOUT=1 to accept on-Mac-only backups)"
fi

# Secrets in the repo's .env files. Only runs that fetch mail still see .env
# (read-only), but it sits inside the folder every run's code and data come
# from; docker.env (never mounted) is the place for them. Key names only.
if [ -n "$REPO" ]; then
    found=""
    for f in "$REPO"/.env "$REPO"/.env.*; do
        [ -f "$f" ] || continue
        case "$(basename "$f")" in .env.example) continue ;; esac
        keys="$(sed -n 's/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)=[[:space:]]*[^[:space:]#].*/\2/p' "$f" \
            | grep -iE 'PASS|SECRET|TOKEN|KEY|CREDENTIAL|PRIVATE|AUTH' | sort -u | tr '\n' ' ')"
        [ -n "$keys" ] && found="$found $(basename "$f"): ${keys% }"
    done
    if [ -n "$found" ]; then
        warn "the repo's .env still holds secret-looking keys —$found" \
             "move EMAIL_USER, EMAIL_PASSWORD, IMAP_HOST and IMAP_PORT into $ENV_FILE (the ingest run gets them from there), check with one 'docker/aa-run.sh freshness' that email still arrives, then delete them from the repo .env; for any other key, see docker/README.md whether a run still reads it"
    else
        ok "no secret-looking keys in the repo's .env files"
    fi
fi

cli_login_checks

if [ "$fails" -gt 0 ]; then echo "doctor (Mac): $fails check(s) failed"; exit 1; fi
exit 0
