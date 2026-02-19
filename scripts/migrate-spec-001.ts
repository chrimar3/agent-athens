#!/usr/bin/env bun
/**
 * Migration: spec-001-data-pipeline
 *
 * Adds columns and tables required by spec 001:
 * - location_status column on events table
 * - needs_enrichment column on events table
 * - enriched_at column on events table
 * - rejected_events table for logging non-Athens rejections
 * - processed_emails table for tracking email ingestion
 *
 * @see specs/001-data-pipeline/spec.md
 */

import Database from 'bun:sqlite';

const DB_PATH = 'data/events.db';

console.log('🔄 Running migration: spec-001-data-pipeline\n');

const db = new Database(DB_PATH);

// ============================================================================
// Step 1: Add location_status column to events
// ============================================================================
console.log('📊 Step 1: Adding location_status column...');

try {
  db.run(`
    ALTER TABLE events
    ADD COLUMN location_status TEXT DEFAULT 'unverified'
  `);
  console.log('   ✅ Added location_status column');
} catch (error) {
  if (String(error).includes('duplicate column')) {
    console.log('   ⏭️  Column location_status already exists');
  } else {
    console.error('   ❌ Error:', error);
  }
}

// ============================================================================
// Step 2: Add needs_enrichment column to events
// ============================================================================
console.log('📊 Step 2: Adding needs_enrichment column...');

try {
  db.run(`
    ALTER TABLE events
    ADD COLUMN needs_enrichment INTEGER DEFAULT 1
  `);
  console.log('   ✅ Added needs_enrichment column');
} catch (error) {
  if (String(error).includes('duplicate column')) {
    console.log('   ⏭️  Column needs_enrichment already exists');
  } else {
    console.error('   ❌ Error:', error);
  }
}

// ============================================================================
// Step 3: Add enriched_at column to events
// ============================================================================
console.log('📊 Step 3: Adding enriched_at column...');

try {
  db.run(`
    ALTER TABLE events
    ADD COLUMN enriched_at TEXT
  `);
  console.log('   ✅ Added enriched_at column');
} catch (error) {
  if (String(error).includes('duplicate column')) {
    console.log('   ⏭️  Column enriched_at already exists');
  } else {
    console.error('   ❌ Error:', error);
  }
}

// ============================================================================
// Step 4: Create rejected_events table
// ============================================================================
console.log('📊 Step 4: Creating rejected_events table...');

try {
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
      raw_data TEXT,                      -- JSON of original event data
      rejected_at TEXT NOT NULL,

      -- Index for reporting
      UNIQUE(title, date, venue)
    )
  `);
  console.log('   ✅ Created rejected_events table');
} catch (error) {
  console.error('   ❌ Error:', error);
}

// Create index for rejected_events
try {
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_rejected_events_date
    ON rejected_events(rejected_at)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_rejected_events_status
    ON rejected_events(location_status)
  `);
  console.log('   ✅ Created indexes on rejected_events');
} catch (error) {
  console.log('   ⏭️  Indexes may already exist');
}

// ============================================================================
// Step 5: Create processed_emails table
// ============================================================================
console.log('📊 Step 5: Creating processed_emails table...');

try {
  db.run(`
    CREATE TABLE IF NOT EXISTS processed_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,    -- Gmail Message-ID header
      subject TEXT,
      sender TEXT,
      received_at TEXT,
      processed_at TEXT NOT NULL,
      event_count INTEGER DEFAULT 0,       -- How many events extracted
      status TEXT DEFAULT 'processed',     -- processed | failed | unparseable
      error_message TEXT,
      raw_path TEXT,                        -- Path to saved .eml file

      UNIQUE(message_id)
    )
  `);
  console.log('   ✅ Created processed_emails table');
} catch (error) {
  console.error('   ❌ Error:', error);
}

// Create index for processed_emails
try {
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_processed_emails_date
    ON processed_emails(processed_at)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_processed_emails_status
    ON processed_emails(status)
  `);
  console.log('   ✅ Created indexes on processed_emails');
} catch (error) {
  console.log('   ⏭️  Indexes may already exist');
}

// ============================================================================
// Step 6: Create index on location_status
// ============================================================================
console.log('📊 Step 6: Creating index on location_status...');

try {
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_location_status
    ON events(location_status)
  `);
  console.log('   ✅ Created index on location_status');
} catch (error) {
  console.log('   ⏭️  Index may already exist');
}

// ============================================================================
// Step 7: Create index on needs_enrichment
// ============================================================================
console.log('📊 Step 7: Creating index on needs_enrichment...');

try {
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_needs_enrichment
    ON events(needs_enrichment)
  `);
  console.log('   ✅ Created index on needs_enrichment');
} catch (error) {
  console.log('   ⏭️  Index may already exist');
}

// ============================================================================
// Step 8: Mark existing enriched events
// ============================================================================
console.log('📊 Step 8: Marking existing enriched events...');

try {
  const result = db.prepare(`
    UPDATE events
    SET needs_enrichment = 0,
        enriched_at = updated_at
    WHERE (full_description IS NOT NULL AND full_description != '')
       OR (full_description_en IS NOT NULL AND full_description_en != '')
  `).run();

  console.log(`   ✅ Marked ${result.changes} events as enriched`);
} catch (error) {
  console.error('   ❌ Error:', error);
}

// ============================================================================
// Verification
// ============================================================================
console.log('\n📊 Verification:');

const eventsSchema = db.prepare(`PRAGMA table_info(events)`).all();
const hasLocationStatus = eventsSchema.some((col: any) => col.name === 'location_status');
const hasNeedsEnrichment = eventsSchema.some((col: any) => col.name === 'needs_enrichment');
const hasEnrichedAt = eventsSchema.some((col: any) => col.name === 'enriched_at');

console.log(`   location_status column: ${hasLocationStatus ? '✅' : '❌'}`);
console.log(`   needs_enrichment column: ${hasNeedsEnrichment ? '✅' : '❌'}`);
console.log(`   enriched_at column: ${hasEnrichedAt ? '✅' : '❌'}`);

const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table'
  AND name IN ('rejected_events', 'processed_emails')
`).all() as Array<{ name: string }>;

const hasRejectedEvents = tables.some(t => t.name === 'rejected_events');
const hasProcessedEmails = tables.some(t => t.name === 'processed_emails');

console.log(`   rejected_events table: ${hasRejectedEvents ? '✅' : '❌'}`);
console.log(`   processed_emails table: ${hasProcessedEmails ? '✅' : '❌'}`);

// Count stats
const stats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN needs_enrichment = 0 THEN 1 ELSE 0 END) as enriched,
    SUM(CASE WHEN needs_enrichment = 1 THEN 1 ELSE 0 END) as needs_enrichment
  FROM events
`).get() as { total: number; enriched: number; needs_enrichment: number };

console.log(`\n📈 Event statistics:`);
console.log(`   Total events: ${stats.total}`);
console.log(`   Enriched: ${stats.enriched}`);
console.log(`   Needs enrichment: ${stats.needs_enrichment}`);

db.close();

console.log('\n✅ Migration complete!');
