/**
 * Task 7.1: End-to-End Pipeline Integration Test
 *
 * Tests the full automated pipeline flow:
 * Collection → Quality Gates → Generation
 *
 * NOTE: This test uses a test database and mocked email ingestion.
 * It does NOT test actual IMAP connections or deployment.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 7.1)
 * @see scripts/daily-automated.sh
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import Database from 'bun:sqlite';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// Import pipeline components
import { checkLocation, type LocationStatus, type LocationResult } from '../../src/quality/location-filter';
import { getEnrichmentQueue, getEnrichmentStats, markEnriched } from '../../src/enrichment/enrichment-queue';
import {
  getPipelineState,
  updatePhaseStatus,
  recordPhaseCompletion,
  resetPipelineState,
  getPipelineSummary,
} from '../../src/orchestration/pipeline-state';

// ============================================================================
// Local Normalization Functions (matching spec FR-B)
// ============================================================================

/**
 * Normalize text for deduplication comparison
 */
function normalizeForDedup(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .replace(/[«»]/g, '') // Greek quotes
    .replace(/["']/g, '') // English quotes
    .replace(/[\u201C\u201D\u2018\u2019]/g, '') // Curly quotes
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a deterministic event ID from normalized components
 */
function generateEventId(title: string, date: string, venue: string): string {
  const normalizedTitle = normalizeForDedup(title);
  const normalizedVenue = normalizeForDedup(venue)
    .replace(/\s*[-–]\s*(ground|main|roof|upper|lower)\s*stage/gi, '');
  const normalizedDate = date.split('T')[0];

  const input = `${normalizedTitle}|${normalizedDate}|${normalizedVenue}`;
  return Bun.hash(input).toString(16).slice(0, 16);
}

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DIR = 'tests/integration/test-data';
const TEST_DB_PATH = `${TEST_DIR}/test-events.db`;
const TEST_STATE_PATH = `${TEST_DIR}/pipeline-state.json`;

function setupTestDatabase(db: Database): void {
  // Create events table with production schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      venue_name TEXT,
      type TEXT,
      genres TEXT,
      price_type TEXT,
      source TEXT,
      location_status TEXT DEFAULT 'unverified',
      needs_enrichment INTEGER DEFAULT 1,
      enriched_at TEXT,
      full_description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function cleanup(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ============================================================================
// Mock Data
// ============================================================================

interface MockEvent {
  title: string;
  date: string;
  venue: string;
  type: string;
  genre: string;
  price: string;
  source: string;
}

const MOCK_EVENTS: MockEvent[] = [
  {
    title: 'Jazz Night at Six D.O.G.S',
    date: '2025-01-25T21:00:00',
    venue: 'Six D.O.G.S',
    type: 'concert',
    genre: 'Jazz',
    price: 'with-ticket',
    source: 'this-is-athens',
  },
  {
    title: 'Electronic Music at Gazarte',
    date: '2025-01-26T22:00:00',
    venue: 'Gazarte',
    type: 'concert',
    genre: 'Electronic',
    price: 'with-ticket',
    source: 'this-is-athens',
  },
  {
    title: 'Theater at Thessaloniki Cultural Center',
    date: '2025-01-27T20:00:00',
    venue: 'Thessaloniki Cultural Center',
    type: 'theater',
    genre: 'Drama',
    price: 'with-ticket',
    source: 'this-is-athens',
  },
  {
    title: 'Workshop at Unknown Venue',
    date: '2025-01-28T14:00:00',
    venue: 'Some Random Place',
    type: 'workshop',
    genre: 'Art',
    price: 'open',
    source: 'lifo-guide',
  },
  {
    title: 'Multi-venue Festival',
    date: '2025-01-29T18:00:00',
    venue: 'Various Venues',
    type: 'concert',
    genre: 'Mixed',
    price: 'with-ticket',
    source: 'this-is-athens',
  },
];

// ============================================================================
// Integration Tests
// ============================================================================

describe('Daily Pipeline Integration', () => {
  let db: Database;

  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_DIR, { recursive: true });
    db = new Database(TEST_DB_PATH);
    setupTestDatabase(db);
    resetPipelineState(TEST_STATE_PATH);
  });

  afterEach(() => {
    db.close();
    cleanup();
  });

  // ==========================================================================
  // Phase 1: Ingestion Simulation
  // ==========================================================================

  describe('Phase 1: Ingestion', () => {
    test('simulated ingestion inserts events into database', () => {
      updatePhaseStatus(TEST_STATE_PATH, 'ingest', 'running');

      // Simulate ingestion
      let ingested = 0;
      for (const event of MOCK_EVENTS) {
        const id = generateEventId(event.title, event.date.split('T')[0], event.venue);

        db.prepare(`
          INSERT INTO events (id, title, start_date, venue_name, type, genres, price_type, source, location_status, needs_enrichment)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unverified', 1)
        `).run(id, event.title, event.date, event.venue, event.type, event.genre, event.price, event.source);

        ingested++;
      }

      recordPhaseCompletion(TEST_STATE_PATH, 'ingest', { eventsIngested: ingested });

      const summary = getPipelineSummary(TEST_STATE_PATH);
      expect(summary.completedPhases).toContain('ingest');
      expect(summary.totalEventsIngested).toBe(5);

      const count = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
      expect(count.count).toBe(5);
    });
  });

  // ==========================================================================
  // Phase 2: Quality Gates
  // ==========================================================================

  describe('Phase 2: Quality Gates', () => {
    test('location filter categorizes events correctly', () => {
      // Insert mock events first
      for (const event of MOCK_EVENTS) {
        const id = generateEventId(event.title, event.date.split('T')[0], event.venue);
        db.prepare(`
          INSERT INTO events (id, title, start_date, venue_name, type, genres, price_type, source, location_status, needs_enrichment)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unverified', 1)
        `).run(id, event.title, event.date, event.venue, event.type, event.genre, event.price, event.source);
      }

      updatePhaseStatus(TEST_STATE_PATH, 'quality', 'running');

      // Run location filter on each event
      let verified = 0;
      let rejected = 0;
      let unverified = 0;
      let passThrough = 0;

      const events = db.prepare('SELECT id, title, venue_name FROM events').all() as Array<{
        id: string;
        title: string;
        venue_name: string;
      }>;

      for (const event of events) {
        const result = checkLocation({ title: event.title, venue_name: event.venue_name || '' });
        const status = result.status;

        db.prepare('UPDATE events SET location_status = ? WHERE id = ?').run(status, event.id);

        if (status === 'verified_athens') verified++;
        else if (status === 'rejected_non_athens') rejected++;
        else if (status === 'pass_through') passThrough++;
        else unverified++;
      }

      recordPhaseCompletion(TEST_STATE_PATH, 'quality', {
        eventsVerified: verified,
        eventsRejected: rejected,
      });

      // Verify results
      expect(verified).toBe(2); // Six D.O.G.S and Gazarte
      expect(rejected).toBe(1); // Thessaloniki
      expect(passThrough).toBe(1); // Various Locations
      expect(unverified).toBe(1); // Unknown venue
    });

    test('deduplication generates consistent IDs', () => {
      const title1 = '«Jazz Night»';
      const title2 = 'Jazz Night';
      const date = '2025-01-25';
      const venue = 'Six D.O.G.S';

      const id1 = generateEventId(title1, date, venue);
      const id2 = generateEventId(title2, date, venue);

      // Same event, different formatting → same ID
      expect(id1).toBe(id2);
    });
  });

  // ==========================================================================
  // Phase 3: Enrichment Queue
  // ==========================================================================

  describe('Phase 3: Enrichment Queue', () => {
    test('enrichment queue returns only verified events', () => {
      // Insert events with different statuses
      const events = [
        { id: 'evt1', title: 'Event 1', status: 'verified_athens' },
        { id: 'evt2', title: 'Event 2', status: 'verified_athens' },
        { id: 'evt3', title: 'Event 3', status: 'rejected_non_athens' },
        { id: 'evt4', title: 'Event 4', status: 'unverified' },
        { id: 'evt5', title: 'Event 5', status: 'pass_through' },
      ];

      for (const event of events) {
        db.prepare(`
          INSERT INTO events (id, title, start_date, location_status, needs_enrichment)
          VALUES (?, ?, '2025-01-25T20:00:00', ?, 1)
        `).run(event.id, event.title, event.status);
      }

      const queue = getEnrichmentQueue(db);

      // Should only include verified_athens and pass_through
      expect(queue.length).toBe(3);
      const queueIds = queue.map(e => e.id);
      expect(queueIds).toContain('evt1');
      expect(queueIds).toContain('evt2');
      expect(queueIds).toContain('evt5');
      expect(queueIds).not.toContain('evt3');
      expect(queueIds).not.toContain('evt4');
    });

    test('markEnriched removes event from queue', () => {
      db.prepare(`
        INSERT INTO events (id, title, start_date, location_status, needs_enrichment)
        VALUES ('evt1', 'Test Event', '2025-01-25T20:00:00', 'verified_athens', 1)
      `).run();

      let queue = getEnrichmentQueue(db);
      expect(queue.length).toBe(1);

      markEnriched(db, 'evt1');

      queue = getEnrichmentQueue(db);
      expect(queue.length).toBe(0);
    });

    test('enrichment stats are accurate', () => {
      // Insert events
      db.prepare(`
        INSERT INTO events (id, title, start_date, location_status, needs_enrichment)
        VALUES ('evt1', 'Event 1', '2025-01-25T20:00:00', 'verified_athens', 1)
      `).run();
      db.prepare(`
        INSERT INTO events (id, title, start_date, location_status, needs_enrichment)
        VALUES ('evt2', 'Event 2', '2025-01-25T20:00:00', 'verified_athens', 0)
      `).run();
      db.prepare(`
        INSERT INTO events (id, title, start_date, location_status, needs_enrichment)
        VALUES ('evt3', 'Event 3', '2025-01-25T20:00:00', 'pass_through', 1)
      `).run();

      const stats = getEnrichmentStats(db);

      expect(stats.totalVerified).toBe(3);
      expect(stats.pendingEnrichment).toBe(2);
      expect(stats.enriched).toBe(1);
    });
  });

  // ==========================================================================
  // Phase 4: Pipeline State Tracking
  // ==========================================================================

  describe('Phase 4: Pipeline State', () => {
    test('pipeline state tracks all phases', () => {
      const phases = ['ingest', 'parse', 'quality', 'generate', 'deploy'] as const;

      for (const phase of phases) {
        updatePhaseStatus(TEST_STATE_PATH, phase, 'running');
        recordPhaseCompletion(TEST_STATE_PATH, phase, {});
      }

      const summary = getPipelineSummary(TEST_STATE_PATH);

      expect(summary.completedPhases.length).toBe(5);
      expect(summary.pendingPhases.length).toBe(1); // 'enrich' not included
    });

    test('pipeline resets for new day', () => {
      recordPhaseCompletion(TEST_STATE_PATH, 'ingest', { eventsIngested: 100 });

      let state = getPipelineState(TEST_STATE_PATH);
      expect(state.phases.ingest?.eventsIngested).toBe(100);

      // Force reset
      resetPipelineState(TEST_STATE_PATH);

      state = getPipelineState(TEST_STATE_PATH);
      expect(state.phases.ingest).toBeUndefined();
    });
  });

  // ==========================================================================
  // Full Pipeline Flow
  // ==========================================================================

  describe('Full Pipeline Flow', () => {
    test('complete pipeline flow succeeds', () => {
      // Phase 1: Ingest
      updatePhaseStatus(TEST_STATE_PATH, 'ingest', 'running');
      for (const event of MOCK_EVENTS) {
        const id = generateEventId(event.title, event.date.split('T')[0], event.venue);
        db.prepare(`
          INSERT INTO events (id, title, start_date, venue_name, type, genres, price_type, source, location_status, needs_enrichment)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unverified', 1)
        `).run(id, event.title, event.date, event.venue, event.type, event.genre, event.price, event.source);
      }
      recordPhaseCompletion(TEST_STATE_PATH, 'ingest', { eventsIngested: MOCK_EVENTS.length });

      // Phase 2: Quality
      updatePhaseStatus(TEST_STATE_PATH, 'quality', 'running');
      const events = db.prepare('SELECT id, title, venue_name FROM events').all() as Array<{
        id: string;
        title: string;
        venue_name: string;
      }>;

      let verified = 0;
      for (const event of events) {
        const result = checkLocation({ title: event.title, venue_name: event.venue_name || '' });
        db.prepare('UPDATE events SET location_status = ? WHERE id = ?').run(result.status, event.id);
        if (result.status === 'verified_athens' || result.status === 'pass_through') verified++;
      }
      recordPhaseCompletion(TEST_STATE_PATH, 'quality', { eventsVerified: verified });

      // Phase 3: Generate (simulated)
      updatePhaseStatus(TEST_STATE_PATH, 'generate', 'running');
      recordPhaseCompletion(TEST_STATE_PATH, 'generate', { pagesGenerated: 1 });

      // Phase 4: Deploy (simulated)
      updatePhaseStatus(TEST_STATE_PATH, 'deploy', 'running');
      recordPhaseCompletion(TEST_STATE_PATH, 'deploy', {});

      // Verify final state
      const summary = getPipelineSummary(TEST_STATE_PATH);
      expect(summary.completedPhases).toContain('ingest');
      expect(summary.completedPhases).toContain('quality');
      expect(summary.completedPhases).toContain('generate');
      expect(summary.completedPhases).toContain('deploy');
      expect(summary.totalEventsIngested).toBe(5);
      expect(summary.totalEventsVerified).toBe(3); // 2 verified + 1 pass_through

      // Verify enrichment queue
      const stats = getEnrichmentStats(db);
      expect(stats.pendingEnrichment).toBe(3); // verified + pass_through events
    });

    test('pipeline handles errors gracefully', () => {
      updatePhaseStatus(TEST_STATE_PATH, 'ingest', 'running');
      updatePhaseStatus(TEST_STATE_PATH, 'ingest', 'failed', { error: 'IMAP connection timeout' });

      const state = getPipelineState(TEST_STATE_PATH);
      expect(state.phases.ingest?.status).toBe('failed');
      expect(state.phases.ingest?.error).toBe('IMAP connection timeout');

      const summary = getPipelineSummary(TEST_STATE_PATH);
      expect(summary.failedPhases).toContain('ingest');
    });
  });

  // ==========================================================================
  // Data Integrity
  // ==========================================================================

  describe('Data Integrity', () => {
    test('event IDs are deterministic', () => {
      const event1 = { title: 'Test Event', date: '2025-01-25', venue: 'Gazarte' };
      const event2 = { title: 'Test Event', date: '2025-01-25', venue: 'Gazarte' };

      const id1 = generateEventId(event1.title, event1.date, event1.venue);
      const id2 = generateEventId(event2.title, event2.date, event2.venue);

      expect(id1).toBe(id2);
    });

    test('normalization removes formatting differences', () => {
      const variations = [
        '«Test Event»',
        '"Test Event"',
        'test event',
        'TEST EVENT',
        'Test  Event',  // double space
      ];

      const normalized = variations.map(v => normalizeForDedup(v));

      // All should normalize to the same value
      expect(new Set(normalized).size).toBe(1);
    });

    test('location status persists correctly', () => {
      const id = generateEventId('Test', '2025-01-25', 'Gazarte');

      db.prepare(`
        INSERT INTO events (id, title, start_date, venue_name, location_status)
        VALUES (?, 'Test', '2025-01-25', 'Gazarte', 'verified_athens')
      `).run(id);

      const result = db.prepare('SELECT location_status FROM events WHERE id = ?').get(id) as {
        location_status: string;
      };

      expect(result.location_status).toBe('verified_athens');
    });
  });
});
