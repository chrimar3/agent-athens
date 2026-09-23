# Loop round 2 — plan (2026-09-23)

Round 1 ended at a mean of medians of 5.62 (`round-1/RESULTS.md`). The largest
remaining gains sit behind three protected-path proposals (venue config,
hard-stop policy, CI + pipeline), which are drafted separately for the user
and are not part of this code round. The ten moves below are code-only and
each was checked against the data on 2026-09-23 before being planned.

| # | Move | Aspects | Premise checked | Check (passing test) | Owner |
|---|---|---|---|---|---|
| 1 | Exhibitions with no `end_date` stop being "open" after their last date: a run's end is derived from its last dated instance; unknown end never renders "Συνεχίζεται" as fact | Data, Event page, Search | "Μαζί, Ορατές": 79 exhibition rows, all `end_date` NULL, last 2026-08-29; judges saw "Τώρα ανοιχτή … Συνεχίζεται" | Synthetic run of past-dated instances → not listed, not "open"; JSON-LD not `EventScheduled`-current | lead |
| 2 | Unknown clock times are not facts: the residentadvisor `23:59` parse sentinel renders date-only; `doorTime` equal to the start is omitted | Data, Event page, Search | 33 upcoming residentadvisor rows at 23:59; ~350 upcoming rows with `time_doors` = start time | Row at 23:59 → no "στις 23:59", no `T23:59` in JSON-LD; doors = start → no `doorTime` | lead |
| 3 | Build holds back events whose title or venue names a non-Athens city (Λάρισα, Λιβαδειά, Θεσσαλονίκη …) regardless of `location_status` | Data | Judges found "WANG LIVE ΛΑΡΙΣΑ" and a Livadeia concert published | Synthetic ΛΑΡΙΣΑ row → excluded from listings and pages; Athens rows naming a street called after a city are not | lead |
| 4 | Pages with no description get a factual summary built only from structured fields, in the page's language | Content, i18n, Search | 231 of 354 listed pages had no description (round-1 judges) | Summary uses only stored fields; missing field → clause omitted, never invented; Greek on Greek pages | B |
| 5 | Greek meta descriptions on Greek pages when the description is English (from move 4's summary) | i18n, Search | Judges: Greek pages carry English meta descriptions | Greek event page with English-only description → Greek `<meta name="description">` | B |
| 6 | One computed listed-events count shared by scoreboard, health check, pipeline summary and `llms.txt` | Measurement, Documentation, Operations | Judges saw 713 / 1,122 / 880 / 354 for "events" across reports | All four read one function; a test pins that they agree on a fixture | B |
| 7 | Imageless-card SVG tiles become cached files referenced by URL instead of inline markup | Performance, Mobile | Homepage 425 KB, of which 265 KB is 55 inline SVG tiles | Built homepage has no inline tile `<svg>`; tile files exist for every reference; page weight drops | C |
| 8 | Accent-insensitive and Greeklish search ("kyttaro" finds Κύτταρο, "mousiki" finds μουσική) | Discovery, i18n | No transliteration in the search path | Synthetic index: Latin query matches Greek title and ranks it | C |
| 9 | Image downloader accepts real images served as `application/octet-stream` (magic-byte sniff) and skips quarantined sources | Operations, Visual | 2026-09-23: 118/118 downloads failed — 106 clubber.gr (quarantined) HTML, 7 cometogether octet-stream | Octet-stream JPEG/PNG bytes accepted; HTML bytes rejected; quarantined source not queued | C |
| 10 | Held-back phantom event URLs answer 410 rather than 404; orphan `.ics` files and stale pages (e.g. `dist/kids.html`) are swept from `dist/` | Search, Operations | 410 infrastructure exists (`archive-gone-rules`); premise of gaps to be re-verified before building | Held-back id → 410 rule; no `.ics` without a page; no page outside the build manifest | lead |

Not in this round: multi-day non-exhibition listing (deferred in S228, needs
a user decision); category fixes that need production DB writes; Greek
enrichment (INTENT non-goal); Measurement sensors (need credentials).

File ownership — **lead**: `src/utils/event-lifecycle.ts`,
`src/utils/event-populations.ts`, `src/utils/publishable.ts`,
`src/utils/filters.ts`, `src/generate-site.ts`, `src/db/database.ts`,
`src/validators/**`, `src/quality/location-filter.ts`.
**B**: `src/generators/event-page.ts`, new `src/utils/factual-summary.ts`,
`src/templates/page.ts` (meta only), `scripts/assemble-scoreboard.ts`,
`scripts/health-check.ts`, new `src/utils/listed-count.ts`. The `llms.txt`
generator lives in `src/generate-site.ts`, so the lead wires B's function
there; the pipeline summary is in protected `scripts/daily-automated.sh` and
goes into the CI + pipeline proposal instead. **C**: `src/generators/event-tile.ts`, `src/utils/tile-autofit.ts`,
`src/templates/card-variants.ts`, `src/generators/search-index.ts`,
`src/templates/search-overlay.ts`, `src/images/**`. `src/i18n/strings.ts`:
B only (others request keys through the lead). Each owner owns the tests it
adds. Anything outside a list: stop and ask the lead.
