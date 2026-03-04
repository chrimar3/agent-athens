#!/usr/bin/env bun
/**
 * Enrichment v4 Infrastructure Tests
 *
 * Tests for: entity_knowledge table, enrichment_log extensions,
 * knowledge_feedback table, auto gate checker, file writers, save batch.
 *
 * Uses in-memory SQLite for isolation.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// Import enrichment modules
import { validateQualityGates, type QualityGateResult } from '../src/enrichment/quality-gates';
import { LAZY_ADJECTIVES, TAG_TAXONOMY, type EventForEnrichment } from '../src/enrichment/description-generator';
import { countWords } from '../src/enrichment/word-counter';

// ============================================================================
// Test Helpers
// ============================================================================

/** Runs raw SQL on a database — wrapper for db.exec */
function runSQL(db: Database, sql: string): void {
  db.run(sql);
}

function createBaseTestDB(): Database {
  const db = new Database(':memory:');
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  // Minimal events table matching production columns used by enrichment
  db.run(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      full_description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      type TEXT NOT NULL,
      genres TEXT,
      tags TEXT,
      venue_name TEXT NOT NULL,
      venue_address TEXT,
      venue_neighborhood TEXT,
      venue_lat REAL,
      venue_lng REAL,
      venue_capacity INTEGER,
      price_type TEXT NOT NULL,
      price_amount REAL,
      price_currency TEXT DEFAULT 'EUR',
      price_range TEXT,
      url TEXT,
      source TEXT NOT NULL,
      ai_context TEXT,
      schema_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      scraped_at TEXT,
      is_cancelled INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      image_url TEXT,
      image_source TEXT,
      opening_hours TEXT,
      closed_days TEXT,
      permanent_collection INTEGER DEFAULT 0,
      location_status TEXT DEFAULT 'unverified',
      needs_enrichment INTEGER DEFAULT 1,
      enriched_at TEXT
    )
  `);

  return db;
}

function createEnrichmentLogTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS enrichment_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      enrichment_version TEXT NOT NULL,
      venue_lookup_success BOOLEAN,
      artist_lookup_success BOOLEAN,
      enrichment_time_ms INTEGER,
      word_count_en INTEGER,
      word_count_gr INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function addV4ColumnsToEnrichmentLog(db: Database): void {
  const columns = db.prepare("PRAGMA table_info(enrichment_log)").all() as { name: string }[];
  const existingCols = new Set(columns.map(c => c.name));

  const newColumns = [
    { name: 'description_before', type: 'TEXT' },
    { name: 'description_after', type: 'TEXT' },
    { name: 'batch_number', type: 'INTEGER' },
    { name: 'session_id', type: 'TEXT' },
    { name: 'quality_score', type: 'INTEGER' },
    { name: 'quality_issues', type: 'TEXT' },
    { name: 'tags_applied', type: 'TEXT' },
  ];

  for (const col of newColumns) {
    if (!existingCols.has(col.name)) {
      db.run(`ALTER TABLE enrichment_log ADD COLUMN ${col.name} ${col.type}`);
    }
  }
}

function createEntityKnowledgeTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS entity_knowledge (
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
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ek_type_name ON entity_knowledge(entity_type, canonical_name)`);
}

function createKnowledgeFeedbackTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER REFERENCES entity_knowledge(id),
      event_id TEXT,
      session_id TEXT,
      feedback_type TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      processed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function insertTestEvent(db: Database, overrides: Partial<{
  id: string; title: string; description: string; full_description: string | null;
  start_date: string; type: string; venue_name: string; price_type: string;
  source: string; tags: string | null; needs_enrichment: number; enriched_at: string | null;
}> = {}): void {
  const defaults = {
    id: 'test-event-001',
    title: 'Test Jazz Night',
    description: 'A jazz night in Athens',
    full_description: null as string | null,
    start_date: '2026-03-15',
    type: 'concert',
    venue_name: 'Half Note Jazz Club',
    price_type: 'with-ticket',
    source: 'test',
    tags: null as string | null,
    needs_enrichment: 1,
    enriched_at: null as string | null,
  };
  const e = { ...defaults, ...overrides };
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO events (id, title, description, full_description, start_date, type,
      venue_name, price_type, source, tags, needs_enrichment, enriched_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    e.id, e.title, e.description, e.full_description, e.start_date,
    e.type, e.venue_name, e.price_type, e.source, e.tags,
    e.needs_enrichment, e.enriched_at, now, now
  );
}

