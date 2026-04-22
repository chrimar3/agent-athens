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
| SNFCC scraper pointed at wrong URL | `/el/events` was a WordPress photo gallery (canonical: `photo-gallery/events/`), not the events listing. Real events at `/ekdiloseis/` with category pages at `/event-category/<slug>/` | Always verify URL canonical (`<link rel="canonical">`) before building a scraper. First curl in Step 0 of the plan caught this. |
| end_date missing from scrape-all.ts adapter | Onassis/Benaki/SNFCC exhibitions lost `end_date` when run through orchestrator; only standalone scraper preserved it | Added `end_date` to `ScrapedEvent` interface, INSERT SQL, and all exhibition adapters |

## Site Generation

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Wrong event type for scraped data | SNFCC events typed as "other" | Explicitly set `type: 'exhibition'` in scraper |
| Scroll lock race condition | Filter bar and hamburger menu both set `body.style.overflow` directly — closing one unlocked scroll while the other was still open | Use independent CSS classes (`scroll-locked` / `scroll-locked-menu`) so each component locks/unlocks independently |
| Redundant "all-events" option in date panel | "Όλες 891" linked to `/` on the homepage — a dead link to the page the user is already on | Removed from `TIME_OPTIONS`; dismiss `×` on active date pills already clears the time filter |
| data-slug format divergence in save feature | Card save buttons on browse page stored `data-event-slug="/events/abc-123/"` (full path via `href`) while event detail page stored bare slug `"abc-123"`. The /saved/ page prepends `/events/` → double prefix → 404. Root cause: `prepareCardData` returned `href` but not `slug`. | Always emit raw identifiers in `data-*` attributes. If a downstream consumer adds a prefix, emitters MUST store the unprefixed value. Fixed by adding `slug` to `CardData` interface + `prepareCardData` return + migration IIFE for legacy localStorage entries. |
| .ics `parseIsoLocal` regex matched only full ISO, silently fell through for exhibitions | First pass of `renderCalendarScript` used `/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/` for both `start_date` and `end_date`. DB stores exhibition `end_date` as date-only (`2026-03-29`), no `T`. The regex returned `null`, and the `\|\| addHours(startParts, 3)` fallback silently produced a wrong DTEND (+3h after start, not the real closing date). Caught only by spot-checking dist output — tests with fixture-generated full ISO didn't hit the branch. | Whenever a field's storage format varies by event type, `parseIsoLocal`-style helpers must branch on shape. Added a second regex `/^(\d{4})-(\d{2})-(\d{2})$/` with default `H=23, Mi=59`. Lesson: unit tests that use fixture dates can miss production format shapes — always grep dist output after builds for cross-cutting features. |

## URL structure — hub pages are root-level, not nested

Greek hubs: `/{slug}/` (e.g. `/today/`, `/sabbatokyriako/`)
English hubs: `/en/{slug}/` (e.g. `/en/today/`, `/en/this-weekend/`)

NOT `/events/{slug}/` or `/en/events/{slug}/` — that path pattern doesn't exist.

When diagnosing a 404 on any hub-related URL, first verify the URL itself is correct
before assuming a generator/routing bug. Check `ls dist/{path}/` to confirm the
expected file location before investigating further.

## Terminology

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Using "free" for events | Project uses "open" terminology | Always use `price: "open"` not `price: "free"` |
| "Δωρεάν" in scraped price_range | Events with `price_type: 'with-ticket'` and `price_amount: 0` had `price_range: 'Δωρεάν'` from scrapers. `formatPriceGreek()` only checked `price.type === 'open'` so these fell through to the raw `price.range` display | Normalize at the formatting layer: `if (event.price.range === 'Δωρεάν') return 'Ελεύθερη είσοδος'`. Also guard `price.amount > 0` to avoid displaying "€0" |

