#!/usr/bin/env bun
/**
 * Athens-Only Event Filter
 *
 * Removes events from outside Athens from the database
 * Run this after importing events to ensure only Athens events remain
 *
 * Usage: bun run scripts/filter-athens-only.ts
 */

import Database from 'bun:sqlite';

const db = new Database('data/events.db');

console.log('🗺️  Filtering for Athens-only events...\n');

// Define city/region patterns to EXCLUDE (not Athens)
const NON_ATHENS_PATTERNS = [
  '%Θεσσαλονικ%',      // Thessaloniki
  '%Ιωαννιν%',         // Ioannina
  '%Πατρ%',            // Patras
  '%Ηρακλει%',         // Heraklion (Crete)
  '%Λαρισ%',           // Larissa
  '%Βολ%',             // Volos
  '%Ροδ%',             // Rhodes
  '%Κερκυρ%',          // Corfu
  '%Χανι%',            // Chania
  '%Καλαματ%',         // Kalamata
  // Add more as needed
];

// Define specific venue names that are ONLY in non-Athens cities
// (venues with same name exist in multiple cities)
const NON_ATHENS_VENUES = [
  'Θεατρο Αμαλια',           // Thessaloniki (different from Athens venues)
  'Θεατρο Τεχνων Θεσσαλονικης',  // Thessaloniki
  // Add more specific venue names as discovered
];

// Count before filtering
const beforeCount = db.prepare('SELECT COUNT(*) as count FROM events WHERE start_date >= date("now")').get() as { count: number };
console.log(`📊 Events before filtering: ${beforeCount.count}`);

// Find non-Athens events
let nonAthensEvents: Array<{ venue_name: string; count: number }> = [];

for (const pattern of NON_ATHENS_PATTERNS) {
  const found = db.prepare(`
    SELECT venue_name, COUNT(*) as count
    FROM events
    WHERE start_date >= date('now')
      AND venue_name LIKE ?
    GROUP BY venue_name
  `).all(pattern) as Array<{ venue_name: string; count: number }>;

  nonAthensEvents.push(...found);
}

// Also check for specific venue names (exact match)
for (const venueName of NON_ATHENS_VENUES) {
  const found = db.prepare(`
    SELECT venue_name, COUNT(*) as count
    FROM events
    WHERE start_date >= date('now')
      AND venue_name = ?
    GROUP BY venue_name
  `).all(venueName) as Array<{ venue_name: string; count: number }>;

  nonAthensEvents.push(...found);
}

if (nonAthensEvents.length === 0) {
  console.log('✅ No non-Athens events found - database is clean!\n');
  db.close();
  process.exit(0);
}

console.log(`\n⚠️  Found non-Athens events in ${nonAthensEvents.length} venue(s):\n`);

let totalToRemove = 0;
nonAthensEvents.forEach((venue, index) => {
  console.log(`${index + 1}. ${venue.venue_name}: ${venue.count} event(s)`);
  totalToRemove += venue.count;
});

console.log(`\n📊 Total non-Athens events to remove: ${totalToRemove}\n`);

// Remove non-Athens events
const deletePatternStmt = db.prepare(`
  DELETE FROM events
  WHERE venue_name LIKE ?
`);

const deleteExactStmt = db.prepare(`
  DELETE FROM events
  WHERE venue_name = ?
`);

const transaction = db.transaction(() => {
  // Delete by pattern
  for (const pattern of NON_ATHENS_PATTERNS) {
    deletePatternStmt.run(pattern);
  }

  // Delete by exact venue name
  for (const venueName of NON_ATHENS_VENUES) {
    deleteExactStmt.run(venueName);
  }
});

try {
  transaction();

  // Count after filtering
  const afterCount = db.prepare('SELECT COUNT(*) as count FROM events WHERE start_date >= date("now")').get() as { count: number };

  console.log('✅ Successfully removed non-Athens events\n');
  console.log('📊 Summary:');
  console.log(`   Before: ${beforeCount.count} events`);
  console.log(`   After: ${afterCount.count} events`);
  console.log(`   Removed: ${beforeCount.count - afterCount.count} events\n`);

} catch (error) {
  console.error('❌ Error filtering events:', error);
  process.exit(1);
}

db.close();
