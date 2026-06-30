# Incident Postmortem — events.db loss (2026-06-29 → recovered 2026-06-30)

**Severity:** P0 (total local DB loss). **Outcome:** fully recovered, zero content lost. **Root cause:** UNCONFIRMED but bounded (see §Conclusion). **Production impact:** none — the empty site never deployed (gate fail-closed).

## Timeline (Athens local)
| Time | Event | Evidence |
|---|---|---|
| 06-29 16:30 | Last GOOD backup written (enrichment-16 run) | `events-2026-06-29.db.gz` 11.3 MB, mtime 16:30 |
| 06-29 17:15:32 | Pipeline run "completed successfully", **15,506 events** | `pipeline-2026-06-29.log:3027,3038` |
| 06-29 ~17:58–18:19 | **Session-193 `bun run build`** read the DB fine (15,506 loaded → 2902 pass pages) + wrote build artifacts | build-probe log; `data/build-completeness.json` mtime 18:19 |
| 06-29 ~18:19–18:20 | Session-193 `netlify deploy --no-build --dir=dist` (touches `dist/` only) | deploy succeeded |
| **06-29 18:20 → 19:00** | **← DB deleted in this window** | (no record; see ruled-out list) |
| 06-29 19:00:02 | enrichment-19: `ERROR: Database not found` | `pipeline-2026-06-29.log:3047` |
| 06-29 22:00:04 | enrichment-22: `ERROR: Database not found` | `:3056` |
| 06-30 01:03:29 | enrichment-01: `ERROR: Database not found` | `pipeline-2026-06-30.log:9` |
| 06-30 08:06:16 | full run: empty file auto-created on DB-open; backup phase wrote **114 B** dud over the 06-30 slot + pruned 1 good backup | `pipeline-2026-06-30.log:24` |
| 06-30 09:17 | full build failed on empty DB → **skipped deploy** (prod protected) | `:1192-1194` |
| 06-30 10:23 | **RECOVERED** from `events-2026-06-29.db.gz` (verified 15,506 rows + integrity ok before restore) | this session |

**The file was DELETED, not corrupted** — it was *absent* ("Database not found") from 19:00 to 08:06, then re-created empty (4096 B) when a process opened it with create semantics.

## Ruled out (read-only investigation)
- **Application code** — `grep -rniE "unlink|rmSync|fs.rm|renameSync|truncat" src/ --include=*.ts` targeting events.db → **0**. `"build"` = just `bun run src/generate-site.ts` (no prebuild/migrate/clean).
- **Shell scripts** — no `rm`/`mv` of the source `data/events.db` in `scripts/` or `*.sh`. The `rm -f` lines in `scripts/backup-events-db.sh` target only `$BACKUP_FILE.gz` in `~/agent-athens-backups/`. Prune (`:104-107`) is `find "$BACKUP_DIR" -name 'events-*.db.gz' -mtime +7` — cannot match the source (wrong dir + name).
- **Session-193 build/deploy** — the build *read* the DB successfully at 17:58 and finished writing artifacts at 18:19; loss is strictly after. Deploy touches `dist/` only. The build's `[orphan-sweep]` removed 57 **dist/** HTML orphans (not DB); the destructive non-event sweep was `armed=false`.
- **Scheduled jobs** — nothing agentathens runs in 18:20–19:00 (next slot is 19:00, which already saw it gone).
- **Cloud sync** — project is at `/Users/chrism/Project with Claude/...`, NOT inside the Google Drive `~/Library/CloudStorage` mounts; no `.icloud` placeholders.
- **Manual terminal action** — no `events.db` rm/mv/cp in `~/.zsh_history`/`~/.bash_history`; not in `~/.Trash`.
- **Recovery via OS snapshot** — none available (`tmutil listlocalsnapshots /` empty) — not needed (backup restore succeeded).
- **Unified log** — `log show` predicate on "events.db" for the window returned nothing (macOS doesn't log unlinks by default).
- **Filesystem / disk fault** — `diskutil verifyVolume /` → "appears to be OK", fsck exit 0 (no APFS corruption); **SMART Status: Verified** (no drive fault). A disk-level cause is ruled out.

## Conclusion
Root cause is **not in the codebase, automation, this session's build/deploy, or the disk/filesystem** (no deletion mechanism in any of them; the build read the DB healthy at 18:19; volume + SMART both clean). The deletion happened 18:20–19:00 on 06-29 with **no surviving record**. With code, automation, and hardware all eliminated, the only remaining candidates are an **external application or a manual action** that bypassed shell history + Trash — neither confirmable read-only. **The timing coincides with Session-193's window, but no causal mechanism was found in anything that session ran.** Attribution is closed as far as evidence allows; future recurrence would need fsevents/audit logging armed in advance.

## The real lesson — defense > attribution
The loss was a single deletion; the **damage was amplified by the backup system**, which IS in our control:
1. **Backup ran unconditionally** and overwrote the day's slot with a 114 B backup of the empty DB → add an **integrity/row-count floor** (refuse to back up a DB with 0 rows / smaller than the prior backup; alert instead).
2. **Prune is time-only** → it counted the dud as a day and pruned a good backup. Prune must **skip dud/short backups**.
3. **No active alert on DB-missing** — three enrichment runs logged `Database not found` to a file nobody reads before the morning. The deadman watchdog should classify `events.db missing / 0 rows` as a breach (it currently keys on enrich/deploy freshness).
Hardening any of these defends against ALL root causes, known or not.

## Recovery reference
Good backups: `/Users/chrism/agent-athens-backups/events-YYYY-MM-DD.db.gz` (7-day rolling; ~11 MB real, 114 B = dud). Restore = verify-then-swap (decompress to /tmp, `SELECT COUNT(*)` + `PRAGMA integrity_check`, preserve dud, `cp`). Dud preserved at `data/events.db.empty-2026-06-30`.

## Current state (2026-06-30)
- DB restored (15,506 rows). **ALL 12 agentathens launchd jobs UNLOADED** (precautionary) — reload with `for p in ~/Library/LaunchAgents/com.agentathens.*.plist; do launchctl bootstrap gui/$(id -u) "$p"; done`.
- Production unaffected (684 events / 2026-06-29).
- Open for operator: (1) decide on disk-health check / deeper forensics; (2) reload jobs when ready; (3) Planner to spec the 3 backup-hardening items above.
