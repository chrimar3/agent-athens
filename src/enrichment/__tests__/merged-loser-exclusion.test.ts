/**
 * Dedup arc S198 — merged losers must never be selected for enrichment.
 *
 * The retroactive dedup pass marks losers with merged_into=survivor
 * (migration 013). Those rows keep needs_enrichment=1 and would otherwise
 * sit in the enrichment queue burning Claude description budget on
 * tombstones (20 of the 27 marked losers were needs_enrichment=1 at S198).
 *
 * These tests pin exclusion at BOTH live enrichment-selection owners:
 *   - enrichment-queue.ts     getEnrichmentQueue   (daily-manual.ts path)
 *   - priority-queue-manager  syncQueue+getNextBatch (run-enrichment-pipeline)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getEnrichmentQueue } from '../enrichment-queue';
import { syncQueueFromEvents, getNextBatch } from '../priority-queue-manager';

function makeDb(): Database {
  const db = new Database(':memory:');
  // Focused events table (codebase idiom — schema.sql is base-only and lacks
  // location_status/needs_enrichment). Columns cover every field the two
  // selectors read, plus merged_into (migration 013).
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      venue_name TEXT,
      type TEXT,
      genres TEXT,
      price_type TEXT,
      price_advance REAL,
      price_door REAL,
      venue_neighborhood TEXT,
      venue_metro_station TEXT,
      venue_metro_line TEXT,
      door_policy TEXT,
      door_policy_note TEXT,
      time_doors TEXT,
      time_peak TEXT,
      ticket_url TEXT,
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
  db.exec(readFileSync(join(import.meta.dir, '../../db/migrations/002-enrichment-queue-table.sql'), 'utf-8'));
  return db;
}

function seedEvent(db: Database, id: string, title: string, mergedInto: string | null): void {
  db.prepare(`
    INSERT INTO events (
      id, title, start_date, type, venue_name, price_type, source,
      created_at, updated_at, location_status, needs_enrichment, merged_into, merged_at
    ) VALUES (?, ?, '2026-07-05T18:00:00', 'concert', 'Island Athens Riviera', 'with-ticket', ?, '', '', 'verified_athens', 1, ?, ?)
  `).run(id, title, mergedInto ? 'athinorama.gr' : 'more.com', mergedInto, mergedInto ? '2026-07-05T09:00:00' : null);
}

describe('merged losers excluded from enrichment selection (S198)', () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    seedEvent(db, 'survivor-1', 'Monolink at Island Athens Riviera', null);
    seedEvent(db, 'loser-1', 'Monolink', 'survivor-1');
  });

  afterEach(() => db.close());

  test('getEnrichmentQueue omits the marked loser, keeps the survivor', () => {
    const queue = getEnrichmentQueue(db);
    const ids = queue.map((e) => e.id);
    expect(ids).toContain('survivor-1');
    expect(ids).not.toContain('loser-1');
  });

  test('syncQueue + getNextBatch never dispatch the marked loser', () => {
    syncQueueFromEvents(db);
    const batch = getNextBatch(db, { limit: 50 });
    const ids = batch.map((e) => e.id);
    expect(ids).toContain('survivor-1');
    expect(ids).not.toContain('loser-1');
  });

  test('a loser already sitting in the queue is not dispatched by getNextBatch', () => {
    // Simulate a loser that entered the queue BEFORE it was marked.
    db.prepare(
      `INSERT INTO enrichment_queue (event_id, priority_score, tier, status) VALUES ('loser-1', 100, 'stub', 'pending')`
    ).run();
    db.prepare(
      `INSERT INTO enrichment_queue (event_id, priority_score, tier, status) VALUES ('survivor-1', 90, 'stub', 'pending')`
    ).run();
    const batch = getNextBatch(db, { limit: 50 });
    const ids = batch.map((e) => e.id);
    expect(ids).toContain('survivor-1');
    expect(ids).not.toContain('loser-1');
  });
});
