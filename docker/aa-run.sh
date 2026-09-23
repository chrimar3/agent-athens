#!/bin/bash
# Run one Agent Athens job inside the hardened container (docker/compose.yaml).
# Runs on the Mac (bash 3.2 compatible) — from a terminal or from launchd.
#
#   docker/aa-run.sh image            build/refresh the container image
#   docker/aa-run.sh doctor           first-run checks
#   docker/aa-run.sh freshness        what com.agentathens.freshness ran
#   docker/aa-run.sh JOB [args]       see `docker/aa-run.sh help`
#
# Least privilege per job: each job receives only the tokens it needs from the
# env file (see TOKENS below). The AI enrichment job gets the Claude token
# only — no GitHub or Netlify token, no API-key folder, and the repo's .env is
# masked — so a prompt-injected session has nothing worth stealing.
#
# Exit codes: the job's own exit code; 2 usage; 3 Docker unavailable;
# 4 env file missing, malformed or readable by others. 0 without running when
# the same job is already running (like daily-automated.sh's own lock).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
JOB="${1:-help}"
[ $# -gt 0 ] && shift

fail() { echo "aa-run: $1" >&2; echo "aa-run: next: $2" >&2; exit "${3:-1}"; }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] aa-run: $*"; }

GIT_ID="GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL"
case "$JOB" in
    freshness)  TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes ;;
    daily)      TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes ;;
    enrichment) TOKENS="CLAUDE_CODE_OAUTH_TOKEN"; SECRETS=no; DOTENV=no ;;
    visibility) TOKENS=""; SECRETS=yes; DOTENV=no ;;
    site)       TOKENS=""; SECRETS=no; DOTENV=yes ;;
    test|shell) TOKENS=""; SECRETS=no; DOTENV=no ;;
    doctor)     TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes ;;
    image|help) ;;
    -h|--help) JOB=help ;;
    *) fail "unknown job '$JOB'" "run 'docker/aa-run.sh help' for the list" 2 ;;
esac
if [ "$JOB" = "help" ]; then
    sed -n '/^usage: /,/^EOF$/p' "$HERE/entrypoint.sh" | sed '$d'
    echo "  image           build/refresh the container image (on the Mac)"
    exit 0
fi

# launchd's PATH does not include Docker Desktop's CLI location.
export PATH="/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
command -v docker >/dev/null 2>&1 || fail "docker CLI not found" "install Docker Desktop" 3
docker info >/dev/null 2>&1 || fail "Docker is not running" "open Docker Desktop (enable 'Start when you sign in'), then retry" 3

SECRETS_DIR="${AA_SECRETS_DIR:-$HOME/.config/agentathens}"
ENV_FILE="${AA_ENV_FILE:-$SECRETS_DIR/docker.env}"
export AA_REPO="$REPO"
export AA_BACKUPS_DIR="${AA_BACKUPS_DIR:-$HOME/agent-athens-backups}"
EMPTY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aa-empty.XXXXXX")"
trap 'rmdir "$EMPTY_DIR" 2>/dev/null || true' EXIT
export AA_SECRETS_DIR="$EMPTY_DIR"
COMPOSE=(docker compose -f "$HERE/compose.yaml")

if [ "$JOB" = "image" ]; then
    "${COMPOSE[@]}" build "$@" pipeline
    exit $?
fi

[ -f "$ENV_FILE" ] || fail "env file $ENV_FILE missing" "cp docker/docker.env.example '$ENV_FILE' && chmod 600 '$ENV_FILE', then fill in the tokens" 4
# GNU `stat -f` means "filesystem status", so pick the form by OS.
if [ "$(uname -s)" = "Darwin" ]; then perm="$(stat -f %Lp "$ENV_FILE")"; else perm="$(stat -c %a "$ENV_FILE")"; fi
case "$perm" in
    600|400) ;;
    *) fail "env file $ENV_FILE has mode $perm (holds tokens)" "chmod 600 '$ENV_FILE'" 4 ;;
