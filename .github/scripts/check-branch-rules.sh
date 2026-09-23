#!/bin/bash
#
# check-branch-rules.sh — body of the weekly `repo-settings` workflow.
#
# Reads the rules in effect on a branch (GET /repos/{owner}/{repo}/rules/
# branches/{branch}, which reports RULESETS; classic branch protection does not
# appear there) and fails unless they include:
#   - a pull_request rule (changes reach the branch only through a PR), and
#   - required status checks named ci, path-guard, secret-scan and
#     dependency-audit (the job names of ci.yml, path-guard.yml, security.yml).
# Fails CLOSED: an API error, a payload that is not a list, or no rules at all
# exits 1 and never prints PASS.
#
# Env: REPO (owner/name), BRANCH (e.g. main), GH_BIN (default gh; test seam).
# Tested by tests/branch-rules-check.test.ts.
set -u

GH="${GH_BIN:-gh}"
REPO="${REPO:-}"
BRANCH="${BRANCH:-}"
REQUIRED_CHECKS=(ci path-guard secret-scan dependency-audit)
SETUP_HINT="Settings → Rules → Rulesets → New branch ruleset targeting main: enable 'Require a pull request before merging' and 'Require status checks to pass' with ${REQUIRED_CHECKS[*]}"

refuse() {
  echo "branch-rules: FAILED — $1" >&2
  exit 1
}

[ -n "$REPO" ] || refuse "REPO is empty — the workflow must pass github.repository"
[ -n "$BRANCH" ] || refuse "BRANCH is empty — the workflow must pass the branch to check"
command -v jq >/dev/null 2>&1 || refuse "jq is not on PATH"

WORK="$(mktemp -d)" || refuse "could not create a temp dir"
trap 'rm -rf "$WORK"' EXIT

if ! "$GH" api "repos/$REPO/rules/branches/$BRANCH" --paginate \
     --jq 'if type == "array" then .[] | @json else error("the rules payload is not a list") end' \
     > "$WORK/rules.jsonl" 2>"$WORK/err"; then
  refuse "could not read the rules for $BRANCH: $(head -1 "$WORK/err")"
fi

[ -s "$WORK/rules.jsonl" ] || refuse "no ruleset rules apply to $BRANCH (classic branch protection is not visible to this check). Next: $SETUP_HINT"

jq -e -s 'all(.[]; type == "object" and has("type"))' "$WORK/rules.jsonl" >/dev/null 2>&1 \
  || refuse "a rule entry was not an object with a type"

problems=()
if ! jq -e -s 'any(.[]; .type == "pull_request")' "$WORK/rules.jsonl" >/dev/null; then
  problems+=("no pull_request rule: direct pushes to $BRANCH are not blocked")
fi
jq -r -s '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[]?.context' \
  "$WORK/rules.jsonl" > "$WORK/contexts.txt" || refuse "could not read the required status checks"
for c in "${REQUIRED_CHECKS[@]}"; do
  grep -qxF -- "$c" "$WORK/contexts.txt" || problems+=("required status check '$c' is missing")
done

if [ ${#problems[@]} -gt 0 ]; then
  printf 'branch-rules: FAILED — %s\n' "${problems[@]}" >&2
  echo "branch-rules: Next: $SETUP_HINT" >&2
  exit 1
fi

reviews="$(jq -r -s '[.[] | select(.type == "pull_request") | .parameters.required_approving_review_count // 0] | max' "$WORK/rules.jsonl")"
codeowners="$(jq -r -s 'any(.[]; .type == "pull_request" and (.parameters.require_code_owner_review // false))' "$WORK/rules.jsonl")"
echo "branch-rules: PASS — $BRANCH requires a PR and the checks ${REQUIRED_CHECKS[*]} (approvals required: $reviews, code-owner review: $codeowners)"
exit 0
