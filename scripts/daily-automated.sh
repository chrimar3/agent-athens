#!/bin/bash
#
# Agent Athens - Daily Automated Pipeline
# =======================================
#
# Runs via launchd at 8:00 AM Athens time.
# Full pipeline: email → parse → quality → generate → deploy
#
# NOTE: AI enrichment is NOT included (requires Claude Code session).
#
# Usage:
#   ./scripts/daily-automated.sh           # Run full pipeline
#   ./scripts/daily-automated.sh --dry-run # Show what would run
#
# @see specs/001-data-pipeline/tasks.md (Task 6.3)
# @see docs/LAUNCHD-SETUP.md

set -e  # Exit on error

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

    if [[ ! -f "$PROJECT_DIR/data/events.db" ]]; then
        log_error "Database not found at $PROJECT_DIR/data/events.db"
        exit 1
    fi

    log "Dependencies OK"
}

# ============================================================================
# Pipeline Phases
# ============================================================================

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
        return 0
    else
        log_error "Email ingestion failed"
        return 1
    fi
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
        return 0
    else
        log_error "Email parsing failed"
        return 1
    fi
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
run_dedup_merge() {
    log_phase "DEDUP - CROSS-SOURCE MERGE"
    log "Merging cross-source duplicate events..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would run: bun run scripts/merge-duplicates.ts --execute --min-confidence 0.75 (lowered from 0.9 to catch token-overlap pairs)"
        return 0
    fi

    if bun run scripts/merge-duplicates.ts --execute --min-confidence 0.75 >> "$LOG_FILE" 2>&1; then
        log "Cross-source merge completed"
        return 0
    else
        log_error "Cross-source merge failed (continuing...)"
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

    # Step 1: Commit and push source code (dist/ is gitignored)
    log "Checking for source code changes..."
    if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
        git add -A
        git commit -m "chore: daily pipeline update $(date +%Y-%m-%d)" || true
        if git push origin main >> "$LOG_FILE" 2>&1; then
            log "Source code pushed to git"
        else
            log_error "Git push failed (non-fatal, continuing to deploy)"
        fi
    else
        log "No source code changes to commit"
    fi

    # Step 2: Deploy dist/ via Netlify CLI
    log "Deploying dist/ to Netlify via CLI..."
    if netlify deploy --prod --dir=dist --message "Daily deploy $(date +%Y-%m-%d)" >> "$LOG_FILE" 2>&1; then
        log "Netlify CLI deploy completed"
        return 0
    else
        log_error "Netlify CLI deploy failed"
        return 1
    fi
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
    for arg in "$@"; do
        case $arg in
            --dry-run)
                DRY_RUN="true"
                log "Running in DRY RUN mode"
                ;;
        esac
    done

    log "=========================================="
    log "Agent Athens - Daily Automated Pipeline"
    log "=========================================="
    log "Date: $TODAY"
    log "Project: $PROJECT_DIR"
    log ""

    # Check dependencies
    check_dependencies

    # Run pipeline phases
    local failed=0

    run_ingest || failed=1

    if [[ $failed -eq 0 ]]; then
        run_parse || failed=1
    fi

    # Web scraping (non-fatal)
    run_scrape

    if [[ $failed -eq 0 ]]; then
        run_quality || failed=1
    fi

    # Deduplication — same-source (non-fatal)
    run_dedup_removal

    # Deduplication — cross-source merge (non-fatal)
    run_dedup_merge

    # Price acquisition (non-fatal)
    run_prices

    # Ticket URL validation (non-fatal)
    run_tickets

    # Schema.org generation (non-fatal)
    run_schema

    # Enrichment queue sync (non-fatal)
    run_enrichment_sync

    # Time data enrichment (non-fatal)
    run_time_enrichment

    # Image enrichment (non-fatal)
    run_image_enrichment

    # Image download and optimization (non-fatal)
    run_image_download

    if [[ $failed -eq 0 ]]; then
        run_generate || failed=1
    fi

    # Health check (non-fatal)
    run_health_check

    if [[ $failed -eq 0 ]]; then
        run_deploy || failed=1
    fi

    # Image cleanup (non-fatal, after deploy)
    run_image_cleanup

    # IndexNow ping (only after successful deploy)
    if [[ $failed -eq 0 ]]; then
        run_indexnow_ping
    fi

    # Print summary
    print_summary

    if [[ $failed -eq 1 ]]; then
        log_error "Pipeline completed with errors"
        exit 1
    else
        log "Pipeline completed successfully"
        exit 0
    fi
}

# Run main
main "$@"
