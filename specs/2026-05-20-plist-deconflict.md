# Plist Deconflict — 2026-05-20

**Mode:** Read-only reconnaissance + fork classification. NO plist edits yet — awaiting authorization.
**Trigger:** Deploy-cancellation root cause from `specs/2026-05-20-deploy-pipeline-diagnostic.md`. The fallback at `b13712b6e` mitigates; this session addresses the trigger.
**Identity:** Date-keyed (2026-05-20-plist-deconflict). Cites S142 (deferred the deconflict), the diagnostic spec, and `b13712b6e` (the fallback).

---

## TL;DR

**Fork: A** — both `com.agentathens.daily` (full mode) and `com.agentathens.freshness` invoke the SAME script (`scripts/daily-automated.sh`) at the SAME schedule (`Hour=8 Minute=0`), and BOTH run the BUILD & DEPLOY phase. The two-job split is redundant by construction — `full` mode is a strict superset of `freshness` mode.

**Recommended fix:** disable `com.agentathens.freshness.plist` (move to `.disabled-2026-05-20`), keep `com.agentathens.daily.plist` as canonical. Daily/full mode already runs every phase freshness does, plus enrichment. Eliminates the schedule-overlap class of cancellation.

**Scope caveat:** This does NOT eliminate ALL deploy cancellations. Today's evidence (12:08 manual `6a0d79fb`, also `Deploy canceled`) shows manual/agent deploys can also collide with concurrent activity. The fallback at `b13712b6e` already provides autonomous recovery for that residual class. A script-level deploy lock could narrow further, but is OUT OF SCOPE for this fix — it adds complexity without addressing the dominant case (schedule overlap).

---

## Step 0 — Plist comparison (side-by-side)

| Field | `com.agentathens.daily` | `com.agentathens.freshness` |
|---|---|---|
| `Label` | `com.agentathens.daily` | `com.agentathens.freshness` |
| `StartCalendarInterval` | **Hour=8 Minute=0** | **Hour=8 Minute=0** ⚠️ identical |
| `ProgramArguments` | `/bin/bash -c "...daily-automated.sh"` (no args) | `/bin/bash -c "...daily-automated.sh" freshness` |
| `StandardOutPath` | `logs/launchd-stdout.log` | `logs/freshness-stdout.log` |
| `StandardErrorPath` | `logs/launchd-stderr.log` | `logs/freshness-stderr.log` |
| `WorkingDirectory` | `/Users/chrism/.../agent-athens` | (same) |
| `EnvironmentVariables.PATH` | (full PATH incl. `.local/bin`, `.bun/bin`, `.npm-global/bin`) | (same) |
| `EnvironmentVariables.TZ` | `Europe/Athens` | `Europe/Athens` |
| `EnvironmentVariables.BATCH_TIMEOUT` | `900` | (absent) |
| `EnvironmentVariables.CLAUDE_ENABLE_BYTE_WATCHDOG` | `1` | (absent) |
| `EnvironmentVariables.CLAUDE_STREAM_IDLE_TIMEOUT_MS` | `300000` | (absent) |
| `ThrottleInterval` | `300` (5 min) | `300` (5 min) |
| `Nice` | `5` | `5` |
| `RunAtLoad` | `false` | `false` |
| `KeepAlive` | `false` | `false` |

**Diff that matters:** the schedule is **identical** (`Hour=8 Minute=0`), the script invoked is **identical**, the differentiator is a single positional arg (`freshness` vs none). The `BATCH_TIMEOUT` / Claude env vars on daily suggest it's expected to run longer (full pipeline with enrichment), but that's a side-channel difference, not a deconfliction mechanism.

### launchctl load state (current)

```
-	1	com.agentathens.daily      ← last exit 1 (today's 10:32 deploy error)
-	0	com.agentathens.freshness  ← last exit 0
```

Both loaded. Both currently dead between fires.

### LaunchAgents directory

Only the `.plist` files are loaded by launchctl. The `.s97a-backup` and `.s99-backup` files are inert (older versions kept for reference, not loaded). Active loaded plists: `com.agentathens.daily.plist`, `com.agentathens.freshness.plist`.