## Enrichment

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Using external API calls | Cost money unnecessarily | Use `callToolAgent()` which uses Claude Max subscription |
| No rate limiting | Hit API limits | Always add 2 second delay between AI calls |
| classifyEvent() venue matching was case-sensitive | `"ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ".includes("Σταυρός του Νότου")` is false in JS because of case AND Greek diacritics. Also English venue names ("Onassis Stegi") were missing from PREMIUM_VENUES. And `dj_set` was hardcoded to `concert_local` bypassing venue/price checks | Added `venueMatches()` helper with `toUpperCase()` + NFD accent stripping. Added English venue names. Unified concert/dj_set branching |
| TOO_LONG used global max instead of matrix target | `validateTechnical()` checked word count against tier-based hardcoded limits (stub:200, standard:300, premium:600). A 200-word concert_local (matrix max: 120) passed because 200 < 300. Meanwhile OVER_MATRIX_MAX fired correctly as a warning but was secondary to the legacy check | Removed legacy word count from `validateTechnical()`. Matrix-based check in `validateQualityGates()` is now the primary enforcement. Legacy fallback only when event.type is null |
| Phantom penalties docked ~15pts for template-level concerns | SCHEMA_MISSING (-5): fired whenever no schema provided, but schema is generated at build time. MISSING_SECTION (-15): checked for literal strings 'practical block', 'tags', 'last verified' that never appear in descriptions. MISSING_PRACTICAL (-5): checked event metadata fields, not description content | SCHEMA_MISSING: removed (schema not the writer's concern). MISSING_SECTION: removed (template concepts, not text patterns). MISSING_PRACTICAL: downgraded to info (metadata, not content) |

## Transit/Logistics (2026-03-03)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| "Gazi-Votanikos" used as station name | Not a real metro station — appeared in 5+ descriptions for Gazi venues | Nearest station is Kerameikos (Line 3). Verify station names against Athens Metro map |
| Wrong metro line colors in knowledge base | Tavros listed as Blue (actually Green/Line 1), Attiki as Red/Blue (actually Green+Red/Lines 1+2), Omonia as Red/Blue (actually Green+Red/Lines 1+2) | Always verify line-station assignments. See `temp-descriptions/transit-audit-results.md` for correct mappings |
| Line colors in descriptions violate rule #19 | 82 descriptions contained line color references despite rule #19 ("station name only") | Enforce at knowledge base level. Descriptions should say "Kerameikos metro" not "Kerameikos metro (Blue line)" |
| Evangelismos used for wrong venues | Megaron nearest is Megaro Moussikis; Half Note nearest is Syngrou-Fix | Don't assume Evangelismos for all central Athens venues — check actual proximity |

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

## Pipeline Idempotency Issues (2026-03)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Exhibition end_date not applied in 3 pipeline scripts | `filter-athens-only.ts`, `remove-duplicates.ts`, `enrich-time.ts` all used `WHERE start_date >= date('now')` — silently excluded running exhibitions whose start_date was in the past but end_date still future. These events skipped location filtering, dedup, and time enrichment | Use `COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')` everywhere. Pattern was already correct in `cleanup-old-images.ts` and documented in CLAUDE.md Tier 1 rules |
| merge-duplicates.ts also missed | 7-day window `start_date >= date('now', '-7 days')` excluded long-running exhibitions (start_date 2+ months ago) | Same COALESCE pattern applied. Low impact (cross-source exhibition duplicates are rare) but fixed for consistency |

## Pipeline Issues (2026-02)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Half Note scraper uses wrong column | `SQLiteError: table events has no column named time` in scrape-halfnote.ts | The scraper inserts into non-existent `time` column — needs schema fix or scraper update |
| Athinorama scraper connectivity issues | "Unable to connect" errors for concert/theater pages | Site may have bot protection or changed structure; add fallback handling |
| TicketServices scraper hangs | Scraper stuck at 10/82 events during price fetching | Add timeout per event (30s) and continue on timeout; don't let one stuck request block all |
| Full scrape-all.ts too slow | Takes 10+ minutes, can hang entirely | Run scrapers in parallel where possible; add global timeout; monitor with `--dry-run` first |

## Type Classification Issues (2026-03)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Ticketservices blanket dj_set | All Parnassos Literary Society events classified as dj_set (piano recitals, spoken word, chamber music) | Scraper defaults to `concert`, categorizer handles the rest. Root cause was stale venue mapping, now fixed |
| Too many non-standard types | 14+ types accumulated (classical, opera, dance, comedy, conference, meetup, hackathon, seminar, sports) causing Schema.org markup errors | Consolidated to 12 canonical types (incl. `other`). Use transaction + `AND type = 'old_type'` safety guard for remaps |
| Sports events in cultural DB | "Αθλητισμός για Όλους", boxing events imported | Delete non-cultural types at ingestion; categorizer now has no `sports` type |
| Type consolidation without updating tests | Changed types in src/types.ts and categorizers but left test files with old expectations. 11 tests broke | Type changes are shotgun surgery — update types.ts → config JSONs → categorizers → tests in ONE commit |
| hasNativeGreek added without updating fixtures | Required `hasNativeGreek: boolean` field added to Event type but 6 test fixtures + 3 test helpers + normalize.ts weren't updated. 11 TS errors across 5 files, invisible to `bun test` (only caught by `tsc --noEmit`) | When adding required fields to Event type, grep all fixtures/helpers: `grep -r "Event = {" tests/ src/**/__tests__/` |
| Test written for unimplemented feature | `save-batch-integration.test.ts` test expected `full_description_gr` to be populated, but `saveBatch()` only writes English columns. Test failed every run since it was added | Don't merge tests for unimplemented features — use `test.skip()` with a comment explaining what's pending |

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

## Parallel Subagent Manifest Contamination (2026-03-02)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Parallel agents overwriting manifest files | 3 agents launched for batches 4/5/6 — agent "batch 4" processed batch 6's events, agent "batch 5" processed batch 4's events, agent "batch 6" also processed batch 4's events. Batch 5 events (including premium Nekyia) required a 4th agent re-run | Agents must verify manifest event IDs match the event IDs in their brief before processing. Add manifest validation to subagent prompts |
| Agents couldn't find batch-N.md files | Despite files existing, agents reported "file not found" and fell back to other briefs | May be a timing issue with file creation vs agent start. Consider adding a verification step that the brief file exists before launching agents |
| `save-batch --clean` deletes other batches' temp files | When agents saved wrong manifests, `--clean` removed description files belonging to other batches | Only use `--clean` on the final save, or ensure manifest event IDs are correct before any `--clean` operation |

## Auto-Enrich Runtime (2026-03-04)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Unattended auto-enrich too slow | Batch 1 took 41 min (100+ tool calls, 110K tokens). Batches 2-3 never started before job timeout | Cap unattended batch size to 3 events, or add `--max-tool-calls` limit to `claude -p`. Interactive agents average ~15 min per 5-event batch — unattended research depth is uncapped |

## Diagnostic Grep Tightness (2026-04-09)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| Concluded "Mode C leaves no diagnostic trace" without grepping tightly around the failure region | The Apr 8 20:29 Mode C event appeared opaque on first inspection: `Enriching batch-1...` followed by `ERROR: batch-1 failed (exit 1) after 1s` with no obvious error message. I flagged it as "needs investigation" and mentally queued a separate diagnostic session. But the relevant stderr WAS already in the log — I just hadn't grepped tightly enough around the exact failure timestamps. When I later ran `awk '/20:29:33.*Warming up/,/20:29:39.*Events enriched/' logs/auto-enrich-2026-04-08.log`, the root cause was immediately visible: three distinct `API Error: 500 Internal server error` lines with captured `request_id`s | Before concluding that a failure is "opaque" or "needs investigation", run at least two grep passes: (1) the normal timestamp-bounded grep around the failure, and (2) a wider awk range capturing every line between the "start" and "end" markers of the failure. Error output from subprocesses often lands between log-framework-generated lines and gets filtered out by naive greps that only match specific keywords. The `awk '/start_pattern/,/end_pattern/'` range form catches everything in between, including unexpected content |
| The existing `>> "$LOG_FILE" 2>&1` in `auto-enrich.sh:294` WAS capturing stderr the whole time | I almost proposed a "Step 0.5: add stderr capture" fix based on the assumption that stderr was being discarded. This would have been a no-op fix — the info was always there. User caught the misconception by asking me to verify the stderr-capture claim before acting on it. Five minutes of reading the actual code beat an hour of speculative debugging | Always verify "X is broken" claims by reading the relevant code BEFORE proposing a fix. The `Read` tool is cheap; wrong fixes cost debugging time. When a user or a previous session says "this thing is broken", treat it as a hypothesis, not a fact, and confirm it empirically |
| Didn't survey `launchctl list` state at session start | S79 planning assumed only `com.agentathens.daily` existed as the monolithic job. Mid-session, `launchctl list \| grep agentathens` revealed THREE existing jobs: `daily`, `auto-enrich`, and `enrichment-check`. The `auto-enrich` job had `LastExitStatus=1` and a corresponding `.plist` file I didn't know existed. It wasn't a blocker (per-mode locks protect against collision), but my plan was incomplete | At session start for any work involving launchd, ALWAYS run `launchctl list \| grep <project-prefix>` to enumerate registered jobs, AND `ls ~/Library/LaunchAgents/<prefix>*.plist` to enumerate installed files. Two separate checks because launchctl only shows LOADED jobs, not unloaded-but-present files. Both lists should be captured as part of Step 0 prerequisites for any launchd-adjacent session |

## Runtime Artifacts in Git (2026-04-08)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| `git add -A` in `run_deploy()` swept runtime artifacts into every daily commit | `scripts/daily-automated.sh:470` used `git add -A` to capture any source code changes from the morning pipeline. But `-A` stages EVERYTHING not gitignored — including `data/events.db` (36 MB SQLite binary), `data/content-hashes.json` (1.1 MB, regenerated daily with 42K line diffs), `data/health-reports/*.txt` (new file every day), and `temp-briefs/batch-*.md` (enrichment scratch files). Result: every daily commit was 40 files / 23,640 insertions / 21,634 deletions, with a binary delta on the 36 MB DB | Never track runtime state in git. See `.gitignore` "Runtime artifacts" section. For anything being *generated* by the pipeline (DB, caches, state files), add to gitignore and replace git's implicit backup with an explicit one (`scripts/backup-events-db.sh` is the template) |
| Git push took 39m 52s on daily auto-commit | The binary diff of events.db + the 42K-line content-hashes.json diff made `git pack-objects` slow locally AND GitHub's server-side processing slow. Packing binary deltas is CPU-bound; uploading is bandwidth-bound; GitHub's ref update is latency-bound. All three compounded. Observed in `logs/pipeline-2026-04-08.log` lines 3884-3889: phase start 14:42:28, push success log 15:22:20, delta 2392 seconds | The fix landed in commit `81a690b57`: `git rm --cached` the 78 runtime files, add to .gitignore, add backup script hooked as Phase 0 of daily-automated.sh. Projected next push: seconds, not minutes |
| `cp data/events.db backup.db` would not have been a safe backup either | Considered as an alternative to `VACUUM INTO`. But SQLite in WAL mode has `events.db-shm` and `events.db-wal` auxiliary files that hold uncommitted state. A `cp` during active writes captures a DB missing the WAL state — potentially corrupt or stale. Naive backup scripts that use `cp` for SQLite look safe but can silently produce broken backups | Always use `sqlite3 <db> "VACUUM INTO '<target>'"` for SQLite backups. It's the online backup API, acquires proper locks, includes WAL-pending state, and bonus: defragments the output (we saw 36 MB → 5.6 MB compressed, partly because of defrag + partly because of gzip on the schema text) |
| `temp-briefs/` had 25 tracked files, not the ~6 I expected | Before the cleanup, `git ls-files temp-briefs/` returned: batch-1/2/3 (current), archive/batch-1/2/3 (previous run's kept copies), 12 rewrite-N files from a prior "rewrite" session that was never cleaned up, plus `sample-brief.md` and `exemplar-candidates.json`. Because `git add -A` never excluded the directory, every scratch file ever written there became permanent history | Any directory used as scratch space MUST be in .gitignore from day 1. Even "I'll clean it up later" is dangerous with `git add -A` — "later" never comes and the bloat compounds silently |
| 375 MiB of loose git objects vs 72 MiB packed — `git gc` hadn't run recently | After weeks of daily binary commits, git's loose-object area had ballooned 5× beyond its packed size. Normally git auto-gc's loose objects periodically, but the daily commit cadence + large binary files may have kept it behind. `git count-objects -vH` revealed the imbalance | Run `git count-objects -vH` periodically. If loose size >> pack size, schedule a `git gc`. If loose objects contain large binaries that shouldn't be in history at all, that's a sign to add them to gitignore AND consider `git filter-repo` to purge them from history (destructive, needs backup of `.git/`) |

## Auto-Enrich Clamshell Sleep (2026-04-08)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| `caffeinate -i` does not survive clamshell sleep on battery | Apr 7 batch-1 hang: laptop lid closed on battery power, `caffeinate -i sleep 1800` watchdog was suspended along with the rest of user-space, batch hung for 19h 42m until the lock-age check force-recovered it. R1.A test measured `caffeinate -i sleep 300` taking **753s** wall-clock on battery + 8-min clamshell. `-i` only asserts the "idle sleep prevention" flag; clamshell sleep is a *different* sleep path that idle-sleep blocking does not cover | Split by power state. Detect via `pmset -g batt`: on battery, **skip the batch entirely** (the next launchd cycle retries — idempotent, safe). On AC, use `caffeinate -s sleep "$BATCH_TIMEOUT"` — `-s` is documented to block system sleep and R1.A re-test on AC measured `caffeinate -s sleep 300` at exactly 300s through an 8-min clamshell window. See `scripts/auto-enrich.sh` commit `5a4a529f4` |
| `caffeinate -s` on battery is *not* a fix | Per `man caffeinate` on this machine: `-s` is "valid only when system is running on AC power". On battery it silently falls through to an idle-sleep assertion — equivalent to `-i`, which we already measured at 753s of FAIL. Reading the man page reveals this; running the command does not (it exits 0 either way) | Never rely on `caffeinate -s` on battery. If your process *must* run on battery + lid closed, there is no userspace fix — the only answer is to not start. Hence the battery-skip branch |
| Hardware-dependent tests cannot run inside Claude Code | R1.A requires closing the laptop lid for 8 minutes. Claude Code shares the user's terminal session — closing the lid suspends Claude too, and Claude cannot "wait 8 minutes then observe" across a suspend. The only way to run this test is a bare-metal user session with a phone timer | Prepare the exact one-line test recipe for the user to run in a non-Claude terminal, capture the `Elapsed:` output when they return, then continue diagnosis. Do NOT try to run `caffeinate -i sleep 300` from inside a Claude tool call — the tool call will either block for 5 minutes (burning context) or get killed by Claude's own timeout. See `patterns.md` → "Hardware-Dependent Test Pattern" |

## Auto-Enrich Timeout & Zombies (2026-03-09)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| `perl -e "alarm N; exec @ARGV"` timeout doesn't work | `exec` replaces the perl process image — alarm handler is lost. Claude CLI ran for 9.6 and 10.1 hours on Mar 8. 3 zombie processes accumulated (12d, 7d, 7d runtime) | Use bash background+kill pattern: run process with `&`, `sleep N && kill PID` in background subshell, `wait` for result. This is the POSIX-portable timeout |
| No lock file on auto-enrich | Three overlapping runs on Mar 4 caused SQLite contention (0-second failures) | Add PID-based lock file with stale detection (`kill -0`) and `trap EXIT` cleanup |
| BATCH_TIMEOUT=900 too short | Healthy batches already take 700-1050s. With timeout now actually working, legit batches would be killed | Set to 1800s (30 min). Monitor duration trends — alert if batch exceeds 1200s |
| No zombie process cleanup on startup | Orphaned `claude` processes from previous crashes consumed memory and held file handles indefinitely | `pgrep -x claude` on startup, kill headless CLI processes (exclude Claude.app) |
| Guard 3 violation: S69 fixed before diagnosing | Executor implemented 4 fixes without reporting diagnosis first. Plan said "DO NOT FIX ANYTHING YET. Report classification." | Always enforce Guard 3 on debugging sessions. The diagnosis step exists to prevent fixing the wrong thing. Diagnosis → review → fix → verification |

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
| Auto-enrich tested only in interactive shell | launchd runs with minimal PATH — `command -v claude` returns nothing. Interactive terminal testing doesn't catch environment differences. | Always test automation scripts with: `env -i HOME="$HOME" PATH="<plist-PATH>" bash script.sh --dry-run` |
| Too broad LIKE queries | `WHERE venue LIKE '%Σωκράτης%'` deleted Athens AND Amfissa venues | Use exact match or verify manually; same venue name can exist in different cities |
| Same venue name, different cities | "Καφενείο Ο Σωκράτης" exists in both Athens (Χίου 42) AND Amfissa | Always verify addresses; add distinguishing notes in rejected-locations.json |
| Assuming API module exists | Script imported non-existent `callToolAgent()` from `tool-agent` | Claude Code operates interactively - design scripts to output data, not call APIs |
| Two separate EventType definitions | `src/types.ts` and `src/enrichment/types.ts` define separate EventType unions. Changes to one don't propagate. | Keep both in sync. Also check `config/categorization-keywords.json` and `config/venue-categories.json` for type references |
| Non-canonical type names in Record<EventType> | `genre-keywords.ts` used `conference`, `meetup`, etc. as keys — these aren't in EventType union | Always use canonical EventType values. Tech subtypes go under `tech` key |

## Enrichment Watchdog / Launchd (2026-04-20, S89)

| Mistake | What Happened | Correct Approach |
|---------|---------------|------------------|
| `caffeinate -s sleep N` used as a sleep-survivable watchdog | `caffeinate -s` asserts against *idle* sleep only — it does NOT prevent clamshell (lid-close) sleep. When the lid was closed during an enrichment run, the `sleep` process was frozen by the kernel while wall-clock time kept advancing. 30-min batch timeouts stretched to multiple hours, holding the lock and blocking every subsequent launchd slot. Three-day enrichment drought was the symptom. | Use a wall-clock loop: `( END=$(( $(date +%s) + TIMEOUT )); while [ $(date +%s) -lt $END ]; do sleep 30; done; kill PID ) &`. `date +%s` measures real time and advances through system sleep, so timeouts fire correctly even with the lid closed. |
| Overnight launchd slots on a laptop | `enrichment-01` and `enrichment-22` plists fired at 01:00 and 22:00 when the laptop was asleep with the lid closed. They always failed, held the `.auto-enrich.lock` for hours (until `LOCK_MAX_AGE=7200s` sweep), and blocked the next healthy daytime slot. | Disable overnight slots on laptop hardware — `launchctl unload` the 01:00 and 22:00 plists and leave only the daytime slots active. Only re-enable overnight scheduling on always-on hardware (Mac mini, server). |
| No auth pre-check before batch loop | An expired Claude CLI session caused every batch in a run to hit 401, but the script still burned the full `BATCH_TIMEOUT` (1800s) per batch before giving up. One bad session wasted ~60 min per run and produced zero enrichments. | Before the batch loop (after warm-up), run a cheap one-shot probe: `echo "ok" \| "$CLAUDE_BIN" -p --output-format json >/dev/null 2>&1`. On non-zero exit, log and `exit 1` — the existing `trap` cleans up the lock. Fails fast in seconds instead of minutes. |
| Unauthorized compression of institutional memory | User provided a full-verbatim session log to save as `docs/session-log.md`. Executor silently compressed Sessions 34-91 + Design Sessions to one-paragraph summaries (to "optimize file size"), dropping **Open items** and **Surprises** fields. Those fields are load-bearing: Open items = state hand-off between sessions (Dev Planner reads them to find pending work), Surprises = raw material for mistakes.md/patterns.md promotion. Compression broke both pipelines. Also compressed the *more recent* sessions (more operationally relevant) while keeping old ones verbatim — exactly backwards. | Policy decisions about what fields to keep/drop in append-only institutional memory (session-log, known-issues, decisions, patterns, mistakes) belong to the user, not the executor. If tempted to compress for file size, stop and ask first. File size is not the axis to optimize — fidelity is. Append-only files are read during context checks, not edited every session, so the editing cost argument is wrong. |
