/**
 * Task 2.6: Venue Review CLI Tests
 *
 * Tests for the interactive venue review workflow
 * Per spec: review unverified venues and either approve (whitelist) or reject (blacklist)
 *
 * @see specs/001-data-pipeline/tasks.md
 * @see scripts/review-venues.ts (to be implemented)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import Database from 'bun:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_DIR = 'tests/tmp/review-venues';
const TEST_DB_PATH = `${TEST_DIR}/test-events.db`;
const TEST_VENUES_CONFIG = `${TEST_DIR}/athens-venues.json`;
const TEST_REJECTED_CONFIG = `${TEST_DIR}/rejected-locations.json`;

interface VenueReviewResult {
  action: 'approve' | 'reject' | 'skip';
  venueName: string;
  canonicalName?: string;  // For approve - the canonical name to use
  reason?: string;         // For reject - the rejection reason
}

interface UnverifiedEvent {
  id: string;
  title: string;
  venue_name: string;
  date: string;
  source: string;
}

/**
 * Get list of unverified events from database
 */
function getUnverifiedEvents(db: Database): UnverifiedEvent[] {
  return db.prepare(`
    SELECT id, title, venue_name, date(start_date) as date, source
    FROM events
    WHERE location_status = 'unverified'
    ORDER BY venue_name, date
  `).all() as UnverifiedEvent[];
}

/**
 * Get distinct unverified venue names
 */
function getUnverifiedVenues(db: Database): string[] {
  const results = db.prepare(`
    SELECT DISTINCT venue_name, COUNT(*) as event_count
    FROM events
    WHERE location_status = 'unverified'
    GROUP BY venue_name
    ORDER BY event_count DESC
  `).all() as Array<{ venue_name: string; event_count: number }>;

  return results.map(r => r.venue_name);
}

/**
 * Approve a venue - add to whitelist and update events
 */
function approveVenue(
  db: Database,
  venueName: string,
  canonicalName: string,
  configPath: string
): void {
  // Load current config
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Check if venue already exists
  const existingVenue = config.venues.find((v: { canonical_name: string }) =>
    v.canonical_name.toLowerCase() === canonicalName.toLowerCase()
  );

  if (existingVenue) {
    // Add as variation
    if (!existingVenue.variations.includes(venueName)) {
      existingVenue.variations.push(venueName);
    }
  } else {
    // Add as new venue
    config.venues.push({
      canonical_name: canonicalName,
      variations: venueName !== canonicalName ? [venueName] : [],
      neighborhood: 'Unknown', // Could be enhanced with neighborhood input
    });
  }

  // Save updated config
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Update events in database
  db.prepare(`
    UPDATE events
    SET location_status = 'verified_athens'
    WHERE venue_name = ?
  `).run(venueName);
}

/**
 * Reject a venue - add to blacklist and move events to rejected_events
 */
function rejectVenue(
  db: Database,
  venueName: string,
  reason: string,
  configPath: string
): void {
  // Load current config
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Add to blacklist
  if (!config.venues) config.venues = [];
  config.venues.push({
    name: venueName,
    reason: reason,
  });

  // Save updated config
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Move events to rejected_events
  const events = db.prepare(`
    SELECT id, title, date(start_date) as date, venue_name, source
    FROM events
    WHERE venue_name = ?
  `).all(venueName) as Array<{
    id: string;
    title: string;
    date: string;
    venue_name: string;
    source: string;
  }>;

  const insertStmt = db.prepare(`
    INSERT INTO rejected_events (original_id, title, date, venue, source, rejection_reason, location_status, rejected_at)
    VALUES (?, ?, ?, ?, ?, ?, 'rejected_non_athens', datetime('now'))
  `);

  for (const event of events) {
    insertStmt.run(event.id, event.title, event.date, event.venue_name, event.source, reason);
  }

  // Delete from events table
  db.prepare(`DELETE FROM events WHERE venue_name = ?`).run(venueName);
}

/**
 * Skip a venue - leave unchanged
 */
function skipVenue(venueName: string): void {
  // No-op, venue remains unverified
}

// ============================================================================
// Test Setup
// ============================================================================

