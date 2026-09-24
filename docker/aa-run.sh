#!/bin/bash
# Run one Agent Athens job inside the hardened container (docker/compose.yaml).
# Runs on the Mac (bash 3.2 compatible) — from a terminal or from launchd.
#
#   docker/aa-run.sh image            build/refresh the container image
#   docker/aa-run.sh doctor           first-run checks
#   docker/aa-run.sh freshness        ingest, scrape, build (no publishing tokens), then publish
#   docker/aa-run.sh JOB [args]       see `docker/aa-run.sh help`
#
# Least privilege per run:
#   - each run receives only the tokens it needs (TOKENS below); the token file
#     lives in ~/.config/agentathens-docker/, a folder no container ever mounts;
#   - every top-level repo entry except the data folders (RW_TOP) is mounted
#     read-only — code, docs, specs, config, .netlify, .env — plus .git/config
#     and .git/hooks always, and all of .git for runs that never commit;
#   - freshness runs in separate containers: email ingest, a scrape run that
#     cannot write dist/ or .git, a build run with no network and no token,
#     then — only if the host integrity check passes — a publish run that
#     holds the publishing tokens but never loads a web page and cannot write
#     dist/; the Mac records a deploy only if the publish run's dist hash is
#     the one the build run reported;
#   - every container run has a wall-clock limit (docker kill when it fires);
#   - backups are copied on the Mac (plain file copy, nothing parsed) into
#     ~/agent-athens-backups, which no container mounts.
# docker/integrity-check.sh runs around every container run.
#
# Exit codes: the job's own exit code; 2 usage; 3 Docker unavailable;
# 4 env file or secrets folder problem; 5 paused by a quarantine; 6 integrity
# check failed; 7 image too old; 8 live site not deployed by the pipeline;
# 10 build/publish dist hash missing or mismatched (deploy not recorded);
# 124 a run hit its time limit.
# 0 without running when the same job is already running.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
JOB="${1:-help}"
[ $# -gt 0 ] && shift

fail() {
    echo "aa-run: $1" >&2; echo "aa-run: next: $2" >&2
    # Scheduled (non-interactive) runs have nobody watching the terminal.
    if [ ! -t 1 ] && [ -f "$HERE/integrity-check.sh" ]; then
        bash "$HERE/integrity-check.sh" notify "Job ${JOB:-?} did not run: $1" >/dev/null 2>&1 || true
    fi
    exit "${3:-1}"
}
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] aa-run: $*"; }

GIT_ID="GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL"
# Top-level repo entries a run may write. Every other entry is mounted
# read-only over the repo mount, so no run can change what the Mac or an agent
# session later executes or reads as instructions. Root-level runtime files
# (locks, the publish marker) stay writable through the repo root, and
# integrity-check.sh flags any other new root entry.
RW_TOP="data dist logs node_modules temp tmp temp-descriptions temp-briefs temp-research"

