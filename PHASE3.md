# PHASE 3 — autonomous visibility & citability loop for agentathens.com

**This file is the single operative document for the loop** — versioned in git, present in every
checkout. The phase-3 worktree's `CLAUDE.md` only bootstraps a session into this file. It has two
kinds of sections: **§IMMUTABLE** (operator-owned — Fable proposes changes in the log, never edits)
and **§PLAYBOOK** (Fable-owned — the self-improving part, amended under the protocol in §4).

---

## §1 Mission and what success looks like [IMMUTABLE]

**Mission:** make agentathens.com the source AI answer engines cite for Athens cultural events —
measured by the frozen instrument, never by self-assessment.

**Success, in increasing order:**

- **Per-session success** (every autonomous run must achieve this or explain why in the log):
  every open prediction ruled on against fresh measurements; at least one queue item moved to
  fixed-with-prediction / refuted-with-evidence / blocked-with-reason; PHASE3-LOG.md updated and
  committed; nothing merged with failing gates; no fabricated content anywhere.
- **BRONZE (the arc's headline goal):** frozen-probe cite-rate **≥20% on two consecutive weekly
  probes**, with **≥4 distinct queries** citing and **≥3 distinct pages** cited; AND the T1 gate
  holds (every v2-sample page indexed or excluded-by-policy; fresh event pages reach Google inside
  their indexable window); AND T3 prep delivered (audits + drafted outreach, unsent).
- **SILVER:** cite-rate ≥35%, average cited position ≤5, GSC average position <9.
- **GOLD:** cite-rate ≥50% sustained a month, GA4 AI-referral sessions ≥2× the July baseline
  (133/90d), at least one losing-query family flipped end-to-end (e.g. venue queries).
- **HONEST FAILURE (equal-value exit):** if 8 consecutive weekly cycles pass without Bronze, stop
  fixing and produce the analysis: which ceiling bound us (authority / geo-confound / inventory /
  crawl), with the evidence. That document closes the arc as legitimately as Bronze.

**Measurement sources of truth:** cite-rate = `tooling/probe-perplexity.ts` (frozen 20 queries,
3 runs, weekly); indexation = `tooling/t1-event-index-diag.ts` + GSC URL-inspection;
console = `tooling/class4-console.ts`. All on the benchmark branch; every number in a report
carries its measurement date.

## §2 Hard constraints [IMMUTABLE]

1. **The instrument is frozen.** Rubric, judge persona, 20-query probe set: verbatim, forever.
   No added queries, no "queries we now win", no geo-editing the queries. Confounds (Athens-GA
   pollution, API geo limits) are RECORDED, not patched around.
2. **Never fabricate**: events, prices, venues, dates, quotes, or content shaped to please a judge
   or engine. Omit beats invent. Index the full, gate the empty — a new surface ships only with
   real inventory behind it.
3. **Never tune to the proxy.** The composite is a regression guard; the probe + GA4 AI-referrals
   are the goal metrics. A change whose only justification is "raises a score" is rejected.
4. **Workspace discipline:** never work in the main worktree (the daily pipeline auto-deploys it
   ~08:30 Athens). Branch per change-set in the phase-3 worktree; merge to `fable-impact` only with
   build exit 0 + `bun test` 0 fail + tsc clean; deploys happen via the pipeline only.
5. **Credentials** stay in `~/.config/agentathens/` — never committed, echoed, or relocated.
   GSC/Bing API scope: read + sitemap-submit + URL-inspect ONLY. GA4: read-only.
6. **Operator-only decisions** (surface in log, never do): dormant-locale flip, Bios/Ρομάντσο venue
   split, prod-DB row repairs, dedup-arc actions, ANY outreach send or off-site publishing, scraper
   additions, spend beyond ~$1/week probe budget, and any edit to §IMMUTABLE sections.
7. **Verify every premise before acting on it** — including every number and claim in this file's
   §PLAYBOOK. The repo's ledger proves briefs rot in days. Refuting a premise with evidence is a
   completed work item.
8. **Prediction-per-fix:** nothing merges without a falsifiable prediction (what the NEXT
   measurement must show, with a date) written to PHASE3-LOG.md in the same session.

## §3 PLAYBOOK — evidence, hypotheses, queue [MUTABLE by Fable under §4 protocol]

*Last amended: 2026-07-19 (session 1). Every claim here is a snapshot — re-verify before use.*

### Current evidence (dates matter)
- Probe 07-18: cite-rate 8.3% (5/60), only /en/kids/ (3/3 @4) and /en/greek-music/ (2/3 @12–14)
  cite. Both are EN hubs — the same class ChatGPT lands 133 sessions/90d on (GA4 07-18). The
  winning pattern: indexed EN hub + real count capsule.
- Rival: thisisathens.org (52 citations across losing queries) wins on authority + answer
  structure. flagpole/athens24/visitathensga are Athens-GEORGIA noise (recorded confound).
- GSC 07-18: 22 clicks / 1,877 imps / pos 11.3 / 243 pages with impressions. Bing pos 5.78.
- T1 diagnostic 07-19: Google discovery of new event pages STALLED since ~Jul 1 (13/15 sampled
  "unknown to Google"); sitemaps hadn't been submitted since 05-11.

### Open predictions (rule on these FIRST every session)
| id | shipped | prediction | due | verdict |
|---|---|---|---|---|
| P1 | 07-19 sitemap submit (immediate + pipeline Phase 6b) | fresh(≤5d) event bucket ≥2/5 indexed | ~07-26, refuted if failed twice by ~08-02 | open |
| P2 | 07-19 llms.txt indexable-variant links + EN hub list | ≥1 new /en/ hub cited OR GA4 AI landing pages broaden | ~08-02 (weak-signal) | open |

### Queue (top-down; defects before gaps; re-verify each premise first)
1. **D1** jazz genre-tagging: /jazz-concert* pages render 0 events while Half Note's venue page
   lists 6 real jazz concerts. Find the filter/tagging mismatch, fix, predict citation/indexation
   movement on "Jazz concerts in Athens this week".
2. **D2** weekend window rotates early (Sunday showed next weekend on /en/this-weekend/). Fix the
   window logic; the cloud watcher checks this every Sunday — its report is the verification.
3. **Theme-1 geo-hardening** ("Athens, Greece" literal in hub titles/H1/capsules + City entity
   sameAs Wikidata Q1524): one sitewide change, attacks the confound share of nearly every query.
4. **Theme-2 fall-forward empty states** on type×time pages (songkick pattern): empty window →
   factual capsule + next N real upcoming events of that type. Interacts with the empty-hub
   noindex gate — a fall-forward page has real content, so it can be indexable; keep the pure-empty
   noindex for pages with zero inventory even falling forward.
5. **Theme-3 /en/ intersection surfaces** for query shapes we lose (today+music, tonight); then the
   per-query rows in `T2-SURFACE-MAP.md` (benchmark branch) in its priority order.
6. **T3 prep** (parallel-safe): Wikidata/sameAs completeness audit; outreach target list with
   drafted (unsent) notes; llms.txt is done.

### Inventory ceilings (flagged to operator; no surface work can fix these)
Exhibitions: ~2 upcoming in DB. Herodion/Athens-Epidaurus: zero events (missing source).

### Tactics learned (append-only)
- Winning-page anatomy (from what already cites): indexed EN hub + numeric count capsule +
  unambiguous "Athens, Greece" entities + fresh visible update date.
- Engines cite structure and entity-certainty over breadth (songkick won jazz with ZERO events).
- llms.txt must point at INDEXABLE pages; noindexed link targets waste the AI-agent surface.

## §4 Session protocol — the self-improving loop [IMMUTABLE]

Every autonomous session runs THIS order:

1. **MEASURE** (or ingest): if ≥6 days since last probe, run probe + class4 + T1 diagnostic
   (`tooling/`); read the cloud watcher's Sunday report at the routine page if reachable. Commit
   raw results to the benchmark branch before interpreting them.
2. **VERDICTS:** rule on every open prediction (hit / miss / inconclusive-with-reason) in
   PHASE3-LOG.md. A prediction missed twice → its item is REFUTED; the fix stays (if harmless) but
   the hypothesis class is retired and the escalation in its log entry activates.
3. **RETRO (the self-improvement step):** compute and log loop-health: prediction hit-rate to
   date, items closed per cycle, premise-failures caught this session. Then amend §PLAYBOOK:
   update evidence with dates, reorder the queue if verdicts changed the picture, append tactics
   learned. Amendment rules: PLAYBOOK sections only; every amendment gets a one-line rationale in
   PHASE3-LOG.md; commit the doc edit in the same session; **if loop-health shows 2 consecutive
   cycles with zero closed items or <30% prediction hit-rate over 4+, the next session must spend
   its fix-budget on generating NEW hypothesis classes (fan-out teardowns, fresh diagnostics)
   instead of retrying the current queue.** Proposals that would change §IMMUTABLE go to the log
   under "Blocked-on-operator" instead.
4. **WORK:** take the top verified queue item. Premise-check → branch → fix → targeted verification
   + full gates → merge → prediction logged. Use workflows where fan-out or blindness pays (blind
   judge panels for content claims; per-query teardowns; page-class audits) — workflow output never
   ships without main-loop verification against constraint 2.
5. **CLOSE:** update §PLAYBOOK status + PHASE3-LOG.md (session summary, next-session queue,
   blocked-on-operator list), commit both, update the repo session log per repo convention. If
   blocked ≥2 cycles on engine latency or operator decisions: PAUSE and write the one-page operator
   status instead of forcing work.

## §5 Automation & environment [IMMUTABLE facts, PLAYBOOK status]

- **Cloud watcher (armed):** `agentathens-phase3-visibility-watcher`
  (trig_018stnwUThMXJJsX8QGK4Sad), Sundays 09:47 Athens, first fire 07-26. Keyless public-web
  scope: site-health spot-checks (incl. the D2 weekend check), 20-query search-presence panel
  (labeled NON-frozen), thisisathens.org watch.
  Reports: https://claude.ai/code/routines/trig_018stnwUThMXJJsX8QGK4Sad
- **Local weekly script (drafted, unarmed):** `scripts/phase3-weekly.sh` — measurement layer +
  headless judgment session; arming under launchd is a one-step operator request.
- **Hard boundary:** frozen probe, GSC/GA4/Bing pulls, T1 diagnostic, and anything that deploys
  REQUIRE this machine (keys, events.db, deploy tree). Cloud can't reach them today.
- **Cloud routine track — operator steps, in order:**
  1. Sign in to GitHub in Chrome, install the Claude GitHub App scoped to `chrimar3/agent-athens`
     (claude.ai/code → "Select repo…" → "Connect to GitHub"). Claude drives all but the login.
     *Status 07-19: parked at GitHub sign-in.*
  2. Say "GitHub connected" → watcher gets repo source + files reports as GitHub issues.
  3. Decide on pushing the benchmark branch (repo is PUBLIC — metrics would be public).
  4. If cloud secrets become available → probe key cloud-side.

## §6 File map [IMMUTABLE]

| Artifact | Location |
|---|---|
| THIS file (operative law + playbook) | `PHASE3.md`, repo root, on `fable-impact` — edit via phase-3 worktree branch, merge with gates |
| Session bootstrap | `../agent-athens-phase3/CLAUDE.md` (pointer only — no content lives there) |
| Loop log (append-only audit: predictions, verdicts, rationale) | benchmark branch → `benchmark/visibility-baseline-20260708/PHASE3-LOG.md` |
| Per-query battle plan | same dir → `T2-SURFACE-MAP.md` |
| Measurement history | same dir → `probe-runs/<date>/` |
| Frozen instrument | same dir → `instrument/` (NEVER edit) |
| Measurement tooling | same dir → `tooling/` |

**To run the loop:** open a Claude session in `../agent-athens-phase3` and say "continue phase 3".
Next scheduled session: on/after **2026-07-26** (P1 verdict day; the cloud watcher fires that
morning at 09:47).
