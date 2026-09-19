# Agent Athens: ten SEO, GEO and online-presence improvements

Date: 2026-09-19. Implementation branch: `codex/seo-geo-presence-2026-09-19`.

The user requested a ranked audit followed by implementation. Priorities below reflect observed defects, likely reach, confidence and implementation cost. They are engineering priorities, not measured ranking gains. Research covered public pages and crawler files, the repository, generated artifacts and a read-only Google Search Console query.

## Recovery and GitHub

Astra's 28 uncommitted files were identified from the task “Change to agent athens”, checked against all 11 local branches, six worktrees and the available reflogs/stashes, then saved byte-for-byte in commit `79ba6cda4`. The [recovery branch](https://github.com/chrimar3/agent-athens/tree/codex/save-astra-2026-09-19) is pushed independently. The original checkout, its index and existing stashes were preserved during recovery. This implementation builds on that snapshot in a separate managed worktree.

GitHub access to `chrimar3/agent-athens` was verified through the authenticated connector and CLI. No credential material is included in this report or the commits.

## Ranked implementation

| Rank | Opportunity and observed problem | Implemented behavior |
|---|---|---|
| 1 | Restore Google measurement. All four GSC aggregate columns were hardcoded to `STALE`, although the existing service account now succeeds. | Added a read-only, timeout-bounded collector and connected it to the existing scheduled visibility monitor. Uses the latest complete seven-day period, property totals and paginated observed-query rankings. Unknown/error values stay explicit; failed collection exits nonzero. |
| 2 | Repair English internal discovery. 442 links across 221 English event pages led to dormant, noindex category pages. | Breadcrumbs and discovery links choose existing English hubs using the generator's actual eligible hub set. The deliberate dormant-locale policy remains intact. |
| 3 | Include English hubs in IndexNow discovery. Trailing-slash and configuration mismatches excluded all 18 configured English hubs. | Normalize paths for matching and load configured hub slugs while preserving the canonical URL submitted. No bulk submission was sent during this task. |
| 4 | Remove sitemap duplication and empty category indexing. The baseline contained 16 duplicate rows and three empty categories. | Deduplicate sitemap URLs and report the emitted count. Empty categories receive noindex and are omitted from sitemap/LLM directory entries. |
| 5 | Advertise JSON endpoints that exist. There were 25 broken JSON alternate destinations and an overbroad API-path claim. | Metadata carries an explicit JSON URL only when a corresponding endpoint is emitted. Category links use their real API directory. The LLM directory describes actual endpoint families and generated routes. |
| 6 | Align machine-readable feeds with HTML eligibility and language. The root feed included 196 noindex event pages and labelled all descriptions Greek. | Apply the shared lifecycle predicate, add `/api/en/events.json` only for generated English event pages, and derive description language from explicit enrichment fields. Unknown legacy/raw description language is omitted. |
| 7 | Connect event identity and evidence. English Event IDs pointed to root-language pages; feed IDs were absent. | Use each page's canonical Event ID consistently in HTML and feeds. Add a WebPage graph linking the event, publisher and a validated HTTP(S) source through `isBasedOn`. Cooling pages do not emit a dangling Event reference. |
| 8 | Make freshness claims accurate. Rebuild time appeared as content freshness on unchanged event/trust pages. | Remove build-time date metadata and static trust-page `dateModified`. Preserve real source/publication dates and Astra's unchanged-feed timestamp handling. |
| 9 | Consolidate publisher and creator identity. Organization declarations differed and the standalone maker page lacked a connected identity graph. | Reuse a stable Organization ID and public contact/repository details; connect the colophon AboutPage to the already-public Person and publisher. Personal profiles stay on Person. |
| 10 | Put event content first in document order. The hidden maker dialog preceded main content on all 864 audited sitemap pages. | Move the shared dialog after main content through the footer, preserving its triggers and behavior. The standalone colophon uses one H1. |

## Why these changes

Google's [AI-search guidance](https://developers.google.com/search/docs/appearance/ai-features) applies ordinary search fundamentals to AI features and does not require special AI schema or an LLM text file. The work therefore prioritizes discoverable, eligible pages, useful content and consistent evidence. Updating `llms.txt` here repairs an existing published directory; it is not a claim of a Google ranking mechanism.