# Per run: TOKENS, SECRETS (yes = mount ~/.config/agentathens read-only;
# gsc = only the Search Console key file; no = an empty folder), DOTENV (repo
# .env visible), GITRW (may commit), DIST (ro = dist/ mounted read-only),
# NET (no = the offline compose service), LIMIT (wall-clock minutes;
# AA_JOB_TIMEOUT_MIN overrides every run's limit).
#   scrape       sealed-build pipeline: data phases only, never commits or builds
#   scrape-build older pipeline: scrape + build + commit in one run
#   build        builds dist/ and commits artifacts to pipeline-data, offline
job_policy() {
    DIST=rw; NET=yes
    case "$1" in
        scrape)     TOKENS=""; SECRETS=no; DOTENV=${SCRAPE_DOTENV:-no}; GITRW=no; DIST=ro; LIMIT=180 ;;
        scrape-build) TOKENS="$GIT_ID"; SECRETS=no; DOTENV=${SCRAPE_DOTENV:-no}; GITRW=yes; LIMIT=180 ;;
        build)      TOKENS="$GIT_ID"; SECRETS=no; DOTENV=no; GITRW=yes; NET=no; LIMIT=45 ;;
        ingest)     TOKENS=""; SECRETS=no; DOTENV=yes; GITRW=no; LIMIT=30 ;;
        restore)    TOKENS="NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID"; SECRETS=no; DOTENV=no; GITRW=no; LIMIT=10 ;;
        publish)    TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID $GIT_ID"; SECRETS=gsc; DOTENV=no; GITRW=yes; DIST=ro; LIMIT=30 ;;
        verify-live) TOKENS="NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID"; SECRETS=no; DOTENV=no; GITRW=no; LIMIT=10 ;;
        legacy)     TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes; GITRW=yes; LIMIT=180 ;;
        daily)      TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes; GITRW=yes; LIMIT=360 ;;
        enrichment) TOKENS="CLAUDE_CODE_OAUTH_TOKEN"; SECRETS=no; DOTENV=no; GITRW=no; LIMIT=90 ;;
        visibility) TOKENS=""; SECRETS=yes; DOTENV=no; GITRW=no; LIMIT=30 ;;
        site)       TOKENS=""; SECRETS=no; DOTENV=yes; GITRW=no; LIMIT=45 ;;
        test|shell) TOKENS=""; SECRETS=no; DOTENV=no; GITRW=no; LIMIT=120 ;;
        doctor)     TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN $GIT_ID"; SECRETS=yes; DOTENV=yes; GITRW=no; LIMIT=10 ;;
        *) return 1 ;;
    esac
    [ -n "${AA_JOB_TIMEOUT_MIN:-}" ] && LIMIT="$AA_JOB_TIMEOUT_MIN"
    return 0
}

case "$JOB" in
    freshness|build|publish|enrichment|daily|visibility|verify-live|restore|site|test|shell|doctor|image|image-refresh|help) ;;
    -h|--help) JOB=help ;;
    *) fail "unknown job '$JOB'" "run 'docker/aa-run.sh help' for the list" 2 ;;
esac
if [ "$JOB" = "help" ]; then
    sed -n '/^usage: /,/^EOF$/p' "$HERE/entrypoint.sh" | sed '$d'
    echo "  image           build the container image (on the Mac)"
    echo "  image-refresh   rebuild from scratch to pick up system package fixes"
    echo "  verify-live     alert if the live site is not a deploy the pipeline made"
    echo "  restore ID      restore a deploy recorded in deploys.log (watchdog rollback)"
    exit 0
fi

# launchd's PATH does not include Docker Desktop's CLI location. Appended, so
# the caller's PATH keeps precedence (tests put a stub docker first).
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin"
command -v docker >/dev/null 2>&1 || fail "docker CLI not found" "install Docker Desktop" 3
docker info >/dev/null 2>&1 || fail "Docker is not running" "open Docker Desktop (enable 'Start when you sign in'), then retry" 3

