#!/usr/bin/env bun
/**
 * AI Event Enrichment Script for Agent Athens
 * ============================================
 *
 * Generates 150-300 word descriptions for events optimized for AI answer engines.
 *
 * Usage:
 *   bun run scripts/enrich-events.ts                    # Show enrichment queue
 *   bun run scripts/enrich-events.ts --list             # Show tier summary + top 10
 *   bun run scripts/enrich-events.ts --prompts          # Generate prompts for Claude Code
 *   bun run scripts/enrich-events.ts --prompts --count=5 # First 5 events
 *   bun run scripts/enrich-events.ts --id=<event-id>    # Show specific event
 *   bun run scripts/enrich-events.ts --stats            # Show statistics + velocity
 *
 * How it works:
 * 1. Queries verified Athens events needing enrichment
 * 2. Generates prompts for Claude Code tool_agent (FREE)
 * 3. Saves descriptions to database
 *
 * NOTE: This script generates prompts. Copy them into Claude Code
 * for free AI generation using tool_agent.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 5.7)
 * @see src/enrichment/enrichment-queue.ts
 * @see src/enrichment/description-generator.ts
 */

import Database from 'bun:sqlite';
import {
  getEnrichmentQueue,
  getEnrichmentStats,
  markEnriched,
  updateEventDescription,
  getEventForEnrichment,
  type EnrichmentQueueItem,
} from '../src/enrichment/enrichment-queue';
import {
  buildPrompt,
  validateDescription,
  cleanDescription,
  type EventForEnrichment,
} from '../src/enrichment/description-generator';
import {
  getNextBatch,
  getTierBreakdown,
  calculateVelocityMetrics,
  type VelocityMetrics,
} from '../src/enrichment/priority-queue-manager';

// ============================================================================
// Constants
// ============================================================================

const DB_PATH = 'data/events.db';

// ============================================================================
// Database Connection
// ============================================================================

function openDatabase(): Database {
  return new Database(DB_PATH);
}

// ============================================================================
// Display Functions
// ============================================================================

function showStats(db: Database): void {
  const stats = getEnrichmentStats(db);

  console.log('\n📊 Enrichment Statistics:');
  console.log('='.repeat(50));
  console.log(`   Total verified events: ${stats.totalVerified}`);
  console.log(`   Already enriched: ${stats.enriched}`);
  console.log(`   Pending enrichment: ${stats.pendingEnrichment}`);

  if (stats.totalVerified > 0) {
    const percent = Math.round((stats.enriched / stats.totalVerified) * 100);
    console.log(`   Progress: ${percent}%`);
  }

  // Add velocity metrics
  const velocity = calculateVelocityMetrics(db);
  showVelocityMetrics(velocity);

  // Add by-type breakdown
  showByTypeBreakdown(db);
}

function showVelocityMetrics(metrics: VelocityMetrics): void {
  console.log('\n📈 Velocity Metrics (7-day rolling):');
  console.log('─'.repeat(50));
  console.log(`   Enriched this week:    ${metrics.enrichedThisWeek}`);
  console.log(`   New stubs this week:   ${metrics.newStubsThisWeek}`);
  console.log(`   Net velocity:          ${metrics.velocity > 0 ? '+' : ''}${metrics.velocity}`);
  console.log(`   Current coverage:      ${metrics.enrichmentRatio}%`);
  console.log(`   Target coverage:       ${metrics.target}%`);

  if (metrics.weeksToTarget !== null) {
    console.log(`   Weeks to target:       ${metrics.weeksToTarget}`);
  } else if (metrics.enrichmentRatio >= metrics.target) {
    console.log(`   Status:                ✅ Target reached!`);
  } else {
    console.log(`   Status:                ⚠️  Velocity too low`);
  }
}

function showByTypeBreakdown(db: Database): void {
  const byType = db.prepare(`
    SELECT e.type, COUNT(*) as total,
           SUM(CASE WHEN q.status = 'completed' THEN 1 ELSE 0 END) as enriched
    FROM events e
    LEFT JOIN enrichment_queue q ON e.id = q.event_id
    WHERE e.location_status IN ('verified_athens', 'pass_through')
    AND e.start_date >= date('now')
    GROUP BY e.type
    ORDER BY total DESC
  `).all() as Array<{ type: string; total: number; enriched: number }>;

  if (byType.length === 0) return;

  console.log('\n📋 Coverage by Event Type:');
  console.log('─'.repeat(50));

  for (const row of byType) {
    const pct = row.total > 0 ? Math.round((row.enriched / row.total) * 100) : 0;
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    const typeStr = (row.type || 'unknown').padEnd(12);
    console.log(`   ${typeStr} ${bar} ${pct.toString().padStart(3)}% (${row.enriched}/${row.total})`);
  }
}

