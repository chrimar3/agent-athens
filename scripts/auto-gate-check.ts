#!/usr/bin/env bun
/**
 * Auto Gate Checker CLI
 *
 * Validates a description file against quality gates. Wraps the existing
 * quality-gates.ts validation system for standalone CLI use.
 *
 * Event context priority: CLI flags > DB lookup > filename fallback.
 * CLI flags allow this to work in sandboxed environments without DB access.
 *
 * Usage:
 *   bun run scripts/auto-gate-check.ts <file-path> [--tier=premium] [--event-id=<id>]
 *   bun run scripts/auto-gate-check.ts temp-descriptions/half-note-jazz.md --tier=premium
 *   bun run scripts/auto-gate-check.ts temp-descriptions/half-note-jazz.md --event-id=abc123
 *
 * With CLI metadata flags (no DB needed):
 *   bun run scripts/auto-gate-check.ts temp-descriptions/batch-121/abc123.md \
 *     --tier=standard --event-id=abc123 --event-type=concert \
 *     --event-venue="Half Note" --event-title="Jazz Night" \
 *     --event-date=2026-03-02 --event-price=with-ticket
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
  eventType: string | null;
  eventVenue: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  eventPrice: string | null;
  eventGenre: string | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const tierArg = args.find(a => a.startsWith('--tier='));
  const eventIdArg = args.find(a => a.startsWith('--event-id='));
  const eventTypeArg = args.find(a => a.startsWith('--event-type='));
  const eventVenueArg = args.find(a => a.startsWith('--event-venue='));
  const eventTitleArg = args.find(a => a.startsWith('--event-title='));
  const eventDateArg = args.find(a => a.startsWith('--event-date='));
  const eventPriceArg = args.find(a => a.startsWith('--event-price='));
  const eventGenreArg = args.find(a => a.startsWith('--event-genre='));

  if (!filePath) {
    console.error('Usage: bun run scripts/auto-gate-check.ts <file-path> [--tier=premium] [--event-id=<id>]');
    console.error('       [--event-type=concert] [--event-venue="Half Note"] [--event-title="Jazz Night"]');
    console.error('       [--event-date=2026-03-02] [--event-price=with-ticket] [--event-genre=jazz]');
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
    eventType: eventTypeArg?.split('=')[1] || null,
    eventVenue: eventVenueArg?.split('=')[1] || null,
    eventTitle: eventTitleArg?.split('=')[1] || null,
    eventDate: eventDateArg?.split('=')[1] || null,
    eventPrice: eventPriceArg?.split('=')[1] || null,
    eventGenre: eventGenreArg?.split('=')[1] || null,
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
    // DB unavailable (sandbox, missing file, etc.) — caller will use CLI flags
    return null;
  }
}

/**
 * Build event context from CLI flags, DB lookup, or filename fallback.
 * Priority: CLI flags > DB lookup > filename extraction.
 */
function buildEventContext(args: CliArgs): EventForEnrichment {
  const basename = args.filePath.replace(/.*\//, '').replace('.md', '');

  // Priority 1: CLI flags (always available, even in sandbox)
  if (args.eventType || args.eventVenue || args.eventTitle) {
    const event: EventForEnrichment = {
      id: args.eventId || basename,
      title: args.eventTitle || basename.replace(/-/g, ' '),
      date: args.eventDate || '2026-01-01',
      time: null,
      venue: args.eventVenue || null,
      type: args.eventType || null,
      genre: args.eventGenre || null,
      price: args.eventPrice || null,
    };
    console.log(`Event (from CLI flags): ${event.title} @ ${event.venue}`);
    return event;
  }

  // Priority 2: DB lookup (works outside sandbox)
  if (args.eventId) {
    const dbEvent = loadEventFromDB(args.eventId);
    if (dbEvent) {
      console.log(`Event (from DB): ${dbEvent.title} @ ${dbEvent.venue}`);
      return dbEvent;
    }
    console.log(`Event ${args.eventId} not found in DB, using filename as context`);
  }

  // Priority 3: Filename fallback
  return {
    id: args.eventId || basename,
    title: basename.replace(/-/g, ' '),
    date: '2026-01-01',
    time: null,
    venue: null,
    type: null,
    genre: null,
    price: null,
  };
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

  // Build event context (CLI flags > DB > filename fallback)
  const event = buildEventContext(args);

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