STATE_DIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}"
SECRETS_DIR="${AA_SECRETS_DIR:-$HOME/.config/agentathens}"
BACKUPS_DIR="${AA_BACKUPS_DIR:-$HOME/agent-athens-backups}"
ENV_FILE="${AA_ENV_FILE:-$STATE_DIR/docker.env}"
export AA_STATE_DIR="$STATE_DIR" AA_REPO="$REPO"
COMPOSE=(docker compose -f "$HERE/compose.yaml")
EMPTY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aa-empty.XXXXXX")"
# Wall-clock limit per container run, portable to macOS (no GNU timeout): a
# background watcher `docker kill`s the named container once the limit has
# passed and leaves a flag file the run reads back (the run then counts as
# failed, and the integrity check still runs). Wall clock, not awake time: a
# Mac asleep past the limit stops the run on wake.
WATCHDOG_PID=""
start_watchdog() {  # $1 container name, $2 limit in minutes
    local name="$1" limit="$2" flag="$STATE_DIR/state/$1.timeout" secs
    secs=$(( 10#$limit * 60 ))
    case "${AA_JOB_TIMEOUT_SEC:-}" in ''|*[!0-9]*) ;; *) secs=$(( 10#$AA_JOB_TIMEOUT_SEC )) ;; esac  # tests
    rm -f "$flag"
    (
        deadline=$(( $(date +%s) + secs ))
        while now="$(date +%s)"; [ "$now" -lt "$deadline" ]; do
            left=$(( deadline - now ))
            [ "$left" -gt 30 ] && left=30
            sleep "$left"
        done
        echo "$name ran past its $limit-minute limit" > "$flag"
        docker kill "$name" >/dev/null 2>&1 || true
        bash "$HERE/integrity-check.sh" notify \
            "Job $JOB: container $name ran past its $limit-minute limit and was stopped (docker kill). See ~/.config/agentathens-docker/logs." \
            >/dev/null 2>&1 || true
    ) </dev/null >/dev/null 2>&1 &
    WATCHDOG_PID=$!
}
stop_watchdog() {
    [ -n "$WATCHDOG_PID" ] || return 0
    kill "$WATCHDOG_PID" 2>/dev/null || true
    wait "$WATCHDOG_PID" 2>/dev/null || true
    WATCHDOG_PID=""
}
# shellcheck disable=SC2317,SC2329  # invoked by the EXIT trap
cleanup() {
    stop_watchdog
    rmdir "$EMPTY_DIR" 2>/dev/null || true
}
trap cleanup EXIT
export AA_SECRETS_DIR="$EMPTY_DIR"

if [ "$JOB" = "image" ]; then
    "${COMPOSE[@]}" build "$@" pipeline
    exit $?
fi
if [ "$JOB" = "image-refresh" ]; then
    "${COMPOSE[@]}" build --no-cache --pull pipeline
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
# Sealed build: the pipeline can run its data phases without building
# (AA_SKIP_BUILD) and build in a separate `build` mode (protected-paths PR).
SEALED=no
if grep -q 'AA_SKIP_BUILD' "$REPO/scripts/daily-automated.sh" 2>/dev/null; then SEALED=yes; fi
mkdir -p "$BACKUPS_DIR" "$SECRETS_DIR" "$STATE_DIR" "$REPO/logs"
chmod 700 "$STATE_DIR" "$SECRETS_DIR"
# The secrets folder holds API keys (and the alert topic): same rule as the
# env file — nothing in it may be readable by other accounts on the Mac.
loose="$(find "$SECRETS_DIR" -type f \( -perm -040 -o -perm -004 \) 2>/dev/null | head -1)"
[ -z "$loose" ] || fail "$loose is readable by other accounts (group/world) and holds secrets" \
    "chmod 600 '$loose' (and any other file in $SECRETS_DIR: chmod -R go-rwx '$SECRETS_DIR')" 4
case "${AA_JOB_TIMEOUT_MIN:-1}" in
    *[!0-9]*) timeout_ok=no ;;
    *) timeout_ok=yes; [ $((10#${AA_JOB_TIMEOUT_MIN:-1})) -gt 0 ] || timeout_ok=no ;;
esac
[ "$timeout_ok" = "yes" ] || fail "AA_JOB_TIMEOUT_MIN must be a whole number of minutes above 0 (got '${AA_JOB_TIMEOUT_MIN:-}')" \
    "unset it (per-job defaults) or set e.g. AA_JOB_TIMEOUT_MIN=60" 2

docker image inspect agent-athens-pipeline:local >/dev/null 2>&1 \
    || fail "image agent-athens-pipeline:local not built" "run 'docker/aa-run.sh image'" 3
created="$(docker image inspect -f '{{.Created}}' agent-athens-pipeline:local | cut -c1-10)"
if [ "$(uname -s)" = "Darwin" ]; then age_days=$(( ($(date +%s) - $(date -j -f %Y-%m-%d "$created" +%s)) / 86400 ))
else age_days=$(( ($(date +%s) - $(date -d "$created" +%s)) / 86400 )); fi
# Stale images are refused for the runs that load outside content; checks,
# restores and the live-site check still run.
case "$JOB" in doctor|shell|verify-live|restore) stale_ok=yes ;; *) stale_ok=no ;; esac
if [ "$age_days" -gt 30 ] && [ "$stale_ok" = "no" ] && [ -z "${AA_ALLOW_STALE_IMAGE:-}" ]; then
    fail "image is $age_days days old — Chromium and system packages are missing security fixes" \
         "run 'docker/aa-run.sh image-refresh' (or set AA_ALLOW_STALE_IMAGE=1 for one run)" 7
fi

# Hold off idle sleep for the whole run, as daily-automated.sh does with
# caffeinate on the Mac (it cannot inside the container). Enrichment is
# excluded there too.
if [ "$JOB" != "enrichment" ] && [ -z "${AA_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1; then
    export AA_CAFFEINATED=1
    exec caffeinate -i "$0" "$JOB" "$@"
fi

NAME="agent-athens-$JOB"
# build and publish share dist/ with the freshness run's own build/publish.
running="^/${NAME}(-ingest|-build|-publish)?\$"
case "$JOB" in build|publish) running="^/agent-athens-(freshness(-ingest|-build|-publish)?|$JOB)\$" ;; esac
if [ -n "$(docker ps -q --filter "name=$running")" ]; then
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
# the Mac parses the file (restores are checked inside the container by
# docker/restore-backup.sh). Waits for other pipeline runs so the copy is not
# torn, records a SHA-256 per backup, keeps tiered generations, and hands the
# file to $AA_OFFSITE_CMD (e.g. an rclone or rsync wrapper) when set.
# Every skipped or failed backup is an alert, not just a log line: the run
# goes ahead, and nobody reads the log of a scheduled run.
backup_skipped() {  # $1 reason
    log "WARNING: no database backup this run: $1"
    bash "$HERE/integrity-check.sh" notify "Database backup skipped before job $JOB: $1" >/dev/null 2>&1 || true
}
backup_db() {
    local db="$REPO/data/events.db" stamp waited=0 f
    [ -f "$db" ] || { backup_skipped "no data/events.db"; return 0; }
    while [ -n "$(docker ps -q --filter 'name=^/agent-athens-')" ]; do
        [ "$waited" -ge 600 ] && { backup_skipped "another pipeline container was still running after 10 min"; return 0; }
        sleep 15; waited=$((waited + 15))
    done
    stamp="$(date +%Y-%m-%d-%H%M)"
    for f in "" -wal -shm; do
        if [ -f "$db$f" ] && ! cp -p "$db$f" "$BACKUPS_DIR/events-$stamp.db$f"; then
            backup_skipped "copying data/events.db$f to $BACKUPS_DIR failed (disk full?)"; return 0
        fi
    done
    gzip -f "$BACKUPS_DIR/events-$stamp.db"* || { backup_skipped "gzip in $BACKUPS_DIR failed"; return 0; }
    (cd "$BACKUPS_DIR" && for f in events-"$stamp".db*.gz; do shasum -a 256 "$f"; done >> SHA256SUMS)
    prune_backups
    log "backed up data/events.db to $BACKUPS_DIR/events-$stamp.db.gz"
    if [ -z "${AA_OFFSITE_CMD:-}" ]; then
        # The only copy is on this Mac. Log it every time; alert once a week.
        log "WARNING: AA_OFFSITE_CMD is not set — this backup exists only on this Mac"
        local warned="$STATE_DIR/offsite-warned" last now
        now="$(date +%s)"
        last="$(cat "$warned" 2>/dev/null || true)"
        case "$last" in ''|*[!0-9]*) last=0 ;; esac
        if [ $((now - last)) -ge 604800 ]; then
            echo "$now" > "$warned"
            bash "$HERE/integrity-check.sh" notify "Database backups are not copied off this Mac: set AA_OFFSITE_CMD (see docker/README.md). Reminder at most weekly." >/dev/null 2>&1 || true
        fi
    else
        if $AA_OFFSITE_CMD "$BACKUPS_DIR/events-$stamp.db.gz" >/dev/null 2>&1; then
            log "off-machine copy done"
        else
            log "WARNING: off-machine copy failed ($AA_OFFSITE_CMD)"
            bash "$HERE/integrity-check.sh" notify "Off-machine backup copy failed; check AA_OFFSITE_CMD" >/dev/null 2>&1 || true
        fi
    fi
}

