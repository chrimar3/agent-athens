#!/usr/bin/env bun
/**
 * List Unenriched Events
 *
 * Quick utility to show events that need AI enrichment.
 * For full enrichment workflow, use: bun run scripts/run-enrichment-pipeline.ts
 *
 * @see specs/001-data-pipeline/tasks.md (Task 5.4)
 */

import Database from 'bun:sqlite';
import { getEnrichmentQueue, getEnrichmentStats } from '../src/enrichment/enrichment-queue';

const DB_PATH = 'data/events.db';

function main(): void {
  const db = new Database(DB_PATH);

  try {
    const stats = getEnrichmentStats(db);

    console.log('📋 Enrichment Status');
    console.log('='.repeat(50));
    console.log(`   Verified events: ${stats.totalVerified}`);
    console.log(`   Enriched: ${stats.enriched}`);
    console.log(`   Pending: ${stats.pendingEnrichment}`);

    if (stats.pendingEnrichment === 0) {
      console.log('\n✅ All events are enriched!');
      return;
    }

    const queue = getEnrichmentQueue(db, { limit: 10 });

    console.log('\n📝 Next events to enrich:\n');

    for (let i = 0; i < queue.length; i++) {
      const event = queue[i];
      console.log(`${i + 1}. ${event.title.substring(0, 50)}`);
      console.log(`   ${event.date} | ${event.venue || 'Unknown venue'}`);
    }

    if (stats.pendingEnrichment > 10) {
      console.log(`\n   ... and ${stats.pendingEnrichment - 10} more`);
    }

    console.log('\n💡 Run: bun run scripts/run-enrichment-pipeline.ts --prompts');

  } finally {
    db.close();
  }
}

main();
