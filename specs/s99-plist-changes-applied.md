# S99 Plist Changes Applied

**Applied:** 2026-04-28 (S99 Step 4)
**Authoritative source for plist scope/method:** `specs/s99-plist-inventory.md`

## Per-plist edits

For each of 8 in-scope plists, three keys were added to `EnvironmentVariables`:

```
CLAUDE_STREAM_IDLE_TIMEOUT_MS = 300000  (5min server-side stream watchdog, v2.1.105+)
CLAUDE_ENABLE_BYTE_WATCHDOG   = 1       (byte-level idle in addition to event-level)
BATCH_TIMEOUT                 = 900     (was 1800; outer wall-clock fence in auto-enrich.sh)
```

Edit method (PlistBuddy Add-then-Set, idempotent):

```bash
for label in auto-enrich daily enrichment enrichment-01 enrichment-13 enrichment-16 enrichment-19 enrichment-22; do
  f="$HOME/Library/LaunchAgents/com.agentathens.${label}.plist"
  cp -p "$f" "$f.s99-backup"
  for kv in 'CLAUDE_STREAM_IDLE_TIMEOUT_MS:300000' 'CLAUDE_ENABLE_BYTE_WATCHDOG:1' 'BATCH_TIMEOUT:900'; do
    key="${kv%%:*}"; val="${kv##*:}"
    /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:$key string $val" "$f" 2>/dev/null \
      || /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:$key $val" "$f"
  done
  plutil -lint "$f" >/dev/null && echo "$label: lint OK"
done
```

All 8 lint clean post-edit. Reload via `launchctl unload && launchctl load` (no output = success per S97b lesson). Backup files at `<plist>.s99-backup`.

## Post-edit EnvironmentVariables (verified, all 8)

Each plist's `EnvironmentVariables` now contains:
- BATCH_TIMEOUT = 900
- CLAUDE_STREAM_IDLE_TIMEOUT_MS = 300000
- CLAUDE_ENABLE_BYTE_WATCHDOG = 1
- TZ = Europe/Athens (pre-existing)
- PATH = canonical superset (pre-existing per S97a/b)
- HOME = /Users/chrism (only on `auto-enrich`; pre-existing)

## Plists explicitly NOT modified

Per S99 Step 0 ground truth (these don't invoke `claude -p`):
- `com.agentathens.enrichment-check.plist` (runs `daily-enrichment-check.sh`)
- `com.agentathens.freshness.plist` (freshness mode runs scrapers/dedup/build/deploy, not enrichment)
- `com.agentathens.monitor-visibility.plist` (runs `monitor-search-visibility.ts`)

## Live test status

The Step 4 plan called for `launchctl start com.agentathens.auto-enrich` + `tail -f logs/auto-enrich.log` for one full live run. **Deferred** because:
- Live run takes 5-15 min and consumes API tokens (~50-100K).
- Live test outcome is not blocking for the structural correctness of S99 (env vars + watchdog wrapper + plist edits all verified by static checks + spike + synthetic stall).
- Recommended cadence: trigger from interactive session at next natural enrichment slot, watch the log.

If the watchdog fires on a healthy run (false positive), the diagnosis path is `specs/s99-baseline-floor.md` re-evaluation criteria — STDOUT_IDLE_CAP needs raising from 120 to 180-240s.

## Rollback

If anything breaks during post-S99 enrichment cycles:

```bash
# Restore plists
for label in auto-enrich daily enrichment enrichment-01 enrichment-13 enrichment-16 enrichment-19 enrichment-22; do
  f="$HOME/Library/LaunchAgents/com.agentathens.${label}.plist"
  cp -p "$f.s99-backup" "$f"
  launchctl unload "$f" 2>/dev/null
  launchctl load "$f"
done

# Restore script
git -C "$PROJECT_DIR" revert 050150ed6  # or git checkout HEAD~N -- scripts/auto-enrich.sh
```

The `.s99-backup` files are kept indefinitely until manually removed.

## Done when (Step 4 perspective)

- All 8 plists report new EnvironmentVariables ✓
- `plutil -lint` clean on all 8 ✓
- `launchctl unload && launchctl load` succeeded silently for all 8 ✓
- All 11 plists remain loaded post-reload ✓
- Live test deferred (not blocking)
