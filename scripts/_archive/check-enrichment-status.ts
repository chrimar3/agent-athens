#!/usr/bin/env bun
/**
 * Check enrichment status of events in database
 */

import { Database } from 'bun:sqlite';

const db = new Database('data/events.db');

const result = db.query(`
  SELECT
    COUNT(*) as total,
    COUNT(full_description) as enriched,
    COUNT(*) - COUNT(full_description) as need_enrichment
  FROM events
`).get() as { total: number; enriched: number; need_enrichment: number };

console.log('📊 Enrichment Status:');
console.log(`   Total events: ${result.total}`);
console.log(`   Already enriched: ${result.enriched}`);
console.log(`   Need enrichment: ${result.need_enrichment}`);
console.log('');

if (result.need_enrichment > 0) {
  console.log(`💡 Next step: Run enrichment on ${result.need_enrichment} events`);
  console.log('   bun run scripts/enrich-events.ts');
} else {
  console.log('✅ All events are enriched!');
}

db.close();
