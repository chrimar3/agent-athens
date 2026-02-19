#!/usr/bin/env bun
// Import parsed viva.gr events into database

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { upsertEvent, getEventStats } from '../src/db/database';
import { normalizeEvents } from '../src/utils/normalize';

async function main() {
  console.log('📥 Importing viva.gr parsed events into database...\n');

  const parsedDir = join(import.meta.dir, '../data/parsed');
  const files = readdirSync(parsedDir).filter(f => f.startsWith('viva-') && f.endsWith('.json'));

  if (files.length === 0) {
    console.log('⚠️  No viva-*.json files found in data/parsed/');
    console.log('   Run parse_viva_events.py first to parse HTML files\n');
    return;
  }

  console.log(`📂 Found ${files.length} viva.gr parsed files:\n`);
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
          console.log(`  ✅ NEW: ${event.title} (${event.type})`);
        } else {
          updatedCount++;
          console.log(`  🔄 UPDATED: ${event.title} (${event.type})`);
        }
      } else {
        skippedCount++;
        console.log(`  ⏭️  SKIPPED: ${event.title} (non-Athens)`);
      }
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
  console.log('📊 TOTAL VIVA.GR IMPORT RESULTS:');
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
  console.log('   1. Filter Athens-only: bun run scripts/filter-athens-only.ts');
  console.log('   2. Preview deduplication: bun run scripts/remove-duplicates.ts --dry-run');
  console.log('   3. Apply deduplication: bun run scripts/remove-duplicates.ts');
  console.log('   4. Rebuild site: bun run build\n');
}

main().catch(console.error);
