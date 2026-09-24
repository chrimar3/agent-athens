#!/bin/bash
#
# path-guard.sh — the body of the required `path-guard` PR check.
#
# Lives in a script rather than inline in the workflow so tests/path-guard.test.ts
# can drive it with a fake `gh` (GH_BIN) and prove the failure paths.
#
# THE ONE INVARIANT: fail CLOSED. Every error — gh non-zero, non-JSON, an empty
# glob list, an unreadable PR, a truncated file list — must exit 1 without ever
# printing PASS. A guard that reports "clean" when the API is down is worse than
# no guard, because branch protection then goes green.
#
# Reads the protected globs from the DEFAULT branch's .github/path-guard.json
# (GLOBS_REF), never the PR's copy: a PR that edits the list must not be judged
# by its own edit. Not the PR's base either (security loop round 2): a PR opened
# against an older side branch with a shorter list is still judged by main's.
# Makes API calls only — it never needs (and must never be given) PR code.
# Globs match case-insensitively (round 5; see the match loop).
#
# The bot comment (security loop round 3) carries NO PR-controlled text: every
# changed path is attacker-chosen in a fork PR, and a name holding a backtick
# breaks out of a markdown code span, so the project's bot would post the
# attacker's link or @mention. The comment gives the number of protected paths
# touched, the matched globs (read from the default branch, so not PR-controlled)
# and a link to this job's log. The names go to the log only, with every
# non-printable character replaced so a name holding a newline cannot start a
# `::workflow-command::` line.
#
# Env: REPO (owner/name), PR (number), BASE (the PR's base branch, for
# messages), GLOBS_REF (the default branch), GH_BIN (default `gh`), and the
# runner's GITHUB_SERVER_URL / GITHUB_RUN_ID for the log link (optional).
# Exit: 0 = no protected path touched; 1 = touched, or refused.
set -u

GH="${GH_BIN:-gh}"
REPO="${REPO:-}"
PR="${PR:-}"
BASE="${BASE:-}"
GLOBS_REF="${GLOBS_REF:-}"

# The GitHub files API stops at 3000 entries per PR with no error and no marker,
# so beyond that the list is silently incomplete and cannot clear a PR.
FILES_API_CAP=3000

refuse() {
  echo "path-guard: REFUSED — $1 (failing closed)" >&2
  exit 1
}

[ -n "$REPO" ] || refuse "REPO is empty — the workflow must pass github.repository"
[ -n "$PR" ]   || refuse "PR is empty — the workflow must pass the pull request number"
[ -n "$BASE" ] || refuse "BASE is empty — the workflow must pass the base branch"
[ -n "$GLOBS_REF" ] || refuse "GLOBS_REF is empty — the workflow must pass github.event.repository.default_branch"
case "$PR" in
  ''|*[!0-9]*) refuse "PR '$PR' is not a number" ;;
esac
command -v jq >/dev/null 2>&1 || refuse "jq is not on PATH"

WORK="$(mktemp -d)" || refuse "could not create a temp dir"
trap 'rm -rf "$WORK"' EXIT

# --- protected globs, read from the default branch (never from the PR) -------
if ! "$GH" api "repos/$REPO/contents/.github/path-guard.json?ref=$GLOBS_REF" --jq .content \
     > "$WORK/globs.b64" 2>"$WORK/err"; then
  refuse "could not read .github/path-guard.json from $GLOBS_REF: $(head -1 "$WORK/err")"
fi
base64 -d < "$WORK/globs.b64" > "$WORK/globs.json" 2>/dev/null \
  || refuse "the .github/path-guard.json payload from $GLOBS_REF did not base64-decode"
jq -r '.protected[]' < "$WORK/globs.json" > "$WORK/globs.txt" 2>"$WORK/err" \
  || refuse "$GLOBS_REF:.github/path-guard.json is not JSON with a .protected list"

GLOBS=()
while IFS= read -r g; do
  [ -n "$g" ] && GLOBS+=("$g")