function showEnhancedList(db: Database): void {
  const tiers = getTierBreakdown(db);

  console.log('\n📊 Enrichment Queue Summary:');
  console.log('='.repeat(50));
  console.log(`   PREMIUM (score 80+):    ${tiers.premium} events`);
  console.log(`   STANDARD (score 40-79): ${tiers.standard} events`);
  console.log(`   STUB (leave as-is):     ${tiers.stub} events`);

  const top10 = getNextBatch(db, { limit: 10 });
  if (top10.length > 0) {
    console.log('\n📋 Top 10 Priority Events:\n');
    for (let i = 0; i < top10.length; i++) {
      const e = top10[i];
      const dateStr = e.date.split('T')[0];
      const shortTitle = e.title.length > 40 ? e.title.slice(0, 37) + '...' : e.title;
      const venueShort = (e.venue || 'Unknown').slice(0, 20);
      console.log(`${(i+1).toString().padStart(2)}. [${e.priority_score.toString().padStart(3)}] ${shortTitle.padEnd(42)} — ${venueShort.padEnd(20)} — ${dateStr}`);
    }
  } else {
    console.log('\n   ✅ No pending events in queue');
  }
}

function showQueue(db: Database, limit = 20): void {
  const queue = getEnrichmentQueue(db, { limit });

  if (queue.length === 0) {
    console.log('\n✅ All verified events are enriched!');
    return;
  }

  console.log(`\n📋 Events Needing Enrichment (${queue.length}${limit && queue.length >= limit ? '+' : ''}):\n`);

  for (let i = 0; i < queue.length; i++) {
    const event = queue[i];
    const title = event.title.length > 50 ? event.title.substring(0, 47) + '...' : event.title;

    console.log(`${(i + 1).toString().padStart(2)}. ${title.padEnd(52)} ${event.date}`);
    console.log(`    ID: ${event.id}`);
    console.log(`    Venue: ${event.venue || 'Unknown'} | Type: ${event.type || 'Unknown'}`);
  }
}

function showPrompts(db: Database, count: number): void {
  const queue = getEnrichmentQueue(db, { limit: count });

  if (queue.length === 0) {
    console.log('\n✅ All verified events are enriched!');
    return;
  }

  console.log(`\n📝 Generating ${queue.length} prompts for Claude Code...\n`);
  console.log('=' .repeat(70));
  console.log('Copy each prompt into Claude Code and save the response.');
  console.log('Then use: bun run scripts/enrich-events.ts --save --id=<ID>');
  console.log('=' .repeat(70));

  for (let i = 0; i < queue.length; i++) {
    const event = queue[i];
    const eventForPrompt = queueItemToEnrichment(event);
    const prompt = buildPrompt(eventForPrompt);

    console.log('\n' + '='.repeat(70));
    console.log(`EVENT ${i + 1}/${queue.length}: ${event.title}`);
    console.log(`ID: ${event.id}`);
    console.log(`Date: ${event.date} | Venue: ${event.venue}`);
    console.log('='.repeat(70));
    console.log('\n--- PROMPT (copy below) ---\n');
    console.log(prompt);
    console.log('\n--- END PROMPT ---\n');
  }

  console.log('='.repeat(70));
  console.log('\n💡 Instructions:');
  console.log('1. Copy each prompt above into Claude Code');
  console.log('2. Use tool_agent to generate the description (FREE)');
  console.log('3. Save using: bun run scripts/enrich-events.ts --save --id=<ID>');
  console.log('   Then paste the description when prompted\n');
}

