# Tasks: Data Pipeline & Quality

**Spec ID:** 001-data-pipeline
**Plan Version:** 1.0
**Created:** 2025-01-20

---

## Prerequisites

- [ ] Constitution reviewed and understood
- [ ] Spec reviewed and approved
- [ ] Plan reviewed and approved
- [ ] Development environment ready (Bun, SQLite, Git)
- [ ] Gmail App Password available in `.env`
- [ ] Sample newsletter emails available for testing

---

## Phase 1: Database Foundation

### Task 1.1: Migration Test Setup [P]

**Description:** Create test infrastructure for database migrations
**Files:**
- `tests/db/migrations.test.ts`
**Dependencies:** None
**Validation:** Test file runs, imports Bun test utilities
**Time estimate:** 15 minutes

```typescript
describe('Database Migrations', () => {
  test('001_pipeline_extensions adds location_status column', () => {});
  test('001_pipeline_extensions adds needs_enrichment column', () => {});
  test('001_pipeline_extensions adds enriched_at column', () => {});
  test('001_pipeline_extensions creates rejected_events table', () => {});
  test('001_pipeline_extensions creates processed_emails table', () => {});
  test('migration preserves existing data', () => {});
  test('existing enriched events marked correctly', () => {});
});
```

---

### Task 1.2: Migration Implementation

**Description:** Create and apply unified pipeline migration
**Files:**
- `data/migrations/001_pipeline_extensions.sql`
- `scripts/migrate.ts`
- `src/db/database.ts` (extend)
**Dependencies:** Task 1.1
**Validation:** All tests from 1.1 pass
**Time estimate:** 35 minutes

---

### Task 1.3: Normalization Utility Test [P]

**Description:** Test title/venue normalization for deduplication
**Files:**
- `tests/utils/normalize.test.ts`
**Dependencies:** None
**Validation:** Tests fail (no implementation)
**Time estimate:** 20 minutes

```typescript
describe('Normalization', () => {
  test('removes Greek quotes «»', () => {
    expect(normalizeForDedup('«Τρισεύγενη»')).toBe('τρισεύγενη');
  });
  test('removes English quotes ""', () => {
    expect(normalizeForDedup('"Concert"')).toBe('concert');
  });
  test('collapses multiple spaces', () => {
    expect(normalizeForDedup('PURE  SHOW')).toBe('pure show');
  });
  test('lowercases consistently', () => {
    expect(normalizeForDedup('GAZARTE')).toBe('gazarte');
  });
  test('handles mixed Greek/English', () => {
    expect(normalizeForDedup('Jazz στο Gazarte')).toBe('jazz στο gazarte');
  });
  test('generateEventId produces consistent hash', () => {
    const id1 = generateEventId('«Test»', '2025-01-25', 'Venue');
    const id2 = generateEventId('Test', '2025-01-25', 'venue');
    expect(id1).toBe(id2);
  });
});
```

---

### Task 1.4: Normalization Utility Implementation

**Description:** Implement normalization functions
**Files:**
- `src/utils/normalize.ts`
**Dependencies:** Task 1.3
**Validation:** All tests from 1.3 pass
**Time estimate:** 20 minutes

---

## Phase 2: Quality Gates

### Task 2.1: Location Filter Test [P]

**Description:** Test Athens location filtering logic
**Files:**
- `tests/quality/location-filter.test.ts`
**Dependencies:** None
**Validation:** Tests fail (no implementation)
**Time estimate:** 30 minutes

```typescript
describe('Location Filter', () => {
  // Whitelist tests
  test('approves event at Six D.O.G.S', () => {});
  test('approves event at "Six Dogs" (variation)', () => {});
  test('approves event at SNFCC', () => {});
  test('approves event mentioning "Monastiraki"', () => {});
  
  // Blacklist tests
  test('rejects event with "Θεσσαλονίκη" in title', () => {});
  test('rejects event with "Thessaloniki" in venue', () => {});
  test('rejects event with "Πτολεμαΐδα" in venue', () => {});
  test('rejects event with "Βέροια" in title', () => {});
  
  // Unknown tests
  test('marks unknown venue as unverified', () => {});
  test('does not reject unknown venue', () => {});
});
```

