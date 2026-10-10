# Analyst findings plan — 2026-10-05

Worker session, plan-then-proceed, requested by the maintainer. Scope: the open
analyst findings #11, #13, #20, #21. Also noted: `queue` items #1 and #10.
Skipped: #24 and #25 (`needs-input`, waiting on the maintainer).

Base: `main` at `2e5e4c4` (merge of PR #32, 2026-10-01). Issues read only with
`.github/scripts/trusted-issue-thread.sh`. Nothing here was verified against
`events.db`, `data/health-reports/`, `data/kpi.db` or the operator's
launchd/container state, because none of them is in a cloud clone. Where a
claim depends on them it says so.

Order: the sensor (#11) comes first, because no other metric can be read
while the scoreboard is stale. After that the analyst priority applies:
thesis (#21) > data (#13, #20) > reliability > code health.

## Summary

| # | Finding | Verdict | Touches protected path? | Phase 2 |
|---|---|---|---|---|
| 11 | Scoreboard on `main` stale since 2026-09-25 | **NEEDS OPERATOR**, plus a **MAINTAINER DECISION** on the spec | The spec fix would edit `.claude/analyst-triage.md` (protected) | no |
| 21 | `citations` / `crawlers` hard-coded `null` | **CLOUD-DOABLE NOW** | no | **yes** |
| 13 | ticketservices yield 0 (2026-09-18) | **NEEDS OPERATOR** (likely a one-day transient, already recovered) | no | no |
| 20 | snfcc yield 6 vs 30-day mean 21.0 | **NEEDS OPERATOR** | no | no |
| 1 | `queue`: scraper yield canary (follow-ups) | noted only, not in this session's scope | — | no |
| 10 | `queue`: script error messages, batch 2 | noted only, not in this session's scope | — | no |

---

## #11 — Sensor repair: `data/scoreboard.json` stale (sensor blocker)

**Root-cause hypothesis: two causes, stacked.**

1. **By design, the pipeline no longer writes the scoreboard to `main`. The analyst still reads it from `main`.**
   - `scripts/daily-automated.sh:60-69`: "the pipeline NEVER commits to or pushes main. Its allowlisted data artifacts are committed to the separate branch `pipeline-data`". `scripts/daily-automated.sh:111`: `readonly PIPELINE_DATA_BRANCH="pipeline-data"`. `scripts/daily-automated.sh:744` puts `data/scoreboard.json` on that allowlist.
   - This came in with `d37383b` ("Security loop round 3: … pipeline-data branch", authored 2026-09-23) and reached `main` through the security-loop merges.
   - `.claude/analyst-triage.md` steps 0, 1 and 4 read `data/scoreboard.json` and `git log -p -- data/scoreboard.json` from the clone's checked-out branch (`main`). That is why the analyst saw the file stop at `9b601d0` (2026-09-25).
   - `git log origin/pipeline-data`: one commit, `2a6f531 chore: daily pipeline update 2026-09-27`. Its `data/scoreboard.json` has `generated_at` = `2026-09-27T12:56:26.453Z`. That is fresher than `main`'s, but it is still eight days old today.
   - So even a perfectly healthy pipeline would leave the analyst's sensor stale forever. This part is structural, not operational.
2. **The container pipeline has not pushed `pipeline-data` since 2026-09-27.** No commit on `origin/pipeline-data` after `2a6f531`. The cause is on the operator's Mac (container job not scheduled/running, push refused, or the run failing before the artifact commit). I cannot check it from a clone. Evidence the 09-27 run was not healthy: its health report shows `events: 0` with status `ok` for athinorama, halfnote, more, onassis, snfcc and ticketservices (`git show origin/pipeline-data:data/scoreboard.json`). `78fc3b1` ("route Node's default agent through the egress proxy", 2026-09-27) may be the fix for that. That is a hypothesis; I have not verified it.

Side observation, not acted on: on 2026-09-27 the health report shows status glyph `v`/`ok` with 0 events for six sources. It is the first container run (all deltas equal the counts, so there was no prior history), so this may only be first-run behaviour of `scripts/health-check.ts`. It is worth a look once real runs resume.

**Smallest fix.**
- (a) Spec: point the analyst at the branch the pipeline actually writes, e.g. read `git show origin/pipeline-data:data/scoreboard.json` and `git log -p -7 origin/pipeline-data -- data/scoreboard.json` in steps 0, 1 and 4 of `.claude/analyst-triage.md`, and the same in `.claude/analyst-deep.md`. One file each, a few lines.
- (b) Operator: find out why `docker/aa-run.sh freshness` has not produced and pushed a `pipeline-data` commit since 2026-09-27, and get one through.

**Files.** (a) `.claude/analyst-triage.md` and `.claude/analyst-deep.md`, both **protected** (`.github/path-guard.json`). (b) None in the repo, unless the operator finds a code bug.

**Cloud-doable?** No. (a) is a protected path: the worker proposes, the maintainer edits. (b) needs the Mac (launchd/container state, `logs/`, the local `pipeline-data` ref).

**Test that would fail first.** For (a), there is no unit test for a prompt spec. The check is the next analyst run: step 0 passes on a fresh `pipeline-data` scoreboard. For (b): `git log -1 --format=%cI origin/pipeline-data -- data/scoreboard.json` is less than 36h old.

**Metric.** Age of `generated_at` in the scoreboard the analyst reads. T+14: an unbroken run of daily `pipeline-data` commits with no gap over 36h. T+28: the same, and the analyst has stopped commenting "stale" on #11.

**Verdict: NEEDS OPERATOR** (b) **+ NEEDS MAINTAINER DECISION** (a, protected path). Doing (a) without (b) only moves the staleness from 10 days to 8 days.

---

## #21 — Scoreboard: `citations` / `crawlers` hard-coded `null` (thesis)

**Root-cause hypothesis.** The issue's diagnosis holds on `2e5e4c4`:
- `scripts/assemble-scoreboard.ts:86-87` types both keys as literal `null`. The comment at `:84-85` points at "separate issues" that were never filed.
- `scripts/assemble-scoreboard.ts:255-256` writes `citations: null, crawlers: null` unconditionally.
- `scripts/kpi-init.ts:58-137` defines the tables: `manual_citation_log(observed_at)`, `bwt_grounding_queries(export_window_end, imported_at)`, `bwt_ai_citations(export_window_end, imported_at)` and `server_log_ai_bots(ts)`.
- `scripts/kpi-report.ts` already has `tableExists`, `rowCount` and a query_only `openReportDb`. They are module-private except `openReportDb`.
- `tests/assemble-scoreboard.test.ts:239-244` pins the `null` placeholders.

**Smallest fix.** Touch only `scripts/assemble-scoreboard.ts`, plus `scripts/kpi-report.ts` (export the two helpers), plus the test file:
- `--kpi-db=PATH` flag and `kpiDbPath` option; default `data/kpi.db`.
- `citations = { manual_citation_log, bwt_ai_citations, bwt_grounding_queries }` and `crawlers = { server_log_ai_bots }`, each table as `{ rows, latest }`. `latest` is the max of the table's data-date column cut to `YYYY-MM-DD`, or `null`.
- `sensor_status.citations` / `.crawlers` take one of: `missing` (no kpi.db, or a table not initialized), `empty` (0 rows), `stale` (newest `latest` more than 8 days before Athens today, or in the future), `fresh`, or `malformed` (the file exists but cannot be read).
- A missing kpi.db never throws and is never created.

**Protected?** No. `scripts/assemble-scoreboard.ts`, `scripts/kpi-report.ts` and `tests/assemble-scoreboard.test.ts` are not in `.github/path-guard.json`. `scripts/daily-automated.sh` (protected) needs no change, because `run_scoreboard` already calls the script with no flags.

**Cloud-doable?** Yes. Fixture kpi.db files in a temp dir. No events.db, health-reports or network needed.

**Test that fails first.** In `tests/assemble-scoreboard.test.ts`, a missing / empty / fresh / stale fixture kpi.db each produces the matching `sensor_status` and per-table `{rows, latest}`. Today they fail, because both keys are `null`.

**Caveats.**
- `docker/aa-run.sh` does not mention `kpi.db` (`grep -n kpi docker/` returns nothing). The production run in the container will therefore most likely report `missing` until kpi.db is mounted. That is still the honest reading the issue asks for. Mounting it is a `docker/**` (protected) change and the maintainer's call.
- The T+14 check cannot run until #11 is fixed, because the analyst does not see a fresh scoreboard.

**Metric.** `citations` and `crawlers` are non-null, and `sensor_status` has a verdict for each. T+14: both are non-null in at least 12 of 14 daily scoreboards (on `pipeline-data`, once #11 is fixed), and each verdict matches `bun run scripts/kpi-report.ts` on the pipeline host. T+28: the first `fresh` reading appears once a weekly citation import lands.

**Verdict: CLOUD-DOABLE NOW.** Gate: 3 files; no DB schema change (it reads existing tables; the scoreboard JSON shape change is the issue's stated goal); no phase reordering; no protected path; one test changes from "is null" to a stronger shape assertion, so no test is weakened. The product choices the issue left open are listed under "unsure" in the PR.

---

## #13 — Yield canary: ticketservices 0 (data)

**Root-cause hypothesis: a one-day transient that has already recovered.** Per-snapshot `health_report.scraping.ticketservices` on `main`: 102 (09-14) → **0, warning, delta −102 (09-18)** → 108 (09-20) → 108 (09-21) → 111 (09-22) → 109 (09-24) → 112 (09-25). The 30-day mean in the issue is 105.5, so 108–112 is back above the 63.3 threshold. The 09-27 `pipeline-data` reading (0) comes from the first container run, where five other sources also read 0. That points to a container or first-run cause (see #11), not to a ticketservices scraper change. No commit touched the ticketservices scraper between 09-14 and 09-20 that I could link to the drop, but I did not search exhaustively.

**Smallest fix.** Probably none. The operator runs `bun run scripts/yield-canary.ts --dry-run` on the host. If it reports `ticketservices` ok, close #13 as a recovered transient. If the container keeps reading 0 after #11 is fixed, open a new issue about the container egress (not this one).

**Files.** None expected. If a selector broke: `scripts/scrape-all.ts` (not protected).

**Cloud-doable?** No. The canary reads `scrape_stats` in `events.db` (not in the clone), and `www.ticketservices.gr` is blocked by this sandbox's egress policy (the proxy rejected CONNECT; checked 2026-10-05).

**Test that would fail first.** No code test applies until a cause is known. The check is `yield-canary --dry-run` on the host.

**Metric.** Daily ticketservices yield. T+14: `yield-canary --dry-run` reports ok and the 30-day mean is ≥ 63.3. T+28: no re-trip.

**Verdict: NEEDS OPERATOR** (run the dry-run canary on the host, then close or keep open).

---

## #20 — Yield canary: snfcc 6 vs mean 21.0 (data)

**Root-cause hypothesis: unknown. Seasonal and scraper causes are both open.** Per-snapshot snfcc yield on `main`: 19–20 (09-02..09-06) → 15 (09-07) → **5, warning (09-08)** → 23 (09-13, 09-14) → 30 (09-18) → 23 (09-20) → **6, warning (09-21)** → 6 (09-22) → 9 (09-24) → 10 (09-25). It recovered partially but is still under the 12.6 threshold on the last `main` snapshot. On 09-08 it fell to 5 and fully recovered within days, so the source is volatile. The SNFCC category listings may just be thin between seasons. I could not check that: `www.snfcc.org` is blocked by this sandbox's egress policy. Commits to `scripts/scrape-snfcc.ts` since 09-01 are all security-loop hardening (`d2b4868`, `f68c278`, `57266ad` on 09-23; `191d50f` on 09-24). They came after the 09-21 drop, so they cannot have caused it. Whether they affect yield now is unverified.

**Smallest fix.** The operator runs `bun run scripts/scrape-snfcc.ts` (or `scrape-all.ts --source snfcc --dry-run`) on the host and compares the per-category counts with what `https://www.snfcc.org/ekdiloseis/` shows in a browser. If the site lists about 10 events, the drop is real (seasonal): close #20 and record the seasonality in the ledger. If the site lists more, fix the selector or pagination step in `scripts/scrape-snfcc.ts`.

**Files.** Possibly `scripts/scrape-snfcc.ts` (not protected).

**Cloud-doable?** No. The source site is unreachable from here, and the canary needs `events.db`.

**Test that would fail first.** If a selector broke: a fixture-HTML test for the snfcc parser using the live page shape. Not writable without the page.

**Metric.** Daily snfcc yield. T+14: `yield-canary --dry-run` reports `snfcc` ok, or the issue is closed as seasonal with the evidence recorded. T+28: no re-trip.

**Verdict: NEEDS OPERATOR.**

---

## Noted: `queue` items #1 and #10

- **#1 Scraper yield canary.** Shipped (`ef269fa59`, `1007b1079`). Still open on purpose, for the blind spots the maintainer listed in their 2026-09-17 comment: de-listing from `src/config/active-source-ids.ts` (protected), the 90-day dark decay, and below-quorum cycles. Not worked here. The remaining items read as decisions, not a single code task.
- **#10 Script error messages, batch 2.** A green-zone code-health batch. It was not in this session's scope (analyst findings only), and its first step (`run-enrichment-pipeline.ts --id` failure paths) is independent of everything above. It is a good next nightly worker pick.

## What I did not do

- I did not edit `.claude/analyst-triage.md` / `.claude/analyst-deep.md` (#11 fix (a)), `scripts/daily-automated.sh`, `docker/**`, or any other protected path.
- I did not run any scraper, the canary, or the pipeline. None of them can run meaningfully in the clone.
- I did not close any issue or apply `maintainer-approved` / `queue`.
- I did not act on the 09-27 "0 events with status ok" observation beyond noting it.

## What I was unsure about

- Whether the operator intends the analyst to read `pipeline-data`. The alternative is a different hand-off, such as the pipeline exporting the scoreboard some other way. That is the maintainer's design choice.
- Whether the six zero readings in the 2026-09-27 container run were fixed by `78fc3b1`. Unverified.
- For #21: which date column counts as "latest" for the BWT tables (`export_window_end` chosen over `imported_at`), and whether one 8-day threshold suits `server_log_ai_bots`. No importer for that table exists yet.
