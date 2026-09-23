#!/bin/bash
# First-run check for the Agent Athens container. Prints one line per check
# and exits non-zero if anything the scheduled jobs need is missing.
# Never prints token values — only whether they are set.
set -u
cd /workspace || { echo "FAIL  /workspace missing — run through docker/aa-run.sh"; exit 1; }

fails=0
ok()   { printf 'ok    %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n      → %s\n' "$1" "$2"; fails=$((fails + 1)); }
warn() { printf 'warn  %s\n      → %s\n' "$1" "$2"; }

for tool in bun node git gh jq sqlite3 netlify claude chromium; do
    if v="$("$tool" --version 2>/dev/null | grep -m1 .)"; then ok "$tool $v"; else bad "$tool not runnable" "rebuild the image: docker/aa-run.sh image"; fi
done

[[ "$(stat -f %m /workspace/package.json 2>/dev/null)" =~ ^[0-9]+$ ]] \
    && ok "BSD stat compatibility" || bad "stat -f %m does not return epoch seconds" "rebuild the image"

[[ "$(id -u)" != "0" ]] && ok "running as non-root ($(id -un))" || bad "running as root" "check user: in docker/compose.yaml"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 && ok "repo mounted at /workspace ($(git rev-parse --short HEAD))" \
    || bad "/workspace is not a git repo" "AA_REPO must point at the agent-athens checkout"
remote="$(git remote get-url origin 2>/dev/null || true)"
[[ "$remote" == https://github.com/* || "$remote" == git@github.com:* ]] && ok "origin $remote" || warn "origin '$remote'" "push expects a github.com remote"

[[ -s data/events.db ]] && sqlite3 -readonly data/events.db 'SELECT COUNT(*) FROM events;' >/dev/null 2>&1 \
    && ok "data/events.db readable ($(sqlite3 -readonly data/events.db 'SELECT COUNT(*) FROM events;') events)" \
    || bad "data/events.db missing or unreadable" "the pipeline aborts without it; restore from ~/agent-athens-backups"

[[ -f .netlify/state.json ]] && ok ".netlify/state.json present" || bad ".netlify/state.json missing" "run 'netlify link' once on the Mac in the repo"

touch "$HOME/agent-athens-backups/.aa-write-test" 2>/dev/null && rm -f "$HOME/agent-athens-backups/.aa-write-test" \
    && ok "backups dir writable" || bad "~/agent-athens-backups not writable" "check AA_BACKUPS_DIR in docker/aa-run.sh"
[[ -d "$HOME/.config/agentathens" ]] && ok "secrets dir mounted read-only" || warn "~/.config/agentathens not mounted" "GSC/Bing metrics will report missing credentials"

for var in GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN; do
    [[ -n "${!var:-}" ]] && ok "$var set" || bad "$var not set" "add it to the env file (docker/docker.env.example)"
done
[[ -f .env || -n "${EMAIL_USER:-}" ]] && ok "email credentials (.env or env file)" || warn "no EMAIL_USER" "email ingestion will be skipped"

if login="$(timeout 30 gh api user --jq .login 2>/dev/null)" && [[ -n "$login" ]]; then ok "GitHub token valid ($login)"; else bad "GitHub token rejected or GitHub unreachable" "check GH_TOKEN is valid and not expired"; fi

if timeout 60 chromium --headless=new --no-sandbox --disable-gpu --dump-dom 'data:text/html,<p>aa-ok</p>' 2>/dev/null | grep -q aa-ok; then
    ok "Chromium renders a page"
else
    bad "Chromium failed to render" "check shm_size in docker/compose.yaml"
fi

echo
if [[ $fails -gt 0 ]]; then echo "doctor: $fails check(s) failed"; exit 1; fi
echo "doctor: all checks passed"
