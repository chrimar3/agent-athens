#!/usr/bin/env bun
/**
 * Enrichment Pipeline Runner
 *
 * The main orchestration script for the AI enrichment pipeline.
 * Integrates priority queue, prompt generation, and quality gates.
 *
 * Usage:
 *   bun run scripts/run-enrichment-pipeline.ts                  # Show status
 *   bun run scripts/run-enrichment-pipeline.ts --sync           # Sync queue from events
 *   bun run scripts/run-enrichment-pipeline.ts --prompts        # Generate prompts for top priority
 *   bun run scripts/run-enrichment-pipeline.ts --prompts --count=5
 *   bun run scripts/run-enrichment-pipeline.ts --prompts --tier=premium
 *   bun run scripts/run-enrichment-pipeline.ts --validate --id=<id>
 *   bun run scripts/run-enrichment-pipeline.ts --save --id=<id>
 *
 * @see src/enrichment/priority-queue-manager.ts
 * @see src/enrichment/quality-gates.ts
 * @see docs/MASTER-ENRICHMENT-TEMPLATE.md
 */

import Database from 'bun:sqlite';
import { existsSync } from 'fs';
import { filterEntityTags, loadDefaultExclusionSet } from '../src/utils/tag-filter';
import {
  syncQueueFromEvents,
  getNextBatch,
  markInProgress,
  markCompleted,
  markFailed,
  getQueueStats,
  getTopPriority,
  type EventWithPriority,
} from '../src/enrichment/priority-queue-manager';
import {
  buildPrompt,
  buildPremiumPrompt,
  validateDescription,
  cleanDescription,
  extractTags,
  determineEnrichmentTier,
  type EventForEnrichment,
} from '../src/enrichment/description-generator';
import {
  validateQualityGates,
  quickValidate,
  generateSchemaOrg,
} from '../src/enrichment/quality-gates';

// ============================================================================
// Constants
// ============================================================================

const DB_PATH = 'data/events.db';

// Rule 5: every failure path exits 1 with ONE stderr line the retrier can act on.
function fail(what: string, tryNext: string): never {
  console.error(`run-enrichment-pipeline: FAILED — ${what} — try: ${tryNext}`);
  process.exit(1);
}

// ============================================================================
// Database
// ============================================================================

