#!/usr/bin/env bun
// Import Clubber.gr events from iCal feed into database

import { fetchAndParseICalFeed } from './parsers/ical-parser';
import { upsertEvent, getEventStats } from '../src/db/database';
import { normalizeEvents } from '../src/utils/normalize';

async function main() {
  console.log('📥 Importing Clubber.gr events from iCal feed...\n');

  const ICAL_URL = 'https://www.clubber.gr/events/?ical=1';

  let events;
  try {
    console.log(`🔗 Fetching: ${ICAL_URL}`);
    events = await fetchAndParseICalFeed(ICAL_URL, {
      source: 'clubber.gr'
    });
    console.log(`✅ Fetched ${events.length} events from iCal feed\n`);
  } catch (e) {
    console.log(`❌ Failed to fetch Clubber.gr iCal feed: ${e}`);
    console.log('   Check your internet connection and try again.\n');
    return;
  }

  if (events.length === 0) {
    console.log('⚠️  No events found in iCal feed\n');
    return;
  }

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

  // Show breakdown by genre
  const byGenre: Record<string, number> = {};
  for (const e of events) {
    byGenre[e.genre] = (byGenre[e.genre] || 0) + 1;
  }
  console.log('🎵 Events by genre:');
  for (const [genre, count] of Object.entries(byGenre)) {
    console.log(`   ${genre}: ${count}`);
  }
  console.log();

  // Add location field if missing
  const eventsWithLocation = events.map(e => ({
    ...e,
    location: e.location || 'Athens, Greece'
  }));

  // Normalize events (convert from parser format to database format)
  const normalized = normalizeEvents({ events: eventsWithLocation });
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
  console.log('📊 CLUBBER.GR IMPORT RESULTS:');
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