# Keep: the newest 20 sets, the newest set of each of the last 14 days, of each
# of the last 8 weeks and of each of the last 6 months. Names are
# events-YYYY-MM-DD-HHMM.db.gz, so the date is parsed from the name, and the
# names sort newest first in reverse order (cp -p keeps the database's mtime,
# so file times are not the backup times).
backup_sets() {
    local f
    for f in "$BACKUPS_DIR"/events-*.db.gz; do [ -f "$f" ] && printf '%s\n' "$f"; done | LC_ALL=C sort -r
}
prune_backups() {
    local f d day week month keep days="" weeks="" months="" n=0 nd=0 nw=0 nm=0
    local keepfile; keepfile="$(mktemp)"
    while IFS= read -r f; do
        d="$(basename "$f" | sed -n 's/^events-\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)-.*/\1/p')"
        [ -n "$d" ] || continue
        keep=no; n=$((n + 1))
        [ "$n" -le 20 ] && keep=yes
        day="$d"; month="${d%-*}"
        if [ "$(uname -s)" = "Darwin" ]; then week=$(( $(date -j -f %Y-%m-%d "$d" +%s) / 604800 ))
        else week=$(( $(date -d "$d" +%s) / 604800 )); fi
        case " $days " in *" $day "*) ;; *) nd=$((nd + 1)); days="$days $day"; [ "$nd" -le 14 ] && keep=yes ;; esac
        case " $weeks " in *" $week "*) ;; *) nw=$((nw + 1)); weeks="$weeks $week"; [ "$nw" -le 8 ] && keep=yes ;; esac
        case " $months " in *" $month "*) ;; *) nm=$((nm + 1)); months="$months $month"; [ "$nm" -le 6 ] && keep=yes ;; esac
        [ "$keep" = "yes" ] && echo "$f" >> "$keepfile"
    done < <(backup_sets)
    while IFS= read -r f; do
        grep -qxF "$f" "$keepfile" && continue
        rm -f "$f" "${f%.db.gz}.db-wal.gz" "${f%.db.gz}.db-shm.gz"
    done < <(backup_sets)
    rm -f "$keepfile"
}

