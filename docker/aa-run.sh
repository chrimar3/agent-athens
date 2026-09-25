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
#     lives in ~/.config/agentathens-docker/, of which containers see only the
#     handoff/ subfolder (build and publish runs: the publish marker) and the
#     diff-gate/ subfolder (the publish diff gate's stats). Token values are
#     exported only in the subshell that execs `docker compose run`, never in
#     this script's own environment (so no alert sender, git or backup
#     command it runs ever holds them);
#   - the repo root is never mounted: /workspace is an empty per-run tmpfs and
#     every top-level entry is mounted onto it by its exact name — the data
#     folders (RW_TOP) read-write, everything else (code, docs, specs, config,
#     .netlify) read-only, .env only for runs that need it, symlinks never —
#     plus .git/config and .git/hooks read-only always, and all of .git for
#     runs that never commit. (A repo-root mount on the Mac's case-insensitive
#     disk would reach the real .env or bunfig.toml as /workspace/.ENV or
#     /workspace/BUNFIG.TOML, around the per-name overlays.);
#   - runs other than the offline ones (build, site, diff gate) reach the
#     network only through the egress container (docker/egress/): the HTTP
#     proxy for public hosts on ports 80/443, never the Mac, the LAN or cloud
#     metadata, and a TCP relay pinned to the one IMAP server in docker.env
#     (IMAP_HOST) for email ingest. No run has a direct route out;
#   - runs that write data/events.db wait for each other (locks the pipeline
#     keeps at the repo root now live on each container's own tmpfs);
#   - freshness runs in separate containers: email ingest, a scrape run that
#     cannot write dist/ or .git, a build run with no network and no token,
#     then — only if the host integrity check passes — a publish run that
#     holds the publishing tokens but never loads a web page and cannot write
#     dist/; the Mac records a deploy only if the publish run's dist hash is
#     the one the build run reported;
#   - dist/ is writable only in the runs that build the site (build, site;
#     older pipelines: scrape-build, legacy, daily), and those runs never
#     overlap the diff gate and publish runs (a host-side lock held from the
#     build or gate to the end of the upload);
#   - every container run has a wall-clock limit (docker kill when it fires);
#   - backups are copied on the Mac (plain file copy, nothing parsed) into
#     ~/agent-athens-backups, which no container mounts;
#   - with the pipeline's support: every publish gets the HEAD recorded after
#     the last recorded deploy as a floor (AA_MIN_HEAD), and a build's dist/
#     must pass scripts/publish-diff-gate.ts before it is published.
# docker/integrity-check.sh runs around every container run.
#
# Exit codes: the job's own exit code; 2 usage; 3 Docker unavailable;
# 4 env file or secrets folder problem; 5 paused by a quarantine; 6 integrity
# check failed; 7 image too old; 8 live site not deployed by the pipeline;
# 10 build/publish dist hash missing or mismatched (deploy not recorded);
# 11 another run that writes the database was still running after 2 h;
# 12 publish held by the diff gate (AA_ACCEPT_DIFF=1 docker/aa-run.sh publish
# after review); 13 the diff gate itself failed (nothing published);
# 14 another run that builds or publishes dist/ was still running after 2 h;
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
# Mailbox settings src/ingest/email-ingestion.ts reads. From docker.env when
# set there (then the repo .env no longer needs them); runs that fetch mail
# still see the repo .env too, for installs that keep them there. IMAP_HOST
# (and IMAP_PORT) must be in docker.env if not Gmail: the egress relay is
# pinned to them, and runs that fetch mail get that IMAP_HOST explicitly.
MAIL_KEYS="EMAIL_USER EMAIL_PASSWORD IMAP_HOST IMAP_PORT"
# Top-level repo entries a run may write (created on the Mac if missing).
# Every other entry is mounted read-only, so no run can change what the Mac or
# an agent session later executes or reads as instructions. node_modules is
# never the Mac's: compose gives every run the image's Linux modules. Anything
# else a run writes at the root (lock files) stays on its own /workspace tmpfs.
RW_TOP="data dist logs node_modules temp tmp temp-descriptions temp-briefs temp-research"

