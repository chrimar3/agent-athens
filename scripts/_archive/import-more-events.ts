#!/usr/bin/env bun
// Import parsed more.com events into database

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { upsertEvent, getEventStats } from '../src/db/database';
import { normalizeEvents } from '../src/utils/normalize';

async function main() {
  console.log('📥 Importing more.com parsed events into database...\n');

  const parsedDir = join(import.meta.dir, '../data/parsed');
  const files = readdirSync(parsedDir).filter(f => f.startsWith('more-') && f.endsWith('.json'));

  if (files.length === 0) {
    console.log('⚠️  No more-*.json files found in data/parsed/');
    console.log('   Run parse_viva_events.py first to parse more.com HTML files\n');
    return;
  }

  console.log(`📂 Found ${files.length} more.com parsed files:\n`);
  files.forEach(f => console.log(`   - ${f}`));
  console.log();

  let totalNew = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const filePath = join(parsedDir, file);
    const events = JSON.parse(readFileSync(filePath, 'utf-8'));

    console.log(`\n📊 Processing: ${file} (${events.length} events)`);

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

    console.log(`\n📊 ${file} Results:`);
    console.log(`  ✅ ${newCount} new events inserted`);
    console.log(`  🔄 ${updatedCount} events updated`);
    console.log(`  ⏭️  ${skippedCount} events skipped`);

    totalNew += newCount;
    totalUpdated += updatedCount;
    totalSkipped += skippedCount;
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 TOTAL MORE.COM IMPORT RESULTS:');
  console.log(`  ✅ ${totalNew} new events inserted`);
  console.log(`  🔄 ${totalUpdated} events updated (price/description changes)`);
  console.log(`  ⏭️  ${totalSkipped} events skipped (non-Athens or already current)`);
  console.log(`  Total processed: ${totalNew + totalUpdated} events\n`);

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
}

main().catch(console.error);
