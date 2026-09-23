#!/bin/bash
# Run one Agent Athens job inside the hardened container (docker/compose.yaml).
# Runs on the Mac (bash 3.2 compatible) — from a terminal or from launchd.
#
#   docker/aa-run.sh image            build/refresh the container image
#   docker/aa-run.sh doctor           first-run checks
#   docker/aa-run.sh freshness        scrape + build (no publishing tokens), then publish
#   docker/aa-run.sh JOB [args]       see `docker/aa-run.sh help`
#
# Least privilege per run:
#   - each run receives only the tokens it needs (TOKENS below); the token file
#     lives in ~/.config/agentathens-docker/, a folder no container ever mounts;
#   - code paths are mounted read-only (CODE_PATHS), .git/config and .git/hooks
#     always read-only, and all of .git read-only for runs that never commit;
#   - freshness runs in two containers: scrape/build with no GitHub or Netlify
#     token, then — only if the host integrity check passes — a publish run
#     that holds those tokens but never loads a web page;
#   - backups are copied on the Mac (plain file copy, nothing parsed) into
#     ~/agent-athens-backups, which no container mounts.
# docker/integrity-check.sh runs around every container run.
#
# Exit codes: the job's own exit code; 2 usage; 3 Docker unavailable;
# 4 env file problem; 5 paused by a quarantine; 6 integrity check failed.
# 0 without running when the same job is already running.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
JOB="${1:-help}"
[ $# -gt 0 ] && shift

fail() { echo "aa-run: $1" >&2; echo "aa-run: next: $2" >&2; exit "${3:-1}"; }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] aa-run: $*"; }

GIT_ID="GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL"
# Paths no container may write. Mounted read-only over the repo mount.
CODE_PATHS="scripts src config tests static netlify docker .claude .github exemplars
package.json bun.lock bunfig.toml tsconfig.json netlify.toml CLAUDE.md SECURITY.md .gitignore .gitattributes"

# Per run: TOKENS, SECRETS (mount ~/.config/agentathens read-only), DOTENV
# (repo .env visible), GITRW (may commit).
job_policy() {
    case "$1" in
        scrape)     TOKENS="$GIT_ID"; SECRETS=yes; DOTENV=yes; GITRW=yes ;;
        publish)    TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN $GIT_ID"; SECRETS=no; DOTENV=no; GITRW=yes ;;
        legacy)     TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes; GITRW=yes ;;
        daily)      TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes; GITRW=yes ;;
        enrichment) TOKENS="CLAUDE_CODE_OAUTH_TOKEN"; SECRETS=no; DOTENV=no; GITRW=no ;;
        visibility) TOKENS=""; SECRETS=yes; DOTENV=no; GITRW=no ;;
        site)       TOKENS=""; SECRETS=no; DOTENV=yes; GITRW=no ;;
        test|shell) TOKENS=""; SECRETS=no; DOTENV=no; GITRW=no ;;
        doctor)     TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes; GITRW=no ;;
        *) return 1 ;;
    esac
}

case "$JOB" in
    freshness|publish|enrichment|daily|visibility|site|test|shell|doctor|image|help) ;;
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

STATE_DIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}"
SECRETS_DIR="${AA_SECRETS_DIR:-$HOME/.config/agentathens}"
BACKUPS_DIR="${AA_BACKUPS_DIR:-$HOME/agent-athens-backups}"
ENV_FILE="${AA_ENV_FILE:-$STATE_DIR/docker.env}"
export AA_STATE_DIR="$STATE_DIR" AA_REPO="$REPO"
COMPOSE=(docker compose -f "$HERE/compose.yaml")
EMPTY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aa-empty.XXXXXX")"
trap 'rmdir "$EMPTY_DIR" 2>/dev/null || true' EXIT
export AA_SECRETS_DIR="$EMPTY_DIR"

if [ "$JOB" = "image" ]; then
    "${COMPOSE[@]}" build "$@" pipeline
    exit $?
fi

if [ -f "$STATE_DIR/QUARANTINE" ]; then
    cat "$STATE_DIR/QUARANTINE" >&2
    fail "jobs are paused by a quarantine" "review the evidence, see docs/security/incident-response.md, then delete $STATE_DIR/QUARANTINE" 5