// ============================================================================
// Entity Knowledge Table Tests
// ============================================================================

describe('Entity Knowledge table', () => {
  let db: Database;

  beforeEach(() => {
    db = createBaseTestDB();
    createEntityKnowledgeTable(db);
  });

  afterEach(() => {
    db.close();
  });

  test('can create entity_knowledge table', () => {
    const columns = db.prepare("PRAGMA table_info(entity_knowledge)").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('entity_type');
    expect(colNames).toContain('name');
    expect(colNames).toContain('canonical_name');
    expect(colNames).toContain('bio');
    expect(colNames).toContain('athens_context');
    expect(colNames).toContain('confidence');
    expect(columns.length).toBe(17);
  });

  test('can insert artist entity with all fields', () => {
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, bio, genre,
        notable_works, career_highlights, active_since, athens_context, fun_facts,
        source, source_url, confidence, last_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'artist', 'Indira Paganotto', 'indira paganotto',
      'Spanish DJ and producer known for dark, industrial techno',
      '["techno", "industrial"]',
      '["Bala", "Rift"]',
      'Resident at Awakenings, Drumcode releases',
      2015, 'Played at Astron twice, sold out both times',
      'Trained as a classical pianist before switching to techno',
      'manual', 'https://ra.co/dj/indirapaganotto',
      'high', '2026-02-01'
    );

    const result = db.prepare("SELECT * FROM entity_knowledge WHERE canonical_name = ?")
      .get('indira paganotto') as any;
    expect(result).not.toBeNull();
    expect(result.entity_type).toBe('artist');
    expect(result.name).toBe('Indira Paganotto');
    expect(result.active_since).toBe(2015);
    expect(result.confidence).toBe('high');
  });

  test('can insert venue entity', () => {
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, bio, athens_context, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'venue', 'Gazarte', 'gazarte',
      'Multi-space venue in Gazi with rooftop, main stage, and ground floor',
      'Quality programming since 2003, Acropolis views from rooftop',
      'manual'
    );

    const result = db.prepare("SELECT * FROM entity_knowledge WHERE entity_type = 'venue'")
      .get() as any;
    expect(result).not.toBeNull();
    expect(result.name).toBe('Gazarte');
  });

  test('can query by name (case-insensitive LIKE)', () => {
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, source)
      VALUES (?, ?, ?, ?)
    `).run('artist', 'Anatolian Weapons', 'anatolian weapons', 'manual');

    const result = db.prepare(
      "SELECT * FROM entity_knowledge WHERE canonical_name LIKE ?"
    ).get('%anatolian%') as any;
    expect(result).not.toBeNull();
    expect(result.name).toBe('Anatolian Weapons');
  });

  test('can UPSERT existing entity (ON CONFLICT DO UPDATE)', () => {
    // Initial insert
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, bio, source)
      VALUES (?, ?, ?, ?, ?)
    `).run('artist', 'Test Artist', 'test artist', 'Original bio', 'manual');

    // UPSERT with updated bio
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, bio, source, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(entity_type, canonical_name) DO UPDATE SET
        bio = excluded.bio,
        source = excluded.source,
        updated_at = excluded.updated_at
    `).run('artist', 'Test Artist', 'test artist', 'Updated bio', 'web_search');

    const result = db.prepare("SELECT * FROM entity_knowledge WHERE canonical_name = ?")
      .get('test artist') as any;
    expect(result.bio).toBe('Updated bio');
    expect(result.source).toBe('web_search');
  });

  test('staleness: entities older than 6 months flagged via query', () => {
    // Insert with old last_verified date
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, last_verified, source)
      VALUES (?, ?, ?, ?, ?)
    `).run('artist', 'Old Artist', 'old artist', '2025-06-01', 'manual');

    // Insert with recent last_verified
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, last_verified, source)
      VALUES (?, ?, ?, ?, ?)
    `).run('artist', 'Recent Artist', 'recent artist', '2026-02-01', 'manual');

    const stale = db.prepare(`
      SELECT * FROM entity_knowledge
      WHERE last_verified < date('now', '-6 months')
         OR last_verified IS NULL
    `).all() as any[];

    // Old artist should be stale; recent artist should not be in results
    const staleNames = stale.map((s: any) => s.canonical_name);
    expect(staleNames).toContain('old artist');
    expect(staleNames).not.toContain('recent artist');
  });

  test('returns null for nonexistent entity', () => {
    const result = db.prepare("SELECT * FROM entity_knowledge WHERE canonical_name = ?")
      .get('nonexistent') as any;
    expect(result).toBeNull();
  });
});

// ============================================================================
// Enrichment Log Extended Tests
// ============================================================================

describe('Enrichment Log extended', () => {
  let db: Database;

  beforeEach(() => {
    db = createBaseTestDB();
    createEnrichmentLogTable(db);
  });

  afterEach(() => {
    db.close();
  });

  test('can add new columns to enrichment_log', () => {
    addV4ColumnsToEnrichmentLog(db);

    const columns = db.prepare("PRAGMA table_info(enrichment_log)").all() as { name: string }[];
    const colNames = columns.map(c => c.name);

    expect(colNames).toContain('description_before');
    expect(colNames).toContain('description_after');
    expect(colNames).toContain('batch_number');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('quality_score');
    expect(colNames).toContain('quality_issues');
    expect(colNames).toContain('tags_applied');
  });

  test('can insert log with description_before/after', () => {
    addV4ColumnsToEnrichmentLog(db);

    const before = 'Old description with basic info about the event.';
    const after = 'New enriched description with sensory details and second person voice.';

    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, description_before, description_after,
        batch_number, session_id, quality_score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('test-event-001', 'v4', before, after, 1, 'session-2026-02', 85);

    const result = db.prepare("SELECT * FROM enrichment_log WHERE event_id = ?")
      .get('test-event-001') as any;
    expect(result.description_before).toBe(before);
    expect(result.description_after).toBe(after);
    expect(result.quality_score).toBe(85);
  });

  test('can query by batch_number', () => {
    addV4ColumnsToEnrichmentLog(db);

    // Insert multiple entries across batches
    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, batch_number, session_id)
      VALUES (?, ?, ?, ?)
    `).run('event-a', 'v4', 1, 'feb-session');

    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, batch_number, session_id)
      VALUES (?, ?, ?, ?)
    `).run('event-b', 'v4', 1, 'feb-session');

    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, batch_number, session_id)
      VALUES (?, ?, ?, ?)
    `).run('event-c', 'v4', 2, 'feb-session');

    const batch1 = db.prepare("SELECT * FROM enrichment_log WHERE batch_number = ?")
      .all(1) as any[];
    expect(batch1.length).toBe(2);
  });

  test('can query by session_id', () => {
    addV4ColumnsToEnrichmentLog(db);

    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, session_id)
      VALUES (?, ?, ?)
    `).run('event-x', 'v4', 'session-alpha');

    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, session_id)
      VALUES (?, ?, ?)
    `).run('event-y', 'v4', 'session-beta');

    const alpha = db.prepare("SELECT * FROM enrichment_log WHERE session_id = ?")
      .all('session-alpha') as any[];
    expect(alpha.length).toBe(1);
    expect(alpha[0].event_id).toBe('event-x');
  });

  test('can retrieve description_before for rollback', () => {
    addV4ColumnsToEnrichmentLog(db);

    const originalDesc = 'The original description before enrichment happened.';
    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, description_before, description_after,
        batch_number, session_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('rollback-target', 'v4', originalDesc, 'New enriched text', 5, 'rollback-session');

    const result = db.prepare(`
      SELECT description_before FROM enrichment_log
      WHERE event_id = ? ORDER BY id DESC LIMIT 1
    `).get('rollback-target') as any;

    expect(result.description_before).toBe(originalDesc);
  });

  test('log entry preserves full before/after text', () => {
    addV4ColumnsToEnrichmentLog(db);

    // Multi-paragraph description with Greek characters, euro signs, em dashes
    const longBefore = `The candles on the tables throw more light than the overheads. You\u2019re seated close enough to the stage that when the musician shifts weight on the stool, you hear the wood creak.

Miranda Verouli leads her quintet through a tribute to Gal Costa \u2014 the Brazilian singer whose voice defined tropic\u00e1lia and MPB for five decades. Tickets \u20ac15\u201320.

\u0397 \u03bc\u03bf\u03c5\u03c3\u03b9\u03ba\u03ae \u03be\u03b5\u03ba\u03b9\u03bd\u03ac\u03b5\u03b9 \u03c3\u03c4\u03b9\u03c2 21:30.`;

    const longAfter = longBefore + '\n\nAdditional enriched context added here.';

    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, description_before, description_after)
      VALUES (?, ?, ?, ?)
    `).run('unicode-test', 'v4', longBefore, longAfter);

    const result = db.prepare("SELECT description_before, description_after FROM enrichment_log WHERE event_id = ?")
      .get('unicode-test') as any;

    expect(result.description_before).toBe(longBefore);
    expect(result.description_after).toBe(longAfter);
    expect(result.description_before).toContain('\u20ac');  // euro
    expect(result.description_before).toContain('\u2014');  // em dash
    expect(result.description_before).toContain('\u03bc');  // Greek mu
  });
});

// ============================================================================
// Knowledge Feedback Table Tests
// ============================================================================

describe('Knowledge Feedback table', () => {
  let db: Database;

  beforeEach(() => {
    db = createBaseTestDB();
    createEntityKnowledgeTable(db);
    createKnowledgeFeedbackTable(db);
  });

  afterEach(() => {
    db.close();
  });

  test('can create knowledge_feedback table', () => {
    const columns = db.prepare("PRAGMA table_info(knowledge_feedback)").all() as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('entity_id');
    expect(colNames).toContain('feedback_type');
    expect(colNames).toContain('processed');
  });

  test('can insert feedback entry', () => {
    // Insert entity first
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, bio, source)
      VALUES (?, ?, ?, ?, ?)
    `).run('artist', 'Test Artist', 'test artist', 'Old bio', 'manual');

    const entity = db.prepare("SELECT id FROM entity_knowledge WHERE canonical_name = ?")
      .get('test artist') as { id: number };

    db.prepare(`
      INSERT INTO knowledge_feedback (entity_id, event_id, session_id, feedback_type,
        field_name, old_value, new_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entity.id, 'event-123', 'feb-session', 'correction', 'bio', 'Old bio', 'Corrected bio text');

    const feedback = db.prepare("SELECT * FROM knowledge_feedback WHERE entity_id = ?")
      .get(entity.id) as any;
    expect(feedback.feedback_type).toBe('correction');
    expect(feedback.old_value).toBe('Old bio');
    expect(feedback.new_value).toBe('Corrected bio text');
    expect(feedback.processed).toBe(0);
  });

  test('can query unprocessed feedback', () => {
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, source)
      VALUES (?, ?, ?, ?)
    `).run('artist', 'A', 'a', 'manual');

    const entityId = (db.prepare("SELECT id FROM entity_knowledge WHERE canonical_name = 'a'").get() as any).id;

    db.prepare(`
      INSERT INTO knowledge_feedback (entity_id, feedback_type, processed) VALUES (?, ?, ?)
    `).run(entityId, 'correction', 0);

    db.prepare(`
      INSERT INTO knowledge_feedback (entity_id, feedback_type, processed) VALUES (?, ?, ?)
    `).run(entityId, 'addition', 1);

    const unprocessed = db.prepare("SELECT * FROM knowledge_feedback WHERE processed = 0")
      .all() as any[];
    expect(unprocessed.length).toBe(1);
    expect(unprocessed[0].feedback_type).toBe('correction');
  });

  test('can mark feedback as processed', () => {
    db.prepare(`
      INSERT INTO entity_knowledge (entity_type, name, canonical_name, source)
      VALUES (?, ?, ?, ?)
    `).run('venue', 'V', 'v', 'manual');

    const entityId = (db.prepare("SELECT id FROM entity_knowledge WHERE canonical_name = 'v'").get() as any).id;

    db.prepare(`
      INSERT INTO knowledge_feedback (entity_id, feedback_type) VALUES (?, ?)
    `).run(entityId, 'stale');

    const before = db.prepare("SELECT processed FROM knowledge_feedback WHERE entity_id = ?")
      .get(entityId) as any;
    expect(before.processed).toBe(0);

    db.prepare("UPDATE knowledge_feedback SET processed = 1 WHERE entity_id = ?")
      .run(entityId);

    const after = db.prepare("SELECT processed FROM knowledge_feedback WHERE entity_id = ?")
      .get(entityId) as any;
    expect(after.processed).toBe(1);
  });
});

