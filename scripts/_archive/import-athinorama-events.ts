#!/usr/bin/env bun
// Import parsed athinorama.gr events into database

import { readFileSync } from 'fs';
import { join } from 'path';
import { upsertEvent, getEventStats } from '../src/db/database';
import { normalizeEvents } from '../src/utils/normalize';

async function main() {
  console.log('📥 Importing athinorama.gr parsed events into database...\n');

  const parsedFile = join(import.meta.dir, '../data/parsed/athinorama-events.json');

  let events;
  try {
    events = JSON.parse(readFileSync(parsedFile, 'utf-8'));
  } catch (e) {
    console.log('⚠️  No athinorama-events.json found in data/parsed/');
    console.log('   Run parse_athinorama.py --download first to parse HTML files\n');
    return;
  }

  console.log(`📂 Found ${events.length} events in athinorama-events.json\n`);

  // Show breakdown by type
  const byType: Record<string, number> = {};
  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }
  console.log('📊 Events by type:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`   ${type}: ${count}`);
  }
  console.log();

  // Normalize events (convert from parser format to database format)
  const normalized = normalizeEvents({ events });
  console.log(`✅ Normalized ${normalized.length} events\n`);

  // Import into database
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const event of normalized) {
    const result = upsertEvent(event);

    if (result.success) {
      if (result.isNew) {
        newCount++;
        if (newCount <= 10) {
          const venueName = typeof event.venue === 'string' ? event.venue : event.venue?.name || 'Unknown';
          console.log(`  ✅ NEW: ${event.title} @ ${venueName} (${event.type})`);
        } else if (newCount === 11) {
          console.log(`  ... (showing first 10 of new events)`);
        }
      } else {
        updatedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 ATHINORAMA.GR IMPORT RESULTS:');
  console.log(`  ✅ ${newCount} new events inserted`);
  console.log(`  🔄 ${updatedCount} events updated`);
  console.log(`  ⏭️  ${skippedCount} events skipped (non-Athens or duplicates)`);
  console.log(`  Total processed: ${newCount + updatedCount + skippedCount} events\n`);

  // Show updated database statistics
  console.log('📊 Database Statistics:');
  const stats = getEventStats();
  console.log(`  Total events: ${stats.total}`);
  console.log(`  Upcoming events: ${stats.upcomingCount}`);
  console.log('\n  By type:');
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`    ${type}: ${count}`);
  }
  console.log('\n  By source:');
  for (const [source, count] of Object.entries(stats.bySource || {})) {
    console.log(`    ${source}: ${count}`);
  }

  // Remind about next steps
  console.log('\n🔄 NEXT STEPS:');
  console.log('   1. Preview deduplication: bun run scripts/remove-duplicates.ts --dry-run');
  console.log('   2. Apply deduplication: bun run scripts/remove-duplicates.ts');
  console.log('   3. Rebuild site: bun run build\n');
}

main().catch(console.error);
