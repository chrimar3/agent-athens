# Loop round 2 — results (2026-09-24)

Same rubric, same three-judge protocol; judges did not see earlier scores.
Evidence: `judge-A.json`, `judge-B.json`, `judge-C.json`. Judged build: the
`claude/quality-loop-round-2` worktree's `dist/`, served locally.

| Aspect | Round 1 | Round 2 (A, B, C) | Median |
|---|---|---|---|
| Data accuracy | 4 | 5, 4, 4 | **4** |
| Coverage & freshness | 4 | 4, 3, 4 | **4** |
| Content quality | 5 | 4, 4, 4 | **4** ▼ |
| Discovery & information architecture | 6 | 6, 6, 6 | **6** |
| Event page & action layer | 6 | 7, 6, 6 | **6** |
| Visual design & brand | 7 | 6, 6, 6 | **6** ▼ |
| Mobile experience | 7 | 7, 7, 7 | **7** |
| Accessibility | 7 | 7, 7, 7 | **7** |
| Performance | 7 | 6, 6, 6 | **6** ▼ |
| Search & AI citability | 6 | 5, 6, 6 | **6** |
| Internationalisation | 5 | 4, 4, 4 | **4** ▼ |
| Code quality & architecture | 6 | 6, 6, 6 | **6** |
| Testing & verification | 6 | 7, 6, 6 | **6** |
| Operations & reliability | 5 | 5, 6, 6 | **6** ▲ |
| Measurement | 3 | 3, 3, 3 | **3** |
| Documentation & institutional memory | 6 | 5, 6, 5 | **5** ▼ |

Mean of medians 5.62 → **5.38**. One aspect up, ten level, five down by one.

## Reading the drop

- **No judge reported a defect introduced by round-2 code.** The drops cite
  defects that predate the round and that round-1 judges happened not to
  sample: Πέρσες/Μήδεια nightly rows at the wrong venue (athinorama lists one
  night at Θέατρο Βράχων), The Gathering's Thessaloniki date on the Athens
  homepage via "Πολλαπλοί Χώροι", a phantom 2027 Sonic Sisters, speculative
  enrichment prose, stale public counts ("809 events live", "2,423 tests").
- **Setup confound:** the worktree `dist/` had no event images (they live
  only in the main checkout's `dist/images/`), so every local card showed a
  placeholder. Two judges said they judged images on the live site instead,
  but Visual and Performance were scored under a different condition from
  round 1. Next round: judge a build that has the images.
- **Sampling variance is about ±1 per aspect.** With three judges and
  integer anchors, a one-point move on a median is within noise unless the
  cited evidence changed. Round 2's gains (tiles, Greeklish, time
  placeholders, per-day exhibitions, summaries) were confirmed by the judges
  where they looked, e.g. search "works, including Greeklish"; they did
  not move an anchor.

## What caps the scores (all three judges, both rounds)

| Blocker | Aspects | Needs |
|---|---|---|
| Wrong venue/city facts on published events (Άλσος, Circus Larisa, Livadeia, "Πολλαπλοί Χώροι" passing unchecked) | Data, Search | #23 (config, protected) + a check for "Πολλαπλοί Χώροι" rows naming another city |
| The hard-stop filter hides 112–270 upcoming events (the judges measured differently) | Coverage, Content | #24 (policy decision) |
| No Greek descriptions on the Greek-first site; 35% have none at all | Content, i18n | Greek enrichment is an INTENT non-goal — user decision |
| Duplicate nightly rows (Πέρσες/Μήδεια; 115 of 557 sitemap URLs in same-production groups); 70 merged-loser pages indexable | Data, Search | Code: one "current publishable event" rule for pages, sitemap and feeds (pending GEO URL ruling for losers) |
| Citation/crawler telemetry empty; scoreboard nulls | Measurement | Credentials / log drain (protected `netlify.toml`) |
| CI runs only `tests/`; deploy refusals on dirty trees (4 of 8 days) | Testing, Ops | #25 |
| Stale hard-coded counts in public copy and docs | Documentation | Code: compute them (listed-count exists now) |

## Round-2 moves as shipped

1. Per-day exhibitions: build-only `presumedEndDate` (last listed day, source ≥2 days newer, no stated end on any row) — "Μαζί, Ορατές" 54 → 0 rows "open"; WATER untouched; presumed ends read "no later dates", never "ended".
2. residentadvisor 23:59 placeholder → date-only; `doorTime` equal to start omitted (JSON-LD `doorTime` pairs equal to start: 3 → 0).
3. Build hold-back for titles naming a non-Athens city (nominative only): 1 held (WANG LIVE ΛΑΡΙΣΑ), 0 false positives in 1,245 rows. Livadeia needs the city in config (#23).
4. Factual summary from stored fields on 464 pages with no description; exhibitions without a stated end carry no date.
5. Greek meta: native Greek prose, else the Greek summary.
6. `listed-count.ts` shared by scoreboard and health check (pipeline summary in #25).
7. Imageless tiles as content-hashed files: homepage 425 KB → 176 KB (cache header in #25).
8. Greeklish search (index +8–10%).
9. Image downloader: magic-byte sniffing; quarantined sources filtered before the batch limit.
10. Folded: orphan sweep and 410 rules already existed; only stale `dist/kids.html` remains (opt-in sweep).

Verification (2026-09-24): `bunx tsc --noEmit -p .` 0 errors; `bun test` 3,843 pass / 65 skip / 1 fail — the fail is the push-gate timing test (`hung push is killed within awake tick budget`), intermittent (1 of 3 runs), no round-2 file involved; `AA_BROWSER_TESTS=1 bun test tests/browser/` 38 pass; build exit 0, 0 schema errors, 23 warnings, published-artifact gate 2,394 pages clean. The build inserts one `generation_stats` row into the production DB, as every build does.

## Recommendation for round 3

Code moves have stopped moving medians; the next gains are behind decisions
already filed (#23, #24, #25) and the Greek-content non-goal. A round-3 code
round should take the judges' shared findings only: the single current
publishable-event rule (duplicate nightly rows, loser pages, phantom
"returns" rows) and computed public counts — and judge a build with images.
