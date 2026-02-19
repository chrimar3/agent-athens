#!/usr/bin/env bun
/**
 * Recategorize Events Script
 *
 * Re-applies the hybrid event categorizer to all existing events in the database.
 * Uses three-pass categorization:
 * 1. Venue-based rules (highest confidence)
 * 2. Keyword-based rules (medium confidence)
 * 3. Source-based hints (medium confidence)
 *
 * Usage:
 *   bun run scripts/recategorize-events.ts --dry-run    # Preview changes only
 *   bun run scripts/recategorize-events.ts --auto       # Apply high-confidence changes
 *   bun run scripts/recategorize-events.ts --review     # Interactive review of uncertain events
 *   bun run scripts/recategorize-events.ts --verbose    # Show all events
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { createInterface } from 'readline';
import {
  categorizeEvent,
  needsHumanReview,
  type CategorizationResult,
  type ConfidenceLevel
} from '../src/categorizer';
import type { EventType } from '../src/types';

const DB_PATH = join(import.meta.dir, '../data/events.db');

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  full_description: string | null;
  type: string;
  genres: string | null;
  venue_name: string;
  source: string | null;
}

interface RecategorizationChange {
  id: string;
  title: string;
  venue: string;
  source: string;
  oldType: string;
  newType: string;
  confidence: ConfidenceLevel;
  reason: string;
}

interface Args {
  dryRun: boolean;
  autoApply: boolean;
  reviewMode: boolean;
  verbose: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    autoApply: args.includes('--auto'),
    reviewMode: args.includes('--review'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
}

function getEvents(db: Database): EventRow[] {
  return db.prepare(`
    SELECT id, title, description, full_description, type, genres, venue_name, source
    FROM events
    WHERE is_cancelled = 0
    ORDER BY start_date ASC
  `).all() as EventRow[];
}

function categorizeEventRow(event: EventRow): CategorizationResult {
  // Parse genres from JSON
  let genres: string[] = [];
  if (event.genres) {
    try {
      genres = JSON.parse(event.genres);
    } catch {
      genres = [];
    }
  }

  return categorizeEvent({
    title: event.title,
    description: event.description || undefined,
    fullDescription: event.full_description || undefined,
    genres,
    venue: event.venue_name,
    source: event.source || undefined,
    currentType: event.type as EventType
  });
}

function updateEventType(db: Database, eventId: string, newType: string): void {
  db.prepare(`
    UPDATE events
    SET type = ?, updated_at = ?
    WHERE id = ?
  `).run(newType, new Date().toISOString(), eventId);
}

function printColoredType(type: string): string {
  const colors: Record<string, string> = {
    concert: '\x1b[33m',      // Yellow
    dj_set: '\x1b[35m',       // Magenta
    theater: '\x1b[36m',      // Cyan
    dance: '\x1b[32m',        // Green
    opera: '\x1b[31m',        // Red
    classical: '\x1b[34m',    // Blue
    comedy: '\x1b[93m',       // Bright Yellow
    workshop: '\x1b[92m',     // Bright Green
    exhibition: '\x1b[94m',   // Bright Blue
    show: '\x1b[95m',         // Bright Magenta
    screening: '\x1b[96m',    // Bright Cyan
    festival: '\x1b[91m',     // Bright Red
    other: '\x1b[90m'         // Gray
  };
  const reset = '\x1b[0m';
  return `${colors[type] || ''}${type}${reset}`;
}

function printConfidence(confidence: ConfidenceLevel): string {
  const colors: Record<ConfidenceLevel, string> = {
    high: '\x1b[32m',    // Green
    medium: '\x1b[33m',  // Yellow
    low: '\x1b[31m'      // Red
  };
  const reset = '\x1b[0m';
  return `${colors[confidence]}${confidence}${reset}`;
}

function printSummary(changes: RecategorizationChange[]): void {
  if (changes.length === 0) {
    console.log('\n✅ No changes needed - all events are correctly categorized.');
    return;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 RECATEGORIZATION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total changes: ${changes.length}\n`);

  // Group by change type
  const grouped = changes.reduce((acc, change) => {
    const key = `${change.oldType} → ${change.newType}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(change);
    return acc;
  }, {} as Record<string, RecategorizationChange[]>);

  // Sort by count
  const sortedGroups = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

  for (const [changeType, events] of sortedGroups) {
    const [oldType, newType] = changeType.split(' → ');
    console.log(`\n${printColoredType(oldType)} → ${printColoredType(newType)} (${events.length} events):`);

    // Group by confidence
    const highConf = events.filter(e => e.confidence === 'high');
    const mediumConf = events.filter(e => e.confidence === 'medium');
    const lowConf = events.filter(e => e.confidence === 'low');

    if (highConf.length > 0) {
      console.log(`  [${printConfidence('high')}] ${highConf.length} events`);
      for (const event of highConf.slice(0, 3)) {
        console.log(`    • ${event.title.substring(0, 50)}...`);
      }
      if (highConf.length > 3) console.log(`    ... and ${highConf.length - 3} more`);
    }

    if (mediumConf.length > 0) {
      console.log(`  [${printConfidence('medium')}] ${mediumConf.length} events`);
      for (const event of mediumConf.slice(0, 3)) {
        console.log(`    • ${event.title.substring(0, 50)}...`);
      }
      if (mediumConf.length > 3) console.log(`    ... and ${mediumConf.length - 3} more`);
    }

    if (lowConf.length > 0) {
      console.log(`  [${printConfidence('low')}] ${lowConf.length} events (need review)`);
    }
  }
}

function printDistribution(label: string, events: EventRow[], changes?: RecategorizationChange[]): void {
  const types = events.reduce((acc, e) => {
    let type = e.type;
    if (changes) {
      const change = changes.find(c => c.id === e.id);
      if (change) type = change.newType;
    }
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`\n${label}`);
  console.log('─'.repeat(40));
  for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.min(Math.floor(count / 10), 30));
    console.log(`  ${printColoredType(type).padEnd(20)} ${String(count).padStart(4)} ${bar}`);
  }
}

async function interactiveReview(
  db: Database,
  uncertainEvents: RecategorizationChange[],
  dryRun: boolean
): Promise<number> {
  if (uncertainEvents.length === 0) {
    console.log('\n✅ No events need human review.');
    return 0;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('🔍 INTERACTIVE REVIEW MODE');
  console.log('═'.repeat(60));
  console.log(`${uncertainEvents.length} events need review.\n`);
  console.log('Commands: [y]es to accept, [n]o to skip, [q]uit, [s]kip all\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(prompt, resolve);
    });
  };

  let accepted = 0;
  let skipped = 0;

  for (let i = 0; i < uncertainEvents.length; i++) {
    const event = uncertainEvents[i];

    console.log(`\n[${ i + 1}/${uncertainEvents.length}] ─────────────────────────────`);
    console.log(`📌 ${event.title}`);
    console.log(`📍 Venue: ${event.venue}`);
    console.log(`📂 Source: ${event.source}`);
    console.log(`\n   Suggested: ${printColoredType(event.oldType)} → ${printColoredType(event.newType)}`);
    console.log(`   Reason: ${event.reason}`);
    console.log(`   Confidence: ${printConfidence(event.confidence)}`);

    const answer = await question('\nAccept? [y/n/q/s]: ');
    const cmd = answer.toLowerCase().trim();

    if (cmd === 'q') {
      console.log('\n⏸️  Quitting review. Changes so far will be applied.');
      break;
    }

    if (cmd === 's') {
      console.log('\n⏭️  Skipping remaining reviews.');
      break;
    }

    if (cmd === 'y' || cmd === 'yes') {
      if (!dryRun) {
        updateEventType(db, event.id, event.newType);
      }
      console.log(`   ✅ Changed to ${printColoredType(event.newType)}`);
      accepted++;
    } else {
      console.log('   ⏭️  Skipped');
      skipped++;
    }
  }

  rl.close();

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 REVIEW COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  Accepted: ${accepted}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Remaining: ${uncertainEvents.length - accepted - skipped}`);

  return accepted;
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔄 Event Recategorization Tool                               ║');
  console.log('║     Hybrid venue + keyword + source categorization            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  if (args.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else if (args.autoApply) {
    console.log('🤖 AUTO MODE - High/medium confidence changes will be applied\n');
  } else if (args.reviewMode) {
    console.log('👤 REVIEW MODE - Interactive review of uncertain events\n');
  }

  const db = new Database(DB_PATH);
  const events = getEvents(db);

  console.log(`Total events: ${events.length}`);

  // Show current distribution
  printDistribution('Current Type Distribution:', events);

  // Find changes
  const allChanges: RecategorizationChange[] = [];
  let processed = 0;

  process.stdout.write('\nProcessing events...');

  for (const event of events) {
    const result = categorizeEventRow(event);

    if (result.type !== event.type) {
      allChanges.push({
        id: event.id,
        title: event.title,
        venue: event.venue_name,
        source: event.source || 'unknown',
        oldType: event.type,
        newType: result.type,
        confidence: result.confidence,
        reason: result.reason
      });

      if (args.verbose) {
        console.log(`\n  [${event.type} → ${result.type}] ${event.title.substring(0, 50)}`);
        console.log(`    Venue: ${event.venue_name}, Confidence: ${result.confidence}`);
        console.log(`    Reason: ${result.reason}`);
      }
    }

    processed++;
    if (processed % 100 === 0) {
      process.stdout.write(`\rProcessed ${processed}/${events.length} events...`);
    }
  }

  console.log(`\rProcessed ${events.length}/${events.length} events.   `);

  // Split by confidence
  const highConfChanges = allChanges.filter(c => c.confidence === 'high');
  const mediumConfChanges = allChanges.filter(c => c.confidence === 'medium');
  const lowConfChanges = allChanges.filter(c => c.confidence === 'low');

  // Print summary
  printSummary(allChanges);

  console.log(`\n${'─'.repeat(60)}`);
  console.log('Changes by Confidence:');
  console.log(`  ${printConfidence('high')}: ${highConfChanges.length} events (safe to auto-apply)`);
  console.log(`  ${printConfidence('medium')}: ${mediumConfChanges.length} events (usually correct)`);
  console.log(`  ${printConfidence('low')}: ${lowConfChanges.length} events (need human review)`);

  // Apply changes based on mode
  if (args.dryRun) {
    // Show projected distribution
    printDistribution('Projected Distribution After Changes:', events, allChanges);
    console.log('\n💡 Run without --dry-run to apply changes.');
  } else if (args.autoApply) {
    // Apply high and medium confidence changes
    const autoChanges = [...highConfChanges, ...mediumConfChanges];
    console.log(`\n🤖 Applying ${autoChanges.length} high/medium confidence changes...`);

    for (const change of autoChanges) {
      updateEventType(db, change.id, change.newType);
    }

    console.log(`✅ Applied ${autoChanges.length} changes.`);

    if (lowConfChanges.length > 0) {
      console.log(`\n⚠️  ${lowConfChanges.length} low-confidence events skipped.`);
      console.log('   Run with --review to interactively review them.');
    }

    // Show new distribution
    printDistribution('New Distribution:', events, allChanges);
  } else if (args.reviewMode) {
    // First apply high confidence changes automatically
    if (highConfChanges.length > 0) {
      console.log(`\n🤖 Auto-applying ${highConfChanges.length} high-confidence changes...`);
      for (const change of highConfChanges) {
        updateEventType(db, change.id, change.newType);
      }
      console.log(`✅ Applied ${highConfChanges.length} high-confidence changes.`);
    }

    // Then interactively review low and medium confidence
    const reviewEvents = [...mediumConfChanges, ...lowConfChanges];
    if (reviewEvents.length > 0) {
      await interactiveReview(db, reviewEvents, args.dryRun);
    }
  } else {
    // Default: just show changes
    console.log('\n💡 Run with:');
    console.log('   --dry-run   Preview changes');
    console.log('   --auto      Apply high/medium confidence changes');
    console.log('   --review    Interactive review of uncertain events');
  }

  db.close();
  console.log('\n✨ Done!\n');
}

main().catch(console.error);