function setupTestEnvironment(): Database {
  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }

  // Copy production DB schema (we'll use in-memory for isolation)
  const db = new Database(TEST_DB_PATH);

  // Create events table
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      venue_name TEXT,
      start_date TEXT,
      source TEXT,
      location_status TEXT DEFAULT 'unverified'
    )
  `);

  // Create rejected_events table
  db.run(`
    CREATE TABLE IF NOT EXISTS rejected_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id TEXT,
      title TEXT NOT NULL,
      date TEXT,
      venue TEXT,
      source TEXT,
      rejection_reason TEXT NOT NULL,
      location_status TEXT NOT NULL,
      rejected_at TEXT NOT NULL
    )
  `);

  // Create test configs
  writeFileSync(TEST_VENUES_CONFIG, JSON.stringify({
    version: '1.0',
    venues: [
      { canonical_name: 'Gazarte', variations: ['GAZARTE'], neighborhood: 'Gazi' },
    ],
    neighborhoods: ['Gazi', 'Monastiraki'],
    pass_through_venues: ['Multiple Venues'],
  }, null, 2));

  writeFileSync(TEST_REJECTED_CONFIG, JSON.stringify({
    cities: [{ greek: 'Θεσσαλονίκη', latin: 'Thessaloniki' }],
    regions: [],
    venues: [],
    problematic_entries: { entries: [] },
  }, null, 2));

  return db;
}

function cleanupTestEnvironment(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Venue Review CLI', () => {
  let db: Database;

  beforeEach(() => {
    cleanupTestEnvironment();
    db = setupTestEnvironment();
  });

  afterEach(() => {
    db.close();
    cleanupTestEnvironment();
  });

  // -------------------------------------------------------------------------
  // Listing Tests
  // -------------------------------------------------------------------------

  describe('Listing Unverified Events', () => {
    test('lists unverified events', () => {
      // Add test events
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert 1', 'New Venue', '2025-01-25', 'viva.gr', 'unverified');

      const events = getUnverifiedEvents(db);

      expect(events.length).toBe(1);
      expect(events[0].venue_name).toBe('New Venue');
      expect(events[0].title).toBe('Concert 1');
    });

    test('returns empty for fully verified database', () => {
      // Add verified event
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert 1', 'Gazarte', '2025-01-25', 'viva.gr', 'verified_athens');

      const events = getUnverifiedEvents(db);
      expect(events.length).toBe(0);
    });

    test('groups events by venue name', () => {
      // Add multiple events at same venue
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert 1', 'New Venue', '2025-01-25', 'viva.gr', 'unverified');

      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt2', 'Concert 2', 'New Venue', '2025-01-26', 'viva.gr', 'unverified');

      const venues = getUnverifiedVenues(db);
      expect(venues.length).toBe(1);
      expect(venues[0]).toBe('New Venue');
    });
  });

  // -------------------------------------------------------------------------
  // Approve Tests
  // -------------------------------------------------------------------------

  describe('Approve Action', () => {
    test('approve adds venue to whitelist', () => {
      // Add unverified event
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', 'New Athens Venue', '2025-01-25', 'viva.gr', 'unverified');

      approveVenue(db, 'New Athens Venue', 'New Athens Venue', TEST_VENUES_CONFIG);

      // Check config was updated
      const config = JSON.parse(readFileSync(TEST_VENUES_CONFIG, 'utf-8'));
      const newVenue = config.venues.find((v: { canonical_name: string }) =>
        v.canonical_name === 'New Athens Venue'
      );

      expect(newVenue).toBeDefined();
    });

    test('approve updates event location_status', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', 'New Athens Venue', '2025-01-25', 'viva.gr', 'unverified');

      approveVenue(db, 'New Athens Venue', 'New Athens Venue', TEST_VENUES_CONFIG);

      const event = db.prepare(`SELECT location_status FROM events WHERE id = ?`).get('evt1') as {
        location_status: string;
      };

      expect(event.location_status).toBe('verified_athens');
    });

    test('approve with canonical name creates variation', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', 'GAZARTE - NEW STAGE', '2025-01-25', 'viva.gr', 'unverified');

      // Approve with canonical name 'Gazarte'
      approveVenue(db, 'GAZARTE - NEW STAGE', 'Gazarte', TEST_VENUES_CONFIG);

      const config = JSON.parse(readFileSync(TEST_VENUES_CONFIG, 'utf-8'));
      const gazarte = config.venues.find((v: { canonical_name: string }) =>
        v.canonical_name === 'Gazarte'
      );

      expect(gazarte.variations).toContain('GAZARTE - NEW STAGE');
    });

    test('approve updates all events with same venue', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert 1', 'New Venue', '2025-01-25', 'viva.gr', 'unverified');

      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt2', 'Concert 2', 'New Venue', '2025-01-26', 'more.com', 'unverified');

      approveVenue(db, 'New Venue', 'New Venue', TEST_VENUES_CONFIG);

      const unverified = getUnverifiedEvents(db);
      expect(unverified.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Reject Tests
  // -------------------------------------------------------------------------

  describe('Reject Action', () => {
    test('reject adds venue to blacklist', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', 'Thessaloniki Hall', '2025-01-25', 'viva.gr', 'unverified');

      rejectVenue(db, 'Thessaloniki Hall', 'Not in Athens', TEST_REJECTED_CONFIG);

      const config = JSON.parse(readFileSync(TEST_REJECTED_CONFIG, 'utf-8'));
      const rejected = config.venues.find((v: { name: string }) =>
        v.name === 'Thessaloniki Hall'
      );

      expect(rejected).toBeDefined();
      expect(rejected.reason).toBe('Not in Athens');
    });

    test('reject deletes event from events table', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', 'Thessaloniki Hall', '2025-01-25', 'viva.gr', 'unverified');

      rejectVenue(db, 'Thessaloniki Hall', 'Not in Athens', TEST_REJECTED_CONFIG);

      const remaining = db.prepare(`SELECT COUNT(*) as count FROM events`).get() as { count: number };
      expect(remaining.count).toBe(0);
    });

    test('reject moves event to rejected_events', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', 'Thessaloniki Hall', '2025-01-25', 'viva.gr', 'unverified');

      rejectVenue(db, 'Thessaloniki Hall', 'Not in Athens', TEST_REJECTED_CONFIG);

      const rejected = db.prepare(`
        SELECT * FROM rejected_events WHERE original_id = ?
      `).get('evt1') as { title: string; rejection_reason: string };

      expect(rejected).toBeDefined();
      expect(rejected.title).toBe('Concert');
      expect(rejected.rejection_reason).toBe('Not in Athens');
    });

    test('reject moves all events with same venue', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert 1', 'Bad Venue', '2025-01-25', 'viva.gr', 'unverified');

      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt2', 'Concert 2', 'Bad Venue', '2025-01-26', 'more.com', 'unverified');

      rejectVenue(db, 'Bad Venue', 'Not in Athens', TEST_REJECTED_CONFIG);

      const rejected = db.prepare(`
        SELECT COUNT(*) as count FROM rejected_events WHERE venue = ?
      `).get('Bad Venue') as { count: number };

      expect(rejected.count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Skip Tests
  // -------------------------------------------------------------------------

  describe('Skip Action', () => {
    test('skip leaves event unchanged', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', 'Unknown Venue', '2025-01-25', 'viva.gr', 'unverified');

      skipVenue('Unknown Venue');

      const event = db.prepare(`
        SELECT location_status FROM events WHERE id = ?
      `).get('evt1') as { location_status: string };

      expect(event.location_status).toBe('unverified');
    });

    test('skip does not modify configs', () => {
      const beforeVenues = readFileSync(TEST_VENUES_CONFIG, 'utf-8');
      const beforeRejected = readFileSync(TEST_REJECTED_CONFIG, 'utf-8');

      skipVenue('Unknown Venue');

      const afterVenues = readFileSync(TEST_VENUES_CONFIG, 'utf-8');
      const afterRejected = readFileSync(TEST_REJECTED_CONFIG, 'utf-8');

      expect(afterVenues).toBe(beforeVenues);
      expect(afterRejected).toBe(beforeRejected);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    test('handles venue with special characters', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', 'Café-Bar "Athens"', '2025-01-25', 'viva.gr', 'unverified');

      approveVenue(db, 'Café-Bar "Athens"', 'Café-Bar Athens', TEST_VENUES_CONFIG);

      const config = JSON.parse(readFileSync(TEST_VENUES_CONFIG, 'utf-8'));
      const venue = config.venues.find((v: { canonical_name: string }) =>
        v.canonical_name === 'Café-Bar Athens'
      );

      expect(venue).toBeDefined();
    });

    test('handles Greek venue names', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Συναυλία', 'Νέος Χώρος', '2025-01-25', 'viva.gr', 'unverified');

      approveVenue(db, 'Νέος Χώρος', 'Νέος Χώρος', TEST_VENUES_CONFIG);

      const event = db.prepare(`SELECT location_status FROM events WHERE id = ?`).get('evt1') as {
        location_status: string;
      };

      expect(event.location_status).toBe('verified_athens');
    });

    test('handles empty venue name gracefully', () => {
      db.prepare(`
        INSERT INTO events (id, title, venue_name, start_date, source, location_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('evt1', 'Concert', '', '2025-01-25', 'viva.gr', 'unverified');

      // Should not throw
      approveVenue(db, '', 'Unknown', TEST_VENUES_CONFIG);

      const config = JSON.parse(readFileSync(TEST_VENUES_CONFIG, 'utf-8'));
      expect(config.venues.some((v: { canonical_name: string }) => v.canonical_name === 'Unknown')).toBe(true);
    });
  });
});

