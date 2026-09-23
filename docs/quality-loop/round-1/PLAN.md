# Loop round 1 — plan (2026-09-22)

Ten moves chosen from the round-0 defects that at least two of three judges
found independently, ranked by aspects lifted × reach ÷ effort. Each move is
stated as its passing check. Owners hold files exclusively for the round.

| # | Move | Aspects | Check | Owner |
|---|---|---|---|---|
| 1 | Stop phantom next-year dates: music parser gets a rollover window; build excludes athinorama rows dated ~1 year after they were scraped | Data, Discovery, Search | Synthetic parser test (passed day → no row); build lists 0 rows matching the phantom pattern | lead |
| 2 | Defaults are not facts: `venue_default` prices lose their amount at `rowToEvent` | Data, Event page, Search | Row with venue_default renders "Με εισιτήριο", JSON-LD has no `price` | lead |
| 3 | No pipeline artefacts in pages: strip `<!-- -->` from descriptions at `rowToEvent`; suppress `[PLACEHOLDER]` pull quotes; render markdown tables as tables | Content, Visual, Search | Built pages contain none of the three | lead + B |
| 4 | Build gate over `dist/`: fail on visible `<!--`, `[PLACEHOLDER]`, markdown table rows, `&amp;` in JSON-LD names | Testing, Content | Gate fails on a synthetic bad page, passes on the real build | lead |
| 5 | English pages speak English: card badges, dates, price labels locale-correct | i18n, Discovery | `/en/` hub cards contain no Greek UI strings | C |
| 6 | Language tagging and chrome: `lang="en"` on English descriptions in Greek pages; one localised About; no English aria-labels on Greek pages | a11y, i18n | Axe `valid-lang`/scan passes; one About link | B (description), C (chrome) |
| 7 | Structured-data hygiene: decoded names, og:image fallback, VTIMEZONE in .ics | Search, Event page | No `&amp;` in JSON-LD names; every og:image file exists; .ics has VTIMEZONE | B |
| 8 | Search and rails: decoded search index, date-proximity tie-break, related rails from listable upcoming events only | Discovery, Event page | No duplicate/past events in rails; entities decoded in search | B |
| 9 | Contrast and targets: active pill ≥4.5:1, footer ≥4.5:1, chips ≥24px (44 preferred) | a11y, Visual, Mobile | Axe color-contrast/target-size clean on sampled pages | lead |
| 10 | First event in the first phone viewport on hubs: collapse the hub intro on phones | Mobile, Discovery | At 375px the first card's top < 812px on /this-weekend | lead |

Pending user decision (not in this round): the header colophon button's
label — a judge flagged "About" as English on Greek pages and a duplicate of
the nav About link; builder C renamed it "Δημιουργός"/"Maker", which the lead
reverted because "About" is a recorded S159 choice; `fix-megaron-default-times.ts
--apply`; CI running `src/` tests and pipeline failure signalling (protected
paths); A0 hard-stop hiding whole events; coverage sources.

File ownership — lead: `scripts/scrape-all.ts`, `src/db/database.ts`,
`src/types.ts`, `src/utils/event-lifecycle.ts`, `src/utils/editorial-content.ts`,
`src/validators/**`, `src/generate-site.ts`, `src/generators/hub-page.ts`,
`src/styles/design-system.css`. B: `src/generators/event-page.ts`,
`src/generators/search-index.ts`, `src/templates/search-overlay.ts`,
`src/utils/schema-*.ts`, `src/utils/calendar-times.ts`, `src/generators/og-image.ts`.
C: `src/templates/{page,card-variants,site-chrome,action-bar,homepage,filter-bar}.ts`,
`src/utils/i18n*.ts`, `src/i18n/strings.ts`. Each owner also owns the tests it adds.
