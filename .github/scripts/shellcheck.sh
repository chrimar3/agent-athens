#!/bin/bash
#
# .github/scripts/shellcheck.sh — the body of the `shellcheck` CI job (security loop round 3).
#
# Most of the pipeline's gates are bash, so a quoting or exit-code regression in
# them is a gate regression. This runs ShellCheck at severity `warning` over
# scripts/*.sh, docker/*.sh and .github/scripts/*.sh (docker/ may be absent).
#
# Findings that predate this gate in files owned by other work are excused per
# FILE and per CODE in .github/shellcheck-excludes.json:
#   { "files": { "scripts/x.sh": { "codes": ["SC2155"], "reason": "...",
#                                  "may_be_absent": false } } }
# The same code in another file, or a new code in the same file, still fails.
# Every entry needs a real reason (>= 20 characters), well-formed codes, and a
# file inside the scanned globs that exists (unless may_be_absent, for files
# listed ahead of a branch merge) — so stale or blanket entries cannot pile up.
#
# `--norc`: ShellCheck would otherwise read a .shellcheckrc from the repo, and a
# PR could add one that disables every check. Inline `# shellcheck disable=`
# directives stay possible; they show up in the diff the reviewer reads.
#
# Fails CLOSED: a missing binary, an unreadable exclusions file, no files found
# or a ShellCheck error (exit >= 2) exits 1 without printing PASS.
#
# Env: SHELLCHECK_BIN (default `shellcheck`), SHELLCHECK_EXCLUDES (default
# .github/shellcheck-excludes.json). Run from the repository root.
# Exit: 0 = clean; 1 = findings, or refused.
set -u

SC="${SHELLCHECK_BIN:-shellcheck}"
EXCLUDES="${SHELLCHECK_EXCLUDES:-.github/shellcheck-excludes.json}"

refuse() {
  echo "shellcheck: REFUSED — $1 (failing closed)" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || refuse "jq is not on PATH"
command -v "$SC" >/dev/null 2>&1 || refuse "ShellCheck binary '$SC' not found — set SHELLCHECK_BIN"
[ -f "$EXCLUDES" ] || refuse "$EXCLUDES not found — run from the repository root"
jq -e '.files | type == "object"' "$EXCLUDES" >/dev/null 2>&1 \
  || refuse "$EXCLUDES is not JSON with a .files object"

shopt -s nullglob
FILES=(scripts/*.sh docker/*.sh .github/scripts/*.sh)
shopt -u nullglob
[ ${#FILES[@]} -gt 0 ] || refuse "no shell scripts found under scripts/, docker/ or .github/scripts/ — run from the repository root"

# --- validate the exclusions --------------------------------------------------
PROBLEMS=()
while IFS=$'\t' read -r f codes_ok reason_ok absent_ok; do
  case "$f" in
    scripts/*/*|docker/*/*|.github/scripts/*/*) PROBLEMS+=("$f: not inside a scanned glob") ; continue ;;
    scripts/*.sh|docker/*.sh|.github/scripts/*.sh) ;;
    *) PROBLEMS+=("$f: not inside a scanned glob (scripts/*.sh, docker/*.sh, .github/scripts/*.sh)") ; continue ;;
  esac
  [ "$codes_ok" = "true" ] || PROBLEMS+=("$f: codes must be a non-empty list of SCnnnn codes")
  [ "$reason_ok" = "true" ] || PROBLEMS+=("$f: needs a reason of at least 20 characters")
  if [ ! -f "$f" ] && [ "$absent_ok" != "true" ]; then
    PROBLEMS+=("$f: listed but does not exist — remove the entry (or mark may_be_absent)")
  fi
done < <(jq -r '.files | to_entries[] | [
    .key,
    ((.value.codes | type == "array") and (.value.codes | length > 0) and (.value.codes | all(type == "string" and test("^SC[0-9]{4}$"))) | tostring),
    ((.value.reason | type == "string") and (.value.reason | length >= 20) | tostring),
    (.value.may_be_absent == true | tostring)
  ] | @tsv' "$EXCLUDES")
if [ ${#PROBLEMS[@]} -gt 0 ]; then
  printf '  %s\n' "${PROBLEMS[@]}" >&2
  refuse "${#PROBLEMS[@]} problem(s) in $EXCLUDES"
fi

"$SC" --version 2>/dev/null | sed -n 's/^version: /shellcheck: using ShellCheck /p'

# --- run -----------------------------------------------------------------------
FAILED=()
for f in "${FILES[@]}"; do
  codes="$(jq -r --arg f "$f" '.files[$f].codes // [] | join(",")' "$EXCLUDES")"
  args=(--norc --severity=warning --format=gcc)
  [ -n "$codes" ] && args+=(--exclude="$codes")
  out="$("$SC" "${args[@]}" -- "$f" 2>&1)"
  rc=$?
  case "$rc" in
    0) ;;
    1) FAILED+=("$f"); printf '%s\n' "$out" >&2 ;;
    *) printf '%s\n' "$out" >&2; refuse "ShellCheck exited $rc on $f" ;;
  esac
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "shellcheck: FAIL — findings at severity warning in ${#FAILED[@]} file(s): ${FAILED[*]}" >&2
  echo "shellcheck: fix them, or (for a pre-existing finding in a file you do not own) add the file's code with a reason to $EXCLUDES" >&2
  exit 1
fi
echo "shellcheck: PASS — ${#FILES[@]} file(s) clean at severity warning"
exit 0
