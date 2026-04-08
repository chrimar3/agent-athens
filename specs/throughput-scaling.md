# Enrichment Throughput Scaling — Second Daily Run

**Status:** Recommendation only. NOT implemented in this session.
**Owner of implementation:** Next enrichment-stability session.
**Parent session:** 2026-04-08 throughput-scaling session (`EVENTS_PER_BATCH 3→5` landed separately).
**Target metric:** Daily enrichment throughput from current ~15 events/day (post-lever-a) to ~30 events/day.

---

## Context

The 2026-04-08 throughput session shipped **lever (a)** of the three-lever plan: raising `EVENTS_PER_BATCH` from 3 to 5 in `scripts/auto-enrich.sh:41`. Expected outcome: ~9 → ~15 events/day (+66%).

That still misses the 18+/day goal. This document analyses **lever (c)** — running enrichment twice per day instead of once — as the next follow-up. Lever (c) is deliberately deferred to its own session because it touches launchd infrastructure rather than a one-line config value, and because it should only land after lever (a) has ≥3 days of production data to validate that 5-event batches don't regress quality.

**Prerequisite before implementing any of this:** confirm lever (a) is holding. Run the coverage KPIs from the parent session:

```bash
sqlite3 data/events.db "
  SELECT COUNT(CASE WHEN full_description IS NOT NULL AND full_description != '' THEN 1 END) as enriched,
         COUNT(*) as total,
         ROUND(100.0 * COUNT(CASE WHEN full_description IS NOT NULL AND full_description != '' THEN 1 END) / COUNT(*), 1) as pct
  FROM events
  WHERE location_status IN ('verified_athens','pass_through')
    AND start_date BETWEEN date('now') AND date('now', '+7 days');"
```

If that number is still ~7% after 3 days at 5-per-batch, lever (a) didn't work and lever (c) won't save you — investigate quality gate rejection rate first.

---

## Three questions the parent session plan asked

### Q1: Can we run enrichment-only without full scraping?

**Yes, already.** `scripts/auto-enrich.sh` is a standalone script that does not call any scrapers. The plan assumed we'd need to add an `--enrichment-only` flag to `daily-automated.sh`, but that's unnecessary: `auto-enrich.sh` is already factored correctly. Reading the top of `daily-automated.sh` confirms the split:

```
# Full pipeline: email → parse → quality → generate → deploy
# NOTE: AI enrichment runs automatically via claude -p (see auto-enrich.sh).
```

Enrichment is *not* a phase of `daily-automated.sh`. The morning pipeline ends at "deploy"; `auto-enrich.sh` is invoked separately (either manually, from `daily-enrichment-check.sh`, or from another trigger).

**Implication:** a second daily run means scheduling `scripts/auto-enrich.sh` directly, not `daily-automated.sh`. No script refactoring needed.

### Q2: What's the right time for the second run?

Recommended: **16:30 Athens time**. Rationale:

| Time | Pros | Cons |
|------|------|------|
| 14:00 | Fastest compounding — first run ends ~14:00 based on current timing | **Lock contention** — the morning run often holds the lock until ~14:15-14:30. Second run would collide with first's final batch. |
| 15:00 | First run guaranteed finished | Close to lunch end. User may be in meetings — lid-closed risk. |
| **16:30** | **First run done, user typically at desk, AC likely** | Only ~90 min later than 15:00 — moderate gain |
| 17:00 | Even more buffer | Sliding into "preparing to leave" window; user may close lid |
| 18:00+ | Maximum buffer | User-absent window starts — R2 battery-skip likely to fire and skip the run entirely |

The 16:30 choice assumes the user's routine matches typical office hours in Europe/Athens. **If the user's actual routine differs, re-evaluate.** The key constraint is: *the second run should land when the user is most likely to be at a desk on AC power*, because R2's battery-skip branch will cancel the run otherwise.

