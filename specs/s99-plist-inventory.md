# S99 Plist Inventory — Stream-Idle Wrapper Scope

**Created:** 2026-04-28 (S99 Step 0)
**Purpose:** Authoritative mapping of LaunchAgent plists → trigger script → `claude -p` reach. Drives Step 4 plist scope.

## Method

For each plist in `~/Library/LaunchAgents/com.agentathens.*.plist`:
1. Read `:ProgramArguments` via `/usr/libexec/PlistBuddy`.
2. Identify the trigger script (the bash invocation, or the `bun run` invocation).
3. Trace whether the script invokes `claude -p` directly or transitively (via `daily-automated.sh:324 → auto-enrich.sh`).
4. Record loaded state (per `launchctl list | grep agentathens`) and S99 in-scope decision.

## Inventory (11 plists)

| # | Plist | Trigger | Transitive `claude -p`? | Loaded (post-S97b)? | S99 scope |
|---|---|---|---|---|---|
| 1 | `com.agentathens.auto-enrich.plist` | `bash auto-enrich.sh` | **YES (direct)** | YES idle | ✓ IN |
| 2 | `com.agentathens.daily.plist` | `bash -c daily-automated.sh` | **YES (full mode → enrichment phase)** | YES idle | ✓ IN |
| 3 | `com.agentathens.enrichment.plist` | `bash -c daily-automated.sh enrichment` | **YES** | YES idle | ✓ IN |
| 4 | `com.agentathens.enrichment-01.plist` | `bash -c daily-automated.sh enrichment` | **YES** | YES idle | ✓ IN |
| 5 | `com.agentathens.enrichment-13.plist` | `bash -c daily-automated.sh enrichment` | **YES** | YES idle | ✓ IN |
| 6 | `com.agentathens.enrichment-16.plist` | `bash -c daily-automated.sh enrichment` | **YES** | YES idle | ✓ IN |
| 7 | `com.agentathens.enrichment-19.plist` | `bash -c daily-automated.sh enrichment` | **YES** | YES idle | ✓ IN |
| 8 | `com.agentathens.enrichment-22.plist` | `bash -c daily-automated.sh enrichment` | **YES** | YES idle | ✓ IN |
| 9 | `com.agentathens.enrichment-check.plist` | `bash daily-enrichment-check.sh` | NO | YES idle | ✗ OUT |
| 10 | `com.agentathens.freshness.plist` | `bash -c daily-automated.sh freshness` | NO (scrapers + dedup + build + deploy) | YES idle | ✗ OUT |
| 11 | `com.agentathens.monitor-visibility.plist` | `bun run monitor-search-visibility.ts` | NO | YES idle | ✗ OUT |

## Per-plist diff target (Step 4)

Each in-scope plist needs three additions to its `:EnvironmentVariables` dict:
- `CLAUDE_STREAM_IDLE_TIMEOUT_MS` = `300000` (string in plist; consumed as env var by `claude -p`)
- `CLAUDE_ENABLE_BYTE_WATCHDOG` = `1`
- `BATCH_TIMEOUT` = `900` (overrides script default of 1800; consumed by `auto-enrich.sh` perl-alarm wrapper)

Where existing `EnvironmentVariables` dict already exists (post-S97b all 11 have a PATH entry there), additions are inserts; do NOT recreate the dict.

## Per-plist verification (after edits)

```bash
for p in \
  ~/Library/LaunchAgents/com.agentathens.auto-enrich.plist \
  ~/Library/LaunchAgents/com.agentathens.daily.plist \
  ~/Library/LaunchAgents/com.agentathens.enrichment.plist \
  ~/Library/LaunchAgents/com.agentathens.enrichment-01.plist \
  ~/Library/LaunchAgents/com.agentathens.enrichment-13.plist \
  ~/Library/LaunchAgents/com.agentathens.enrichment-16.plist \
  ~/Library/LaunchAgents/com.agentathens.enrichment-19.plist \
  ~/Library/LaunchAgents/com.agentathens.enrichment-22.plist; do
  echo "=== $(basename $p) ==="
  /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables" "$p" 2>&1
done
```

Expected post-edit state for each: dict shows PATH (canonical from S97a) + TZ + (HOME for some) + the three new S99 keys.

## Reload sequence

Per S97b lesson: macOS launchd snapshots `EnvironmentVariables` at load time. Disk edit alone is not enough — must `unload && load` to refresh in-memory state.

```bash
for p in <8 plist paths above>; do
  launchctl unload "$p"
  launchctl load   "$p"
done
launchctl list | grep com.agentathens | wc -l   # expect 11 (8 scope + 3 untouched)
```

Pre-flight: `launchctl list | grep com.agentathens | awk '$1 != "-"'` must be empty. If any numeric PID, wait per S97b protocol.

## Out-of-scope (deferred to S100 or later)

Other plist keys NOT touched by S99:
- `ExitTimeOut` — affects how long launchd waits for child to exit on SIGTERM. Default behavior is acceptable for stream-idle scope.
- `AbandonProcessGroup` — affects whether launchd kills child's children on parent exit. Behavior change owed for orphan-kill cleanliness, but separate concern.
- `ThrottleInterval` — affects how soon launchd will re-spawn a job that exits quickly. Currently 60-300s across plists. Tune-as-needed in S100.
- Schedule blocks (`StartCalendarInterval`, `StartInterval`) — unchanged.
- Loading state for `enrichment-check`/`freshness`/`monitor-visibility` — they're not in scope, but they ARE loaded; touching them would violate the "one concern per session" rule.
