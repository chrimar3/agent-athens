# S135 Build-Freshness Alert Spec

**Filed:** 2026-05-11
**Status:** Spec only. Implementation deferred to a future session per reactivation trigger below.
**Inputs:** S133 Insight 1 (9-day silent outage) — see `docs/session-log.md` S133 entry.

---

## 1. Failure mode being prevented

**Verbatim from S133 Insight 1:**

> 9-day silent outage; an `mtime`-based signal would have screamed continuously during a healthy pipeline due to `writeIfChanged`; passive CSV markers don't alert.

In concrete terms: the daily pipeline stopped producing build output for nine consecutive days without any human or automated party noticing. The site continued serving stale content. No existing monitor caught it because:

- **`mtime`-based signals are noisy by design.** `writeIfChanged` skips writes when the output is identical to disk — meaning a healthy pipeline produces zero mtime changes for files that happened to be stable that day. An mtime monitor would either scream every day (false positives) or never (false negatives). Useless either way.
- **CSV / log markers are passive.** They record state but don't surface it. Someone has to deliberately go look at them. The 9-day gap shows nobody did.
- **The failure was silent at every layer:** scrapers didn't error, the wrapper didn't error, deploys didn't fail (none happened). Nothing went red. The system "succeeded" by not running.

This alert exists to make the absence-of-build a loud event, not a quiet one.

---

## 2. Three candidate signals + tradeoffs

### Signal (i) — Last commit timestamp on `origin/main`

- **Source:** `git log -1 origin/main --format=%ct` or `gh api repos/:owner/:repo/commits/main`
- **Detects:** "no recent development activity on main"
- **Pros:** external, queryable from any machine; no local state; cheap to check; survives the local box being down
- **Cons:** detects development activity, **not pipeline execution**. A healthy pipeline can run for weeks without producing a commit if `writeIfChanged` finds nothing new. A broken pipeline can coexist with active dev commits to other files.
- **Verdict:** wrong target. Detects the wrong noun.

### Signal (ii) — Last successful Netlify deploy ID + timestamp via Netlify API

- **Source:** `GET https://api.netlify.com/api/v1/sites/<site_id>/deploys?per_page=1` filtered to `state=ready`
- **Detects:** "last production deploy succeeded and completed"
- **Pros:** **directly measures the thing that matters** — production state. Survives local box failure. Authoritative — if Netlify shows no recent deploy, no recent deploy happened, full stop.
- **Cons:** requires `NETLIFY_AUTH_TOKEN` (already in repo for CLI deploys per memory `agent_athens_deploy_workflow.md`); network dependency for the alert itself (handled by retry + alert-on-API-down as a separate signal); doesn't distinguish "deploy ran but only changed nothing" from "deploy ran with stale data."
- **Verdict:** production-truth signal. **The primary signal.**

### Signal (iii) — Build-log timestamp written deliberately by the wrapper

- **Source:** wrapper script (likely `scripts/daily-automated.sh`) writes a timestamp to a known file (e.g. `data/last-successful-build.json`) on successful completion — only on success, after all validation passes
- **Detects:** "wrapper completed end-to-end successfully and recently"
- **Pros:** under our control; no external dependency for writing; fast to read; can include richer state (build duration, events count, schema warning delta)
- **Cons:** requires wrapper modification (small); the alert runner needs to read this file independently — passive again unless something actively checks; vulnerable to "wrapper writes success on a partial failure" if not careful about placement
- **Verdict:** wrapper-success signal. Cheap to add. Complements (ii).

### Recommended: layer (ii) + (iii)

- **(ii)** answers "is the production site fresh?" — what users see
- **(iii)** answers "did the pipeline run successfully and recently?" — what the wrapper did

Both `>24h` = real outage (the only deploy/build cadence is daily; 24h+ stale means a missed day, 48h+ means a multi-day gap).

Either-alone failure modes:

- `(ii)` fresh but `(iii)` stale → wrapper isn't running, but a manual or CI-triggered deploy happened. Investigate the wrapper.
- `(ii)` stale but `(iii)` fresh → wrapper claims success but no deploy happened. Investigate the deploy step at the end of the wrapper.
- Both stale → the S133 failure mode. Investigate immediately.