function openDatabase(): Database {
  // bun:sqlite would CREATE an empty events.db here instead of failing (the
  // 2026-06-30 empty-DB incident class), so existence is checked first.
  if (!existsSync(DB_PATH)) {
    fail(`database not found at ${DB_PATH} (cwd: ${process.cwd()})`, 'run from the repo root, where data/events.db lives');
  }
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

// ============================================================================
// Display Functions
// ============================================================================

function showStatus(db: Database): void {
  const stats = getQueueStats(db);

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  🎭 Agent Athens - Enrichment Pipeline                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Queue Statistics:');
  console.log('─'.repeat(50));
  console.log(`   Total in queue:  ${stats.total}`);
  console.log(`   Pending:         ${stats.pending}`);
  console.log(`   Completed:       ${stats.completed}`);
  console.log(`   Failed:          ${stats.failed}`);
  console.log(`   Skipped:         ${stats.skipped}`);
  console.log('');
  console.log('📦 By Tier:');
  console.log(`   Stub:            ${stats.byTier.stub}`);
  console.log(`   Standard:        ${stats.byTier.standard}`);
  console.log(`   Premium:         ${stats.byTier.premium}`);

  // Show top priority events
  const topPriority = getTopPriority(db, 5);
  if (topPriority.length > 0) {
    console.log('\n🔥 Top Priority Events:');
    console.log('─'.repeat(50));
    for (let i = 0; i < topPriority.length; i++) {
      const item = topPriority[i];
      console.log(
        `   ${i + 1}. [${item.priority_score}] ${item.tier.toUpperCase()} - ${item.event_id.slice(0, 8)}...`
      );
      console.log(`      Reason: ${item.priority_reason}`);
    }
  }

  console.log('\n💡 Commands:');
  console.log('   --sync              Sync events to queue');
  console.log('   --prompts           Generate prompts');
  console.log('   --prompts --count=N Generate N prompts');
  console.log('   --prompts --tier=X  Filter by tier (stub/standard/premium)');
  console.log('   --save --id=ID      Save description for event');
  console.log('   --validate --id=ID  Validate existing description');
}

function showSync(db: Database): void {
  console.log('\n🔄 Syncing events to enrichment queue...\n');

  const result = syncQueueFromEvents(db);

  console.log('✅ Sync complete:');
  console.log(`   Added:   ${result.added}`);
  console.log(`   Updated: ${result.updated}`);
  console.log(`   Removed: ${result.removed}`);

  // Show updated stats
  const stats = getQueueStats(db);
  console.log(`\n📊 Queue now has ${stats.pending} pending events`);
}

function showPrompts(
  db: Database,
  count: number,
  tierFilter?: 'stub' | 'standard' | 'premium'
): void {
  const batch = getNextBatch(db, { limit: count, tier: tierFilter });

  if (batch.length === 0) {
    console.log('\n✅ No events pending enrichment!');
    if (tierFilter) {
      console.log(`   (Filtered by tier: ${tierFilter})`);
    }
    return;
  }

  console.log(`\n📝 Generating ${batch.length} prompts...\n`);
  console.log('═'.repeat(70));
  console.log('Copy each prompt into Claude Code and save the response.');
  console.log('Then use: bun run scripts/run-enrichment-pipeline.ts --save --id=<ID>');
  console.log('═'.repeat(70));

  for (let i = 0; i < batch.length; i++) {
    const event = batch[i];
    const tier = event.tier || determineEnrichmentTier(event);

    // Use appropriate prompt based on tier
    const prompt = tier === 'premium' ? buildPremiumPrompt(event) : buildPrompt(event);

    console.log('\n' + '═'.repeat(70));
    console.log(`EVENT ${i + 1}/${batch.length}: ${event.title}`);
    console.log(`ID: ${event.id}`);
    console.log(`Priority: ${event.priority_score} (${event.priority_reason})`);
    console.log(`Tier: ${tier.toUpperCase()}`);
    console.log(`Date: ${event.date} | Venue: ${event.venue}`);
    console.log('═'.repeat(70));
    console.log('\n--- PROMPT (copy below) ---\n');
    console.log(prompt);
    console.log('\n--- END PROMPT ---\n');

    // Mark as in progress
    markInProgress(db, event.id);
  }

  console.log('═'.repeat(70));
  console.log('\n📋 Instructions:');
  console.log('1. Copy each prompt into Claude Code');
  console.log('2. Generate the description');
  console.log('3. Save using: bun run scripts/run-enrichment-pipeline.ts --save --id=<ID>');
  console.log('   Then paste the description');
}

async function saveDescription(db: Database, eventId: string): Promise<void> {
  // Get event from queue
  const events = getNextBatch(db, { limit: 100 });
  const event = events.find(e => e.id === eventId);

  if (!event) {
    // Try to get from completed/failed
    const eventFromDb = db
      .prepare(
        `
      SELECT id, title, start_date as date, venue_name as venue, genres as genre, type
      FROM events WHERE id = ?
    `
      )
      .get(eventId) as EventForEnrichment | undefined;

    if (!eventFromDb) {
      console.error(`\n❌ Event not found: ${eventId}`);
      return;
    }

    console.log(`\n📝 Saving description for: ${eventFromDb.title}`);
  } else {
    console.log(`\n📝 Saving description for: ${event.title}`);
  }

  console.log('   Paste the description below, then press Ctrl+D:\n');

  // Read from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }

  const rawDescription = Buffer.concat(chunks).toString('utf-8');
  const description = cleanDescription(rawDescription);

  if (!description || description.length < 50) {
    console.error('\n❌ Description too short or empty');
    markFailed(db, eventId, 'Description too short');
    return;
  }

  // Get event for validation
  const eventForValidation =
    event ||
    (db
      .prepare(
        `
    SELECT id, title, start_date as date, venue_name as venue, genres as genre, type
    FROM events WHERE id = ?
  `
      )
      .get(eventId) as EventForEnrichment);

  const tier = determineEnrichmentTier(eventForValidation);

  // Run quality gates
  console.log('\n🔍 Running quality gates...\n');

  const qgResult = validateQualityGates(eventForValidation, description, tier);

  console.log(`   Score: ${qgResult.score}/100`);
  console.log(`   Schema Layer: ${qgResult.layer_scores.schema}/25`);
  console.log(`   5-Question: ${qgResult.layer_scores.five_question}/40`);
  console.log(`   Resonance: ${qgResult.layer_scores.resonance}/35`);

  if (qgResult.issues.length > 0) {
    console.log('\n   Issues found:');
    for (const issue of qgResult.issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`   ${icon} [${issue.layer}] ${issue.message}`);
    }
  }

  // Save even if there are warnings
  if (!qgResult.passed && qgResult.issues.some(i => i.severity === 'error')) {
    const proceed = await askConfirmation('   Save anyway? (errors found) [y/N]: ');
    if (!proceed) {
      console.log('   ❌ Cancelled');
      markFailed(db, eventId, 'Quality gate errors');
      return;
    }
  }

  // Extract tags if present, then drop entity-name leaks (S2 taxonomy hygiene)
  const tags = filterEntityTags(extractTags(description), loadDefaultExclusionSet());

  // Save to database
  const now = new Date().toISOString();

  db.prepare(
    `
    UPDATE events
    SET full_description = ?,
        tags = ?,
        enrichment_tier = ?,
        schema_valid = ?,
        needs_enrichment = 0,
        enriched_at = ?,
        updated_at = ?
    WHERE id = ?
  `
  ).run(
    description,
    tags.length > 0 ? JSON.stringify(tags) : null,
    tier,
    qgResult.layer_scores.schema >= 20 ? 1 : 0,
    now,
    now,
    eventId
  );

  // Update queue
  markCompleted(
    db,
    eventId,
    qgResult.score,
    qgResult.issues.map(i => i.message)
  );

  console.log(`\n✅ Description saved!`);
  console.log(`   Quality score: ${qgResult.score}`);
  console.log(`   Tier: ${tier}`);
  if (tags.length > 0) {
    console.log(`   Tags: ${tags.join(', ')}`);
  }
}

