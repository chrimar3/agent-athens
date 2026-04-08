#!/bin/bash
# scripts/backup-events-db.sh
# ============================================================================
# 7-day rolling backup of data/events.db
# ============================================================================
#
# Replaces git-tracking of events.db (removed 2026-04-08 to fix 40-min push).
# Designed to run as the FIRST phase of daily-automated.sh, before any
# pipeline step mutates the database.
#
# Method:
#   - SQLite `VACUUM INTO` produces a clean, defragmented copy that's safe
#     even if the source DB has an open WAL. Strictly safer than `cp`.
#   - gzip compression (~36MB → ~6MB observed for this DB).
#   - Date-suffixed filenames (events-YYYY-MM-DD.db.gz), sortable + greppable.
#   - Pruning by mtime: anything older than RETENTION_DAYS is deleted.
#
# Backup location:
#   Default: $HOME/agent-athens-backups/
#   Override: set BACKUP_DIR env var
#   Rationale: outside the project dir so backups survive `rm -rf project/`
#
# Failure mode:
#   Non-fatal — logs error to stderr, exits non-zero, but daily-automated.sh
#   treats this as "continue with warning" (matches non-fatal phase pattern).
#
# @see .claude/notes/decisions.md (Runtime Artifacts Removed From Git)
# @see scripts/daily-automated.sh:run_backup_db
# ============================================================================

set -uo pipefail

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------

BACKUP_DIR="${BACKUP_DIR:-$HOME/agent-athens-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

# Resolve project root from script location (works regardless of cwd)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DB="$PROJECT_DIR/data/events.db"

TODAY=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/events-$TODAY.db"

# ----------------------------------------------------------------------------
# Pre-flight checks
# ----------------------------------------------------------------------------

if [[ ! -f "$SOURCE_DB" ]]; then
    echo "[backup-events-db] ERROR: Source DB not found: $SOURCE_DB" >&2
    exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "[backup-events-db] ERROR: sqlite3 not in PATH" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR" || {
    echo "[backup-events-db] ERROR: Could not create $BACKUP_DIR" >&2
    exit 1
}

# ----------------------------------------------------------------------------
# Take the backup
# ----------------------------------------------------------------------------

# If today's backup already exists (e.g., script ran twice in one day), keep
# the newer one — VACUUM INTO will fail if target exists, so remove first.
if [[ -f "$BACKUP_FILE" ]]; then
    rm -f "$BACKUP_FILE"
fi
if [[ -f "$BACKUP_FILE.gz" ]]; then
    rm -f "$BACKUP_FILE.gz"
fi

START_TIME=$(date +%s)

if ! sqlite3 "$SOURCE_DB" "VACUUM INTO '$BACKUP_FILE'" 2>&1; then
    echo "[backup-events-db] ERROR: VACUUM INTO failed for $SOURCE_DB" >&2
    rm -f "$BACKUP_FILE"  # cleanup partial file if any
    exit 1
fi

if ! gzip -f "$BACKUP_FILE"; then
    echo "[backup-events-db] ERROR: gzip failed on $BACKUP_FILE" >&2
    rm -f "$BACKUP_FILE" "$BACKUP_FILE.gz"
    exit 1
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
SIZE=$(ls -lh "$BACKUP_FILE.gz" 2>/dev/null | awk '{print $5}')
echo "[backup-events-db] Created $BACKUP_FILE.gz ($SIZE) in ${ELAPSED}s"

# ----------------------------------------------------------------------------
# Prune old backups
# ----------------------------------------------------------------------------

# find -mtime +N matches files modified MORE THAN N*24 hours ago
DELETED_FILES=$(find "$BACKUP_DIR" -name 'events-*.db.gz' -mtime +"$RETENTION_DAYS" 2>/dev/null)
if [[ -n "$DELETED_FILES" ]]; then
    DELETED_COUNT=$(echo "$DELETED_FILES" | wc -l | tr -d ' ')
    echo "$DELETED_FILES" | xargs rm -f
    echo "[backup-events-db] Pruned $DELETED_COUNT backup(s) older than $RETENTION_DAYS days"
fi

# ----------------------------------------------------------------------------
# Report current backup state
# ----------------------------------------------------------------------------

CURRENT_COUNT=$(find "$BACKUP_DIR" -name 'events-*.db.gz' 2>/dev/null | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | awk '{print $1}')
echo "[backup-events-db] $CURRENT_COUNT backup(s) in $BACKUP_DIR (total: $TOTAL_SIZE)"
