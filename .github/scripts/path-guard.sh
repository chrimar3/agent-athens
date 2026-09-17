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
# Reads the protected globs from the BASE branch's .github/path-guard.json, never
# the PR's copy: a PR that edits the list must not be judged by its own edit.
# Makes API calls only — it never needs (and must never be given) PR code.
#
# Env: REPO (owner/name), PR (number), BASE (branch), GH_BIN (default `gh`).
# Exit: 0 = no protected path touched; 1 = touched, or refused.
set -u

GH="${GH_BIN:-gh}"
REPO="${REPO:-}"
PR="${PR:-}"
BASE="${BASE:-}"

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
case "$PR" in
  ''|*[!0-9]*) refuse "PR '$PR' is not a number" ;;
esac
command -v jq >/dev/null 2>&1 || refuse "jq is not on PATH"

WORK="$(mktemp -d)" || refuse "could not create a temp dir"
trap 'rm -rf "$WORK"' EXIT

# --- protected globs, read from BASE (never from the PR) ---------------------
if ! "$GH" api "repos/$REPO/contents/.github/path-guard.json?ref=$BASE" --jq .content \
     > "$WORK/globs.b64" 2>"$WORK/err"; then
  refuse "could not read .github/path-guard.json from $BASE: $(head -1 "$WORK/err")"
fi
base64 -d < "$WORK/globs.b64" > "$WORK/globs.json" 2>/dev/null \
  || refuse "the .github/path-guard.json payload from $BASE did not base64-decode"
jq -r '.protected[]' < "$WORK/globs.json" > "$WORK/globs.txt" 2>"$WORK/err" \
  || refuse "$BASE:.github/path-guard.json is not JSON with a .protected list"

GLOBS=()
while IFS= read -r g; do
  [ -n "$g" ] && GLOBS+=("$g")
done < "$WORK/globs.txt"
[ ${#GLOBS[@]} -gt 0 ] || refuse "the protected glob list in $BASE:.github/path-guard.json is empty"

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
HITS=()
while IFS= read -r line; do
  [ -n "$line" ] || continue
  f="$(printf '%s' "$line" | jq -r '.filename // empty' 2>/dev/null)"
  p="$(printf '%s' "$line" | jq -r '.previous_filename // empty' 2>/dev/null)"
  if [ -z "$f" ] && [ -z "$p" ]; then
    refuse "a changed-file entry for PR #$PR had no filename"
  fi
  for g in "${GLOBS[@]}"; do
    if [ -n "$f" ] && [[ "$f" == $g ]]; then
      HITS+=("\`$f\` (protected by \`$g\`)")
      break
    fi
    if [ -n "$p" ] && [[ "$p" == $g ]]; then
      HITS+=("\`$p\` → \`$f\` (renamed out of protected \`$g\`)")
      break
    fi
  done
done < "$WORK/files.jsonl"

if [ ${#HITS[@]} -eq 0 ]; then
  echo "path-guard: PASS — $N changed file(s), none protected"
  exit 0
fi

printf 'path-guard: REFUSED — %d protected path(s) touched (failing closed):\n' "${#HITS[@]}" >&2
printf '  %s\n' "${HITS[@]}" >&2

BODY="$(printf '**path-guard: this PR touches protected paths.** Propose changes to them via an issue instead of a PR.\n\n%s\nProtected globs: `.github/path-guard.json` on `%s`. Labeled `needs-input`.' \
  "$(printf -- '- %s\n' "${HITS[@]}")" "$BASE")"

"$GH" pr comment "$PR" --repo "$REPO" --body "$BODY" \
  || echo "path-guard: could not post the PR comment (the check still fails)" >&2
"$GH" pr edit "$PR" --repo "$REPO" --add-label needs-input \
  || echo "path-guard: could not add the needs-input label (the check still fails)" >&2

exit 1
