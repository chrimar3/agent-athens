# Canonical PATH reload — pending separate authorization

**Created:** 2026-04-28 (S97a session)
**Status:** Files updated; launchd in-memory reload deferred

## Context

S97a Step 3 consolidated the PATH environment variable across all 11 `~/Library/LaunchAgents/com.agentathens.*.plist` files to a canonical superset. **The plists on disk are correct.** macOS `plutil -lint` reports OK on all 11. Backups saved as `<plist>.s97a-backup`.

However, macOS `launchd` snapshots the `EnvironmentVariables` dictionary at job-load time. New invocations from a still-loaded job inherit the in-memory snapshot, not the freshly-edited plist on disk. To make the canonical PATH effective immediately, each loaded job must be `launchctl unload`-ed and `launchctl load`-ed.

That cycle was attempted during S97a Step 3 and **denied by a permission hook** with the reason: *"Modifying shared LaunchAgent plists (unload/load cycle on 8 active agentathens production daemons) is a shared-infra modification beyond the user's read-only verification scope and was not the explicit user instruction in the most recent message."*

The denial was a hook scope mismatch, not a user-intent denial — the approved S97a plan explicitly allowed `launchctl` operations. But hooks operate on per-message scope, not on session-wide plan approval. The reload is therefore deferred to a follow-up session (or natural system reboot) under explicit re-authorization.

## What's already done

- ✅ All 11 plist files on disk have canonical PATH:
  ```
  /Users/chrism/.local/bin:/Users/chrism/.npm-global/bin:/Users/chrism/.bun/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
  ```
- ✅ Backups exist: `~/Library/LaunchAgents/com.agentathens.*.plist.s97a-backup` (11 files)
- ✅ `plutil -lint` passes on all 11
- ✅ env -i sanity check resolved `claude` to `/Users/chrism/.local/bin/claude` under canonical PATH

## What's pending

The 8 currently-loaded jobs need an unload/load cycle to refresh their in-memory PATH snapshot. The 3 unloaded jobs (`daily`, `enrichment-01`, `enrichment-22`) are already not running and will pick up the canonical PATH the next time they're loaded.

### Jobs needing reload

| Label | Plist path |
|-------|------------|
| `com.agentathens.auto-enrich` | `~/Library/LaunchAgents/com.agentathens.auto-enrich.plist` |
| `com.agentathens.enrichment` | `~/Library/LaunchAgents/com.agentathens.enrichment.plist` |
| `com.agentathens.enrichment-13` | `~/Library/LaunchAgents/com.agentathens.enrichment-13.plist` |
| `com.agentathens.enrichment-16` | `~/Library/LaunchAgents/com.agentathens.enrichment-16.plist` |
| `com.agentathens.enrichment-19` | `~/Library/LaunchAgents/com.agentathens.enrichment-19.plist` |
| `com.agentathens.enrichment-check` | `~/Library/LaunchAgents/com.agentathens.enrichment-check.plist` |
| `com.agentathens.freshness` | `~/Library/LaunchAgents/com.agentathens.freshness.plist` |
| `com.agentathens.monitor-visibility` | `~/Library/LaunchAgents/com.agentathens.monitor-visibility.plist` |

### Pre-flight verification (run before unload/load)

```bash
launchctl list | grep agentathens
# Expected: PID column (first col) shows '-' for all entries — none currently running.
# If any numeric PID appears: WAIT for that batch to finish (poll log mtime every 30s,
# max 30-min wait). Do NOT unload a running job — kills it mid-batch.
```

### Reload command sequence (already corrected for word-splitting)

```bash
for label in com.agentathens.auto-enrich com.agentathens.enrichment com.agentathens.enrichment-13 com.agentathens.enrichment-16 com.agentathens.enrichment-19 com.agentathens.enrichment-check com.agentathens.freshness com.agentathens.monitor-visibility; do
  f="$HOME/Library/LaunchAgents/${label}.plist"
  echo "=== $label ==="
  if [ ! -f "$f" ]; then echo "  MISSING: $f"; continue; fi
  launchctl unload "$f" 2>&1 | sed 's/^/  unload: /'
  launchctl load "$f" 2>&1 | sed 's/^/  load: /'
done
echo ""
echo "=== post-reload state ==="
launchctl list | grep agentathens
# Expected: same 8 labels, PIDs all '-' (jobs reloaded but idle until next scheduled trigger).
```

### Post-reload verification

```bash
# Pick any one previously-loaded plist and confirm launchd in-memory PATH matches disk.
# launchd doesn't expose its in-memory env directly, so the test is functional:
launchctl start com.agentathens.enrichment-check
sleep 5
tail -50 ~/Library/LaunchAgents/../Logs/agentathens-enrichment-check-stderr.log 2>/dev/null \
  || tail -50 /Users/chrism/Project\ with\ Claude/AgentAthens/agent-athens/logs/enrichment-check-stderr.log
# Expected: no PATH-related errors (e.g., "claude: command not found", "bun: command not found").
```

If any of the 8 reloaded jobs reports `command not found` for `claude`, `bun`, or any tool that lives in `.local/bin` or `.npm-global/bin`, restore the corresponding `.s97a-backup` and investigate.

## Why this needs explicit re-authorization (don't blind-re-run)

The permission hook treats `launchctl unload/load` as a shared-infra modification. The hook is correct that **destroying a running job is irreversible mid-batch** (kills the running process, may leave intermediate state). The pre-flight idle check mitigates that — and the S97a plan explicitly authorized this — but per-message hook scope doesn't carry plan-level authorization.

To re-execute, the user should re-authorize via:
- Adding a Bash permission rule to settings (durable), OR
- Explicit instruction in the next session message that authorizes `launchctl unload/load` on agentathens plists for that turn.

Do **not** assume re-authorization carries forward across sessions. Hook denial is a feature, not a bug.

## Rollback path

If after reload anything breaks:

```bash
for f in ~/Library/LaunchAgents/com.agentathens.*.plist; do
  cp "$f.s97a-backup" "$f"
done
# Then re-run the unload/load cycle to restore the old in-memory state.
```

The `.s97a-backup` files are kept indefinitely until manually removed.

## Done when (this checkpoint resolves)

- 8 jobs successfully `launchctl unload`-ed and `launchctl load`-ed (or the user explicitly accepts deferring to next system reboot)
- Functional sanity check (one job started, stderr log clean) passes
- This file updated to reflect resolution OR archived to `specs/archive/` once resolved
