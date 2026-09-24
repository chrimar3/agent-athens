#!/bin/bash
#
# Agent Athens - Daily Automated Pipeline
# =======================================
#
# Runs via launchd at 8:00 AM Athens time.
# Full pipeline: email → parse → quality → generate → deploy
#
# NOTE: AI enrichment runs automatically via claude -p (see auto-enrich.sh).
#
# Usage:
#   ./scripts/daily-automated.sh           # Run full pipeline
#   ./scripts/daily-automated.sh --dry-run # Show what would run
#   AA_DEFER_PUBLISH=1 ./scripts/daily-automated.sh freshness
#                                          # Build + gate + artifact commit, then
#                                          # STOP before push/deploy (writes
#                                          # the publish marker, below)
#   ./scripts/daily-automated.sh publish   # Ship that deferred build: no ingest,
#                                          # scrape, enrich or generate
#   ./scripts/daily-automated.sh ingest    # ONLY email ingestion + parsing (own
#                                          # lock): the one run that needs the
#                                          # mailbox password, and no browser
#   AA_SKIP_INGEST=1 ./scripts/daily-automated.sh freshness
#                                          # scrape/build without email ingest
#                                          # (the ingest run covers it)
#   AA_SKIP_BUILD=1 ./scripts/daily-automated.sh freshness
#                                          # data phases ONLY: stop before the
#                                          # build (no dist/, no git, no deploy)
#   ./scripts/daily-automated.sh build     # ONLY build + health + scoreboard +
#                                          # deferred deploy step (gate, artifact
#                                          # commit, marker); always deferred
#
# Sealed build (security loop round 6): the scrape run loads hostile pages in
# Chromium, so it must not be the run that builds dist/ and writes the
# provenance stamp the deploy trusts. AA_SKIP_BUILD=1 ends a freshness/full run
# after its data phases (ingest unless AA_SKIP_INGEST=1, scrape, quality,
# dedup, prices, tickets, schema, geocode, enrichment phases by mode): no
# run_generate, health check, scoreboard, deploy, image cleanup, IndexNow or
# GSC, and it never writes dist/ or touches .git. `build` mode, run in a
# separate container with no browser, then runs ONLY run_generate,
# run_health_check, run_scoreboard, run_deploy (always as AA_DEFER_PUBLISH=1:
# deploy gate --local-only, pipeline-data artifact commit, publish marker) and
# run_image_cleanup. It first deletes everything inside dist/ (the directory
# itself may be a mount point), so nothing an earlier run left there can ship.
# On success it prints ONE line on stdout for the host wrapper:
#   BUILD-RESULT dist_hash=<64 lowercase hex>
# (the stamp's distHash, the same value the publish marker records).
#
# Email ingest split (security loop round 5): headless Chrome loads hostile
# pages in the scrape, so the mailbox password should not be in that run.
# `ingest` mode runs run_ingest + run_parse and nothing else (no browser, no
# build, no deploy); a freshness/full run with AA_SKIP_INGEST=1 skips those two
# phases and logs that it did. A container policy can then give the email
# credential to the ingest run alone.
#
# Exit codes: 0 success (a deferred run counts as success) · 1 failure or a
# gate refused · 3 publish mode found no deferred build to publish · 9 refused
# to run on the host (see host-guard below).
#
# Git (security loop round 3): the pipeline NEVER commits to or pushes main.
# Its allowlisted data artifacts are committed to the separate branch
# `pipeline-data` with git plumbing (temporary GIT_INDEX_FILE, hash-object,
# update-index, write-tree, commit-tree, update-ref), so HEAD, main, the real
# index and the working tree are never touched, and the only ref it pushes is
# refs/heads/pipeline-data. main needs no bypass for the pipeline token: main's
# ruleset can require a PR with no bypass actors, and the pipeline token only
# needs permission to push pipeline-data. Every deploy goes through
# scripts/deploy-gate.sh, whose origin gate requires HEAD to be origin/main or
# an ancestor of it (no local commits at all).
#
# publish mode prints ONE line on stdout after the deploy is verified
# state=ready, for the host wrapper to record as the last known-good deploy:
#   PUBLISH-RESULT deploy_id=<id> dist_hash=<64 hex> state=ready
#
# @see specs/001-data-pipeline/tasks.md (Task 6.3)
# @see docs/LAUNCHD-SETUP.md

set -o pipefail  # Catch pipe failures but don't exit on every error
# Note: set -e removed — it conflicts with per-phase error handling and
# killed the pipeline mid-email-ingestion on 2026-03-13. Every phase
# already has explicit if/else error handling.

# replace-objects:begin (security loop round 5; pinned by scripts/__tests__/deploy-gate.test.ts)
# Git must judge the real object graph. A refs/replace/* entry (writable by a
# compromised container run through .git/refs) makes every git read — rev-list,
# ls-tree, merge-base, show — substitute one object for another, while git push
# still sends the real objects. Honoured, it would let the origin gate call an
# unreviewed HEAD reviewed and the pipeline-data content gate pass a commit
# carrying code. Exported before the first git call; child processes inherit it.
export GIT_NO_REPLACE_OBJECTS=1
# replace-objects:end

# ============================================================================
# PATH Setup (for launchd which doesn't inherit user's PATH)
# ============================================================================

export PATH="/Users/chrism/.bun/bin:/Users/chrism/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
STATE_FILE="$PROJECT_DIR/data/state/pipeline-state.json"

# The ONLY ref the pipeline is ever allowed to commit to or push (the data
# artifacts' branch; never main). Guarded by the push-gate in run_deploy
# (scripts/__tests__/deploy-gate.test.ts pins both).
readonly PIPELINE_DATA_BRANCH="pipeline-data"