function validateEvent(db: Database, eventId: string): void {
  const event = db
    .prepare(
      `
    SELECT
      id, title, start_date as date, venue_name as venue,
      genres as genre, type, price_type as price,
      full_description, enrichment_tier
    FROM events WHERE id = ?
  `
    )
    .get(eventId) as (EventForEnrichment & { full_description: string; enrichment_tier: string }) | undefined;

  if (!event) {
    console.error(`\n❌ Event not found: ${eventId}`);
    return;
  }

  if (!event.full_description) {
    console.error(`\n❌ Event has no description: ${event.title}`);
    return;
  }

  console.log(`\n🔍 Validating: ${event.title}\n`);

  const tier = (event.enrichment_tier || determineEnrichmentTier(event)) as
    | 'stub'
    | 'standard'
    | 'premium';
  const schemaOrg = generateSchemaOrg(event);
  const qgResult = validateQualityGates(event, event.full_description, tier, schemaOrg);

  console.log('📊 Quality Gate Results:');
  console.log('─'.repeat(50));
  console.log(`   Overall Score: ${qgResult.score}/100 ${qgResult.passed ? '✅' : '❌'}`);
  console.log(`   Schema Layer:  ${qgResult.layer_scores.schema}/25`);
  console.log(`   5-Question:    ${qgResult.layer_scores.five_question}/40`);
  console.log(`   Resonance:     ${qgResult.layer_scores.resonance}/35`);

  if (qgResult.issues.length > 0) {
    console.log('\n📋 Issues:');
    const errors = qgResult.issues.filter(i => i.severity === 'error');
    const warnings = qgResult.issues.filter(i => i.severity === 'warning');
    const info = qgResult.issues.filter(i => i.severity === 'info');

    if (errors.length > 0) {
      console.log('\n   ❌ Errors:');
      for (const issue of errors) {
        console.log(`      [${issue.layer}] ${issue.message}`);
      }
    }

    if (warnings.length > 0) {
      console.log('\n   ⚠️  Warnings:');
      for (const issue of warnings) {
        console.log(`      [${issue.layer}] ${issue.message}`);
      }
    }

    if (info.length > 0) {
      console.log('\n   ℹ️  Info:');
      for (const issue of info) {
        console.log(`      [${issue.layer}] ${issue.message}`);
      }
    }
  } else {
    console.log('\n   ✨ No issues found!');
  }

  // Show Schema.org JSON
  console.log('\n📄 Schema.org JSON-LD:');
  console.log('─'.repeat(50));
  console.log(JSON.stringify(schemaOrg, null, 2));
}

