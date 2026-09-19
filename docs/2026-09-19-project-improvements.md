# Ten implemented improvements — 2026-09-19

Ranked by expected reach, severity, confidence from reproduced failures, and implementation cost. These are engineering priorities inferred from the repository and its current measurement/action-layer goals; no traffic, citation, or revenue lift is claimed. The scope covers measurement, security, discovery, retention, calendar usefulness, machine-readable freshness, and developer feedback.

| Rank | Improvement | Evidence and implemented behavior |
|---|---|---|
| 1 | Consistent health metrics | Summary and quality reports used start dates while coverage used a different exhibition rule. All event populations now share `isCurrentSql()`, bind the Athens date, exclude merged losers, and count running events consistently. Report DB connections are query-only; CLI failures exit unsuccessfully. |
| 2 | Safer generated HTML and structured data | A closing script tag inside event data could escape JSON-LD. Shared emitters now escape serialized JSON at the HTML boundary while preserving parsed values. Event titles, descriptions, card text, venue text and metadata are escaped as text. |
| 3 | Trustworthy ticket redirects | Substring domain matching admitted `more.com.evil.test`; unrestricted schemes and double URL decoding were also accepted. Redirects require an exact approved hostname or its subdomain, HTTP(S), and no credentials. Encoded ticket parameters survive unchanged; redirects carry `Cache-Control: no-store`. |
| 4 | Search that recovers from loading failures | Queries entered during index loading were lost, reopening duplicated requests, and HTTP errors had no recovery UI. The loader now shares pending work, replays the current query, checks responses, bounds loading time, announces failure, and offers retry. |
| 5 | Complete, accessible bilingual search | “See all” linked to a homepage query that nothing consumed, with results capped at twenty. The overlay now expands all matches and opens `?q=` links. Keyboard selection ignores hidden popular links. English pages have English search controls and dates, and link to English events only when those pages are generated. |
| 6 | Resilient saved events | Valid JSON with the wrong shape crashed saving; denied storage pretended a save had succeeded. Saved records are validated, deduplicated, bounded and normalized centrally. An in-memory fallback works for the current page when persistence is unavailable. Save labels track state, and saved links use available locales with safe fallback for legacy records. |
| 7 | Correct calendar exports | Date-only exhibitions acquired invented 23:59 times; folded continuation lines exceeded 75 bytes; CR characters could inject properties. Exports now preserve all-day ranges with exclusive ends, escape CR/LF, fold UTF-8 correctly, accept minute precision, reject impossible dates, respect explicit end times, and calculate Athens times through Luxon independently of the host timezone. |
| 8 | Honest DataFeed freshness | The writer ignored `meta.lastUpdate` during comparison but not its mirrored `dateModified`, rewriting identical feeds. Both feed-level timestamps now survive unchanged content; real content changes advance both. |
| 9 | Search-index accuracy | Popular events used UTC midnight, donation became ticketed, and search advertised venue pages that were never generated. The index now shares lifecycle and venue-page eligibility rules, retains donation pricing, and records English-page availability. |
| 10 | A working local preview | `bun run serve` pointed to a missing file. `src/serve.ts` now serves an existing static build on loopback, resolves clean routes, supports HEAD, preserves real 404s, and confines decoded paths and symlinks to the selected directory. No rebuild is needed to inspect an existing artifact. |

## Verification

Behavioral regressions are in `tests/project-improvements.test.ts`, `tests/preview-server.test.ts`, and `tests/browser/discovery.test.ts`. Browser checks use installed Chrome and intercept external requests. Existing calendar assertions were updated where they asserted the corrected inclusive/exclusive-end behavior, ignored real end times, or looked for the old location of saved-slug migration.

Commands exercised:

```sh
bun run typecheck
bun test tests/ src/ scripts/__tests__/deploy-gate.test.ts
bun test tests/daily-pipeline-lock.test.ts scripts/__tests__/precommit-tsc.test.ts
AA_BROWSER_TESTS=1 bun test tests/browser/discovery.test.ts
bun test tests/project-improvements.test.ts src/generators/__tests__/ src/templates/__tests__/ src/utils/__tests__/calendar-times.test.ts
```

The broad run recorded 3,350 pass / 14 skip / 2 fail. Both failures were the existing lock-liveness checks under restricted process visibility. The unrestricted lock/precommit run recorded 14 pass / 0 fail; precommit checks also require writable Bun temporary storage. The browser run passed all five flows. The later rendering/security regression run passed 677 tests after description escaping and invalid-calendar action handling were added. TypeScript passed.

The complete site was built in `/tmp/agent-athens-verify-w1cxjgf8` using copied sources and an online SQLite backup. Production `dist/` and the production database were not used as write targets. The isolated build passed canonical, locale, location and schema gates, with zero schema errors and 22 warnings. A filesystem audit found all 699 emitted search destinations present. The build and tests did not publish anything.

## Use and limits

```sh
# Existing production artifact, served locally without rebuilding
bun run serve

# Isolated verification artifact
bun run src/serve.ts --dir /tmp/agent-athens-verify-w1cxjgf8/dist --port 3001

# Optional browser checks; override CHROME_PATH on other platforms
AA_BROWSER_TESTS=1 bun test tests/browser/discovery.test.ts
```

Storage-denied saves last for the current page only. English event links fall back to the canonical root route when no English artifact is known; this avoids introducing 404s. Venue/category search continues to use existing root routes.

The redirect test covers the real handler and its failure-tolerant logging path. Local `@netlify/blobs` is unavailable, so production click persistence is not verified by these tests. Build schema warnings remain data-quality work. Scrape-history UTC bucketing is separate from the corrected Athens-local event population metrics.

GitHub integration was requested through the available plugin. The latest connection check reported it not installed; installation and account/repository authorization remain user actions. No commit, push, deployment, or GitHub publication was performed.

Calendar behavior follows [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), and JSON escaping follows the [HTML script-content parsing rules](https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements).
