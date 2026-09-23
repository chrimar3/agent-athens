#!/bin/bash
#
# dependency-audit.sh — body of the blocking `dependency-audit` job
# (.github/workflows/security.yml).
#
# Runs `bun audit --audit-level=high` against the installed lockfile and fails
# on any high or critical advisory that is not listed in
# .github/audit-ignore.json. Each listed entry must name the advisory (GHSA or
# CVE id), the package and severity, a reason (40+ characters) and a review_by
# date (YYYY-MM-DD). A malformed entry, or one past its review_by date, fails
# the job BEFORE the audit runs: an ignore must not outlive its reason.
#
# Env (test seams): AUDIT_IGNORE_FILE (default .github/audit-ignore.json),
# BUN_BIN (default bun), AUDIT_TODAY (default today, UTC).
# Tested by tests/dependency-audit.test.ts.
set -u

BUN="${BUN_BIN:-bun}"
IGNORE_FILE="${AUDIT_IGNORE_FILE:-.github/audit-ignore.json}"
TODAY="${AUDIT_TODAY:-$(date -u +%F)}"

refuse() {
  echo "dependency-audit: REFUSED — $1. Next: $2" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || refuse "jq is not on PATH" "install jq"
[ -f "$IGNORE_FILE" ] || refuse "$IGNORE_FILE is missing" "restore it (an empty list is {\"ignore\": []})"
jq -e '.ignore | type == "array"' "$IGNORE_FILE" >/dev/null 2>&1 \
  || refuse "$IGNORE_FILE is not JSON with an .ignore list" "fix the file"

bad="$(jq -r '.ignore[] | select(
    ((.id // "") | test("^(GHSA(-[23456789cfghjmpqrvwx]{4}){3}|CVE-[0-9]{4}-[0-9]{4,})$") | not)
    or ((.package // "") | length == 0)
    or ((.severity // "") | IN("high", "critical") | not)
    or ((.reason // "") | length < 40)
    or ((.review_by // "") | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$") | not)
  ) | (.id // "<no id>")' "$IGNORE_FILE" 2>/dev/null)" \
  || refuse "could not validate $IGNORE_FILE" "fix the file"
[ -z "$bad" ] || refuse "malformed ignore entries: $(echo $bad)" "each entry needs id (GHSA/CVE), package, severity high|critical, a 40+ character reason and review_by YYYY-MM-DD"

expired="$(jq -r --arg today "$TODAY" '.ignore[] | select(.review_by < $today) | "\(.id) (\(.package), review_by \(.review_by))"' "$IGNORE_FILE")"
[ -z "$expired" ] || refuse "expired ignore entries: $expired" "re-check each advisory: upgrade and remove the entry, or renew review_by with a fresh reason"

args=(audit --audit-level=high)
while IFS= read -r id; do
  [ -n "$id" ] && args+=("--ignore=$id")
done < <(jq -r '.ignore[].id' "$IGNORE_FILE")

echo "dependency-audit: bun ${args[*]}"
"$BUN" "${args[@]}"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "dependency-audit: FAILED — high or critical advisories not in $IGNORE_FILE (bun audit exit $rc). Next: upgrade the package (bun update <pkg>, or an overrides entry in package.json for a transitive one); if no fix exists, add an entry with a reason and review_by." >&2
  exit "$rc"
fi
echo "dependency-audit: PASS"