function showEvent(db: Database, eventId: string): void {
  const event = getEventForEnrichment(db, eventId);

  if (!event) {
    console.error(`\n❌ Event not found: ${eventId}`);
    return;
  }

  console.log('\n📝 Event Details:');
  console.log('='.repeat(50));
  console.log(`   Title: ${event.title}`);
  console.log(`   ID: ${event.id}`);
  console.log(`   Date: ${event.date}`);
  console.log(`   Time: ${event.time || 'Not set'}`);
  console.log(`   Venue: ${event.venue || 'Unknown'}`);
  console.log(`   Type: ${event.type || 'Unknown'}`);
  console.log(`   Genre: ${event.genre || 'Unknown'}`);
  console.log(`   Price: ${event.price || 'Unknown'}`);
  console.log(`   Status: ${event.location_status}`);

  // Generate prompt
  const eventForPrompt = queueItemToEnrichment(event);
  const prompt = buildPrompt(eventForPrompt);

  console.log('\n--- PROMPT ---\n');
  console.log(prompt);
  console.log('\n--- END PROMPT ---');
}

// ============================================================================
// Save Description
// ============================================================================

async function saveDescription(db: Database, eventId: string): Promise<void> {
  const event = getEventForEnrichment(db, eventId);

  if (!event) {
    console.error(`\n❌ Event not found: ${eventId}`);
    return;
  }

  console.log(`\n📝 Saving description for: ${event.title}`);
  console.log('   Paste the description below, then press Enter twice:\n');

  // Read from stdin
  const lines: string[] = [];
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let emptyLineCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const newLines = text.split('\n');

    for (const line of newLines) {
      if (line.trim() === '') {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          break;
        }
      } else {
        emptyLineCount = 0;
        lines.push(line);
      }
    }

    if (emptyLineCount >= 2) break;
  }

  const description = cleanDescription(lines.join('\n'));

  if (!description) {
    console.error('\n❌ No description provided');
    return;
  }

  // Validate
  const validation = validateDescription(description);

  console.log(`\n📊 Validation:`);
  console.log(`   Word count: ${validation.wordCount}`);

  if (!validation.valid) {
    console.log(`   ⚠️  Issues found:`);
    for (const error of validation.errors) {
      console.log(`      - ${error}`);
    }

    const confirm = prompt('   Save anyway? (y/N): ');
    if (confirm?.toLowerCase() !== 'y') {
      console.log('   ❌ Cancelled');
      return;
    }
  }

  // Save
  const success = updateEventDescription(db, eventId, description);

  if (success) {
    console.log(`\n✅ Description saved for ${event.title}`);
    console.log(`   Word count: ${validation.wordCount}`);
  } else {
    console.error('\n❌ Failed to save description');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function queueItemToEnrichment(item: EnrichmentQueueItem): EventForEnrichment {
  return {
    id: item.id,
    title: item.title,
    date: item.date,
    time: item.time,
    venue: item.venue,
    type: item.type,
    genre: item.genre,
    price: item.price,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const statsOnly = args.includes('--stats');
  const listMode = args.includes('--list');
  const promptsMode = args.includes('--prompts');
  const saveMode = args.includes('--save');

  const countArg = args.find((a: string) => a.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1]) : 5;

  const idArg = args.find((a: string) => a.startsWith('--id='));
  const eventId = idArg ? idArg.split('=')[1] : null;

  console.log('🎭 Agent Athens - AI Event Enrichment');
  console.log('='.repeat(50));

  const db = openDatabase();

  try {
    if (listMode) {
      // Show enhanced list with tier summary
      showEnhancedList(db);
      return;
    }

    if (statsOnly) {
      // Show full stats with velocity
      showStats(db);
      return;
    }

    if (saveMode && eventId) {
      // Save description for specific event
      await saveDescription(db, eventId);
      return;
    }

    if (eventId) {
      // Show specific event
      showEvent(db, eventId);
      return;
    }

    if (promptsMode) {
      // Generate prompts
      showPrompts(db, count);
      return;
    }

    // Default: show queue
    showQueue(db);

    console.log('\n💡 Usage:');
    console.log('   bun run scripts/enrich-events.ts --list             # Tier summary + top 10');
    console.log('   bun run scripts/enrich-events.ts --stats            # Stats + velocity');
    console.log('   bun run scripts/enrich-events.ts --prompts          # Generate prompts');
    console.log('   bun run scripts/enrich-events.ts --prompts --count=5 # First 5 events');
    console.log('   bun run scripts/enrich-events.ts --id=<id>          # Show specific event');
    console.log('   bun run scripts/enrich-events.ts --save --id=<id>   # Save description');

  } finally {
    db.close();
  }
}

// Export for use by Claude Code
export {
  buildPrompt,
  validateDescription,
  getEnrichmentQueue,
  getEnrichmentStats,
  markEnriched,
  updateEventDescription,
};

main().catch(console.error);