Discard (i) — wrong target.

---

## 3. Alert mechanism options

Implementation session picks one. Listed without ranking — the choice depends on the runtime environment and how aggressively the alert should escalate.

### (A) `launchd` job that fires on threshold breach

- **Mechanism:** local `launchd` plist with `StartCalendarInterval` (e.g. every 6 hours) that runs a check script. Check script queries Netlify API + reads local timestamp file. On breach: log to file, post to a chat webhook (if configured), open a `Notification Center` notification.
- **Pros:** matches existing project pattern (memory: `auto_enrich_batch_config.md`, `auto-enrich-pipeline-fixes.md` reference launchd-based daily pipeline). Cheap. Local. Active.
- **Cons:** only fires if the local machine is on; doesn't help if the silent outage is "machine has been off."

### (B) Pre-commit / pre-build script exits non-zero if last-deploy >24h

- **Mechanism:** a check inserted into the wrapper itself or as a pre-commit hook. Refuses to proceed if the last deploy is older than threshold.
- **Pros:** can't be ignored; forces investigation before any further action
- **Cons:** counterproductive if the goal is to *restart* the pipeline — the script that should be unblocking the outage is the one being blocked by the check. Also requires a developer to attempt a commit/build to fire, which is exactly what doesn't happen during a silent outage.

### (C) Cron job writing to a known-checked location

- **Mechanism:** cron job runs the check every N hours; writes alert-or-OK state to a file that something else (dashboard, terminal startup, IDE) reads.
- **Pros:** decouples checking from alerting
- **Cons:** still passive unless the "something else" actively surfaces it. The "known-checked location" is exactly the failure mode of CSV markers — nobody looks.

### Implementation-session call

(A) is closest to existing project patterns and gives an active surface (Notification Center). (B) is wrong shape — it punishes the recovery path. (C) repeats the failure mode this spec exists to prevent.

**Tentative pick** (for implementation-session reference only, not final): (A) with launchd + a webhook poke + Notification Center fallback.

---

## 4. Non-coverage statement

**This alert does NOT detect:**

- **Partial deploys** — some pages updated, others not. The deploy ID succeeds; the alert is green; specific pages stay stale. Coverage gap: needs a per-page freshness check, which is a separate monitor.
- **Deploy succeeded but with stale data** — the build picked up a stale DB or used cached scraper output. The deploy completes; the alert is green; the content is wrong. Coverage gap: needs content-level diffing or scraper-recency checks.
- **Deploy failed silently mid-build** — the deploy step errored after writing the success-timestamp file (signal iii) but before invoking Netlify (signal ii). Signal (iii) fresh, signal (ii) stale — only the layered check catches this. If only signal (iii) were used, this would be invisible.
- **Daily pipeline scheduled but not actually firing** — if the wrapper logs success on failure (e.g. catches an error, writes the timestamp anyway, exits 0), signal (iii) lies. Hardening (iii) to require all subprocess exit codes = 0 before writing reduces but does not eliminate this.

**Coverage:** "no recent deploy at all" — the exact failure mode of S133. Any more nuanced staleness requires additional monitors.

The non-coverage gaps are surfaced explicitly so future readers know what this alert is and isn't. **Coverage gaps are not failure conditions of this alert** — they are out-of-scope by design. Adding them turns this into a different alert with different tradeoffs.

---

## 5. Reactivation trigger

This spec sits in the queue. Implementation is its own scoping session.

**Trigger conditions for implementation:**

- Any further silent outage observed (build absent >48h without anyone noticing), OR
- End of Sprint 3

The first condition is the empirical case — if the pattern recurs, no further justification needed. The second condition is a forcing function: even if no further outage occurs, the spec doesn't sit forever.

---

## What this spec does NOT cover

- The specific webhook endpoint / chat channel for alert routing — implementation-session call
- The exact threshold (24h vs 36h vs 48h) — depends on the operator's tolerance; trivially tunable
- Backfill alerting (was the system in a degraded state historically?) — not the goal; this is forward-looking
- Replacement of the existing pipeline log files — they remain as evidence trail, not as alert surface
