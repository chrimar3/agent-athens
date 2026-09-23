#!/bin/bash
# Restore data/events.db from a backup made by docker/aa-run.sh.
# Runs on the Mac (bash 3.2 compatible).
#
#   docker/restore-backup.sh                 newest backup
#   docker/restore-backup.sh FILE.db.gz      a specific backup
#
# The candidate is decompressed next to the live database and checked inside
# the container (integrity_check + a non-empty events table), so the Mac never
# parses it. Only then is the live file moved aside (kept, not deleted) and
# the candidate put in its place. Exit 0 restored; 1 check failed (nothing
# changed); 2 usage/precondition.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${AA_RESTORE_REPO:-$(cd "$HERE/.." && pwd)}"      # override for tests only
BACKUPS_DIR="${AA_BACKUPS_DIR:-$HOME/agent-athens-backups}"
STATE_DIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}"
# Command that checks a candidate path; default runs sqlite3 in the container.
CHECK_CMD="${AA_RESTORE_CHECK:-}"

fail() { echo "restore: $1" >&2; echo "restore: next: $2" >&2; exit "${3:-2}"; }

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
        'sqlite3 -readonly /workspace/data/events.db.restore-candidate "PRAGMA integrity_check; SELECT COUNT(*) FROM events;"' 2>&1)" \
        || { rm -f "$candidate" "$candidate-wal"; fail "check failed: $out" "pick an older backup" 1; }
fi
result="$(printf '%s\n' "$out" | grep -Ev 'aa-run:|integrity-check:|Container|Network' | tr -d '\r')"
first="$(printf '%s\n' "$result" | grep -m1 . || true)"
rows="$(printf '%s\n' "$result" | grep -E '^[0-9]+$' | tail -1 || true)"
if [ "$first" != "ok" ] || [ -z "$rows" ] || [ "$rows" -eq 0 ]; then
    rm -f "$candidate" "$candidate-wal"
    fail "backup failed its check (integrity: ${first:-none}, events: ${rows:-none})" "pick an older backup" 1
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
