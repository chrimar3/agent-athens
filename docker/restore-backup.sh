#!/bin/bash
# Restore data/events.db from a backup made by docker/aa-run.sh.
# Runs on the Mac (bash 3.2 compatible).
#
#   docker/restore-backup.sh [--force] [--force-under-quarantine]            newest backup
#   docker/restore-backup.sh [--force] [--force-under-quarantine] FILE.db.gz a specific backup
#
# Refuses to run while $STATE_DIR/QUARANTINE exists (a run was just caught
# tampering with the repo) unless --force-under-quarantine is given; then it
# prints what the quarantine says and goes ahead.
#
# data/ is written by containers, so nothing there is trusted as a path: the
# script refuses (exit 2) if data/ is a symlink, or if data/events.db(-wal,
# -shm) or a restore candidate is a symlink or anything but a regular file (a
# planted data/events.db.restore-candidate -> ~/somewhere would otherwise make
# the Mac write the backup there). Stale regular candidates are removed; each
# candidate is written to a fresh mktemp file in data/ (created, never
# followed) and renamed into place after an lstat check.
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

FORCE=no; FORCE_QUARANTINE=no
while [ $# -gt 0 ]; do
    case "$1" in
        --force) FORCE=yes; shift ;;
        --force-under-quarantine) FORCE_QUARANTINE=yes; shift ;;
        -*) fail "unknown option $1" "usage: docker/restore-backup.sh [--force] [--force-under-quarantine] [FILE.db.gz]" ;;
        *) break ;;
    esac
done
src="${1:-}"

# A quarantine means a run was caught changing what it must not: restoring
# the database (and later building from it) is the owner's call, not a default.
if [ -f "$STATE_DIR/QUARANTINE" ]; then
    echo "restore: the pipeline is quarantined:" >&2
    sed 's/^/restore:   /' "$STATE_DIR/QUARANTINE" >&2
    [ "$FORCE_QUARANTINE" = "yes" ] \
        || fail "refusing to restore while $STATE_DIR/QUARANTINE exists" \
                "follow docs/security/incident-response.md first; if restoring this database is part of that, rerun with --force-under-quarantine"
    echo "restore: --force-under-quarantine: restoring anyway (the quarantine stays in place)" >&2
fi

# Every path this script writes, moves or reads in data/ must be what it looks
# like: data/ a real folder, each file absent or a regular file (never a
# symlink, FIFO, socket or device). -L first: -e and -f follow symlinks.
DATA="$REPO/data"
candidate="$DATA/events.db.restore-candidate"
check_paths() {
    local p
    if [ -L "$DATA" ] || [ ! -d "$DATA" ]; then
        fail "$DATA is not a plain folder (a symlink?) — writing through it could land anywhere on this Mac" \
             "inspect it (ls -l '$REPO'); see docs/security/incident-response.md"
    fi
    for p in "$DATA/events.db" "$DATA/events.db-wal" "$DATA/events.db-shm" "$candidate" "$candidate-wal" "$candidate-shm"; do
        if [ -L "$p" ] || { [ -e "$p" ] && [ ! -f "$p" ]; }; then
            fail "$p is a symlink or not a regular file — it was not made by the pipeline or this script" \
                 "inspect it (ls -l '$p'), move it out of the repo, see docs/security/incident-response.md, then retry"
        fi
    done
}
# Decompress $1 into a fresh file in data/ (mktemp creates it, exclusively),
# then rename it to $2 — after checking, right before, that $2 is still absent.
unpack_to() {  # $1 .gz source, $2 destination in data/
    local tmp
    tmp="$(mktemp "$DATA/.restore-XXXXXX")" || fail "could not create a temporary file in $DATA" "check the disk and permissions"
    if ! gunzip -c "$1" > "$tmp"; then rm -f "$tmp"; fail "could not decompress $1" "pick another backup" 1; fi
    if [ -e "$2" ] || [ -L "$2" ]; then rm -f "$tmp"; fail "$2 appeared while unpacking" "make sure no pipeline run is going (docker ps), then retry"; fi
    mv -f "$tmp" "$2"
}
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

check_paths
rm -f "$candidate" "$candidate-wal" "$candidate-shm"   # stale regular files only (checked above)
unpack_to "$src" "$candidate"
wal="${src%.db.gz}.db-wal.gz"
if [ -f "$wal" ]; then unpack_to "$wal" "$candidate-wal"; fi
echo "restore: checking $(basename "$src") …"

if [ -n "$CHECK_CMD" ]; then
    out="$($CHECK_CMD "$candidate" 2>&1)" || { rm -f "$candidate" "$candidate-wal"; fail "check failed: $out" "pick an older backup" 1; }
else
    # Under a forced quarantine, aa-run.sh runs this one shell anyway.
    qenv=""; [ "$FORCE_QUARANTINE" = "yes" ] && qenv=1
    out="$(AA_RESTORE_UNDER_QUARANTINE="$qenv" bash "$HERE/aa-run.sh" shell -c \
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

# Re-checked now: the check above ran a container that could write data/.
check_paths
mkdir -p "$STATE_DIR/replaced"
stamp="$(date +%Y%m%d-%H%M%S)"
for suffix in "" -wal -shm; do
    [ -f "$REPO/data/events.db$suffix" ] && mv "$REPO/data/events.db$suffix" "$STATE_DIR/replaced/events-$stamp.db$suffix"
done
mv "$candidate" "$REPO/data/events.db"
[ -f "$candidate-wal" ] && mv "$candidate-wal" "$REPO/data/events.db-wal"
echo "restore: restored $(basename "$src") ($rows events). Previous database kept in $STATE_DIR/replaced/events-$stamp.db"
echo "restore: next: build and review locally (docker/aa-run.sh site) before re-enabling publishing"
