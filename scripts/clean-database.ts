#!/usr/bin/env bun
/**
 * Smart Database Cleanup
 * ======================
 *
 * Conservative cleanup that preserves fixable data:
 * 1. Remove past events
 * 2. Remove events with missing critical fields
 * 3. Filter non-Athens events (NEW)
 * 4. Report (but don't delete) events with missing times (let fetch-missing-data.py fix them)
 * 5. Basic deduplication (defer complex cases to remove-duplicates.ts)
 * 6. Vacuum database
 *
 * NOTE: For comprehensive deduplication, use remove-duplicates.ts which has
 * 7-pass deduplication with recurring event protection.
 *
 * Usage:
 *   bun run scripts/clean-database.ts
 *   bun run scripts/clean-database.ts --aggressive  # Also remove 00:00 times
 *   bun run scripts/clean-database.ts --skip-athens # Skip Athens filter
 */

import Database from 'bun:sqlite';
import { isAthensEvent } from '../src/utils/athens-filter';

const DB_PATH = 'data/events.db';
const isAggressive = process.argv.includes('--aggressive');
const skipAthens = process.argv.includes('--skip-athens');

interface Event {
  id: string;
  title: string;
  start_date: string;
  description: string | null;
  full_description: string | null;
  full_description_gr: string | null;
  price_amount: number | null;
  updated_at: string;
  url: string | null;
  venue_name: string | null;
  venue_address: string | null;
}

interface SourceStats {
  total: number;
  missingTimes: number;
  missingPrices: number;
}

function getSourceFromUrl(url: string | null): string {
  if (!url) return 'unknown';
  if (url.includes('viva.gr')) return 'viva.gr';
  if (url.includes('more.com')) return 'more.com';
  if (url.includes('athinorama.gr')) return 'athinorama.gr';
  if (url.includes('gazarte.gr')) return 'gazarte.gr';
  return 'other';
}

function scoreEvent(event: Event): number {
  let score = 0;
  if (event.full_description_gr) score += 100;
  if (event.full_description) score += 50;
  if (event.description) score += 10;
  if (event.price_amount && event.price_amount > 0) score += 20;
  // Prefer events with actual times (not 00:00)
  if (!event.start_date.includes('00:00:00')) score += 30;
  score += new Date(event.updated_at).getTime() / 1000000000;
  return score;
}

