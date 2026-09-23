# Round 0 — baseline (2026-09-22)

Three independent judges (A, B, C) scored the working tree after Session 231's
ten moves, against `docs/quality-loop/RUBRIC.md`. Each judge saw only the
rubric and the project; full evidence is in `judge-A.json`, `judge-B.json`,
`judge-C.json`. Aggregate = median.

| Aspect | A | B | C | Median |
|---|---|---|---|---|
| Data accuracy | 3 | 3 | 4 | **3** |
| Coverage & freshness | 4 | 3 | 4 | **4** |
| Content quality | 4 | 4 | 4 | **4** |
| Discovery & information architecture | 6 | 6 | 6 | **6** |
| Event page & action layer | 6 | 6 | 6 | **6** |
| Visual design & brand | 6 | 6 | 6 | **6** |
| Mobile experience | 6 | 6 | 7 | **6** |
| Accessibility | 6 | 6 | 7 | **6** |
| Performance | 7 | 6 | 7 | **7** |
| Search & AI citability | 5 | 5 | 5 | **5** |
| Internationalisation | 3 | 4 | 4 | **4** |
| Code quality & architecture | 6 | 6 | 6 | **6** |
| Testing & verification | 6 | 6 | 6 | **6** |
| Operations & reliability | 5 | 6 | 6 | **6** |
| Measurement | 3 | 3 | 3 | **3** |
| Documentation & institutional memory | 6 | 5 | 5 | **5** |

Mean of medians 5.19. No aspect above 8. Judges agree within one point on
every aspect.

## Defects all three judges found independently

- **Phantom next-year dates.** The athinorama music parser rolls any past
  day/month forward a year with no window (`scripts/scrape-all.ts` ~655; the
  theater branch has a window). 48–87 listed events show a date one year late,
  in pages, sitemap, search and JSON-LD.
- **Leaked pipeline artefacts on public pages.** `<!-- timeliness-expires -->`
  rendered as text on 343–686 event pages and inside JSON-LD; `[PLACEHOLDER]`
  pull-quotes on 6 hubs (pinned by a test); raw markdown tables on 44 pages;
  literal HTML entities in search.
- **Defaults presented as facts.** `venue_default` prices (e.g. €25 on every
  Megaron event) shown and emitted as `offers.price`; Megaron 20:30 times
  (fix prepared, awaiting approval).
- **Greek/English mixing.** English hubs render Greek card labels and dates;
  Greek pages carry English descriptions without `lang="en"`.
- **Measurement is empty.** Citation and crawler sensors null; AI-referral
  import stale since June.
- **Accessibility.** Active filter pill at 1.28:1 contrast; footer contrast;
  target sizes.

## Structural limits (need decisions outside code)

- Coverage (exhibitions 4, cinema 3 listed; more.com capped at 20 per
  category; 186 visible rows hidden by A0 hard-stop concerns) needs new
  sources or a policy change on hard-stops.
- Content and Internationalisation are capped while Greek enrichment is
  descoped (INTENT non-goal) and 59% of listings have no description.
- Measurement needs credentials or a log drain (`netlify.toml` is protected).
- CI runs only `tests/`, skipping 2,394 `src/` tests — `.github/**` and
  `package.json` are protected; change by issue/user.