**Hidden trap:** `ThrottleInterval=300` in both existing plists means launchd won't re-trigger a job within 5 minutes of its last run. This is fine for once-a-day jobs but irrelevant for two-per-day; just noting it won't block the 8h gap between 08:00 and 16:30.

### Q3: Separate plist or one plist with multiple StartCalendarInterval entries?

**Separate plist.** Three reasons:

1. **Different `ProgramArguments`.** Morning run calls `daily-automated.sh` (scraping pipeline). Afternoon run calls `auto-enrich.sh` (enrichment only). launchd's `StartCalendarInterval` array would reuse the same `ProgramArguments` for every trigger, so a single-plist approach would force both runs to execute the same script — meaning the afternoon run would ALSO do 6 hours of web scraping, doubling scraper load for no gain.
2. **Independent failure characteristics.** The morning pipeline has ~15 distinct phases, any of which can fail. The afternoon pipeline has exactly one concern (enrichment). Separate plists let you disable afternoon enrichment independently (`launchctl unload com.agentathens.enrichment-afternoon.plist`) without affecting morning.
3. **Follows the existing convention.** The project already has two separate plists (`com.agentathens.daily` and `com.agentathens.enrichment-check`). A third plist for afternoon enrichment is the same pattern, not a new one.

---

## Proposed implementation (for the next session)

### New file: `com.agentathens.enrichment-afternoon.plist`

Copy `com.agentathens.enrichment-check.plist` as the base template and modify:

```xml
<key>Label</key>
<string>com.agentathens.enrichment-afternoon</string>

<key>ProgramArguments</key>
<array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>"/Users/chrism/Project with Claude/AgentAthens/agent-athens/scripts/auto-enrich.sh"</string>
</array>

<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>16</integer>
    <key>Minute</key>
    <integer>30</integer>
</dict>

<key>WorkingDirectory</key>
<string>/Users/chrism/Project with Claude/AgentAthens/agent-athens</string>

<key>EnvironmentVariables</key>
<dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/Users/chrism/.bun/bin:/Users/chrism/.npm-global/bin</string>
    <key>TZ</key>
    <string>Europe/Athens</string>
</dict>

<key>StandardOutPath</key>
<string>/Users/chrism/Project with Claude/AgentAthens/agent-athens/logs/enrichment-afternoon-stdout.log</string>
<key>StandardErrorPath</key>
<string>/Users/chrism/Project with Claude/AgentAthens/agent-athens/logs/enrichment-afternoon-stderr.log</string>

<key>KeepAlive</key>
<false/>
<key>RunAtLoad</key>
<false/>
<key>Nice</key>
<integer>5</integer>
<key>ThrottleInterval</key>
<integer>300</integer>
```

**Notes on this plist:**
- Uses the same bash `-c` string-quoting pattern as `com.agentathens.daily.plist` because the path contains spaces (see `mistakes.md` → "launchd path with spaces", exit 127 from Feb 12).
- `PATH` matches `com.agentathens.daily.plist` exactly, including `/Users/chrism/.npm-global/bin` (Claude CLI fallback path from the Mar 11 binary-missing incident).
- Separate log files (`enrichment-afternoon-stdout.log` / `-stderr.log`) so afternoon failures don't get mixed into morning launchd logs.
- `Nice=5` matches morning job — low priority, cooperates with interactive user work.

### Installation

```bash
cp com.agentathens.enrichment-afternoon.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.agentathens.enrichment-afternoon.plist
# Verify:
launchctl list com.agentathens.enrichment-afternoon
```

### Rollback

```bash
launchctl unload ~/Library/LaunchAgents/com.agentathens.enrichment-afternoon.plist
rm ~/Library/LaunchAgents/com.agentathens.enrichment-afternoon.plist
```

No code changes in the repo, just plist file removal. Blast radius: zero.

---

## Self-gating properties (why this is low-risk)

Four independent guards protect against pathological second-run behavior:

