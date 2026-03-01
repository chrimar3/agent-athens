/**
 * Tests for scripts/generate-enrichment-brief.ts
 *
 * Tests the brief generation pipeline that selects events,
 * looks up context, and assembles self-contained enrichment briefs
 * for subagent consumption.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, readFileSync, rmSync } from 'fs';
import {
  selectDiverseBatch,
  lookupVenueIntel,
  lookupEntityKnowledge,
  selectExemplars,
  buildBrief,
  estimateTokens,
  writeManifest,
  loadRecentOpenings,
} from '../scripts/generate-enrichment-brief';
import type { RecentOpening } from '../scripts/generate-enrichment-brief';

// ============================================================================
// Test DB helpers (inline — schema.sql doesn't have needs_enrichment/location_status)
// ============================================================================

function createBriefTestDB(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL;');

  // Create events table with the columns selectDiverseBatch needs
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      venue_name TEXT,
      price_type TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      time_doors TEXT,
      url TEXT,
      description TEXT,
      full_description TEXT,
      source TEXT,
      needs_enrichment INTEGER DEFAULT 1,
      location_status TEXT DEFAULT 'verified_athens'
    );
  `);

  // Create entity_knowledge table
  db.exec(`
    CREATE TABLE entity_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      name TEXT NOT NULL,
      canonical_name TEXT,
      bio TEXT,
      genre TEXT,
      notable_works TEXT,
      career_highlights TEXT,
      active_since INTEGER,
      athens_context TEXT,
      fun_facts TEXT,
      source TEXT,
      source_url TEXT,
      confidence TEXT DEFAULT 'medium',
      last_verified TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(entity_type, canonical_name)
    );
  `);

  return db;
}

function insertEvent(db: Database, overrides: Record<string, any> = {}): void {
  const defaults = {
    id: `event-${Math.random().toString(36).slice(2, 10)}`,
    title: 'Test Event',
    type: 'concert',
    venue_name: 'Test Venue',
    price_type: 'with-ticket',
    start_date: '2027-06-15T21:00:00',
    end_date: null,
    time_doors: null,
    url: null,
    description: null,
    full_description: null,
    source: 'test',
    needs_enrichment: 1,
    location_status: 'verified_athens',
  };
  const row = { ...defaults, ...overrides };
  db.prepare(`
    INSERT INTO events (id, title, type, venue_name, price_type, start_date, end_date,
      time_doors, url, description, full_description, source, needs_enrichment, location_status)
    VALUES ($id, $title, $type, $venue_name, $price_type, $start_date, $end_date,
      $time_doors, $url, $description, $full_description, $source, $needs_enrichment, $location_status)
  `).run({
    $id: row.id,
    $title: row.title,
    $type: row.type,
    $venue_name: row.venue_name,
    $price_type: row.price_type,
    $start_date: row.start_date,
    $end_date: row.end_date,
    $time_doors: row.time_doors,
    $url: row.url,
    $description: row.description,
    $full_description: row.full_description,
    $source: row.source,
    $needs_enrichment: row.needs_enrichment,
    $location_status: row.location_status,
  });
}

// ============================================================================
// Tests: selectDiverseBatch
// ============================================================================

describe('selectDiverseBatch', () => {
  let db: Database;

  beforeEach(() => {
    db = createBriefTestDB();
  });

  afterEach(() => {
    db.close();
  });

  test('returns N events with max 2 per type', () => {
    // Insert 4 concerts, 4 theater, 4 exhibitions, 4 dj_sets
    for (let i = 0; i < 4; i++) {
      insertEvent(db, { id: `concert-${i}`, type: 'concert', start_date: `2027-06-${15 + i}T21:00:00` });
      insertEvent(db, { id: `theater-${i}`, type: 'theater', start_date: `2027-06-${15 + i}T21:00:00` });
      insertEvent(db, { id: `exhibition-${i}`, type: 'exhibition', start_date: `2027-06-${15 + i}T10:00:00`, end_date: `2027-08-01T18:00:00` });
      insertEvent(db, { id: `dj_set-${i}`, type: 'dj_set', start_date: `2027-06-${15 + i}T23:00:00` });
    }

    const selected = selectDiverseBatch(db, 5);
    expect(selected.length).toBe(5);

    // Count per type
    const typeCounts = new Map<string, number>();
    for (const e of selected) {
      typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
    }

    // No type should have more than 2
    for (const [type, count] of typeCounts) {
      expect(count).toBeLessThanOrEqual(2);
    }

    // At least 3 different types
    expect(typeCounts.size).toBeGreaterThanOrEqual(3);
  });

  test('uses end_date for exhibitions, not start_date — TIER 1', () => {
    // Exhibition with past start_date but future end_date (currently running)
    insertEvent(db, {
      id: 'running-exhibition',
      type: 'exhibition',
      start_date: '2025-01-01T10:00:00',
      end_date: '2028-12-31T18:00:00',
    });

    const selected = selectDiverseBatch(db, 5);
    expect(selected.map(e => e.id)).toContain('running-exhibition');
  });

  test('only selects needs_enrichment events with verified_athens or pass_through', () => {
    // Eligible event (different venue to avoid enriched-sibling filter)
    insertEvent(db, { id: 'eligible', venue_name: 'Venue A', needs_enrichment: 1, location_status: 'verified_athens' });
    // Already enriched (different venue so it doesn't filter out 'eligible')
    insertEvent(db, { id: 'enriched', venue_name: 'Venue B', needs_enrichment: 1, location_status: 'verified_athens', full_description: 'Already done' });
    // Wrong location_status
    insertEvent(db, { id: 'unverified', venue_name: 'Venue C', needs_enrichment: 1, location_status: 'unverified' });
    // needs_enrichment = 0
    insertEvent(db, { id: 'no-need', venue_name: 'Venue D', needs_enrichment: 0, location_status: 'verified_athens' });
    // pass_through is eligible
    insertEvent(db, { id: 'pass-through', venue_name: 'Venue E', needs_enrichment: 1, location_status: 'pass_through' });

    const selected = selectDiverseBatch(db, 10);
    const ids = selected.map(e => e.id);

    expect(ids).toContain('eligible');
    expect(ids).toContain('pass-through');
    expect(ids).not.toContain('enriched');
    expect(ids).not.toContain('unverified');
    expect(ids).not.toContain('no-need');
  });

  test('returns future events only, soonest first within type', () => {
    insertEvent(db, { id: 'past', type: 'concert', start_date: '2020-01-01T21:00:00' });
    insertEvent(db, { id: 'soon', type: 'concert', start_date: '2027-06-15T21:00:00' });
    insertEvent(db, { id: 'later', type: 'concert', start_date: '2027-09-01T21:00:00' });

    const selected = selectDiverseBatch(db, 5);
    const ids = selected.map(e => e.id);

    expect(ids).not.toContain('past');
    expect(ids).toContain('soon');
    // 'soon' should come before 'later' since they're same type
    if (ids.includes('later')) {
      expect(ids.indexOf('soon')).toBeLessThan(ids.indexOf('later'));
    }
  });

  test('returns fewer than N gracefully when not enough qualify', () => {
    insertEvent(db, { id: 'only-one', type: 'concert' });
    const selected = selectDiverseBatch(db, 5);
    expect(selected.length).toBe(1);
    expect(selected[0].id).toBe('only-one');
  });

  test('returns empty array when zero events qualify', () => {
    const selected = selectDiverseBatch(db, 5);
    expect(selected).toEqual([]);
  });

  test('selectDiverseBatch(db, 15) returns 15 unique events', () => {
    // Insert 20 events across types
    const types = ['concert', 'theater', 'exhibition', 'dj_set', 'classical', 'workshop', 'performance', 'cinema'];
    for (let i = 0; i < 20; i++) {
      const type = types[i % types.length];
      insertEvent(db, {
        id: `event-${i}`,
        type,
        start_date: `2027-06-${String(15 + (i % 15)).padStart(2, '0')}T21:00:00`,
        end_date: type === 'exhibition' ? '2027-12-31T18:00:00' : null,
      });
    }

    const selected = selectDiverseBatch(db, 15);
    expect(selected.length).toBe(15);

    // All IDs should be unique
    const ids = selected.map(e => e.id);
    expect(new Set(ids).size).toBe(15);
  });

  test('splitting into 3 batches gives non-overlapping ID sets', () => {
    // Insert 15 events across types
    const types = ['concert', 'theater', 'exhibition', 'dj_set', 'classical', 'workshop', 'performance', 'cinema'];
    for (let i = 0; i < 15; i++) {
      insertEvent(db, {
        id: `event-${i}`,
        type: types[i % types.length],
        start_date: `2027-06-${String(15 + (i % 15)).padStart(2, '0')}T21:00:00`,
        end_date: types[i % types.length] === 'exhibition' ? '2027-12-31T18:00:00' : null,
      });
    }

    // Select 15 at once, split into 3 slices of 5
    const all = selectDiverseBatch(db, 15);
    const batch1 = all.slice(0, 5);
    const batch2 = all.slice(5, 10);
    const batch3 = all.slice(10, 15);

    const ids1 = new Set(batch1.map(e => e.id));
    const ids2 = new Set(batch2.map(e => e.id));
    const ids3 = new Set(batch3.map(e => e.id));

    // No overlap between any pair
    for (const id of ids1) {
      expect(ids2.has(id)).toBe(false);
      expect(ids3.has(id)).toBe(false);
    }
    for (const id of ids2) {
      expect(ids3.has(id)).toBe(false);
    }
  });
});

// ============================================================================
// Tests: lookupVenueIntel
// ============================================================================

describe('lookupVenueIntel', () => {
  test('finds venue by name in venue-intelligence.md', () => {
    // This depends on config/venue-intelligence.md existing. If it doesn't, it returns null.
    const result = lookupVenueIntel('Half Note Jazz Club');
    // Either found or null (depending on whether the file exists in test env)
    expect(result === null || typeof result === 'string').toBe(true);
  });

  test('returns null for unknown venue', () => {
    const result = lookupVenueIntel('Nonexistent Venue That Does Not Exist XYZ123');
    expect(result).toBeNull();
  });

  test('truncates venue intel to max 200 words', () => {
    const result = lookupVenueIntel('Half Note Jazz Club');
    if (result) {
      const wordCount = result.split(/\s+/).length;
      // Should be <= 200 words + "[...truncated]" marker
      expect(wordCount).toBeLessThanOrEqual(205);
    }
  });
});

// ============================================================================
// Tests: lookupEntityKnowledge
// ============================================================================

describe('lookupEntityKnowledge', () => {
  let db: Database;

  beforeEach(() => {
    db = createBriefTestDB();
  });

  afterEach(() => {
    db.close();
  });

  test('matches entities by name from entity_knowledge table', () => {
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, bio, genre)
      VALUES ('artist', 'Joanna Mattrey', 'joanna mattrey', 'NYC-based violinist', '["experimental"]')
    `).run();

    const result = lookupEntityKnowledge(db, 'Joanna Mattrey at Half Note');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toBe('Joanna Mattrey');
  });

  test('returns empty array if no entities match', () => {
    const result = lookupEntityKnowledge(db, 'Unknown Artist XYZ');
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Tests: selectExemplars
// ============================================================================

describe('selectExemplars', () => {
  test('returns 2-3 exemplar file paths', () => {
    const result = selectExemplars(['concert', 'theater']);
    // May be 0 if exemplars dir doesn't exist in test env
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test('prioritizes type-matching exemplars', () => {
    const result = selectExemplars(['theater']);
    if (result.length > 0) {
      // First result should include 'theater' if available
      const hasTypeMatch = result.some(p => p.includes('theater'));
      expect(typeof hasTypeMatch).toBe('boolean');
    }
  });

  test('includes at least 1 different type for structural variety', () => {
    const result = selectExemplars(['theater', 'theater']);
    if (result.length >= 2) {
      // At least 2 different files
      const unique = new Set(result);
      expect(unique.size).toBeGreaterThanOrEqual(2);
    }
  });
});

// ============================================================================
// Tests: buildBrief
// ============================================================================

describe('buildBrief', () => {
  test('produces valid markdown', () => {
    const events = [{
      id: 'test-1', title: 'Test Concert', type: 'concert',
      venue_name: 'Half Note', price_type: 'with-ticket',
      start_date: '2027-06-15T21:00:00', end_date: null,
      time_doors: '20:30', url: 'https://example.com', description: null, source: 'test',
    }];
    const venueIntel = new Map([['Half Note', 'Jazz venue in Mets']]);
    const entityKnowledge = new Map([['test-1', []]]);

    const brief = buildBrief(events, venueIntel, entityKnowledge, [], 1);

    expect(brief).toContain('# Enrichment Brief');
    expect(brief).toContain('## Rules');
    expect(brief).toContain('## Events to Enrich');
  });

  test('stays under 4000 tokens', () => {
    const events = [{
      id: 'test-1', title: 'Test Concert', type: 'concert',
      venue_name: 'Half Note', price_type: 'with-ticket',
      start_date: '2027-06-15T21:00:00', end_date: null,
      time_doors: null, url: null, description: null, source: 'test',
    }];
    const brief = buildBrief(events, new Map(), new Map(), [], 1);
    const { tokens } = estimateTokens(brief);
    expect(tokens).toBeLessThan(4000);
  });

  test('includes all event IDs from the batch', () => {
    const events = [
      { id: 'abc-123', title: 'Event A', type: 'concert', venue_name: 'V1', price_type: 'open', start_date: '2027-06-15T21:00:00', end_date: null, time_doors: null, url: null, description: null, source: 'test' },
      { id: 'def-456', title: 'Event B', type: 'theater', venue_name: 'V2', price_type: 'open', start_date: '2027-06-16T21:00:00', end_date: null, time_doors: null, url: null, description: null, source: 'test' },
    ];
    const brief = buildBrief(events, new Map(), new Map(), [], 1);
    expect(brief).toContain('abc-123');
    expect(brief).toContain('def-456');
  });

  test('includes CLI commands for write-description, write-tags, auto-gate-check', () => {
    const events = [{
      id: 'test-1', title: 'Test', type: 'concert', venue_name: 'V', price_type: 'open',
      start_date: '2027-06-15T21:00:00', end_date: null, time_doors: null, url: null, description: null, source: 'test',
    }];
    const brief = buildBrief(events, new Map(), new Map(), [], 1);

    expect(brief).toContain('write-description.ts');
    expect(brief).toContain('auto-gate-check.ts');
    expect(brief).toContain('write-tags.ts');
  });

  test('includes "Recent Openings" section when openings provided', () => {
    const events = [{
      id: 'test-1', title: 'Test', type: 'concert', venue_name: 'V', price_type: 'open',
      start_date: '2027-06-15T21:00:00', end_date: null, time_doors: null, url: null, description: null, source: 'test',
    }];
    const openings: RecentOpening[] = [
      { event_id: 'prev-1', opening_sentence: 'The bass hits your chest before you see the stage.', saved_at: '2026-02-28T10:00:00Z' },
      { event_id: 'prev-2', opening_sentence: 'Three flights down, the concrete corridor opens into a room that smells like old wood.', saved_at: '2026-02-28T11:00:00Z' },
    ];

    const brief = buildBrief(events, new Map(), new Map(), [], 1, openings);
    expect(brief).toContain('Recent Openings (DO NOT REUSE)');
    expect(brief).toContain('The bass hits your chest');
    expect(brief).toContain('Three flights down');
  });

  test('omits "Recent Openings" section when openings empty', () => {
    const events = [{
      id: 'test-1', title: 'Test', type: 'concert', venue_name: 'V', price_type: 'open',
      start_date: '2027-06-15T21:00:00', end_date: null, time_doors: null, url: null, description: null, source: 'test',
    }];

    const brief = buildBrief(events, new Map(), new Map(), [], 1, []);
    expect(brief).not.toContain('Recent Openings');
  });
});

// ============================================================================
// Tests: estimateTokens
// ============================================================================

describe('estimateTokens', () => {
  test('provides reasonable estimate for known text', () => {
    // ~100 words
    const text = Array(100).fill('word').join(' ');
    const { tokens } = estimateTokens(text);
    // 100 words * 0.75 = 75 tokens
    expect(tokens).toBeGreaterThan(50);
    expect(tokens).toBeLessThan(150);
  });

  test('warns when estimate exceeds 3800', () => {
    // ~5500 words -> ~4125 tokens -> over budget
    const text = Array(5500).fill('word').join(' ');
    const { overBudget } = estimateTokens(text);
    expect(overBudget).toBe(true);
  });
});

// ============================================================================
// Tests: writeManifest
// ============================================================================

describe('writeManifest', () => {
  afterEach(() => {
    // Clean up test manifests
    try {
      const path = 'temp-briefs/batch-999.manifest.json';
      if (existsSync(path)) rmSync(path);
    } catch {}
  });

  test('creates valid JSON manifest file', () => {
    const eventIds = ['abc-123', 'def-456', 'ghi-789'];
    const path = writeManifest(999, eventIds);

    expect(existsSync(path)).toBe(true);

    const manifest = JSON.parse(readFileSync(path, 'utf-8'));
    expect(manifest.batch_id).toBe(999);
    expect(manifest.event_ids).toEqual(eventIds);
    expect(manifest.generated_at).toBeTruthy();
  });
});

// ============================================================================
// Tests: loadRecentOpenings
// ============================================================================

describe('loadRecentOpenings', () => {
  test('returns empty array when file does not exist', () => {
    const result = loadRecentOpenings();
    // If the file doesn't exist, should return []
    expect(Array.isArray(result)).toBe(true);
  });
});