---

### Task 2.2: Location Filter Implementation

**Description:** Implement Athens location verification
**Files:**
- `src/quality/location-filter.ts`
- `src/quality/venue-matcher.ts`
**Dependencies:** Task 2.1
**Validation:** All tests from 2.1 pass
**Time estimate:** 40 minutes

---

### Task 2.3: Config Files Creation [P]

**Description:** Create venue whitelist and location blacklist
**Files:**
- `config/athens-venues.json`
- `config/rejected-locations.json`
**Dependencies:** None
**Validation:** JSON files valid and loadable
**Time estimate:** 45 minutes (includes venue research)

**Note:** This requires researching current Athens venues from the database:
```sql
SELECT DISTINCT venue, COUNT(*) as count 
FROM events 
GROUP BY venue 
ORDER BY count DESC;
```

---

### Task 2.4: Deduplication Test

**Description:** Test deduplication logic with normalization
**Files:**
- `tests/quality/deduplication.test.ts`
**Dependencies:** Task 1.4
**Validation:** Tests fail (no implementation)
**Time estimate:** 25 minutes

```typescript
describe('Deduplication', () => {
  test('same title with different quotes produces same ID', () => {});
  test('same title with extra spaces produces same ID', () => {});
  test('different titles produce different IDs', () => {});
  test('shouldSkipGeneric returns true for generic when specific exists', () => {});
  test('shouldSkipGeneric returns false when no specific exists', () => {});
});
```

---

### Task 2.5: Deduplication Implementation

**Description:** Implement deduplication with normalized matching
**Files:**
- `src/quality/deduplication.ts`
- `src/db/database.ts` (update generateEventId)
**Dependencies:** Task 2.4, Task 1.4
**Validation:** All tests from 2.4 pass
**Time estimate:** 30 minutes

---

### Task 2.6: Venue Review CLI Test

**Description:** Test venue review workflow
**Files:**
- `tests/scripts/review-venues.test.ts`
**Dependencies:** Task 2.2
**Validation:** Tests fail (no implementation)
**Time estimate:** 20 minutes

```typescript
describe('Venue Review CLI', () => {
  test('lists unverified events', () => {});
  test('approve adds venue to whitelist', () => {});
  test('reject adds venue to blacklist and deletes event', () => {});
  test('skip leaves event unchanged', () => {});
});
```

---

### Task 2.7: Venue Review CLI Implementation

**Description:** Implement interactive venue review script
**Files:**
- `scripts/review-venues.ts`
**Dependencies:** Task 2.6
**Validation:** All tests from 2.6 pass
**Time estimate:** 35 minutes

---

## Phase 3: Email Ingestion

### Task 3.1: Processed Emails Table Test [P]

**Description:** Test processed_emails table queries
**Files:**
- `tests/db/processed-emails.test.ts`
**Dependencies:** Task 1.2
**Validation:** Tests fail (no implementation)
**Time estimate:** 20 minutes

```typescript
describe('ProcessedEmails Table', () => {
  test('can insert processed email record', () => {});
  test('can check if message_id exists', () => {});
  test('prevents duplicate message_ids', () => {});
  test('can query by status', () => {});
});
```

---

### Task 3.2: Processed Emails Implementation

**Description:** Implement processed_emails queries
**Files:**
- `src/db/processed-emails.ts`
**Dependencies:** Task 3.1
**Validation:** All tests from 3.1 pass
**Time estimate:** 25 minutes

---

### Task 3.3: Email Ingestion Test

**Description:** Test email ingestion with IMAP mocking
**Files:**
- `tests/ingest/email-ingestion.test.ts`
- `tests/fixtures/sample-emails/`
**Dependencies:** Task 3.2
**Validation:** Tests fail (no implementation)
**Time estimate:** 30 minutes