# Per run: TOKENS, SECRETS (yes = mount ~/.config/agentathens read-only;
# files = only the key files named in SECRET_FILES; no = an empty folder),
# DOTENV (repo .env visible), GITRW (may commit), DIST (rw = dist/ writable:
# only the runs that build the site — build, site, and on older pipelines
# scrape-build, legacy and daily; read-only for every other run), NET (proxy
# = internal network, out only through the egress proxy; mail = the same, plus
# IMAP through the egress relay; no = the offline compose service), LIMIT
# (wall-clock minutes; AA_JOB_TIMEOUT_MIN overrides every run's limit).
#   scrape       sealed-build pipeline: data phases only, never commits or builds
#   scrape-build older pipeline: scrape + build + commit in one run
#   build        builds dist/ and commits artifacts to pipeline-data, offline
#   diff-gate    scripts/publish-diff-gate.ts over the built dist/, offline
job_policy() {
    # dist/ is read-only unless a run builds the site (see run_container:
    # those runs and the diff gate/publish never overlap).
    DIST=ro; NET=proxy; SECRET_FILES=""
    case "$1" in
        scrape)     TOKENS=""; SECRETS=no; DOTENV=${SCRAPE_DOTENV:-no}; GITRW=no; DIST=ro; NET=${SCRAPE_NET:-proxy}; LIMIT=180 ;;
        scrape-build) TOKENS="$GIT_ID"; SECRETS=no; DOTENV=${SCRAPE_DOTENV:-no}; GITRW=yes; DIST=rw; NET=${SCRAPE_NET:-proxy}; LIMIT=180 ;;
        build)      TOKENS="$GIT_ID"; SECRETS=no; DOTENV=no; GITRW=yes; DIST=rw; NET=no; LIMIT=45 ;;
        ingest)     TOKENS="$MAIL_KEYS"; SECRETS=no; DOTENV=yes; GITRW=no; NET=mail; LIMIT=30 ;;
        restore)    TOKENS="NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID"; SECRETS=no; DOTENV=no; GITRW=no; LIMIT=10 ;;
        diff-gate)  TOKENS=""; SECRETS=no; DOTENV=no; GITRW=no; DIST=ro; NET=no; LIMIT=15 ;;
        publish)    TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID $GIT_ID"; SECRETS=files; SECRET_FILES="gcp-kpi-reader.json"; DOTENV=no; GITRW=yes; DIST=ro; LIMIT=30 ;;
        verify-live) TOKENS="NETLIFY_AUTH_TOKEN NETLIFY_SITE_ID"; SECRETS=no; DOTENV=no; GITRW=no; LIMIT=10 ;;
        legacy)     TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN $GIT_ID $MAIL_KEYS"; SECRETS=yes; DOTENV=yes; GITRW=yes; DIST=rw; NET=mail; LIMIT=180 ;;
        daily)      TOKENS="GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN $GIT_ID $MAIL_KEYS"; SECRETS=yes; DOTENV=yes; GITRW=yes; DIST=rw; NET=mail; LIMIT=360 ;;
        enrichment) TOKENS="CLAUDE_CODE_OAUTH_TOKEN"; SECRETS=no; DOTENV=no; GITRW=no; LIMIT=90 ;;
        visibility) TOKENS=""; SECRETS=files; SECRET_FILES="bing-api-key gcp-kpi-reader.json"; DOTENV=no; GITRW=no; LIMIT=30 ;;
        site)       TOKENS=""; SECRETS=no; DOTENV=no; GITRW=no; DIST=rw; NET=no; LIMIT=45 ;;
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
# `docker compose run` starts the egress proxy (depends_on) and leaves it
# running; stop it once no pipeline container is left using it.
EGRESS_USED=no
stop_egress() {
    [ "$EGRESS_USED" = "yes" ] || return 0
    if [ -n "$(docker ps -q --filter 'name=^/agent-athens-' 2>/dev/null)" ]; then
        log "leaving the egress proxy running: another pipeline run still uses it"
        return 0
    fi
    "${COMPOSE[@]}" rm -s -f egress >/dev/null 2>&1 || true
}
# The dist/ lock (acquire_dist_lock below), released when this script exits.
DIST_LOCK="$STATE_DIR/state/dist.lock"
DIST_LOCK_HELD=no
# shellcheck disable=SC2317,SC2329  # invoked by cleanup (EXIT trap)
release_dist_lock() {
    [ "$DIST_LOCK_HELD" = "yes" ] || return 0
    [ "$(readlink "$DIST_LOCK" 2>/dev/null || true)" = "$$" ] && rm -f "$DIST_LOCK"
    DIST_LOCK_HELD=no
}
# shellcheck disable=SC2317,SC2329  # invoked by the EXIT trap
cleanup() {
    stop_watchdog
    release_dist_lock
    stop_egress
    rmdir "$EMPTY_DIR" 2>/dev/null || true
}
trap cleanup EXIT
export AA_SECRETS_DIR="$EMPTY_DIR"

# Both images come from docker/Dockerfile (pipeline and egress stages).
if [ "$JOB" = "image" ]; then
    "${COMPOSE[@]}" build "$@" pipeline egress
    exit $?
fi
if [ "$JOB" = "image-refresh" ]; then
    "${COMPOSE[@]}" build --no-cache --pull pipeline egress
    exit $?
fi

# A quarantine pauses every job. One exception: docker/restore-backup.sh
# --force-under-quarantine checks the backup in a `shell` run (no token, no
# .env, dist/ and .git read-only) — the owner asked for exactly that one run
# while the quarantine stays in place.
if [ -f "$STATE_DIR/QUARANTINE" ]; then
    cat "$STATE_DIR/QUARANTINE" >&2
    if [ "$JOB" != "shell" ] || [ "${AA_RESTORE_UNDER_QUARANTINE:-}" != "1" ]; then
        fail "jobs are paused by a quarantine" "review the evidence, see docs/security/incident-response.md, then delete $STATE_DIR/QUARANTINE" 5
    fi
    log "quarantine in place — running this shell only for docker/restore-backup.sh --force-under-quarantine"
fi