The discovery and sitemap changes follow Google's guidance on [crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable) and [canonical sitemap URLs with accurate modification dates](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). IndexNow URL handling follows the [protocol documentation](https://www.indexnow.org/documentation).

Publisher, source and date changes align with Google's guidance on [clear authorship and sourcing](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [representative structured data](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), [Organization details](https://developers.google.com/search/docs/appearance/structured-data/organization) and [accurate publication dates](https://developers.google.com/search/docs/appearance/publication-dates). Moving a hidden dialog improves document order; its ranking impact is unproven.

The collector separates property totals from observed-query statistics because the [Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) does not promise all query rows; Google's [data extraction guidance](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data) explains these limits. Search Console reporting dates use America/Los_Angeles as required by the API; operational timestamps remain Europe/Athens.

## Measured before and after

Comparison uses the existing local artifact and an isolated rebuild from the same 855-event snapshot. These are generated-file checks, not a claim that production has changed or Google has recrawled the site.

| Check | Before | After |
|---|---:|---:|
| Sitemap rows / unique URLs | 880 / 864 | 861 / 861 |
| Duplicate sitemap rows | 16 | 0 |
| Empty categories included in sitemaps | 3 | 0 |
| Missing JSON alternate destinations | 25 | 0 across 434 links |
| English event links to dormant categories | 442 | 0 across 285 English pages |
| Event IDs inconsistent with page canonical | 285 | 0 across 659 event pages |
| Hidden maker dialogs before main content | 864 | 0 across 861 sitemap pages |
| Root feed entries pointing to noindex pages | 196 | 0 |
| Root feed entries missing stable IDs | 855 | 0 |
| Root / English feed entries | 855 / absent | 659 / 285 |
| Missing or noindex destinations in either new feed | — | 0 |

The root feed contains 271 descriptions known to be English and 388 with unspecified language; it does not guess a language for the latter.

Read-only GSC verification returned **1,050 impressions, 20 clicks and average position 7.7505** for **2026-09-10 through 2026-09-16**, the latest final period returned during collection. There were 23 observed query rows, 13 with average position at most 10; the collector did not hit its pagination cap. This query count is neither the total number of ranking keywords nor an indexed-page count. No production visibility CSV was written during verification.

## Verification

- TypeScript check and the normal pre-commit hook.
- Broad regression command: `bun test tests/ src/ scripts/__tests__/deploy-gate.test.ts` — **3,398 passed, 14 skipped, zero failed** across 186 files. The disposable checkout requires its ignored `temp-briefs/` fixture directory and macOS process visibility for existing lock-owner tests; the final run included both.
- Five real-Chrome discovery flows passed: `AA_BROWSER_TESTS=1 bun test tests/browser/discovery.test.ts`.
- Full isolated generator build passed. Schema validation: 1,298 of 1,321 pages fully valid, 23 warnings, zero errors. Canonical parity checked 3,357 URLs; dormant-locale, location and hreflang gates passed.
- Targeted tests cover collector error/auth/empty/pagination behavior, IndexNow matching, split sitemap output, HTML/JSON alternates, locale discovery, feed lifecycle and language, source provenance, publisher identity and colophon structure.
- A separate agent reviewed the changes outside its own implementation area and reported no actionable findings.
- The build and database-dependent tests ran in a disposable source copy with an SQLite online backup. Production database, deploy output and protected configuration were not edited.

## Release and measurement

The changes are prepared for GitHub review, not deployed. After merge and deployment, verify the published endpoints and allow the existing monitor to collect comparable complete periods. Then compare impressions, clicks, discovery/indexing coverage and independently observed AI referrals or citations. No ranking, rich-result or AI-citation improvement has yet been measured.

The 23 schema warnings remain data-quality follow-ups. Absolute Google/Bing indexed-page counters still require their existing separate workflow. Greece is not currently listed for Google's [Event rich-result experience](https://developers.google.com/search/docs/appearance/structured-data/event); valid Event schema alone does not promise that presentation.