is_dotenv() { case "$1" in .env.example) return 1 ;; .env|.env.*) return 0 ;; esac; return 1; }

# Run one container under a policy. $1 policy, $2 container name, rest: entrypoint args.
run_container() {
    local policy="$1" name="$2"; shift 2
    job_policy "$policy" || fail "internal: no policy '$policy'" "report this" 2
    export AA_SECRETS_DIR="$EMPTY_DIR"
    [ "$SECRETS" = "yes" ] && export AA_SECRETS_DIR="$SECRETS_DIR"
    local secret_mounts=()
    # The publish run submits sitemaps to Search Console: that one key file only.
    if [ "$SECRETS" = "gsc" ] && [ -f "$SECRETS_DIR/gcp-kpi-reader.json" ]; then
        secret_mounts+=(-v "$SECRETS_DIR/gcp-kpi-reader.json:/home/pwuser/.config/agentathens/gcp-kpi-reader.json:ro")
    fi

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
    [ -n "${AA_SKIP_INGEST:-}" ] && env_flags+=(-e AA_SKIP_INGEST)
    [ -n "${AA_SKIP_BUILD:-}" ] && env_flags+=(-e AA_SKIP_BUILD)

    local mounts=() entry
    while IFS= read -r entry; do
        case "$entry" in .git|.pipeline-*|.auto-enrich.lock.d) continue ;; esac
        case " $RW_TOP " in *" $entry "*) continue ;; esac
        # The Netlify CLI keeps working files under .netlify/ while deploying;
        # only the publish run (no browser, no outside input) may write it.
        [ "$entry" = ".netlify" ] && [ "$policy" = "publish" ] && continue
        case "$entry" in *:*) fail "repo entry '$entry' contains ':' and cannot be mounted" "rename it" 2 ;; esac
        if [ "$DOTENV" = "no" ] && [ -f "$REPO/$entry" ] && is_dotenv "$entry"; then
            mounts+=(-v "/dev/null:/workspace/$entry:ro")    # hidden, not just read-only
        else
            mounts+=(-v "$REPO/$entry:/workspace/$entry:ro")
        fi
    done < <(ls -A1 "$REPO")
    mounts+=(${secret_mounts[@]+"${secret_mounts[@]}"})
    # The one file under a read-only folder that the pipeline writes.
    [ -f "$REPO/docs/DECISIONS-QUEUE.md" ] && mounts+=(-v "$REPO/docs/DECISIONS-QUEUE.md:/workspace/docs/DECISIONS-QUEUE.md")
    if [ "$GITRW" = "yes" ]; then
        mounts+=(-v "$REPO/.git/config:/workspace/.git/config:ro" -v "$REPO/.git/hooks:/workspace/.git/hooks:ro")
    else
        mounts+=(-v "$REPO/.git:/workspace/.git:ro")
    fi
    # dist/ is written only by the build run; scrape and publish see it read-only.
    if [ "$DIST" = "ro" ]; then
        mkdir -p "$REPO/dist"    # else the run could create it through the repo root
        mounts+=(-v "$REPO/dist:/workspace/dist:ro")
    fi
    local service=pipeline
    [ "$NET" = "no" ] && service=pipeline-offline
    local tty=()
    [ -t 0 ] && [ -t 1 ] || tty=(-T)

    # A sealed publish deploys only what a build run just reported: take that
    # hash (once — it is removed now, so a stale one is never compared again).
    if [ "$policy" = "publish" ] && [ "$SEALED" = "yes" ]; then
        BUILD_HASH="$(cat "$BUILD_HASH_FILE" 2>/dev/null || true)"
        rm -f "$BUILD_HASH_FILE"
        printf '%s' "$BUILD_HASH" | grep -qE '^[0-9a-f]{64}$' \
            || fail "no dist hash recorded by a build run for this publish" \
                    "run 'docker/aa-run.sh build' (or freshness) first; publish deploys only what the last build run reported" 10
    fi

    docker rm -f "$name" >/dev/null 2>&1 || true   # leftover from a killed run
    local state="$STATE_DIR/state/$name.pre" rc
    # A snapshot still here means an earlier run of this container never
    # reached its integrity check (killed, rebooted, hung). Check what that
    # run left behind against it first; never overwrite it unchecked.
    if [ -f "$state" ]; then
        log "found the snapshot of an earlier $name run that never reached its integrity check — verifying it first"
        bash "$HERE/integrity-check.sh" verify "$state" "$name (unfinished earlier run)" \
            || fail "integrity check of the unfinished earlier $name run failed" \
                    "see the message above; if it quarantined, follow docs/security/incident-response.md; otherwise inspect, then remove $state" 6
        rm -f "$state"
    fi
    bash "$HERE/integrity-check.sh" snapshot "$state" || fail "integrity snapshot failed" "see the message above" 6
    log "starting $name (tokens: ${TOKENS:-none}; limit ${LIMIT} min)"
    local out="$STATE_DIR/state/$name.out" timeout_flag="$STATE_DIR/state/$name.timeout"
    start_watchdog "$name" "$LIMIT"
    set +e
    if [ "$policy" = "publish" ] || [ "$policy" = "verify-live" ] || [ "$policy" = "build" ]; then
        # Output is read back on the Mac (deploy record / live check / build hash).
        "${COMPOSE[@]}" run --rm -T ${env_flags[@]+"${env_flags[@]}"} \
            ${mounts[@]+"${mounts[@]}"} --name "$name" "$service" "$@" 2>&1 | tee "$out"
        rc=${PIPESTATUS[0]}
    else
        "${COMPOSE[@]}" run --rm ${tty[@]+"${tty[@]}"} ${env_flags[@]+"${env_flags[@]}"} \
            ${mounts[@]+"${mounts[@]}"} --name "$name" "$service" "$@"
        rc=$?
    fi
    set -e
    stop_watchdog
    if [ -f "$timeout_flag" ]; then
        log "ALERT: $(cat "$timeout_flag") and was stopped — counted as failed"
        rm -f "$timeout_flag"
        rc=124
    fi
    log "$name finished with exit code $rc"
    bash "$HERE/integrity-check.sh" verify "$state" "$name" || exit 6
    rm -f "$state"
    if [ "$policy" = "build" ] && [ "$rc" -eq 0 ]; then record_build "$out" || rc=10; fi
    if [ "$policy" = "publish" ] && [ "$rc" -eq 0 ]; then record_deploy "$out"; fi
    return "$rc"
}

