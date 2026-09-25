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
# Code-owner approval (security loop round 8): a PR that touches protected
# paths PASSES when its CURRENT head commit carries an APPROVED review from a
# code owner of every protected path it touches. Without this no protected-path
# PR (Dependabot's included) could ever merge, since the ruleset allows no
# bypass. The rules:
#   - owners come from the DEFAULT branch's .github/CODEOWNERS (never the PR's
#     copy), last matching rule wins as on GitHub, matched case-insensitively
#     like the globs; only user logins count. A rule naming a team or an email
#     address, a pattern this parser does not support, or a path with no owner
#     fails closed with a message;
#   - reviews come from GET /repos/{o}/{r}/pulls/{n}/reviews; only each
#     reviewer's LATEST review counts (a later comment, change request or
#     dismissal replaces an approval), and it must be APPROVED, by a User, on
#     commit_id == the head SHA. A push of new commits therefore dismisses the
#     approval: the new head has none;
#   - the head SHA is read from the API before and after the reviews and must
#     equal the event's HEAD_SHA both times, so the files judged, the approval
#     and the commit this check reports on are one commit.
# The comment still carries no PR-controlled text: owner logins come from the
# default branch and the SHA from the API, each checked for its shape first.
#
# Env: REPO (owner/name), PR (number), BASE (the PR's base branch, for
# messages), GLOBS_REF (the default branch), HEAD_SHA (the event's PR head
# SHA; needed only when a protected path is touched), GH_BIN (default `gh`),
# and the runner's GITHUB_SERVER_URL / GITHUB_RUN_ID for the log link
# (optional).
# Exit: 0 = no protected path touched, or every one approved by a code owner
# on the current head; 1 = touched without that approval, or refused.
set -u

GH="${GH_BIN:-gh}"
REPO="${REPO:-}"
PR="${PR:-}"
BASE="${BASE:-}"
GLOBS_REF="${GLOBS_REF:-}"
HEAD_SHA="${HEAD_SHA:-}"

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
OWNED=()     # every protected name touched (both sides of a rename), for the owner lookup
shopt -s nocasematch
while IFS= read -r line; do
  [ -n "$line" ] || continue
  f="$(printf '%s' "$line" | jq -r '.filename // empty' 2>/dev/null)"
  p="$(printf '%s' "$line" | jq -r '.previous_filename // empty' 2>/dev/null)"
  if [ -z "$f" ] && [ -z "$p" ]; then
    refuse "a changed-file entry for PR #$PR had no filename"
  fi
  fg=""
  pg=""
  # The glob is deliberately unquoted on the right of == (pattern match).
  # shellcheck disable=SC2053
  for g in "${GLOBS[@]}"; do
    if [ -z "$fg" ] && [ -n "$f" ] && [[ "$f" == $g ]]; then fg="$g"; fi
    if [ -z "$pg" ] && [ -n "$p" ] && [[ "$p" == $g ]]; then pg="$g"; fi
  done
  if [ -n "$fg" ]; then
    HITS+=("$(printable "$f") (protected by $fg)")
    HIT_GLOBS+=("$fg")
    OWNED+=("$f")
    [ -n "$pg" ] && OWNED+=("$p")
  elif [ -n "$pg" ]; then
    HITS+=("$(printable "$p") -> $(printable "$f") (renamed out of protected $pg)")
    HIT_GLOBS+=("$pg")
    OWNED+=("$p")
  fi
done < "$WORK/files.jsonl"
shopt -u nocasematch

if [ ${#HITS[@]} -eq 0 ]; then
  echo "path-guard: PASS — $N changed file(s), none protected"
  exit 0
fi

# --- code-owner approval (security loop round 8) -----------------------------
# See the header. Every refusal below fails closed; none of them prints PASS.
is_login() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9-]{0,38}$ ]]; }
is_sha40() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

[ -n "$HEAD_SHA" ] || refuse "HEAD_SHA is empty — the workflow must pass github.event.pull_request.head.sha"
is_sha40 "$HEAD_SHA" || refuse "HEAD_SHA is not a 40-character lowercase hex commit SHA"

# The PR's head as the API sees it now; must be the commit this run judges.
check_head() {
  local h
  h="$("$GH" api "repos/$REPO/pulls/$PR" --jq '.head.sha' 2>"$WORK/err")" \
    || refuse "could not read the head SHA of PR #$PR: $(head -1 "$WORK/err")"
  h="$(printf '%s' "$h" | tr -d '[:space:]')"
  is_sha40 "$h" || refuse "PR #$PR reported a head SHA that is not 40 lowercase hex characters"
  [ "$h" = "$HEAD_SHA" ] \
    || refuse "PR #$PR moved to ${h:0:7} while this run judged ${HEAD_SHA:0:7}; the run for the new head decides"
}
check_head

