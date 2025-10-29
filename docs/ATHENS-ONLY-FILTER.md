# Athens-Only Event Filtering Procedure

## Overview

**agent-athens** is exclusively for Athens, Greece events. This document describes the systematic procedure to ensure only Athens events are included in the database.

## Problem

Event sources (more.com, viva.gr, etc.) include events from across Greece:
- Thessaloniki (Concert Hall, theaters)
- Ioannina
- Patras
- Other Greek cities

These must be filtered out **after every import** to maintain Athens-only focus.

---

## The Filtering Procedure

### Step 1: Import Events (as usual)

```bash
# Import from scrapers or emails
bun run scripts/import-scraped-events.ts
# or
bun run src/ingest/email-ingestion.ts
```

### Step 2: Run Athens-Only Filter

**ALWAYS run this after importing**:

```bash
bun run scripts/filter-athens-only.ts
```

This removes events from:
- Thessaloniki (Μεγαρο Μουσικης Θεσσαλονικης, Θεατρο Τεχνων, etc.)
- Ioannina
- Patras
- Larissa
- Volos
- Rhodes
- Corfu
- Chania
- Kalamata
- Other Greek cities

**Output example**:
```
🗺️  Filtering for Athens-only events...

📊 Events before filtering: 786

⚠️  Found non-Athens events in 4 venue(s):

1. Μεγαρο Μουσικης Θεσσαλονικης - Αιθουσα Αιμιλιος Ριαδης: 11 event(s)
2. Μεγαρο Μουσικης Θεσσαλονικης: 5 event(s)
3. Θεατρο Τεχνων Θεσσαλονικης: 4 event(s)
4. (πρωην Εκφραση) Ιωαννινα: 1 event(s)

📊 Total non-Athens events to remove: 21

✅ Successfully removed non-Athens events

📊 Summary:
   Before: 786 events
   After: 765 events
   Removed: 21 events
```

### Step 3: Run Deduplication (if needed)

```bash
bun run scripts/remove-duplicates.ts
```

### Step 4: Rebuild Site

```bash
bun run build
```

### Step 5: Deploy

```bash
git add data/events.db dist/
git commit -m "chore: Filter non-Athens events and rebuild"
git push origin main
```

---

## Complete Workflow (Every Import)

```bash
# 1. Import events
bun run scripts/import-scraped-events.ts

# 2. Filter Athens-only (CRITICAL STEP)
bun run scripts/filter-athens-only.ts

# 3. Remove duplicates
bun run scripts/remove-duplicates.ts

# 4. Rebuild site
bun run build

# 5. Deploy
git add data/events.db dist/
git commit -m "chore: Daily update $(date +%Y-%m-%d) - Athens only"
git push origin main
```

---

## How the Filter Works

### Detection Patterns

The filter searches for venue names containing:

```typescript
const NON_ATHENS_PATTERNS = [
  '%Θεσσαλονικ%',      // Thessaloniki
  '%Ιωαννιν%',         // Ioannina
  '%Πατρ%',            // Patras
  '%Ηρακλει%',         // Heraklion (Crete)
  '%Λαρισ%',           // Larissa
  '%Βολ%',             // Volos
  '%Ροδ%',             // Rhodes
  '%Κερκυρ%',          // Corfu
  '%Χανι%',            // Chania
  '%Καλαματ%',         // Kalamata
];
```

### SQL Query Used

```sql
DELETE FROM events
WHERE venue_name LIKE '%Θεσσαλονικ%'
   OR venue_name LIKE '%Ιωαννιν%'
   OR venue_name LIKE '%Πατρ%'
   -- etc.
```

---

## Verification

### Check for non-Athens events:

```bash
sqlite3 data/events.db "
  SELECT venue_name, COUNT(*) as count
  FROM events
  WHERE start_date >= date('now')
    AND (venue_name LIKE '%Θεσσαλονικ%' OR venue_name LIKE '%Ιωαννιν%')
  GROUP BY venue_name;
"
```

**Expected output**: No results (empty)

### Check total Athens events:

```bash
sqlite3 data/events.db "
  SELECT COUNT(*) FROM events WHERE start_date >= date('now');
"
```

---

## Adding New City Exclusions

If you discover events from other Greek cities, add patterns to `scripts/filter-athens-only.ts`:

```typescript
const NON_ATHENS_PATTERNS = [
  // Existing patterns...
  '%NewCity%',  // Add new city pattern here
];
```

Then re-run the filter.

---

## Important Notes

### 1. Athens Metro Area is OK

These ARE valid Athens events:
- Piraeus (part of Athens metro)
- Kifisia, Glyfada, Marousi (northern/southern suburbs)
- Kallithea, Nea Smyrni (neighborhoods)

### 2. Don't Over-Filter

Venue names like "Θέατρο Αθηνών" (Athens Theater) should NOT be filtered even if performing outside Athens temporarily. The filter targets **venue location**, not event origin.

### 3. Manual Review (Rare Cases)

If unsure about a venue:
1. Check the source URL
2. Look up the venue address
3. Manually remove if confirmed non-Athens:
   ```bash
   sqlite3 data/events.db "DELETE FROM events WHERE id = 'event-id-here';"
   ```

---

## Why This Matters

**For AI Answer Engines:**
- Clear geographic focus = better citations
- "Athens events" query should return ONLY Athens
- Mixed cities confuse AI agents and users

**For Users:**
- Trust: "agent-athens" means Athens only
- No wasted time on Thessaloniki events when searching Athens
- Clean, focused experience

**For SEO:**
- Consistent geographic signals
- Better local search rankings
- Clear content scope

---

## Troubleshooting

### Problem: Filter removes valid Athens events

**Solution**: Check the pattern - it might be too broad
- Example: `%Ροδ%` would match "Ροδοδάφνη" (Athens neighborhood)
- Make patterns more specific: `%Ροδο%` → `%Ροδος%` (Rhodes island)

### Problem: Non-Athens events still appearing

**Solution**: Add new patterns
1. Find the venue name: `sqlite3 data/events.db "SELECT DISTINCT venue_name FROM events WHERE ..."`
2. Add pattern to `NON_ATHENS_PATTERNS`
3. Re-run filter

### Problem: Filter not running automatically

**Solution**: This is MANUAL by design
- Filter must be run explicitly after imports
- Prevents accidental data loss
- Allows review of what's being removed

---

## History

**Created**: October 29, 2025
**Reason**: Discovered 22 non-Athens events (21 Thessaloniki, 1 Ioannina) in production database
**First Run**: Removed 22 events (786 → 764)

**Updates**:
- 2025-10-29: Initial creation with 10 city patterns

---

## Quick Reference

**Always run after import**: `bun run scripts/filter-athens-only.ts`
**Check if clean**: `sqlite3 data/events.db "SELECT COUNT(*) FROM events WHERE venue_name LIKE '%Θεσσαλονικ%';"`
**Expected result**: 0

---

**Last Updated**: October 29, 2025
**Status**: Active procedure - must be followed for every import