// ============================================================================
// Workflow Integration Tests
// ============================================================================

describe('Review Workflow Integration', () => {
  let db: Database;

  beforeEach(() => {
    cleanupTestEnvironment();
    db = setupTestEnvironment();
  });

  afterEach(() => {
    db.close();
    cleanupTestEnvironment();
  });

  test('full workflow: list -> approve -> verify counts', () => {
    // Setup: Add multiple unverified events at different venues
    db.prepare(`
      INSERT INTO events (id, title, venue_name, start_date, source, location_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('evt1', 'Concert 1', 'Venue A', '2025-01-25', 'viva.gr', 'unverified');

    db.prepare(`
      INSERT INTO events (id, title, venue_name, start_date, source, location_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('evt2', 'Concert 2', 'Venue B', '2025-01-25', 'more.com', 'unverified');

    // Step 1: List venues
    const venuesBefore = getUnverifiedVenues(db);
    expect(venuesBefore.length).toBe(2);

    // Step 2: Approve one venue
    approveVenue(db, 'Venue A', 'Venue A', TEST_VENUES_CONFIG);

    // Step 3: Verify counts
    const venuesAfter = getUnverifiedVenues(db);
    expect(venuesAfter.length).toBe(1);
    expect(venuesAfter[0]).toBe('Venue B');
  });

  test('full workflow: list -> reject -> verify moved', () => {
    db.prepare(`
      INSERT INTO events (id, title, venue_name, start_date, source, location_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('evt1', 'Concert', 'Non-Athens Venue', '2025-01-25', 'viva.gr', 'unverified');

    // Step 1: List
    const venuesBefore = getUnverifiedVenues(db);
    expect(venuesBefore.length).toBe(1);

    // Step 2: Reject
    rejectVenue(db, 'Non-Athens Venue', 'Located in Thessaloniki', TEST_REJECTED_CONFIG);

    // Step 3: Verify
    const venuesAfter = getUnverifiedVenues(db);
    expect(venuesAfter.length).toBe(0);

    const rejectedCount = db.prepare(`SELECT COUNT(*) as count FROM rejected_events`).get() as {
      count: number;
    };
    expect(rejectedCount.count).toBe(1);
  });

  test('mixed actions preserve database integrity', () => {
    // Add events at 3 different venues
    db.prepare(`INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)`).run('e1', 'C1', 'Venue A', '2025-01-25', 'v', 'unverified');
    db.prepare(`INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)`).run('e2', 'C2', 'Venue B', '2025-01-25', 'v', 'unverified');
    db.prepare(`INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)`).run('e3', 'C3', 'Venue C', '2025-01-25', 'v', 'unverified');

    // Approve A, Reject B, Skip C
    approveVenue(db, 'Venue A', 'Venue A', TEST_VENUES_CONFIG);
    rejectVenue(db, 'Venue B', 'Not in Athens', TEST_REJECTED_CONFIG);
    skipVenue('Venue C');

    // Verify final state
    const eventsCount = db.prepare(`SELECT COUNT(*) as count FROM events`).get() as { count: number };
    expect(eventsCount.count).toBe(2); // A (verified) + C (unverified)

    const rejectedCount = db.prepare(`SELECT COUNT(*) as count FROM rejected_events`).get() as { count: number };
    expect(rejectedCount.count).toBe(1); // B

    const verifiedCount = db.prepare(`SELECT COUNT(*) as count FROM events WHERE location_status = 'verified_athens'`).get() as { count: number };
    expect(verifiedCount.count).toBe(1); // A

    const unverifiedCount = db.prepare(`SELECT COUNT(*) as count FROM events WHERE location_status = 'unverified'`).get() as { count: number };
    expect(unverifiedCount.count).toBe(1); // C
  });
});
