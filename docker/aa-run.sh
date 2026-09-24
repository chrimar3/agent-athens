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
#   - every top-level repo entry except the data folders (RW_TOP) is mounted
#     read-only — code, docs, specs, config, .netlify, .env — plus .git/config
#     and .git/hooks always, and all of .git for runs that never commit;
#   - freshness runs in two containers: scrape/build with no GitHub or Netlify
#     token, then — only if the host integrity check passes — a publish run
#     that holds those tokens but never loads a web page;
#   - backups are copied on the Mac (plain file copy, nothing parsed) into
#     ~/agent-athens-backups, which no container mounts.
# docker/integrity-check.sh runs around every container run.
#
# Exit codes: the job's own exit code; 2 usage; 3 Docker unavailable;
# 4 env file problem; 5 paused by a quarantine; 6 integrity check failed;
# 7 image too old; 8 live site not deployed by the pipeline.
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
# .env visible), GITRW (may commit).
job_policy() {
    case "$1" in
        scrape)     TOKENS="$GIT_ID"; SECRETS=no; DOTENV=${SCRAPE_DOTENV:-no}; GITRW=yes ;;
        ingest)     TOKENS=""; SECRETS=no; DOTENV=yes; GITRW=no ;;
        restore)    TOKENS="NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID"; SECRETS=no; DOTENV=no; GITRW=no ;;
        publish)    TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID $GIT_ID"; SECRETS=gsc; DOTENV=no; GITRW=yes ;;
        verify-live) TOKENS="NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID"; SECRETS=no; DOTENV=no; GITRW=no ;;
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
    freshness|publish|enrichment|daily|visibility|verify-live|restore|site|test|shell|doctor|image|image-refresh|help) ;;
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
mkdir -p "$BACKUPS_DIR" "$SECRETS_DIR" "$STATE_DIR" "$REPO/logs"
chmod 700 "$STATE_DIR"

docker image inspect agent-athens-pipeline:local >/dev/null 2>&1 \
    || fail "image agent-athens-pipeline:local not built" "run 'docker/aa-run.sh image'" 3
# Stale images are refused for the runs that load outside content; checks,
# restores and the live-site check still run. Two clocks: the local build
# (system packages: `image-refresh` rebuilds and upgrades them) and the
# Playwright base (Chromium: only a newer base digest updates it, so a rebuild
# does not reset this one). docker/image-age.sh reads both; unknown = too old.
case "$JOB" in doctor|shell|verify-live|restore) stale_ok=yes ;; *) stale_ok=no ;; esac
if [ "$stale_ok" = "no" ] && [ -z "${AA_ALLOW_STALE_IMAGE:-}" ]; then
    max_base_days="${AA_MAX_BASE_AGE_DAYS:-60}"
    case "$max_base_days" in ''|*[!0-9]*) fail "AA_MAX_BASE_AGE_DAYS='$max_base_days' is not a number of days" "unset it (default 60) or set a whole number" 2 ;; esac
    ages="$(bash "$HERE/image-age.sh" agent-athens-pipeline:local)"
    age_days="$(printf '%s\n' "$ages" | sed -n 's/^local_days=\(-\{0,1\}[0-9][0-9]*\)$/\1/p')"
    base_days="$(printf '%s\n' "$ages" | sed -n 's/^base_days=\(-\{0,1\}[0-9][0-9]*\)$/\1/p')"
    chromium="$(printf '%s\n' "$ages" | sed -n 's/^chromium=\([0-9.]*\)$/ (Chromium \1)/p')"
    if [ "${age_days:-999}" -gt 30 ]; then
        fail "image is ${age_days:-an unknown number of} days old — system packages are missing security fixes" \
             "run 'docker/aa-run.sh image-refresh' (or set AA_ALLOW_STALE_IMAGE=1 for one run)" 7
    fi
    if [ "${base_days:-999}" -gt "$max_base_days" ]; then
        fail "the Playwright base image$chromium is ${base_days:-an unknown number of} days old (limit $max_base_days) — Chromium is missing security fixes, and rebuilding does not update it" \
             "merge the pending Dependabot PR that bumps the BASE_IMAGE digest in docker/Dockerfile, pull it, then run 'docker/aa-run.sh image' (or set AA_ALLOW_STALE_IMAGE=1 for one run; AA_MAX_BASE_AGE_DAYS changes the limit)" 7
    fi
