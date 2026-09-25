#!/bin/bash
#
# scripts/run-tests.sh — `bun run test`: the test suite run from an explicit
# file list (security loop round 9).
#
# A plain `bun test` discovers every *.test.ts / *_test.ts / *.spec.ts /
# *_spec.ts under the working directory and runs it on the Mac — including
# files planted in the folders the container writes (data/, logs/, dist/,
# tmp/, tmp*/, temp*/). This runner never lets bun discover anything: it
# passes the exact list `.github/scripts/test-report-check.sh --list` prints
# (every *.test.ts under tests/ and src/, plus the floor file's also_required,
# minus its exclude — the same set the required ci job runs) as ./paths, so
# bun runs those files and nothing else.
#
# Before that it refuses when a test-named file sits in one of those folders:
# nothing in the project puts one there, so it is a sign the container (or
# something in it) was used to plant code for the Mac to run. Inspect it,
# delete it, then run again.
#
# Usage (any directory): bun run test [bun test flags, e.g. --bail]
#   Positional filters are not supported: to run one file use
#   `bun test ./tests/<file>.test.ts`.
# Exit: bun test's status; 1 = refused (planted file, empty or unsafe list).
# Bash 3.2 compatible (macOS /bin/bash): no mapfile.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

refuse() {
  echo "run-tests: REFUSED — $1" >&2
  exit 1
}

# The folders the container can write, at the repository root.
WRITABLE=()
for d in data logs dist tmp tmp* temp*; do
  [ -d "$d" ] && WRITABLE+=("$d")
done

# Test-named files (any loader extension bun discovers) in those folders.
# find -H follows only the top-level folder itself (data/ may be a link on the
# Mac), never a link planted inside, so a planted link cannot send it walking.
if [ "${#WRITABLE[@]}" -gt 0 ]; then
  PLANTED="$( { find -H "${WRITABLE[@]}" \( -name node_modules -prune \) -o \
    \( -iname '*.test.[cm][jt]s' -o -iname '*.test.[jt]s' -o -iname '*.test.[jt]sx' \
       -o -iname '*_test.[cm][jt]s' -o -iname '*_test.[jt]s' -o -iname '*_test.[jt]sx' \
       -o -iname '*.spec.[cm][jt]s' -o -iname '*.spec.[jt]s' -o -iname '*.spec.[jt]sx' \
       -o -iname '*_spec.[cm][jt]s' -o -iname '*_spec.[jt]s' -o -iname '*_spec.[jt]sx' \) \
    -print 2>/dev/null || true; } | LC_ALL=C sort -u)"
  if [ -n "$PLANTED" ]; then
    {
      echo "run-tests: REFUSED — test files found in container-writable folders (bun would run them on this machine):"
      printf '%s\n' "$PLANTED" | head -n 20 | LC_ALL=C tr -cd '[:print:]\n' | cut -c1-200 | sed 's/^/  /'
      echo "Nothing in the project writes test files there: inspect them as a possible compromise, delete them, then run 'bun run test' again."
    } >&2
    exit 1
  fi
fi

LIST="$(bash .github/scripts/test-report-check.sh --list)" \
  || refuse "could not build the test list (.github/scripts/test-report-check.sh --list failed; is jq installed?)"

FILES=()
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    /*|../*|*/../*|data/*|logs/*|dist/*|tmp*|temp*)
      refuse "the test list names '$f', outside the repository's test folders — check .github/scripts/test-report-floor.json" ;;
  esac
  FILES+=("./$f")
done <<EOF
$LIST
EOF

# An empty list would make `bun test` discover (and run) everything.
[ "${#FILES[@]}" -gt 0 ] || refuse "the test list is empty — run from a full checkout"

echo "run-tests: running ${#FILES[@]} test files from the explicit list" >&2
exec bun test "$@" "${FILES[@]}"
