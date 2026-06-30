#!/bin/bash
# scripts/assert-events-db-healthy.sh
# ============================================================================
# Degenerate-DB gate — the wrapper-side half of the 2026-06-30 hardening family.
# ============================================================================
#
# On 2026-06-30 daily-automated.sh checked only `[[ -f events.db ]]`, so an
# auto-created empty 114B file passed as "Dependencies OK" and the whole pipeline
# ran against a tableless DB, dying mid-generation. This gate replaces the
# existence check with a VALIDITY check, run before any pipeline phase.
#
# Canonical predicate (kept consistent across the family — Guard 6):
#   events table readable  AND  COUNT(*) > 0  AND  PRAGMA integrity_check = 'ok'
# This intentionally mirrors scripts/backup-events-db.sh:87-97 verbatim (the
# sibling shell copy). Convergence into one shared shell snippet is deferred —
# the backup script is shipped + tested, not refactored this session.
#
# Usage:   bash scripts/assert-events-db-healthy.sh
#   exit 0 → DB healthy; non-zero + loud stderr → degenerate (caller should abort).
#   SOURCE_DB env overrides the target (for tests); defaults to the live DB.
#
# @see specs/db-availability-build-2026-06-30.md
# @see scripts/assert-events-db-healthy.test.ts
# ============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DB="${SOURCE_DB:-$PROJECT_DIR/data/events.db}"

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "[assert-db-healthy] ERROR: sqlite3 not in PATH" >&2
    exit 1
fi

if [[ ! -f "$SOURCE_DB" ]]; then
    echo "[assert-db-healthy] REFUSED: events.db missing at $SOURCE_DB — degenerate DB. Restore from backup ($HOME/agent-athens-backups) then retry." >&2
    exit 1
fi

# Row floor — a non-integer count (sqlite3 errored, e.g. "no such table") or 0 rows
# is degenerate. `2>/dev/null` makes a tableless DB yield an empty string → regex fails.
ROW_COUNT=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM events;" 2>/dev/null)
if ! [[ "$ROW_COUNT" =~ ^[0-9]+$ ]] || [[ "$ROW_COUNT" -eq 0 ]]; then
    echo "[assert-db-healthy] REFUSED: events table empty/unreadable (count='${ROW_COUNT:-<error>}') — degenerate DB at $SOURCE_DB. Restore from backup then retry." >&2
    exit 1
fi

# Integrity floor — catches corruption a row count can't.
INTEGRITY=$(sqlite3 "$SOURCE_DB" "PRAGMA integrity_check;" 2>/dev/null | head -1)
if [[ "$INTEGRITY" != "ok" ]]; then
    echo "[assert-db-healthy] REFUSED: integrity_check='${INTEGRITY:-<error>}' (expected 'ok') — corrupt DB at $SOURCE_DB. Restore from backup then retry." >&2
    exit 1
fi

echo "[assert-db-healthy] OK: $ROW_COUNT rows, integrity ok ($SOURCE_DB)"
exit 0
