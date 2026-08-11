# Agent Athens — Autonomous, Cost-Covering System — Design

**Date:** 2026-08-11
**Status:** Draft — awaiting operator review
**Decided with:** Christos (constraints and approach confirmed interactively; see §2)
**Evidence base:** 9-agent recon sweep over `.claude/notes/mistakes.md`, `docs/known-issues.md`, `docs/session-log.md` (S1–S221), `PHASE3.md`, `docs/AUDIT-2026-07-19-LEVERAGE.md`, `data/health-reports/`, `logs/`, launchd state (`launchctl list`), `data/events.db` (read-only), benchmark dirs, and `specs/routines-spike.md`. Findings referenced inline.

---

## 1. Context — what the system's own reports say (2026-08-11)

Three live outages at design time:

1. **Deploys failing since 2026-08-05** (~6 days stale site). Netlify CLI exits 1 with empty output, no server-side artifact — pre-upload (auth/CLI-level) failure. Deadman has reported `deploy: stale by 130.5h` throughout (`logs/launchd-stderr.log`, `logs/deadman-heartbeat.csv`).
2. **Enrichment at zero since 2026-08-06.** Aug 6–10: auth pre-check dies silently — `set -euo pipefail` aborts `auto-enrich.sh` at the `AUTH_OUTPUT=$(…)` command substitution (line ~338) before its own failure logging can run. Aug 11: pre-check passed but both batches were wall-clock-killed at ~1250s with 0 saves (a `WebFetch` hang on more.com observed as the proximate cause).
3. **Repo stranded on `hardening/db-tool-boundary` since 2026-07-31.** 11+ daily pipeline commits accumulated off-main; push-gate correctly refuses every push; `origin/main` frozen at 2026-07-30. The branch's own hardening work is ~20% done: the bypass-catalog test (`tests/db-guard-hook.test.ts`) exists untracked and RED; `scripts/hooks/db-guard.ts` was never implemented; `auto-enrich.sh` still grants bare `Bash`.