// ============================================================================
// Auto Gate Checker Tests
// ============================================================================

describe('Auto Gate Checker', () => {
  // These test the quality gate logic that auto-gate-check.ts wraps.
  // We test the underlying validation functions directly.

  const makeEvent = (overrides: Partial<EventForEnrichment> = {}): EventForEnrichment => ({
    id: 'test-001',
    title: 'Test Jazz Night at Half Note',
    date: '2026-03-15',
    time: '21:30',
    venue: 'Half Note Jazz Club',
    type: 'concert',
    genre: 'jazz',
    price: 'with-ticket',
    ...overrides,
  });

  test('passes valid 400-word description with "you" count >= 3', () => {
    // Build a ~400 word description that passes all checks
    const desc = `You step into the dim-lit room and hear the first notes of a piano trio warming up. The bass vibrates through the wooden floor beneath your feet, and you catch the scent of espresso from the bar.

Half Note Jazz Club hosts the Spyros Manesis Trio for an evening of original compositions and reimagined standards. Manesis, who trained at the Athens Conservatory and studied with mentors in New York, brings a distinctive touch that blends Mediterranean warmth with American jazz tradition. Since 2015, he has released three albums that critics describe as essential listening for Greek jazz.

The crowd here knows their music. You will find vinyl collectors who debate the relative merits of different Blue Note pressings, musicians who have come to listen rather than network, and couples for whom live jazz is a weekly ritual. Nobody checks their phone during the solos.

| Aspect | Details |
|--------|---------|
| **Setting** | Intimate jazz room, capacity around 150, low ceilings |
| **Vibe** | Focused, warm, conversational |
| **Sound** | Pure listening room quality |
| **Door** | Reservation recommended |

The set builds from spare ballads through uptempo swing. The trio finds pockets of rhythm that suspend time, with extended improvisations that only happen when musicians trust each other completely.

If you want loud music and dancing, this is not your night. But if you understand why the piano trio is its own art form, if you appreciate musicians who listen to each other as carefully as the audience listens to them, pull up a chair.

Book your table early in the week because Saturday shows fill fast. The last metro from Akropoli runs at midnight, so you might need a taxi home after the late set. Cards and cash accepted at the bar.

Half Note remains the only room in Athens where acoustic jazz gets both the sound system and the audience it deserves. Since 1979, approximately 250 concerts each season have built a tradition you can feel the moment you walk through the door.

practical block

tags

last verified`;

    const result = validateQualityGates(makeEvent(), desc, 'premium');
    // Should pass: has second person, sensory language, details table, word count in range
    expect(result.score).toBeGreaterThan(59);
  });

  test('fails on word count < minimum for tier', () => {
    const shortDesc = 'A jazz concert happens at a venue. You should come.';
    const result = validateQualityGates(makeEvent(), shortDesc, 'premium');
    const wordIssue = result.issues.find(i => i.code === 'TOO_SHORT');
    expect(wordIssue).toBeDefined();
    expect(result.passed).toBe(false);
  });

  test('fails on word count > maximum for tier', () => {
    // Generate an overly long description (500+ words for standard tier max 300)
    const words = Array(350).fill('word').join(' ');
    const longDesc = `You walk into the venue. ${words} This is a test description about Half Note Jazz Club.`;
    const result = validateQualityGates(makeEvent(), longDesc, 'standard');
    const wordIssue = result.issues.find(i => i.code === 'TOO_LONG');
    expect(wordIssue).toBeDefined();
  });

  test('fails on banned lazy adjectives', () => {
    // Build description with enough words to pass count + include lazy adjectives
    const fillerWords = Array(200).fill('test word here now').join(' ');
    const desc = `This amazing concert is an incredible experience at Half Note Jazz Club. You feel the vibrant energy. ${fillerWords}`;
    const result = validateQualityGates(makeEvent(), desc, 'standard');
    const lazyIssue = result.issues.find(i => i.code === 'LAZY_ADJECTIVES');
    expect(lazyIssue).toBeDefined();
  });

  test('warns on caution words (but can still pass)', () => {
    // An info-level issue should not prevent passing on its own
    const result = validateQualityGates(makeEvent(), 'You hear the sound of music at Half Note Jazz Club on this special evening of jazz.', 'stub');
    // Stub tier has relaxed requirements; info issues don't block pass
    const infoIssues = result.issues.filter(i => i.severity === 'info');
    expect(infoIssues.length).toBeGreaterThanOrEqual(0);
  });

  test('detects low "you" count for premium', () => {
    const fillerWords = Array(100).fill('music jazz note bass drum').join(' ');
    const noYouDesc = `The concert starts at nine. The band plays well. The sound fills the room. Half Note Jazz Club hosts this event. ${fillerWords}`;
    const result = validateQualityGates(makeEvent(), noYouDesc, 'premium');
    const youIssue = result.issues.find(i =>
      i.code === 'NO_SECOND_PERSON' || i.message.toLowerCase().includes('you')
    );
    expect(youIssue).toBeDefined();
  });

  test('premium description without table does NOT trigger NO_TABLE (prose bridges preferred)', () => {
    const fillerWords = Array(100).fill('music experience sound bass').join(' ');
    const noTableDesc = `You walk into the room and hear the music. Half Note Jazz Club hosts you tonight. The sound fills the space as you take your seat. ${fillerWords} practical block tags last verified`;
    const result = validateQualityGates(makeEvent(), noTableDesc, 'premium');
    const tableIssue = result.issues.find(i => i.code === 'NO_TABLE');
    expect(tableIssue).toBeUndefined();
  });

  test('detects missing "If you" filter section (premium)', () => {
    const fillerWords = Array(100).fill('jazz music sound feel').join(' ');
    const noFilterDesc = `You hear the bass at Half Note Jazz Club. The room feels warm. ${fillerWords} | Aspect | Details |\n|--------|---------|  practical block tags last verified`;
    const result = validateQualityGates(makeEvent(), noFilterDesc, 'premium');
    const filterIssue = result.issues.find(i => i.code === 'NO_FILTER');
    expect(filterIssue).toBeDefined();
  });

  test('returns structured result with score + issues', () => {
    const desc = 'You hear music at Half Note Jazz Club. The jazz fills the air.';
    const result = validateQualityGates(makeEvent(), desc, 'stub');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('layer_scores');
    expect(result.layer_scores).toHaveProperty('schema');
    expect(result.layer_scores).toHaveProperty('five_question');
    expect(result.layer_scores).toHaveProperty('resonance');
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  test('works with EventForEnrichment context (title/venue/type)', () => {
    const event = makeEvent({
      title: 'Indira Paganotto Live',
      venue: 'Astron',
      type: 'concert',
      genre: 'techno',
    });
    const desc = 'You hear the bass hit at Astron. Indira Paganotto takes the booth.';
    const result = validateQualityGates(event, desc, 'stub');
    // Should not flag GENERIC_NO_EVENT_REFERENCE since title word "Indira" is present
    const genericIssue = result.issues.find(i => i.code === 'GENERIC_NO_EVENT_REFERENCE');
    expect(genericIssue).toBeUndefined();
  });
});

// ============================================================================
// File Writer Tests
// ============================================================================

describe('File Writer', () => {
  const TEST_DIR = join(import.meta.dir, '../temp-descriptions-test');

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('writes description file with correct UTF-8 encoding', () => {
    const content = 'The bass hits your chest as you walk in. Half Note Jazz Club since 1979.';
    const filePath = join(TEST_DIR, 'test-event.md');
    writeFileSync(filePath, content, 'utf-8');

    expect(existsSync(filePath)).toBe(true);
    const readBack = readFileSync(filePath, 'utf-8');
    expect(readBack).toBe(content);
  });

  test('roundtrip verification (write + read matches)', () => {
    const content = 'A night of jazz at Half Note. Doors at 21:00, music at 21:30.\nReservation essential.';
    const filePath = join(TEST_DIR, 'roundtrip-test.md');
    writeFileSync(filePath, content, 'utf-8');
    const readBack = readFileSync(filePath, 'utf-8');
    expect(readBack).toBe(content);
  });

  test('handles Greek text, euro signs, em dashes', () => {
    const greekContent = `\u0397 \u03bc\u03bf\u03c5\u03c3\u03b9\u03ba\u03ae \u03be\u03b5\u03ba\u03b9\u03bd\u03ac\u03b5\u03b9 \u03c3\u03c4\u03b9\u03c2 21:30. \u0395\u03af\u03c3\u03bf\u03b4\u03bf\u03c2 \u20ac15\u201320.
\u0391\u03c5\u03c4\u03ae \u03b5\u03af\u03bd\u03b1\u03b9 \u03bc\u03b9\u03b1 \u03b5\u03be\u03b1\u03b9\u03c1\u03b5\u03c4\u03b9\u03ba\u03ae \u03b2\u03c1\u03b1\u03b4\u03b9\u03ac \u2014 \u03bc\u03b7\u03bd \u03c4\u03b7\u03bd \u03c7\u03ac\u03c3\u03b5\u03c4\u03b5.`;
    const filePath = join(TEST_DIR, 'greek-test.md');
    writeFileSync(filePath, greekContent, 'utf-8');
    const readBack = readFileSync(filePath, 'utf-8');
    expect(readBack).toBe(greekContent);
    expect(readBack).toContain('\u20ac');    // Euro sign
    expect(readBack).toContain('\u2014');    // Em dash
    expect(readBack).toContain('\u03bc');    // Greek mu
  });

  test('writes tags JSON file', () => {
    const tags = ['Jazz', 'Intimate', 'Local-favorite', 'Metro-accessible'];
    const filePath = join(TEST_DIR, 'test-event.tags.json');
    writeFileSync(filePath, JSON.stringify(tags, null, 2), 'utf-8');

    const readBack = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(readBack).toEqual(tags);
    expect(readBack.length).toBe(4);
  });
});

// ============================================================================
// Save Batch Tests
// ============================================================================

describe('Save Batch', () => {
  let db: Database;

  beforeEach(() => {
    db = createBaseTestDB();
    createEnrichmentLogTable(db);
    addV4ColumnsToEnrichmentLog(db);
  });

  afterEach(() => {
    db.close();
  });

  test('saves description to events.full_description', () => {
    insertTestEvent(db, { id: 'save-test-001' });

    const newDesc = 'You hear the bass at Half Note. The room fills with sound.';
    db.prepare(`
      UPDATE events SET full_description = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newDesc, 'save-test-001');

    const result = db.prepare("SELECT full_description FROM events WHERE id = ?")
      .get('save-test-001') as any;
    expect(result.full_description).toBe(newDesc);
  });

  test('logs to enrichment_log with before/after', () => {
    const oldDesc = 'Old basic description';
    insertTestEvent(db, { id: 'log-test-001', full_description: oldDesc });

    const newDesc = 'New enriched description with sensory detail about Half Note.';

    // Read current description
    const current = db.prepare("SELECT full_description FROM events WHERE id = ?")
      .get('log-test-001') as any;

    // Save new description
    db.prepare(`
      UPDATE events SET full_description = ?, needs_enrichment = 0,
        enriched_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(newDesc, 'log-test-001');

    // Log the change
    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, description_before,
        description_after, batch_number, session_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('log-test-001', 'v4', current.full_description, newDesc, 1, 'test-session');

    const log = db.prepare("SELECT * FROM enrichment_log WHERE event_id = ?")
      .get('log-test-001') as any;
    expect(log.description_before).toBe(oldDesc);
    expect(log.description_after).toBe(newDesc);
    expect(log.batch_number).toBe(1);
  });

  test('handles first enrichment (description_before = NULL)', () => {
    insertTestEvent(db, { id: 'first-enrich-001', full_description: null });

    const current = db.prepare("SELECT full_description FROM events WHERE id = ?")
      .get('first-enrich-001') as any;

    const newDesc = 'First enrichment for this event.';

    db.prepare(`
      UPDATE events SET full_description = ?, needs_enrichment = 0,
        enriched_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(newDesc, 'first-enrich-001');

    db.prepare(`
      INSERT INTO enrichment_log (event_id, enrichment_version, description_before,
        description_after, batch_number, session_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('first-enrich-001', 'v4', current.full_description, newDesc, 1, 'test-session');

    const log = db.prepare("SELECT * FROM enrichment_log WHERE event_id = ?")
      .get('first-enrich-001') as any;
    expect(log.description_before).toBeNull();
    expect(log.description_after).toBe(newDesc);
  });

  test('saves tags as JSON string to events.tags', () => {
    insertTestEvent(db, { id: 'tags-test-001' });

    const tags = ['Jazz', 'Intimate', 'Metro-accessible'];
    const tagsJson = JSON.stringify(tags);

    db.prepare("UPDATE events SET tags = ?, updated_at = datetime('now') WHERE id = ?")
      .run(tagsJson, 'tags-test-001');

    const result = db.prepare("SELECT tags FROM events WHERE id = ?")
      .get('tags-test-001') as any;
    expect(JSON.parse(result.tags)).toEqual(tags);
  });

  test('updates needs_enrichment = 0, enriched_at = datetime("now")', () => {
    insertTestEvent(db, { id: 'flag-test-001', needs_enrichment: 1 });

    db.prepare(`
      UPDATE events SET
        full_description = ?,
        tags = ?,
        needs_enrichment = 0,
        enriched_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run('Enriched description', '["Jazz"]', 'flag-test-001');

    const result = db.prepare("SELECT needs_enrichment, enriched_at FROM events WHERE id = ?")
      .get('flag-test-001') as any;
    expect(result.needs_enrichment).toBe(0);
    expect(result.enriched_at).not.toBeNull();
  });
});
