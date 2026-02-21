---
description: Pre-venue-change checklist — run before modifying venue config
---

# Pre-Venue-Change Checklist

Before modifying `config/athens-venues.json` or `config/rejected-locations.json`:

## 1. Read Required Context
- [ ] Read `.claude/notes/mistakes.md` (especially Venue Matching section)
- [ ] Read `.claude/notes/patterns.md` (Venue Variation Pattern, Venue Review Workflow)

## 2. Current State
```bash
sqlite3 data/events.db "SELECT location_status, COUNT(*) FROM events GROUP BY location_status ORDER BY COUNT(*) DESC;"
sqlite3 data/events.db "SELECT DISTINCT venue_name FROM events WHERE location_status = 'unverified' ORDER BY venue_name;"
```

## 3. Venue Variation Checklist
When adding a venue, include ALL these variations:
- [ ] English name/abbreviation
- [ ] Full Greek name with accents
- [ ] Greek name WITHOUT accents (scrapers often strip them)
- [ ] Unicode special chars (`<<` `>>` `--`)
- [ ] HTML entity equivalents (`&#171;` `&#187;` `&amp;`)
- [ ] Address-appended versions ("Venue, Street 123, Athens, Greece")
- [ ] Curly quote variants (`'` vs `'`)

## 4. Critical Reminders
- **Same venue name, different cities** — ALWAYS verify addresses before adding
- **Use exact match, not LIKE '%name%'** for DB updates
- **Curly quotes**: `'` (U+2019) does not match `'` (U+0027)
- **HTML entities**: `&#171;` does not match `<<`
- **Canonical name**: Use the most recognizable form, not a fragment

## 5. Workflow
1. Update `config/athens-venues.json` (Athens venues + variations)
2. Update `config/rejected-locations.json` (non-Athens venues)
3. Run filter: `bun run scripts/filter-athens-only.ts`
4. Verify results:
   ```bash
   sqlite3 data/events.db "SELECT location_status, COUNT(*) FROM events GROUP BY location_status;"
   ```
5. Check no unverified remain:
   ```bash
   sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE location_status = 'unverified';"
   ```

## 6. After Changes
- [ ] Run `./scripts/session-diagnostic.sh` to confirm visible count changed
- [ ] If new neighborhoods were assigned, verify they match the taxonomy
- [ ] Update `.claude/notes/decisions.md` if significant batch was processed