esac
mkdir -p "$AA_BACKUPS_DIR" "$SECRETS_DIR" "$REPO/logs"
[ "$SECRETS" = "yes" ] && export AA_SECRETS_DIR="$SECRETS_DIR"

docker image inspect agent-athens-pipeline:local >/dev/null 2>&1 \
    || fail "image agent-athens-pipeline:local not built" "run 'docker/aa-run.sh image'" 3

# Hold off idle sleep for the whole run, as daily-automated.sh does with
# caffeinate on the Mac (it cannot inside the container). Enrichment is
# excluded there too.
if [ "$JOB" != "enrichment" ] && [ -z "${AA_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
    export AA_CAFFEINATED=1
    exec caffeinate -i "$0" "$JOB" "$@"
fi

# Pass through only this job's tokens. The file is parsed, never sourced.
ENV_FLAGS=()
lineno=0
while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    case "$line" in ''|'#'*) continue ;; esac
    if ! printf '%s' "$line" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*='; then
        fail "$ENV_FILE line $lineno is not KEY=value" "fix that line (no 'export', no spaces around '=')" 4
    fi
    key="${line%%=*}"
    case " $TOKENS " in
        *" $key "*) export "$key=${line#*=}"; ENV_FLAGS+=(-e "$key") ;;
    esac
done < "$ENV_FILE"

EXTRA=()
# Mask the repo's .env for jobs that must not see email or API credentials.
if [ "$DOTENV" = "no" ] && [ -f "$REPO/.env" ]; then
    EXTRA+=(-v /dev/null:/workspace/.env:ro)
fi

NAME="agent-athens-$JOB"
if [ -n "$(docker ps -q --filter "name=^/${NAME}\$")" ]; then
    log "$JOB is already running in container $NAME — skipping."
    exit 0
fi
docker rm -f "$NAME" >/dev/null 2>&1 || true  # leftover from a killed run

# Stale locks. A killed container leaves its lock file behind, naming a PID
# from the container's own PID namespace. The next container reuses low PIDs,
# so daily-automated.sh can find "itself" alive under that PID and skip every
# run from then on. No container of this job is running (checked above), so
# the lock is stale unless a pipeline still runs directly on the Mac.
host_owner() {  # $1 lock file → 0 if its PID is a live host pipeline process
    local pid
    pid="$(cat "$1" 2>/dev/null || true)"
    [ -n "$pid" ] || return 1
    ps -p "$pid" -o command= 2>/dev/null | grep -qE 'daily-automated|auto-enrich'
}
clear_lock() {  # $1 path
    local path="$1" pidfile="$1"
    [ -e "$path" ] || return 0
    [ -d "$path" ] && pidfile="$path/pid"
    if host_owner "$pidfile"; then
        log "$(basename "$path") is held by a pipeline running directly on the Mac — skipping $JOB."
        exit 0
    fi
    log "Removing stale $(basename "$path") left by an earlier container run."
    rm -rf "$path"
}
case "$JOB" in
    freshness) clear_lock "$REPO/.pipeline-freshness.lock" ;;
    daily) clear_lock "$REPO/.pipeline-full.lock" ;;
    enrichment)
        clear_lock "$REPO/.pipeline-enrichment.lock"
        [ -z "$(docker ps -q --filter 'name=^/agent-athens-daily$')" ] && clear_lock "$REPO/.auto-enrich.lock.d"
        ;;
esac

TTY_FLAG=()
[ -t 0 ] && [ -t 1 ] || TTY_FLAG=(-T)
log "starting $JOB in container $NAME (tokens: ${TOKENS:-none})"
set +e
"${COMPOSE[@]}" run --rm ${TTY_FLAG[@]+"${TTY_FLAG[@]}"} ${ENV_FLAGS[@]+"${ENV_FLAGS[@]}"} \
    ${EXTRA[@]+"${EXTRA[@]}"} --name "$NAME" pipeline "$JOB" "$@"
rc=$?
set -e
log "$JOB finished with exit code $rc"
exit "$rc"
