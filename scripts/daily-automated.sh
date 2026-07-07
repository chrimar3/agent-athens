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
#
# @see specs/001-data-pipeline/tasks.md (Task 6.3)
# @see docs/LAUNCHD-SETUP.md

set -o pipefail  # Catch pipe failures but don't exit on every error
# Note: set -e removed — it conflicts with per-phase error handling and
# killed the pipeline mid-email-ingestion on 2026-03-13. Every phase
# already has explicit if/else error handling.

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
        return 0
    else
        log_error "Cross-source mark failed (continuing...)"
        return 0  # Non-fatal
    fi
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

# Phase 5: Deploy
run_deploy() {
    log_phase "DEPLOYMENT"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would deploy to Netlify"
        return 0
    fi

    # Step 0: Clean-tree deploy gate (Option 3 Phase 1, 2026-07-07). Refuses
    # unless dist/.build-provenance == HEAD, built from a clean SOURCE scope,
    # and the source scope is clean NOW. Runs BEFORE the Step-1 artifact
    # commit so strict sha equality holds (the build upstream stamped the
    # same HEAD this gate sees). Closes the 2026-07-06 23:17Z breach where a
    # local build from an uncommitted tree was auto-deployed. Guard tests:
    # scripts/__tests__/deploy-gate.test.ts.
    if ! bash "$SCRIPT_DIR/deploy-gate.sh" >> "$LOG_FILE" 2>&1; then
        log_error "[deploy-gate] REFUSED — dist/ does not correspond to committed HEAD (see log for the named condition). Skipping deploy."
        return 1
    fi
    log "[deploy-gate] PASS — dist/ corresponds to committed HEAD"

    # Step 1: Commit and push pipeline outputs (dist/ is gitignored)
    #
    # Explicit-allowlist staging (replaces prior `git add -A`). Pipeline must
    # NEVER commit files outside this list, regardless of working-tree state.
    # See specs/daily-pipeline-staging-audit.md (2026-05-04) — `git add -A`
    # caused recurring WIP contamination (e.g. adbaef38e, 72ce32c73, 5d49315a1).
    # Most other pipeline outputs (events.db, health-reports/, *.csv, *.db-wal)
    # are gitignored — only these two artefacts survive to a commit.
    local PIPELINE_ALLOWLIST=(
        "data/event-set-hashes.json"
        "data/build-completeness.json"
    )

    log "Checking for pipeline-output changes..."
    git add -- "${PIPELINE_ALLOWLIST[@]}"

    # Defense-in-depth guard: if anything outside the allow-list ended up in
    # the index (e.g. developer had work pre-staged when pipeline fired), abort
    # and reset rather than commit unintended files.
    local UNEXPECTED=""
    while IFS= read -r staged; do
        local is_allowed=0
        for allowed in "${PIPELINE_ALLOWLIST[@]}"; do
            if [[ "$staged" == "$allowed" ]]; then
                is_allowed=1
                break
            fi
        done
        if [[ $is_allowed -eq 0 ]]; then
            UNEXPECTED="$UNEXPECTED $staged"
        fi
    done < <(git diff --cached --name-only)

    if [[ -n "$UNEXPECTED" ]]; then
        log_error "Pipeline staging guard tripped — unexpected staged files:$UNEXPECTED"
        log_error "Aborting commit to prevent WIP contamination. Resetting index."
        git reset HEAD -- >> "$LOG_FILE" 2>&1 || true
    elif git diff --cached --quiet; then
        log "No pipeline-output changes to commit"
    else
        git commit -m "chore: daily pipeline update $(date +%Y-%m-%d)" || true
        if git push origin main >> "$LOG_FILE" 2>&1; then
            log "Pipeline outputs pushed to git"
        else
            log_error "Git push failed (non-fatal, continuing to deploy)"
        fi
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

        # stdout -> tmpfile for jq; stderr -> $LOG_FILE for diagnostics.
        netlify deploy --prod --no-build --dir=dist \
            --message "Daily deploy $(date +%Y-%m-%d)" --json \
            >"$deploy_tmp" 2>>"$LOG_FILE"
        local cli_exit=$?
        cat "$deploy_tmp" >> "$LOG_FILE"

        # Netlify API responses occasionally embed ASCII control chars in
        # description fields that break strict jq parsing — strip before parse.
        local DEPLOY_ID
        DEPLOY_ID=$(tr -d '\000-\010\013\014\016-\037' <"$deploy_tmp" \
            | jq -r '.deploy_id // .id // empty' 2>/dev/null)

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
            full|freshness|enrichment) PIPELINE_MODE="$arg" ;;
            --help|-h)         echo "Usage: $0 [full|freshness|enrichment] [--dry-run]"; exit 0 ;;
            *)                 echo "Unknown arg: $arg"; echo "Usage: $0 [full|freshness|enrichment] [--dry-run]"; exit 1 ;;
        esac
    done

    case "$PIPELINE_MODE" in
        full|freshness|enrichment) ;;
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
    if [[ -f "$LOCK_FILE" ]]; then
        LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
        LOCK_AGE=$(( $(date +%s) - $(stat -f%m "$LOCK_FILE" 2>/dev/null || echo 0) ))
        if [[ $LOCK_AGE -gt $LOCK_MAX_AGE ]]; then
            log "Stale $PIPELINE_MODE lock (age: ${LOCK_AGE}s > ${LOCK_MAX_AGE}s). Force-removing."
            rm -f "$LOCK_FILE"
        elif [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
            log "Pipeline $PIPELINE_MODE already running (PID=$LOCK_PID, mode may differ). Exiting cleanly."
            exit 0
        else
            log "Dead $PIPELINE_MODE lock (PID=$LOCK_PID not running). Removing."
            rm -f "$LOCK_FILE"
        fi
    fi
    echo $$ > "$LOCK_FILE"
    trap 'rm -f "$LOCK_FILE"' EXIT

    log "=========================================="
    log "Agent Athens - Daily Automated Pipeline"
    log "=========================================="
    log "Date: $TODAY"
    log "Project: $PROJECT_DIR"
    log ""

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
        run_ingest
        run_parse
        run_scrape

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

    # ── BUILD & DEPLOY (skip in enrichment mode — 22h latency by design) ──
    # Fatal — no point deploying a broken build.
    local deploy_ok=0
    if [[ "$PIPELINE_MODE" != "enrichment" ]]; then
        if run_generate; then
            run_health_check
            if run_deploy; then
                deploy_ok=1
                run_image_cleanup
            fi
            # IndexNow pings URLs from the freshly-built sitemap. Those URLs are
            # already live from the last successful deploy, so a failed deploy
            # today doesn't invalidate the ping — don't gate on deploy success.
            run_indexnow_ping
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
