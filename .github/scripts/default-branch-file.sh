#!/bin/bash
#
# default-branch-file.sh — copy a CI config file as it is on the DEFAULT
# branch, not as the change under test has it (security loop round 8).
#
# The ci and dependency-audit jobs judge a PR with committed limits: the test
# floor (.github/scripts/test-report-floor.json: minimum test count, excluded
# and required files) and the advisory ignore list (.github/audit-ignore.json).
# Read from the checkout, a PR could relax them in the same diff it is judged
# by. So, like secret-scan.sh with its gitleaks config, they are read from
# origin/<default branch>. Only when the default branch does not have the file
# yet (the PR that first adds it) is the checked-out copy used, and that is
# logged.
#
# Usage (from the checkout root): default-branch-file.sh <branch> <path> <out>
# Fails CLOSED (exit 1, nothing written): a malformed branch or path, a default
# branch that is neither in the checkout nor fetchable, or a file that is on
# neither side. Tested by tests/security/default-branch-config.test.ts.
set -u

REF="${1:-}"
FILE="${2:-}"
OUT="${3:-}"

refuse() {
  echo "default-branch-file: REFUSED — $1 (failing closed)" >&2
  exit 1
}

[ -n "$REF" ] && [ -n "$FILE" ] && [ -n "$OUT" ] || refuse "usage: $0 <default-branch> <repo-relative-path> <out-file>"
case "$REF" in -*|*..*|*[!A-Za-z0-9._/-]*) refuse "'$REF' is not a plain branch name" ;; esac
case "$FILE" in /*|*..*|-*) refuse "'$FILE' is not a plain repository-relative path" ;; esac

# Judge the real object graph (a refs/replace entry must not swap the file).
export GIT_NO_REPLACE_OBJECTS=1
TRACKING="refs/remotes/origin/$REF"
if ! git rev-parse --verify --quiet "$TRACKING^{commit}" >/dev/null 2>&1; then
  GIT_TERMINAL_PROMPT=0 git fetch --no-tags --quiet --depth=1 origin "+refs/heads/$REF:$TRACKING" 2>/dev/null \
    || refuse "origin/$REF is not in the checkout and could not be fetched, so $FILE cannot be read from the default branch"
fi

if git cat-file -e "$TRACKING:$FILE" 2>/dev/null; then
  git show "$TRACKING:$FILE" > "$OUT" 2>/dev/null || refuse "could not read $FILE at origin/$REF"
  echo "default-branch-file: $FILE from origin/$REF" >&2
else
  [ -f "$FILE" ] && [ ! -L "$FILE" ] || refuse "$FILE is neither on origin/$REF nor a regular file in the checkout"
  cat "$FILE" > "$OUT" || refuse "could not copy the checked-out $FILE"
  echo "default-branch-file: $FILE is not on origin/$REF yet (first introduction) — using the checked-out copy" >&2
fi
exit 0
