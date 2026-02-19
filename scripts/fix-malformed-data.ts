#!/usr/bin/env bun
/**
 * Fix Malformed Event Data
 *
 * Fixes two issues:
 * 1. Events with IDs starting with "-" (malformed slugs instead of hashes)
 * 2. Events with performer names in venue_name field
 *
 * Usage:
 *   bun run scripts/fix-malformed-data.ts --dry-run   # Preview changes
 *   bun run scripts/fix-malformed-data.ts             # Apply fixes
 */

import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const DRY_RUN = process.argv.includes('--dry-run');

// Generate proper hash-based ID
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

// Known venue corrections for performer-as-venue issues
const VENUE_CORRECTIONS: Record<string, string> = {
  '& Nidhogg Floyd': 'Floyd',
  'PESCH Fuzz Club': 'Fuzz Club',
  'Μαιου CLUTCH Floyd': 'Floyd',
  'Μαιου TINARIWEN Floyd': 'Floyd',
  'THE CURE ΟΑΚΑ': 'ΟΑΚΑ',
  'IN ATHENS ARCH': 'ARCH Club',
  'NOSTOS Πολλαπλοι χωροι': 'Πολλαπλοί Χώροι',
  '2026 Πολλαπλοι χωροι': 'Πολλαπλοί Χώροι',
  'Emergence CHRISTMAS THEATER': 'Christmas Theater',
  'στην Αθήνα TBA': 'TBA',
  'Αθήνα CHRISTMAS THEATER': 'Christmas Theater',
  // Additional corrections found in scan
  'NIGHTFALL Fuzz Club': 'Fuzz Club',
  'Απριλιου Imminence Floyd': 'Floyd',
  '05/04/2026 Fuzz Club': 'Fuzz Club',
  'Emperor 2026 Floyd': 'Floyd',
  '/ Saturn Area': 'Universe Athens',
};

async function main() {
  console.log(`\n🔧 Fix Malformed Event Data${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  const db = new Database(DB_PATH);
  const now = new Date().toISOString();

  // ===== FIX 1: Malformed IDs starting with "-" =====
  console.log('📋 Finding events with malformed IDs...');

  const malformedIds = db.prepare(`
    SELECT id, title, start_date, venue_name
    FROM events
    WHERE id LIKE '-%'
  `).all() as Array<{ id: string; title: string; start_date: string; venue_name: string }>;

  console.log(`   Found ${malformedIds.length} events with malformed IDs\n`);

  let idFixCount = 0;
  for (const event of malformedIds) {
    const date = event.start_date.split('T')[0];
    const newId = generateEventId(event.title, date, event.venue_name);

    console.log(`   ${event.id} → ${newId}`);
    console.log(`      "${event.title.substring(0, 50)}..."\n`);

    if (!DRY_RUN) {
      // Check if new ID already exists
      const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(newId);
      if (existing) {
        console.log(`      ⚠️ New ID already exists, deleting duplicate`);
        db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
      } else {
        db.prepare('UPDATE events SET id = ?, updated_at = ? WHERE id = ?').run(newId, now, event.id);
      }
      idFixCount++;
    }
  }

  // ===== FIX 2: Venue name corrections =====
  console.log('\n📋 Finding events with incorrect venue names...');

  let venueFixCount = 0;
  for (const [badVenue, goodVenue] of Object.entries(VENUE_CORRECTIONS)) {
    const events = db.prepare(`
      SELECT id, title, venue_name
      FROM events
      WHERE venue_name = ?
    `).all(badVenue) as Array<{ id: string; title: string; venue_name: string }>;

    if (events.length > 0) {
      console.log(`\n   "${badVenue}" → "${goodVenue}" (${events.length} events)`);

      for (const event of events) {
        console.log(`      - ${event.title.substring(0, 50)}...`);

        if (!DRY_RUN) {
          // Update venue and regenerate ID
          const date = db.prepare('SELECT start_date FROM events WHERE id = ?').get(event.id) as { start_date: string };
          const newId = generateEventId(event.title, date.start_date.split('T')[0], goodVenue);

          // Check for duplicate
          const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(newId);
          if (existing && existing !== event.id) {
            db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
          } else {
            db.prepare(`
              UPDATE events
              SET venue_name = ?, id = ?, updated_at = ?
              WHERE id = ?
            `).run(goodVenue, newId, now, event.id);
          }
          venueFixCount++;
        }
      }
    }
  }

  // ===== FIX 3: Find more venue issues with patterns =====
  console.log('\n📋 Scanning for other venue anomalies...');

  const anomalies = db.prepare(`
    SELECT id, title, venue_name, source FROM events
    WHERE venue_name LIKE '%Μαιου%'
       OR venue_name LIKE '%Floyd%' AND venue_name != 'Floyd'
       OR venue_name LIKE '% ΟΑΚΑ' AND venue_name != 'ΟΑΚΑ'
       OR venue_name LIKE '% Fuzz%' AND venue_name NOT LIKE 'Fuzz%'
    LIMIT 20
  `).all() as Array<{ id: string; title: string; venue_name: string; source: string }>;

  if (anomalies.length > 0) {
    console.log(`\n   Found ${anomalies.length} potential venue anomalies:`);
    for (const a of anomalies) {
      console.log(`      - [${a.source}] "${a.venue_name}" for "${a.title.substring(0, 40)}..."`);
    }
  }

  db.close();

  // Summary
  console.log('\n' + '='.repeat(50));
  if (DRY_RUN) {
    console.log('DRY RUN COMPLETE - No changes made');
    console.log(`Would fix: ${malformedIds.length} malformed IDs`);
    console.log(`Would fix: venue names for multiple events`);
    console.log('\nRun without --dry-run to apply changes.');
  } else {
    console.log(`✅ Fixed ${idFixCount} malformed IDs`);
    console.log(`✅ Fixed ${venueFixCount} venue names`);
  }
}

main().catch(console.error);
