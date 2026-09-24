#!/bin/bash
# Mac-side part of `docker/aa-run.sh doctor` (bash 3.2): checks that need the
# host's own view — the env file and the environment the scheduled runs
# inherit — before the in-container docker/doctor.sh runs. Same output format
# as doctor.sh; exits 1 if a check failed. Never prints a token value.
#
#   docker/doctor-checks.sh ENV_FILE [REPO]
set -u
ENV_FILE="${1:-}"
REPO="${2:-}"
[ -n "$ENV_FILE" ] || { echo "usage: $0 ENV_FILE [REPO]" >&2; exit 2; }

fails=0
ok()   { printf 'ok    %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n      → %s\n' "$1" "$2"; fails=$((fails + 1)); }
warn() { printf 'warn  %s\n      → %s\n' "$1" "$2"; }

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

# Off-machine backups: without AA_OFFSITE_CMD every backup lives on this Mac.
if [ -n "${AA_OFFSITE_CMD:-}" ]; then
    ok "AA_OFFSITE_CMD set (backups are also copied off this Mac)"
else
    warn "AA_OFFSITE_CMD not set — database backups exist only on this Mac" \
         "set it to a script that copies a file to storage this Mac can write but not delete, then re-run docker/install-launchd.sh --apply so scheduled runs inherit it"
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

if [ "$fails" -gt 0 ]; then echo "doctor (Mac): $fails check(s) failed"; exit 1; fi
exit 0