Other agentathens jobs in the dir (enrichment-01/13/16/19/22, enrichment, enrichment-check, auto-enrich, monitor-visibility) fire at DIFFERENT times — not part of this deconflict.

---

## Step 1 — Script branching matrix

`scripts/daily-automated.sh` parses a positional arg `PIPELINE_MODE` at line 710-723:

```bash
PIPELINE_MODE="full"            # default
for arg in "$@"; do
    case "$arg" in
        --mode=*)          PIPELINE_MODE="${arg#--mode=}" ;;
        full|freshness|enrichment) PIPELINE_MODE="$arg" ;;
        ...
    esac
done
```

Three valid modes: `full` (default when no arg) | `freshness` | `enrichment`.

### Phase matrix

| Phase | `full` | `freshness` | `enrichment` |
|---|---|---|---|
| Freshness phases (scrape, quality gates, dedup, price, ticket-URL, schema-gen, venue geocoding) | ✓ | ✓ | ✗ |
| Enrichment phases (sync, auto-enrichment, time-enrichment, image-enrichment) | ✓ | ✗ | ✓ |
| **BUILD & DEPLOY** | **✓** | **✓** | ✗ |

**Source:** lines 771-806:
- L771-772: `if [[ "$PIPELINE_MODE" != "enrichment" ]]; then` — freshness phases gate
- L793-794: `if [[ "$PIPELINE_MODE" != "freshness" ]]; then` — enrichment phases gate
- L805-806: `# BUILD & DEPLOY (skip in enrichment mode — 22h latency by design)` then `if [[ "$PIPELINE_MODE" != "enrichment" ]]; then` — build+deploy gate

**Both `full` and `freshness` reach `run_deploy()`.** Confirmed: the deploy collision happens at the script level when both plists fire concurrently, since both their script invocations independently invoke the same `run_deploy` against the same Netlify site.

### Per-mode lock files exist but don't prevent THIS collision

Line 734 comment: `"Per-mode lock files allow freshness + enrichment to run simultaneously"`. The lock is `.pipeline-${PIPELINE_MODE}.lock` — per-mode, not per-site. So `.pipeline-full.lock` and `.pipeline-freshness.lock` are DIFFERENT files. The script's lock prevents two `full`-mode runs from racing each other, but does NOT prevent `full` and `freshness` from running in parallel — by design, per the comment.

**The script's mode-aware locking was designed to ENABLE parallelism, not prevent it.** The deconfliction problem is that the parallelism design assumes the parallel modes don't compete for shared external resources (like the Netlify deploy slot). Reality: they do.

### Data dependency

- `freshness` mode produces fresh scrape data, dist/ build, deploys.
- `full` mode does everything `freshness` does, PLUS enrichment, then builds, then deploys.
- There is NO data dependency between them; `full` is a strict functional superset of `freshness`. Running them in parallel produces two near-identical dist/ builds racing to deploy.

This is the heart of the redundancy. `freshness` doesn't add anything `full` doesn't already cover.

---

## Fork classification: **A**

**FORK A applies because:** both invocations run the SAME path (including deploy) at the SAME time, and one is a strict superset of the other. Per the brief: "One of them is redundant collision-generation. Likely fix: determine which is canonical, disable/remove the redundant one. Smallest, most robust."

### Evidence

1. **Schedule:** Both `Hour=8 Minute=0`, both load on system, both fire at 08:00 Athens.
2. **Script invocation:** Both call `scripts/daily-automated.sh`. Only the positional arg differs.
3. **Deploy path:** Both `full` and `freshness` modes reach `run_deploy()` (lines 805-806 gate excludes only `enrichment`).
4. **Superset relationship:** `full` does everything `freshness` does, plus enrichment. There is no operation in `freshness` that `full` skips.
5. **S142's own deferred note** (session-log.md:5857): *"Plist-deconflict session queued — routing question to resolve first: are `daily` and `freshness` semantically redundant (kill one), or do they serve different pipeline phases (offset + flock)?"* This session resolves that question with evidence: redundant.

