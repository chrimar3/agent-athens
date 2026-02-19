#!/usr/bin/env bun
/**
 * Agent Athens - Daily Manual Session Script
 * ==========================================
 *
 * Helper script for Claude Code sessions.
 * Shows pipeline state, enrichment queue, and suggested commands.
 *
 * Usage:
 *   bun run scripts/daily-manual.ts          # Full status display
 *   bun run scripts/daily-manual.ts --quick  # Quick summary only
 *   bun run scripts/daily-manual.ts --enrich # Start enrichment mode
 *
 * Run this at the start of each Claude Code session to see what needs to be done.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 6.4)
 * @see src/orchestration/pipeline-state.ts
 * @see src/enrichment/enrichment-queue.ts
 */

import Database from 'bun:sqlite';
import {
  getPipelineState,
  getPipelineSummary,
  shouldResetForNewDay,
  resetPipelineState,
} from '../src/orchestration/pipeline-state';
import {
  getEnrichmentQueue,
  getEnrichmentStats,
} from '../src/enrichment/enrichment-queue';

// ============================================================================
// Constants
// ============================================================================

const DB_PATH = 'data/events.db';
const STATE_FILE = 'data/state/pipeline-state.json';

// ============================================================================
// Display Functions
// ============================================================================

function printHeader(): void {
  console.log('');
  console.log('='.repeat(60));
  console.log('  Agent Athens - Daily Manual Session');
  console.log('  ' + new Date().toLocaleString('en-GB', { timeZone: 'Europe/Athens' }));
  console.log('='.repeat(60));
}

function printPipelineStatus(): void {
  console.log('\n--- Pipeline Status ---\n');

  // Check if we need to reset for new day
  if (shouldResetForNewDay(STATE_FILE)) {
    console.log('  [!] New day detected - resetting pipeline state');
    resetPipelineState(STATE_FILE);
  }

  const summary = getPipelineSummary(STATE_FILE);

  console.log(`  Date: ${summary.date}`);
  console.log(`  Completed phases: ${summary.completedPhases.length > 0 ? summary.completedPhases.join(', ') : 'none'}`);
  console.log(`  Pending phases: ${summary.pendingPhases.length > 0 ? summary.pendingPhases.join(', ') : 'none'}`);

  if (summary.failedPhases.length > 0) {
    console.log(`  FAILED phases: ${summary.failedPhases.join(', ')}`);
  }

  console.log('');
  console.log(`  Events ingested today: ${summary.totalEventsIngested}`);
  console.log(`  Events verified: ${summary.totalEventsVerified}`);
  console.log(`  Events rejected: ${summary.totalEventsRejected}`);
}

function printDatabaseStats(db: Database): void {
  console.log('\n--- Database Statistics ---\n');

  // Total events
  const total = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
  console.log(`  Total events: ${total.count}`);

  // By location status
  const byStatus = db.prepare(`
    SELECT location_status, COUNT(*) as count
    FROM events
    GROUP BY location_status
    ORDER BY count DESC
  `).all() as Array<{ location_status: string; count: number }>;

  console.log('\n  By location status:');
  for (const row of byStatus) {
    const status = row.location_status || 'null';
    console.log(`    ${status.padEnd(20)} ${row.count}`);
  }

  // Upcoming events
  const upcoming = db.prepare(`
    SELECT COUNT(*) as count
    FROM events
    WHERE start_date >= date('now')
      AND location_status IN ('verified_athens', 'pass_through')
  `).get() as { count: number };
  console.log(`\n  Upcoming verified events: ${upcoming.count}`);
}

function printEnrichmentStatus(db: Database): void {
  console.log('\n--- Enrichment Status ---\n');

  const stats = getEnrichmentStats(db);

  console.log(`  Total verified events: ${stats.totalVerified}`);
  console.log(`  Already enriched: ${stats.enriched}`);
  console.log(`  Pending enrichment: ${stats.pendingEnrichment}`);

  if (stats.totalVerified > 0) {
    const percent = Math.round((stats.enriched / stats.totalVerified) * 100);
    const bar = '='.repeat(Math.floor(percent / 5)) + '-'.repeat(20 - Math.floor(percent / 5));
    console.log(`\n  Progress: [${bar}] ${percent}%`);
  }

  // Show next few events to enrich
  if (stats.pendingEnrichment > 0) {
    const queue = getEnrichmentQueue(db, { limit: 3 });
    console.log('\n  Next events to enrich:');
    for (const event of queue) {
      const title = event.title.length > 40 ? event.title.substring(0, 37) + '...' : event.title;
      console.log(`    - ${title}`);
      console.log(`      ${event.date} @ ${event.venue || 'Unknown venue'}`);
    }
  }
}

