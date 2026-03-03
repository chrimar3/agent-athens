/**
 * Integration tests for scripts/save-batch.ts
 *
 * Tests the batch save pipeline that reads description files from
 * temp-descriptions/ and saves them to the database with full
 * audit logging, manifest-driven targeting, and cleanup.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  saveBatch,
  extractOpeningSentence,
  appendRecentOpenings,
  cleanupBatchFiles,
  loadManifest,
  parseArgs,
  ensureV4Columns,
} from '../scripts/save-batch';
import type { SaveResult, RecentOpening } from '../scripts/save-batch';

// ============================================================================
// Test DB helpers
// ============================================================================

const TEST_DESCRIPTIONS_DIR = 'temp-descriptions';
const TEST_OPENINGS_PATH = join(TEST_DESCRIPTIONS_DIR, 'recent-openings.json');

function createSaveBatchTestDB(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Create events table with columns save-batch needs
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      venue_name TEXT,
      price_type TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      genres TEXT,
      description TEXT,
      full_description TEXT,
      full_description_gr TEXT,
      full_description_en TEXT,
      tags TEXT,
      source TEXT,
      needs_enrichment INTEGER DEFAULT 1,
      location_status TEXT DEFAULT 'verified_athens',
      enriched_at TEXT,
      updated_at TEXT
    );
  `);

  // Create enrichment_log table
  db.exec(`
    CREATE TABLE enrichment_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      enrichment_version TEXT,
      word_count_en INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add v4 columns
  ensureV4Columns(db);

  return db;
}

function insertTestEvent(db: Database, id: string, overrides: Record<string, any> = {}): void {
  const defaults = {
    title: 'Test Event',
    type: 'concert',
    venue_name: 'Test Venue',
    price_type: 'with-ticket',
    start_date: '2027-06-15T21:00:00',
    genres: null,
    full_description: null,
    tags: null,
    source: 'test',
    needs_enrichment: 1,
    location_status: 'verified_athens',
  };
  const row = { ...defaults, ...overrides };
  db.prepare(`
    INSERT INTO events (id, title, type, venue_name, price_type, start_date, genres,
      full_description, tags, source, needs_enrichment, location_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, row.title, row.type, row.venue_name, row.price_type, row.start_date,
    row.genres, row.full_description, row.tags, row.source, row.needs_enrichment, row.location_status);
}

function writeTestDescription(eventId: string, content: string): void {
  if (!existsSync(TEST_DESCRIPTIONS_DIR)) {
    mkdirSync(TEST_DESCRIPTIONS_DIR, { recursive: true });
  }
  writeFileSync(join(TEST_DESCRIPTIONS_DIR, `${eventId}.md`), content, 'utf-8');
}

function writeTestTags(eventId: string, tags: string[]): void {
  if (!existsSync(TEST_DESCRIPTIONS_DIR)) {
    mkdirSync(TEST_DESCRIPTIONS_DIR, { recursive: true });
  }
  writeFileSync(join(TEST_DESCRIPTIONS_DIR, `${eventId}.tags.json`), JSON.stringify(tags), 'utf-8');
}

function cleanupTestFiles(eventIds: string[]): void {
  for (const id of eventIds) {
    try { rmSync(join(TEST_DESCRIPTIONS_DIR, `${id}.md`)); } catch {}
    try { rmSync(join(TEST_DESCRIPTIONS_DIR, `${id}.tags.json`)); } catch {}
  }
  try { rmSync(TEST_OPENINGS_PATH); } catch {}
}

// A sample description long enough to pass quality gates
const SAMPLE_DESCRIPTION = `The first thing you hear when you descend into the basement of Half Note Jazz Club is the upright bass. Not amplified — the wood itself resonates against the stone walls, and you feel the low notes in your ribs before your ears fully register them.

Joanna Mattrey arrives on stage without fanfare. She positions her violin at an angle that suggests classical training, then draws a sound from it that belongs to no conservatory. Her bow technique alternates between feathery harmonics and aggressive sul ponticello scraping — a vocabulary she developed during a decade in Brooklyn's experimental music scene.

| Aspect | Details |
|--------|---------|
| Setting | Intimate basement venue, 120 capacity, exposed brick |
| Vibe | Focused listening room — conversations stop when the bow touches string |
| Sound | Unprocessed acoustic violin, contact microphones on occasion |
| Door | First come first served, arrive 30 minutes early for front row |

The crowd here splits between two types: the contemporary classical devotees who know Mattrey from her work with Zs and the improvised music regulars who follow the Half Note programming by instinct. You will see leather jackets next to wool blazers, which tells you everything about where experimental and jazz audiences overlap in Athens.

If you need your music to follow chord progressions and resolve neatly, this is not your evening. But if you want to hear a musician who treats silence as a compositional element and the violin as a percussion instrument when it suits her, there is nowhere else in Athens offering this tonight.

The nearest metro is Akropoli (Line 2), a seven-minute walk south through Mets. Tickets are available at the door — arrive by 20:30 for the best seats.

One violinist, one room, one night. This combination of performer and venue does not repeat.

tags: \`live-music\`, \`experimental\`, \`intimate-venue\`
Last verified: 2027-06-01`;

// ============================================================================
// Tests: saveBatch core
// ============================================================================

describe('save-batch', () => {
  let db: Database;
  const testEventIds = ['test-save-001', 'test-save-002'];

  beforeEach(() => {
    db = createSaveBatchTestDB();
    for (const id of testEventIds) {
      insertTestEvent(db, id);
      writeTestDescription(id, SAMPLE_DESCRIPTION);
    }
  });

  afterEach(() => {
    db.close();
    cleanupTestFiles(testEventIds);
  });

  test('saves description to events.full_description and sets needs_enrichment=0', () => {
    const { results } = saveBatch(db, testEventIds, 'test-session', 1, false);

    expect(results.every(r => r.success)).toBe(true);

    for (const id of testEventIds) {
      const row = db.prepare('SELECT full_description, needs_enrichment FROM events WHERE id = ?').get(id) as any;
      expect(row.full_description).toBe(SAMPLE_DESCRIPTION);
      expect(row.needs_enrichment).toBe(0);
    }
  });

  test('sets enriched_at timestamp', () => {
    saveBatch(db, testEventIds, 'test-session', 1, false);

    for (const id of testEventIds) {
      const row = db.prepare('SELECT enriched_at FROM events WHERE id = ?').get(id) as any;
      expect(row.enriched_at).toBeTruthy();
    }
  });

  test('logs to enrichment_log with before/after snapshots', () => {
    saveBatch(db, testEventIds, 'test-session', 42, false);

    for (const id of testEventIds) {
      const log = db.prepare('SELECT * FROM enrichment_log WHERE event_id = ?').get(id) as any;
      expect(log).toBeTruthy();
      expect(log.enrichment_version).toBe('v4');
      expect(log.description_before).toBeNull(); // First enrichment
      expect(log.description_after).toBe(SAMPLE_DESCRIPTION);
      expect(log.batch_number).toBe(42);
      expect(log.session_id).toBe('test-session');
    }
  });

  test('--dry-run does not modify DB', () => {
    const { results } = saveBatch(db, testEventIds, 'test-session', 1, true);

    expect(results.every(r => r.success)).toBe(true);

    // DB should be unchanged
    for (const id of testEventIds) {
      const row = db.prepare('SELECT full_description, needs_enrichment FROM events WHERE id = ?').get(id) as any;
      expect(row.full_description).toBeNull();
      expect(row.needs_enrichment).toBe(1);
    }

    // No enrichment_log entries
    const logCount = db.prepare('SELECT COUNT(*) as c FROM enrichment_log').get() as any;
    expect(logCount.c).toBe(0);
  });

  test('skips files where event not found in DB', () => {
    writeTestDescription('nonexistent-event-id', 'Some description here.');
    const { results } = saveBatch(db, ['nonexistent-event-id'], 'test-session', 1, false);
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('not found');

    cleanupTestFiles(['nonexistent-event-id']);
  });

  test('reports count of saved/failed', () => {
    // One valid, one missing from DB
    const ids = ['test-save-001', 'ghost-event'];
    writeTestDescription('ghost-event', 'Some description for the ghost event.');
    const { results } = saveBatch(db, ids, 'test-session', 1, false);

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    cleanupTestFiles(['ghost-event']);
  });

  test('uses session_id and batch_number for audit trail', () => {
    saveBatch(db, ['test-save-001'], 'feb-2026-audit', 7, false);

    const log = db.prepare('SELECT session_id, batch_number FROM enrichment_log WHERE event_id = ?')
      .get('test-save-001') as any;

    expect(log.session_id).toBe('feb-2026-audit');
    expect(log.batch_number).toBe(7);
  });

  test('processes only manifest event IDs, not all files in directory', () => {
    // Write an extra file that is NOT in the manifest
    writeTestDescription('extra-not-in-manifest', 'This should not be saved.');
    insertTestEvent(db, 'extra-not-in-manifest');

    const { results } = saveBatch(db, ['test-save-001'], 'test-session', 1, false);

    // Only 1 result (the manifest event), not 3
    expect(results.length).toBe(1);
    expect(results[0].eventId).toBe('test-save-001');

    // extra event should NOT have been saved
    const extraRow = db.prepare('SELECT full_description FROM events WHERE id = ?')
      .get('extra-not-in-manifest') as any;
    expect(extraRow.full_description).toBeNull();

    cleanupTestFiles(['extra-not-in-manifest']);
  });

  test('reports missing description files', () => {
    const { results } = saveBatch(db, ['test-save-001', 'no-file-for-this'], 'test-session', 1, false);

    const missing = results.find(r => r.eventId === 'no-file-for-this');
    expect(missing).toBeTruthy();
    expect(missing!.success).toBe(false);
    expect(missing!.error).toContain('file not found');
  });
});

// ============================================================================
// Tests: extractOpeningSentence
// ============================================================================

describe('extractOpeningSentence', () => {
  test('extracts first sentence ending with period', () => {
    const result = extractOpeningSentence('The bass hits your chest. More words follow.');
    expect(result).toBe('The bass hits your chest.');
  });

  test('extracts first sentence ending with exclamation', () => {
    const result = extractOpeningSentence('What a night! The crowd surges forward.');
    expect(result).toBe('What a night!');
  });

  test('extracts first sentence ending with question mark', () => {
    const result = extractOpeningSentence('Can you hear the drums? They carry through the walls.');
    expect(result).toBe('Can you hear the drums?');
  });

  test('handles text without sentence ending', () => {
    const result = extractOpeningSentence('A very long opening that never ends and keeps going');
    // Should fall back to first 120 chars
    expect(result.length).toBeLessThanOrEqual(120);
  });

  test('handles short text', () => {
    const result = extractOpeningSentence('Short.');
    expect(result).toBe('Short.');
  });
});

// ============================================================================
// Tests: appendRecentOpenings
// ============================================================================

describe('appendRecentOpenings', () => {
  beforeEach(() => {
    try { rmSync(TEST_OPENINGS_PATH); } catch {}
  });

  afterEach(() => {
    try { rmSync(TEST_OPENINGS_PATH); } catch {}
  });

  test('creates file with new openings when none exist', () => {
    const openings: RecentOpening[] = [
      { event_id: 'test-1', opening_sentence: 'The bass drops.', saved_at: new Date().toISOString() },
    ];
    appendRecentOpenings(openings);

    expect(existsSync(TEST_OPENINGS_PATH)).toBe(true);
    const stored = JSON.parse(readFileSync(TEST_OPENINGS_PATH, 'utf-8'));
    expect(stored.length).toBe(1);
    expect(stored[0].opening_sentence).toBe('The bass drops.');
  });

  test('appends to existing openings', () => {
    // Write initial openings
    const initial: RecentOpening[] = [
      { event_id: 'old-1', opening_sentence: 'Old opening.', saved_at: '2026-01-01T00:00:00Z' },
    ];
    writeFileSync(TEST_OPENINGS_PATH, JSON.stringify(initial), 'utf-8');

    // Append new
    const newOpenings: RecentOpening[] = [
      { event_id: 'new-1', opening_sentence: 'New opening.', saved_at: new Date().toISOString() },
    ];
    appendRecentOpenings(newOpenings);

    const stored = JSON.parse(readFileSync(TEST_OPENINGS_PATH, 'utf-8'));
    expect(stored.length).toBe(2);
  });

  test('maintains rolling window of 30 entries', () => {
    // Write 28 existing openings
    const existing: RecentOpening[] = Array.from({ length: 28 }, (_, i) => ({
      event_id: `old-${i}`,
      opening_sentence: `Opening ${i}.`,
      saved_at: '2026-01-01T00:00:00Z',
    }));
    writeFileSync(TEST_OPENINGS_PATH, JSON.stringify(existing), 'utf-8');

    // Append 5 new ones (total would be 33, should trim to 30)
    const newOpenings: RecentOpening[] = Array.from({ length: 5 }, (_, i) => ({
      event_id: `new-${i}`,
      opening_sentence: `New opening ${i}.`,
      saved_at: new Date().toISOString(),
    }));
    appendRecentOpenings(newOpenings);

    const stored = JSON.parse(readFileSync(TEST_OPENINGS_PATH, 'utf-8'));
    expect(stored.length).toBe(30);
    // Newest should be at the end
    expect(stored[29].event_id).toBe('new-4');
    // Oldest entries should have been trimmed
    expect(stored[0].event_id).toBe('old-3'); // first 3 dropped
  });
});

// ============================================================================
// Tests: cleanupBatchFiles
// ============================================================================

describe('cleanupBatchFiles', () => {
  const cleanupIds = ['cleanup-test-1', 'cleanup-test-2'];

  beforeEach(() => {
    for (const id of cleanupIds) {
      writeTestDescription(id, 'temp content');
      writeTestTags(id, ['tag1', 'tag2']);
    }
  });

  afterEach(() => {
    cleanupTestFiles(cleanupIds);
  });

  test('--clean removes .md and .tags.json after success', () => {
    // Verify files exist first
    for (const id of cleanupIds) {
      expect(existsSync(join(TEST_DESCRIPTIONS_DIR, `${id}.md`))).toBe(true);
      expect(existsSync(join(TEST_DESCRIPTIONS_DIR, `${id}.tags.json`))).toBe(true);
    }

    cleanupBatchFiles(cleanupIds);

    // Verify files removed
    for (const id of cleanupIds) {
      expect(existsSync(join(TEST_DESCRIPTIONS_DIR, `${id}.md`))).toBe(false);
      expect(existsSync(join(TEST_DESCRIPTIONS_DIR, `${id}.tags.json`))).toBe(false);
    }
  });

  test('--clean preserves recent-openings.json', () => {
    // Write a recent-openings.json
    const openingsPath = join(TEST_DESCRIPTIONS_DIR, 'recent-openings.json');
    writeFileSync(openingsPath, '[]', 'utf-8');

    cleanupBatchFiles(cleanupIds);

    // recent-openings.json should still exist
    expect(existsSync(openingsPath)).toBe(true);

    // Clean up
    try { rmSync(openingsPath); } catch {}
  });
});

// ============================================================================
// Tests: loadManifest
// ============================================================================

describe('loadManifest', () => {
  const testManifestPath = 'temp-briefs/test-manifest.json';

  afterEach(() => {
    try { rmSync(testManifestPath); } catch {}
  });

  test('loads valid manifest file', () => {
    mkdirSync('temp-briefs', { recursive: true });
    writeFileSync(testManifestPath, JSON.stringify({
      batch_id: 42,
      generated_at: '2026-03-01T10:00:00Z',
      event_ids: ['a', 'b', 'c'],
    }), 'utf-8');

    const manifest = loadManifest(testManifestPath);
    expect(manifest.batch_id).toBe(42);
    expect(manifest.event_ids).toEqual(['a', 'b', 'c']);
  });

  test('throws on missing manifest file', () => {
    expect(() => loadManifest('nonexistent-manifest.json')).toThrow('Manifest not found');
  });

  test('throws on invalid JSON manifest', () => {
    mkdirSync('temp-briefs', { recursive: true });
    writeFileSync(testManifestPath, '{ not valid json !!!', 'utf-8');
    expect(() => loadManifest(testManifestPath)).toThrow('Invalid manifest JSON');
  });
});

// ============================================================================
// Tests: Dual-language save
// ============================================================================

const SAMPLE_EN_DESCRIPTION = `The first thing you hear when you descend into Half Note Jazz Club's basement is the upright bass. Not amplified — the wood resonates against stone walls, and you feel the low notes in your ribs before your ears register them.

Joanna Mattrey arrives without fanfare. She positions her violin at an angle suggesting classical training, then draws a sound that belongs to no conservatory. Her bow technique alternates between feathery harmonics and aggressive sul ponticello scraping.

| Aspect | Details |
|--------|---------|
| Setting | Intimate basement venue, 120 capacity, exposed brick |
| Vibe | Focused listening room — conversations stop when the bow touches string |
| Sound | Unprocessed acoustic violin, contact microphones on occasion |
| Door | First come first served, arrive 30 minutes early |

The crowd splits between contemporary classical devotees who know Mattrey from Zs and improvised music regulars who follow Half Note programming by instinct. You will see leather jackets next to wool blazers.

If you need music that follows chord progressions and resolves neatly, this is not your evening. But if you want to hear a musician who treats silence as a compositional element, there is nowhere else in Athens offering this tonight.

Nearest metro is Akropoli, a seven-minute walk south through Mets. Tickets available at the door — arrive by 20:30 for the best seats.

One violinist, one room, one night.

tags: \`live-music\`, \`experimental\`, \`intimate-venue\`
Last verified: 2027-06-01`;

describe('save-batch dual-language', () => {
  let db: Database;
  const testEventIds = ['test-dual-001'];

  // SAMPLE_DESCRIPTION is English (primary .md file)
  // SAMPLE_EN_DESCRIPTION is repurposed here as a Greek stand-in for testing column assignment
  const SAMPLE_GR_DESCRIPTION = SAMPLE_EN_DESCRIPTION; // reuse for structural testing

  beforeEach(() => {
    db = createSaveBatchTestDB();
    for (const id of testEventIds) {
      insertTestEvent(db, id);
      writeTestDescription(id, SAMPLE_DESCRIPTION);
      // Also write Greek description (.gr.md)
      if (!existsSync(TEST_DESCRIPTIONS_DIR)) {
        mkdirSync(TEST_DESCRIPTIONS_DIR, { recursive: true });
      }
      writeFileSync(join(TEST_DESCRIPTIONS_DIR, `${id}.gr.md`), SAMPLE_GR_DESCRIPTION, 'utf-8');
    }
  });

  afterEach(() => {
    db.close();
    cleanupTestFiles(testEventIds);
    // Also clean up .gr.md files
    for (const id of testEventIds) {
      try { rmSync(join(TEST_DESCRIPTIONS_DIR, `${id}.gr.md`)); } catch {}
    }
  });

  test('saves English to full_description_en and Greek to full_description_gr', () => {
    const { results } = saveBatch(db, testEventIds, 'test-dual', 1, false);
    expect(results.every(r => r.success)).toBe(true);

    const row = db.prepare(
      'SELECT full_description, full_description_gr, full_description_en FROM events WHERE id = ?'
    ).get('test-dual-001') as any;

    expect(row.full_description).toBe(SAMPLE_DESCRIPTION);
    expect(row.full_description_en).toBe(SAMPLE_DESCRIPTION);
    expect(row.full_description_gr).toBe(SAMPLE_GR_DESCRIPTION);
  });

  test('legacy full_description equals English description for backwards compat', () => {
    saveBatch(db, testEventIds, 'test-dual', 1, false);

    const row = db.prepare(
      'SELECT full_description, full_description_en FROM events WHERE id = ?'
    ).get('test-dual-001') as any;

    expect(row.full_description).toBe(row.full_description_en);
  });

  test('saves without Greek when .gr.md file is missing', () => {
    // Remove the Greek file
    try { rmSync(join(TEST_DESCRIPTIONS_DIR, 'test-dual-001.gr.md')); } catch {}

    const { results } = saveBatch(db, testEventIds, 'test-dual', 1, false);
    expect(results.every(r => r.success)).toBe(true);

    const row = db.prepare(
      'SELECT full_description, full_description_gr, full_description_en FROM events WHERE id = ?'
    ).get('test-dual-001') as any;

    expect(row.full_description).toBe(SAMPLE_DESCRIPTION);
    expect(row.full_description_en).toBe(SAMPLE_DESCRIPTION);
    expect(row.full_description_gr).toBeNull();
  });
});

// ============================================================================
// Tests: English quality gates
// ============================================================================

describe('validateEnglishDescription', () => {
  // Import inline to keep the test file self-contained
  const { validateEnglishDescription } = require('../src/enrichment/quality-gates');

  const mockEvent = {
    title: 'Test Concert',
    type: 'concert',
    venue: 'Half Note Jazz Club',
    date: '2027-06-15',
  };

  test('passes valid English description', () => {
    const result = validateEnglishDescription(mockEvent, SAMPLE_EN_DESCRIPTION, 'standard');
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  test('flags descriptions with too much Greek text', () => {
    const greekText = 'Η πρώτη νότα που ακούτε είναι το μπάσο. Δεν είναι ενισχυμένο — το ξύλο αντηχεί στους τοίχους. You feel the bass in your ribs as you settle into the darkened room.';
    const result = validateEnglishDescription(mockEvent, greekText, 'standard');
    const greekIssue = result.issues.find((i: { code: string }) => i.code === 'EN_TOO_MUCH_GREEK' || i.code === 'EN_SOME_GREEK');
    expect(greekIssue).toBeTruthy();
  });

  test('flags Entity Locking violations', () => {
    const badTranslation = 'This concert features urban folk music with long-necked lute and you can feel the party spirit in the room.';
    const result = validateEnglishDescription(mockEvent, badTranslation, 'standard');
    const violations = result.issues.filter((i: { code: string }) => i.code === 'EN_ENTITY_LOCK_VIOLATION');
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  test('flags lazy adjectives', () => {
    const lazyDesc = 'This amazing concert at Half Note is an incredible experience. You hear the fantastic sounds and the stunning atmosphere fills the room with energy.';
    const result = validateEnglishDescription(mockEvent, lazyDesc, 'standard');
    const lazyIssue = result.issues.find((i: { code: string }) => i.code === 'LAZY_ADJECTIVES');
    expect(lazyIssue).toBeTruthy();
  });
});

// ============================================================================
// Tests: parseArgs
// ============================================================================

describe('parseArgs', () => {
  test('throws when --manifest is missing', () => {
    const originalArgv = process.argv;
    process.argv = ['bun', 'save-batch.ts'];
    try {
      expect(() => parseArgs()).toThrow('--manifest');
    } finally {
      process.argv = originalArgv;
    }
  });
});
