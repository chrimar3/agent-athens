#!/usr/bin/env bun
// Import newsletter-events.json into database

import { readFileSync } from 'fs';
import { join } from 'path';
import { upsertEvent, getEventStats } from '../src/db/database';
import { normalizeEvents } from '../src/utils/normalize';

async function main() {
  console.log('📥 Importing newsletter events into database...\n');

  const filePath = join(import.meta.dir, '../data/parsed/newsletter-events.json');

  try {
    const events = JSON.parse(readFileSync(filePath, 'utf-8'));
    console.log(`📂 Found ${events.length} events from newsletter-events.json\n`);

    if (events.length === 0) {
      console.log('⚠️  No events to import');
      console.log('   Run: bun run scripts/parse-newsletter-emails.ts first\n');
      return;
    }

    // Group by source for reporting
    const sourceGroups = events.reduce((acc: any, e: any) => {
      if (!acc[e.source]) acc[e.source] = [];
      acc[e.source].push(e);
      return acc;
    }, {});

    console.log('📊 Events by source:');
    for (const [source, sourceEvents] of Object.entries(sourceGroups)) {
      console.log(`   ${source}: ${(sourceEvents as any[]).length} events`);
    }
    console.log();

    // Normalize events (convert from parser format to database format)
    const normalized = normalizeEvents({ events });
    console.log(`✅ Normalized ${normalized.length} events\n`);

    // Import into database
    console.log('💾 Importing into database...');
    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const event of normalized) {
      const result = upsertEvent(event);

      if (result.success) {
        if (result.isNew) {
          newCount++;
          if (newCount <= 10) {  // Only show first 10 to avoid spam
            console.log(`  ✅ NEW: ${event.title} (${event.type})`);
          }
        } else {
          updatedCount++;
          if (updatedCount <= 5) {  // Only show first 5 updates
            console.log(`  🔄 UPDATED: ${event.title} (${event.type})`);
          }
        }
      } else {
        skippedCount++;
        if (skippedCount <= 5) {  // Only show first 5 skips
          console.log(`  ⏭️  SKIPPED: ${event.title} (non-Athens)`);
        }
      }
    }

    // Show summary if we truncated output
    if (newCount > 10) {
      console.log(`  ... and ${newCount - 10} more new events`);
    }
    if (updatedCount > 5) {
      console.log(`  ... and ${updatedCount - 5} more updated events`);
    }
    if (skippedCount > 5) {
      console.log(`  ... and ${skippedCount - 5} more skipped events`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 NEWSLETTER IMPORT RESULTS:');
    console.log(`  ✅ ${newCount} new events inserted`);
    console.log(`  🔄 ${updatedCount} events updated (price/description changes)`);
    console.log(`  ⏭️  ${skippedCount} events skipped (non-Athens or already current)`);
    console.log(`  Total processed: ${newCount + updatedCount} events\n`);

    // Show updated database statistics
    console.log('📊 Database Statistics:');
    const stats = getEventStats();
    console.log(`  Total events: ${stats.total}`);
    console.log(`  Upcoming events: ${stats.upcomingCount}`);
    console.log('\n  By type:');
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`    ${type}: ${count}`);
    }
    console.log('\n  By price:');
    for (const [priceType, count] of Object.entries(stats.byPriceType)) {
      console.log(`    ${priceType}: ${count}`);
    }

    // Remind about next steps
    console.log('\n🔄 NEXT STEPS:');
    console.log('   1. Preview deduplication: bun run scripts/remove-duplicates.ts --dry-run');
    console.log('   2. Apply deduplication: bun run scripts/remove-duplicates.ts');
    console.log('   3. Rebuild site: bun run build\n');

  } catch (error: any) {
    console.error('❌ Error importing events:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
