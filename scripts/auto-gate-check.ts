#!/usr/bin/env bun
/**
 * Auto Gate Checker CLI
 *
 * Validates a description file against quality gates. Wraps the existing
 * quality-gates.ts validation system for standalone CLI use.
 *
 * Usage:
 *   bun run scripts/auto-gate-check.ts <file-path> [--tier=premium] [--event-id=<id>]
 *   bun run scripts/auto-gate-check.ts temp-descriptions/half-note-jazz.md --tier=premium
 *   bun run scripts/auto-gate-check.ts temp-descriptions/half-note-jazz.md --event-id=abc123
 *
 * Reads event context from DB when --event-id is provided.
 */

import { readFileSync } from 'fs';
import Database from 'bun:sqlite';
import { validateQualityGates, quickValidate, type QualityGateResult } from '../src/enrichment/quality-gates';
import { LAZY_ADJECTIVES, TAG_TAXONOMY, type EventForEnrichment } from '../src/enrichment/description-generator';
import { countWords } from '../src/enrichment/word-counter';

const DB_PATH = 'data/events.db';

interface CliArgs {
  filePath: string;
  tier: 'stub' | 'standard' | 'premium';
  eventId: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const tierArg = args.find(a => a.startsWith('--tier='));
  const eventIdArg = args.find(a => a.startsWith('--event-id='));

  if (!filePath) {
    console.error('Usage: bun run scripts/auto-gate-check.ts <file-path> [--tier=premium] [--event-id=<id>]');
    process.exit(1);
  }

  const tier = (tierArg?.split('=')[1] || 'standard') as CliArgs['tier'];
  if (!['stub', 'standard', 'premium'].includes(tier)) {
    console.error(`Invalid tier: ${tier}. Must be stub, standard, or premium.`);
    process.exit(1);
  }

  return {
    filePath,
    tier,
    eventId: eventIdArg?.split('=')[1] || null,
  };
}

function loadEventFromDB(eventId: string): EventForEnrichment | null {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare(`
      SELECT id, title, start_date, venue_name, type, genres, price_type, price_amount
      FROM events WHERE id = ?
    `).get(eventId) as any;
    db.close();

    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      date: row.start_date,
      time: null,
      venue: row.venue_name,
      type: row.type,
      genre: row.genres ? JSON.parse(row.genres)?.[0] : null,
      price: row.price_type,
    };
  } catch {
    return null;
  }
}

function runV4Checks(description: string): Array<{ severity: string; message: string }> {
  const issues: Array<{ severity: string; message: string }> = [];
  const lower = description.toLowerCase();

  // Check for hashtag-style tags in prose (belongs in DB field, not description)
  const hashTags = description.match(/#[A-Za-z][\w-]*/g);
  if (hashTags && hashTags.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Tags in prose: ${hashTags.join(', ')} — tags belong in the tags DB field, not description text`,
    });
  }

  // Check for "Last verified" in prose (belongs in metadata)
  if (lower.includes('last verified')) {
    issues.push({
      severity: 'warning',
      message: '"Last verified" found in description — this belongs in DB metadata, not prose',
    });
  }

  return issues;
}

function formatResult(result: QualityGateResult, v4Issues: Array<{ severity: string; message: string }>, wordCount: number): void {
  const passed = result.passed && v4Issues.filter(i => i.severity === 'error').length === 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Quality Gate Result: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Score: ${result.score}/100`);
  console.log(`  Words: ${wordCount}`);
  console.log(`${'='.repeat(60)}`);

  // Layer scores
  console.log(`\n  Layer Scores:`);
  console.log(`    Schema:      ${result.layer_scores.schema}/25`);
  console.log(`    5-Question:  ${result.layer_scores.five_question}/40`);
  console.log(`    Resonance:   ${result.layer_scores.resonance}/35`);

  // Issues by severity
  const allIssues = [
    ...result.issues.map(i => ({ severity: i.severity, message: `[${i.code}] ${i.message}` })),
    ...v4Issues,
  ];

  const errors = allIssues.filter(i => i.severity === 'error');
  const warnings = allIssues.filter(i => i.severity === 'warning');
  const infos = allIssues.filter(i => i.severity === 'info');

  if (errors.length > 0) {
    console.log(`\n  ERRORS (${errors.length}):`);
    for (const e of errors) console.log(`    x ${e.message}`);
  }

  if (warnings.length > 0) {
    console.log(`\n  WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`    ! ${w.message}`);
  }

  if (infos.length > 0) {
    console.log(`\n  INFO (${infos.length}):`);
    for (const i of infos) console.log(`    - ${i.message}`);
  }

  if (allIssues.length === 0) {
    console.log('\n  No issues found.');
  }

  console.log('');
}

function main(): void {
  const args = parseArgs();

  // Read description file
  let description: string;
  try {
    description = readFileSync(args.filePath, 'utf-8');
  } catch {
    console.error(`Cannot read file: ${args.filePath}`);
    process.exit(1);
  }

  const wordResult = countWords(description);
  console.log(`\nChecking: ${args.filePath}`);
  console.log(`Tier: ${args.tier} | Words: ${wordResult.count}`);

  // Build event context
  let event: EventForEnrichment;
  if (args.eventId) {
    const dbEvent = loadEventFromDB(args.eventId);
    if (dbEvent) {
      event = dbEvent;
      console.log(`Event: ${event.title} @ ${event.venue}`);
    } else {
      console.log(`Event ${args.eventId} not found in DB, using filename as context`);
      event = {
        id: args.eventId,
        title: args.filePath.replace(/.*\//, '').replace('.md', ''),
        date: '2026-01-01',
        time: null,
        venue: null,
        type: null,
        genre: null,
        price: null,
      };
    }
  } else {
    // Extract context from filename
    const basename = args.filePath.replace(/.*\//, '').replace('.md', '');
    event = {
      id: basename,
      title: basename.replace(/-/g, ' '),
      date: '2026-01-01',
      time: null,
      venue: null,
      type: null,
      genre: null,
      price: null,
    };
  }

  // Run quality gates
  const result = validateQualityGates(event, description, args.tier);

  // Run additional v4 checks
  const v4Issues = runV4Checks(description);

  // Format and display
  formatResult(result, v4Issues, wordResult.count);

  // Exit code
  const passed = result.passed && v4Issues.filter(i => i.severity === 'error').length === 0;
  process.exit(passed ? 0 : 1);
}

main();
