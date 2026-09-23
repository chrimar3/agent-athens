#!/bin/bash
# Container entrypoint: maps a job name to the command its launchd plist ran
# on the Mac. Invoked through docker/aa-run.sh.
set -euo pipefail
cd /workspace

usage() {
    cat >&2 <<'EOF'
usage: aa-run.sh JOB [args]
  freshness       daily-automated.sh freshness   (scrape → build; then publish)
  publish         daily-automated.sh publish     (push + deploy a built site)
  verify-live     print the live Netlify deploy id (compared on the Mac)
  ingest          daily-automated.sh ingest      (newsletter email only)
  restore ID      restore a recorded Netlify deploy
  enrichment      daily-automated.sh enrichment  (claude -p enrichment)
  daily           daily-automated.sh             (legacy full pipeline)
  visibility      fetch-bing-metrics.ts + monitor-search-visibility.ts
  site            bun run src/generate-site.ts
  test [args]     bun test [args]
  doctor          check tools, mounts, tokens and Chromium
  shell           interactive bash
EOF
}

job="${1:-help}"
[[ $# -gt 0 ]] && shift

case "$job" in
    freshness|enrichment|publish) exec bash scripts/daily-automated.sh "$job" "$@" ;;
    daily) exec bash scripts/daily-automated.sh "$@" ;;
    visibility)
        # The plist ran both with `;` — keep that, but report either failure.
        rc=0
        bun run scripts/fetch-bing-metrics.ts || rc=$?
        bun run scripts/monitor-search-visibility.ts || rc=$?
        exit "$rc" ;;
    verify-live) exec bash docker/verify-live.sh ;;
    ingest) exec bash scripts/daily-automated.sh ingest "$@" ;;
    restore) exec bash docker/restore-deploy.sh "$@" ;;
    site) exec bun run src/generate-site.ts "$@" ;;
    test) exec bun test "$@" ;;
    doctor) exec /usr/local/bin/aa-doctor ;;
    shell) exec bash "$@" ;;
    help|-h|--help) usage; exit 0 ;;
    *) echo "aa-entrypoint: unknown job '$job'" >&2; usage; exit 2 ;;
esac
