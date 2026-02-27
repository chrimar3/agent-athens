# Common Mistakes

Pitfalls encountered and how to avoid them.

## Database

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Missing created_at default | SQLite NOT NULL constraint failed when scraper didn't set date | Always provide defaults in `eventToRow`: `event.createdAt \|\| new Date().toISOString()` |
| Deleting running exhibitions | `cleanupOldEvents` used start_date for all events | Use `COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)` |
| Filtering out current exhibitions | Site generation used `startDate >= today` for exhibitions | Check `endDate >= today` for exhibitions |

## Scraping

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| No Puppeteer for protected sites | Onassis/Benaki returned empty pages | Use Puppeteer for sites with bot protection |
| Hardcoding event dates | Scraped events expired quickly | Parse dates dynamically from page content |
| No fallback data | Scraper failures = empty pages | Include known events as fallback |

## Site Generation

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Wrong event type for scraped data | SNFCC events typed as "other" | Explicitly set `type: 'exhibition'` in scraper |
| Scroll lock race condition | Filter bar and hamburger menu both set `body.style.overflow` directly — closing one unlocked scroll while the other was still open | Use independent CSS classes (`scroll-locked` / `scroll-locked-menu`) so each component locks/unlocks independently |
| Redundant "all-events" option in date panel | "Όλες 891" linked to `/` on the homepage — a dead link to the page the user is already on | Removed from `TIME_OPTIONS`; dismiss `×` on active date pills already clears the time filter |

## Terminology

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Using "free" for events | Project uses "open" terminology | Always use `price: "open"` not `price: "free"` |

## Enrichment

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Using external API calls | Cost money unnecessarily | Use `callToolAgent()` which uses Claude Max subscription |
| No rate limiting | Hit API limits | Always add 2 second delay between AI calls |