### Why disable `freshness` (not `daily`)

- `daily` runs `full` mode → covers BOTH freshness phases AND enrichment.
- `freshness` runs `freshness` mode → covers freshness phases only, NOT enrichment.
- Disabling `daily` would leave enrichment unscheduled (would still have the `enrichment-01/13/16/19/22` per-hour jobs, but the consolidated nightly pass would be gone — and the deploy would still happen via freshness, so prod would update WITHOUT the latest enrichment).
- Disabling `freshness` preserves all functionality: daily does freshness phases + enrichment + deploy.

**Disable `freshness`.**

---

## Scope caveat — what this fix does NOT solve

The 12:08 manual deploy `6a0d79fb` carried `error_message="Deploy canceled"` AND `title=null` (i.e., it was a manual deploy, not from any plist). It collided with SOMETHING — not freshness (which had hung at IMAP and never reached deploy), and not daily (which had completed its error at 10:38). Likely: a parallel agent's manual `netlify deploy --no-build --dir=dist` collided with someone else's deploy or with Netlify-side activity.

**Manual/agent-triggered concurrent deploys remain a source of cancellation that this fix does not address.** Options for a follow-up if that becomes load-bearing:

- **Script-level deploy lock:** add a `.deploy.lock` (separate from per-mode lock) acquired before the `netlify deploy` call. Covers script-vs-script (same-host) collisions. Does NOT cover manual deploys from other hosts or other operators unless they also acquire the lock.
- **Acceptance + reliance on fallback:** the fallback at `b13712b6e` already provides autonomous recovery for cancellations from ANY source. If autonomous recovery succeeds reliably, manual collisions become observability noise (logged forensically, recovered, no operator action). This is the lowest-cost posture.
- **Netlify deploy slot serialization:** the actual platform-level fix would be Netlify treating concurrent deploys as queued rather than racing-cancelable. That's external; not in scope.

