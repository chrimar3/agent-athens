---
description: Pre-scrape checklist — run before any scraping session
---

# Pre-Scrape Checklist

Before running any scraper, complete these checks:

## 1. Read Required Context
- [ ] Read `.claude/notes/ledger.md` § Mistakes (especially Scraping and Pipeline Issues sections)
- [ ] Read `.claude/notes/ledger.md` § Patterns (Scraper Pattern, Time Extraction Pattern)

## 2. Run Session Diagnostic
```bash
./scripts/session-diagnostic.sh
```
Note which sources are stale (check "Last Scrape Per Source" section).

## 3. Pre-Flight Checks
- [ ] Confirm `data/events.db` exists and is not locked
- [ ] Check disk space: `du -sh data/events.db`
- [ ] Verify bun is available: `bun --version`

## 4. Decide Scope
- Full scrape: `bun run scripts/scrape-all.ts`
- Dry run first: `bun run scripts/scrape-all.ts --dry-run`
- Single source: `bun run scripts/scrape-all.ts --source=<name>`

## 5. Known Source Issues
| Source | Issue | Workaround |
|--------|-------|------------|
| more.com | Requires Puppeteer/JS rendering | Time extracted at scrape time |
| onassis | Bot protection | Uses Puppeteer |
| benaki | Bot protection | Uses Puppeteer |
| ticketservices | Can hang on price fetch | Has per-event timeout |
| athinorama.gr | Connectivity issues sometimes | Retry or skip |

## 6. After Scraping
- [ ] Run `bun run scripts/filter-athens-only.ts` to update location statuses
- [ ] Check for new unverified venues: `sqlite3 data/events.db "SELECT DISTINCT venue_name FROM events WHERE location_status = 'unverified' ORDER BY venue_name;"`
- [ ] Run `./scripts/session-diagnostic.sh` again to see changes