function printSuggestedCommands(db: Database): void {
  console.log('\n--- Suggested Commands ---\n');

  const stats = getEnrichmentStats(db);
  const summary = getPipelineSummary(STATE_FILE);

  // Check what needs to be done
  const needsAutomatedPipeline = !summary.completedPhases.includes('ingest');
  const needsEnrichment = stats.pendingEnrichment > 0;
  const needsVenueReview = db.prepare(`
    SELECT COUNT(*) as count FROM events WHERE location_status = 'unverified'
  `).get() as { count: number };

  if (needsAutomatedPipeline) {
    console.log('  1. Run automated pipeline (if not already run today):');
    console.log('     ./scripts/daily-automated.sh');
    console.log('');
  }

  if (needsVenueReview.count > 0) {
    console.log(`  2. Review ${needsVenueReview.count} unverified venues:`);
    console.log('     bun run scripts/review-venues.ts');
    console.log('');
  }

  if (needsEnrichment) {
    console.log(`  3. Enrich ${stats.pendingEnrichment} events:`);
    console.log('     bun run scripts/run-enrichment-pipeline.ts --stats');
    console.log('     bun run scripts/run-enrichment-pipeline.ts --prompts --count=5');
    console.log('');
  }

  console.log('  4. Rebuild and deploy site:');
  console.log('     bun run build');
  console.log('     git add . && git commit -m "chore: daily update" && git push');
  console.log('');

  console.log('  5. View enrichment queue:');
  console.log('     bun run scripts/list-unenriched.ts');
  console.log('');
}

function printQuickSummary(db: Database): void {
  printHeader();

  const stats = getEnrichmentStats(db);
  const summary = getPipelineSummary(STATE_FILE);
  const needsVenueReview = db.prepare(`
    SELECT COUNT(*) as count FROM events WHERE location_status = 'unverified'
  `).get() as { count: number };

  console.log('\n  Quick Summary:');
  console.log(`  - Pipeline phases completed: ${summary.completedPhases.length}/6`);
  console.log(`  - Events to enrich: ${stats.pendingEnrichment}`);
  console.log(`  - Venues to review: ${needsVenueReview.count}`);
  console.log(`  - Enrichment progress: ${Math.round((stats.enriched / Math.max(stats.totalVerified, 1)) * 100)}%`);
  console.log('');
}

function startEnrichmentMode(db: Database): void {
  printHeader();
  console.log('\n  Starting enrichment mode...\n');

  const stats = getEnrichmentStats(db);

  if (stats.pendingEnrichment === 0) {
    console.log('  All events are enriched! Nothing to do.');
    console.log('');
    return;
  }

  console.log(`  ${stats.pendingEnrichment} events need enrichment.`);
  console.log('');
  console.log('  Run:');
  console.log('    bun run scripts/run-enrichment-pipeline.ts --prompts --count=5');
  console.log('');
  console.log('  Then for each event, copy the prompt and paste in Claude Code.');
  console.log('  Save using:');
  console.log('    bun run scripts/run-enrichment-pipeline.ts --save --id=<EVENT_ID>');
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const quickMode = args.includes('--quick');
  const enrichMode = args.includes('--enrich');

  // Open database
  let db: Database;
  try {
    db = new Database(DB_PATH);
  } catch (error) {
    console.error('Error opening database:', error);
    console.error(`Make sure ${DB_PATH} exists.`);
    process.exit(1);
  }

  try {
    if (quickMode) {
      printQuickSummary(db);
      return;
    }

    if (enrichMode) {
      startEnrichmentMode(db);
      return;
    }

    // Full status display
    printHeader();
    printPipelineStatus();
    printDatabaseStats(db);
    printEnrichmentStatus(db);
    printSuggestedCommands(db);

  } finally {
    db.close();
  }
}

main();