async function cleanDatabase() {
  const db = new Database(DB_PATH);

  console.log('🧹 Starting smart database cleanup...');
  if (isAggressive) {
    console.log('⚠️  AGGRESSIVE MODE: Will also remove events with 00:00:00 times');
  }
  console.log('');

  // Step 1: Remove past events
  console.log('📅 Step 1: Removing past events...');
  const pastEvents = db.query(`
    DELETE FROM events
    WHERE date(start_date) < date('now')
    RETURNING id
  `).all();
  console.log(`   ✅ Removed ${pastEvents.length} past events\n`);

  // Step 2: Remove events with missing critical fields
  console.log('🔍 Step 2: Removing events with missing critical data...');
  const invalidEvents = db.query(`
    DELETE FROM events
    WHERE title IS NULL
       OR title = ''
       OR start_date IS NULL
       OR venue_name IS NULL
       OR venue_name = ''
    RETURNING id
  `).all();
  console.log(`   ✅ Removed ${invalidEvents.length} events with missing data\n`);

  // Step 3: Filter non-Athens events
  let nonAthensRemoved = 0;
  if (!skipAthens) {
    console.log('📍 Step 3: Filtering non-Athens events...');

    // Get all events to check
    const eventsToCheck = db.query<Event, []>(`
      SELECT id, title, description, venue_name, venue_address
      FROM events
    `).all();

    const nonAthensIds: string[] = [];
    for (const event of eventsToCheck) {
      if (!isAthensEvent({
        title: event.title,
        description: event.description || undefined,
        venue_name: event.venue_name || undefined,
        venue_address: event.venue_address || undefined,
      })) {
        nonAthensIds.push(event.id);
      }
    }

    if (nonAthensIds.length > 0) {
      // Delete non-Athens events
      for (const id of nonAthensIds) {
        db.query('DELETE FROM events WHERE id = ?').run(id);
      }
      nonAthensRemoved = nonAthensIds.length;
      console.log(`   ✅ Removed ${nonAthensRemoved} non-Athens events\n`);
    } else {
      console.log(`   ✅ All events are in Athens\n`);
    }
  } else {
    console.log('📍 Step 3: Skipping Athens filter (--skip-athens flag)\n');
  }

  // Step 4: Report on events with missing times (fixable by fetch-missing-data.py)
  console.log('⏰ Step 4: Checking events with missing times...');
  const missingTimeEvents = db.query<{ id: string; url: string | null }, []>(`
    SELECT id, url FROM events
    WHERE start_date LIKE '%00:00:00%'
    OR start_date LIKE '%T00:00%'
  `).all();

  let midnightRemoved = 0;
  if (isAggressive && missingTimeEvents.length > 0) {
    // In aggressive mode, delete them
    db.query(`
      DELETE FROM events
      WHERE start_date LIKE '%00:00:00%'
      OR start_date LIKE '%T00:00%'
    `).run();
    midnightRemoved = missingTimeEvents.length;
    console.log(`   ⚠️  REMOVED ${midnightRemoved} events with 00:00:00 times (aggressive mode)\n`);
  } else if (missingTimeEvents.length > 0) {
    // In normal mode, just report by source
    const bySource: Record<string, number> = {};
    for (const e of missingTimeEvents) {
      const src = getSourceFromUrl(e.url);
      bySource[src] = (bySource[src] || 0) + 1;
    }
    console.log(`   ℹ️  Found ${missingTimeEvents.length} events with 00:00:00 times (can be fixed by fetch-times.py)`);
    for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
      console.log(`      • ${src}: ${count} events`);
    }
    console.log(`   💡 Run: python3 scripts/fetch-missing-data.py --parallel 5\n`);
  } else {
    console.log(`   ✅ All events have proper times\n`);
  }

  // Step 5: Basic deduplication (exact matches only)
  // Complex deduplication is handled by remove-duplicates.ts
  console.log('🔍 Step 5: Removing exact duplicates (same title + date + time)...');

  // merged_into IS NULL (dedup arc S198): marked merge losers are reversible
  // tombstones — they must be invisible to this exact-match dedup or it would
  // DELETE them and destroy the S197 mark's reversibility. Guarded at BOTH the
  // grouping query and the per-group fetch below.
  const duplicateGroups = db.query<{ title: string; start_date: string; cnt: number }, []>(`
    SELECT title, start_date, COUNT(*) as cnt
    FROM events
    WHERE merged_into IS NULL
    GROUP BY title, start_date
    HAVING cnt > 1
    ORDER BY cnt DESC
  `).all();

  let duplicatesRemoved = 0;

  for (const group of duplicateGroups) {
    const { title, start_date } = group;

    const events = db.query<Event, [string, string]>(`
      SELECT id, title, start_date, description, full_description, full_description_gr,
             price_amount, updated_at, url
      FROM events
      WHERE title = ? AND start_date = ?
        AND merged_into IS NULL
    `).all(title, start_date);

    const scored = events.map(e => ({
      event: e,
      score: scoreEvent(e)
    })).sort((a, b) => b.score - a.score);

    // Keep best one, delete rest
    const toDelete = scored.slice(1).map(s => s.event.id);

    for (const id of toDelete) {
      db.query('DELETE FROM events WHERE id = ?').run(id);
      duplicatesRemoved++;
    }
  }

  console.log(`   ✅ Removed ${duplicatesRemoved} exact duplicates`);
  console.log(`   💡 For comprehensive deduplication, run: bun run scripts/remove-duplicates.ts\n`);

  // Step 6: Report on data quality
  console.log('📊 Step 6: Data quality report by source...');

  const sourceStats: Record<string, SourceStats> = {};

  const allEvents = db.query<Event & { url: string | null }, []>(`
    SELECT id, title, start_date, description, full_description, full_description_gr,
           price_amount, updated_at, url
    FROM events
    WHERE date(start_date) >= date('now')
  `).all();

  for (const event of allEvents) {
    const src = getSourceFromUrl(event.url);
    if (!sourceStats[src]) {
      sourceStats[src] = { total: 0, missingTimes: 0, missingPrices: 0 };
    }
    sourceStats[src].total++;
    if (event.start_date.includes('00:00:00') || event.start_date.includes('T00:00')) {
      sourceStats[src].missingTimes++;
    }
    if (!event.price_amount || event.price_amount === 0) {
      sourceStats[src].missingPrices++;
    }
  }

  console.log('   Source           | Events | Missing Times | Missing Prices');
  console.log('   -----------------|--------|---------------|---------------');
  for (const [src, stats] of Object.entries(sourceStats).sort((a, b) => b[1].total - a[1].total)) {
    const timePercent = stats.total > 0 ? Math.round((stats.missingTimes / stats.total) * 100) : 0;
    const pricePercent = stats.total > 0 ? Math.round((stats.missingPrices / stats.total) * 100) : 0;
    console.log(`   ${src.padEnd(17)}| ${String(stats.total).padStart(6)} | ${String(stats.missingTimes).padStart(5)} (${String(timePercent).padStart(2)}%) | ${String(stats.missingPrices).padStart(5)} (${String(pricePercent).padStart(2)}%)`);
  }
  console.log('');

  // Step 7: Vacuum database to reclaim space
  console.log('🗜️  Step 7: Optimizing database...');
  db.query('VACUUM').run();
  console.log(`   ✅ Database optimized\n`);

  // Final summary
  const remaining = db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM events').get();
  const upcoming = db.query<{ count: number }, []>(`
    SELECT COUNT(*) as count FROM events
    WHERE date(start_date) >= date('now')
  `).get();

  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Database Cleanup Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Past events removed:       ${pastEvents.length}`);
  console.log(`Invalid events removed:    ${invalidEvents.length}`);
  if (!skipAthens) {
    console.log(`Non-Athens events removed: ${nonAthensRemoved}`);
  }
  console.log(`Exact duplicates removed:  ${duplicatesRemoved}`);
  if (isAggressive) {
    console.log(`Bad times removed:         ${midnightRemoved}`);
  }
  console.log(`Total removed:             ${pastEvents.length + invalidEvents.length + nonAthensRemoved + duplicatesRemoved + midnightRemoved}`);
  console.log(`---`);
  console.log(`Total events in database:  ${remaining?.count || 0}`);
  console.log(`Upcoming events:           ${upcoming?.count || 0}`);
  console.log(`${'='.repeat(60)}`);

  // Provide next steps
  console.log('\n📋 Next Steps:');
  const totalMissingTimes = Object.values(sourceStats).reduce((sum, s) => sum + s.missingTimes, 0);
  const totalMissingPrices = Object.values(sourceStats).reduce((sum, s) => sum + s.missingPrices, 0);

  if (totalMissingTimes > 0 || totalMissingPrices > 0) {
    console.log(`   • Run fetch-missing-data.py to fix ${totalMissingTimes} events with missing times and ${totalMissingPrices} with missing prices`);
  }
  console.log(`   • Run remove-duplicates.ts for comprehensive deduplication\n`);

  db.close();
}

cleanDatabase().catch(console.error);
