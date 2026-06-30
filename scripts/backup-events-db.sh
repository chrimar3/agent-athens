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

# Integrity-floor knobs (2026-06-30 incident hardening):
#   MIN_SIZE_RATIO  — refuse a new backup smaller than prior_good × this ratio
#                     (catches truncation that still passes integrity_check).
#                     0 disables the size comparison.
#   MIN_VALID_BYTES — any backup .gz below this is a DUD (e.g. the 114B gzip of an
#                     empty DB) — pruned regardless of age, never a retained day.
BACKUP_MIN_SIZE_RATIO="${BACKUP_MIN_SIZE_RATIO:-0.5}"
BACKUP_MIN_VALID_BYTES="${BACKUP_MIN_VALID_BYTES:-100000}"

# Resolve project root from script location (works regardless of cwd)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# SOURCE_DB overridable for tests; defaults to the live DB in production.
SOURCE_DB="${SOURCE_DB:-$PROJECT_DIR/data/events.db}"

# Portable file size in bytes (BSD/macOS `stat -f%z`, GNU `stat -c%s`).
file_size() { stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo 0; }

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
# Integrity floor — NEVER overwrite a known-good backup with a degenerate source
# ----------------------------------------------------------------------------
# (2026-06-30 incident: an empty events.db was backed up over the day's slot as a
#  114B dud. Refuse loud here so the prior good backup survives.) Runs on the
#  SOURCE before any filesystem write — a failed floor leaves all backups intact.

ROW_COUNT=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM events;" 2>/dev/null)
if ! [[ "$ROW_COUNT" =~ ^[0-9]+$ ]] || [[ "$ROW_COUNT" -eq 0 ]]; then
    echo "[backup-events-db] REFUSED: source has no readable events rows (count='${ROW_COUNT:-<error>}') — degenerate/empty DB, keeping prior backups untouched: $SOURCE_DB" >&2
    exit 1
fi

INTEGRITY=$(sqlite3 "$SOURCE_DB" "PRAGMA integrity_check;" 2>/dev/null | head -1)
if [[ "$INTEGRITY" != "ok" ]]; then
    echo "[backup-events-db] REFUSED: integrity_check='${INTEGRITY:-<error>}' (expected 'ok') — corrupt source, keeping prior backups untouched: $SOURCE_DB" >&2
    exit 1
fi

# ----------------------------------------------------------------------------
# Take the backup (to a temp slot first; only commit after the size floor)
# ----------------------------------------------------------------------------

TMP_DB="$BACKUP_DIR/.events-$TODAY.db.tmp"
rm -f "$TMP_DB" "$TMP_DB.gz"

START_TIME=$(date +%s)

if ! sqlite3 "$SOURCE_DB" "VACUUM INTO '$TMP_DB'" 2>&1; then
    echo "[backup-events-db] ERROR: VACUUM INTO failed for $SOURCE_DB" >&2
    rm -f "$TMP_DB"
    exit 1
fi

if ! gzip -f "$TMP_DB"; then
    echo "[backup-events-db] ERROR: gzip failed on $TMP_DB" >&2
    rm -f "$TMP_DB" "$TMP_DB.gz"
    exit 1
fi

# Size floor: refuse if the new backup is anomalously smaller than the most recent
# prior good backup (truncation that still passes integrity_check). Ratio 0 = off.
NEW_SIZE=$(file_size "$TMP_DB.gz")
PRIOR_GZ=$(ls -t "$BACKUP_DIR"/events-*.db.gz 2>/dev/null | grep -v "/events-$TODAY\.db\.gz$" | head -1)
if [[ "$BACKUP_MIN_SIZE_RATIO" != "0" && -n "$PRIOR_GZ" && -f "$PRIOR_GZ" ]]; then
    PRIOR_SIZE=$(file_size "$PRIOR_GZ")
    if [[ "$PRIOR_SIZE" -gt 0 ]] && awk "BEGIN{exit !($NEW_SIZE < $PRIOR_SIZE * $BACKUP_MIN_SIZE_RATIO)}"; then
        echo "[backup-events-db] REFUSED: new backup ${NEW_SIZE}B < ${BACKUP_MIN_SIZE_RATIO}× prior ${PRIOR_SIZE}B ($(basename "$PRIOR_GZ")) — suspected truncation, keeping prior: $SOURCE_DB" >&2
        rm -f "$TMP_DB.gz"
        exit 1
    fi
fi

# Commit: atomically replace today's slot with the validated backup.
rm -f "$BACKUP_FILE" "$BACKUP_FILE.gz"
mv "$TMP_DB.gz" "$BACKUP_FILE.gz"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
SIZE=$(ls -lh "$BACKUP_FILE.gz" 2>/dev/null | awk '{print $5}')
echo "[backup-events-db] Created $BACKUP_FILE.gz ($SIZE, ${ROW_COUNT} rows, integrity ok) in ${ELAPSED}s"

# ----------------------------------------------------------------------------
# Prune old backups
# ----------------------------------------------------------------------------

# (1) Purge DUDS first — any backup below the valid-size floor (e.g. the 114B gzip
# of an empty DB). Deleted regardless of age so a dud never counts as a retained
# day or masks the loss. This is the half of the 06-30 fix the integrity floor
# can't cover: cleaning up duds that already exist on disk.
DUD_FILES=$(find "$BACKUP_DIR" -name 'events-*.db.gz' -size -"${BACKUP_MIN_VALID_BYTES}"c 2>/dev/null)
if [[ -n "$DUD_FILES" ]]; then
    DUD_COUNT=$(echo "$DUD_FILES" | wc -l | tr -d ' ')
    echo "$DUD_FILES" | xargs rm -f
    echo "[backup-events-db] Pruned $DUD_COUNT dud backup(s) (< ${BACKUP_MIN_VALID_BYTES}B, any age)" >&2
fi

# (2) Then prune GOOD backups older than retention by mtime (matches MORE THAN
# N*24h ago). Duds are already gone, so they can't displace a good backup.
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
