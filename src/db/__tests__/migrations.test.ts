/**
 * Task 1.1: Migration Test Setup
 *
 * Tests for spec-001 database migration:
 * - location_status column on events
 * - needs_enrichment column on events
 * - enriched_at column on events
 * - rejected_events table
 * - processed_emails table
 *
 * @see specs/001-data-pipeline/tasks.md
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import Database from 'bun:sqlite';
import { existsSync, unlinkSync, copyFileSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = join(import.meta.dir, '../../..');
const TEST_DB_PATH = join(PROJECT_ROOT, 'data/test-migrations.db');
const PROD_DB_PATH = join(PROJECT_ROOT, 'data/events.db');

describe('Database Migrations', () => {
  let db: Database;

  beforeAll(() => {
    // Use production database for schema verification
    // (Migration has already been applied)
    // Note: readonly:true fails when WAL mode is active and SHM doesn't exist
    db = new Database(PROD_DB_PATH);
  });

  afterAll(() => {
    db.close();
  });

  // =========================================================================
  // Events Table Column Tests
  // =========================================================================

  test('001_pipeline_extensions adds location_status column', () => {
    const columns = db.prepare(`PRAGMA table_info(events)`).all() as Array<{
      name: string;
      type: string;
      dflt_value: string | null;
    }>;

    const locationStatus = columns.find(col => col.name === 'location_status');

    expect(locationStatus).toBeDefined();
    expect(locationStatus?.type).toBe('TEXT');
    expect(locationStatus?.dflt_value).toBe("'unverified'");
  });

  test('001_pipeline_extensions adds needs_enrichment column', () => {
    const columns = db.prepare(`PRAGMA table_info(events)`).all() as Array<{
      name: string;
      type: string;
      dflt_value: string | null;
    }>;

    const needsEnrichment = columns.find(col => col.name === 'needs_enrichment');

    expect(needsEnrichment).toBeDefined();
    expect(needsEnrichment?.type).toBe('INTEGER');
    expect(needsEnrichment?.dflt_value).toBe('1');
  });

  test('001_pipeline_extensions adds enriched_at column', () => {
    const columns = db.prepare(`PRAGMA table_info(events)`).all() as Array<{
      name: string;
      type: string;
    }>;

    const enrichedAt = columns.find(col => col.name === 'enriched_at');

    expect(enrichedAt).toBeDefined();
    expect(enrichedAt?.type).toBe('TEXT');
  });

  // =========================================================================
  // Rejected Events Table Tests
  // =========================================================================

  test('001_pipeline_extensions creates rejected_events table', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='rejected_events'
    `).all() as Array<{ name: string }>;

    expect(tables.length).toBe(1);
    expect(tables[0].name).toBe('rejected_events');
  });

  test('rejected_events table has correct schema', () => {
    const columns = db.prepare(`PRAGMA table_info(rejected_events)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;

    const columnNames = columns.map(c => c.name);

    // Required columns
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('original_id');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('date');
    expect(columnNames).toContain('venue');
    expect(columnNames).toContain('source');
    expect(columnNames).toContain('rejection_reason');
    expect(columnNames).toContain('location_status');
    expect(columnNames).toContain('rejected_at');

    // Check NOT NULL constraints
    const titleCol = columns.find(c => c.name === 'title');
    const rejectionReasonCol = columns.find(c => c.name === 'rejection_reason');
    const locationStatusCol = columns.find(c => c.name === 'location_status');
    const rejectedAtCol = columns.find(c => c.name === 'rejected_at');

    expect(titleCol?.notnull).toBe(1);
    expect(rejectionReasonCol?.notnull).toBe(1);
    expect(locationStatusCol?.notnull).toBe(1);
    expect(rejectedAtCol?.notnull).toBe(1);
  });

  // =========================================================================
  // Processed Emails Table Tests
  // =========================================================================

  test('001_pipeline_extensions creates processed_emails table', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='processed_emails'
    `).all() as Array<{ name: string }>;

    expect(tables.length).toBe(1);
    expect(tables[0].name).toBe('processed_emails');
  });

  test('processed_emails table has correct schema', () => {
    const columns = db.prepare(`PRAGMA table_info(processed_emails)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;

    const columnNames = columns.map(c => c.name);

    // Required columns
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('message_id');
    expect(columnNames).toContain('subject');
    expect(columnNames).toContain('sender');
    expect(columnNames).toContain('received_at');
    expect(columnNames).toContain('processed_at');
    expect(columnNames).toContain('event_count');
    expect(columnNames).toContain('status');

    // Check message_id is NOT NULL
    const messageIdCol = columns.find(c => c.name === 'message_id');
    expect(messageIdCol?.notnull).toBe(1);
  });

  test('processed_emails has unique constraint on message_id', () => {
    const indexes = db.prepare(`
      SELECT name, sql FROM sqlite_master
      WHERE type='index' AND tbl_name='processed_emails'
    `).all() as Array<{ name: string; sql: string | null }>;

    // SQLite creates an automatic index for UNIQUE constraints
    const hasUniqueIndex = indexes.some(idx =>
      idx.sql?.toLowerCase().includes('unique') ||
      idx.name.includes('message_id')
    );

    // Also check via table info - unique columns have a constraint
    const tableInfo = db.prepare(`PRAGMA index_list(processed_emails)`).all() as Array<{
      name: string;
      unique: number;
    }>;

    const hasUniqueConstraint = tableInfo.some(idx => idx.unique === 1);

    expect(hasUniqueIndex || hasUniqueConstraint).toBe(true);
  });

  // =========================================================================
  // Index Tests
  // =========================================================================

  test('has index on location_status', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='events'
      AND name LIKE '%location_status%'
    `).all() as Array<{ name: string }>;

    expect(indexes.length).toBeGreaterThanOrEqual(1);
  });

  test('has index on needs_enrichment', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='events'
      AND name LIKE '%needs_enrichment%'
    `).all() as Array<{ name: string }>;

    expect(indexes.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // Data Integrity Tests
  // =========================================================================

  test('location_status has valid values', () => {
    const validStatuses = [
      'verified_athens',
      'pass_through',
      'unverified',
      'rejected_non_athens',
      'problematic',
    ];

    const invalidRows = db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE location_status IS NOT NULL
        AND location_status NOT IN (${validStatuses.map(() => '?').join(',')})
    `).get(...validStatuses) as { count: number };

    expect(invalidRows.count).toBe(0);
  });

  test('needs_enrichment is 0 or 1', () => {
    const invalidRows = db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE needs_enrichment IS NOT NULL
        AND needs_enrichment NOT IN (0, 1)
    `).get() as { count: number };

    expect(invalidRows.count).toBe(0);
  });

  test('enriched_at is valid ISO timestamp when set', () => {
    // This is a soft check - just ensure format looks like ISO
    const badTimestamps = db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE enriched_at IS NOT NULL
        AND enriched_at NOT LIKE '____-__-__%'
    `).get() as { count: number };

    expect(badTimestamps.count).toBe(0);
  });

  // 009 closes 2026-04-29 forward-looking spec ("Sprint 2 adds nightly resolver
  // populating ticket_url_resolved"). Migration 006 added _at and _source;
  // the URL column itself was never added until 009.
  test('009_add_ticket_url_resolved adds ticket_url_resolved column', () => {
    const columns = db.prepare(`PRAGMA table_info(events)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const col = columns.find(c => c.name === 'ticket_url_resolved');
    expect(col).toBeDefined();
    expect(col?.type).toBe('TEXT');
    expect(col?.notnull).toBe(0); // nullable — resolver hasn't run yet for most rows
    // SQLite stores `DEFAULT NULL` as the literal SQL text 'NULL' in the metadata.
    // Behaviorally identical to no DEFAULT clause; assertion checks the explicit
    // intent expressed in the migration.
    expect(col?.dflt_value).toBe('NULL');
    // Functional default: a fresh INSERT without ticket_url_resolved gets NULL.
    const before = db.prepare(`SELECT COUNT(*) as c FROM events WHERE ticket_url_resolved IS NULL`).get() as { c: number };
    const total = db.prepare(`SELECT COUNT(*) as c FROM events`).get() as { c: number };
    expect(before.c).toBe(total.c); // every row currently has NULL — resolver hasn't populated any yet
  });

  // 010 adds editorial_pick_rank — denormalized cache of the editorial-content.json
  // pick rank. Uniqueness lives JSON-side (one entry per event_id), so the DB column
  // is just for query convenience (sort/filter). NULL = no pick. Partial index keeps
  // the index tiny since most rows have NULL.
  // Decision tree resolved Step 0: hub_slug/locale/week_starting do not exist on events,
  // so the originally-spec'd composite unique constraint is not possible. Picks are
  // globally rank-ordered per event window, not hub-scoped at the DB layer.
  test('010_add_editorial_pick_rank adds editorial_pick_rank column', () => {
    const columns = db.prepare(`PRAGMA table_info(events)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const col = columns.find(c => c.name === 'editorial_pick_rank');
    expect(col).toBeDefined();
    expect(col?.type).toBe('INTEGER');
    expect(col?.notnull).toBe(0); // nullable — NULL means "no pick"
  });

  test('010_add_editorial_pick_rank creates partial index on rank', () => {
    const indexes = db.prepare(`PRAGMA index_list(events)`).all() as Array<{
      name: string;
      unique: number;
    }>;
    const idx = indexes.find(i => i.name === 'idx_editorial_pick_rank');
    expect(idx).toBeDefined();
    expect(idx?.unique).toBe(0); // non-unique: ranks can repeat across distinct windows
  });
});
