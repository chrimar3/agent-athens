#!/bin/bash
#
# .github/scripts/test-report-check.sh — the required `ci` job cannot be forced
# green (security loop round 5).
#
# `bun test` exits with whatever status the process ends with, so one test file
# in a PR that calls process.exit(0) ends the run early with exit 0: the files
# after it never run and the check goes green. The ci job therefore runs
# `bun test --reporter=junit --reporter-outfile=<file>` and then this script,
# which refuses unless the report
#   - exists and is one complete <testsuites> document (bun writes it only at
#     the very end of a run, so an early exit leaves no report at all),
#   - names every expected test file (see --list),
#   - records 0 failures, and
#   - executed (tests - skipped) at least min_executed_tests from
#     .github/scripts/test-report-floor.json (committed; .github/** is a
#     protected path, so a PR cannot lower the floor it is judged by).
#
# Round 8: with FLOOR_REF set (ci passes the default branch), the floor file
# is read from origin/$FLOOR_REF through default-branch-file.sh, so a PR
# cannot lower the floor, exclude its own test file or drop a required one in
# the same diff even with the owner's path-guard approval; the checked-out copy
# is used only while the default branch has no floor file (logged). Unset
# (local runs), the checked-out file is used.
#
# Expected files: every *.test.ts under tests/ and src/ (outside node_modules),
# plus the floor file's also_required list (must exist), minus its exclude
# list. `--list` prints exactly that set, and ci passes the same set to
# `bun test`, so the two cannot drift apart.
#
# Limit (documented, not closed here): a test that deliberately forges a
# complete report and then exits 0 is not caught by this check; it is caught by
# review — the forging code is in the PR diff.
#
# Usage (from the repository root):
#   bash .github/scripts/test-report-check.sh --list
#   bash .github/scripts/test-report-check.sh <junit-report.xml>
# Exit: 0 = report complete and clean; 1 = refused (fails closed).
set -u

FLOOR_PATH=".github/scripts/test-report-floor.json"
FLOOR_FILE="$FLOOR_PATH"
FLOOR_REF="${FLOOR_REF:-}"

refuse() {
  echo "test-report: REFUSED — $1 (failing closed)" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || refuse "jq is not on PATH"
[ -f "$FLOOR_PATH" ] || [ -n "$FLOOR_REF" ] || refuse "$FLOOR_PATH not found — run from the repository root"

WORK="$(mktemp -d)" || refuse "could not create a temp dir"
trap 'rm -rf "$WORK"' EXIT

if [ -n "$FLOOR_REF" ]; then
  bash "$(dirname "${BASH_SOURCE[0]}")/default-branch-file.sh" "$FLOOR_REF" "$FLOOR_PATH" "$WORK/floor.json" \
    || refuse "could not read $FLOOR_PATH from the default branch $FLOOR_REF"
  FLOOR_FILE="$WORK/floor.json"
fi
jq -e '
  (.min_executed_tests | type == "number" and . > 0 and floor == .)
  and (.exclude | type == "array" and all(type == "string"))
  and (.also_required | type == "array" and all(type == "string"))
' "$FLOOR_FILE" >/dev/null 2>&1 \
  || refuse "$FLOOR_PATH must be JSON with a positive integer min_executed_tests and string lists exclude and also_required"
MIN="$(jq -r '.min_executed_tests' "$FLOOR_FILE")"

# --- the expected test files ----------------------------------------------------
jq -r '.exclude[]' "$FLOOR_FILE" > "$WORK/exclude"
jq -r '.also_required[]' "$FLOOR_FILE" > "$WORK/also"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || refuse "$FLOOR_PATH lists also_required '$f', which does not exist — fix the floor file"
done < "$WORK/also"
{
  find tests src -name '*.test.ts' -not -path '*/node_modules/*' 2>/dev/null
  cat "$WORK/also"
} | sed '/^$/d' | LC_ALL=C sort -u | grep -v -x -F -f "$WORK/exclude" > "$WORK/expected"
EXPECTED_N="$(awk 'END { print NR }' "$WORK/expected")"
[ "$EXPECTED_N" -gt 0 ] || refuse "no test files found under tests/ or src/ — run from the repository root"

if [ "${1:-}" = "--list" ]; then
  cat "$WORK/expected"
  exit 0
fi

# --- the report ---------------------------------------------------------------------
REPORT="${1:-}"
[ -n "$REPORT" ] || refuse "no report path given (usage: $0 <junit-report.xml> | --list)"
[ -s "$REPORT" ] || refuse "no JUnit report at $REPORT — bun test ended before writing it (a test calling process.exit ends the run early with no report)"

ROOTS="$(grep -c '<testsuites[ >]' "$REPORT")"
CLOSES="$(grep -c '</testsuites>' "$REPORT")"
[ "$ROOTS" = "1" ] && [ "$CLOSES" = "1" ] \
  || refuse "$REPORT is not one complete <testsuites> document ($ROOTS opening, $CLOSES closing) — truncated or tampered"

ROOT_TAG="$(grep -m1 -o '<testsuites [^>]*>' "$REPORT")"
attr() { printf '%s' "$ROOT_TAG" | sed -n "s/.* $1=\"\([0-9][0-9]*\)\".*/\1/p"; }
TESTS="$(attr tests)"
SKIPPED="$(attr skipped)"
FAILURES="$(attr failures)"
[ -n "$TESTS" ] && [ -n "$SKIPPED" ] && [ -n "$FAILURES" ] \
  || refuse "the <testsuites> element in $REPORT lacks numeric tests/skipped/failures counts"

[ "$FAILURES" -eq 0 ] || refuse "the report records $FAILURES failure(s)"

EXECUTED=$(( TESTS - SKIPPED ))
[ "$EXECUTED" -ge "$MIN" ] \
  || refuse "only $EXECUTED executed test(s) (tests $TESTS - skipped $SKIPPED), below the committed floor of $MIN in $FLOOR_PATH"

grep -o '<testsuite [^>]*>' "$REPORT" | sed -n 's/.* file="\([^"]*\)".*/\1/p' | LC_ALL=C sort -u > "$WORK/reported"
LC_ALL=C comm -23 "$WORK/expected" "$WORK/reported" > "$WORK/missing"
MISSING_N="$(awk 'END { print NR }' "$WORK/missing")"
if [ "$MISSING_N" -gt 0 ]; then
  {
    echo "test-report: REFUSED — $MISSING_N test file(s) missing from the report (they never ran, or ran no test):"
    sed 's/^/  /' "$WORK/missing" | LC_ALL=C tr -c '[:print:]\n' '?'
    echo "test-report: failing closed. A file that ended the run early (process.exit) or registers no test at all shows up here."
  } >&2
  exit 1
fi

echo "test-report: PASS — $EXPECTED_N test file(s) all reported, $EXECUTED executed test(s) (floor $MIN), 0 failures"
exit 0
