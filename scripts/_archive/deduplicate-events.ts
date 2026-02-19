#!/usr/bin/env bun
/**
 * Deduplicate Events
 * ==================
 *
 * Removes duplicate events from the database, keeping the most complete version.
 *
 * Deduplication logic:
 * - Events with same title + date are considered duplicates
 * - Keep the version with:
 *   1. Most complete description (full_description_gr > full_description > description)
 *   2. Non-null price if one has it
 *   3. Most recent updated_at
 */

import Database from 'bun:sqlite';

const DB_PATH = 'data/events.db';

interface Event {
  id: string;
  title: string;
  start_date: string;
  description: string | null;
  full_description: string | null;
  full_description_gr: string | null;
  price_amount: number | null;
  updated_at: string;
}

function scoreEvent(event: Event): number {
  let score = 0;

  // Score descriptions (most valuable)
  if (event.full_description_gr) score += 100;
  if (event.full_description) score += 50;
  if (event.description) score += 10;

  // Score price data
  if (event.price_amount && event.price_amount > 0) score += 20;

  // Recency bonus (tiny)
  score += new Date(event.updated_at).getTime() / 1000000000;

  return score;
}

async function deduplicateEvents() {
  const db = new Database(DB_PATH);

  console.log('🔍 Finding duplicate events...\n');

  // Find all duplicate groups (same title + date)
  const duplicateGroups = db.query<{ title: string; date: string; cnt: number }, []>(`
    SELECT title, date(start_date) as date, COUNT(*) as cnt
    FROM events
    GROUP BY title, date(start_date)
    HAVING cnt > 1
    ORDER BY cnt DESC
  `).all();

  console.log(`📋 Found ${duplicateGroups.length} duplicate groups\n`);

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicates found!');
    db.close();
    return;
  }

  let totalDuplicates = 0;
  let idsToDelete: string[] = [];

  for (const group of duplicateGroups) {
    const { title, date, cnt } = group;

    // Get all events in this duplicate group
    const events = db.query<Event, [string, string]>(`
      SELECT id, title, start_date, description, full_description, full_description_gr,
             price_amount, updated_at
      FROM events
      WHERE title = ? AND date(start_date) = ?
      ORDER BY start_date
    `).all(title, date);

    // Score each event
    const scored = events.map(e => ({
      event: e,
      score: scoreEvent(e)
    })).sort((a, b) => b.score - a.score);

    // Keep the highest scoring one, delete the rest
    const keeper = scored[0].event;
    const toDelete = scored.slice(1).map(s => s.event);

    console.log(`\n📅 ${title.substring(0, 60)}... (${date})`);
    console.log(`   Keeping: ${keeper.id} (score: ${scored[0].score.toFixed(1)})`);
    console.log(`   Deleting ${toDelete.length} duplicate(s):`);

    for (const dup of toDelete) {
      console.log(`     - ${dup.id} (score: ${scoreEvent(dup).toFixed(1)})`);
      idsToDelete.push(dup.id);
      totalDuplicates++;
    }
  }

  // Delete all duplicates
  if (idsToDelete.length > 0) {
    console.log(`\n🗑️  Deleting ${idsToDelete.length} duplicate events...`);

    const deleteStmt = db.prepare('DELETE FROM events WHERE id = ?');

    for (const id of idsToDelete) {
      deleteStmt.run(id);
    }

    console.log(`✅ Deleted ${totalDuplicates} duplicate events!`);
  }

  // Summary
  const remaining = db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM events').get();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Deduplication Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Duplicate groups found: ${duplicateGroups.length}`);
  console.log(`Events deleted:         ${totalDuplicates}`);
  console.log(`Events remaining:       ${remaining?.count || 0}`);
  console.log(`${'='.repeat(60)}\n`);

  db.close();
}

// Run
deduplicateEvents().catch(console.error);
