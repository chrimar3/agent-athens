#!/bin/bash
#
# secret-scan.sh — the body of the `secret-scan` check (security loop round 3).
#
# Runs gitleaks over the commits a change adds, with an allowlist the change
# cannot edit. .github/gitleaks.toml decides what gitleaks may skip; if the scan
# read it from the checkout, a PR could widen it in the same diff that adds a
# secret and still get a green check. So, like path-guard reading its globs:
#   - pull_request / schedule / manual: the config on the DEFAULT branch
#     (origin/$CONFIG_REF);
#   - push: the config in the commit BEFORE the push ($PUSH_BEFORE), so a direct
#     push to main (the pipeline pushes there) cannot widen its own allowlist
#     either; a push that creates the branch falls back to the default branch.
# It also turns off the two other in-repo suppressions gitleaks honours:
# inline `gitleaks:allow` comments (--ignore-gitleaks-allow) and a
# .gitleaksignore file (--gitleaks-ignore-path points at an empty directory).
#
# Scan range: a PR scans base..head; a push scans before..after; anything else
# (schedule, manual, a branch-creating push) scans the whole history.
#
# When the reference commit has no config (the PR that first adds the file),
# gitleaks runs with its default rules and no allowlist. Fails CLOSED: an
# unreachable reference commit, a missing binary, or a PR event without both
# SHAs exits 1 before gitleaks runs. gitleaks' own non-zero
# exit (a finding) is passed through.
#
# Env: GITLEAKS_BIN, CONFIG_REF (the default branch), EVENT (github.event_name),
# PR_BASE / PR_HEAD, PUSH_BEFORE / PUSH_AFTER. Run from the checkout root; the
# checkout needs full history (fetch-depth: 0) so origin/$CONFIG_REF exists.
set -u

GL="${GITLEAKS_BIN:-}"
CONFIG_REF="${CONFIG_REF:-}"
EVENT="${EVENT:-}"
PR_BASE="${PR_BASE:-}"
PR_HEAD="${PR_HEAD:-}"
PUSH_BEFORE="${PUSH_BEFORE:-}"
PUSH_AFTER="${PUSH_AFTER:-}"
CONFIG_PATH=".github/gitleaks.toml"

refuse() {
  echo "secret-scan: REFUSED — $1 (failing closed)" >&2
  exit 1
}

[ -n "$GL" ] || refuse "GITLEAKS_BIN is empty — the workflow must pass the verified binary"
[ -x "$GL" ] || refuse "GITLEAKS_BIN '$GL' is not an executable file"
[ -n "$CONFIG_REF" ] || refuse "CONFIG_REF is empty — the workflow must pass github.event.repository.default_branch"
is_sha() { printf '%s' "$1" | grep -Eqx '[0-9a-f]{7,64}'; }
is_zero() { case "$1" in *[!0]*) return 1 ;; *) return 0 ;; esac; }

WORK="$(mktemp -d)" || refuse "could not create a temp dir"
trap 'rm -rf "$WORK"' EXIT
mkdir "$WORK/no-gitleaksignore" || refuse "could not create the empty ignore dir"

# --- where the config comes from, and what range to scan ---------------------
range=""
config_src="origin/$CONFIG_REF"
case "$EVENT" in
  pull_request)
    is_sha "$PR_BASE" && is_sha "$PR_HEAD" || refuse "pull_request event without base/head SHAs"
    range="${PR_BASE}..${PR_HEAD}"
    ;;
  push)
    if [ -n "$PUSH_BEFORE" ] && ! is_zero "$PUSH_BEFORE"; then
      is_sha "$PUSH_BEFORE" && is_sha "$PUSH_AFTER" || refuse "push event with malformed before/after SHAs"
      range="${PUSH_BEFORE}..${PUSH_AFTER}"
      config_src="$PUSH_BEFORE"
    fi
    ;;
esac

if ! git rev-parse --verify --quiet "${config_src}^{commit}" >/dev/null; then
  if [ "$config_src" = "origin/$CONFIG_REF" ]; then
    git fetch --no-tags --quiet origin "+refs/heads/$CONFIG_REF:refs/remotes/origin/$CONFIG_REF" 2>/dev/null \
      || refuse "origin/$CONFIG_REF is not in the checkout and could not be fetched"
  else
    refuse "the pre-push commit $config_src is not in the checkout"
  fi
fi
# No config at the reference commit (e.g. the PR that first adds it): scan with
# gitleaks' built-in rules and NO allowlist — stricter than any repo config, so
# nothing a PR adds can loosen it. Never the checked-out copy, and never gitleaks'
# own fallback, which would read a .gitleaks.toml from the (PR-controlled) tree.
if git cat-file -e "${config_src}:${CONFIG_PATH}" 2>/dev/null; then
  git show "${config_src}:${CONFIG_PATH}" > "$WORK/gitleaks.toml" 2>/dev/null \
    || refuse "could not read $CONFIG_PATH at $config_src"
  [ -s "$WORK/gitleaks.toml" ] || refuse "$CONFIG_PATH at $config_src is empty"
  echo "secret-scan: config from $config_src:$CONFIG_PATH"
else
  printf '[extend]\nuseDefault = true\n' > "$WORK/gitleaks.toml" || refuse "could not write the default config"
  echo "secret-scan: no $CONFIG_PATH at $config_src — using gitleaks' default rules with no allowlist"
fi

ARGS=(git --config "$WORK/gitleaks.toml" --gitleaks-ignore-path "$WORK/no-gitleaksignore" --ignore-gitleaks-allow --redact --no-banner)
if [ -n "$range" ]; then
  echo "secret-scan: scanning commits $range"
  "$GL" "${ARGS[@]}" --log-opts="$range" .
else
  echo "secret-scan: scanning the full history"
  "$GL" "${ARGS[@]}" .
fi