# CODEOWNERS pattern -> anchored ERE, for the subset GitHub documents:
# a leading or inner '/' anchors at the root, a trailing '/' means everything
# below that folder, '*' and '?' stay within one path segment, '**' spans
# segments, and a pattern that names a folder also covers what is inside it.
# Anything else ('[', '!', '\', escaped spaces) returns 1 and fails closed.
co_regex() {
  local pat="$1" anchored=0 dir=0 body re="" i=0 c
  [ -n "$pat" ] || return 1
  case "$pat" in *[!A-Za-z0-9._/*?+@~-]*) return 1 ;; esac
  case "$pat" in */) dir=1 ;; esac
  body="${pat%/}"
  case "$body" in /*) anchored=1; body="${body#/}" ;; esac
  case "$body" in */*) anchored=1 ;; esac
  [ -n "$body" ] || return 1
  case "$body" in *//*) return 1 ;; esac
  while [ "$i" -lt "${#body}" ]; do
    c="${body:$i:1}"
    if [ "$c" = "*" ] && [ "${body:$((i + 1)):1}" = "*" ]; then
      if [ "${body:$((i + 2)):1}" = "/" ]; then re+="(.*/)?"; i=$((i + 3)); else re+=".*"; i=$((i + 2)); fi
      continue
    fi
    case "$c" in
      '*') re+="[^/]*" ;;
      '?') re+="[^/]" ;;
      '.'|'+') re+="\\$c" ;;
      *) re+="$c" ;;
    esac
    i=$((i + 1))
  done
  if [ "$anchored" = 1 ]; then re="^$re"; else re="^(.*/)?$re"; fi
  if [ "$dir" = 1 ]; then re+="/.*\$"; else re+="(/.*)?\$"; fi
  printf '%s' "$re"
}

# CODEOWNERS from the default branch — never the PR's copy.
if ! "$GH" api "repos/$REPO/contents/.github/CODEOWNERS?ref=$GLOBS_REF" --jq .content \
     > "$WORK/co.b64" 2>"$WORK/err"; then
  refuse "could not read .github/CODEOWNERS from $GLOBS_REF: $(head -1 "$WORK/err")"
fi
base64 -d < "$WORK/co.b64" > "$WORK/codeowners" 2>/dev/null \
  || refuse "the .github/CODEOWNERS payload from $GLOBS_REF did not base64-decode"

RULE_RES=()
RULE_OWNERS=()
RULE_LINES=()
lineno=0
while IFS= read -r raw || [ -n "$raw" ]; do
  lineno=$((lineno + 1))
  read -r -a toks <<< "${raw%$'\r'}"
  [ ${#toks[@]} -gt 0 ] || continue
  case "${toks[0]}" in '#'*) continue ;; esac
  re="$(co_regex "${toks[0]}")" \
    || refuse "$GLOBS_REF:.github/CODEOWNERS line $lineno has a pattern path-guard cannot evaluate ($(printable "${toks[0]}")) — use plain paths, '*' and '**'"
  owners=""
  for t in "${toks[@]:1}"; do
    case "$t" in '#'*) break ;; esac
    owners+="$t "
  done
  RULE_RES+=("$re")
  RULE_OWNERS+=("$owners")
  RULE_LINES+=("$lineno")