```typescript
describe('Email Ingestion', () => {
  test('connects to IMAP server with credentials', () => {});
  test('fetches unread emails from INBOX', () => {});
  test('saves email content to emails-to-parse directory', () => {});
  test('records message_id in processed_emails', () => {});
  test('skips already processed emails', () => {});
  test('retries on connection failure (3 attempts)', () => {});
  test('times out after configured duration', () => {});
});
```

---

### Task 3.4: Email Ingestion Implementation

**Description:** Implement email ingestion with retry logic
**Files:**
- `src/ingest/email-ingestion.ts`
- `scripts/ingest-emails.ts`
**Dependencies:** Task 3.3
**Validation:** All tests from 3.3 pass
**Time estimate:** 60 minutes

---

## Phase 4: Email Parsing

### Task 4.1: Newsletter Format Registry Test [P]

**Description:** Test newsletter format loading and matching
**Files:**
- `tests/ingest/newsletter-formats.test.ts`
**Dependencies:** None
**Validation:** Tests fail (no implementation)
**Time estimate:** 20 minutes

```typescript
describe('Newsletter Format Registry', () => {
  test('loads formats from config file', () => {});
  test('matches email to format by sender', () => {});
  test('matches email to format by subject pattern', () => {});
  test('returns null for unknown format', () => {});
});
```

---

### Task 4.2: Newsletter Format Registry Implementation

**Description:** Implement format registry and matching
**Files:**
- `src/ingest/newsletter-formats/index.ts`
- `config/newsletter-formats.json`
**Dependencies:** Task 4.1
**Validation:** All tests from 4.1 pass
**Time estimate:** 25 minutes

---

### Task 4.3: This Is Athens Parser Test

**Description:** Test parsing logic for This Is Athens newsletter
**Files:**
- `tests/ingest/parsers/this-is-athens.test.ts`
- `tests/fixtures/sample-emails/this-is-athens-sample.eml`
**Dependencies:** Task 4.2
**Validation:** Tests fail (no implementation)
**Time estimate:** 30 minutes

---

### Task 4.4: This Is Athens Parser Implementation

**Description:** Implement This Is Athens newsletter parser
**Files:**
- `src/ingest/newsletter-formats/this-is-athens.ts`
**Dependencies:** Task 4.3
**Validation:** All tests from 4.3 pass
**Time estimate:** 45 minutes

---

### Task 4.5: Lifo Guide Parser Test

**Description:** Test parsing logic for Lifo Guide newsletter
**Files:**
- `tests/ingest/parsers/lifo-guide.test.ts`
- `tests/fixtures/sample-emails/lifo-guide-sample.eml`
**Dependencies:** Task 4.2
**Validation:** Tests fail (no implementation)
**Time estimate:** 30 minutes

---

### Task 4.6: Lifo Guide Parser Implementation

**Description:** Implement Lifo Guide newsletter parser
**Files:**
- `src/ingest/newsletter-formats/lifo-guide.ts`
**Dependencies:** Task 4.5
**Validation:** All tests from 4.5 pass
**Time estimate:** 45 minutes

---

### Task 4.7: Email Parser Orchestrator Test

**Description:** Test main parser that routes to format-specific parsers
**Files:**
- `tests/ingest/email-parser.test.ts`
**Dependencies:** Task 4.4, Task 4.6
**Validation:** Tests fail (no implementation)
**Time estimate:** 25 minutes

---

### Task 4.8: Email Parser Orchestrator Implementation

**Description:** Implement main email parser with quality gate integration
**Files:**
- `src/ingest/email-parser.ts`
- `scripts/parse-emails.ts`
**Dependencies:** Task 4.7, Task 2.2, Task 2.5
**Validation:** All tests from 4.7 pass; parsed events go through quality gates
**Time estimate:** 40 minutes

---

## Phase 5: Enrichment Workflow