inside() { case "$1/" in "$2"/*) return 0 ;; esac; return 1; }  # $1 path inside dir $2
# The one host folder outside the repo that build and publish runs may write:
# the deferred-publish marker. Mounted only when the pipeline supports
# AA_PUBLISH_MARKER (protected-paths PR); older pipelines write
# .pipeline-publish-ready at the repo root, which now stays on the
# container's own tmpfs and never reaches the Mac.
HANDOFF_DIR="$STATE_DIR/handoff"
# Publish diff gate: scripts/publish-diff-gate.ts DIST STATS compares the
# built site with the stats of the last accepted one (exit 0 ok and stats
# written, 3 anomaly, anything else an error). Its stats live in a host folder
# of their own, mounted into the diff-gate run only.
DIFF_GATE_DIR="$STATE_DIR/diff-gate"
MARKER_SUPPORT=no
if grep -q 'AA_PUBLISH_MARKER' "$REPO/scripts/daily-automated.sh" 2>/dev/null; then MARKER_SUPPORT=yes; fi
if [ "$MARKER_SUPPORT" = "yes" ]; then PUBLISH_MARKER="$HANDOFF_DIR/publish-ready"; else PUBLISH_MARKER="$REPO/.pipeline-publish-ready"; fi
clear_marker() { rm -f "$PUBLISH_MARKER" "$REPO/.pipeline-publish-ready"; }
[ -f "$ENV_FILE" ] || fail "env file $ENV_FILE missing" "mkdir -p '$STATE_DIR' && cp docker/docker.env.example '$ENV_FILE' && chmod 600 '$ENV_FILE', then fill in the tokens" 4
if inside "$ENV_FILE" "$REPO" || inside "$ENV_FILE" "$SECRETS_DIR" || inside "$ENV_FILE" "$BACKUPS_DIR" || inside "$ENV_FILE" "$HANDOFF_DIR" \
    || inside "$ENV_FILE" "$DIFF_GATE_DIR"; then
    fail "env file $ENV_FILE is inside a folder a container can mount" "move it to $STATE_DIR/docker.env" 4
fi
# GNU `stat -f` means "filesystem status", so pick the form by OS.
if [ "$(uname -s)" = "Darwin" ]; then perm="$(stat -f %Lp "$ENV_FILE")"; else perm="$(stat -c %a "$ENV_FILE")"; fi
case "$perm" in
    600|400) ;;
    *) fail "env file $ENV_FILE has mode $perm (holds tokens)" "chmod 600 '$ENV_FILE'" 4 ;;
esac
{ [ -d "$REPO/.git" ] && [ ! -L "$REPO/.git" ]; } || fail "$REPO/.git is not a directory (git worktree or symlink?)" "run the pipeline from the main clone" 2

# One value from the env file, as run_container would pass it (the last
# non-empty KEY= line wins). Parsed, never sourced.
env_file_value() {  # $1 key
    local line v=""
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in "$1="?*) v="${line#*=}" ;; esac
    done < "$ENV_FILE"
    printf '%s' "$v"
}
# The egress relay forwards raw TCP to one IMAP server (email ingest cannot
# use the HTTP proxy). It must be a public DNS name: never an IP literal
# (192.168.x.x, 127.1 …) or a local name, which would turn the relay into a
# route to the Mac or the LAN. The egress container also refuses a name that
# resolves to a private address. Not secret: exported for compose (the egress
# service's environment); identical for every run, so a running proxy is
# never recreated under another job.
valid_mail_host() {  # $1 → 0 if a plausible public host name
    local h="$1" lc
    [ "${#h}" -le 253 ] || return 1
    printf '%s' "$h" | grep -qE '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' || return 1
    case "${h##*.}" in *[!0-9]*) ;; *) return 1 ;; esac   # all-digit last label: an IPv4 literal
    lc="$(printf '%s' "$h" | tr '[:upper:]' '[:lower:]')"
    case "$lc" in *.localhost|*.local|*.internal|*.lan|*.home.arpa|*.localdomain|*.docker) return 1 ;; esac
    return 0
}
IMAP_RELAY_HOST="$(env_file_value IMAP_HOST)"
[ -n "$IMAP_RELAY_HOST" ] || IMAP_RELAY_HOST=imap.gmail.com   # email-ingestion.ts's default
valid_mail_host "$IMAP_RELAY_HOST" \
    || fail "IMAP_HOST in $ENV_FILE ('$(printf '%s' "$IMAP_RELAY_HOST" | LC_ALL=C tr -cd 'A-Za-z0-9.:_-' | cut -c1-80)') is not a public host name — IP addresses and local names are refused, because the egress relay forwards email ingest's connection to it" \
            "set IMAP_HOST to your mail provider's IMAP host name (e.g. imap.gmail.com), or remove the line for Gmail" 4
IMAP_RELAY_PORT="$(env_file_value IMAP_PORT)"
[ -n "$IMAP_RELAY_PORT" ] || IMAP_RELAY_PORT=993
case "$IMAP_RELAY_PORT" in
    *[!0-9]*) relay_port_ok=no ;;
    *) relay_port_ok=yes; { [ "${#IMAP_RELAY_PORT}" -le 5 ] && [ $((10#$IMAP_RELAY_PORT)) -ge 1 ] && [ $((10#$IMAP_RELAY_PORT)) -le 65535 ]; } || relay_port_ok=no ;;
esac
[ "$relay_port_ok" = "yes" ] || fail "IMAP_PORT in $ENV_FILE is not a TCP port (1-65535)" "set IMAP_PORT=993 (implicit TLS) or remove the line" 4
export AA_IMAP_HOST="$IMAP_RELAY_HOST" AA_IMAP_PORT="$IMAP_RELAY_PORT"
# Sealed build: the pipeline can run its data phases without building
# (AA_SKIP_BUILD) and build in a separate `build` mode (protected-paths PR).
SEALED=no
if grep -q 'AA_SKIP_BUILD' "$REPO/scripts/daily-automated.sh" 2>/dev/null; then SEALED=yes; fi
# Deploy floor: scripts/deploy-gate.sh refuses a HEAD that is not AA_MIN_HEAD
# or a descendant of it (protected-paths PR). The floor is the host repo's
# HEAD after the last deploy recorded in deploys.log, kept host-only.
MIN_HEAD_FILE="$STATE_DIR/min-head"
MIN_HEAD_SUPPORT=no
if grep -q 'AA_MIN_HEAD' "$REPO/scripts/deploy-gate.sh" 2>/dev/null; then MIN_HEAD_SUPPORT=yes; fi
mkdir -p "$BACKUPS_DIR" "$SECRETS_DIR" "$STATE_DIR" "$REPO/logs"
chmod 700 "$STATE_DIR" "$SECRETS_DIR"
if [ "$MARKER_SUPPORT" = "yes" ]; then mkdir -p "$HANDOFF_DIR" && chmod 700 "$HANDOFF_DIR"; fi
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

for img in agent-athens-pipeline:local agent-athens-egress:local; do
    docker image inspect "$img" >/dev/null 2>&1 \
        || fail "image $img not built" "run 'docker/aa-run.sh image' (builds the pipeline and the egress proxy)" 3
done
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
# build and publish share dist/ with the freshness run's own build/publish.
running="^/${NAME}(-ingest|-build|-diff-gate|-publish)?\$"
case "$JOB" in build|publish) running="^/agent-athens-(freshness(-ingest|-build|-diff-gate|-publish)?|$JOB(-diff-gate)?)\$" ;; esac
if [ -n "$(docker ps -q --filter "name=$running")" ]; then
    log "$JOB is already running in container $NAME — skipping."
    exit 0
fi

# Lock files at the repo root. Containers no longer see or leave them: each
# run's /workspace root is its own tmpfs, so the pipeline's locks there only
# guard that one run, and wait_for_db_writers below does the cross-container
# exclusion they used to. What a lock at the real repo root still means is a
# pipeline running directly on the Mac (AA_ALLOW_HOST_RUN=1): skip while that
# one is alive; anything else there is a leftover (from a dead host run, or a
# container from before the tmpfs root) and is removed, harmlessly.
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

# Cross-container exclusion for runs that write data/events.db (ingest,
# scrape/freshness, build, enrichment, daily, site). The pipeline's own
# locks (.pipeline-<mode>.lock, .auto-enrich.lock.d shared by daily and
# enrichment) now live on each container's private tmpfs and cannot see each
# other, so the wrapper waits here while another such container runs:
# polling every 30 s, for up to 2 h, then it gives up with an alert (exit 11).
# The same job already running is skipped earlier, as before.
DB_WRITERS_RE='^/agent-athens-(freshness|freshness-ingest|freshness-build|build|enrichment|daily|site)$'
writes_db() { case "$1" in ingest|scrape|scrape-build|build|legacy|daily|enrichment|site) return 0 ;; esac; return 1; }
wait_for_db_writers() {
    local poll="${AA_DB_WAIT_POLL_SEC:-30}" max="${AA_DB_WAIT_MAX_SEC:-7200}" waited=0 busy msg
    case "$poll" in ''|*[!0-9]*) poll=30 ;; esac
    case "$max" in ''|*[!0-9]*) max=7200 ;; esac
    [ "$poll" -ge 1 ] || poll=1
    while busy="$(docker ps --format '{{.Names}}' --filter "name=$DB_WRITERS_RE" 2>/dev/null | head -1)"; [ -n "$busy" ]; do
        if [ "$waited" -ge "$max" ]; then
            msg="$busy, another run that writes data/events.db, was still running after $((max / 60)) min"
            bash "$HERE/integrity-check.sh" notify "Job $JOB did not run: $msg" >/dev/null 2>&1 || true
            echo "aa-run: $msg" >&2
            echo "aa-run: next: check it with 'docker ps' and its log in ~/.config/agentathens-docker/logs; the next scheduled $JOB runs as usual" >&2
            exit 11
        fi
        [ "$waited" -eq 0 ] && log "waiting for $busy to finish: it writes data/events.db too (checking every ${poll}s, up to $((max / 60)) min)"
        sleep "$poll"; waited=$((waited + poll))
    done
    [ "$waited" -eq 0 ] || log "no other database-writing run left after ${waited}s — going ahead"
}

# dist/ writers and dist/ publishers never overlap. Only the runs that build
# the site get dist/ writable (DIST=rw: build, site; scrape-build, legacy and
# daily on older pipelines); the diff gate hashes dist/ and publish uploads it
# afterwards, so a build or site run in between would publish what the gate
# never saw. Every aa-run.sh that starts such a run (DIST=rw, diff-gate or
# publish) first takes one host-side lock and keeps it until it exits: a
# freshness run holds it from its build through the diff gate to the publish,
# a `publish` from its diff gate to the upload. The lock is a symlink in the
# host-only state folder whose target is the holder's PID (created
# atomically; one whose process is gone is removed). While another aa-run.sh
# holds it, or a container of such a run is still up (one that outlived its
# aa-run.sh), the run waits — every 30 s, for up to 2 h — then gives up with
# an alert (exit 14).
dist_containers_re() {
    # On older pipelines the freshness container itself builds (scrape-build/legacy).
    local fresh=""
    [ "$SEALED" = "yes" ] || fresh="freshness|"
    printf '^/agent-athens-(%sfreshness-build|freshness-diff-gate|freshness-publish|build|publish|publish-diff-gate|site|daily)$' "$fresh"
}
dist_lock_owner_alive() {  # $1 PID from the lock
    case "$1" in ''|*[!0-9]*) return 1 ;; esac
    ps -p "$1" -o command= 2>/dev/null | grep -q 'aa-run\.sh'
}
acquire_dist_lock() {
    local poll="${AA_DIST_WAIT_POLL_SEC:-${AA_DB_WAIT_POLL_SEC:-30}}" max="${AA_DIST_WAIT_MAX_SEC:-${AA_DB_WAIT_MAX_SEC:-7200}}"
    local waited=0 owner busy re msg
    case "$poll" in ''|*[!0-9]*) poll=30 ;; esac
    case "$max" in ''|*[!0-9]*) max=7200 ;; esac
    [ "$poll" -ge 1 ] || poll=1
    re="$(dist_containers_re)"
    mkdir -p "$STATE_DIR/state"
    while :; do
        busy=""
        if [ "$DIST_LOCK_HELD" != "yes" ]; then
            if ln -sn "$$" "$DIST_LOCK" 2>/dev/null; then
                DIST_LOCK_HELD=yes
            elif [ -e "$DIST_LOCK" ] && [ ! -L "$DIST_LOCK" ]; then
                fail "$DIST_LOCK is not the lock this script makes (a symlink)" "inspect it, remove it, then retry" 14
            else
                owner="$(readlink "$DIST_LOCK" 2>/dev/null || true)"
                [ -n "$owner" ] || continue   # released just now: try again
                if ! dist_lock_owner_alive "$owner"; then
                    log "removing the stale dist/ lock of aa-run.sh process $owner (no longer running)"
                    [ "$(readlink "$DIST_LOCK" 2>/dev/null || true)" = "$owner" ] && rm -f "$DIST_LOCK"
                    continue
                fi
                busy="aa-run.sh process $owner"
            fi
        fi
        if [ "$DIST_LOCK_HELD" = "yes" ]; then
            busy="$(docker ps --format '{{.Names}}' --filter "name=$re" 2>/dev/null | head -1)"
            [ -n "$busy" ] || break
        fi
        if [ "$waited" -ge "$max" ]; then
            msg="$busy, another run that builds or publishes dist/, was still running after $((max / 60)) min"
            bash "$HERE/integrity-check.sh" notify "Job $JOB did not run: $msg" >/dev/null 2>&1 || true
            echo "aa-run: $msg" >&2
            echo "aa-run: next: check it with 'docker ps' and its log in ~/.config/agentathens-docker/logs; the next scheduled $JOB runs as usual" >&2
            exit 14
        fi
        [ "$waited" -eq 0 ] && log "waiting for $busy to finish: it builds or publishes dist/ (checking every ${poll}s, up to $((max / 60)) min)"
        sleep "$poll"; waited=$((waited + poll))
    done
    [ "$waited" -eq 0 ] || log "no other run building or publishing dist/ left after ${waited}s — going ahead"
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
    { [ -e "$db" ] || [ -L "$db" ]; } || { backup_skipped "no data/events.db"; return 0; }
    while [ -n "$(docker ps -q --filter 'name=^/agent-athens-')" ]; do
        [ "$waited" -ge 600 ] && { backup_skipped "another pipeline container was still running after 10 min"; return 0; }
        sleep 15; waited=$((waited + 15))
    done
    # Containers write data/: the database and its -wal/-shm must be plain
    # files, checked now that no container runs. A symlink would copy
    # whatever it points at on the Mac into the backups (and off-site); a
    # FIFO would hang the copy; a device file has no business there. Refused
    # with an alert, never followed.
    if [ -L "$REPO/data" ] || [ ! -d "$REPO/data" ]; then
        backup_skipped "data/ is not a plain folder (a symlink?) — nothing copied; see docs/security/incident-response.md"; return 0
    fi
    for f in "" -wal -shm; do
        { [ -e "$db$f" ] || [ -L "$db$f" ]; } || continue
        if [ -L "$db$f" ] || [ ! -f "$db$f" ]; then
            backup_skipped "data/events.db$f is not a regular file (symlink, FIFO, socket or device) — nothing copied; see docs/security/incident-response.md"; return 0
        fi
    done
    stamp="$(date +%Y-%m-%d-%H%M)"
    for f in "" -wal -shm; do
        [ -f "$db$f" ] || continue
        if ! cp -p "$db$f" "$BACKUPS_DIR/events-$stamp.db$f" || [ -L "$BACKUPS_DIR/events-$stamp.db$f" ] || [ ! -f "$BACKUPS_DIR/events-$stamp.db$f" ]; then
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
# so file times are not the backup times). Only that exact name pattern is
# ever considered: the older host script scripts/backup-events-db.sh keeps its
# own events-YYYY-MM-DD.db.gz in the same folder, and this prune must neither
# count nor delete those.
backup_sets() {
    local f
    for f in "$BACKUPS_DIR"/events-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9].db.gz; do
        [ -f "$f" ] && [ ! -L "$f" ] && printf '%s\n' "$f"
    done | LC_ALL=C sort -r
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

# This run's environment for the container: KEY into run_container's
# run_env_keys/run_env_vals (bash dynamic scope; a later value for the same
# key replaces the earlier one) and `-e KEY` into its env_flags. The value is
# never exported here.
run_env_set() {  # $1 key, $2 value
    local i=0
    while [ "$i" -lt "$run_env_n" ]; do
        if [ "${run_env_keys[$i]}" = "$1" ]; then run_env_vals[$i]="$2"; return 0; fi
        i=$((i + 1))
    done
    run_env_keys[$run_env_n]="$1"; run_env_vals[$run_env_n]="$2"; run_env_n=$((run_env_n + 1))
    env_flags+=(-e "$1")
}
# `docker compose run "$@"` with this run's values exported only in the
# subshell that execs docker: `docker compose run -e KEY` takes the value from
# its own environment, and neither this script, the watchdog, the integrity
# check, the alert senders nor any later run ever has it in theirs. `export`
# is a builtin, so no value appears in a process argument list either.
compose_run() {
    (
        i=0
        while [ "$i" -lt "$run_env_n" ]; do
            export "${run_env_keys[$i]}=${run_env_vals[$i]}"
            i=$((i + 1))
        done
        exec "${COMPOSE[@]}" run "$@"
    )
}

# Run one container under a policy. $1 policy, $2 container name, rest: entrypoint args.
run_container() {
    local policy="$1" name="$2"; shift 2
    job_policy "$policy" || fail "internal: no policy '$policy'" "report this" 2
    # Before anything else (a publish consumes the build hash below): runs
    # that build dist/ and runs that gate or upload it never overlap.
    if [ "$DIST" = "rw" ] || [ "$policy" = "diff-gate" ] || [ "$policy" = "publish" ]; then acquire_dist_lock; fi
    export AA_SECRETS_DIR="$EMPTY_DIR"
    [ "$SECRETS" = "yes" ] && export AA_SECRETS_DIR="$SECRETS_DIR"
    local secret_mounts=() sf
    # Runs that need one or two API keys get those files, not the folder: the
    # publish run the Search Console key (sitemap submission), visibility the
    # Bing and Search Console keys. A symlink is never mounted (it would
    # mount whatever it points at).
    if [ "$SECRETS" = "files" ]; then
        for sf in $SECRET_FILES; do
            if [ -f "$SECRETS_DIR/$sf" ] && [ ! -L "$SECRETS_DIR/$sf" ]; then
                secret_mounts+=(-v "$SECRETS_DIR/$sf:/home/pwuser/.config/agentathens/$sf:ro")
            fi
        done
    fi

    # Only this run's tokens. The env file is parsed, never sourced, and the
    # values stay in this shell's (unexported) arrays until compose_run
    # exports them in the subshell that execs docker.
    local env_flags=() line key lineno=0 run_env_n=0
    local run_env_keys run_env_vals; run_env_keys=(); run_env_vals=()
    while IFS= read -r line || [ -n "$line" ]; do
        lineno=$((lineno + 1))
        case "$line" in ''|'#'*) continue ;; esac
        printf '%s' "$line" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*=' \
            || fail "$ENV_FILE line $lineno is not KEY=value" "fix that line (no 'export', no spaces around '=')" 4
        key="${line%%=*}"
        # An empty KEY= line passes nothing: an empty EMAIL_PASSWORD would
        # otherwise hide the one in the repo .env (bun never overrides a set
        # variable with .env).
        [ -n "${line#*=}" ] || continue
        case " $TOKENS " in *" $key "*) run_env_set "$key" "${line#*=}" ;; esac
    done < "$ENV_FILE"
    # Runs that fetch mail verify the server as the IMAP_HOST the egress relay
    # is pinned to (validated above), whatever the repo .env says.
    [ "$NET" = "mail" ] && run_env_set IMAP_HOST "$IMAP_RELAY_HOST"
    # The deploy floor: never publish a HEAD older than the one recorded
    # after the last recorded deploy (scripts/deploy-gate.sh refuses it).
    if [ "$policy" = "publish" ] && [ "$MIN_HEAD_SUPPORT" = "yes" ]; then
        local min_head
        if min_head="$(read_min_head)"; then
            [ -n "$min_head" ] && env_flags+=(-e "AA_MIN_HEAD=$min_head")
        else
            log "WARNING: $MIN_HEAD_FILE does not hold a commit id — publishing without a deploy floor"
            bash "$HERE/integrity-check.sh" notify "Job $JOB: $MIN_HEAD_FILE is not a 40-hex commit id; published without a deploy floor. Check it (host-only file), then delete it or write the live deploy's commit" >/dev/null 2>&1 || true
        fi
    fi
    [ -n "${AA_DEFER_PUBLISH:-}" ] && env_flags+=(-e AA_DEFER_PUBLISH)
    [ -n "${AA_SKIP_INGEST:-}" ] && env_flags+=(-e AA_SKIP_INGEST)
    [ -n "${AA_SKIP_BUILD:-}" ] && env_flags+=(-e AA_SKIP_BUILD)
    # Containers never gc or run maintenance: the integrity check requires the
    # object store to only grow (no existing object or pack may change).
    env_flags+=(-e GIT_CONFIG_COUNT=2 -e GIT_CONFIG_KEY_0=gc.auto -e GIT_CONFIG_VALUE_0=0 \
        -e GIT_CONFIG_KEY_1=maintenance.auto -e GIT_CONFIG_VALUE_1=false)

    # The repo root itself is never mounted (/workspace is the container's own
    # tmpfs): each top-level entry is mounted by its exact name, so on the
    # Mac's case-insensitive disk no other spelling of a name reaches the file.
    # The data folders are created here first: a run can no longer create a
    # top-level folder on the Mac.
    local d
    for d in $RW_TOP; do
        [ "$d" = "node_modules" ] && continue
        [ -e "$REPO/$d" ] || [ -L "$REPO/$d" ] || mkdir "$REPO/$d"
    done
    local mounts=() entry mode
    while IFS= read -r entry; do
        case "$entry" in
            .git) continue ;;           # below
            node_modules) continue ;;   # the image's Linux modules (compose volume), never the Mac's
            # A host-run pipeline's lock files and marker: not the container's
            # business (it keeps its own locks on its tmpfs root).
            .pipeline-*|.auto-enrich.lock.d) continue ;;
        esac
        case "$entry" in *:*) fail "repo entry '$entry' contains ':' and cannot be mounted" "rename it" 2 ;; esac
        # A top-level symlink would mount whatever it points at (anywhere on
        # the Mac): never followed.
        if [ -L "$REPO/$entry" ]; then
            log "not mounting '$entry': it is a symlink, and top-level symlinks are never followed into a container"
            continue
        fi
        # .env files exist in the container only for runs that need them —
        # absent otherwise, not even as an empty file.
        if is_dotenv "$entry"; then
            [ "$DOTENV" = "yes" ] && mounts+=(-v "$REPO/$entry:/workspace/$entry:ro")
            continue
        fi
        mode=ro
        case " $RW_TOP " in *" $entry "*) mode=rw ;; esac
        # dist/ is writable only where DIST=rw (the runs that build the site).
        [ "$entry" = "dist" ] && [ "$DIST" = "ro" ] && mode=ro
        # The Netlify CLI keeps working files under .netlify/ while deploying;
        # only the publish run (no browser, no outside input) may write it.
        [ "$entry" = ".netlify" ] && [ "$policy" = "publish" ] && mode=rw
        mounts+=(-v "$REPO/$entry:/workspace/$entry:$mode")
    done < <(ls -A1 "$REPO")
    mounts+=(${secret_mounts[@]+"${secret_mounts[@]}"})
    # Nothing under docs/ is writable in any run (the decisions queue is
    # generated into data/, see scripts/decisions-queue.ts).
    if [ "$GITRW" = "yes" ]; then
        mounts+=(-v "$REPO/.git:/workspace/.git:rw" \
            -v "$REPO/.git/config:/workspace/.git/config:ro" -v "$REPO/.git/hooks:/workspace/.git/hooks:ro")
    else
        mounts+=(-v "$REPO/.git:/workspace/.git:ro")
    fi
    # The deferred-publish marker crosses from the build run to the Mac and on
    # to the publish run through $STATE_DIR/handoff, the only host folder
    # outside the repo those runs can write (scrape-build is the build run of
    # pipelines without a separate build step).
    if [ "$MARKER_SUPPORT" = "yes" ]; then
        case "$policy" in
            build|scrape-build|publish)
                mounts+=(-v "$HANDOFF_DIR:/handoff:rw")
                env_flags+=(-e "AA_PUBLISH_MARKER=/handoff/publish-ready") ;;
        esac
    fi
    # The diff gate's stats (scripts/publish-diff-gate.ts) persist in a host
    # folder of their own, mounted into the diff-gate run only, at the path
    # the gate is given (/handoff/publish-stats.json). The Mac never reads it.
    if [ "$policy" = "diff-gate" ]; then
        mkdir -p "$DIFF_GATE_DIR" && chmod 700 "$DIFF_GATE_DIR"
        mounts+=(-v "$DIFF_GATE_DIR:/handoff:rw")
    fi
    local service=pipeline
    [ "$NET" = "no" ] && service=pipeline-offline
    [ "$NET" = "mail" ] && service=pipeline-mail
    [ "$service" = "pipeline-offline" ] || EGRESS_USED=yes
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

    if writes_db "$policy"; then wait_for_db_writers; fi
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
    case "$policy" in
        publish|verify-live|build|diff-gate)
            # Output is read back on the Mac (deploy record / live check /
            # build hash / the diff gate's reasons).
            compose_run --rm -T ${env_flags[@]+"${env_flags[@]}"} \
                ${mounts[@]+"${mounts[@]}"} --name "$name" "$service" "$@" 2>&1 | tee "$out"
            rc=${PIPESTATUS[0]} ;;
        *)
            compose_run --rm ${tty[@]+"${tty[@]}"} ${env_flags[@]+"${env_flags[@]}"} \
                ${mounts[@]+"${mounts[@]}"} --name "$name" "$service" "$@"
            rc=$? ;;
    esac
    set -e
    stop_watchdog
    if [ -f "$timeout_flag" ]; then
        log "ALERT: $(cat "$timeout_flag") and was stopped — counted as failed"
        rm -f "$timeout_flag"
        rc=124
    fi
    log "$name finished with exit code $rc"
    # A run that fails the check leaves nothing behind to publish.
    bash "$HERE/integrity-check.sh" verify "$state" "$name" || { clear_marker; false; } || exit 6
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
    record_min_head
}

# The host repo's HEAD, read with the integrity check's git environment (the
# check has just verified .git's config and hooks): nothing inherited may
# point git at another repository, object store or replacement objects.
host_head() {
    (
        unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
              GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT
        export GIT_NO_REPLACE_OBJECTS=1
        cd "$REPO" && git rev-parse --verify -q HEAD
    ) 2>/dev/null
}
is_sha1() { case "$1" in *[!0-9a-f]*) return 1 ;; esac; [ "${#1}" -eq 40 ]; }
# After a recorded deploy: its HEAD becomes the floor every later publish
# must equal or descend from (host-only file; no container mounts $STATE_DIR).
record_min_head() {
    local h
    h="$(host_head || true)"
    if is_sha1 "$h"; then
        printf '%s\n' "$h" > "$MIN_HEAD_FILE"
        log "recorded deploy floor (min HEAD) $h"
    else
        log "WARNING: could not read the repo's HEAD as a 40-hex commit id — deploy floor not updated"
    fi
}
read_min_head() {  # prints the floor ("" when none recorded); 1 if the file is not one commit id
    local h
    [ -e "$MIN_HEAD_FILE" ] || return 0
    [ -f "$MIN_HEAD_FILE" ] && [ ! -L "$MIN_HEAD_FILE" ] || return 1
    h="$(cat "$MIN_HEAD_FILE")"
    is_sha1 "$h" || return 1
    printf '%s' "$h"
}

# The diff gate's own output, for an alert: printable characters only, at
# most 5 non-empty lines of 160 characters, 600 in all (it came out of a
# container that read the built site).
gate_reasons() {  # $1 container output file
    LC_ALL=C tr -cd '[:print:]\n' < "$1" | grep -v '^[[:space:]]*$' | head -5 | cut -c1-160 \
        | tr '\n' ' ' | cut -c1-600
}
# Before a sealed publish, when the pipeline has scripts/publish-diff-gate.ts:
# the gate compares the built dist/ (read-only, no network, no token) with the
# stats of the last accepted build. Returns only when publishing may go on;
# otherwise alerts and exits (12 held, 13 gate error). AA_ACCEPT_DIFF=1 on a
# `publish` job runs it with --accept (the owner reviewed the change: the new
# stats become the baseline).
run_diff_gate() {  # $1 container name
    [ "$SEALED" = "yes" ] && [ -f "$REPO/scripts/publish-diff-gate.ts" ] || return 0
    # No build to judge: the publish run itself refuses that (exit 10).
    [ -s "$BUILD_HASH_FILE" ] || return 0
    local name="$1" rc=0 accept=() reasons
    if [ "$JOB" = "publish" ] && [ "${AA_ACCEPT_DIFF:-}" = "1" ]; then
        accept=(--accept)
        log "AA_ACCEPT_DIFF=1: the diff gate accepts this build's dist/ as the new baseline"
    fi
    run_container diff-gate "$name" diff-gate ${accept[@]+"${accept[@]}"} || rc=$?
    case "$rc" in
        0) log "diff gate passed"; return 0 ;;
        3)
            reasons="$(gate_reasons "$STATE_DIR/state/$name.out")"
            log "ALERT: publish held by the diff gate: $reasons"
            echo "aa-run: next: review the change (dist/, the gate's reasons above); if it is expected, run: AA_ACCEPT_DIFF=1 docker/aa-run.sh publish" >&2
            bash "$HERE/integrity-check.sh" notify "Job $JOB: publish held by the diff gate — $reasons — Review; if expected: AA_ACCEPT_DIFF=1 docker/aa-run.sh publish" >/dev/null 2>&1 || true
            exit 12 ;;
        *)
            log "ALERT: the diff gate failed (exit $rc) — nothing published"
            bash "$HERE/integrity-check.sh" notify "Job $JOB: the publish diff gate failed (exit $rc); nothing was published. See ~/.config/agentathens-docker/logs" >/dev/null 2>&1 || true
            exit 13 ;;
    esac
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
        wait_for_db_writers
        backup_db
        if grep -q 'AA_DEFER_PUBLISH' "$REPO/scripts/daily-automated.sh"; then
            clear_marker
            if [ "$MARKER_SUPPORT" = "no" ]; then
                # The marker the build writes at the repo root stays on that
                # container's own tmpfs: say so rather than skip publishing silently.
                log "WARNING: scripts/daily-automated.sh has no AA_PUBLISH_MARKER support — the publish marker cannot reach the Mac, so nothing will be published"
                bash "$HERE/integrity-check.sh" notify "Freshness will not publish: scripts/daily-automated.sh lacks AA_PUBLISH_MARKER support (protected-paths PR), so the build's publish marker cannot leave its container" >/dev/null 2>&1 || true
            fi
            if grep -q 'AA_SKIP_INGEST' "$REPO/scripts/daily-automated.sh"; then
                # Email first, in a run with the mailbox password and no browser;
                # the scrape run then sees no .env at all.
                clear_lock "$REPO/.pipeline-ingest.lock"
                run_container ingest "$NAME-ingest" ingest || log "WARNING: email ingest failed; continuing with scraping"
                export AA_SKIP_INGEST=1
            else
                # Older pipeline: ingest still runs inside the scrape run, which
                # then needs .env and the IMAP relay (pipeline-mail) as well.
                SCRAPE_DOTENV=yes; SCRAPE_NET=mail
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
                clear_marker
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
            if [ -f "$PUBLISH_MARKER" ]; then
                clear_lock "$REPO/.pipeline-publish.lock"
                run_diff_gate "$NAME-diff-gate"
                run_container publish "$NAME-publish" publish
            else
                log "nothing to publish (no publish marker at $PUBLISH_MARKER)"
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
        clear_marker    # a stale marker must not outlive the build that replaces it
        run_container build "$NAME" build "$@"
        ;;
    publish)
        clear_lock "$REPO/.pipeline-publish.lock"
        run_diff_gate "$NAME-diff-gate"
        run_container publish "$NAME" publish "$@"
        ;;
    restore)
        # Only a deploy the pipeline itself recorded may be restored.
        id="${1:-}"
        printf '%s' "$id" | grep -qE '^[0-9a-f]{20,40}$' || fail "restore needs a deploy id" "docker/aa-run.sh restore <id from $DEPLOYS_LOG>" 2
        { [ -f "$DEPLOYS_LOG" ] && awk '{print $2}' "$DEPLOYS_LOG" | grep -qxF "$id"; } \
            || fail "deploy $id is not in $DEPLOYS_LOG" "only deploys the pipeline recorded can be restored" 2
        # Recorded so verify-live expects this (older) deploy, not the newest.
        run_container restore "$NAME" restore "$id" \
            && echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $id restore" >> "$DEPLOYS_LOG"
        ;;
    doctor)
        # Host-side checks (token type, off-site backup) plus the container's.
        hrc=0; bash "$HERE/doctor-checks.sh" "$ENV_FILE" "$REPO" || hrc=$?
        rc=0; run_container doctor "$NAME" doctor || rc=$?
        [ "$rc" -ne 0 ] && exit "$rc"
        exit "$hrc"
        ;;
    verify-live)
        rc=0; run_container verify-live "$NAME" verify-live || rc=$?
        [ "$rc" -eq 0 ] || { bash "$HERE/integrity-check.sh" notify "verify-live failed (exit $rc)"; exit "$rc"; }
        check_live "$STATE_DIR/state/$NAME.out"
        ;;
    daily)
        clear_lock "$REPO/.pipeline-full.lock"
        wait_for_db_writers
        backup_db
        run_container daily "$NAME" daily "$@"
        ;;
    enrichment)
        clear_lock "$REPO/.pipeline-enrichment.lock"
        [ -z "$(docker ps -q --filter 'name=^/agent-athens-daily$')" ] && clear_lock "$REPO/.auto-enrich.lock.d"
        wait_for_db_writers
        backup_db
        run_container enrichment "$NAME" enrichment "$@"
        ;;
    *)
        run_container "$JOB" "$NAME" "$JOB" "$@"
        ;;
esac
