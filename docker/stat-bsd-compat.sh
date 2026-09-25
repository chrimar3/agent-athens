#!/bin/bash
# Installed as /usr/local/bin/stat in the container (ahead of /usr/bin/stat).
#
# The pipeline scripts were written on macOS. Most `stat` calls fall back to
# GNU `-c`, but scripts/auto-enrich.sh (protected path) calls BSD
# `stat -f %m FILE` with no fallback; GNU stat reads `-f` as "filesystem
# status" and prints multi-line garbage into the enrichment watchdog's
# arithmetic. This shim translates the BSD format forms the scripts use and
# passes every other invocation through to GNU stat unchanged.
#
#   stat -f %m FILE...   → stat -c %Y   (mtime, epoch seconds)
#   stat -f%z FILE...    → stat -c %s   (size, bytes)
#   stat -f %Lp FILE...  → stat -c %a   (octal permissions)
# Any other BSD format (e.g. %Sm) exits 1 so the caller's GNU fallback runs.
set -u
GNU=/usr/bin/stat

fmt=""
if [[ "${1:-}" == "-f" && "${2:-}" == %* ]]; then
    fmt="$2"; shift 2
elif [[ "${1:-}" == -f%* ]]; then
    fmt="${1#-f}"; shift
else
    exec "$GNU" "$@"
fi

case "$fmt" in
    %m) exec "$GNU" -c %Y -- "$@" ;;
    %z) exec "$GNU" -c %s -- "$@" ;;
    %Lp) exec "$GNU" -c %a -- "$@" ;;
    *) echo "stat (container compat): BSD format '$fmt' not supported" >&2; exit 1 ;;
esac