# The build run's dist hash, host-only ($STATE_DIR is never mounted), from one
# strict result line. The publish run's own hash must match it (record_deploy).
BUILD_HASH_FILE="$STATE_DIR/build-hash"
BUILD_HASH=""
record_build() {  # $1 container output
    local lines
    lines="$(grep -E '^BUILD-RESULT dist_hash=[0-9a-f]{64}$' "$1" | LC_ALL=C sort -u || true)"
    if [ -z "$lines" ] || [ "$(printf '%s\n' "$lines" | grep -c .)" -ne 1 ]; then
        log "ALERT: the build run did not print exactly one BUILD-RESULT dist hash — nothing will be published"
        bash "$HERE/integrity-check.sh" notify "Job $JOB: the build run reported no (or more than one) dist hash; publish skipped" >/dev/null 2>&1 || true
        return 1
    fi
    printf '%s\n' "${lines#BUILD-RESULT dist_hash=}" > "$BUILD_HASH_FILE"
    log "recorded build dist hash ${lines#BUILD-RESULT dist_hash=}"
}

# Host-only record of the deploys the pipeline made (no container can write
# $STATE_DIR). The deadman watchdog restores from it and verify-live checks
# the live site against it.
DEPLOYS_LOG="$STATE_DIR/deploys.log"
record_deploy() {
    local line id hash
    line="$(grep -E '^PUBLISH-RESULT deploy_id=[0-9a-f]{20,40} dist_hash=[0-9a-f]{64} state=ready$' "$1" | tail -1 || true)"
    if [ -z "$line" ]; then
        log "WARNING: publish finished but printed no PUBLISH-RESULT line — deploy not recorded"
        return 0
    fi
    id="$(echo "$line" | sed -E 's/.*deploy_id=([0-9a-f]+).*/\1/')"
    hash="$(echo "$line" | sed -E 's/.*dist_hash=([0-9a-f]+).*/\1/')"
    # Sealed build: the deployed tree must be the one the offline build run
    # reported. Otherwise the deploy is not recorded (so verify-live alerts and
    # the watchdog can never restore it) and the operator is told now.
    if [ "$SEALED" = "yes" ] && [ "$hash" != "$BUILD_HASH" ]; then
        log "ALERT: deploy $id has dist hash $hash but the build run reported ${BUILD_HASH:-no hash} — deploy NOT recorded"
        bash "$HERE/integrity-check.sh" notify \
            "Deploy $id was published with dist hash $hash, not the hash the build run reported (${BUILD_HASH:-none}). Not recorded; the live site may not be what the pipeline built. See docs/security/incident-response.md" \
            >/dev/null 2>&1 || true
        BUILD_HASH=""
        exit 10
    fi
    BUILD_HASH=""
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $id $hash" >> "$DEPLOYS_LOG"
    log "recorded deploy $id"
}