### Task 5.1: Word Counter Test [P]

**Description:** Test word counting utility
**Files:**
- `tests/enrichment/word-counter.test.ts`
**Dependencies:** None
**Validation:** Tests fail (no implementation)
**Time estimate:** 15 minutes

```typescript
describe('Word Counter', () => {
  test('counts simple words correctly', () => {});
  test('handles Unicode characters (Greek)', () => {});
  test('returns valid=true for 150-300 words', () => {});
  test('returns valid=false for <150 words', () => {});
  test('returns valid=false for >300 words', () => {});
});
```

---

### Task 5.2: Word Counter Implementation

**Description:** Implement word counting utility
**Files:**
- `src/enrichment/word-counter.ts`
**Dependencies:** Task 5.1
**Validation:** All tests from 5.1 pass
**Time estimate:** 15 minutes

---

### Task 5.3: Enrichment Queue Test

**Description:** Test enrichment queue management
**Files:**
- `tests/enrichment/enrichment-queue.test.ts`
**Dependencies:** Task 1.2
**Validation:** Tests fail (no implementation)
**Time estimate:** 25 minutes

```typescript
describe('Enrichment Queue', () => {
  test('returns events with needs_enrichment=1 and location_status=verified_athens', () => {});
  test('excludes unverified events from queue', () => {});
  test('sorts by date (soonest first)', () => {});
  test('markEnriched sets needs_enrichment=0 and enriched_at', () => {});
});
```

---

### Task 5.4: Enrichment Queue Implementation

**Description:** Implement enrichment queue management
**Files:**
- `src/enrichment/enrichment-queue.ts`
- `scripts/list-unenriched.ts`
**Dependencies:** Task 5.3
**Validation:** All tests from 5.3 pass
**Time estimate:** 30 minutes

---

### Task 5.5: Description Generator Test

**Description:** Test prompt building and response validation
**Files:**
- `tests/enrichment/description-generator.test.ts`
**Dependencies:** Task 5.2
**Validation:** Tests fail (no implementation)
**Time estimate:** 25 minutes

```typescript
describe('Description Generator', () => {
  test('buildPrompt includes all event details', () => {});
  test('buildPrompt specifies 150-300 word range', () => {});
  test('validateDescription accepts 200 words', () => {});
  test('validateDescription rejects 100 words', () => {});
  test('validateDescription rejects filler phrases', () => {});
});
```

---

### Task 5.6: Description Generator Implementation

**Description:** Implement prompt building and validation
**Files:**
- `src/enrichment/description-generator.ts`
**Dependencies:** Task 5.5
**Validation:** All tests from 5.5 pass
**Time estimate:** 30 minutes

---

### Task 5.7: Enrich Events Script

**Description:** Update enrichment script with queue integration
**Files:**
- `scripts/run-enrichment-pipeline.ts`
**Dependencies:** Task 5.4, Task 5.6
**Validation:** Script runs, processes queue, updates database
**Time estimate:** 40 minutes

---

## Phase 6: Orchestration & Automation

### Task 6.1: Pipeline State Test [P]

**Description:** Test pipeline state tracking
**Files:**
- `tests/orchestration/pipeline-state.test.ts`
**Dependencies:** None
**Validation:** Tests fail (no implementation)
**Time estimate:** 20 minutes

```typescript
describe('Pipeline State', () => {
  test('creates state file if not exists', () => {});
  test('records phase completion with timestamp', () => {});
  test('tracks event counts per phase', () => {});
  test('resets for new day', () => {});
});
```

---

### Task 6.2: Pipeline State Implementation

**Description:** Implement pipeline state tracking
**Files:**
- `src/orchestration/pipeline-state.ts`
**Dependencies:** Task 6.1
**Validation:** All tests from 6.1 pass
**Time estimate:** 25 minutes

---

### Task 6.3: Automated Pipeline Script

