# launchd Setup Guide

This guide explains how to configure macOS launchd to run the Agent Athens daily pipeline automatically at 8:00 AM Athens time.

## Overview

The automated pipeline runs the following steps:
1. **Email ingestion** - Fetch new emails from IMAP
2. **Email parsing** - Extract events from newsletters
3. **Quality gates** - Filter by location, deduplicate
4. **Site generation** - Build static site
5. **Deployment** - Push to Netlify via Git

**Note:** AI enrichment is NOT included in the automated pipeline (requires Claude Code session).

## Prerequisites

- macOS 10.15+
- Bun installed and working
- Git configured with push access to the repository
- Gmail App Password configured in `.env`
- Project directory at a known path

## Installation

### 1. Update the plist file

Edit `com.agentathens.daily.plist` and update the paths:

```xml
<!-- Update this path to your actual project location -->
<string>$HOME/Projects/agent-athens/scripts/daily-automated.sh</string>

<!-- Update working directory -->
<key>WorkingDirectory</key>
<string>$HOME/Projects/agent-athens</string>

<!-- Update log paths -->
<key>StandardOutPath</key>
<string>$HOME/Projects/agent-athens/logs/launchd-stdout.log</string>
<key>StandardErrorPath</key>
<string>$HOME/Projects/agent-athens/logs/launchd-stderr.log</string>
```

**Important:** Replace `$HOME/Projects/agent-athens` with your actual project path.

### 2. Install into LaunchAgents — never blind-copy over an existing install

