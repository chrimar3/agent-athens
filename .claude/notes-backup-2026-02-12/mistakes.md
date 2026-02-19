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

## Automation Issues (2026-02-12)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| launchd plist uses wrong path | `$HOME/Projects/agent-athens/` doesn't exist; project is at `/Users/chrism/Project with Claude/AgentAthens/agent-athens` | Use absolute paths in plist, not `$HOME` which doesn't expand in all launchd contexts |
| launchd plist has duplicate key | `StartCalendarInterval` appeared twice | Each key must appear only once in plist |
| Missing `parse-emails.ts` | Daily pipeline tries to run `scripts/parse-emails.ts` but file is named `parse-newsletter-emails.ts` | Either rename the script or update `daily-automated.sh` to use correct filename |
| Megaron scraper returns 0 events | Site may require JavaScript or have changed structure | Investigate if Puppeteer needed; add to known issues |
