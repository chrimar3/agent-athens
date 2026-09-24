#!/bin/bash
#
# check-branch-rules.sh — body of the weekly `repo-settings` workflow.
#
# Reads the rules in effect on a branch (GET /repos/{owner}/{repo}/rules/
# branches/{branch}, which reports RULESETS; classic branch protection does not
# appear there) and fails unless they include:
#   - a pull_request rule (changes reach the branch only through a PR) that
#     requires code-owner review (require_code_owner_review, round 6:
#     CONTRIBUTING.md promises it and .github/CODEOWNERS names the owner),
#     dismisses approvals when new commits are pushed
#     (dismiss_stale_reviews_on_push) and requires the most recent push to be
#     approved by someone other than its pusher (require_last_push_approval)
#     — round 7: without these, an approved PR can take new, unreviewed
#     commits before it merges;
#   - required status checks named ci, path-guard, secret-scan,
#     dependency-audit, shellcheck and analyze (the job names of ci.yml,
#     path-guard.yml, security.yml and CodeQL's codeql.yml; the last two
#     were added in round 6); and
#   - (round 7) NO bypass actors on any ruleset those rules come from. The
#     rules endpoint does not report bypass actors, so each ruleset is read
#     with GET /repos/{owner}/{repo}/rulesets/{id}. GitHub includes
#     bypass_actors there only for a token that can administer the ruleset,
#     which the job's own token cannot: the workflow passes a separate
#     RULESET_TOKEN (the RULESET_READ_TOKEN secret) for these reads only. When
#     bypass_actors is absent the check FAILS, naming the permission needed.
# Fails CLOSED: an API error, a payload that is not a list, or no rules at all
# exits 1 and never prints PASS.
#
# Env: REPO (owner/name), BRANCH (e.g. main), GH_BIN (default gh; test seam),
# GH_TOKEN (the job token, for the rules endpoint), RULESET_TOKEN (optional;
# used instead of GH_TOKEN for the per-ruleset reads).
# Tested by tests/branch-rules-check.test.ts.
set -u

GH="${GH_BIN:-gh}"
REPO="${REPO:-}"
BRANCH="${BRANCH:-}"
REQUIRED_CHECKS=(ci path-guard secret-scan dependency-audit shellcheck analyze)
SETUP_HINT="Settings → Rules → Rulesets → New branch ruleset targeting main: enable 'Require a pull request before merging' with 'Require review from Code Owners', 'Dismiss stale pull request approvals when new commits are pushed' and 'Require approval of the most recent reviewable push', 'Require status checks to pass' with ${REQUIRED_CHECKS[*]}, and leave the Bypass list empty"
TOKEN_HINT="GitHub shows a ruleset's bypass list only to a token that can administer the repository: store a fine-grained personal access token for this repository with the 'Administration' repository permission (try Read-only first; if bypass actors stay hidden, Read and write) as the Actions secret RULESET_READ_TOKEN"

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
else
  if ! jq -e -s 'any(.[]; .type == "pull_request" and .parameters.require_code_owner_review == true)' "$WORK/rules.jsonl" >/dev/null; then
    problems+=("code-owner review is not required: a PR can merge without the review .github/CODEOWNERS asks for")
  fi
  if ! jq -e -s 'any(.[]; .type == "pull_request" and .parameters.dismiss_stale_reviews_on_push == true)' "$WORK/rules.jsonl" >/dev/null; then
    problems+=("stale approvals are not dismissed on push (dismiss_stale_reviews_on_push): commits pushed after an approval merge unreviewed")
  fi
  if ! jq -e -s 'any(.[]; .type == "pull_request" and .parameters.require_last_push_approval == true)' "$WORK/rules.jsonl" >/dev/null; then
    problems+=("the most recent push does not need approval (require_last_push_approval): whoever pushes last can approve their own change")
  fi
fi
jq -r -s '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[]?.context' \
  "$WORK/rules.jsonl" > "$WORK/contexts.txt" || refuse "could not read the required status checks"
for c in "${REQUIRED_CHECKS[@]}"; do
  grep -qxF -- "$c" "$WORK/contexts.txt" || problems+=("required status check '$c' is missing")
done

# Bypass actors (round 7): every ruleset that contributes a rule must list none.
# RULESET_TOKEN, when set, is used for these reads only.
ruleset_gh() {
  if [ -n "${RULESET_TOKEN:-}" ]; then GH_TOKEN="$RULESET_TOKEN" "$GH" "$@"; else "$GH" "$@"; fi
}
jq -r -s '[.[] | .ruleset_id] | unique | .[] | tostring' "$WORK/rules.jsonl" > "$WORK/ids.txt" \
  || refuse "could not read the ruleset ids"
[ -s "$WORK/ids.txt" ] || refuse "no rule names the ruleset it comes from (ruleset_id), so its bypass list cannot be checked"
while IFS= read -r id; do
  [[ "$id" =~ ^[0-9]{1,20}$ ]] || refuse "a rule names a ruleset id that is not a number"
  if ! ruleset_gh api "repos/$REPO/rulesets/$id" > "$WORK/ruleset-$id.json" 2>"$WORK/err"; then
    refuse "could not read ruleset $id (GET repos/$REPO/rulesets/$id): $(head -1 "$WORK/err" | tr -d '[:cntrl:]' | cut -c1-200). Next: $TOKEN_HINT"
  fi
  jq -e 'type == "object"' "$WORK/ruleset-$id.json" >/dev/null 2>&1 || refuse "ruleset $id: the API did not return an object"
  if ! jq -e 'has("bypass_actors") and (.bypass_actors | type == "array")' "$WORK/ruleset-$id.json" >/dev/null; then
    problems+=("ruleset $id: its bypass list is not visible to this token, so an empty list cannot be confirmed (failing closed). Next: $TOKEN_HINT")
  elif ! jq -e '.bypass_actors | length == 0' "$WORK/ruleset-$id.json" >/dev/null; then
    actors="$(jq -r '[.bypass_actors[] | "\(.actor_type // "?"):\(.actor_id // "-")(\(.bypass_mode // "?"))"] | join(", ")' "$WORK/ruleset-$id.json" | tr -d '[:cntrl:]' | cut -c1-300)"
    problems+=("ruleset $id lists bypass actors ($actors): they can push to $BRANCH or merge without the PR rule and the checks. Remove every entry from the ruleset's Bypass list")
  fi
done < "$WORK/ids.txt"

if [ ${#problems[@]} -gt 0 ]; then
  printf 'branch-rules: FAILED — %s\n' "${problems[@]}" >&2
  echo "branch-rules: Next: $SETUP_HINT" >&2
  exit 1
fi

reviews="$(jq -r -s '[.[] | select(.type == "pull_request") | .parameters.required_approving_review_count // 0] | max' "$WORK/rules.jsonl")"
echo "branch-rules: PASS — $BRANCH requires a PR with code-owner review, stale-approval dismissal and last-push approval, the checks ${REQUIRED_CHECKS[*]}, and no ruleset has bypass actors (approvals required: $reviews)"
exit 0
