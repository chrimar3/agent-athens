# PHASE 3 — the agentathens.com visibility & citability loop

*The one-stop doc. Created 2026-07-19 at repo root for findability; the operative copies live where
the tools need them (see "Where everything lives" below), and this file mirrors them.*

## What Phase 3 is

An open-ended, autonomous loop that makes agentathens.com the source AI answer engines cite.
Phases 1–2 fixed our code; Phase 3's bottleneck is crawl latency, index adoption, and authority —
things that move on engine time. So the loop is **measure → fix → deploy → WAIT → re-measure**,
run as weekly sessions, every fix shipped with a falsifiable prediction.

## Status snapshot (2026-07-19 — verify against latest measurements before acting)

| Metric | Value | Date |
|---|---|---|
| Citation cite-rate (frozen Perplexity probe) | **8.3%** — 2/20 queries, via `/en/kids/` @4 and `/en/greek-music/` @12–14 | 07-18 |
| Google (GSC, 28d) | 22 clicks / 1,877 impressions / avg pos 11.3 / 243 pages with impressions | 07-18 |
| Bing | avg position 5.78 (IndexNow keeps it fresh) | 07-18 |
| GA4 AI referrals (90d) | **chatgpt.com is the top referrer: 133 sessions**, landing on /en/ hubs | 07-18 |
| Google event-page discovery | **STALLED** — 13/15 sampled event pages "unknown to Google", crawls stopped ~Jul 1 | 07-19 |

**Fixes shipped in Session 1 (07-19):** GSC sitemap submission — immediate 4/4 + automated on every
pipeline deploy (Phase 6b, `scripts/gsc-submit-sitemaps.ts`); llms.txt now links indexable /en/
variants + all 17 EN hubs (it was steering AI agents to noindexed Greek pages).

**Open predictions:** P1 — fresh event pages ≥2/5 indexed by ~07-26 (sitemap submission works).
P2 — one new /en/ hub cited by ~08-02 (llms.txt as citation lever; weak-signal).

## Tiered goals (work top-down; a tier is open until its gate holds)

- **T0 — Truth discipline (never closes):** frozen instrument (rubric, judge persona, 20-query
  probe set — verbatim, never edited, no "queries we now win"). Weekly probe + Class-4 console
  pull; monthly full v2-sample regression. Probe & console stay PARALLEL to the composite. Never
  tune content to a proxy.
- **T1 — Index everything we mean to be indexed.** Gate: every v2-sample page indexed or
  excluded-by-policy; new event pages reach Google inside their indexable window. GSC/Bing API use
  is read + sitemap-submit + URL-inspect ONLY.
- **T2 — Widen the winning pattern to the 18 losing queries.** Gate (= Bronze, the headline goal):
  **cite-rate ≥20% on two consecutive weekly probes, ≥4 queries citing, ≥3 pages cited.**
  The recipe is proven by /en/kids/: an indexed EN hub with a real answer capsule. Per-query battle
  plan: `T2-SURFACE-MAP.md` (benchmark branch) — 9 strengthen / 4 build / 3 inventory-limited /
  2 geo-confound; recurring themes: "Athens, Greece" geo-hardening, fall-forward empty states,
  /en/ intersection pages, count capsules. Two live defects queued first: D1 jazz genre-tagging
  (jazz pages show 0 events while Half Note lists 6), D2 weekend window rotates a day early.
- **T3 — Authority.** thisisathens.org beats us on authority (52 citations across our losing
  queries). Fable PREPARES (Wikidata/sameAs audit, llms.txt surface, outreach drafts); Fable never
  SENDS — all outbound is operator-approved.
- **Stretch (after Bronze):** cite-rate ≥35%/≥50%, cited position ≤5, GSC pos <9, AI referrals 2×.

## Golden rules

- Worktree + branch per change-set; **never work in the main worktree** (the daily pipeline
  auto-deploys it ~08:30). Merge only with gates green (build exit 0, `bun test` 0 fail, tsc clean).
- **Verify every premise** — including numbers in this file — against current repo/DB/live/latest
  runs. Refuting with evidence closes an item.
- **Never fabricate** events, prices, venues, dates, or judge-pleasing content. Omit beats invent.
  Index the full, gate the empty.
- Credentials in `~/.config/agentathens/` (Perplexity, GCP service account, Bing; GA4 property
  525325167). Never commit or echo them.
- **Operator-only:** dormant-locale flip, Bios/Ρομάντσο split, prod-DB row repairs, dedup-arc
  authorization, any outreach send, scraper additions (exhibitions + Herodion inventory gaps).

## Automation

- **Cloud watcher (ARMED):** routine `agentathens-phase3-visibility-watcher`
  (`trig_018stnwUThMXJJsX8QGK4Sad`), Sundays 09:47 Athens, first fire 2026-07-26. Keyless
  public-web scope: site health checks, 20-query search-presence panel (labeled non-frozen),
  thisisathens.org watch. Reports: https://claude.ai/code/routines/trig_018stnwUThMXJJsX8QGK4Sad
- **Local weekly script (DRAFTED, UNARMED):** `scripts/phase3-weekly.sh` — deterministic
  measurement layer + headless judgment session; arming it under launchd is one step, on request.
- **What must stay local regardless:** the frozen probe + GSC/GA4/Bing pulls (keys), the T1
  diagnostic (events.db), and any fix that deploys (production builds from the local tree).

### Cloud routine track — operator setup steps (in order)

1. **Sign in to GitHub in Chrome and install the Claude GitHub App**, scoped to
   `chrimar3/agent-athens` only. Start: claude.ai/code → "Select repo…" → "Connect to GitHub"
   (or https://claude.ai/code/onboarding?magic=github-app-setup). Claude drives everything EXCEPT
   the login — passwords are operator-only. *Status 2026-07-19: flow parked at GitHub sign-in.*
2. Then tell Claude **"GitHub connected"** → watcher routine upgraded: repo attached, weekly report
   filed as a GitHub issue.
3. Decide on pushing the benchmark branch (repo is PUBLIC — probe/GSC numbers would be public too).
4. If cloud environments gain secrets support, the probe key can move cloud-side.

## How to continue the loop

Open a Claude session in the **phase-3 worktree** (`../agent-athens-phase3`) and say
**"continue phase 3"** — its `CLAUDE.md` (the operative law, same content as this doc's rules) and
the benchmark-branch state files carry everything. Next session: **on/after 2026-07-26**, starting
with the measurement pass (P1/P2 verdicts against that morning's cloud-watcher report + fresh local
probe/console/diagnostic runs).

## Where everything lives

| Artifact | Location |
|---|---|
| This overview (mirror) | `PHASE3.md` (main repo root — you are here) |
| Operative law (auto-loads in sessions there) | `../agent-athens-phase3/CLAUDE.md` |
| Loop log: predictions, verdicts, queue, heartbeats | benchmark branch → `benchmark/visibility-baseline-20260708/PHASE3-LOG.md` (worktree `../agent-athens-visibility-baseline`) |
| Per-query battle plan | same dir → `T2-SURFACE-MAP.md` |
| Measurement history (probe/console/diagnostics) | same dir → `probe-runs/<date>/` |
| Frozen instrument (never edit) | same dir → `instrument/` |
| Measurement tooling | same dir → `tooling/` (probe-perplexity, class4-console, t1-event-index-diag) |
| Cloud watcher routine | https://claude.ai/code/routines/trig_018stnwUThMXJJsX8QGK4Sad |

*Keep this mirror in sync when the law changes — the operative copy in the phase-3 worktree wins on
conflict.*
