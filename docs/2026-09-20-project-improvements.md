# Ten project improvements — 20 September 2026

Ranked by demonstrated severity, reach and confidence. This is a correctness and usability release; traffic, ranking and AI citation effects require later measurement.

| Priority | Observed problem | Implementation and acceptance check |
|---|---|---|
| 1 | Homepage hero descriptions and venue names could render stored HTML as markup. | Escape text at the shared hero renderer; hostile strings remain text with no executable elements. |
| 2 | English hub filters searched only the initial 30 rendered events despite larger category counts. | On filtering, load cards from the existing same-locale all-events page; preserve initial loading speed, loading/error/retry/reset behavior and complete results. Abort stalled requests after 15 seconds; emit English event links where an English page exists. |
| 3 | Saturday and Sunday weekend filters jumped to the following Friday. | Use the current Monday–Sunday calendar week in Europe/Athens; advance on Monday. |
| 4 | Month filters excluded the final evening. | Use exclusive first-of-next-month boundaries, including December rollover and leap days. |
| 5 | Schema offsets used midnight on daylight-saving transition days. | Resolve the event's full Athens wall time; preserve date-only and explicitly offset timestamps. Reject nonexistent spring clocks and consistently choose the earlier occurrence of an ambiguous autumn clock. |
| 6 | Date-only events displayed a fabricated 02:00/03:00 time on UTC hosts. | Omit absent clocks from practical information; retain explicitly supplied midnight. |
| 7 | Exhibitions without end dates could remain “currently open” indefinitely, even beside an ended banner. | Reuse the existing lifecycle end-date/presumption policy for the badge. |
| 8 | Old Bing snapshots and malformed HTTP-200 responses looked like valid measurements. | Validate response rows and numeric aggregates, exclude future rows and reject snapshots older than 25 hours. Valid empty responses remain zero; collection failures exit nonzero. |
| 9 | Incomplete proof artifacts could report a clean schema pass; corrupt JSON could abort rendering. | Missing/malformed evidence renders unavailable; any known schema failure remains a failure; old indexing rows cannot claim the last seven days. Correct top-10 terminology to pages. |
| 10 | Offscreen mobile-menu links stayed keyboard-focusable and focus was not managed. | Closed menu is inert; opening, Tab cycling, Escape, focus restoration and search handoff work with the keyboard. |

## Verification

Regression tests were observed failing before the fixes. Date tests cover UTC and Europe/Athens processes; UI tests use isolated Chrome fixtures without user sessions or external requests. Measurement fixtures use local temporary files and synthetic API responses. Final isolated verification: **3,450 tests passed, 25 skipped, zero failed**, plus **14 real-browser tests passed**. TypeScript and diff checks passed. The complete build passed all publication gates with **zero structural schema errors and 23 existing warnings**. Artifact audit checked **829 unique sitemap destinations, 409 JSON alternates and 650 Event identities**, with zero missing/noindex targets, broken alternates or identity errors. The generated English month page returned the complete matching set in Chrome; links resolved and menu focus restored. Session 228 records the implementation; the final task response records platform readiness and live release checks.

## Scope and evidence limits

Changes use existing templates, routes and lifecycle rules. Protected configuration, production database, scheduled pipeline and unrelated working files are preserved. No new API subscriptions, citation observations or ranking claims were introduced.

Deferred findings: multi-day non-exhibition filtering needs a separate recurring-event semantics decision; stale image retries and a bridge for existing citation-panel observations remain follow-ups. These were lower-confidence or broader-scope choices than the ten reproduced issues above.

Primary references: [Google AI search guidance](https://developers.google.com/search/docs/appearance/ai-features), [Bing query statistics contract](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerystats?view=bing-webmaster-dotnet), [Bing page statistics contract](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getpagestats?view=bing-webmaster-dotnet).
