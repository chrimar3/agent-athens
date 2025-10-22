#!/usr/bin/env bun
/**
 * Check event date distribution
 */

import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');
const today = '2025-10-22';

const past = db.query('SELECT COUNT(*) as count FROM events WHERE start_date < ?').get(today) as { count: number };
const future = db.query('SELECT COUNT(*) as count FROM events WHERE start_date >= ?').get(today) as { count: number };
const earliest = db.query('SELECT MIN(start_date) as date FROM events').get() as { date: string };
const latest = db.query('SELECT MAX(start_date) as date FROM events').get() as { date: string };

console.log('📅 Event Date Analysis:');
console.log(`   Today: ${today}`);
console.log(`   Past events: ${past.count}`);
console.log(`   Future events (today+): ${future.count}`);
console.log(`   Earliest event: ${earliest.date}`);
console.log(`   Latest event: ${latest.date}`);
console.log('');

if (past.count > 0) {
  console.log(`⚠️  WARNING: ${past.count} past events found!`);
  console.log('   These should have been filtered during parsing.');
  console.log('');
  console.log('💡 To clean up:');
  console.log('   DELETE FROM events WHERE start_date < "2025-10-22"');
}

db.close();