check_live() {  # $1 container output
    local live
    live="$(grep -E '^LIVE deploy_id=[0-9a-f]{20,40}$' "$1" | tail -1 | sed -E 's/^LIVE deploy_id=//' || true)"
    [ -n "$live" ] || { bash "$HERE/integrity-check.sh" notify "verify-live could not read the live deploy id"; exit 8; }
    if [ -f "$DEPLOYS_LOG" ] && awk '{print $2}' "$DEPLOYS_LOG" | grep -qxF "$live"; then
        log "live site is pipeline deploy $live"
    else
        log "ALERT: live deploy $live is not one the pipeline recorded"
        bash "$HERE/integrity-check.sh" notify "Live site runs deploy $live, which the pipeline did not make. See docs/security/incident-response.md"
        exit 8
    fi
}

case "$JOB" in
    freshness)
        clear_lock "$REPO/.pipeline-freshness.lock"
        backup_db
        if grep -q 'AA_DEFER_PUBLISH' "$REPO/scripts/daily-automated.sh"; then
            rm -f "$REPO/.pipeline-publish-ready"
            if grep -q 'AA_SKIP_INGEST' "$REPO/scripts/daily-automated.sh"; then
                # Email first, in a run with the mailbox password and no browser;
                # the scrape run then sees no .env at all.
                clear_lock "$REPO/.pipeline-ingest.lock"
                run_container ingest "$NAME-ingest" ingest || log "WARNING: email ingest failed; continuing with scraping"
                export AA_SKIP_INGEST=1
            else
                SCRAPE_DOTENV=yes   # older pipeline: ingest still runs inside the scrape run
            fi
            export AA_DEFER_PUBLISH=1
            if [ "$SEALED" = "yes" ]; then
                # Data phases only: no token, no .env, .git and dist/ read-only.
                rm -f "$BUILD_HASH_FILE"
                export AA_SKIP_BUILD=1
                rc=0; run_container scrape "$NAME" freshness "$@" || rc=$?
                unset AA_DEFER_PUBLISH AA_SKIP_INGEST AA_SKIP_BUILD
                [ "$rc" -eq 0 ] || exit "$rc"
                # Only the build run may mark a publish.
                rm -f "$REPO/.pipeline-publish-ready"
                # Offline build: dist/, the deploy gate and the pipeline-data
                # commit, with git identity only and no network at all.
                clear_lock "$REPO/.pipeline-build.lock"
                rc=0; run_container build "$NAME-build" build || rc=$?
                [ "$rc" -eq 0 ] || exit "$rc"
            else
                rc=0; run_container scrape-build "$NAME" freshness "$@" || rc=$?
                unset AA_DEFER_PUBLISH AA_SKIP_INGEST
                [ "$rc" -eq 0 ] || exit "$rc"
            fi
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
    build)
        [ "$SEALED" = "yes" ] || fail "this pipeline has no separate build step (scripts/daily-automated.sh has no AA_SKIP_BUILD)" \
            "run 'docker/aa-run.sh freshness', which builds inside its scrape run" 2
        clear_lock "$REPO/.pipeline-build.lock"
        rm -f "$BUILD_HASH_FILE"
        run_container build "$NAME" build "$@"
        ;;
    publish)
        clear_lock "$REPO/.pipeline-publish.lock"
        run_container publish "$NAME" publish "$@"
        ;;
    restore)
        # Only a deploy the pipeline itself recorded may be restored.
        id="${1:-}"
        printf '%s' "$id" | grep -qE '^[0-9a-f]{20,40}$' || fail "restore needs a deploy id" "docker/aa-run.sh restore <id from $DEPLOYS_LOG>" 2
        { [ -f "$DEPLOYS_LOG" ] && awk '{print $2}' "$DEPLOYS_LOG" | grep -qxF "$id"; } \
            || fail "deploy $id is not in $DEPLOYS_LOG" "only deploys the pipeline recorded can be restored" 2
        run_container restore "$NAME" restore "$id"
        ;;
    verify-live)
        rc=0; run_container verify-live "$NAME" verify-live || rc=$?
        [ "$rc" -eq 0 ] || { bash "$HERE/integrity-check.sh" notify "verify-live failed (exit $rc)"; exit "$rc"; }
        check_live "$STATE_DIR/state/$NAME.out"
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