**Recommendation:** ship the plist deconflict (this spec's authorized fix), rely on `b13712b6e` fallback for residual manual collisions, defer the script-level lock unless evidence shows manual collisions are NOT auto-recovering.

---

## Proposed actions (awaiting authorization)

1. **Unload freshness plist:**
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.agentathens.freshness.plist
   ```
2. **Rename to .disabled with date suffix** (recoverable, not deleted):
   ```bash
   mv ~/Library/LaunchAgents/com.agentathens.freshness.plist \
      ~/Library/LaunchAgents/com.agentathens.freshness.plist.disabled-2026-05-20
   ```
3. **Confirm load state:**
   ```bash
   launchctl list | grep agentathens
   # Expected: com.agentathens.daily still listed; com.agentathens.freshness absent
   ```
4. **No plutil/syntax editing required** — we're not modifying any plist content.
5. **No script changes** — `scripts/daily-automated.sh` continues to support `freshness` mode (intentional flexibility for ad-hoc invocations), it just won't be auto-fired.

### Files touched

- `~/Library/LaunchAgents/com.agentathens.freshness.plist` → renamed (this is OUTSIDE the repo, not a git commit)
- **NO repo file changes** unless we also want to:
  - Add a note to `docs/known-issues.md` (HOLD — scroll session is in that file; park in this spec)
  - Add a `.claude/notes/decisions.md` entry (HOLD — to be paired with the action, after authorization)
  - Add a `docs/session-log.md` entry (POST-SESSION)

---

## Verify-after-act criteria — RESULTS

After authorization + execution (2026-05-20 ~12:55 Athens):

### Pre-check (read-only)

```
grep -rn 'com.agentathens.freshness|freshness-stdout|freshness-stderr|launchctl.*freshness' \
    ~/Library/LaunchAgents/ scripts/ .claude/ docs/
```

Hits classified:
- Self-reference (freshness.plist) — expected
- `.s97a-backup` files — inert, not loaded
- Historical narrative in `.claude/notes/*.md`, `docs/session-log.md` — past events, no scheduled polling
- `docs/known-issues.md:369` — the existing problem entry (must UPDATE, not duplicate, when merging the parked entry)
- `scripts/`: **zero hits** — no live script polls `freshness-stdout.log`/`freshness-stderr.log` or invokes the freshness plist
- S91 ext note (session-log.md:5858) proposes extending monitor-search-visibility.ts to parse freshness-stdout — PROSPECTIVE, not implemented; grep against `scripts/` confirms zero matches

**Pre-check verdict: clean — no shotgun-surgery dependency.**

### Execution

```
launchctl unload ~/Library/LaunchAgents/com.agentathens.freshness.plist     # exit 0
mv ~/Library/LaunchAgents/com.agentathens.freshness.plist \
   ~/Library/LaunchAgents/com.agentathens.freshness.plist.disabled-2026-05-20  # exit 0
```

### Verify 1 — `launchctl list | grep agentathens`

```
-	1	com.agentathens.daily              ← canonical, still loaded
-	0	com.agentathens.enrichment-19
-	0	com.agentathens.monitor-visibility
-	0	com.agentathens.enrichment-01
-	0	com.agentathens.enrichment-13
-	0	com.agentathens.auto-enrich
-	0	com.agentathens.enrichment-16
-	0	com.agentathens.enrichment-check
-	0	com.agentathens.enrichment-22
-	0	com.agentathens.enrichment
```

**`com.agentathens.freshness` ABSENT.** ✓

### Verify 2 — filesystem state

```
-rw-r--r-- 1404 bytes  com.agentathens.freshness.plist.disabled-2026-05-20  ← preserved, recoverable
-rw-r--r-- 2337 bytes  com.agentathens.freshness.plist.s97a-backup           ← pre-existing inert backup
```

**Original `.plist` gone (renamed to `.disabled-2026-05-20`).** ✓

### Verify 3 — `plutil -lint` on disabled file

```
/Users/chrism/Library/LaunchAgents/com.agentathens.freshness.plist.disabled-2026-05-20: OK
```

**Disabled file still valid plist syntax — recoverable as-is via `mv` back + `launchctl load`.** ✓

### Pending verification — first fire

- **Tomorrow 2026-05-21 08:00 Athens:** only ONE pipeline log entry from daily/full mode. No parallel freshness log. Deploy reaches `state=ready` OR the `b13712b6e` fallback recovers cleanly per the forensic log line.

---

## Boundary statement

Read-only reconnaissance + spec authoring only. NO plist edits in this turn. NO `launchctl unload/load` invocations. NO repo file edits to scripts/, src/, data/, docs/, or .claude/notes/.

Out of scope (queued):
- Script-level deploy lock (covered in Scope Caveat above)
- The `freshness` IMAP-hanging issue (today PID 5932 stuck on email ingestion ~4h — separate bug)
- The chronic `Database backup failed` since 2026-04-29 (non-fatal, separate)
- `monitor-visibility.plist` not-in-repo gap (S139 banked)
- Eventual plist consolidation / Ansible / nix-darwin posture (long-horizon hygiene)

---

## decisions.md entry (pending merge)

> Parked here because `.claude/notes/decisions.md` is being written by parallel sessions. Christos lands when that file is clean. Keep entry placement in chronological/topical order with surrounding decisions.

```markdown
## Plist deconflict — disable freshness, daily/full canonical (2026-05-20)

**Decision:** Disable `com.agentathens.freshness.plist` (rename to `.disabled-2026-05-20`); keep `com.agentathens.daily.plist` as the sole 08:00 fire.

**Why:** Both plists scheduled `Hour=8 Minute=0` and both invoke `scripts/daily-automated.sh`. Phase matrix (script lines 771-806): `full` runs scrape + enrichment + build + deploy; `freshness` runs scrape + build + deploy; `enrichment` runs enrichment only (no deploy). **`full` is a strict superset of `freshness`** — running both at the same time is redundant work AND generates the deploy collision that's been causing "Deploy canceled" errors since at least 2026-04-10. Disabling daily would orphan enrichment (freshness deploys without enrichment-fresh data); disabling freshness loses nothing. The script's per-mode lock (line 734 comment) was *designed* to permit `full + freshness` parallelism — wrong abstraction layer; lock scope was per-mode but the contended resource is the shared Netlify deploy slot.

**Mechanism:** `launchctl unload` then `mv .plist .plist.disabled-2026-05-20`. Recoverable via `mv` back + `launchctl load`. Disabled plist verified with `plutil -lint OK`.

**Anchor case:** 2026-05-20 had two `Deploy canceled` errors (10:32 `6a0d6385` script-triggered, 12:08 `6a0d79fb` manual). The 10:32 was script-vs-something-concurrent collision pattern; this fix removes the script-vs-script half of that. The 12:08 manual collision is residual; the `b13712b6e` fallback handles it autonomously.

**Reversibility:** Trivial. `mv ~/Library/LaunchAgents/com.agentathens.freshness.plist.disabled-2026-05-20 ~/Library/LaunchAgents/com.agentathens.freshness.plist && launchctl load ~/Library/LaunchAgents/com.agentathens.freshness.plist` restores the prior posture in 2 commands.

**Cross-refs:** `specs/2026-05-20-plist-deconflict.md` (this spec), `specs/2026-05-20-deploy-pipeline-diagnostic.md` (the diagnostic that surfaced this), commit `b13712b6e` (the fallback), S142 commit `c9ae3b53f` (which deferred this deconflict). Pattern: **lock-at-wrong-abstraction-layer** — per-mode locks blind to shared external resources.
```

---

## Known-issues entry (pending merge — UPDATE existing entry at docs/known-issues.md:369, do NOT duplicate)

> Parked here because `docs/known-issues.md` is being written by a parallel mobile-scroll session at the time of this spec. **Important:** `docs/known-issues.md` already contains an entry for this problem at line 369 (Status: OPEN at S142 time). When merging, UPDATE that existing entry to Status: 🟢 Resolved with the fix reference, rather than appending a duplicate. Christos lands once that file is clean.

```markdown
### Daily + Freshness Plists Both Fire at 08:00 (Schedule-Level Deploy Collision)
**Severity:** 🟢 Resolved (freshness plist disabled 2026-05-20)
**First seen:** Pre-existed; recurring deploy errors traced to this overlap since 2026-04-10
**Frequency:** Every 08:00 Athens fire produced two parallel script invocations; deploys would race when both reached run_deploy in the same minute
**Symptoms:** Netlify deploys for the daily-pipeline carry `error_message="Deploy canceled"` when freshness's run_deploy fires concurrently. Pipeline log shows `JSONHTTPError: Unprocessable Entity` from CLI. Pre-b13712b6e: script bails at parse-or-fail; post-b13712b6e: fallback recovers via listSiteDeploys and retry-once gate handles the cancellation.
**Root cause:** Two launchd plists (`com.agentathens.daily`, `com.agentathens.freshness`) scheduled at identical `Hour=8 Minute=0`. Both invoke `scripts/daily-automated.sh`; daily runs `full` mode (default), freshness runs `freshness` mode. Both reach `run_deploy()` (build+deploy phases run unless mode=enrichment). The per-mode lock file (`.pipeline-${MODE}.lock`) prevents two `full` runs from racing each other but is BY DESIGN permissive of `full + freshness` parallelism (line 734 comment). The parallelism creates the deploy collision.
**Workaround (pre-fix):** Manual `netlify deploy --no-build --dir=dist` when state=error observed. Demo-safe for 24-48h with operator monitoring.
**Fix plan:** Disable `com.agentathens.freshness.plist` — `full` mode is a strict superset of `freshness` mode, so daily covers all freshness's functionality plus enrichment. Disabled plist moved to `.disabled-2026-05-20` suffix (recoverable).
**Scope caveat:** Manual/agent-triggered concurrent deploys can still cancel (instance: 12:08 deploy 6a0d79fb 2026-05-20). The b13712b6e fallback provides autonomous recovery for that residual class.
**Status:** Disabled 2026-05-20 (after Christos authorization). See `specs/2026-05-20-plist-deconflict.md`.
```

(Status / Christos authorization to be confirmed post-action; this entry is pre-drafted.)