**Constraint: `~/Library/LaunchAgents/` is the LIVE operational configuration, not a build
product of this repo.** Operational fixes land in the installed plist first — environment-variable
overrides (enrichment batch timeouts, Claude CLI stream watchdogs), extra `PATH` entries the
scheduled run needs to find its tools (the `claude` CLI lives in `~/.local/bin`, which the repo
template's `PATH` does not include), and schedule changes — and they are not reliably back-ported
to the repo copy. Copying repo → installed therefore silently reverts those fixes. Silent divergence between the
installed plists and the repo/script is exactly the failure class that once went undetected for
roughly three weeks: installed plists pinned `BATCH_TIMEOUT` to a stale 900s after the script
default had been raised to 1200s, and every launchd-triggered enrichment run died at the cap edge
(S166, 2026-05-08 → 2026-05-29; see `docs/known-issues.md` and `docs/session-log.md`). A blind
`cp` creates the same divergence in the other direction, with the same symptom: scheduled runs
break and nothing says why. Verified on 2026-07-19: the installed `daily` plist carried
timeout/watchdog overrides and `PATH` entries absent from the repo copy, and the repo
`enrichment-check` plist disagreed with the installed one on the scheduled hour.

**First install only** (nothing exists yet at the destination):

```bash
test -f ~/Library/LaunchAgents/com.agentathens.daily.plist \
  && echo "ALREADY INSTALLED — do NOT cp; diff first (below)" \
  || cp com.agentathens.daily.plist ~/Library/LaunchAgents/
```

**If a plist is already installed, diff before touching anything** (read-only):

```bash
diff <(plutil -p com.agentathens.daily.plist) \
     <(plutil -p ~/Library/LaunchAgents/com.agentathens.daily.plist)
```

If the diff is non-empty, assume the installed side is the operational truth until proven
otherwise. Reconcile deliberately, key by key — usually by back-porting the installed values
into the repo template — and never resolve a diff by copying repo → installed wholesale.
The same applies to every other `com.agentathens.*` plist in the repo root and
`config/launchd/`.

### 3. Load the job

```bash
launchctl load ~/Library/LaunchAgents/com.agentathens.daily.plist
```

### 4. Verify installation

```bash
launchctl list | grep agentathens
```

You should see output like:
```
-       0       com.agentathens.daily
```

## Management Commands

### Check status

```bash
launchctl list | grep agentathens
```

### Run immediately (for testing)

```bash
launchctl start com.agentathens.daily
```

### Stop the job

```bash
launchctl stop com.agentathens.daily
```

### Unload (disable)

```bash
launchctl unload ~/Library/LaunchAgents/com.agentathens.daily.plist
```

### Reload after changes

```bash
launchctl unload ~/Library/LaunchAgents/com.agentathens.daily.plist
launchctl load ~/Library/LaunchAgents/com.agentathens.daily.plist
```

## Logging

Logs are written to:
- Pipeline log: `logs/pipeline-YYYY-MM-DD.log`
- launchd stdout: `logs/launchd-stdout.log`
- launchd stderr: `logs/launchd-stderr.log`

### View today's log

```bash
cat logs/pipeline-$(date +%Y-%m-%d).log
```

### Watch logs in real-time

```bash
tail -f logs/pipeline-*.log
```

### Check for errors

```bash
grep -i error logs/pipeline-$(date +%Y-%m-%d).log
```

## Scheduling

The job runs daily at 8:00 AM local time. macOS launchd:

- **Catches up after sleep**: If your Mac was asleep at 8:00 AM, the job runs when it wakes up
- **Skips if running**: Won't start a new run if the previous one is still running
- **Throttles on failure**: Waits 5 minutes (300 seconds) before retrying after a failure

### Change schedule

Edit the plist to change the time:

```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>8</integer>  <!-- Change this (0-23) -->
    <key>Minute</key>
    <integer>0</integer>  <!-- Change this (0-59) -->
</dict>
```

For weekdays only (Monday-Friday):

```xml
<key>StartCalendarInterval</key>
<array>
    <dict>
        <key>Weekday</key><integer>1</integer>
        <key>Hour</key><integer>8</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <dict>
        <key>Weekday</key><integer>2</integer>
        <key>Hour</key><integer>8</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <!-- ... repeat for days 3, 4, 5 -->
</array>
```

## Troubleshooting

### Job not running

1. Check if loaded:
   ```bash
   launchctl list | grep agentathens
   ```

2. Check system log:
   ```bash
   log show --predicate 'subsystem == "com.apple.xpc.launchd"' --last 1h | grep agentathens
   ```

3. Verify paths in plist are correct (no typos, directories exist)

### Permission errors

1. Make script executable:
   ```bash
   chmod +x scripts/daily-automated.sh
   ```

2. Check Bun is accessible:
   ```bash
   /usr/bin/env bun --version
   ```

### Git push fails

1. Ensure SSH keys are loaded:
   ```bash
   ssh-add -l
   ```

2. Check git remote:
   ```bash
   git remote -v
   ```

### Database locked

If the database is locked:
```bash
lsof data/events.db
```

Then close the application holding the lock.

## Environment Variables

The **repo template** plist sets `PATH` (to find bun, git, etc.) and `TZ=Europe/Athens`.

The **installed** plist is expected to carry more than the template: operational overrides
(e.g. enrichment `BATCH_TIMEOUT`, Claude CLI watchdog variables) and additional `PATH` entries
are applied there directly. Do not trust this document — or the repo template — for what the
live job actually runs with; read it from the installed file:

```bash
plutil -p ~/Library/LaunchAgents/com.agentathens.daily.plist
```

Additional variables from `.env` are loaded by the script.

## Security Notes

- The plist runs with your user permissions
- Sensitive data (API keys, passwords) should be in `.env`, not in the plist
- The `.env` file should have restrictive permissions: `chmod 600 .env`

## Integration with Claude Code Sessions

The automated pipeline runs independently. For AI enrichment:

1. Automated pipeline runs at 8 AM (collects new events)
2. Later, open a Claude Code session
3. Run `bun run scripts/daily-manual.ts` to see status
4. Manually enrich events with Claude Code
5. Commit and push when done

This separation ensures the site updates daily even without manual intervention.

---

**See also:**
- `scripts/daily-automated.sh` - The pipeline script
- `scripts/daily-manual.ts` - Claude Code session helper
- `.specify/memory/constitution.md` - Project governance