**Description:** Create shell script for launchd (full automated pipeline)
**Files:**
- `scripts/daily-automated.sh`
**Dependencies:** All Phase 2-4 tasks
**Validation:** Script runs: collection → quality gates → site gen → deploy
**Time estimate:** 35 minutes

```bash
#!/bin/bash
# daily-automated.sh
# Runs via launchd at 8:00 AM Athens time
# Full pipeline: email → scrape → quality → generate → deploy
```

---

### Task 6.4: Manual Session Script

**Description:** Create TypeScript script for Claude Code sessions
**Files:**
- `scripts/daily-manual.ts`
**Dependencies:** Task 5.7, Task 6.2
**Validation:** Script provides enrichment commands and progress output
**Time estimate:** 30 minutes

---

### Task 6.5: launchd Configuration

**Description:** Create launchd plist and setup guide
**Files:**
- `com.agentathens.daily.plist`
- `docs/LAUNCHD-SETUP.md`
**Dependencies:** Task 6.3
**Validation:** launchd runs script at 8 AM, catches up after sleep
**Time estimate:** 25 minutes

---

## Phase 7: Integration & Documentation

### Task 7.1: End-to-End Pipeline Test

**Description:** Full pipeline integration test (automated phases)
**Files:**
- `tests/integration/daily-pipeline.test.ts`
**Dependencies:** All previous tasks
**Validation:** Collection → Quality → Generation completes successfully
**Time estimate:** 45 minutes

---

### Task 7.2: Site Generation Update

**Description:** Update site generator to filter by location_status
**Files:**
- `src/generate-site.ts`
**Dependencies:** Task 2.2
**Validation:** Only verified_athens events appear on generated site
**Time estimate:** 25 minutes

---

### Task 7.3: Claude Code Session Guide

**Description:** Document the Claude Code session workflow
**Files:**
- `docs/CLAUDE-SESSION-GUIDE.md`
**Dependencies:** Task 6.4
**Validation:** Guide is clear and complete
**Time estimate:** 30 minutes

---

### Task 7.4: README Update

**Description:** Update README with new pipeline documentation
**Files:**
- `README.md`
**Dependencies:** All previous tasks
**Validation:** README reflects current architecture
**Time estimate:** 25 minutes

---

### Task 7.5: Constitution Compliance Check

**Description:** Verify implementation adheres to all constitutional articles
**Files:**
- `docs/CONSTITUTION-COMPLIANCE.md`
**Dependencies:** All previous tasks
**Validation:** All 13 articles checked, any deviations documented
**Time estimate:** 20 minutes

---

## Task Summary

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| 1. Database Foundation | 4 | 1h 30m |
| 2. Quality Gates | 7 | 3h 45m |
| 3. Email Ingestion | 4 | 2h 15m |
| 4. Email Parsing | 8 | 4h 20m |
| 5. Enrichment Workflow | 7 | 3h 00m |
| 6. Orchestration | 5 | 2h 15m |
| 7. Integration & Docs | 5 | 2h 25m |
| **Total** | **40** | **~19h 30m** |

---

## Parallelization Notes

Tasks marked `[P]` can run in parallel:
- Task 1.1 + Task 1.3 (different test files)
- Task 2.1 + Task 2.3 + Task 3.1 (independent modules)
- Task 4.1 + Task 5.1 + Task 6.1 (independent modules)

---

## Critical Path

The minimum sequential path:

```
1.2 → 2.2 → 2.5 → 4.8 → 6.3 → 7.1
 │           │
 └→ 3.4 ────┘
```

Database → Location Filter → Dedup → Parser (with quality) → Automation → Integration

---

## Execution Notes

1. **Run tests before implementation** — TDD, tests should fail first
2. **Phase 2 is critical** — Quality gates affect all downstream code
3. **Task 2.3 (venue research)** — May take longer, can be done in parallel
4. **Clear context between phases** — Use `/clear` in Claude Code
5. **Commit after each task** — Small, focused commits

---

*Tasks complete. Ready for implementation.*
