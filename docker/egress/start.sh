#!/bin/bash
# Entrypoint of the egress container (docker/compose.yaml `egress`), baked
# into the image by docker/Dockerfile. Runs as the unprivileged `proxy` user
# on a read-only filesystem with every capability dropped.
#
#   - Squid, the HTTP(S) forward proxy (port 3128, docker/egress/squid.conf);
#   - when AA_IMAP_HOST is set: a socat TCP relay for email ingest, port 9993
#     (>1024: no capability needed) to AA_IMAP_HOST:AA_IMAP_PORT. IMAP is not
#     HTTP and cannot go through Squid; the relay only moves bytes, TLS runs
#     end to end between the ingest run and the mail server (the ingest run
#     verifies the server's certificate as IMAP_HOST).
#
# The relay goes to one fixed address: AA_IMAP_HOST is resolved once here, the
# address must be public (the same ranges squid.conf refuses are refused
# here), and socat is given that address, not the name. A refused or
# unresolvable name leaves the relay off (email ingest then fails, and says
# so) but the proxy up, so other jobs still run.
#
# If either process exits, the container exits (and aa-run.sh's next
# `docker compose run` starts a fresh one).
set -u

log() { echo "aa-egress: $*" >&2; }

# 0 if $1 is a dotted-quad IPv4 address outside every non-public range.
public_ipv4() {
    local ip="$1" a b c d
    case "$ip" in *[!0-9.]*|'') return 1 ;; esac
    IFS=. read -r a b c d <<EOF
$ip
EOF
    for o in "$a" "$b" "$c" "$d"; do
        case "$o" in ''|*[!0-9]*) return 1 ;; esac
        [ "${#o}" -le 3 ] && [ "$((10#$o))" -le 255 ] || return 1
    done
    a=$((10#$a)); b=$((10#$b)); c=$((10#$c))
    [ "$a" -eq 0 ] && return 1                                  # 0/8
    [ "$a" -eq 10 ] && return 1                                 # 10/8
    [ "$a" -eq 100 ] && [ "$b" -ge 64 ] && [ "$b" -le 127 ] && return 1   # 100.64/10
    [ "$a" -eq 127 ] && return 1                                # loopback
    [ "$a" -eq 169 ] && [ "$b" -eq 254 ] && return 1            # link-local, metadata
    [ "$a" -eq 172 ] && [ "$b" -ge 16 ] && [ "$b" -le 31 ] && return 1    # 172.16/12
    [ "$a" -eq 192 ] && [ "$b" -eq 0 ] && [ "$c" -eq 0 ] && return 1      # 192.0.0/24
    [ "$a" -eq 192 ] && [ "$b" -eq 0 ] && [ "$c" -eq 2 ] && return 1      # TEST-NET-1
    [ "$a" -eq 192 ] && [ "$b" -eq 168 ] && return 1            # 192.168/16
    [ "$a" -eq 198 ] && [ "$b" -ge 18 ] && [ "$b" -le 19 ] && return 1    # 198.18/15
    [ "$a" -eq 198 ] && [ "$b" -eq 51 ] && [ "$c" -eq 100 ] && return 1   # TEST-NET-2
    [ "$a" -eq 203 ] && [ "$b" -eq 0 ] && [ "$c" -eq 113 ] && return 1    # TEST-NET-3
    [ "$a" -ge 224 ] && return 1                                # multicast, reserved
    return 0
}

# A DNS name (never an IP literal or a local name); aa-run.sh checks the same.
valid_name() {
    local h="$1" lc
    [ "${#h}" -le 253 ] || return 1
    printf '%s' "$h" | grep -qE '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' || return 1
    case "${h##*.}" in *[!0-9]*) ;; *) return 1 ;; esac
    lc="$(printf '%s' "$h" | tr '[:upper:]' '[:lower:]')"
    case "$lc" in *.localhost|*.local|*.internal|*.lan|*.home.arpa|*.localdomain|*.docker) return 1 ;; esac
    return 0
}

# Only in tests: check the helpers without starting anything.
if [ "${1:-}" = "--check-ip" ]; then public_ipv4 "${2:-}"; exit $?; fi
if [ "${1:-}" = "--check-name" ]; then valid_name "${2:-}"; exit $?; fi

pids=()
host="${AA_IMAP_HOST:-}"
port="${AA_IMAP_PORT:-993}"
if [ -n "$host" ]; then
    case "$port" in ''|*[!0-9]*) port_ok=no ;; *) port_ok=yes; { [ "${#port}" -le 5 ] && [ "$((10#$port))" -ge 1 ] && [ "$((10#$port))" -le 65535 ]; } || port_ok=no ;; esac
    ip=""
    if ! valid_name "$host" || [ "$port_ok" != yes ]; then
        log "IMAP relay OFF: AA_IMAP_HOST/AA_IMAP_PORT is not a host name and port"
    else
        # Every IPv4 address the name has must be public (like squid.conf's
        # rule for proxied names); the relay then uses the first one.
        addrs="$(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1}' | sort -u)"
        if [ -z "$addrs" ]; then
            log "IMAP relay OFF: $host does not resolve"
        else
            bad=""
            for a in $addrs; do public_ipv4 "$a" || bad="$bad $a"; done
            if [ -n "$bad" ]; then
                log "IMAP relay OFF: $host resolves to non-public address(es):$bad"
            else
                ip="$(printf '%s\n' "$addrs" | head -1)"
            fi
        fi
    fi
    if [ -n "$ip" ]; then
        log "IMAP relay: port 9993 -> $host ($ip) port $port"
        socat -d TCP4-LISTEN:9993,fork,reuseaddr,max-children=8 \
            "TCP4:$ip:$port,connect-timeout=20" &
        pids+=($!)
    fi
fi

/usr/sbin/squid -N -d 1 -f /etc/squid/aa-egress.conf &
pids+=($!)

# Stop everything when the container is stopped, or when either one exits.
trap 'kill "${pids[@]}" 2>/dev/null' TERM INT
wait -n
rc=$?
kill "${pids[@]}" 2>/dev/null
wait
exit "$rc"