Recurring classes (each documented ≥2 occurrences in the project's own logs):

- **Detection-without-response:** 5 multi-day droughts, ≥4 distinct causes; alerts fire into logs/notifications, outage persists until a human session looks. Logs' own conclusion: fixing individual causes has "0% prevention rate on the next, different cause."
- **F2b streetAddress gate droughts:** new addressless venues hard-stop all deploys (3-week June drought + 2 re-fires). The proactive pre-build check the logs propose is unbuilt.
- **Athinorama ingest defects:** one row per scrape-day per tour listing (50 rows for one production), range-start dates wrong "as the modal state of the field" for non-daily runs, year-rollover on re-scrape. Flagged in 8+ consecutive sessions.
- **Post-save validator absent:** every enrichment session routes corrections to a validator role that does not exist as a running process; `event_concerns` accumulate, wrong dates stay live.
- **Source decay:** clubber.gr dead behind a captcha ~2 weeks (alert-spamming), athinorama images 0/481 (URL scheme 404s), onassis Puppeteer timeouts, ticketservices 6.4h scrape runtime.
- **Laptop dependency:** `auto-enrich.sh:41` — "effective throughput is 40/day until always-on hardware available"; machine-asleep suspected for missed 08:00 runs; observed enrichment 9–20/day vs 60/day design.
- **Measurement dead:** Phase 3 loop stalled since 07-18 (predictions P1/P2 past-due, unruled), `phase3-weekly.sh` drafted/unarmed, GSC blind since mid-May, `kpi.db` dormant since 06-03, Google indexation 7/8,475 sitemap URLs at last measurement, cite-rate 8.3% vs 20% target.
- **Monetization: zero wired.** No affiliate IDs, no newsletter, no tip jar; `netlify/functions/go.ts` (click tracking) fully built with zero callers; `addUTMParameters()` dead code; `feed.xml` advertised in headers but not generated. Zero mentions of revenue in 221 logged sessions. Working assets: GA4 live (133 ChatGPT-referral sessions/90d), 370/412 upcoming events with ticket URLs, JSON API mirror, identified winning citation pattern (`/en/kids/`), armed cloud visibility Routine.

## 2. Goals, constraints, non-goals

Confirmed with the operator 2026-08-11:

- **Profit target:** cover costs first, then grow what measurably converts. No revenue theater.
- **Runner:** harden this Mac (€0) + Claude Routines in the cloud, with **progressive migration of cloud-viable pipeline stages** to Routines (operator has subscription headroom and wants this).
- **Revenue channels:** affiliate ticket links, newsletter + donations, sponsorships/B2B. **No display ads.**
- **Operator time:** ~30 min/week steady state (digest + decisions queue). One-time setup asks are acceptable.
- **Source coverage:** the biggest platforms are mandatory — more.com hardened; **cometogether.live/el added as a new source** (Athens-only via the existing location filter).

Non-goals: paid infrastructure before revenue exists; expansion beyond Athens events; rewriting the launchd/pipeline architecture (Approach C explicitly rejected); display advertising.

**Execution sequencing:** each phase gets its own implementation plan (via `superpowers:writing-plans`) and executes in order. Phase 3 *build* work may begin during Phase 2's 14-day soak window, but the Phase 3 exit gate cannot be claimed before Phase 2's gate has passed.

## 3. Architecture principles

1. **Keep the proven stack; add, don't rewrite.** The gates (push, deploy, DB-health, count-floor, backup-integrity) demonstrably work; failures occur around them.
2. **Every alert maps to an automated first responder.** Detection→action, not detection→log. Humans get a decisions queue, never a fire drill.
3. **Computed, never asserted.** Digest numbers, exit gates, and doc statuses are generated from logs/DB. (Recon found ~97/195 checked doc claims false.)
4. **€0 infra; reversible cloud migration.** Local launchd slots stay armed-but-deferring until a cloud stage has 7 consecutive green runs; one command re-arms local.

## 4. Phase 1 — Stabilize

Target ~1 week. **Exit gate (computed by script, not asserted): 7 consecutive days with deploy-success + ≥1 event enriched/day + green push to `main`.**

| # | Workstream | Content |
|---|-----------|---------|
| 1.1 | Deploy restoration | Interactive Netlify CLI diagnosis (auth/version; failure is pre-upload). Add a pre-deploy Netlify auth check with reachable error logging (the enrichment pre-check pattern, minus its `set -e` bug). |
| 1.2 | Branch reconciliation | Merge `hardening/db-tool-boundary` → `main`, push stranded commits. Then finish the branch's purpose: implement `scripts/hooks/db-guard.ts` against the existing bypass-catalog test (ready RED), tighten `auto-enrich.sh` ALLOWED_TOOLS to the sanctioned scripts, run the hardening plan's live canary before trusting it. |
| 1.3 | Auth pre-check fix | Guard the command substitution against `set -e`; persist failure output; distinct AUTH_FAIL deadman signal. |
| 1.4 | Enrichment kill mitigation | Blocklist known WebFetch-hostile domains in headless briefs (more.com, snfcc.org, ra.co — already cataloged in memory notes); EVENTS_PER_BATCH 5→4 (logs' own "next knob"); preserve BATCH_OUT forensics. |
| 1.5 | Mac always-on | `pmset` no-sleep-on-AC; verify 08:00 firing; document in LAUNCHD-SETUP.md. |
| 1.6 | Trustworthy reports | Fix health-report denominators (e.g. "2546/421 = 604.8% enriched") and the always-firing 30s build-time threshold; reports must be readable as truth before Phase 2 automates responses to them. |
| 1.7 | Hygiene | Commit the month of uncommitted institutional memory (session-log, mistakes, newsletter-events); delete `spike/cloud-routine-eval` local+remote (66MB blob; its own commit message orders deletion). |

## 5. Phase 2 — Autonomize

**Exit gate: 14 consecutive days with zero *required* human interventions (decisions-queue items allowed; fire drills not).**

### 5.1 First-responder runbooks (the structural fix for detection-without-response)
Per deadman breach class, a scoped automated action, each with dry-run mode and live canary before arming:
- `STALE_DEPLOY` → re-run auth check → retry deploy → if still failing, file GitHub issue + high-priority ntfy.
- `SOURCE_DEAD` (≥3 runs) → auto-quarantine source (stop alert spam, mark paused, surface in digest).
- `AUTH_FAIL` → capture full diagnostics to a persistent file → escalate.
- `DB_MISSING` → halt mutating jobs, restore-from-backup runbook surfaced (never auto-restore — destructive).

### 5.2 Cloud: backstop + progressive migration
- **Backstop (immediately):** daily Claude Routine checks live sitemap `lastmod` from outside; if stale >36h → GitHub issue + alert. Covers "the Mac is off." *Prereq: operator completes the parked GitHub App install (~5 min).*
- **Spike (before any migration):** execute `specs/routines-spike.md` Phase 1 — three yes/no probes (bun install under proxy, `bun:sqlite`, Netlify egress). Scaffold exists; it was never run. Record results in the spec.
- **Migration order (each stage: 7 consecutive green cloud runs before the local slot is disarmed; local re-armable in one command):**
  1. **Enrichment** — flakiest local stage; cloud has no launchd wall-clock constraints; consolidate 6 slots into 1–2 runs. Requires DB portability (spec's enumerated candidates: published JSON API or object-store pull; decision made at implementation-plan time from spike results).
  2. **Build + deploy** — if probes pass; eliminates the stale-site-when-Mac-sleeps class.
  3. **Scrapers stay local** (5 hardcode macOS Chrome; the Mac becomes a scraper appliance; porting is a later, separate decision).

### 5.3 Ingest-class kills
- **F2b pre-address check:** at venue-verification time, addressless `verified_athens` venue → auto-geocode attempt → failure lands in decisions queue *before* the build gate can fire. The gate never fires blind again.
- **Athinorama:** collapse per-scrape-day rows to one row per production (identity = URL slug); store first real showdate, not range-start; auto-flag "yesterday + 1 year" rollovers pre-brief.
- **Post-save validator (build it):** scheduled job reads `event_concerns`; safe corrections (date/end_date/price with corroborating evidence) auto-applied with audit trail; unsafe → decisions queue.

### 5.4 Source coverage
- **more.com hardened:** fix Exhibitions-page navigation timeout; bound runtime; keep Puppeteer path (queue-it only blocks WebFetch).
- **cometogether.live/el — new scraper.** Ingest all, let the existing location filter keep Athens (`verified_athens`/`rejected_non_athens`), `/pre-scrape-check` + `--dry-run` first. Site structure investigation is an implementation-plan task; no assumptions here.
- **Repair or formally quarantine:** clubber (captcha), athinorama images (URL scheme), onassis (Puppeteer timeout), ticketservices runtime bound.

### 5.5 Operator interface
- **Decisions queue:** one generated page/file: new venues awaiting review, unsafe corrections, quarantined sources, drafted partnership/affiliate emails.
- **Weekly digest:** computed KPIs — deploy cadence, enrichment throughput, source health, visibility (Bing + GSC once unblinded), revenue clicks. This is the operator's 30 min/week.
- **Arm `phase3-weekly`** (plist spec already in the script header) so visibility measurement needs no session.

## 6. Phase 3 — Monetize + Grow

**Exit gate: first tracked affiliate click-through revenue + a ruled Phase 3 prediction showing indexation/citation growth.**

### 6.1 Revenue plumbing (days)
- Fix `go.ts` substring-hostname allowlist (open-redirect risk), verify functions deploy via the CLI path (`edge-probe` exists for this), then wire `/go/` into event-page ticket CTAs + activate `addUTMParameters()`.
- Affiliate program research + drafted applications: more.com, viva.gr, ticketservices, cometogether → decisions queue for operator submission.
- Newsletter: auto-generated weekly "This week in Athens" from the DB; Buttondown free tier as the default provider (operator may swap — nothing couples to it); generate the missing `feed.xml` (headers already configured).
- Tip jar (Ko-fi/BuyMeACoffee) on about/colophon.
- Sponsorships: submit the This Is Athens (ACVB) + Athens Culture Net applications already selected in `docs/geo-decisions.md`.

### 6.2 Traffic engine (weeks; sequenced by `docs/AUDIT-2026-07-19-LEVERAGE.md`)
1. Slug repair with redirects (re-date the cutover constant; `_redirects` for ~238 live defective URLs; "the single largest citability leak").
2. Persist the content-hash manifest so sitemap `lastmod` stops reading "today" everywhere.
3. Strip JSON-LD leaks (timeliness-expires comment, markdown tables) from live descriptions.
4. Locale project: open the hreflang gate, lift Greek-hub sitemap suppression (~1,163 hubs; "highest ceiling").
5. GSC unblinding via the S138 OAuth fallback (service-account JSON already at `~/.config/agentathens/gcp-kpi-reader.json`).
6. Restart the Phase 3 probe loop: rule on P1/P2, resume prediction-per-fix cadence; D1 (jazz zero-events) and D2 (weekend window) from the queue.

### 6.3 Honesty clause
Costs today are ≈€0 cash (Netlify free tier, existing Max subscription). "Cover costs" is therefore reached at the first euro; the real Phase 3 measure is **whether tracked revenue and cited-traffic grow month over month**. If affiliate programs reject a sole operator or indexation does not recover, the fallback channels are newsletter sponsorship and venue B2B — both routed through the same decisions queue.

## 7. Error handling & testing standards

- House TDD: no production code without a failing test first; retrofitted pins use a mutation run as RED (break the guard, watch the suite fail, restore).
- Recurring-class fixes get **synthetic fixtures that assert their own preconditions** (a fixture that stops exercising the rule must fail loudly).
- Responder runbooks, allowlist changes, and plist changes ship **dry-run first, then one live canary** through the real launchd path before arming (allowlist changes have caused silent droughts before).
- Cloud migration steps are reversible: local slot disarmed only after 7 consecutive green cloud runs; re-arm is one command; the deadman watches outcomes substrate-agnostically (live sitemap), so it scores cloud and local runs identically.
- Every exit gate in §4–§6 is computed by a script committed with the phase.

## 8. Operator asks

One-time: GitHub App install (~5 min); affiliate/partnership submissions (drafted for you); newsletter + tip-jar account creation; possibly a Netlify re-auth during 1.1.
Weekly (~30 min): read digest, clear decisions queue.

## 9. Risks & open questions

- **Unattributed DB deletion (2026-06-30)** remains unexplained; backups/gates now contain the blast radius, but the vector is unknown. Watch for recurrence; keep the incident spec's monitoring in place.
- **Affiliate program availability** for Greek ticket vendors is unresearched — Phase 3 plumbing lands regardless (UTM/click data also serves partnership negotiation), but revenue timing depends on acceptance.
- **Routine run caps and capabilities** are unconfirmed (the spike exists to answer this); migration order may change based on results.
- **Indexation recovery** (P1) is unruled; if Google remains closed, the traffic engine leans on Bing (position already 4.5) and AI-assistant citations (referrals already observed).
- **Enrichment wall-clock kills** may have causes beyond WebFetch hangs (model latency, brief growth); 1.4 mitigations are hypotheses to verify with BATCH_OUT forensics, not assumed fixes.

## 10. Success metrics (all computed)

| Phase | Metric | Source |
|-------|--------|--------|
| 1 | 7 consecutive green days (deploy + enrich + push) | deploy-cadence.log, enrichment_log, git |
| 2 | 14 days zero required interventions; enrichment ≥40/day; new-source events live | deadman heartbeat, enrichment_log, events.db |
| 3 | First tracked affiliate click; MoM growth in cited traffic + newsletter subscribers | /go/ Blobs logs, GA4, probe results |