done < "$WORK/globs.txt"
[ ${#GLOBS[@]} -gt 0 ] || refuse "the protected glob list in $GLOBS_REF:.github/path-guard.json is empty"

# --- how many files GitHub says changed --------------------------------------
if ! "$GH" api "repos/$REPO/pulls/$PR" --jq '.changed_files' > "$WORK/count" 2>"$WORK/err"; then
  refuse "could not read PR #$PR metadata: $(head -1 "$WORK/err")"
fi
CHANGED="$(tr -d '[:space:]' < "$WORK/count")"
case "$CHANGED" in
  ''|*[!0-9]*) refuse "PR #$PR reported a non-numeric changed_files ('$CHANGED')" ;;
esac
[ "$CHANGED" -le "$FILES_API_CAP" ] \
  || refuse "PR #$PR changed $CHANGED files, over the files API cap of $FILES_API_CAP — the list would be truncated"

# --- the changed files -------------------------------------------------------
# One compact JSON record per line: @json keeps a name containing a newline (or
# any other whitespace) on its own single line, so line-splitting is safe.
if ! "$GH" api "repos/$REPO/pulls/$PR/files" --paginate \
     --jq '.[] | {filename: .filename, previous_filename: .previous_filename} | @json' \
     > "$WORK/files.jsonl" 2>"$WORK/err"; then
  refuse "could not list the files changed in PR #$PR: $(head -1 "$WORK/err")"
fi
N="$(awk 'END { print NR }' "$WORK/files.jsonl")"
[ "$N" -eq "$CHANGED" ] \
  || refuse "the files API returned $N file(s) but PR #$PR reports $CHANGED changed file(s) — an incomplete list cannot clear a PR"

# --- match ---------------------------------------------------------------
# A rename is two paths: .filename (where it landed) and .previous_filename
# (where it came from). Checking only .filename lets a PR move a protected file
# OUT of its protected directory unnoticed, so both sides count as a touch.
# For the log only: non-printable characters (a newline above all) become '?'.
printable() { printf '%s' "$1" | LC_ALL=C tr -c '[:print:]' '?'; }

# Case-insensitive (security loop round 5): the owner's Mac uses a
# case-insensitive filesystem (APFS default), where `.Claude/settings.json` IS
# .claude/settings.json and `SCRIPTS/hooks/x` lands in scripts/hooks/. So a
# glob matches whatever the case of the path. nocasematch is switched on for
# this loop only and off again right after it.
HITS=()      # log lines (contain PR-controlled names — never put in the comment)
HIT_GLOBS=() # the glob each hit matched (default-branch content)
shopt -s nocasematch
while IFS= read -r line; do
  [ -n "$line" ] || continue
  f="$(printf '%s' "$line" | jq -r '.filename // empty' 2>/dev/null)"
  p="$(printf '%s' "$line" | jq -r '.previous_filename // empty' 2>/dev/null)"
  if [ -z "$f" ] && [ -z "$p" ]; then
    refuse "a changed-file entry for PR #$PR had no filename"
  fi
  # The glob is deliberately unquoted on the right of == (pattern match).
  # shellcheck disable=SC2053
  for g in "${GLOBS[@]}"; do
    if [ -n "$f" ] && [[ "$f" == $g ]]; then
      HITS+=("$(printable "$f") (protected by $g)")
      HIT_GLOBS+=("$g")
      break
    fi
    if [ -n "$p" ] && [[ "$p" == $g ]]; then
      HITS+=("$(printable "$p") -> $(printable "$f") (renamed out of protected $g)")
      HIT_GLOBS+=("$g")
      break
    fi
  done
done < "$WORK/files.jsonl"
shopt -u nocasematch

if [ ${#HITS[@]} -eq 0 ]; then
  echo "path-guard: PASS — $N changed file(s), none protected"
  exit 0
fi

printf 'path-guard: REFUSED — %d protected path(s) touched (failing closed):\n' "${#HITS[@]}" >&2
printf '  %s\n' "${HITS[@]}" >&2

# Each matched glob once, in first-hit order; backticks stripped so even a
# default-branch glob cannot close its code span.
GLOB_LINES=""
for g in "${HIT_GLOBS[@]}"; do
  case "$GLOB_LINES" in *"|$g|"*) continue ;; esac
  GLOB_LINES="$GLOB_LINES|$g|"
done
GLOB_LIST="$(printf '%s' "$GLOB_LINES" | tr -s '|' '\n' | sed '/^$/d' | tr -d '`' | sed 's/.*/- `&`/')"

RUN_ID="${GITHUB_RUN_ID:-}"
case "$RUN_ID" in
  ''|*[!0-9]*) LOG_REF="the path-guard job log" ;;
  *) LOG_REF="the [path-guard job log](${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/$RUN_ID)" ;;
esac

BODY="$(printf '**path-guard: this PR touches %d protected path(s).** Propose changes to them via an issue instead of a PR (see CONTRIBUTING.md).\n\nMatched protected globs:\n%s\n\nThe file names are listed in %s. Protected globs: `.github/path-guard.json` on `%s`. Labeled `needs-input`.' \
  "${#HITS[@]}" "$GLOB_LIST" "$LOG_REF" "$GLOBS_REF")"

"$GH" pr comment "$PR" --repo "$REPO" --body "$BODY" \
  || echo "path-guard: could not post the PR comment (the check still fails)" >&2
"$GH" pr edit "$PR" --repo "$REPO" --add-label needs-input \
  || echo "path-guard: could not add the needs-input label (the check still fails)" >&2

exit 1
