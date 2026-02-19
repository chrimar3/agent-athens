#!/usr/bin/env bun
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

const db = new Database('data/events.db');
const enriched = JSON.parse(readFileSync('data/enriched-batch1.json', 'utf-8'));

console.log('📝 Importing enriched descriptions...\n');

let updated = 0;
for (const event of enriched) {
  const stmt = db.prepare(`
    UPDATE events 
    SET full_description = ?, 
        updated_at = datetime('now')
    WHERE id = ?
  `);
  
  const result = stmt.run(event.full_description, event.event_id);
  if (result.changes > 0) {
    console.log(`✅ Updated: ${event.event_id} (${event.word_count} words)`);
    updated++;
  } else {
    console.log(`❌ Not found: ${event.event_id}`);
  }
}

console.log(`\n📊 Summary: ${updated}/${enriched.length} events updated`);
db.close();