// ============================================================================
// Helpers
// ============================================================================

async function askConfirmation(prompt: string): Promise<boolean> {
  process.stdout.write(prompt);
  const response = await new Promise<string>(resolve => {
    let data = '';
    process.stdin.on('data', chunk => {
      data += chunk;
      if (data.includes('\n')) {
        resolve(data.trim());
      }
    });
  });
  return response.toLowerCase() === 'y';
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const syncMode = args.includes('--sync');
  const promptsMode = args.includes('--prompts');
  const saveMode = args.includes('--save');
  const validateMode = args.includes('--validate');

  // A mistyped FLAG NAME must fail like a mistyped value: `--count-10` or
  // `--dry_run` silently fell through to the defaults. Validated before the DB
  // is opened. --stats is the documented alias of the default listing.
  const KNOWN_FLAGS = ['--sync', '--prompts', '--save', '--validate', '--stats'];
  const unknownArgs = args.filter((a) => !KNOWN_FLAGS.includes(a) && !/^--(count|tier|id)=/.test(a));
  if (unknownArgs.length > 0) {
    fail(`unknown argument(s): ${unknownArgs.join(' ')}`, '--sync | --prompts [--count=N] [--tier=stub|standard|premium] | --save --id=ID | --validate --id=ID | --stats');
  }

  // parseInt() stops at the first non-digit ('5junk' -> 5, '1.5' -> 1), so the
  // raw value must be digits-only: a typo has to fail, not silently change how
  // many events are batched.
  const countArg = args.find(a => a.startsWith('--count='));
  const countRaw = countArg ? countArg.slice('--count='.length) : null;
  const count = countRaw === null ? 5 : /^\d+$/.test(countRaw) ? parseInt(countRaw, 10) : NaN;
  if (!Number.isInteger(count) || count <= 0) {
    fail(`invalid ${countArg} (expected a positive integer)`, '--count=5');
  }

  const tierArg = args.find(a => a.startsWith('--tier='));
  const tierFilter = tierArg
    ? (tierArg.split('=')[1] as 'stub' | 'standard' | 'premium')
    : undefined;

  const idArg = args.find(a => a.startsWith('--id='));
  const eventId = idArg ? idArg.split('=')[1] : null;

  if (tierArg && !['stub', 'standard', 'premium'].includes(tierFilter as string)) {
    fail(`invalid ${tierArg}`, '--tier=stub, --tier=standard or --tier=premium');
  }
  if ((saveMode || validateMode) && !eventId) {
    fail(`${saveMode ? '--save' : '--validate'} requires --id=<event-id>`, 'bun run scripts/run-enrichment-pipeline.ts --prompts to list ids, then add --id=<id>');
  }

  const db = openDatabase();

  try {
    if (syncMode) {
      showSync(db);
      return;
    }

    if (saveMode && eventId) {
      await saveDescription(db, eventId);
      return;
    }

    if (validateMode && eventId) {
      validateEvent(db, eventId);
      return;
    }

    if (promptsMode) {
      showPrompts(db, count, tierFilter);
      return;
    }

    // Default: show status
    showStatus(db);
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err), 'rerun with --sync to check the DB is readable; the message above names the failing step');
});