1. **`MIN_QUEUE=3` in `auto-enrich.sh:42`** — if the queue has <3 events, the script exits cleanly without spending any Claude tokens. A day where morning enrichment fully drained the queue produces a no-op afternoon run.
2. **`.auto-enrich.lock` file** — if morning somehow hasn't finished by 16:30 (pathological but possible after a slow scrape + slow enrichment), the afternoon run sees the lock and exits. The morning run takes priority.
3. **R2 battery-skip** — if the laptop is on battery at 16:30 (user stepped out with the machine), the afternoon run detects battery state and skips rather than risking a clamshell hang.
4. **`LOCK_MAX_AGE=7200` stale-lock recovery** — if morning crashed in a way that left an orphaned lock, the afternoon run's lock-mtime check force-recovers after 2 hours, so stuck state gets cleared daily.

Combined: the afternoon run is best-effort, self-gating, and adds **zero** new failure modes to the system. It can only either (a) enrich more events, or (b) exit cleanly with no effect.

---

## Expected throughput after combining levers (a) + (c)

| Configuration | Events/run | Runs/day | Events/day | % of 18+ goal |
|---------------|-----------:|---------:|-----------:|--------------:|
| Baseline (pre-session) | 9 | 1 | 9 | 50% |
| Lever (a) only: 5 events × 3 batches | 15 | 1 | 15 | 83% |
| Lever (a) + (c): 5 × 3 × 2 | 15 | 2 | **30** | **167%** |

**Caveat:** the afternoon run's effective throughput depends on queue depth. If scraping adds ≤15 events/day to the queue, the afternoon run runs against a depleted queue and may only enrich 3-9 events (whatever's accumulated in the ~3h since morning finished). The theoretical 30/day assumes the queue has enough backlog to support both runs at full capacity.

**How to measure:** after 5 days with both levers active, compare `SELECT DATE(enriched_at), COUNT(*) FROM events WHERE enriched_at >= date('now', '-7 days') GROUP BY DATE(enriched_at)`. Daily counts should cluster around 15-30 rather than ~9.

---

## Things explicitly NOT in scope

- **Parallelizing batches within a run.** `auto-enrich.sh` currently runs batches serially (confirmed in parent session Step 0 analysis: batch-2 starts exactly when batch-1 ends). Parallelization is a bigger refactor with lock-file and manifest-collision implications. If lever (a) + (c) together don't hit the throughput goal, parallelization is lever (d) — its own separate session.
- **Increasing `MAX_BATCHES` above 3.** Adding a 4th serial batch adds ~13 min of wall-clock and brings `MAX_BATCHES * BATCH_TIMEOUT = 4 * 1800 = 7200s` exactly against `LOCK_MAX_AGE=7200`. Would require raising `LOCK_MAX_AGE` too — a hidden coupling the parent session flagged but didn't change.
- **Midday third run.** Not evaluated. Would require measuring whether the queue actually generates enough backlog to feed three runs, and whether the user's midday lunch window creates a reliable battery-skip problem. Possible future work if (a)+(c) succeed.
- **Enrichment retries for failed events.** Orthogonal to throughput; belongs in R3 (Mode C diagnostic).

---

## Pre-implementation checklist for the next session

Before running the installation commands above:

- [ ] Confirm lever (a) has been running for ≥3 production days with `EVENTS_PER_BATCH=5`
- [ ] Check quality gate rejection rate is not higher than pre-change baseline (check `batch-N-review.md` files)
- [ ] Confirm the R2 battery-skip fix (commit `5a4a529f4`) is still on `origin/main`
- [ ] Verify the morning run's actual completion time in recent `logs/auto-enrich-YYYY-MM-DD.log` files — if it's drifted later than 14:30, push the afternoon plist from 16:30 to ≥17:00
- [ ] Decide: single implementation session (write + install + verify) or split (write this session, install after another few days of lever-a validation)

---

*Generated 2026-04-08 during the throughput-scaling session. Parent session's lever (a) change is separate.*
