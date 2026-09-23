# Quality loop — judging rubric

Fixed rubric for the three-judge panel. Every round is scored against this
file unchanged, so scores are comparable across rounds. Changing an anchor
restarts the baseline; record any change in the round log.

## Rules for judges

- **Independent.** You see only this rubric and the project. You never see
  another judge's scores or notes.
- **Evidence or it did not happen.** Every score cites what you inspected:
  a file:line, a command and its output, a URL and what it showed, a query
  and its result. A claim you did not check is marked "not verified" and
  cannot raise a score.
- **Score the product as a user, operator and search/AI system would meet
  it today** — the local build in `dist/` (served at the preview URL given in
  your brief) plus the code and data that produce it. The live site
  (https://agentathens.com) may lag the local build; say which you inspected.
- **Integers 0–10**, using the anchors below. A score of 9–10 needs positive
  evidence of excellence, not merely the absence of found defects.
- **Read-only.** Never modify files, never write to `data/events.db`
  (`sqlite3 -readonly` only), never deploy, never commit.

## Anchors (apply to every aspect)

| Score | Meaning |
|---|---|
| 0–2 | Broken or absent. Users/operators are actively misled or blocked. |
| 3–4 | Works in places; frequent visible defects or major gaps. |
| 5–6 | Functional and mostly correct; clear, repeated defects a regular user or operator would notice. |
| 7 | Solid. Defects exist but are occasional and minor. |
| 8 | Strong. Hard to find a defect a user would notice; gaps are edge cases. |
| 9 | Excellent. Comparable to the best shipped products in the category, with evidence. |
| 10 | Exemplary; nothing material to improve found after a thorough search. |

## Aspects

1. **Data accuracy** — event facts shown match the source: dates, times, venue, price, category, status. No invented data (CLAUDE.md "Never fabricate"). Duplicates.
2. **Coverage & freshness** — share of Athens cultural events captured, source health, how current listings are, removal of past/cancelled events.
3. **Content quality** — descriptions: presence, accuracy, usefulness, language fit (Greek pages in Greek), no AI filler or speculation.
4. **Discovery & information architecture** — finding something to do: homepage, hubs, filters, search, time windows, navigation, empty states.
5. **Event page & action layer** — decision support and actions: practical info, tickets, save, share, calendar, map, related events.
6. **Visual design & brand** — hierarchy, typography, spacing, consistency with `docs/design-system.md`, distinctiveness, media treatment.
7. **Mobile experience** — phone-width layout, density, tap targets, sticky elements, performance on mobile.
8. **Accessibility** — WCAG 2.2 AA: contrast, keyboard, focus, landmarks, labels, alt text, reduced motion, language attributes.
9. **Performance** — page weight, render-blocking resources, image handling, caching, Core Web Vitals proxies you can measure locally.
10. **Search & AI citability** — structured data correctness, crawlability, canonical/hreflang, sitemap, answer-ready content, entity grounding. (INTENT: citations are the goal.)
11. **Internationalisation** — Greek/English parity, locale-correct dates, labels, links and schema.
12. **Code quality & architecture** — clarity, cohesion, duplication, type safety, surgical-change safety of shared templates.
13. **Testing & verification** — test coverage of real risks, guard strength (would a regression be caught?), browser tests, build gates.
14. **Operations & reliability** — daily pipeline robustness, failure signalling, deploy safety, data backups, monitoring.
15. **Measurement** — ability to know whether the site is working: citation/crawler telemetry, KPIs, scoreboards (INTENT focus #1).
16. **Documentation & institutional memory** — accuracy and usefulness of CLAUDE.md, docs/, ledger, session log; no stale claims.

## Output format (per judge)

A JSON file with, for each aspect: `aspect`, `score` (integer), `evidence`
(list of concrete observations with file:line / command / URL), `top_defects`
(up to 3, each with a one-line fix idea and rough effort S/M/L), and
`what_would_make_it_8` (one or two sentences). Plus an `overall_notes` string.
