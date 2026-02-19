#!/usr/bin/env bun
/**
 * Fix Duplicate Events
 *
 * Identifies and removes duplicate events, keeping the "best" version:
 * - Prioritizes entries with proper timestamps (not 00:00:00.000)
 * - Prioritizes entries with price information
 * - Prioritizes entries with AI-enriched descriptions
 */

import Database from 'bun:sqlite';

const DB_PATH = 'data/events.db';

interface Event {
  id: string;
  title: string;
  start_date: string;
  venue_name: string;
  price_amount: number | null;
  full_description: string | null;
  full_description_gr: string | null;
}

interface DuplicateGroup {
  title: string;
  date: string;
  events: Event[];
}

function scoreEvent(event: Event): number {
  let score = 0;

  // +100 points for proper time (not midnight)
  if (!event.start_date.includes('00:00:00.000')) {
    score += 100;
  }

  // +50 points for having price information
  if (event.price_amount && event.price_amount > 0) {
    score += 50;
  }

  // +30 points for Greek description
  if (event.full_description_gr && event.full_description_gr.length > 100) {
    score += 30;
  }

  // +20 points for English description
  if (event.full_description && event.full_description.length > 100) {
    score += 20;
  }

  return score;
}

function fixDuplicates() {
  const db = new Database(DB_PATH);

  console.log('🔍 Finding duplicate events...\n');

  // Find all duplicate event titles (same title + same date)
  const duplicates = db.query<DuplicateGroup, []>(`
    SELECT
      title,
      date(start_date) as date
    FROM events
    WHERE start_date >= date('now')
    GROUP BY title, date(start_date)
    HAVING COUNT(*) > 1
  `).all();

  console.log(`📊 Found ${duplicates.length} duplicate event titles\n`);

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found!');
    db.close();
    return;
  }

  let totalDeleted = 0;
  let totalKept = 0;

  for (const dup of duplicates) {
    // Get all events with this title and date
    const events = db.query<Event, [string, string]>(`
      SELECT
        id, title, start_date, venue_name,
        price_amount, full_description, full_description_gr
      FROM events
      WHERE title = ? AND date(start_date) = ?
      ORDER BY start_date
    `).all(dup.title, dup.date);

    if (events.length < 2) continue;

    // Score each event
    const scored = events.map(event => ({
      event,
      score: scoreEvent(event)
    }));

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    const keeper = scored[0].event;
    const toDelete = scored.slice(1);

    console.log(`🔄 "${dup.title}" (${dup.date})`);
    console.log(`   Keeping: ${keeper.id} (score: ${scored[0].score})`);
    console.log(`   - Time: ${keeper.start_date}`);
    console.log(`   - Price: ${keeper.price_amount ? `€${keeper.price_amount}` : 'N/A'}`);
    console.log(`   - Greek desc: ${keeper.full_description_gr ? 'Yes' : 'No'}`);

    // Delete inferior versions
    for (const { event, score } of toDelete) {
      console.log(`   Deleting: ${event.id} (score: ${score})`);
      db.query('DELETE FROM events WHERE id = ?').run(event.id);
      totalDeleted++;
    }

    totalKept++;
    console.log('');
  }

  db.close();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Deduplication complete!`);
  console.log(`   Events kept: ${totalKept}`);
  console.log(`   Events deleted: ${totalDeleted}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run the script
fixDuplicates();
