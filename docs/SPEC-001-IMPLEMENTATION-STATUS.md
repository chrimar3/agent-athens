# Spec 001 Implementation Status

**Last Updated:** 2025-01-20
**Spec:** `specs/001-data-pipeline/spec.md`
**Status:** ✅ Core Quality Gates Implemented & Verified

**Test Suite:** 361 tests passing (892 assertions)

**Latest Update:** Task 3.4 (Email Ingestion Implementation) complete

---

## Overview

This document tracks the implementation status of spec-001-data-pipeline, focusing on the Data Quality Gates (Part B) which have been fully implemented and verified.

---

## ✅ Working & Verified Files

### Location Filter (Spec-Compliant)

| File | Status | Purpose |
|------|--------|---------|
| `src/quality/location-filter.ts` | ✅ Working | **Primary filter** - Spec-compliant location verification |
| `config/athens-venues.json` | ✅ Working | Whitelist of 78 Athens venues with variations |
| `config/rejected-locations.json` | ✅ Working | Blacklist of non-Athens cities/venues |
| `scripts/filter-athens-only.ts` | ✅ Working | Script to apply filter to database |

**Key Features:**
- Returns `LocationResult` with status: `verified_athens` | `pass_through` | `unverified` | `rejected_non_athens` | `problematic`
- Auto-merges venue variations to canonical names (e.g., "Gazarte - Ground Stage" → "Gazarte")
- Logs all rejections to `rejected_events` table
- Loads configs from JSON files (not hardcoded)

**Usage:**
```typescript
import { checkLocation, shouldShowOnSite } from '../src/quality/location-filter';

const result = checkLocation(event);
// result.status: 'verified_athens' | 'pass_through' | 'unverified' | ...
// result.matched_venue: canonical venue name if matched
// result.rejection_reason: why it was rejected (if applicable)

// Or use convenience function
if (shouldShowOnSite(event)) {
  // Only verified_athens and pass_through events
}
```

---

### Normalization (Verified)

| File | Status | Purpose |
|------|--------|---------|
| `src/utils/normalize.ts` | ✅ Working | RawEvent → Event normalization |

**Key Features:**
- `generateId()` creates deterministic IDs for deduplication
- Normalizes: lowercase, collapse whitespace, remove punctuation
- Handles various date formats (ISO, DD/MM/YYYY)
- Removes stage suffixes from venue names for ID generation

---

### Deduplication (Verified)

| File | Status | Purpose |
|------|--------|---------|
| `scripts/remove-duplicates.ts` | ✅ Working | 8-pass deduplication with recurring event protection |

**Key Features:**
- Pass 0: Protects recurring events (theater runs, exhibitions, festivals)
- Pass 1-8: URL, exact match, cross-source, fuzzy title, venue normalization, etc.
- Quality ranking: more.com > viva.gr > gazarte.gr > email
- Dry-run mode for safe preview

**Usage:**
```bash
bun run scripts/remove-duplicates.ts --dry-run  # Preview
bun run scripts/remove-duplicates.ts            # Apply
```

---

### Legacy Filter (Backwards Compatible)

| File | Status | Purpose |
|------|--------|---------|
| `src/utils/athens-filter.ts` | ✅ Working | Legacy filter for existing code |

**Note:** Updated to work with new config format. All tests pass.

---

### Venue Review CLI

| File | Status | Purpose |
|------|--------|---------|
| `scripts/review-venues.ts` | ✅ Working | Interactive venue verification CLI |

**Usage:**
```bash
bun run scripts/review-venues.ts --list     # List unverified venues
bun run scripts/review-venues.ts            # Interactive review mode
```

**Actions:**
- **Approve**: Adds venue to whitelist, updates events to `verified_athens`
- **Reject**: Adds venue to blacklist, moves events to `rejected_events`
- **Skip**: Leaves unchanged for later review

---

### Database Migration

| File | Status | Purpose |
|------|--------|---------|
| `scripts/migrate-spec-001.ts` | ✅ Working | Adds spec-required columns/tables |

**Added:**
- `location_status` column on events
- `needs_enrichment` column on events
- `enriched_at` column on events
- `rejected_events` table
- `processed_emails` table

**Run:** `bun run scripts/migrate-spec-001.ts`

---

## Database Schema (Current)

```sql
-- Events table now has:
location_status TEXT DEFAULT 'unverified'  -- verified_athens|pass_through|unverified|problematic
needs_enrichment INTEGER DEFAULT 1          -- 1=needs, 0=done
enriched_at TEXT                            -- ISO timestamp when enriched

-- New tables:
CREATE TABLE rejected_events (
  id INTEGER PRIMARY KEY,
  original_id TEXT,
  title TEXT NOT NULL,
  date TEXT,
  venue TEXT,
  source TEXT,
  rejection_reason TEXT NOT NULL,
  location_status TEXT NOT NULL,
  raw_data TEXT,
  rejected_at TEXT NOT NULL
);

CREATE TABLE processed_emails (
  id INTEGER PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  subject TEXT,
  sender TEXT,
  received_at TEXT,
  processed_at TEXT NOT NULL,
  event_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processed',
  error_message TEXT,
  raw_path TEXT
);
```

---

## Current Database State

After running the location filter:

| Metric | Count |
|--------|-------|
| Total events | 213 |
| Verified Athens | 188 |
| Pass-through | 11 |
| Unverified | 0 |
| Problematic | 14 |
| **Show on site** | **199** |
| Rejected (logged) | 10 |

---

## Test Files (Constitution-Compliant Structure)

Tests now follow Article VI.3: `src/module/__tests__/module.test.ts`

| File | Tests | Purpose |
|------|-------|---------|
| `src/db/__tests__/migrations.test.ts` | 13 | Database migration verification |
| `src/db/__tests__/processed-emails.test.ts` | 22 | Processed emails table |
| `src/db/__tests__/queries.test.ts` | 37 | Database queries |
| `src/db/__tests__/transformations.test.ts` | 15 | Event transformations |
| `src/db/__tests__/upsert.test.ts` | 18 | Upsert operations |
| `src/utils/__tests__/normalize-dedup.test.ts` | 30 | Normalization + ID generation |
| `src/utils/__tests__/filters.test.ts` | 23 | Event filtering |
| `src/utils/__tests__/athens-filter.test.ts` | 12 | Legacy Athens filter |
| `src/utils/__tests__/normalize.test.ts` | 28 | Event normalization |
| `src/quality/__tests__/location-filter.test.ts` | 36 | Athens location filtering |
| `src/quality/__tests__/deduplication.test.ts` | 47 | Deduplication logic |
| `src/templates/__tests__/page.test.ts` | 25 | Page rendering |
| `scripts/__tests__/review-venues.test.ts` | 19 | Venue review CLI workflow |
| `src/ingest/__tests__/email-ingestion.test.ts` | 23 | IMAP email ingestion with retry logic |

**Total: 361 tests, 892 assertions**

**Test Commands:**
```bash
bun test                                    # All tests (361)
bun test src/quality/__tests__/             # Quality gate tests
bun test src/db/__tests__/                  # Database tests
bun test src/ingest/__tests__/              # Ingestion tests
bun test scripts/__tests__/                 # Script tests
```

---

## Verification Commands

```bash
# Run all tests (361 tests, should all pass)
bun test

# Check database stats
sqlite3 data/events.db "SELECT location_status, COUNT(*) FROM events GROUP BY location_status;"

# Check rejected events
sqlite3 data/events.db "SELECT COUNT(*) FROM rejected_events;"

# Preview location filter
bun run scripts/filter-athens-only.ts --dry-run

# Preview deduplication
bun run scripts/remove-duplicates.ts --dry-run
```

---

## Config File Formats

### athens-venues.json

```json
{
  "venues": [
    {
      "canonical_name": "Gazarte",
      "variations": ["GAZARTE", "Γκαζάρτε", "Gazarte - Ground Stage"],
      "neighborhood": "Gazi"
    }
  ],
  "neighborhoods": ["Μοναστηράκι", "Monastiraki", "Γκάζι", "Gazi"],
  "pass_through_venues": ["Πολλαπλοί Χώροι", "Multiple Venues"]
}
```

### rejected-locations.json

```json
{
  "cities": [
    {"greek": "Θεσσαλονίκη", "latin": "Thessaloniki"}
  ],
  "regions": [
    {"greek": "Κρήτη", "latin": "Crete"}
  ],
  "venues": [
    {"name": "Principal Mylos Complex", "reason": "Thessaloniki venue"}
  ],
  "problematic_entries": {
    "entries": [
      {"name": "TBA", "reason": "Means 'To Be Announced' - not a venue"}
    ]
  }
}
```

---

## Spec Compliance Checklist

### FR-B: Data Quality Gates

- [x] Maintain venue whitelist in `config/athens-venues.json`
- [x] Maintain location blacklist in `config/rejected-locations.json`
- [x] Check location BEFORE inserting into database
- [x] Normalize titles for deduplication (remove quotes, collapse spaces, lowercase)
- [x] Add `location_status` column with correct values
- [x] Display only `verified_athens` and `pass_through` events on site
- [x] Auto-merge venue variations to canonical names
- [x] Log all rejections with reason

---

## Files NOT to Modify

These files are working correctly - do not modify without running tests:

1. `src/quality/location-filter.ts` - Spec-compliant, tested
2. `src/utils/normalize.ts` - Working, tested
3. `scripts/remove-duplicates.ts` - Working, tested
4. `config/athens-venues.json` - Only add new venues
5. `config/rejected-locations.json` - Only add new blacklist entries

---

## Implementation Progress

Per spec-001-data-pipeline tasks.md:

**Completed:**
- [x] Phase 1: Database Foundation (Tasks 1.1-1.4)
- [x] Phase 2: Quality Gates (Tasks 2.1-2.7)
- [x] Task 3.1: Processed Emails Table Test
- [x] Task 3.2: Processed Emails Implementation (`src/db/processed-emails.ts`)
- [x] Task 3.3: Email Ingestion Test (`src/ingest/__tests__/email-ingestion.test.ts` - 23 tests)
- [x] Task 3.4: Email Ingestion Implementation (`src/ingest/email-ingestion.ts`)

**Not Started:**
- [ ] Phase 4: Email parsing
- [ ] Phase 5: Enrichment workflow
- [ ] Phase 6: Orchestration & automation
- [ ] Phase 7: Integration & docs

---

*Document created: 2025-01-20*