done < "$WORK/codeowners"
[ ${#RULE_RES[@]} -gt 0 ] || refuse "$GLOBS_REF:.github/CODEOWNERS has no rules"

# Owner logins (lower case, space-separated) of each protected name touched.
PATH_OWNERS=()
ALL_OWNERS=" "
shopt -s nocasematch
for x in "${OWNED[@]}"; do
  last=-1
  for i in "${!RULE_RES[@]}"; do
    [[ "$x" =~ ${RULE_RES[$i]} ]] && last="$i"
  done
  [ "$last" -ge 0 ] || refuse "no rule in $GLOBS_REF:.github/CODEOWNERS covers $(printable "$x"), so no code owner can approve it"
  ln="${RULE_LINES[$last]}"
  set -f
  # shellcheck disable=SC2206
  owner_toks=(${RULE_OWNERS[$last]})
  set +f
  [ ${#owner_toks[@]} -gt 0 ] || refuse "$GLOBS_REF:.github/CODEOWNERS line $ln names no owner for $(printable "$x")"
  logins=" "
  for o in "${owner_toks[@]}"; do
    case "$o" in
      @*/*) refuse "$GLOBS_REF:.github/CODEOWNERS line $ln names a team ($(printable "$o")); path-guard verifies user approvals only — name the owning users for protected paths" ;;
      @*) is_login "${o#@}" || refuse "$GLOBS_REF:.github/CODEOWNERS line $ln has a malformed owner ($(printable "$o"))"
          logins+="$(lower "${o#@}") " ;;
      *) refuse "$GLOBS_REF:.github/CODEOWNERS line $ln names an owner that is not a @user login ($(printable "$o")); path-guard verifies user approvals only" ;;
    esac
  done
  PATH_OWNERS+=("$logins")
  for l in $logins; do
    case "$ALL_OWNERS" in *" $l "*) ;; *) ALL_OWNERS+="$l " ;; esac
  done
done
shopt -u nocasematch

# Reviews: each reviewer's latest submitted review only.
if ! "$GH" api "repos/$REPO/pulls/$PR/reviews" --paginate \
     --jq '.[] | {id: .id, login: (.user.login // ""), type: (.user.type // ""), state: (.state // ""), commit_id: (.commit_id // "")} | @json' \
     > "$WORK/reviews.jsonl" 2>"$WORK/err"; then
  refuse "could not list the reviews of PR #$PR: $(head -1 "$WORK/err")"
fi
jq -r -s '
  map(select(.state != "PENDING" and (.id | type == "number")))
  | group_by(.login) | map(max_by(.id)) | .[]
  | select(.type == "User" and .state == "APPROVED")
  | select((.login | test("\\A[A-Za-z0-9][A-Za-z0-9-]{0,38}\\z")) and (.commit_id | test("\\A[0-9a-f]{40}\\z")))
  | "\(.login) \(.commit_id)"
' "$WORK/reviews.jsonl" > "$WORK/approvals.txt" 2>"$WORK/err" \
  || refuse "the reviews of PR #$PR were not JSON review records"
APPROVERS=" "
while read -r login sha; do
  is_login "$login" && is_sha40 "$sha" || continue
  [ "$sha" = "$HEAD_SHA" ] || continue
  APPROVERS+="$(lower "$login") "
done < "$WORK/approvals.txt"

# The head must not have moved while the reviews were read.
check_head

UNAPPROVED=0
APPROVED_BY=" "
for i in "${!PATH_OWNERS[@]}"; do
  ok=0
  for l in ${PATH_OWNERS[$i]}; do
    case "$APPROVERS" in *" $l "*)
      ok=1
      case "$APPROVED_BY" in *" $l "*) ;; *) APPROVED_BY+="$l " ;; esac ;;
    esac
  done
  [ "$ok" = 1 ] || UNAPPROVED=$((UNAPPROVED + 1))
done

if [ "$UNAPPROVED" -eq 0 ]; then
  printf 'path-guard: PASS — %d protected path(s) touched, approved by a code owner (%s) on %s:\n' \
    "${#HITS[@]}" "$(printf '@%s ' $APPROVED_BY | sed 's/ $//')" "${HEAD_SHA:0:7}"
  printf '  %s\n' "${HITS[@]}"
  exit 0
fi
echo "path-guard: no approval by a code owner on the current head ${HEAD_SHA:0:7} for $UNAPPROVED protected name(s) (an approval of an earlier commit does not count)" >&2

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

OWNER_LIST="$(printf '`@%s` ' $ALL_OWNERS | sed 's/ $//')"
BODY="$(printf '**path-guard: this PR touches %d protected path(s).** Propose changes to them via an issue instead of a PR (see CONTRIBUTING.md).\n\nMatched protected globs:\n%s\n\nThe file names are listed in %s. Protected globs: `.github/path-guard.json` on `%s`. Labeled `needs-input`.\n\nThis check passes once a code owner (%s) approves the current head `%s`; it re-runs on the review. Pushing new commits needs a new approval.' \
  "${#HITS[@]}" "$GLOB_LIST" "$LOG_REF" "$GLOBS_REF" "$OWNER_LIST" "${HEAD_SHA:0:7}")"

"$GH" pr comment "$PR" --repo "$REPO" --body "$BODY" \
  || echo "path-guard: could not post the PR comment (the check still fails)" >&2
"$GH" pr edit "$PR" --repo "$REPO" --add-label needs-input \
  || echo "path-guard: could not add the needs-input label (the check still fails)" >&2

exit 1
