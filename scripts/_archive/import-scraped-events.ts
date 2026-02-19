#!/usr/bin/env bun
// Import scraped events into database

import { readFileSync } from 'fs';
import { join } from 'path';
import { upsertEvent, getEventStats } from '../src/db/database';
import { normalizeEvents } from '../src/utils/normalize';

async function main() {
  console.log('📥 Importing scraped events into database...\n');

  // Load scraped events
  const scrapedPath = join(import.meta.dir, '../data/scraped-events.json');
  const rawData = JSON.parse(readFileSync(scrapedPath, 'utf-8'));

  console.log(`📊 Found ${rawData.events.length} events from ${rawData.metadata.sourceUrl}`);
  console.log(`🕐 Scraped at: ${new Date(rawData.metadata.scrapedAt).toLocaleString()}\n`);

  // Normalize events
  const events = normalizeEvents({ events: rawData.events });
  console.log(`✅ Normalized ${events.length} events\n`);

  // Import into database
  console.log('💾 Importing into database...');
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const event of events) {
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

  console.log('\n📊 Database Upsert Results:');
  console.log(`  ✅ ${newCount} new events inserted`);
  console.log(`  🔄 ${updatedCount} events updated (price/description changes)`);
  console.log(`  ⏭️  ${skippedCount} events skipped (non-Athens or already current)`);
  console.log(`  Total: ${newCount + updatedCount} events processed\n`);

  // Show updated statistics
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

  // Remind about Athens-only filtering
  console.log('\n🗺️  IMPORTANT: Remember to filter for Athens-only events:');
  console.log('   bun run scripts/filter-athens-only.ts\n');
}

main().catch(console.error);