fi

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
# the Mac parses the file (restores are checked inside the container by
# docker/restore-backup.sh). Waits for other pipeline runs so the copy is not
# torn, records a SHA-256 per backup, keeps tiered generations, and hands the
# file to $AA_OFFSITE_CMD (e.g. an rclone or rsync wrapper) when set.
backup_db() {
    local db="$REPO/data/events.db" stamp waited=0 f
    [ -f "$db" ] || { log "no data/events.db to back up"; return 0; }
    while [ -n "$(docker ps -q --filter 'name=^/agent-athens-')" ]; do
        [ "$waited" -ge 600 ] && { log "WARNING: another pipeline run is still active after 10 min — skipping this backup"; return 0; }
        sleep 15; waited=$((waited + 15))
    done
    stamp="$(date +%Y-%m-%d-%H%M)"
    for f in "" -wal -shm; do
        [ -f "$db$f" ] && cp -p "$db$f" "$BACKUPS_DIR/events-$stamp.db$f"
    done
    gzip -f "$BACKUPS_DIR/events-$stamp.db"*
    (cd "$BACKUPS_DIR" && for f in events-"$stamp".db*.gz; do shasum -a 256 "$f"; done >> SHA256SUMS)
    prune_backups
    log "backed up data/events.db to $BACKUPS_DIR/events-$stamp.db.gz"
    if [ -n "${AA_OFFSITE_CMD:-}" ]; then
        if $AA_OFFSITE_CMD "$BACKUPS_DIR/events-$stamp.db.gz" >/dev/null 2>&1; then
            log "off-machine copy done"
        else
            log "WARNING: off-machine copy failed ($AA_OFFSITE_CMD)"
            bash "$HERE/integrity-check.sh" notify "Off-machine backup copy failed; check AA_OFFSITE_CMD" || true
        fi
    fi
}

# Keep: the newest 20 sets, the newest set of each of the last 14 days, of each
# of the last 8 weeks and of each of the last 6 months. Names are
# events-YYYY-MM-DD-HHMM.db.gz, so the date is parsed from the name.
prune_backups() {
    local f d day week month keep days="" weeks="" months="" n=0 nd=0 nw=0 nm=0
    local keepfile; keepfile="$(mktemp)"
    for f in $(ls -1t "$BACKUPS_DIR"/events-*.db.gz 2>/dev/null); do
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
    done
    for f in $(ls -1t "$BACKUPS_DIR"/events-*.db.gz 2>/dev/null); do
        grep -qxF "$f" "$keepfile" && continue
        rm -f "$f" "${f%.db.gz}.db-wal.gz" "${f%.db.gz}.db-shm.gz"
    done
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
    local tty=()
    [ -t 0 ] && [ -t 1 ] || tty=(-T)
    docker rm -f "$name" >/dev/null 2>&1 || true   # leftover from a killed run
    local state="$STATE_DIR/state/$name.pre" rc
    bash "$HERE/integrity-check.sh" snapshot "$state" || fail "integrity snapshot failed" "see the message above" 6
    log "starting $name (tokens: ${TOKENS:-none})"
    local out="$STATE_DIR/state/$name.out"
    set +e
    if [ "$policy" = "publish" ] || [ "$policy" = "verify-live" ]; then
        # Output is read back on the Mac (deploy record / live check).
        "${COMPOSE[@]}" run --rm -T ${env_flags[@]+"${env_flags[@]}"} \
            ${mounts[@]+"${mounts[@]}"} --name "$name" pipeline "$@" 2>&1 | tee "$out"
        rc=${PIPESTATUS[0]}
    else
        "${COMPOSE[@]}" run --rm ${tty[@]+"${tty[@]}"} ${env_flags[@]+"${env_flags[@]}"} \
            ${mounts[@]+"${mounts[@]}"} --name "$name" pipeline "$@"
        rc=$?
    fi
    set -e
    log "$name finished with exit code $rc"
    bash "$HERE/integrity-check.sh" verify "$state" "$name" || exit 6
    [ "$policy" = "publish" ] && [ "$rc" -eq 0 ] && record_deploy "$out"
    return "$rc"
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
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $id $hash" >> "$DEPLOYS_LOG"
    log "recorded deploy $id"
}

# docker/check-live.sh judges the container's strict LIVE lines against the
# host-only deploys.log and live-site baseline: unrecorded or rolled-back
# deploy, snippet injection, changed site settings, missing security headers
# or a CSP that allows inline scripts. AA_ACCEPT_LIVE_BASELINE=1 re-baselines
# the site settings after the owner reviewed a change.
check_live() {  # $1 container output
    local rc=0 report l
    report="$(bash "$HERE/check-live.sh" "$1" "$DEPLOYS_LOG" "$STATE_DIR/live-baseline")" || rc=$?
    while IFS= read -r l; do
        if [ -n "$l" ]; then log "$l"; fi
    done <<EOF
$report
EOF
    [ "$rc" -eq 0 ] && return 0
    bash "$HERE/integrity-check.sh" notify "Live site check: $(printf '%s\n' "$report" | sed -n 's/^ALERT //p' | head -3 | tr '\n' ' ')" || true
    exit 8
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
            rc=0; run_container scrape "$NAME" freshness "$@" || rc=$?
            unset AA_DEFER_PUBLISH AA_SKIP_INGEST
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