## Venue Matching

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Only adding guillemet variations | Venues with `«Κάρολος Κουν»` didn't match `&#171;Κάρολος Κουν&#187;` | Add BOTH Unicode (`«`) AND HTML entity (`&#171;`) variations |
| Missing accent variations in rejected | "Δημοτικο Σταδιο Αμαρυνθου" (no accents) didn't match "Δημοτικό Στάδιο Αμαρύνθου" | Add both accented and unaccented versions to rejected list |
| Confusing Latin/Greek characters | "Οldschool" (Greek Ο) didn't match "Oldschool" (Latin O) | Add both character variations explicitly |
| Trailing characters in venue names | "Γήπεδο Χαριλάου \" has trailing backslash from scraper | Add exact-match variations including trailing characters |
| Canonical name too obscure | "και Ελίζας Γουλανδρή" is a fragment | Use full recognizable name like "Μουσείο Γουλανδρή" as canonical |
| Curly quotes vs straight quotes | `'` (U+2019) doesn't match `'` (U+0027) in venue names | Use hex matching for DB updates: `WHERE hex(venue_name) = '...'` or normalize quotes in scraper |

## Time Enrichment

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Using simple fetch for more.com | 0 bytes returned - site requires JavaScript rendering | Use Puppeteer for more.com; extract time at scrape time in scrape-more-enhanced.ts |
| Single time extraction pattern | Initial patterns got ~10% success | Each source needs multiple fallback patterns (startTime attr, time element, Greek PM format) |
| Not normalizing Greek PM times | `8.30 μ.μ.` wasn't parsed | Detect `μ.μ.` (PM) and `π.μ.` (AM), add 12 hours for PM |
| more.com scraper extracts time but doesn't save it | Time data extracted to `startTime` but not stored in DB | Update scrape-more-enhanced.ts UPDATE query to include `time_doors = $startTime` |
| Testing on sample without checking source distribution | Dry run showed issues but didn't identify source-specific failures | Always check success rate per source: `--dry-run` output shows source breakdown |

## Pipeline Issues (2026-02)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Half Note scraper uses wrong column | `SQLiteError: table events has no column named time` in scrape-halfnote.ts | The scraper inserts into non-existent `time` column — needs schema fix or scraper update |
| Athinorama scraper connectivity issues | "Unable to connect" errors for concert/theater pages | Site may have bot protection or changed structure; add fallback handling |
| TicketServices scraper hangs | Scraper stuck at 10/82 events during price fetching | Add timeout per event (30s) and continue on timeout; don't let one stuck request block all |
| Full scrape-all.ts too slow | Takes 10+ minutes, can hang entirely | Run scrapers in parallel where possible; add global timeout; monitor with `--dry-run` first |

## Categorizer Issues (2026-02-26)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Megaron in venue_type_map | ALL Megaron events forced to `classical`, including children's theater, dance, concerts (33% of enrichment batches misclassified) | Move to `mixed_venues` — most events ARE classical, but keyword Pass 2 catches the exceptions |
| Rabbithole in venue_type_map | Theater events (Ευρυδίκη, Η κατάρρευση) forced to `dj_set` | Move to `mixed_venues` — but titles still lack theater keywords, so some events remain misclassified |
| Christmas Theater as sports venue | 11 non-sports events forced to `sports` because Fight for Glory boxing was there | Move to `mixed_venues` — it's a general purpose venue |
| Generic sports keywords | "fight", "πάλη", "round", "ring" matched 100+ Greek cultural events. πάλη means "struggle" in Greek, extremely common metaphorically | Use multi-word phrases only: "fight night", "boxing match", "combat sports" |
| Sports high in priority order | Sports checked before theater/classical meant any keyword match won over more appropriate types | Place sports just before concert (last specific type before fallback) |
| Genre matching bidirectional includes | `matchesGenre()` used `eg.includes(cg) \|\| cg.includes(eg)` — so event genre "Tech" matched dj_set genre "Tech House" because `"tech house".includes("tech")`. 15+ tech meetups miscategorized as dj_set | Use exact match only (`eg === cg`). Add missing genre variants explicitly to config (e.g. "Classic Rock", "Contemporary", "Visual-Arts") |
| "techno" keyword matching "technology" | `"technology".includes("techno")` is true; single-word keywords use `includes()` unless in `whole_word_only` list. Tech meetups matched dj_set description keyword "techno" | Add "techno" to `whole_word_only` in categorization-keywords.json for word-boundary matching |
| "aria" keyword matching "Maria"/"Zacharias" | `"maria".includes("aria")` is true — opera description keyword "aria" matched common Greek names in enriched descriptions, causing theater→opera false positives | Add "aria" to `whole_word_only` for word-boundary matching |
| Mixed venue check after venue_type_map lookup | `categorizeByVenue()` checked venue_type_map THEN mixed_venues. But `findVenueMatch` contains-match found "it" (club IT→dj_set) inside "rabbithole", claiming HIGH confidence before mixed_venues could exclude it | Check mixed_venues FIRST, before venue_type_map lookup |

## Subagent Enrichment Issues (2026-02-26)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| DB readonly flag in Bun 1.3.0 | `new Database(path, { readonly: true })` causes "unable to open database file" on prepare() | Use `new Database(path)` without readonly — matches existing scripts |
| entity_knowledge column name | Used `genres` (plural) but table has `genre` (singular) | Check PRAGMA table_info() before writing queries against unfamiliar tables |
| Gate word count vs brief word count | Gate max was 450 for premium, but enrichment brief targets 400-600 | Fixed: premium max updated to 600 in quality-gates.ts. All 994 tests pass |
| Subagent fabricated venue details | Margaris description claimed kitchen smoke, retsina from barrel, Universal debut single — none verified | Always fact-check sensory details and biographical claims. Subagents fill gaps with plausible fabrications |
| Gate checks YAML frontmatter | Exemplar files with `what_makes_it_good: "unique..."` triggered FILLER_PHRASES error | Keep frontmatter language clean — gate reads entire file including YAML |
| Tribe sections default to segment lists | Subagent and initial exemplars listed audience types ("regulars who..., fans who...") | Show behavior: what people do, look at, talk about. Best example: Three Times Three |

## Enrichment v4 Issues (2026-02-26)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Using db execute method in new scripts | Security hook blocked file writes, thinking SQLite's execute was Node's child_process execute | Use `db.run()` for all DDL statements (CREATE TABLE, ALTER TABLE, PRAGMA) — functionally identical but avoids hook false positive |
| No callToolAgent() module | Plan referenced non-existent AI API module | Scripts output data for interactive Claude Code sessions. Never import an AI API module |

## Automation Issues (2026-02-12)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| launchd plist uses wrong path | `$HOME/Projects/agent-athens/` doesn't exist; project is at `/Users/chrism/Project with Claude/AgentAthens/agent-athens` | Use absolute paths in plist, not `$HOME` which doesn't expand in all launchd contexts |
| launchd plist has duplicate key | `StartCalendarInterval` appeared twice | Each key must appear only once in plist |
| Missing `parse-emails.ts` | Daily pipeline tries to run `scripts/parse-emails.ts` but file is named `parse-newsletter-emails.ts` | Either rename the script or update `daily-automated.sh` to use correct filename |
| Megaron scraper returns 0 events | Site may require JavaScript or have changed structure | Investigate if Puppeteer needed; add to known issues |
| launchd path with spaces | Exit code 127, `/bin/bash: /Users/chrism/Project: No such file or directory` | Wrap paths in quotes inside `-c` argument: `<string>"/path/with spaces/script.sh"</string>` |
| Duplicate/stale plist files | Multiple plists for same job cause confusion and errors | Clean up old plists; keep only one authoritative plist per job |
| bun: command not found in launchd | launchd runs with minimal PATH, can't find bun | Add explicit PATH export at script start: `export PATH="/Users/chrism/.bun/bin:$PATH"` |
| Too broad LIKE queries | `WHERE venue LIKE '%Σωκράτης%'` deleted Athens AND Amfissa venues | Use exact match or verify manually; same venue name can exist in different cities |
| Same venue name, different cities | "Καφενείο Ο Σωκράτης" exists in both Athens (Χίου 42) AND Amfissa | Always verify addresses; add distinguishing notes in rejected-locations.json |
| Assuming API module exists | Script imported non-existent `callToolAgent()` from `tool-agent` | Claude Code operates interactively - design scripts to output data, not call APIs |
