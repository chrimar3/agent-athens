/**
 * Task 5.3: Enrichment Queue Tests
 *
 * Tests for enrichment queue management:
 * - Returns events with needs_enrichment=1 AND location_status=verified_athens
 * - Excludes unverified events from queue
 * - Sorts by date (soonest first)
 * - markEnriched sets needs_enrichment=0 and enriched_at
 *
 * @see specs/001-data-pipeline/tasks.md (Task 5.3)
 * @see src/enrichment/enrichment-queue.ts
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import Database from 'bun:sqlite';
import {
  getEnrichmentQueue,
  markEnriched,
  getEnrichmentStats,
  type EnrichmentQueueItem,
} from '../enrichment-queue';

// ============================================================================
// Test Database Setup
// ============================================================================

const TEST_DB_PATH = ':memory:';
let db: Database;

// Sample events for testing
const testEvents = [
  {
    id: 'event-1',
    title: 'Concert at Gazarte',
    date: '2025-01-25',
    time: '21:00',
    venue: 'Gazarte',
    type: 'concert',
    genre: 'rock',
    price: 'with-ticket',
    source: 'test',
    location_status: 'verified_athens',
    needs_enrichment: 1,
    full_description: null,
    enriched_at: null,
  },
  {
    id: 'event-2',
    title: 'Art Exhibition at SNFCC',
    date: '2025-01-20', // Earlier date - should be first
    time: '10:00',
    venue: 'SNFCC',
    type: 'exhibition',
    genre: 'art',
    price: 'open',
    source: 'test',
    location_status: 'verified_athens',
    needs_enrichment: 1,
    full_description: null,
    enriched_at: null,
  },
  {
    id: 'event-3',
    title: 'Event at Unknown Venue',
    date: '2025-01-22',
    time: '19:00',
    venue: 'Unknown Place',
    type: 'concert',
    genre: 'jazz',
    price: 'with-ticket',
    source: 'test',
    location_status: 'unverified', // Should be excluded
    needs_enrichment: 1,
    full_description: null,
    enriched_at: null,
  },
  {
    id: 'event-4',
    title: 'Already Enriched Event',
    date: '2025-01-23',
    time: '20:00',
    venue: 'Megaron',
    type: 'concert',
    genre: 'classical',
    price: 'with-ticket',
    source: 'test',
    location_status: 'verified_athens',
    needs_enrichment: 0, // Already enriched - should be excluded
    full_description: 'This is a description.',
    enriched_at: '2025-01-18T10:00:00.000Z',
  },
  {
    id: 'event-5',
    title: 'Rejected Event',
    date: '2025-01-24',
    time: '18:00',
    venue: 'Thessaloniki Venue',
    type: 'concert',
    genre: 'pop',
    price: 'with-ticket',
    source: 'test',
    location_status: 'rejected_non_athens', // Should be excluded
    needs_enrichment: 1,
    full_description: null,
    enriched_at: null,
  },
  {
    id: 'event-6',
    title: 'Pass-Through Event',
    date: '2025-01-26',
    time: '12:00',
    venue: 'Πολλαπλοί Χώροι',
    type: 'exhibition',
    genre: 'art',
    price: 'open',
    source: 'test',
    location_status: 'pass_through', // Should be included
    needs_enrichment: 1,
    full_description: null,
    enriched_at: null,
  },
];

function createTestDatabase(): Database {
  const testDb = new Database(TEST_DB_PATH);

  // Create events table with all required columns
  testDb.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      venue TEXT,
      type TEXT,
      genre TEXT,
      price TEXT,
      source TEXT,
      location_status TEXT DEFAULT 'unverified',
      needs_enrichment INTEGER DEFAULT 1,
      full_description TEXT,
      enriched_at TEXT,
      merged_into TEXT,
      merged_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  testDb.exec(`CREATE INDEX idx_events_location_status ON events(location_status)`);
  testDb.exec(`CREATE INDEX idx_events_needs_enrichment ON events(needs_enrichment)`);

  return testDb;
}

function insertTestEvents(testDb: Database): void {
  const stmt = testDb.prepare(`
    INSERT INTO events (
      id, title, date, time, venue, type, genre, price, source,
      location_status, needs_enrichment, full_description, enriched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const event of testEvents) {
    stmt.run(
      event.id,
      event.title,
      event.date,
      event.time,
      event.venue,
      event.type,
      event.genre,
      event.price,
      event.source,
      event.location_status,
      event.needs_enrichment,
      event.full_description,
      event.enriched_at
    );
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Enrichment Queue', () => {
  beforeEach(() => {
    db = createTestDatabase();
    insertTestEvents(db);
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================================================
  // Queue Retrieval Tests
  // ==========================================================================

  describe('getEnrichmentQueue', () => {
    test('returns events with needs_enrichment=1 and location_status=verified_athens', () => {
      const queue = getEnrichmentQueue(db);

      // Should include event-1 and event-2 (verified_athens + needs_enrichment=1)
      const eventIds = queue.map(e => e.id);

      expect(eventIds).toContain('event-1');
      expect(eventIds).toContain('event-2');
    });

    test('includes pass_through events in queue', () => {
      const queue = getEnrichmentQueue(db);

      const eventIds = queue.map(e => e.id);

      // event-6 is pass_through and needs enrichment
      expect(eventIds).toContain('event-6');
    });

    test('excludes unverified events from queue', () => {
      const queue = getEnrichmentQueue(db);

      const eventIds = queue.map(e => e.id);

      // event-3 is unverified - should NOT be in queue
      expect(eventIds).not.toContain('event-3');
    });

    test('excludes already enriched events from queue', () => {
      const queue = getEnrichmentQueue(db);

      const eventIds = queue.map(e => e.id);

      // event-4 has needs_enrichment=0 - should NOT be in queue
      expect(eventIds).not.toContain('event-4');
    });

    test('excludes rejected events from queue', () => {
      const queue = getEnrichmentQueue(db);

      const eventIds = queue.map(e => e.id);

      // event-5 is rejected_non_athens - should NOT be in queue
      expect(eventIds).not.toContain('event-5');
    });

    test('sorts by date (soonest first)', () => {
      const queue = getEnrichmentQueue(db);

      // event-2 is 2025-01-20, event-1 is 2025-01-25, event-6 is 2025-01-26
      expect(queue[0].id).toBe('event-2'); // Earliest date
      expect(queue[1].id).toBe('event-1'); // Middle date
      expect(queue[2].id).toBe('event-6'); // Latest date
    });

    test('returns expected fields for each event', () => {
      const queue = getEnrichmentQueue(db);

      expect(queue.length).toBeGreaterThan(0);

      const event = queue[0];
      expect(event.id).toBeDefined();
      expect(event.title).toBeDefined();
      expect(event.date).toBeDefined();
      expect(event.time).toBeDefined();
      expect(event.venue).toBeDefined();
      expect(event.type).toBeDefined();
      expect(event.genre).toBeDefined();
      expect(event.price).toBeDefined();
    });

    test('respects limit parameter', () => {
      const queue = getEnrichmentQueue(db, { limit: 2 });

      expect(queue.length).toBe(2);
    });

    test('returns empty array when no events need enrichment', () => {
      // Mark all events as enriched
      db.exec(`UPDATE events SET needs_enrichment = 0`);

      const queue = getEnrichmentQueue(db);

      expect(queue).toEqual([]);
    });
  });

  // ==========================================================================
  // Mark Enriched Tests
  // ==========================================================================

  describe('markEnriched', () => {
    test('sets needs_enrichment=0', () => {
      markEnriched(db, 'event-1');

      const event = db.prepare(`SELECT needs_enrichment FROM events WHERE id = ?`).get('event-1') as {
        needs_enrichment: number;
      };

      expect(event.needs_enrichment).toBe(0);
    });

    test('sets enriched_at to current timestamp', () => {
      const before = new Date().toISOString();
      markEnriched(db, 'event-1');
      const after = new Date().toISOString();

      const event = db.prepare(`SELECT enriched_at FROM events WHERE id = ?`).get('event-1') as {
        enriched_at: string;
      };

      expect(event.enriched_at).toBeDefined();
      expect(event.enriched_at >= before).toBe(true);
      expect(event.enriched_at <= after).toBe(true);
    });

    test('does not affect other events', () => {
      markEnriched(db, 'event-1');

      const event2 = db.prepare(`SELECT needs_enrichment FROM events WHERE id = ?`).get('event-2') as {
        needs_enrichment: number;
      };

      expect(event2.needs_enrichment).toBe(1);
    });

    test('returns true for existing event', () => {
      const result = markEnriched(db, 'event-1');

      expect(result).toBe(true);
    });

    test('returns false for non-existent event', () => {
      const result = markEnriched(db, 'non-existent-event');

      expect(result).toBe(false);
    });

    test('removes event from queue after marking', () => {
      const queueBefore = getEnrichmentQueue(db);
      expect(queueBefore.map(e => e.id)).toContain('event-1');

      markEnriched(db, 'event-1');

      const queueAfter = getEnrichmentQueue(db);
      expect(queueAfter.map(e => e.id)).not.toContain('event-1');
    });
  });

  // ==========================================================================
  // Statistics Tests
  // ==========================================================================

  describe('getEnrichmentStats', () => {
    test('returns correct total verified count', () => {
      const stats = getEnrichmentStats(db);

      // event-1, event-2, event-4, event-6 are verified_athens or pass_through
      expect(stats.totalVerified).toBe(4);
    });

    test('returns correct pending enrichment count', () => {
      const stats = getEnrichmentStats(db);

      // event-1, event-2, event-6 need enrichment and are verified/pass_through
      expect(stats.pendingEnrichment).toBe(3);
    });

    test('returns correct enriched count', () => {
      const stats = getEnrichmentStats(db);

      // Only event-4 is already enriched
      expect(stats.enriched).toBe(1);
    });

    test('updates stats after marking enriched', () => {
      const statsBefore = getEnrichmentStats(db);
      expect(statsBefore.pendingEnrichment).toBe(3);
      expect(statsBefore.enriched).toBe(1);

      markEnriched(db, 'event-1');

      const statsAfter = getEnrichmentStats(db);
      expect(statsAfter.pendingEnrichment).toBe(2);
      expect(statsAfter.enriched).toBe(2);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    test('handles empty database', () => {
      const emptyDb = new Database(':memory:');
      emptyDb.exec(`
        CREATE TABLE events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          date TEXT NOT NULL,
          time TEXT,
          venue TEXT,
          type TEXT,
          genre TEXT,
          price TEXT,
          source TEXT,
          location_status TEXT DEFAULT 'unverified',
          needs_enrichment INTEGER DEFAULT 1,
          full_description TEXT,
          enriched_at TEXT,
          merged_into TEXT,
          merged_at TEXT
        )
      `);

      const queue = getEnrichmentQueue(emptyDb);
      expect(queue).toEqual([]);

      const stats = getEnrichmentStats(emptyDb);
      expect(stats.totalVerified).toBe(0);
      expect(stats.pendingEnrichment).toBe(0);
      expect(stats.enriched).toBe(0);

      emptyDb.close();
    });

    test('handles events with same date (stable sort)', () => {
      // Add two more events with the same date
      db.prepare(`
        INSERT INTO events (id, title, date, time, venue, location_status, needs_enrichment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('event-same-date-1', 'Event A', '2025-01-22', '18:00', 'Venue A', 'verified_athens', 1);

      db.prepare(`
        INSERT INTO events (id, title, date, time, venue, location_status, needs_enrichment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('event-same-date-2', 'Event B', '2025-01-22', '20:00', 'Venue B', 'verified_athens', 1);

      const queue = getEnrichmentQueue(db);

      // Both same-date events should be present
      const eventIds = queue.map(e => e.id);
      expect(eventIds).toContain('event-same-date-1');
      expect(eventIds).toContain('event-same-date-2');

      // They should be grouped together (between event-2 on 01-20 and event-1 on 01-25)
      const idx1 = queue.findIndex(e => e.date === '2025-01-20');
      const idx2 = queue.findIndex(e => e.date === '2025-01-22');
      const idx3 = queue.findIndex(e => e.date === '2025-01-25');

      expect(idx1).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx3);
    });

    test('handles problematic location status', () => {
      // Add a problematic event
      db.prepare(`
        INSERT INTO events (id, title, date, time, venue, location_status, needs_enrichment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('event-problematic', 'Problematic Event', '2025-01-21', '19:00', 'TBA', 'problematic', 1);

      const queue = getEnrichmentQueue(db);

      // Problematic events should NOT be in queue (need review first)
      const eventIds = queue.map(e => e.id);
      expect(eventIds).not.toContain('event-problematic');
    });
  });
});
