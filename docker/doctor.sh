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

# The repo root must not be a mount of the Mac's (case-insensitive) repo folder:
# aa-run.sh mounts each top-level entry onto a tmpfs by its exact name.
[[ "$(/usr/bin/stat -f -c %T /workspace 2>/dev/null)" == tmpfs ]] && ok "/workspace is a private tmpfs (repo entries mounted one by one)" \
    || bad "/workspace is not a tmpfs" "the repo root is mounted whole: check docker/compose.yaml and docker/aa-run.sh"
[[ ! -e /workspace/.ENV && ! -e /workspace/BUNFIG.TOML ]] && ok "no case-insensitive path around the read-only mounts" \
    || bad "/workspace/.ENV or /workspace/BUNFIG.TOML resolves" "the repo root is mounted whole: check docker/aa-run.sh"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 && ok "repo mounted at /workspace ($(git rev-parse --short HEAD))" \
    || bad "/workspace is not a git repo" "AA_REPO must point at the agent-athens checkout"
remote="$(git remote get-url origin 2>/dev/null || true)"
[[ "$remote" == https://github.com/* || "$remote" == git@github.com:* ]] && ok "origin $remote" || warn "origin '$remote'" "push expects a github.com remote"

[[ -s data/events.db ]] && sqlite3 -readonly data/events.db 'SELECT COUNT(*) FROM events;' >/dev/null 2>&1 \
    && ok "data/events.db readable ($(sqlite3 -readonly data/events.db 'SELECT COUNT(*) FROM events;') events)" \
    || bad "data/events.db missing or unreadable" "the pipeline aborts without it; restore from ~/agent-athens-backups"

[[ -f .netlify/state.json ]] && ok ".netlify/state.json present" || bad ".netlify/state.json missing" "run 'netlify link' once on the Mac in the repo"

[[ ! -e "$HOME/agent-athens-backups" ]] && ok "backups folder not visible to the container" || bad "backups folder is mounted into the container" "remove that mount; aa-run.sh backs up on the Mac"
[[ -d "$HOME/.config/agentathens" ]] && ok "secrets dir mounted read-only" || warn "secrets dir (~/.config/agentathens) not mounted" "GSC/Bing metrics will report missing credentials"

for var in GH_TOKEN NETLIFY_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN; do
    [[ -n "${!var:-}" ]] && ok "$var set" || bad "$var not set" "add it to the env file (docker/docker.env.example)"
done
# Fine-grained tokens (github_pat_…) can be limited to this repository; a
# classic token reaches every repo the account can. Only the prefix is checked.
[[ "${GH_TOKEN:-}" == github_pat_?* ]] && ok "GH_TOKEN is fine-grained (github_pat_ prefix)" \
    || bad "GH_TOKEN is not a fine-grained token (no github_pat_ prefix)" "replace it with a fine-grained token limited to chrimar3/agent-athens (docs/security/credentials.md)"
[[ -f .env || -n "${EMAIL_USER:-}" ]] && ok "email credentials (.env or env file)" || warn "no EMAIL_USER" "email ingestion will be skipped"

# Egress: the only way out is the proxy, and it refuses the Mac, the LAN and
# cloud metadata. Checked with curl through the proxy (it reads http_proxy /
# https_proxy): refusals must come from the proxy itself (X-Squid-Error).
proxy_refuses() {  # $1 URL → 0 if the egress proxy denied it
    curl -sS -m 20 -o /dev/null -D - "$1" 2>/dev/null | tr -d '\r' | grep -qi '^x-squid-error: ERR_ACCESS_DENIED'
}
if [[ -z "${HTTPS_PROXY:-}" ]]; then
    bad "no egress proxy configured (HTTPS_PROXY unset)" "doctor must run on the proxied pipeline service; check docker/compose.yaml"
else
    for url in http://host.docker.internal/ http://gateway.docker.internal/ http://169.254.169.254/latest/meta-data/ http://127.0.0.1:3128/ http://192.168.1.1/; do
        proxy_refuses "$url" && ok "egress proxy refuses $url" || bad "egress proxy did not refuse $url" "check docker/egress/squid.conf and that the egress service runs it"
    done
    proxy_refuses https://example.com:8443/ && ok "egress proxy refuses ports other than 80/443" || bad "egress proxy did not refuse port 8443" "check aa_web_ports in docker/egress/squid.conf"
    code="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' https://example.com/ 2>/dev/null || true)"
    [[ "$code" =~ ^[23] ]] && ok "public HTTPS through the egress proxy (example.com: $code)" \
        || bad "public HTTPS through the egress proxy failed (example.com: ${code:-no answer})" "check the egress service log: docker logs aa-egress"
    if curl -sS -m 10 --noproxy '*' -o /dev/null https://example.com/ 2>/dev/null; then
        bad "a direct connection (bypassing the proxy) reached the internet" "the pipeline service must be on the internal network only (docker/compose.yaml)"
    else
        ok "no direct route out (only through the proxy)"
    fi
fi

if login="$(timeout 30 gh api user --jq .login 2>/dev/null)" && [[ -n "$login" ]]; then ok "GitHub token valid ($login)"; else bad "GitHub token rejected or GitHub unreachable" "check GH_TOKEN is valid and not expired"; fi

if timeout 60 chromium --headless=new --no-sandbox --disable-gpu --dump-dom 'data:text/html,<p>aa-ok</p>' 2>/dev/null | grep -q aa-ok; then
    ok "Chromium renders a page"
else
    bad "Chromium failed to render" "check shm_size in docker/compose.yaml"
fi

echo
if [[ $fails -gt 0 ]]; then echo "doctor: $fails check(s) failed"; exit 1; fi
echo "doctor: all checks passed"
