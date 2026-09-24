#!/bin/bash
# Switch the scheduled Agent Athens jobs from running directly on the Mac to
# running in the container (docker/aa-run.sh), or switch back.
#
#   docker/install-launchd.sh             show what would change (no changes)
#   docker/install-launchd.sh --apply     install container jobs, disable host jobs
#   docker/install-launchd.sh --rollback  remove container jobs, re-enable host jobs
#
# Host jobs are disabled with `launchctl disable`, which persists across
# reboots — a plain unload would let launchd reload them at the next login and
# run both copies against the same database. Their plist files are left in
# ~/Library/LaunchAgents untouched, so --rollback restores them exactly.
#
# Moved into the container: the jobs that handle outside input (scraping,
# email, AI enrichment) plus the search-visibility fetch. Stays on the host by
# design: com.agentathens.deadman (the watchdog must not depend on Docker being
# up), com.agentathens.enrichment-check and com.agentathens.check-deploy-cadence
# (macOS notifications; read local logs only), com.agentathens.digest (local
# data only) and com.agentathens.phase3-weekly (absolute sibling-worktree
# paths). Bash 3.2 compatible.
set -euo pipefail

MODE="plan"
case "${1:-}" in
    "") ;;
    --apply) MODE=apply ;;
    --rollback) MODE=rollback ;;
    *) echo "usage: $0 [--apply|--rollback]" >&2; exit 2 ;;
esac
[ "$(uname -s)" = "Darwin" ] || { echo "install-launchd: macOS only (launchd)" >&2; exit 2; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"

# name|job|hour|minute|weekday("" = daily)
JOBS="visibility|visibility|7|30|
freshness|freshness|8|0|
enrichment|enrichment|10|0|
enrichment-13|enrichment|13|0|
enrichment-16|enrichment|16|30|
enrichment-19|enrichment|19|0|
verify-live|verify-live|12|15|
verify-live-20|verify-live|20|15|
image-refresh|image-refresh|5|30|0"

LEGACY="com.agentathens.daily
com.agentathens.freshness
com.agentathens.enrichment
com.agentathens.enrichment-13
com.agentathens.enrichment-16
com.agentathens.enrichment-19
com.agentathens.monitor-visibility"

STATE="${AA_SECRETS_DIR:-$HOME/.config/agentathens}/launchd-pre-docker.txt"
# Wrapper logs live in the host-only state folder: containers can write the
# repo's logs/ folder, so it is no place for the record of what they did.
LOGDIR="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/logs"

xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
loaded() { launchctl print "$DOMAIN/$1" >/dev/null 2>&1; }
disabled() { launchctl print-disabled "$DOMAIN" 2>/dev/null | grep -qE "\"$1\" => (true|disabled)"; }

write_plist() {  # name job hour minute weekday
    local label="com.agentathens.docker.$1" file="$AGENTS/com.agentathens.docker.$1.plist" wd="" offsite=""
    # Carry the off-machine backup command into scheduled runs (see docker/README.md).
    [ -n "${AA_OFFSITE_CMD:-}" ] && offsite="        <key>AA_OFFSITE_CMD</key><string>$(xml "$AA_OFFSITE_CMD")</string>
"
    [ -n "$5" ] && wd="        <key>Weekday</key><integer>$5</integer>
"
    cat > "$file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Written by docker/install-launchd.sh. Runs '$2' in the Agent Athens container. -->
    <key>Label</key><string>$label</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$(xml "$REPO/docker/aa-run.sh")</string>
        <string>$2</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
$wd        <key>Hour</key><integer>$3</integer>
        <key>Minute</key><integer>$4</integer>
    </dict>
    <key>WorkingDirectory</key><string>$(xml "$REPO")</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>TZ</key><string>Europe/Athens</string>
$offsite    </dict>
    <key>StandardOutPath</key><string>$(xml "$LOGDIR/docker-$1.log")</string>
    <key>StandardErrorPath</key><string>$(xml "$LOGDIR/docker-$1.log")</string>
    <key>RunAtLoad</key><false/>
    <key>KeepAlive</key><false/>
    <key>Nice</key><integer>5</integer>
</dict>
</plist>
EOF
    plutil -lint "$file" >/dev/null
    echo "$label"
}

if [ "$MODE" = "plan" ]; then
    echo "Would disable these host jobs (plists kept for --rollback):"
    echo "$LEGACY" | while read -r l; do
        if loaded "$l"; then echo "  $l (loaded)"; else echo "  $l (not loaded)"; fi
    done
    echo "Would install these container jobs in $AGENTS:"
    echo "$JOBS" | while IFS='|' read -r n j h m w; do
        printf '  com.agentathens.docker.%-15s %s at %02d:%02d%s\n' "$n" "$j" "$h" "$m" "${w:+ on Sundays}"
    done
    echo "Run with --apply after 'docker/aa-run.sh doctor' passes."
    exit 0
fi

if [ "$MODE" = "apply" ]; then
    [ -x "$REPO/docker/aa-run.sh" ] || chmod +x "$REPO/docker/aa-run.sh"
    mkdir -p "$LOGDIR"
    # Record each host job's state first; --rollback restores exactly this.
    if [ ! -f "$STATE" ]; then
        mkdir -p "$(dirname "$STATE")"
        echo "$LEGACY" | while read -r l; do
            st_loaded=no; st_disabled=no
            loaded "$l" && st_loaded=yes
            disabled "$l" && st_disabled=yes
            echo "$l|$st_loaded|$st_disabled"
        done > "$STATE"
        echo "recorded host job state in $STATE"
    fi
    echo "$LEGACY" | while read -r l; do
        launchctl disable "$DOMAIN/$l"
        loaded "$l" && launchctl bootout "$DOMAIN/$l" 2>/dev/null || true
        echo "disabled  $l"
    done
    echo "$JOBS" | while IFS='|' read -r n j h m w; do
        label="$(write_plist "$n" "$j" "$h" "$m" "$w")"
        loaded "$label" && launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
        launchctl enable "$DOMAIN/$label"
        launchctl bootstrap "$DOMAIN" "$AGENTS/$label.plist"
        echo "installed $label"
    done
    echo "Done. Container jobs log to $LOGDIR/docker-*.log."
    echo "The watchdog checks the com.agentathens.docker.* jobs via config/monitoring.json; add them to any local deadman config too."
    exit 0
fi

# rollback
echo "$JOBS" | while IFS='|' read -r n j h m w; do
    label="com.agentathens.docker.$n"
    loaded "$label" && launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
    rm -f "$AGENTS/$label.plist"
    echo "removed   $label"
done
[ -f "$STATE" ] || { echo "install-launchd: no recorded state at $STATE — re-enable host jobs by hand (launchctl enable/bootstrap)" >&2; exit 1; }
while IFS='|' read -r l was_loaded was_disabled; do
    [ "$was_disabled" = "yes" ] || launchctl enable "$DOMAIN/$l"
    if [ "$was_loaded" = "yes" ] && [ -f "$AGENTS/$l.plist" ]; then
        loaded "$l" || launchctl bootstrap "$DOMAIN" "$AGENTS/$l.plist"
        echo "restored  $l"
    fi
done < "$STATE"
rm -f "$STATE"
echo "Rolled back: host jobs restored to their pre-container state."