fi

inside() { case "$1/" in "$2"/*) return 0 ;; esac; return 1; }  # $1 path inside dir $2
[ -f "$ENV_FILE" ] || fail "env file $ENV_FILE missing" "mkdir -p '$STATE_DIR' && cp docker/docker.env.example '$ENV_FILE' && chmod 600 '$ENV_FILE', then fill in the tokens" 4
if inside "$ENV_FILE" "$REPO" || inside "$ENV_FILE" "$SECRETS_DIR" || inside "$ENV_FILE" "$BACKUPS_DIR"; then
    fail "env file $ENV_FILE is inside a folder a container can mount" "move it to $STATE_DIR/docker.env" 4
fi
# GNU `stat -f` means "filesystem status", so pick the form by OS.
if [ "$(uname -s)" = "Darwin" ]; then perm="$(stat -f %Lp "$ENV_FILE")"; else perm="$(stat -c %a "$ENV_FILE")"; fi
case "$perm" in
    600|400) ;;
    *) fail "env file $ENV_FILE has mode $perm (holds tokens)" "chmod 600 '$ENV_FILE'" 4 ;;
esac
[ -d "$REPO/.git" ] || fail "$REPO/.git is not a directory (git worktree?)" "run the pipeline from the main clone" 2
mkdir -p "$BACKUPS_DIR" "$SECRETS_DIR" "$STATE_DIR" "$REPO/logs"
chmod 700 "$STATE_DIR"

docker image inspect agent-athens-pipeline:local >/dev/null 2>&1 \
    || fail "image agent-athens-pipeline:local not built" "run 'docker/aa-run.sh image'" 3
created="$(docker image inspect -f '{{.Created}}' agent-athens-pipeline:local | cut -c1-10)"
if [ "$(uname -s)" = "Darwin" ]; then age_days=$(( ($(date +%s) - $(date -j -f %Y-%m-%d "$created" +%s)) / 86400 ))
else age_days=$(( ($(date +%s) - $(date -d "$created" +%s)) / 86400 )); fi
[ "$age_days" -le 30 ] || log "WARNING: image is $age_days days old — Chromium and system packages miss security fixes; run 'docker/aa-run.sh image --pull'"

# Hold off idle sleep for the whole run, as daily-automated.sh does with
# caffeinate on the Mac (it cannot inside the container). Enrichment is
# excluded there too.
if [ "$JOB" != "enrichment" ] && [ -z "${AA_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
    export AA_CAFFEINATED=1
    exec caffeinate -i "$0" "$JOB" "$@"
fi

NAME="agent-athens-$JOB"
if [ -n "$(docker ps -q --filter "name=^/${NAME}(-publish)?\$")" ]; then
    log "$JOB is already running in container $NAME — skipping."
    exit 0
fi

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

# Plain byte copy of the database before any run that writes it. Nothing on
# the Mac parses the file; restores go through docs/security/incident-response.md.
backup_db() {
    local db="$REPO/data/events.db" stamp
    [ -f "$db" ] || { log "no data/events.db to back up"; return 0; }
    stamp="$(date +%Y-%m-%d-%H%M)"
    for suffix in "" -wal -shm; do
        [ -f "$db$suffix" ] && cp -p "$db$suffix" "$BACKUPS_DIR/events-$stamp.db$suffix"
    done
    gzip -f "$BACKUPS_DIR/events-$stamp.db"*
    # Keep the newest 60 backup sets.
    ls -1t "$BACKUPS_DIR"/events-*.db.gz 2>/dev/null | tail -n +61 | while read -r old; do
        rm -f "$old" "${old%.db.gz}.db-wal.gz" "${old%.db.gz}.db-shm.gz"
    done
    log "backed up data/events.db to $BACKUPS_DIR/events-$stamp.db.gz"
}

# Run one container under a policy. $1 policy, $2 container name, rest: entrypoint args.
run_container() {
    local policy="$1" name="$2"; shift 2
    job_policy "$policy" || fail "internal: no policy '$policy'" "report this" 2
    export AA_SECRETS_DIR="$EMPTY_DIR"
    [ "$SECRETS" = "yes" ] && export AA_SECRETS_DIR="$SECRETS_DIR"

    # Only this run's tokens. The env file is parsed, never sourced.
    local env_flags=() line key lineno=0
    while IFS= read -r line || [ -n "$line" ]; do
        lineno=$((lineno + 1))
        case "$line" in ''|'#'*) continue ;; esac
        printf '%s' "$line" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*=' \
            || fail "$ENV_FILE line $lineno is not KEY=value" "fix that line (no 'export', no spaces around '=')" 4
        key="${line%%=*}"
        case " $TOKENS " in *" $key "*) export "$key=${line#*=}"; env_flags+=(-e "$key") ;; esac
    done < "$ENV_FILE"
    [ -n "${AA_DEFER_PUBLISH:-}" ] && env_flags+=(-e AA_DEFER_PUBLISH)

    local mounts=() p f
    for p in $CODE_PATHS; do
        [ -e "$REPO/$p" ] && mounts+=(-v "$REPO/$p:/workspace/$p:ro")
    done
    if [ "$GITRW" = "yes" ]; then
        mounts+=(-v "$REPO/.git/config:/workspace/.git/config:ro" -v "$REPO/.git/hooks:/workspace/.git/hooks:ro")
    else
        mounts+=(-v "$REPO/.git:/workspace/.git:ro")
    fi
    if [ "$DOTENV" = "no" ]; then
        for f in "$REPO"/.env*; do
            [ -f "$f" ] && [ "$(basename "$f")" != ".env.example" ] && mounts+=(-v "/dev/null:/workspace/$(basename "$f"):ro")
        done
    fi

    local tty=()
    [ -t 0 ] && [ -t 1 ] || tty=(-T)
    docker rm -f "$name" >/dev/null 2>&1 || true   # leftover from a killed run
    local state="$STATE_DIR/state/$name.pre" rc
    bash "$HERE/integrity-check.sh" snapshot "$state" || fail "integrity snapshot failed" "see the message above" 6
    log "starting $name (tokens: ${TOKENS:-none})"
    set +e
    "${COMPOSE[@]}" run --rm ${tty[@]+"${tty[@]}"} ${env_flags[@]+"${env_flags[@]}"} \
        ${mounts[@]+"${mounts[@]}"} --name "$name" pipeline "$@"
    rc=$?
    set -e
    log "$name finished with exit code $rc"
    bash "$HERE/integrity-check.sh" verify "$state" "$name" || exit 6
    return "$rc"
}

case "$JOB" in
    freshness)
        clear_lock "$REPO/.pipeline-freshness.lock"
        backup_db
        if grep -q 'AA_DEFER_PUBLISH' "$REPO/scripts/daily-automated.sh"; then
            rm -f "$REPO/.pipeline-publish-ready"
            export AA_DEFER_PUBLISH=1
            rc=0; run_container scrape "$NAME" freshness "$@" || rc=$?
            unset AA_DEFER_PUBLISH
            [ "$rc" -eq 0 ] || exit "$rc"
            if [ -f "$REPO/.pipeline-publish-ready" ]; then
                clear_lock "$REPO/.pipeline-publish.lock"
                run_container publish "$NAME-publish" publish
            else
                log "nothing to publish (no .pipeline-publish-ready marker)"
            fi
        else
            # Pipeline without deferred publishing: one run holding all tokens.
            run_container legacy "$NAME" freshness "$@"
        fi
        ;;
    publish)
        clear_lock "$REPO/.pipeline-publish.lock"
        run_container publish "$NAME" publish "$@"
        ;;
    daily)
        clear_lock "$REPO/.pipeline-full.lock"
        backup_db
        run_container daily "$NAME" daily "$@"
        ;;
    enrichment)
        clear_lock "$REPO/.pipeline-enrichment.lock"
        [ -z "$(docker ps -q --filter 'name=^/agent-athens-daily$')" ] && clear_lock "$REPO/.auto-enrich.lock.d"
        backup_db
        run_container enrichment "$NAME" enrichment "$@"
        ;;
    *)
        run_container "$JOB" "$NAME" "$JOB" "$@"
        ;;
esac