# Deferred publish (AA_DEFER_PUBLISH=1): the producing run leaves this marker
# (JSON: headSha, builtSha, distHash, pipelineDataSha, createdAt) for
# `publish` mode, which is the only step that needs the GitHub and Netlify
# credentials. pipelineDataSha is the pipeline-data commit to push ("" when
# there is none).
# Marker location (security loop round 7): AA_PUBLISH_MARKER overrides the
# default $PROJECT_DIR/.pipeline-publish-ready. The container wrapper no
# longer bind-mounts the repo root (/workspace is a tmpfs with per-entry
# mounts), so a file written at the repo root would not survive until the
# separate `publish` run; the wrapper points this at a path on a persistent
# mount. It must be an absolute path with no "..": the value names a file this
# script writes, renames onto and deletes. Every read, write and removal of the
# marker, and its .tmp sibling, goes through PUBLISH_MARKER. The run locks stay
# at the repo root.
PUBLISH_MARKER="${AA_PUBLISH_MARKER:-$PROJECT_DIR/.pipeline-publish-ready}"
if [[ "$PUBLISH_MARKER" != /* || "$PUBLISH_MARKER" == *..* ]]; then
    echo "daily-automated: REFUSED — AA_PUBLISH_MARKER='$PUBLISH_MARKER' must be an absolute path without '..'. Nothing ran. Next: set it to an absolute file path on a persistent mount (or unset it for the default \$PROJECT_DIR/.pipeline-publish-ready) and re-run." >&2
    exit 1
fi

# Ensure we're in project directory
cd "$PROJECT_DIR"

# Create logs directory if needed
mkdir -p "$LOG_DIR"

# Log file for today
TODAY=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/pipeline-$TODAY.log"

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

log_phase() {
    echo "" | tee -a "$LOG_FILE"
    echo "========================================" | tee -a "$LOG_FILE"
    echo "PHASE: $1" | tee -a "$LOG_FILE"
    echo "========================================" | tee -a "$LOG_FILE"
}

# ============================================================================
# Check Dependencies
# ============================================================================

check_dependencies() {
    log "Checking dependencies..."

    # Check for bun
    if ! command -v bun &> /dev/null; then
        log_error "bun is not installed"
        exit 1
    fi

    # Check for required files
    if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
        log_error "package.json not found in $PROJECT_DIR"
        exit 1
    fi

    # DB VALIDITY gate (2026-06-30), not mere existence. An auto-created empty
    # events.db passes `-f` but is tableless — that's what ran the whole pipeline
    # against a degenerate DB on 06-30. Refuse a missing/empty/tableless/corrupt DB
    # here so we abort loud BEFORE any phase. @see specs/db-availability-build-2026-06-30.md
    if ! bash "$SCRIPT_DIR/assert-events-db-healthy.sh"; then
        log_error "events.db degenerate (missing/empty/tableless/corrupt) — aborting daily. Restore from backup ($HOME/agent-athens-backups) then re-run. The deadman watchdog also breaches on this."
        exit 1
    fi

    log "Dependencies OK"
}

# ============================================================================
# Pipeline Phases
# ============================================================================

# Phase 0: Backup database (safety net — replaces git tracking, see decisions.md 2026-04-08)
run_backup_db() {
    log_phase "DATABASE BACKUP"
    log "Creating 7-day rolling backup of events.db..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: ./scripts/backup-events-db.sh"
        return 0
    fi

    if ./scripts/backup-events-db.sh >> "$LOG_FILE" 2>&1; then
        log "Database backup completed"
    else
        log_error "Database backup failed (non-fatal, continuing — check ~/agent-athens-backups/)"
    fi
}

# Phase 1: Ingest emails
run_ingest() {
    log_phase "EMAIL INGESTION"
    log "Fetching new emails from IMAP..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/ingest-emails.ts"
        return 0
    fi

    if bun run scripts/ingest-emails.ts >> "$LOG_FILE" 2>&1; then
        log "Email ingestion completed"
    else
        log_error "Email ingestion failed (non-fatal, continuing...)"
    fi
    return 0
}

# Phase 2: Parse emails
run_parse() {
    log_phase "EMAIL PARSING"
    log "Parsing emails to extract events..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/parse-newsletter-emails.ts"
        return 0
    fi

    if bun run scripts/parse-newsletter-emails.ts >> "$LOG_FILE" 2>&1; then
        log "Email parsing completed"
    else
        log_error "Email parsing failed (non-fatal, continuing...)"
    fi
    return 0
}

# Phase 2b: Web scraping
run_scrape() {
    log_phase "WEB SCRAPING"
    log "Scraping events from web sources..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/scrape-all.ts"
        return 0
    fi

    if bun run scripts/scrape-all.ts --crossref >> "$LOG_FILE" 2>&1; then
        log "Web scraping completed"
        return 0
    else
        log_error "Web scraping failed (continuing...)"
        return 0  # Non-fatal, continue pipeline
    fi
}

# Phase 2c: Scraper yield canary (issue #1). READ-ONLY look at scrape_stats:
# trips when an active source's latest events_found falls below 60% of its
# 30-day mean (latest run excluded, >= 3 prior successful days required) and
# files ONE "proposed" issue per tripped source, deduped on the
# "Yield canary: <source>" title prefix. Exit 2 = tripped, other non-zero =
# the canary itself could not run. Non-fatal by design: a thin scrape day
# must never block enrichment or deploy — the issue is the signal.
run_yield_canary() {
    log_phase "YIELD CANARY"
    log "Checking per-source scrape yield against the 30-day mean..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/yield-canary.ts"
        return 0
    fi

    local rc=0
    bun run scripts/yield-canary.ts >> "$LOG_FILE" 2>&1 || rc=$?
    if [[ "$rc" -eq 0 ]]; then
        log "Yield canary: all active sources within threshold"
    elif [[ "$rc" -eq 2 ]]; then
        log_error "Yield canary TRIPPED — see the 'Yield canary:' issue(s) and $LOG_FILE (non-fatal, continuing...)"
    else
        log_error "Yield canary could not run (exit $rc) — see $LOG_FILE (non-fatal, continuing...)"
    fi
    return 0  # Non-fatal
}

# Phase 3: Quality gates
run_quality() {
    log_phase "QUALITY GATES"
    log "Running Athens location filter..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/filter-athens-only.ts"
        return 0
    fi

    # Run location filter against whitelist/blacklist configs
    # Uses exact matching (not fuzzy LIKE) — safe for same-name-different-city venues
    if bun run scripts/filter-athens-only.ts >> "$LOG_FILE" 2>&1; then
        log "Location filter completed"
    else
        log_error "Location filter failed (continuing...)"
    fi

    # Report results
    local verified_count=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE location_status = 'verified_athens';")
    local unverified_count=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE location_status = 'unverified';")

    log "Verified Athens events: $verified_count"
    log "Unverified events: $unverified_count"

    return 0
}

# Phase 3a-i: Same-source deduplication
run_dedup_removal() {
    log_phase "DEDUP - SAME-SOURCE"
    log "Removing same-source duplicate events..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/remove-duplicates.ts"
        return 0
    fi

    if bun run scripts/remove-duplicates.ts >> "$LOG_FILE" 2>&1; then
        log "Same-source dedup completed"
        return 0
    else
        log_error "Same-source dedup failed (continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 3a-ii: Cross-source deduplication with field merging
#
# S198 (2026-07-05): swapped from merge-duplicates.ts (DELETE-based) to
# mark-duplicates.ts (reversible). Losers are marked merged_into=survivor
# instead of deleted, so a merge is undoable with one UPDATE and loser-URL
# disposition stays a GEO decision. This is now the canonical daily dedup
# path; merge-duplicates.ts / remove-duplicates.ts remain on disk but are
# disconnected from automation.
#
# No --exclude-layers here: mark-duplicates uses findDuplicateGroups (all 4
# layers incl. artist_extraction). The S197 burn-in reason for shadowing
# Layer 4 was fear of unattended DELETEs — moot under a reversible marker.
# At the current daily population, Layer 4 attributes 5 of ~27 marks (the
# bare-headliner-vs-lineup cases it was built for), zero false merges in the
# S197 self-gate. See src/quality/duplicate-detector.ts.
run_dedup_merge() {
    log_phase "DEDUP - CROSS-SOURCE MARK"
    log "Marking cross-source duplicate events (reversible)..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/mark-duplicates.ts --execute"
        return 0
    fi

    if bun run scripts/mark-duplicates.ts --execute >> "$LOG_FILE" 2>&1; then
        log "Cross-source mark completed"
    else
        log_error "Cross-source mark failed (continuing...)"
    fi

    # Phase 2B: post-save validator — URL-sibling collapse (reversible) +
    # rollover-expiry proposals for the decisions queue. Non-fatal.
    if bun run scripts/post-save-validator.ts >> "$LOG_FILE" 2>&1; then
        log "Post-save validator completed"
    else
        log_error "Post-save validator failed (non-fatal, continuing...)"
    fi
    return 0  # Non-fatal phase
}

# Phase 3b: Price acquisition
run_prices() {
    log_phase "PRICE ACQUISITION"
    log "Running price acquisition chain..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/price-acquisition-chain.ts"
        return 0
    fi

    if bun run scripts/price-acquisition-chain.ts >> "$LOG_FILE" 2>&1; then
        log "Price acquisition completed"
        return 0
    else
        log_error "Price acquisition failed (continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 3c: Ticket URL validation
run_tickets() {
    log_phase "TICKET URL VALIDATION"
    log "Validating and generating ticket URLs..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/validate-ticket-urls.ts --generate"
        return 0
    fi

    if bun run scripts/validate-ticket-urls.ts --generate >> "$LOG_FILE" 2>&1; then
        log "Ticket URL validation completed"
        return 0
    else
        log_error "Ticket validation failed (continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 3d: Schema.org generation
run_schema() {
    log_phase "SCHEMA.ORG GENERATION"
    log "Generating Schema.org JSON-LD for all events..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/generate-schema.ts"
        return 0
    fi

    if bun run scripts/generate-schema.ts >> "$LOG_FILE" 2>&1; then
        log "Schema.org generation completed"
        return 0
    else
        log_error "Schema generation failed (continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 3e: Sync enrichment queue
run_enrichment_sync() {
    log_phase "ENRICHMENT QUEUE SYNC"
    log "Syncing events to enrichment queue..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/run-enrichment-pipeline.ts --sync"
        return 0
    fi

    if bun run scripts/run-enrichment-pipeline.ts --sync >> "$LOG_FILE" 2>&1; then
        log "Enrichment queue sync completed"
        return 0
    else
        log_error "Enrichment sync failed (continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 3e-auto: Automated AI enrichment (via Claude Code CLI)
run_auto_enrichment() {
    log_phase "AI ENRICHMENT (AUTOMATED)"
    log "Running automated enrichment via Claude Code CLI..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: ./scripts/auto-enrich.sh"
        return 0
    fi

    if ./scripts/auto-enrich.sh >> "$LOG_FILE" 2>&1; then
        log "Auto-enrichment completed"
        return 0
    else
        log_error "Auto-enrichment failed (non-fatal, continuing...)"
        return 0  # Non-fatal per Article VII
    fi
}

# Phase 3f: Time data enrichment
run_time_enrichment() {
    log_phase "TIME DATA ENRICHMENT"
    log "Extracting missing event times from detail pages..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/enrich-time.ts --limit 100"
        return 0
    fi

    if bun run scripts/enrich-time.ts --limit 100 >> "$LOG_FILE" 2>&1; then
        log "Time enrichment completed"
        return 0
    else
        log_error "Time enrichment failed (non-fatal, continuing...)"
        return 0  # Non-fatal per Article VII
    fi
}

# Phase 3g: Image enrichment
run_image_enrichment() {
    log_phase "IMAGE ENRICHMENT"
    log "Extracting og:image URLs from event source pages..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/enrich-images.ts --limit 50"
        return 0
    fi

    if bun run scripts/enrich-images.ts --limit 50 >> "$LOG_FILE" 2>&1; then
        log "Image enrichment completed"
        return 0
    else
        log_error "Image enrichment failed (non-fatal, continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 3h: Download and optimize event images
run_image_download() {
    log_phase "IMAGE DOWNLOAD"
    log "Downloading and optimizing event images..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/download-images.ts"
        return 0
    fi

    if bun run scripts/download-images.ts >> "$LOG_FILE" 2>&1; then
        log "Image download completed"
        return 0
    else
        log_error "Image download failed (non-fatal, continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 3i: Clean up orphaned images
run_image_cleanup() {
    log_phase "IMAGE CLEANUP"
    log "Cleaning up orphaned event images..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/cleanup-old-images.ts"
        return 0
    fi

    if bun run scripts/cleanup-old-images.ts >> "$LOG_FILE" 2>&1; then
        log "Image cleanup completed"
        return 0
    else
        log_error "Image cleanup failed (non-fatal, continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 3j: Geocode new venues
run_geocode() {
    log_phase "VENUE GEOCODING"
    log "Geocoding new venues without coordinates..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/geocode-missing-venues.ts --confidence=high"
        return 0
    fi

    # --limit=20: cap at 20 venues per run (was unlimited, caused 12h+ runs from Nominatim
    # rate limiting at 1 req/sec). Remaining venues get picked up on the next run.
    if bun run scripts/geocode-missing-venues.ts --confidence=high --limit=20 >> "$LOG_FILE" 2>&1; then
        log "Venue geocoding completed"
    else
        log_error "Venue geocoding failed (non-fatal, continuing...)"
    fi

    # Unconditional coordinate backfill (2026-07-07). The geocoder only spawns
    # the backfill when it geocoded NEW venues (it exits early on 0 geocoded),
    # so events at already-known venues stayed geo-less forever — ~147 visible
    # events at 48 venues whose coords already sat in venues-master.json.
    # backfill-venue-geo.ts is idempotent: fills only NULL/0/sentinel rows.
    if bun run scripts/backfill-venue-geo.ts >> "$LOG_FILE" 2>&1; then
        log "Venue geo backfill completed"
    else
        log_error "Venue geo backfill failed (non-fatal, continuing...)"
    fi
    return 0  # Non-fatal phase
}

# Phase 4: Generate site
run_generate() {
    log_phase "SITE GENERATION"

    # Phase 2A: propose addresses for addressless publishable venues BEFORE
    # the build, so the F2b streetAddress gate never fires blind again (the
    # June 3-week drought class). Advisory — the gate stays the enforcer.
    if [[ "$DRY_RUN" != "true" ]]; then
        bun run scripts/venue-address-autofix.ts >> "$LOG_FILE" 2>&1 \
            || log_error "venue-address-autofix advisory failed (non-fatal, continuing...)"
        bun run scripts/decisions-queue.ts >> "$LOG_FILE" 2>&1 \
            || log_error "decisions-queue generation failed (non-fatal, continuing...)"
    fi

    log "Generating static site..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run build"
        return 0
    fi

    if bun run build >> "$LOG_FILE" 2>&1; then
        log "Site generation completed"
        return 0
    else
        log_error "Site generation failed"
        # Capture the failing error line into a structured log the deadman
        # watchdog reads (campaign Phase 5) — a deploy drought's first alert
        # then already names the failing gate instead of just "stale".
        local build_err
        build_err=$(grep -E "^error:|Error:|Build aborted|FAILED" "$LOG_FILE" | tail -1 | tr -d '\n' | cut -c1-300)
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) build-failure ${build_err:-unknown (no error line matched; see $LOG_FILE)}" \
            >> "$PROJECT_DIR/logs/build-outcome.log"
        return 1
    fi
}

# Phase 4b: Health check
run_health_check() {
    log_phase "HEALTH CHECK"
    log "Running health check and generating report..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/health-check.ts"
        return 0
    fi

    # Create health reports directory
    mkdir -p "$PROJECT_DIR/data/health-reports"

    if bun run scripts/health-check.ts >> "$LOG_FILE" 2>&1; then
        log "Health check completed"
        # Log report summary to console
        local report_date=$(date +%Y-%m-%d)
        local report_file="$PROJECT_DIR/data/health-reports/$report_date.txt"
        if [[ -f "$report_file" ]]; then
            log "Report saved to: $report_file"
        fi
        return 0
    else
        log_error "Health check failed (continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 4c: Scoreboard (Phase 8 v0). Reads the report run_health_check just
# wrote plus events.db (read-only) and writes data/scoreboard.json. Runs BEFORE
# run_deploy because that phase owns the commit+push — a step after it would
# only reach the pipeline-data branch the next day. The file rides run_deploy's
# PIPELINE_ALLOWLIST.
run_scoreboard() {
    log_phase "SCOREBOARD"
    log "Assembling data/scoreboard.json from health report + events.db..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/assemble-scoreboard.ts"
        return 0
    fi

    if bun run scripts/assemble-scoreboard.ts >> "$LOG_FILE" 2>&1; then
        log "Scoreboard written to: $PROJECT_DIR/data/scoreboard.json"
        return 0
    else
        log_error "Scoreboard assembly failed (non-fatal, continuing...)"
        return 0  # Non-fatal
    fi
}

# Phase 5: Deploy
#
# Also the body of `publish` mode (publishing=1): the deferred build is
# re-verified (marker, full deploy gate incl. the origin gate, published-
# artifact gate) and then shipped through the same push-gate / Netlify code
# below. With AA_DEFER_PUBLISH=1 a producing run stops after the artifact
# commit. Nothing here commits to, moves or pushes main.
run_deploy() {
    log_phase "DEPLOYMENT"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would deploy to Netlify"
        return 0
    fi

    local publishing=0
    local gate_args=()
    # The pipeline-data commit this run (or the deferred run) recorded; the
    # push-gate refuses to push anything else.
    local pd_expected=""
    if [[ "$PIPELINE_MODE" == "publish" ]]; then
        publishing=1
        gate_args=(--allow-descendant)
        local marker_rc=0
        check_publish_marker || marker_rc=$?
        [[ "$marker_rc" -eq 0 ]] || return "$marker_rc"
        pd_expected=$(jq -r '.pipelineDataSha // empty' "$PUBLISH_MARKER" 2>/dev/null) || pd_expected=""
    elif [[ "${AA_DEFER_PUBLISH:-}" == "1" ]]; then
        # Deferred producing run: it never deploys and holds no credentials, so
        # the gate checks its local predicate only; publish runs the full gate.
        gate_args=(--local-only)
    fi

    # Step 0: deploy gate (scripts/deploy-gate.sh). Refuses unless
    # dist/.build-provenance == HEAD, built from a clean SOURCE scope, the
    # source scope is clean NOW, the dist hash still matches, and — unless
    # this is a deferred run (local predicate only) — HEAD is reviewed code:
    # origin/main or an ancestor of it (the origin gate). Closes the 2026-07-06 23:17Z breach where a local
    # build from an uncommitted tree was auto-deployed. Guard tests:
    # scripts/__tests__/deploy-gate.test.ts.
    # publish mode passes --allow-descendant: HEAD may have been fast-forwarded
    # to newer reviewed commits since the stamped build (see deploy-gate.sh).
    if ! bash "$SCRIPT_DIR/deploy-gate.sh" ${gate_args[@]+"${gate_args[@]}"} >> "$LOG_FILE" 2>&1; then
        log_error "[deploy-gate] REFUSED — dist/ does not correspond to reviewed, committed HEAD (see log for the named condition, e.g. [origin-gate]). Nothing pushed or deployed."
        return 1
    fi
    log "[deploy-gate] PASS — dist/ corresponds to committed HEAD"

    # publish mode: dist/ was built hours earlier by another run — re-run the
    # build's published-artifact invariant over it before it can ship.
    if [[ $publishing -eq 1 ]]; then
        if ! bun run scripts/check-published-artifacts.ts dist >> "$LOG_FILE" 2>&1; then
            log_error "[publish] REFUSED — published-artifact gate failed on dist/ (see $LOG_FILE). Nothing pushed or deployed; fix the source, re-run the deferred build, then publish."
            return 1
        fi
        log "[publish] published-artifact gate PASS on dist/"
    fi

    # Step 1: artifact commit on the pipeline-data branch (dist/ is gitignored).
    #
    # Explicit allowlist (replaced a stage-everything call that caused
    # recurring WIP contamination: adbaef38e, 72ce32c73, 5d49315a1 — see
    # specs/daily-pipeline-staging-audit.md, 2026-05-04). The pipeline must
    # NEVER commit files outside this list. Most other pipeline outputs
    # (events.db, health-reports/, *.csv, *.db-wal) are gitignored.
    local PIPELINE_ALLOWLIST=(
        "data/event-set-hashes.json"
        "data/build-completeness.json"
        "data/scoreboard.json"
    )

    if [[ $publishing -eq 0 ]]; then
        log "Checking for pipeline-output changes..."
        commit_pipeline_data \
            || log_error "[staging] no artifact commit this run (non-fatal, continuing) — see the [staging] lines above"
        pd_expected=$(git rev-parse --verify -q "refs/heads/$PIPELINE_DATA_BRANCH^{commit}" 2>/dev/null) || pd_expected=""

        # Deferred publish: the local gate passed and the allowlisted artifacts
        # are committed on the pipeline-data branch; stop before anything that
        # needs the GitHub or Netlify credentials. `publish` mode re-verifies
        # and ships.
        if [[ "${AA_DEFER_PUBLISH:-}" == "1" ]]; then
            write_publish_marker "$pd_expected" || return 1
            return 0
        fi
    fi

    # Step 1b: push the pipeline-data branch (never main). A producing run
    # pushes what it just committed; publish mode pushes the commit the
    # deferred run recorded. Nothing to do when origin already has it.
    local pd_remote_sha
    pd_remote_sha=$(git rev-parse --verify -q "refs/remotes/origin/$PIPELINE_DATA_BRANCH^{commit}" 2>/dev/null) || pd_remote_sha=""
    if [[ -z "$pd_expected" ]]; then
        log "No $PIPELINE_DATA_BRANCH commit to push"
    elif [[ "$pd_expected" == "$pd_remote_sha" ]]; then
        log "$PIPELINE_DATA_BRANCH ${pd_expected:0:12} is already on origin; nothing to push"
    else
        # push-gate:begin (block extracted VERBATIM by scripts/__tests__/deploy-gate.test.ts — keep both markers)
        #
        # Push ONLY refs/heads/$PIPELINE_DATA_BRANCH, as an explicit full
        # refspec: a bare branch NAME pushes the LOCAL ref of that name even
        # when it is not what this run made (2026-07 incident: a stale local
        # production ref was pushed daily while "pushed" was logged). Compare
        # resolved SHAs: the ref we push must be the artifact commit this run
        # (or the deferred run's marker) recorded. Every commit origin does not
        # have yet must also pass the pipeline-data content gate. A SHA
        # mismatch skips the push (non-fatal, continuing to deploy); content
        # outside the allowlist is a tamper signal and stops the run before the
        # deploy.
        local pd_sha
        pd_sha=$(git rev-parse --verify -q "refs/heads/$PIPELINE_DATA_BRANCH^{commit}" 2>/dev/null) || pd_sha=""
        if [[ -z "$pd_expected" || -z "$pd_sha" || "$pd_sha" != "$pd_expected" ]]; then
            log_error "[push-gate] REFUSED — refs/heads/$PIPELINE_DATA_BRANCH (${pd_sha:-unresolvable}) != the artifact commit this run recorded (${pd_expected:-none}); pushing would ship a ref this run did not make. SKIPPING push (non-fatal, continuing to deploy) — inspect the branch and push it manually."
        elif ! check_pipeline_data_commits "$pd_sha"; then
            log_error "[push-gate] REFUSED — $PIPELINE_DATA_BRANCH carries commit(s) that are not pipeline artifact commits:$PD_GATE_BAD. Nothing pushed or deployed: treat this as tampering. Inspect refs/heads/$PIPELINE_DATA_BRANCH, reset it to origin/$PIPELINE_DATA_BRANCH (git update-ref refs/heads/$PIPELINE_DATA_BRANCH origin/$PIPELINE_DATA_BRANCH), then re-run the producing job."
            return 1
        else
            local push_timeout_file
            push_timeout_file=$(mktemp)
            if [[ -z "$push_timeout_file" ]]; then
                log_error "Git push failed — cannot create watchdog status file; skipping push (non-fatal, continuing to deploy)"
            else
                GIT_TERMINAL_PROMPT=0 git -c credential.helper='!gh auth git-credential' push origin "refs/heads/$PIPELINE_DATA_BRANCH:refs/heads/$PIPELINE_DATA_BRANCH" >> "$LOG_FILE" 2>&1 &
                local PUSH_PID=$!
                # Same AWAKE-TICK policy as deploy-watchdog: no epoch deadline
                # that could mistake a suspended laptop for a stalled push.
                ( AWAKE_TICKS=0
                  while [ "$(( AWAKE_TICKS * 15 ))" -lt "${PUSH_TIMEOUT:-120}" ]; do
                    kill -0 "$PUSH_PID" 2>/dev/null || exit 0
                    sleep 15
                    AWAKE_TICKS=$(( AWAKE_TICKS + 1 ))
                  done
                  kill -0 "$PUSH_PID" 2>/dev/null || exit 0
                  echo timeout > "$push_timeout_file"
                  kill "$PUSH_PID" 2>/dev/null
                  TERM_TICKS=0
                  while [ "$TERM_TICKS" -lt 4 ]; do
                    kill -0 "$PUSH_PID" 2>/dev/null || exit 0
                    sleep 5
                    TERM_TICKS=$(( TERM_TICKS + 1 ))
                  done
                  kill -9 "$PUSH_PID" 2>/dev/null
                ) &
                local PUSH_WATCHDOG_PID=$! push_exit=0
                wait "$PUSH_PID" || push_exit=$?
                kill "$PUSH_WATCHDOG_PID" 2>/dev/null || true
                wait "$PUSH_WATCHDOG_PID" 2>/dev/null || true
                if [[ -s "$push_timeout_file" ]]; then
                    push_exit=124
                    log_error "Git push failed — timeout after ${PUSH_TIMEOUT:-120}s of awake time (exit $push_exit; non-fatal, continuing to deploy)"
                elif [[ "$push_exit" -ne 0 ]]; then
                    log_error "Git push failed — non-interactive auth/transport failure (exit $push_exit); see git diagnostics in $LOG_FILE (non-fatal, continuing to deploy)"
                else
                    log "Pipeline outputs pushed to git ($PIPELINE_DATA_BRANCH ${pd_sha:0:12})"
                fi
                rm -f "$push_timeout_file"
            fi
        fi
        # push-gate:end
    fi

    # Step 2: Deploy dist/ via Netlify CLI + verify platform-side state.
    #
    # See .claude/notes/mistakes.md:622+ (gotcha banked 2026-05-14): CLI exit 0
    # does not imply deploy success. The CLI surfaces transport-layer success
    # (the bytes reached Netlify), not platform-layer success (the deploy was
    # accepted and published). A canceled or errored deploy produces no CLI
    # failure code — silent rollback is the failure mode. Mitigation: query
    # `netlify api getSiteDeploy` and require state="ready".
    #
    # --no-build (S142, 2026-05-18): without it the CLI runs the site's
    # configured build cmd (`bun run build` per build_settings) before
    # deploying, which fails in the launchd-spawned environment — the actual
    # recurring failure since 2026-04-10. dist/ is already built upstream.
    local MAX_POLLS=36 POLL_INTERVAL=5  # 3 min total; raise POLL count if needed
    local SITE_ID
    SITE_ID=$(jq -r .siteId "$PROJECT_DIR/.netlify/state.json" 2>/dev/null) \
        || { log_error "missing .netlify/state.json"; return 1; }

    local deploy_tmp
    deploy_tmp=$(mktemp) || { log_error "mktemp failed"; return 1; }
    # shellcheck disable=SC2064  # capture $deploy_tmp value at trap-set time
    trap "rm -f '$deploy_tmp'" RETURN

    for attempt in 1 2; do
        log "Deploying dist/ to Netlify via CLI (attempt $attempt)..."

        # Env fingerprint (2026-08-11): the Aug 6-10 outage produced exit 1
        # with empty stdout and zero captured context; version/PATH divergence
        # between interactive and launchd environments is the leading suspect
        # class (same class as the auth-precheck CLI regression, Jun 14-25).
        log "[deploy-env] netlify=$(netlify --version 2>/dev/null | head -1) node=$(node -v 2>/dev/null || echo '?') PATH=$PATH"

        # stdout -> tmpfile for jq; stderr -> $LOG_FILE for diagnostics.
        # deploy-watchdog:begin (pinned by tests/daily-pipeline-sleep-safety.test.ts)
        # AWAKE-time watchdog, deliberately NOT the S89 wall-clock pattern.
        # The kernel pauses `sleep` during system sleep, so counting ticks
        # measures time the machine was actually awake. The wall-clock form
        # (an epoch deadline) was killing a merely SUSPENDED upload at wake — 2026-09-13
        # pmset log: Deep Idle 18:06→22:12 with ~5 s maintenance wakes; the
        # "hang" kills on 09-03/04/05/13 all land on such wakes and left
        # Netlify deploys orphaned in state=uploading. A CLI hung while the
        # machine is awake still dies after DEPLOY_TIMEOUT seconds of awake time.
        netlify deploy --prod --no-build --dir=dist \
            --message "Daily deploy $(date +%Y-%m-%d)" --json \
            >"$deploy_tmp" 2>>"$LOG_FILE" &
        local NETLIFY_PID=$!
        ( AWAKE_TICKS=0
          while [ "$(( AWAKE_TICKS * 15 ))" -lt "${DEPLOY_TIMEOUT:-900}" ]; do
            kill -0 "$NETLIFY_PID" 2>/dev/null || exit 0
            sleep 15
            AWAKE_TICKS=$(( AWAKE_TICKS + 1 ))
          done
          echo "[$(date '+%Y-%m-%d %H:%M:%S')] [deploy] watchdog killed CLI after ${DEPLOY_TIMEOUT:-900}s of awake time" >> "$LOG_FILE"
          kill "$NETLIFY_PID" 2>/dev/null
          # TERM is advisory: a CLI that ignores it leaves the parent's `wait`
          # blocking forever, so the "timeout" never ends the run. Grace window
          # in awake ticks for the same reason as AWAKE_TICKS above, then KILL.
          TERM_TICKS=0
          while [ "$TERM_TICKS" -lt 4 ]; do
            kill -0 "$NETLIFY_PID" 2>/dev/null || exit 0
            sleep 5
            TERM_TICKS=$(( TERM_TICKS + 1 ))
          done
          echo "[$(date '+%Y-%m-%d %H:%M:%S')] [deploy] CLI ignored TERM for 4 awake ticks; escalating to kill -9" >> "$LOG_FILE"
          kill -9 "$NETLIFY_PID" 2>/dev/null
        ) &
        # deploy-watchdog:end
        local DEPLOY_WATCHDOG_PID=$!
        local cli_exit=0
        wait "$NETLIFY_PID" || cli_exit=$?
        kill "$DEPLOY_WATCHDOG_PID" 2>/dev/null || true
        wait "$DEPLOY_WATCHDOG_PID" 2>/dev/null || true
        cat "$deploy_tmp" >> "$LOG_FILE"

        # Netlify API responses occasionally embed ASCII control chars in
        # description fields that break strict jq parsing — strip before parse.
        local DEPLOY_ID
        DEPLOY_ID=$(tr -d '\000-\010\013\014\016-\037' <"$deploy_tmp" \
            | jq -r '.deploy_id // .id // empty' 2>/dev/null)
        # The id is interpolated into JSON for the API calls below and printed
        # in the publish result line: accept a plain token only.
        if [[ -n "$DEPLOY_ID" && ! "$DEPLOY_ID" =~ ^[0-9A-Za-z]{1,64}$ ]]; then
            log_error "[deploy] the CLI returned a deploy id that is not a plain token (cli_exit=$cli_exit); failing — check the deploy in Netlify"
            return 1
        fi

        if [ -z "$DEPLOY_ID" ]; then
            # PARSE-OR-FAIL FALLBACK (2026-05-21 follow-on to S142):
            # When the CLI errors with an HTTP error (e.g., JSONHTTPError on
            # concurrent-deploy cancellation), --json stdout is empty so
            # .deploy_id can't be parsed and the S142 retry-gate at line ~602
            # is unreachable. Recover the server-side deploy artifact by
            # matching --message title within a 10-min window, then fall
            # through to the existing state-poll + retry gate, which already
            # handles "Deploy canceled" correctly once reachable.
            # Diagnostic: specs/2026-05-20-deploy-pipeline-diagnostic.md
            log "[deploy] CLI parse failed (cli_exit=$cli_exit); querying listSiteDeploys for server-side artifact"
            local cutoff
            cutoff=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ)
            DEPLOY_ID=$(netlify api listSiteDeploys \
                --data "{\"site_id\":\"$SITE_ID\",\"per_page\":10}" 2>/dev/null \
                | tr -d '\000-\010\013\014\016-\037' \
                | jq -r --arg msg "Daily deploy $(date +%Y-%m-%d)" \
                    --arg cutoff "$cutoff" \
                    '[.[] | select(.title == $msg and .created_at > $cutoff)] | sort_by(.created_at) | last | .id // empty' 2>/dev/null)

            if [ -z "$DEPLOY_ID" ]; then
                log_error "[deploy] could not parse deploy_id AND no server-side artifact within 10-min window matching message (cli_exit=$cli_exit); failing"
                return 1
            fi
            log "[deploy] recovered DEPLOY_ID=$DEPLOY_ID via listSiteDeploys; entering state-poll"
        fi

        # Single poll loop covering all non-terminal states. Polling alone
        # does not retry; only the deploy+poll sequence retries (max 2 attempts).
        local STATE="" ERR_MSG="" resp=""
        for i in $(seq 1 "$MAX_POLLS"); do
            resp=$(netlify api getSiteDeploy \
                --data "{\"site_id\":\"$SITE_ID\",\"deploy_id\":\"$DEPLOY_ID\"}" 2>/dev/null \
                | tr -d '\000-\010\013\014\016-\037')
            STATE=$(echo "$resp" | jq -r '.state // "unknown"' 2>/dev/null)
            ERR_MSG=$(echo "$resp" | jq -r '.error_message // ""' 2>/dev/null)
            case "$STATE" in
                ready|error) break ;;
                *) sleep "$POLL_INTERVAL" ;;
            esac
        done

        # Forensic log line. Future visibility-monitor (S91 ext) parses for this.
        log "[deploy] id=$DEPLOY_ID state=$STATE error=${ERR_MSG:-none} cli_exit=$cli_exit attempt=$attempt"

        if [ "$STATE" = "ready" ]; then
            # UTC-stored for monotonic cadence math (no EET/EEST DST artifact).
            # Locale-convert at display time only. Divergence from CLAUDE.md's
            # Athens-time rule is deliberate: machine-parsed by check-deploy-cadence.ts.
            echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) deploy-success" >> logs/deploy-cadence.log
            if [[ $publishing -eq 1 ]]; then
                rm -f "$PUBLISH_MARKER"
                log "[publish] deferred build published (deploy $DEPLOY_ID); marker removed"
                print_publish_result "$DEPLOY_ID"
            fi
            return 0
        fi
        [ "$attempt" = "2" ] && { log_error "[deploy] failed after retry; state=$STATE error=$ERR_MSG"; return 1; }

        # Retry-gate (gotcha note verbatim): state=error AND msg='Deploy canceled'
        # AND zero OTHER deploys currently in any non-terminal state.
        # Count predicate, not time-compare — avoids clock-skew edge cases.
        if [ "$STATE" = "error" ] && [ "$ERR_MSG" = "Deploy canceled" ]; then
            local concurrent
            concurrent=$(netlify api listSiteDeploys \
                --data "{\"site_id\":\"$SITE_ID\",\"per_page\":10}" 2>/dev/null \
                | tr -d '\000-\010\013\014\016-\037' \
                | jq --arg id "$DEPLOY_ID" '[.[] | select(.id != $id) | select(.state == "uploading" or .state == "uploaded" or .state == "preparing" or .state == "building" or .state == "processing")] | length' 2>/dev/null)
            if [ "$concurrent" = "0" ]; then
                log "[deploy] gate passed (Deploy canceled + 0 concurrent non-terminal); retrying once"
                continue
            fi
            log_error "[deploy] gate refused retry: $concurrent concurrent non-terminal deploy(s) present. Manual: netlify deploy --prod --no-build --dir=dist"
            return 1
        fi

        log_error "[deploy] gate refused retry: state=$STATE error=$ERR_MSG"
        return 1
    done
}

# publish mode: ONE stable stdout line for the host wrapper, which records it
# as the last known-good deploy (the deadman responder restores from that
# record). Printed only when both fields are plain tokens, so no value can
# smuggle in a second line. Must not go through log(): that tees a
# timestamped copy to stdout too.
print_publish_result() {
    local id="$1" hash
    hash=$(sed -n 's/^distHash=//p' "$PROJECT_DIR/dist/.build-provenance" 2>/dev/null | head -1)
    if [[ "$id" =~ ^[0-9A-Za-z]{1,64}$ && "$hash" =~ ^[0-9a-f]{64}$ ]]; then
        printf 'PUBLISH-RESULT deploy_id=%s dist_hash=%s state=ready\n' "$id" "$hash"
        log "[publish] result line printed for the host record (deploy $id, dist ${hash:0:12})"
    else
        log_error "[publish] the deploy is live but its id or the stamp's dist hash is not a plain token; no result line printed, so the host will not record it as known-good. Check dist/.build-provenance and the deploy in Netlify."
    fi
}

# build mode (security loop round 6): empty dist/ before run_generate, so no
# file an earlier run left there (e.g. a compromised scrape run, or a stale
# OG image whose cache entry still matches) survives into the stamped build.
# dist/ may be a mount point: its CONTENTS are deleted, never the directory.
# A dist/ that is a symlink or not a directory is refused — the build would
# write through it. The cost is a cold build (OG images re-rendered).
wipe_dist_for_build() {
    local dist="$PROJECT_DIR/dist" left
    if [[ -L "$dist" ]] || { [[ -e "$dist" ]] && [[ ! -d "$dist" ]]; }; then
        log_error "[build] REFUSED — $dist is a symlink or not a directory; the build would write through it. Nothing built. Next: remove it (or fix the dist mount) and re-run build."
        return 1
    fi
    if ! mkdir -p "$dist"; then
        log_error "[build] REFUSED — cannot create $dist. Nothing built. Next: check permissions (or the dist mount) and re-run build."
        return 1
    fi
    find "$dist" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + >> "$LOG_FILE" 2>&1
    left=$(find "$dist" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)
    if [[ -n "$left" ]]; then
        log_error "[build] REFUSED — could not empty $dist (still holds ${left#"$dist"/}). Nothing built. Next: check its permissions and re-run build."
        return 1
    fi
    log "[build] dist/ emptied before the build (nothing from an earlier run can ship)"
    return 0
}

# build mode: ONE stable stdout line for the host wrapper. The hash is the
# stamp's distHash — the value write_publish_marker just recorded — and is
# printed only when the marker agrees with the stamp and it is 64 lowercase
# hex, so no value can smuggle in a second line. Not through log() (that tees a
# timestamped copy to stdout). Returns 1 when no line can be printed.
print_build_result() {
    local s_hash m_hash
    s_hash=$(sed -n 's/^distHash=//p' "$PROJECT_DIR/dist/.build-provenance" 2>/dev/null | head -1)
    m_hash=$(jq -r '.distHash // empty' "$PUBLISH_MARKER" 2>/dev/null) || m_hash=""
    if [[ "$s_hash" =~ ^[0-9a-f]{64}$ && "$s_hash" == "$m_hash" ]]; then
        printf 'BUILD-RESULT dist_hash=%s\n' "$s_hash"
        log "[build] result line printed for the host record (dist ${s_hash:0:12})"
        return 0
    fi
    log_error "[build] the stamp's distHash (${s_hash:0:12}) is not 64 lowercase hex or does not match $PUBLISH_MARKER (${m_hash:0:12}); no result line printed. Next: re-run build; if it repeats, inspect dist/.build-provenance."
    return 1
}

# Deferred publish (AA_DEFER_PUBLISH=1): record which build is waiting. Values
# come from the stamp the deploy gate just verified, HEAD (unchanged by the
# artifact commit) and the pipeline-data commit ($1, "" when there is none);
# `publish` mode refuses unless dist/ still matches them.
write_publish_marker() {
    local pd_sha="${1:-}"
    local stamp="$PROJECT_DIR/dist/.build-provenance"
    local built_sha dist_hash head_sha created
    built_sha=$(sed -n 's/^sha=//p' "$stamp" 2>/dev/null | head -1)
    dist_hash=$(sed -n 's/^distHash=//p' "$stamp" 2>/dev/null | head -1)
    head_sha=$(git rev-parse HEAD 2>/dev/null) || head_sha=""
    created=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    if ! [[ "$built_sha" =~ ^[0-9a-f]{40}$ && "$dist_hash" =~ ^[0-9a-f]{64}$ && "$head_sha" =~ ^[0-9a-f]{40}$ ]] \
        || ! [[ -z "$pd_sha" || "$pd_sha" =~ ^[0-9a-f]{40}$ ]]; then
        log_error "[publish] cannot write $PUBLISH_MARKER — stamp, HEAD or $PIPELINE_DATA_BRANCH unreadable (sha='$built_sha' distHash='$dist_hash' HEAD='$head_sha' $PIPELINE_DATA_BRANCH='$pd_sha'). Nothing pushed or deployed; rebuild and re-run."
        return 1
    fi
    if ! printf '{"headSha":"%s","builtSha":"%s","distHash":"%s","pipelineDataSha":"%s","createdAt":"%s"}\n' \
            "$head_sha" "$built_sha" "$dist_hash" "$pd_sha" "$created" > "$PUBLISH_MARKER.tmp" \
        || ! mv -f "$PUBLISH_MARKER.tmp" "$PUBLISH_MARKER"; then
        rm -f "$PUBLISH_MARKER.tmp"
        log_error "[publish] cannot write $PUBLISH_MARKER. Nothing pushed or deployed; check disk space/permissions and re-run."
        return 1
    fi
    log "[publish] DEFERRED — deploy gate (local predicate) passed and artifacts committed to $PIPELINE_DATA_BRANCH; NOT pushed, NOT deployed (AA_DEFER_PUBLISH=1)."
    log "[publish] Marker $PUBLISH_MARKER: head ${head_sha:0:9}, built ${built_sha:0:9}, dist ${dist_hash:0:12}, $PIPELINE_DATA_BRANCH ${pd_sha:0:9}. Ship it with: scripts/daily-automated.sh publish"
    return 0
}

# publish mode precondition: a deferred build is waiting AND dist/ is still
# the build that run stamped. Returns 3 when there is nothing to publish.
check_publish_marker() {
    if [[ ! -f "$PUBLISH_MARKER" ]]; then
        log_error "[publish] REFUSED — no deferred build waiting ($PUBLISH_MARKER missing). Nothing pushed or deployed. Produce one with: AA_DEFER_PUBLISH=1 scripts/daily-automated.sh freshness"
        return 3
    fi
    local stamp="$PROJECT_DIR/dist/.build-provenance"
    local m_built m_dist m_pd s_built s_dist
    m_built=$(jq -r '.builtSha // empty' "$PUBLISH_MARKER" 2>/dev/null)
    m_dist=$(jq -r '.distHash // empty' "$PUBLISH_MARKER" 2>/dev/null)
    m_pd=$(jq -r '.pipelineDataSha // empty' "$PUBLISH_MARKER" 2>/dev/null)
    s_built=$(sed -n 's/^sha=//p' "$stamp" 2>/dev/null | head -1)
    s_dist=$(sed -n 's/^distHash=//p' "$stamp" 2>/dev/null | head -1)
    if [[ -z "$m_built" || -z "$m_dist" || "$m_built" != "$s_built" || "$m_dist" != "$s_dist" ]]; then
        log_error "[publish] REFUSED — $PUBLISH_MARKER (built ${m_built:0:9}, dist ${m_dist:0:12}) does not match dist/.build-provenance (built ${s_built:0:9}, dist ${s_dist:0:12}): dist/ was rebuilt or replaced after the deferred run, or the marker is unreadable. Nothing pushed or deployed; re-run the deferred build, then publish."
        return 1
    fi
    if [[ -n "$m_pd" && ! "$m_pd" =~ ^[0-9a-f]{40}$ ]]; then
        log_error "[publish] REFUSED — $PUBLISH_MARKER has a malformed pipelineDataSha (not a 40-hex commit id). Nothing pushed or deployed; re-run the deferred build, then publish."
        return 1
    fi
    log "[publish] marker matches dist/ stamp (built ${s_built:0:9}, dist ${s_dist:0:12}, $PIPELINE_DATA_BRANCH ${m_pd:0:9})"
    return 0
}

# Artifact commit on refs/heads/$PIPELINE_DATA_BRANCH, built with git plumbing
# in a TEMPORARY index (GIT_INDEX_FILE): HEAD, main, the real index and the
# working tree are never touched, so a developer's staged work cannot leak
# into it and main never moves. Parent: the local $PIPELINE_DATA_BRANCH tip
# when it contains origin's (e.g. unpushed deferred commits), else origin's
# tip, else none (root commit). The branch holds ONLY the allowlisted files.
# Uses run_deploy's PIPELINE_ALLOWLIST. Returns 1 when no commit could be
# made (the caller treats that as non-fatal).
commit_pipeline_data() {
    local pd_ref="refs/heads/$PIPELINE_DATA_BRANCH"
    local pd_local pd_remote pd_parent="" pd_old
    pd_local=$(git rev-parse --verify -q "$pd_ref^{commit}" 2>/dev/null) || pd_local=""
    pd_remote=$(git rev-parse --verify -q "refs/remotes/origin/$PIPELINE_DATA_BRANCH^{commit}" 2>/dev/null) || pd_remote=""
    if [[ -n "$pd_local" ]] && { [[ -z "$pd_remote" ]] || git merge-base --is-ancestor "$pd_remote" "$pd_local" 2>/dev/null; }; then
        pd_parent="$pd_local"
    elif [[ -n "$pd_remote" ]]; then
        pd_parent="$pd_remote"
        [[ -n "$pd_local" ]] && log_error "[staging] local $PIPELINE_DATA_BRANCH (${pd_local:0:12}) does not contain origin/$PIPELINE_DATA_BRANCH (${pd_remote:0:12}); building on origin's tip, the local-only commits are superseded"
    fi
    pd_old="${pd_local:-0000000000000000000000000000000000000000}"

    local pd_tmp pd_index pd_blob="" pd_tree pd_bad pd_new f
    pd_tmp=$(mktemp -d 2>/dev/null) || { log_error "[staging] mktemp failed; no artifact commit"; return 1; }
    pd_index="$pd_tmp/index"
    if [[ -n "$pd_parent" ]]; then
        GIT_INDEX_FILE="$pd_index" git read-tree "$pd_parent" >> "$LOG_FILE" 2>&1
    else
        GIT_INDEX_FILE="$pd_index" git read-tree --empty >> "$LOG_FILE" 2>&1
    fi || { rm -rf "$pd_tmp"; log_error "[staging] could not seed the temporary index from ${pd_parent:-an empty tree}; no artifact commit"; return 1; }

    # staging:begin (block extracted VERBATIM by tests/daily-pipeline-staging.test.ts — keep both markers)
    # Stage per path, so one absent artefact cannot drop the others (issue #5:
    # a single multi-path call is fatal on any pathspec that matches nothing),
    # and log each failure instead of swallowing it. Regular files only: a
    # symlink would commit whatever it points at.
    for f in "${PIPELINE_ALLOWLIST[@]}"; do
        { [[ -f "$f" && ! -L "$f" ]] \
            && pd_blob=$(git hash-object -w -- "$f" 2>>"$LOG_FILE") \
            && GIT_INDEX_FILE="$pd_index" git update-index --add --cacheinfo "100644,$pd_blob,$f" >> "$LOG_FILE" 2>&1; } \
            || log_error "[staging] could not stage $f (continuing)"
    done
    # staging:end

    pd_tree=$(GIT_INDEX_FILE="$pd_index" git write-tree 2>>"$LOG_FILE") || pd_tree=""
    rm -rf "$pd_tmp"
    [[ -n "$pd_tree" ]] || { log_error "[staging] git write-tree failed; no artifact commit"; return 1; }

    # Defense in depth: the branch may only ever hold the allowlisted files
    # (a parent carrying anything else is refused, not extended).
    if ! pd_bad=$(pd_tree_only_allowlisted "$pd_tree"); then
        log_error "Pipeline staging guard tripped — $PIPELINE_DATA_BRANCH would carry non-allowlisted entries: $pd_bad. No artifact commit; inspect $pd_ref and origin/$PIPELINE_DATA_BRANCH by hand."
        return 1
    fi
    if [[ -n "$pd_parent" && "$pd_tree" == "$(git rev-parse "$pd_parent^{tree}" 2>/dev/null)" ]]; then
        log "No pipeline-output changes to commit"
        return 0
    fi

    local pd_parent_args=()
    [[ -n "$pd_parent" ]] && pd_parent_args=(-p "$pd_parent")
    pd_new=$(git commit-tree "$pd_tree" ${pd_parent_args[@]+"${pd_parent_args[@]}"} \
        -m "chore: daily pipeline update $(date +%Y-%m-%d)" 2>>"$LOG_FILE") || pd_new=""
    [[ "$pd_new" =~ ^[0-9a-f]{40}$ ]] || { log_error "[staging] git commit-tree failed; no artifact commit"; return 1; }
    if ! git update-ref -m "daily pipeline artifact commit" "$pd_ref" "$pd_new" "$pd_old" >> "$LOG_FILE" 2>&1; then
        log_error "[staging] could not move $pd_ref to ${pd_new:0:12} (did it change during the run?); no artifact commit"
        return 1
    fi
    log "Artifact commit ${pd_new:0:12} on $PIPELINE_DATA_BRANCH (HEAD, index and working tree untouched)"
    return 0
}

# pipeline-data-gate:begin (extracted VERBATIM by scripts/__tests__/deploy-gate.test.ts — keep both markers)
# Agent-instruction paths (security loop round 7): a file an agent session
# loads as instructions — CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules,
# .windsurfrules, copilot-instructions.md, anything under a .claude/ or
# .github/ directory — must never ride the pipeline-data branch, whatever
# PIPELINE_ALLOWLIST says. Checked BEFORE the allowlist, so a future glob or a
# careless entry that matches one is still refused. Case-insensitive, like
# path-guard (the owner's Mac filesystem is). Returns 0 when $1 is one.
pd_is_instruction_path() {
    local lc base
    lc=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
    base="${lc##*/}"
    case "$base" in
        claude.md|agents.md|gemini.md|.cursorrules|.windsurfrules|copilot-instructions.md) return 0 ;;
    esac
    [[ "/$lc/" == */.claude/* || "/$lc/" == */.github/* ]]
}

# Every entry of tree-ish $1 must be a regular file (mode 100644) at a
# PIPELINE_ALLOWLIST path and not an agent-instruction path. Prints the
# offending entries; returns 1 if any, or if the tree cannot be read (fail
# closed).
pd_tree_only_allowlisted() {
    local entry meta path ok allowed bad=0
    git rev-parse --verify -q "$1^{tree}" >/dev/null 2>&1 || { printf 'unreadable tree %s' "$1"; return 1; }
    while IFS= read -r -d '' entry; do
        meta="${entry%%$'\t'*}"
        path="${entry#*$'\t'}"
        ok=0
        if pd_is_instruction_path "$path"; then
            printf '%s (agent-instruction file: never allowed on %s) ' "$path" "${PIPELINE_DATA_BRANCH:-pipeline-data}"
            bad=1
            continue
        fi
        if [[ "${meta%% *}" == "100644" ]]; then
            for allowed in "${PIPELINE_ALLOWLIST[@]}"; do
                if [[ "$path" == "$allowed" ]]; then ok=1; break; fi
            done
        fi
        if [[ $ok -eq 0 ]]; then printf '%s (mode %s) ' "$path" "${meta%% *}"; bad=1; fi
    done < <(git ls-tree -r -z "$1")
    return "$bad"
}

# Every commit on the pipeline-data tip $1 that origin does not have yet must
# be a pipeline artifact commit: root or single parent, exactly the
# pipeline's message, a tree of allowlisted regular files only. Sets
# PD_GATE_BAD to the reasons; returns 1 if any commit fails.
check_pipeline_data_commits() {
    local pd_tip="$1" pd_base="refs/remotes/origin/$PIPELINE_DATA_BRANCH" pd_range pd_commits
    local c why words msg entries msg_re='^chore: daily pipeline update [0-9]{4}-[0-9]{2}-[0-9]{2}$'
    PD_GATE_BAD=""
    if git rev-parse --verify -q "$pd_base^{commit}" >/dev/null 2>&1; then
        pd_range="$pd_base..$pd_tip"
    else
        pd_range="$pd_tip"
    fi
    if ! pd_commits=$(git rev-list "$pd_range" 2>/dev/null); then
        PD_GATE_BAD=" cannot list $pd_range"
        return 1
    fi
    for c in $pd_commits; do
        why=""
        words=$(git rev-list --parents -n 1 "$c" | wc -w | tr -d ' ')
        [[ "$words" == "1" || "$words" == "2" ]] || why="$why merge commit;"
        msg=$(git log -1 --no-show-signature --format=%B "$c")
        [[ "$msg" =~ $msg_re ]] || why="$why message is not the pipeline's;"
        entries=$(pd_tree_only_allowlisted "$c") || why="$why carries $entries;"
        [[ -z "$why" ]] || PD_GATE_BAD="$PD_GATE_BAD ${c:0:12} ($why)"
    done
    [[ -z "$PD_GATE_BAD" ]]
}
# pipeline-data-gate:end

# Phase 6b: GSC sitemap submission (Phase-3 T1, 2026-07-19). Google's
# discovery of new event pages stalled (~Jul 1: 13/15 sampled event pages
# "URL unknown to Google"; sitemap-events pending since a manual 2026-05-11
# submission). IndexNow covers Bing only — Google needs the Search Console
# sitemaps API. Non-fatal like the IndexNow ping; the script itself exits 0
# on any failure so Google API downtime never blocks a deploy.
run_gsc_sitemap_submit() {
    log_phase "GSC SITEMAP SUBMIT"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/gsc-submit-sitemaps.ts"
        return 0
    fi

    if bun run scripts/gsc-submit-sitemaps.ts >> "$LOG_FILE" 2>&1; then
        log "GSC sitemap submission completed"
    else
        log_error "GSC sitemap submission failed (non-fatal, continuing...)"
    fi
    return 0
}

# Phase 6: IndexNow ping (notify search engines)
run_indexnow_ping() {
    log_phase "INDEXNOW PING"
    log "Notifying search engines about updated URLs..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/ping-indexnow.ts --dry-run"
        bun run scripts/ping-indexnow.ts --dry-run >> "$LOG_FILE" 2>&1 || true
        return 0
    fi

    if bun run scripts/ping-indexnow.ts >> "$LOG_FILE" 2>&1; then
        log "IndexNow ping completed"
        return 0
    else
        log_error "IndexNow ping failed (non-fatal, continuing...)"
        return 0  # Non-fatal
    fi
}

# ============================================================================
# Summary
# ============================================================================

print_summary() {
    log_phase "PIPELINE SUMMARY"

    # Get counts from database
    local total_events=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events;")
    local verified_events=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE location_status = 'verified_athens';")
    local upcoming_events=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE date(start_date) >= date('now');")
    local enriched_events=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE needs_enrichment = 0;")
    local with_price=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE price_amount IS NOT NULL OR price_type = 'open';")
    local with_schema=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE schema_json IS NOT NULL;")
    local with_ticket_url=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE ticket_url IS NOT NULL;")
    local with_image=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE image_url IS NOT NULL;")
    local with_local_image=$(sqlite3 "$PROJECT_DIR/data/events.db" \
        "SELECT COUNT(*) FROM events WHERE image_local IS NOT NULL;" 2>/dev/null || echo "0")

    log "Total events in database: $total_events"
    log "Verified Athens events: $verified_events"
    log "Upcoming events: $upcoming_events"
    log "Enriched events: $enriched_events"
    log "Events with price: $with_price"
    log "Events with Schema.org: $with_schema"
    log "Events with ticket URL: $with_ticket_url"
    log "Events with image: $with_image"
    log "Events with local image: $with_local_image"
    log ""
    log "Pipeline completed at $(date '+%Y-%m-%d %H:%M:%S')"
}

# ============================================================================
# Main
# ============================================================================

main() {
    # Parse arguments
    DRY_RUN="false"
    PIPELINE_MODE="full"
    for arg in "$@"; do
        case $arg in
            --dry-run)         DRY_RUN="true" ;;
            --mode=*)          PIPELINE_MODE="${arg#--mode=}" ;;
            full|freshness|enrichment|publish|ingest|build) PIPELINE_MODE="$arg" ;;
            --help|-h)         echo "Usage: [AA_DEFER_PUBLISH=1] [AA_SKIP_INGEST=1] [AA_SKIP_BUILD=1] $0 [full|freshness|enrichment|publish|ingest|build] [--dry-run]"; exit 0 ;;
            *)                 echo "Unknown arg: $arg"; echo "Usage: [AA_DEFER_PUBLISH=1] [AA_SKIP_INGEST=1] [AA_SKIP_BUILD=1] $0 [full|freshness|enrichment|publish|ingest|build] [--dry-run]"; exit 1 ;;
        esac
    done

    # host-guard:begin (pinned by tests/host-run-guard.test.ts)
    # This pipeline handles untrusted input — scraped pages, newsletters, AI
    # sessions over them — and runs inside the hardened container
    # (docker/aa-run.sh sets AA_CONTAINER=1). A run directly on the Mac, with
    # its home folder, keychain and account-wide logins, needs an explicit,
    # temporary override.
    # Round 6: the override is for a person at a terminal. launchd sets
    # XPC_SERVICE_NAME to the job label, so a com.agentathens.* job (an edited
    # legacy plist) cannot use AA_ALLOW_HOST_RUN=1 to skip the container.
    if [[ "${AA_CONTAINER:-}" != "1" && "${AA_ALLOW_HOST_RUN:-}" == "1" && "${XPC_SERVICE_NAME:-}" == com.agentathens* ]]; then
        echo "daily-automated: REFUSED — AA_ALLOW_HOST_RUN=1 is for one-off manual runs only and is ignored in a launchd job (XPC_SERVICE_NAME=${XPC_SERVICE_NAME})." >&2
        echo "daily-automated: next: schedule this job through docker/aa-run.sh (docker/README.md) and unload the legacy plist; for a one-off host run, start it from a terminal." >&2
        exit 9
    fi
    if [[ "${AA_CONTAINER:-}" != "1" && "${AA_ALLOW_HOST_RUN:-}" != "1" ]]; then
        echo "daily-automated: REFUSED — the pipeline runs inside the container, not directly on this Mac." >&2
        echo "daily-automated: next: install it (docker/README.md, ~20 min) and run 'docker/aa-run.sh ${PIPELINE_MODE}'; for a one-off host run set AA_ALLOW_HOST_RUN=1." >&2
        exit 9
    fi
    # host-guard:end

    # caffeinate:begin (pinned by tests/daily-pipeline-sleep-safety.test.ts)
    # Deploying runs take 2-4 h; on battery this laptop idle-sleeps after 1 min,
    # which suspends the run mid-upload (see deploy-watchdog note). Re-exec once
    # under `caffeinate -i` so the run holds a PreventUserIdleSystemSleep
    # assertion for its whole life. Known limit (ledger, 2026-04-08): -i does
    # NOT survive a closed lid on battery, and -s only works on AC. Enrichment
    # mode is excluded — 6 runs/day holding the assertion would drain a battery
    # for no deploy benefit. Ingest mode too: it is short and never deploys;
    # build mode likewise (security loop round 6): it never deploys either.
    if [[ "$PIPELINE_MODE" != "enrichment" && "$PIPELINE_MODE" != "ingest" && "$PIPELINE_MODE" != "build" && -z "${AA_CAFFEINATED:-}" ]] && command -v caffeinate >/dev/null 2>&1; then
        export AA_CAFFEINATED=1
        exec caffeinate -i "$0" "$@"
    fi
    # caffeinate:end

    case "$PIPELINE_MODE" in
        full|freshness|enrichment|publish|ingest|build) ;;
        *) echo "Invalid mode: $PIPELINE_MODE"; exit 1 ;;
    esac

    if [[ "$DRY_RUN" == "true" ]]; then
        log "Running in DRY RUN mode"
    fi
    log "Pipeline mode: $PIPELINE_MODE"

    # Pipeline-level lock: prevent concurrent runs of the same mode (S79)
    # Per-mode lock files allow freshness + enrichment to run simultaneously,
    # since they write different columns and don't conflict in practice.
    LOCK_FILE="$PROJECT_DIR/.pipeline-${PIPELINE_MODE}.lock"
    LOCK_MAX_AGE=25200  # 7 hours — covers worst-case cold morning run
    # lock:begin (extracted verbatim by tests/daily-pipeline-lock.test.ts)
    # Liveness is asked FIRST and age only after: this machine idle-sleeps, so a
    # run that is merely SUSPENDED can exceed LOCK_MAX_AGE of wall clock while
    # its process is alive and still deploying. Age-first force-removed that
    # lock and let a second pipeline start concurrently.
    if [[ -f "$LOCK_FILE" ]]; then
        LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
        # Portable mtime: BSD/macOS `stat -f%m`, GNU `stat -c%Y` — the ci check
        # executes this block on ubuntu (tests/daily-pipeline-lock.test.ts).
        LOCK_MTIME=$(stat -f%m "$LOCK_FILE" 2>/dev/null || stat -c%Y "$LOCK_FILE" 2>/dev/null || echo 0)
        LOCK_AGE=$(( $(date +%s) - LOCK_MTIME ))
        # A live PID is our run only if its command line is this script (launchd:
        # `/bin/bash …/daily-automated.sh <mode>`, or the same under caffeinate).
        # Liveness-first has no age escape hatch, so a PID number recycled by an
        # unrelated long-lived process must be told apart by IDENTITY — age is
        # not identity: a run suspended over a weekend is still the owner.
        LOCK_OWNER_CMD=""
        if [[ -n "$LOCK_PID" ]]; then LOCK_OWNER_CMD=$(ps -o command= -p "$LOCK_PID" 2>/dev/null || true); fi
        if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null && [[ "$LOCK_OWNER_CMD" == *daily-automated* ]]; then
            log "Pipeline $PIPELINE_MODE already running (PID=$LOCK_PID, mode may differ). Exiting cleanly."
            exit 0
        elif [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
            log_error "Pipeline $PIPELINE_MODE lock names PID=$LOCK_PID, which is alive but is not this pipeline (${LOCK_OWNER_CMD:-unknown command}) — a recycled PID. Removing."
            rm -f "$LOCK_FILE"
        elif [[ -n "$LOCK_PID" ]]; then
            log "Dead $PIPELINE_MODE lock (PID=$LOCK_PID not running). Removing."
            rm -f "$LOCK_FILE"
        else
            # No PID to interrogate (empty or unreadable lock): age is the only
            # signal left, so keep the original stale-age rule for this case.
            if [[ $LOCK_AGE -gt $LOCK_MAX_AGE ]]; then
                log "Stale $PIPELINE_MODE lock (no PID, age: ${LOCK_AGE}s > ${LOCK_MAX_AGE}s). Force-removing."
                rm -f "$LOCK_FILE"
            else
                log "Unreadable $PIPELINE_MODE lock (no PID, age: ${LOCK_AGE}s). Assuming a live run. Exiting cleanly."
                exit 0
            fi
        fi
    fi
    # lock:end
    echo $$ > "$LOCK_FILE"
    trap 'rm -f "$LOCK_FILE"' EXIT

    log "=========================================="
    log "Agent Athens - Daily Automated Pipeline"
    log "=========================================="
    log "Date: $TODAY"
    log "Project: $PROJECT_DIR"
    log ""

    # ── PUBLISH MODE: ship the build a deferred run left behind. Runs NO
    # ingest/scrape/enrich/generate and does not touch events.db; its lock is
    # .pipeline-publish.lock (per-mode lock above). run_deploy re-verifies the
    # marker, the deploy gate and the published-artifact gate first.
    if [[ "$PIPELINE_MODE" == "publish" ]]; then
        local publish_rc=0
        run_deploy || publish_rc=$?
        if [[ $publish_rc -ne 0 ]]; then
            log_error "Publish did not complete (exit $publish_rc) — see the [publish]/[deploy-gate]/[origin-gate]/[deploy] lines above"
            exit "$publish_rc"
        fi
        # Search-engine notifications belong after the pages are live.
        run_indexnow_ping
        run_gsc_sitemap_submit
        log "Publish completed successfully"
        exit 0
    fi

    # ── INGEST MODE (security loop round 5): email ingestion + parsing ONLY,
    # under its own .pipeline-ingest.lock (per-mode lock above). No scrape (no
    # browser), no build, no deploy — the run that holds the mailbox password
    # does nothing else. AA_SKIP_INGEST is ignored here: ingesting is its job.
    if [[ "$PIPELINE_MODE" == "ingest" ]]; then
        check_dependencies
        run_ingest
        run_parse
        log "Ingest completed (email ingestion + parsing only; nothing scraped, built or deployed)"
        exit 0
    fi

    # ── BUILD MODE (security loop round 6): the sealed build. Runs ONLY the
    # build and the deferred deploy step, under its own .pipeline-build.lock
    # (per-mode lock above), in a run with no browser that never saw a scraped
    # page. No backup, ingest, scrape, enrichment, IndexNow or GSC. Always
    # deferred, whatever the env says: deploy gate --local-only, artifact
    # commit on pipeline-data, publish marker; `publish` mode ships it.
    if [[ "$PIPELINE_MODE" == "build" ]]; then
        export AA_DEFER_PUBLISH=1
        check_dependencies
        if [[ "$DRY_RUN" != "true" ]]; then
            wipe_dist_for_build || exit 1
        fi
        if ! run_generate; then
            log_error "Site generation failed — build mode stops here (nothing committed, no marker)"
            exit 1
        fi
        run_health_check
        run_scoreboard
        if ! run_deploy; then
            log_error "Build did not complete — the deferred deploy step refused (see the [deploy-gate]/[publish]/[staging] lines above); no marker for publish"
            exit 1
        fi
        run_image_cleanup
        if [[ "$DRY_RUN" != "true" ]]; then
            print_build_result || exit 1
        fi
        log "Build completed (deferred: IndexNow + GSC sitemap submission run in publish mode)"
        exit 0
    fi

    # Check dependencies
    check_dependencies

    # Backup database BEFORE any phase mutates it (replaces git tracking)
    run_backup_db

    # Run pipeline phases (S79: gated by PIPELINE_MODE)
    # All phases are non-fatal except generate and deploy.
    # A failed email or scrape should never block enrichment or deployment
    # of already-good data.

    # ── FRESHNESS PHASES: data acquisition + quality (skip in enrichment mode) ──
    if [[ "$PIPELINE_MODE" != "enrichment" ]]; then
        # Data acquisition (all non-fatal)
        if [[ "${AA_SKIP_INGEST:-}" == "1" ]]; then
            log "AA_SKIP_INGEST=1: skipping email ingestion and parsing (they run in the separate 'ingest' mode, the only run that holds the mailbox password)"
        else
            run_ingest
            run_parse
        fi
        run_scrape
        run_yield_canary

        # Data quality (all non-fatal)
        run_quality
        run_dedup_removal
        run_dedup_merge
        run_prices
        run_tickets
        run_schema

        # Venue geocoding — moved here from enrichment block (S82, 2026-04-15).
        # Geocoding is venue data (Nominatim API), not AI enrichment. Keeping it
        # in the enrichment block caused 12h+ geocoding runs to hold the enrichment
        # lock, blocking ALL subsequent enrichment triggers for the day.
        run_geocode
    fi

    # ── ENRICHMENT PHASES (skip in freshness mode) ──
    if [[ "$PIPELINE_MODE" != "freshness" ]]; then
        # Enrichment (all non-fatal)
        run_enrichment_sync
        run_auto_enrichment
        run_time_enrichment
        run_image_enrichment
        run_image_download
    fi

    # ── SEALED BUILD (security loop round 6): AA_SKIP_BUILD=1 ends a
    # freshness/full run here, after the data phases. The build, health check,
    # scoreboard, deferred deploy step and image cleanup run in the separate
    # `build` mode; IndexNow + GSC in `publish`. This run writes no dist/ and
    # makes no git change. Only the exact value 1 skips.
    if [[ "${AA_SKIP_BUILD:-}" == "1" && "$PIPELINE_MODE" != "enrichment" ]]; then
        log "AA_SKIP_BUILD=1: stopping after the data phases — the build runs in the separate 'build' mode (no browser); nothing built, committed or deployed here"
        print_summary
        log "Pipeline completed successfully (data phases only)"
        exit 0
    fi

    # ── BUILD & DEPLOY (skip in enrichment mode — 22h latency by design) ──
    # Fatal — no point deploying a broken build.
    local deploy_ok=0
    if [[ "$PIPELINE_MODE" != "enrichment" ]]; then
        if run_generate; then
            run_health_check
            run_scoreboard
            if run_deploy; then
                deploy_ok=1
                run_image_cleanup
            fi
            if [[ "${AA_DEFER_PUBLISH:-}" == "1" ]]; then
                # Nothing new is live yet: `publish` mode pings after its deploy.
                log "Deferred publish: IndexNow + GSC sitemap submission run in publish mode"
            else
                # IndexNow pings URLs from the freshly-built sitemap. Those URLs are
                # already live from the last successful deploy, so a failed deploy
                # today doesn't invalidate the ping — don't gate on deploy success.
                run_indexnow_ping
                # Same rationale for the Google-side sitemap submission (Phase-3 T1).
                run_gsc_sitemap_submit
            fi
        else
            log_error "Site generation failed — skipping deploy"
        fi
    else
        # Enrichment-only mode has nothing to deploy. Mark deploy_ok=1 so the
        # exit-status check below doesn't flag the run as failed.
        deploy_ok=1
        log "Enrichment mode: skipping build + deploy (next freshness run deploys enriched content)"
    fi

    # Print summary
    print_summary

    if [[ $deploy_ok -eq 0 ]]; then
        log_error "Pipeline completed with errors"
        exit 1
    else
        log "Pipeline completed successfully"
        exit 0
    fi
}

# Run main
main "$@"
