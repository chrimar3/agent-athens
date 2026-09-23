#!/bin/bash
# Restore data/events.db from a backup made by docker/aa-run.sh.
# Runs on the Mac (bash 3.2 compatible).
#
#   docker/restore-backup.sh [--force]                 newest backup
#   docker/restore-backup.sh [--force] FILE.db.gz      a specific backup
#
# Checks, in order: the file's SHA-256 against SHA256SUMS (written when the
# backup was taken); then, inside the container so the Mac never parses it,
# integrity_check, a non-empty events table, and that it holds at least 70% as
# many events as the live database (a large drop suggests the backup was
# poisoned or truncated; --force overrides only this last check). Only then is
# the live file moved aside (kept) and the candidate put in its place.
# Exit 0 restored; 1 a check failed (nothing changed); 2 usage/precondition.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${AA_RESTORE_REPO:-$(cd "$HERE/.." && pwd)}"      # override for tests only
BACKUPS_DIR="${AA_BACKUPS_DIR:-$HOME/agent-athens-backups}"
STATE_DIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}"
# Command that checks a candidate path; default runs sqlite3 in the container.
CHECK_CMD="${AA_RESTORE_CHECK:-}"

fail() { echo "restore: $1" >&2; echo "restore: next: $2" >&2; exit "${3:-2}"; }

FORCE=no
if [ "${1:-}" = "--force" ]; then FORCE=yes; shift; fi
src="${1:-}"
if [ -z "$src" ]; then
    src="$(ls -1t "$BACKUPS_DIR"/events-*.db.gz 2>/dev/null | head -1 || true)"
    [ -n "$src" ] || fail "no backups in $BACKUPS_DIR" "pass a backup file explicitly"
fi
[ -f "$src" ] || fail "backup $src not found" "list them with: ls -lt $BACKUPS_DIR"
if [ -z "${AA_RESTORE_CHECK:-}" ] && command -v docker >/dev/null 2>&1 \
   && [ -n "$(docker ps -q --filter name=agent-athens- 2>/dev/null)" ]; then
    fail "a pipeline container is running" "wait for it to finish (docker ps), then retry"
fi

# Checksum recorded at backup time (older backups may predate SHA256SUMS).
sums="$(dirname "$src")/SHA256SUMS"
if [ -f "$sums" ] && grep -q " $(basename "$src")\$" "$sums"; then
    (cd "$(dirname "$src")" && grep " $(basename "$src")\$" SHA256SUMS | tail -1 | shasum -a 256 -c - >/dev/null 2>&1) \
        || fail "$(basename "$src") does not match its recorded SHA-256 — it changed after the backup was taken" "treat it as tampered; pick another backup" 1
else
    echo "restore: no recorded checksum for $(basename "$src") (older backup) — continuing with the content checks"
fi

candidate="$REPO/data/events.db.restore-candidate"
rm -f "$candidate"
gunzip -c "$src" > "$candidate"
wal="${src%.db.gz}.db-wal.gz"
[ -f "$wal" ] && gunzip -c "$wal" > "$candidate-wal"
echo "restore: checking $(basename "$src") …"

if [ -n "$CHECK_CMD" ]; then
    out="$($CHECK_CMD "$candidate" 2>&1)" || { rm -f "$candidate" "$candidate-wal"; fail "check failed: $out" "pick an older backup" 1; }
else
    out="$(bash "$HERE/aa-run.sh" shell -c \
        'sqlite3 -readonly /workspace/data/events.db.restore-candidate "PRAGMA integrity_check; SELECT COUNT(*) FROM events;"; echo "CURRENT=$(sqlite3 -readonly /workspace/data/events.db "SELECT COUNT(*) FROM events;" 2>/dev/null || echo 0)"' 2>&1)" \
        || { rm -f "$candidate" "$candidate-wal"; fail "check failed: $out" "pick an older backup" 1; }
fi
result="$(printf '%s\n' "$out" | grep -Ev 'aa-run:|integrity-check:|Container|Network' | tr -d '\r')"
first="$(printf '%s\n' "$result" | grep -m1 . || true)"
rows="$(printf '%s\n' "$result" | grep -E '^[0-9]+$' | tail -1 || true)"
current="$(printf '%s\n' "$result" | sed -n 's/^CURRENT=\([0-9][0-9]*\)$/\1/p' | tail -1)"
if [ "$first" != "ok" ] || [ -z "$rows" ] || [ "$rows" -eq 0 ]; then
    rm -f "$candidate" "$candidate-wal"
    fail "backup failed its check (integrity: ${first:-none}, events: ${rows:-none})" "pick an older backup" 1
fi
if [ -n "$current" ] && [ "$current" -gt 0 ] && [ $((rows * 10)) -lt $((current * 7)) ] && [ "$FORCE" = "no" ]; then
    rm -f "$candidate" "$candidate-wal"
    fail "backup has $rows events, under 70% of the live database's $current" "check why, then rerun with --force if it is really the one you want" 1
fi

mkdir -p "$STATE_DIR/replaced"
stamp="$(date +%Y%m%d-%H%M%S)"
for suffix in "" -wal -shm; do
    [ -f "$REPO/data/events.db$suffix" ] && mv "$REPO/data/events.db$suffix" "$STATE_DIR/replaced/events-$stamp.db$suffix"
done
mv "$candidate" "$REPO/data/events.db"
[ -f "$candidate-wal" ] && mv "$candidate-wal" "$REPO/data/events.db-wal"
echo "restore: restored $(basename "$src") ($rows events). Previous database kept in $STATE_DIR/replaced/events-$stamp.db"
echo "restore: next: build and review locally (docker/aa-run.sh site) before re-enabling publishing"
