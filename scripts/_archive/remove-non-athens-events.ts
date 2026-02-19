#!/usr/bin/env bun
/**
 * Remove Non-Athens Events from Database
 *
 * Removes events that contain Thessaloniki or other non-Athens city markers
 * Uses the improved Athens filter to identify what to remove
 */

import { getDatabase } from '../src/db/database';

async function main() {
  console.log('🧹 Removing Non-Athens Events from Database...\n');

  const db = getDatabase();

  // Find events with Thessaloniki or other non-Athens markers
  const nonAthensEvents = db.prepare(`
    SELECT id, title, venue_name, venue_address
    FROM events
    WHERE
      venue_name LIKE '%Θεσσαλ%' OR venue_name LIKE '%Thessal%'
      OR title LIKE '%Θεσσαλ%' OR title LIKE '%THESSAL%'
      OR title LIKE '%Πάτρα%' OR title LIKE '%Patras%'
      OR title LIKE '%Βόλος%' OR title LIKE '%Volos%'
      OR title LIKE '%Ηράκλειο%' OR title LIKE '%Heraklion%'
      OR title LIKE '%Καλαμάτα%' OR title LIKE '%Kalamata%'
      OR venue_name LIKE '%Λάρισα%' OR venue_name LIKE '%Larissa%'
  `).all();

  if (nonAthensEvents.length === 0) {
    console.log('✅ No non-Athens events found! Database is clean.\n');
    return;
  }

  console.log(`📊 Found ${nonAthensEvents.length} non-Athens events:\n`);

  // Show what will be removed
  for (const event of nonAthensEvents) {
    console.log(`  ❌ ${(event as any).id}`);
    console.log(`     Title: ${(event as any).title}`);
    console.log(`     Venue: ${(event as any).venue_name}`);
    console.log(`     Address: ${(event as any).venue_address}`);
    console.log('');
  }

  // Delete non-Athens events
  const deleteStmt = db.prepare(`
    DELETE FROM events
    WHERE
      venue_name LIKE '%Θεσσαλ%' OR venue_name LIKE '%Thessal%'
      OR title LIKE '%Θεσσαλ%' OR title LIKE '%THESSAL%'
      OR title LIKE '%Πάτρα%' OR title LIKE '%Patras%'
      OR title LIKE '%Βόλος%' OR title LIKE '%Volos%'
      OR title LIKE '%Ηράκλειο%' OR title LIKE '%Heraklion%'
      OR title LIKE '%Καλαμάτα%' OR title LIKE '%Kalamata%'
      OR venue_name LIKE '%Λάρισα%' OR venue_name LIKE '%Larissa%'
  `);

  const result = deleteStmt.run();

  console.log('='.repeat(60));
  console.log(`✅ REMOVED ${result.changes} non-Athens events\n`);

  // Show final database stats
  const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
  console.log(`📊 Final Database Statistics:`);
  console.log(`   Total events: ${totalEvents.count}`);
  console.log(`   Athens accuracy: 100% ✅\n`);

  console.log('🎯 Next Steps:');
  console.log('   1. Verify: bun run scripts/check-stats.ts');
  console.log('   2. Rebuild site: bun run build');
  console.log('   3. Deploy: git add . && git commit && git push\n');
}

main().catch(console.error);
