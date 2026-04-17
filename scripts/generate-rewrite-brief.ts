#!/usr/bin/env bun
/**
 * Generate Rewrite Brief
 *
 * Generates targeted rewrite briefs for events whose descriptions fail quality gates.
 * Unlike generate-enrichment-brief.ts (new descriptions), this targets existing descriptions
 * that need fixes for specific gate violations.
 *
 * Usage:
 *   bun run scripts/generate-rewrite-brief.ts --ids=id1,id2,id3 --count=5
 *   bun run scripts/generate-rewrite-brief.ts --ids-from=/tmp/rewrite-ids.txt --count=5 --batches=3
 *
 * Output:
 *   temp-briefs/rewrite-NNN.md              (the brief for the subagent)
 *   temp-briefs/rewrite-NNN.manifest.json   (manifest for save-batch)
 *
 * @see scripts/generate-enrichment-brief.ts (shared infrastructure)
 * @see scripts/retroactive-gate-sweep.ts (identifies failing descriptions)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import Database from 'bun:sqlite';
import { classifyEvent, getWordTarget, structureToTier } from '../src/enrichment/enrichment-matrix';
import {
  lookupVenueIntel,
  lookupEntityKnowledge,
  selectExemplars,
  loadEntityLocking,
} from './generate-enrichment-brief';
import {
  validateEnglishDescription,
  detectGenericContent,
} from '../src/enrichment/quality-gates';
import type { EventForEnrichment } from '../src/enrichment/description-generator';

const DB_PATH = 'data/events.db';
const BRIEFS_DIR = 'temp-briefs';
const ANTI_PATTERNS_PATH = 'docs/enrichment-anti-patterns.md';

// ============================================================================
// Types
// ============================================================================

interface RewriteEvent {
  id: string;
  title: string;
  type: string;
  venue_name: string | null;
  price_type: string | null;
  start_date: string;
  end_date: string | null;
  time_doors: string | null;
  url: string | null;
  source: string | null;
  full_description_en: string;
  enrichment_tier: string | null;
  price_advance: number | null;
  price_door: number | null;
}

interface GateFailure {
  code: string;
  severity: string;
  message: string;
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): { ids: string[]; count: number; batches: number } {
  const args = process.argv.slice(2);

  // --ids=id1,id2,id3
  const idsArg = args.find(a => a.startsWith('--ids='));
  // --ids-from=/path/to/file.txt
  const idsFromArg = args.find(a => a.startsWith('--ids-from='));
  const countArg = args.find(a => a.startsWith('--count='));
  const batchesArg = args.find(a => a.startsWith('--batches='));

  let ids: string[] = [];
  if (idsArg) {
    ids = idsArg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
  } else if (idsFromArg) {
    const filePath = idsFromArg.split('=')[1];
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    ids = readFileSync(filePath, 'utf-8')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
  }

  const count = parseInt(countArg?.split('=')[1] || '5', 10);
  const batches = parseInt(batchesArg?.split('=')[1] || '1', 10);

  if (ids.length === 0) {
    console.error('No IDs provided. Use --ids=id1,id2 or --ids-from=/path/to/file.txt');
    console.error('Generate IDs with: bun run scripts/retroactive-gate-sweep.ts');
    process.exit(1);
  }

  return { ids, count, batches };
}

// ============================================================================
// Gate Failure Detection
// ============================================================================

function getGateFailures(event: RewriteEvent): GateFailure[] {
  const eventForGate: EventForEnrichment = {
    id: event.id,
    title: event.title,
    date: event.start_date,
    time: event.time_doors,
    venue: event.venue_name,
    type: event.type,
    genre: null,
    price: event.price_type,
    price_advance: event.price_advance,
    price_door: event.price_door,
  };

  const tier = (event.enrichment_tier as 'stub' | 'standard' | 'premium') || 'standard';

  const enResult = validateEnglishDescription(eventForGate, event.full_description_en, tier);
  const genericIssues = detectGenericContent(
    event.full_description_en,
    { title: event.title, venue: event.venue_name, type: event.type },
    tier
  );

  // Deduplicate issues by code (LAZY_ADJECTIVES checked in both validators)
  const mergedIssues = [...enResult.issues];
  for (const gi of genericIssues) {
    if (!mergedIssues.some(i => i.code === gi.code)) {
      mergedIssues.push(gi);
    }
  }
  return mergedIssues
    .filter(i => i.severity === 'error')
    .map(i => ({ code: i.code, severity: i.severity, message: i.message }));
}

// ============================================================================
// Brief Building
// ============================================================================

function buildRewriteBrief(
  events: RewriteEvent[],
  failures: Map<string, GateFailure[]>,
  venueIntel: Map<string, string | null>,
  entityKnowledge: Map<string, { name: string; entity_type: string; bio: string | null; genre: string | null }[]>,
  exemplarPaths: string[],
  batchNumber: number,
): string {
  const lines: string[] = [];
  const batchDir = `temp-descriptions/rewrite-${batchNumber}`;

  lines.push(`# Rewrite Brief — Batch R${batchNumber}`);
  lines.push('');

  lines.push('## VERIFICATION CHECKLIST');
  lines.push(`- This is Rewrite Batch R${batchNumber}`);
  lines.push(`- Event IDs: ${events.map(e => e.id).join(', ')}`);
  lines.push(`- Write descriptions to: ${batchDir}/`);
  lines.push('- BEFORE writing any file, verify the event ID appears in this list');
  lines.push(`- DO NOT omit --batch-dir= from write commands.`);
  lines.push('');

  lines.push('You are REWRITING event descriptions that failed quality gates for Agent Athens.');
  lines.push('Each event below has an existing description with specific issues flagged.');
  lines.push('');

  // Condensed rules (same as enrichment brief)
  lines.push('## Rules');
  lines.push('');
  lines.push('1. **8-section structure** (for 400+ word events): Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer. See Rule 10 for shorter targets.');
  lines.push('2. **Voice**: Second person ("you"), present tense, sensory-first.');
  lines.push('3. **Word count**: Per-event target shown below. Hard constraints.');
  lines.push('4. **Show don\'t tell**: No lazy adjectives — legendary, immersive, iconic, captivating, mesmerizing, breathtaking, enchanting, amazing, incredible, fantastic, wonderful, stunning, vibrant, extraordinary, exceptional, world-class, phenomenal, remarkable');
  lines.push('5. **No speculation**: Never write "likely", "perhaps", "probably", "promises to", "the show will". State only verified facts.');
  lines.push('6. **CRITICAL: Do not fabricate information.**');
  lines.push('7. **Terminology**: Use "open" not "free". Latin transliteration for Greek names in prose.');
  lines.push('8. **Description only**: No tags, no metadata beyond Aspect/Details table.');
  lines.push('9. **POST-WRITE WORD CHECK**: If over the target max, cut whole paragraphs — do not trim individual words from multiple paragraphs.');
  lines.push('10. **STRUCTURE BY WORD BUDGET**: ≤200w → three-part block. 201-400w → hybrid. 400+w → full 8-section. Overrides Rule 1 for shorter targets.');
  lines.push('11. **NAMED ENTITY ANCHORING**: Title/artist/performer name must appear beyond the opening paragraph.');
  lines.push('12. **GIVEN DATA BEFORE ATMOSPHERE**: Exhaust verified facts before adding sensory color. If word budget is tight, facts win.');
  lines.push('13. **TIMELINESS SIGNAL**: Every description must answer "why now?" — verifiable fact, contextual frame, or temporal anchor. Do not remove existing timeliness hooks unless factually wrong.');
  lines.push('14. **VENUE-SPECIFIC INSIDER DETAIL**: Every rewrite must contain at least one concrete venue-or-event detail not derivable from structured fields (address, metro, price, capacity, event time) or venue-profile baseline. Qualifying: door timing, terrace/smoking policy, late-night atmosphere shifts, sightline notes, crowd-by-hour patterns, walking quirks. Woven into narrative prose — never a header or bullet list. Required for 201w+; attempted for ≤200w (may be omitted if topical load is heavy — log as "insider omitted: topical load"). Never fabricate: if no insider detail is verifiable, flag the gap rather than inventing one.');
  lines.push('');

  // Rewrite-specific instruction
  lines.push('## REWRITE INSTRUCTIONS');
  lines.push('');
  lines.push('For each event:');
  lines.push('- **Read the existing description** and the **gate failures** listed below');
  lines.push('- **Preserve accurate factual content** (dates, prices, venue details, verified credentials)');
  lines.push('- **Fix ALL flagged issues** — replace speculation with facts, remove lazy adjectives, fix entity locking');
  lines.push('- **Tighten anything generic** while preserving the description\'s structure and voice');
  lines.push('- **Do not introduce new speculation** to replace removed speculation — omit if you can\'t verify');
  lines.push('- The rewritten description MUST pass all quality gates with 0 errors');
  lines.push('');

  // Exemplar references
  lines.push('## Exemplars (read for structural guidance)');
  lines.push('');
  for (const path of exemplarPaths) {
    const filename = path.split('/').pop() || path;
    lines.push(`- \`${path}\``);
  }
  lines.push('');

  // Anti-patterns reference
  lines.push('## Anti-patterns');
  lines.push('');
  lines.push(`Read \`${ANTI_PATTERNS_PATH}\` for confirmed mistakes to avoid.`);
  lines.push('');

  // Entity Locking
  lines.push('## Entity Locking (English Descriptions)');
  lines.push('');
  lines.push('These terms MUST remain untranslated in English descriptions:');
  const entityLocking = loadEntityLocking();
  if (entityLocking) {
    const ct = entityLocking.cultural_terms;
    if (ct.music_genres) lines.push(`- **Music genres**: ${ct.music_genres.join(', ')}`);
    if (ct.instruments) lines.push(`- **Instruments**: ${ct.instruments.join(', ')}`);
    if (ct.venue_types) lines.push(`- **Venue types**: ${ct.venue_types.join(', ')}`);
    if (ct.cultural_concepts) lines.push(`- **Cultural concepts**: ${ct.cultural_concepts.join(', ')}`);
  }
  lines.push('');

  // Events
  lines.push('---');
  lines.push('');
  lines.push('## Events to Rewrite');
  lines.push('');

  for (const event of events) {
    const eventFailures = failures.get(event.id) || [];
    const category = classifyEvent({ type: event.type, venue_name: event.venue_name, title: event.title });
    const target = getWordTarget({ type: event.type, venue_name: event.venue_name, title: event.title });
    const tier = structureToTier(target.structure);

    lines.push(`### ${event.title} (REWRITE)`);
    lines.push(`- **ID**: ${event.id}`);
    lines.push(`- **Type**: ${event.type}`);
    lines.push(`- **Venue**: ${event.venue_name || 'TBA'}`);
    lines.push(`- **Price**: ${event.price_type || 'tba'}`);
    lines.push(`- **Date**: ${event.start_date}${event.end_date ? ` to ${event.end_date}` : ''}`);
    if (event.time_doors) lines.push(`- **Time**: ${event.time_doors}`);
    if (event.url) lines.push(`- **URL**: ${event.url}`);
    lines.push(`- **Source**: ${event.source || 'unknown'}`);
    lines.push(`- **Category**: ${category}`);
    lines.push(`- **Target words (English)**: ${target.min}-${target.max}`);
    lines.push(`- **Structure**: ${target.structure}`);
    lines.push(`- **Tier**: ${tier}`);
    lines.push('');

    // Existing description
    lines.push('**EXISTING DESCRIPTION (fix issues below, preserve accurate facts):**');
    lines.push('');
    for (const line of event.full_description_en.split('\n')) {
      lines.push(`> ${line}`);
    }
    lines.push('');

    // Gate failures
    if (eventFailures.length > 0) {
      lines.push('**GATE FAILURES TO FIX:**');
      for (const f of eventFailures) {
        lines.push(`- \`${f.code}\`: ${f.message}`);
      }
    } else {
      lines.push('**GATE FAILURES:** None remaining (may have been fixed by gate tightening)');
    }
    lines.push('');

    lines.push('**INSTRUCTION:** Rewrite to fix ALL flagged issues. Keep accurate factual content. Must pass all gates with 0 errors.');
    lines.push('');

    // Venue intel
    const intel = venueIntel.get(event.venue_name || '');
    if (intel) {
      lines.push('**Venue intel:**');
      lines.push('```');
      for (const line of intel.split('\n').slice(0, 10)) {
        lines.push(line);
      }
      lines.push('```');
    }

    // Entity knowledge
    const entities = entityKnowledge.get(event.id) || [];
    if (entities.length > 0) {
      for (const entity of entities) {
        lines.push(`- **${entity.entity_type} intel**: ${entity.name} — ${entity.bio || 'no bio'}`);
      }
    }

    lines.push('');
  }

  // Execution instructions
  lines.push('---');
  lines.push('');
  lines.push('## Execution Instructions');
  lines.push('');
  lines.push('For EACH event:');
  lines.push('');
  lines.push('1. **Read existing description** and understand what\'s being said');
  lines.push('2. **Research**: WebSearch the event URL to verify facts. Search for any claims you\'re unsure about.');
  lines.push(`3. **Write rewritten description**: Save to \`${batchDir}/\`:`);
  lines.push('   ```bash');
  lines.push(`   bun run scripts/write-description.ts <event-id> --batch-dir=${batchDir} "<rewritten description>"`);
  lines.push('   ```');
  lines.push('4. **Gate check**: Validate:');
  lines.push('   ```bash');
  lines.push(`   bun run scripts/auto-gate-check.ts ${batchDir}/<event-id>.md --tier=<tier> --event-id=<event-id> \\`);
  lines.push('     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \\');
  lines.push('     --event-date=<date> --event-price=<price>');
  lines.push('   ```');
  lines.push('5. **Gate score must be >= 80 with 0 errors** before proceeding to next event.');
  lines.push('');

  // Per-event gate check commands
  lines.push('### Per-Event Gate Check Commands');
  lines.push('');
  for (const event of events) {
    const target = getWordTarget({ type: event.type, venue_name: event.venue_name, title: event.title });
    const tier = structureToTier(target.structure);
    lines.push('```bash');
    lines.push(`bun run scripts/auto-gate-check.ts ${batchDir}/${event.id}.md \\`);
    lines.push(`  --tier=${tier} --event-id=${event.id} \\`);
    lines.push(`  --event-type=${event.type} --event-venue="${event.venue_name || 'TBA'}" \\`);
    lines.push(`  --event-title="${event.title.replace(/"/g, '\\"')}" \\`);
    lines.push(`  --event-date=${event.start_date.slice(0, 10)} --event-price=${event.price_type || 'tba'}`);
    lines.push('```');
    lines.push('');
  }

  lines.push('### Save Command');
  lines.push('');
  lines.push('After all events pass gates:');
  lines.push('```bash');
  lines.push(`bun run scripts/save-batch.ts --manifest=temp-briefs/rewrite-${batchNumber}.manifest.json --session=rewrite-${batchNumber} --batch=R${batchNumber} --clean`);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Manifest (rewrite-specific naming)
// ============================================================================

function writeRewriteManifest(batchNumber: number, eventIds: string[]): string {
  const outputDir = `temp-descriptions/rewrite-${batchNumber}`;
  const manifest: BatchManifest = {
    batch_id: batchNumber,
    generated_at: new Date().toISOString(),
    event_ids: eventIds,
    output_dir: outputDir,
  };
  if (!existsSync(BRIEFS_DIR)) {
    mkdirSync(BRIEFS_DIR, { recursive: true });
  }
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const manifestPath = join(BRIEFS_DIR, `rewrite-${batchNumber}.manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifestPath;
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const { ids, count, batches } = parseArgs();

  console.log(`\n=== Generate Rewrite Brief ===`);
  console.log(`IDs provided: ${ids.length} | Per batch: ${count} | Batches: ${batches}\n`);

  const db = new Database(DB_PATH);

  // Fetch events by ID
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, title, type, venue_name, price_type, start_date, end_date,
           time_doors, url, source, full_description_en, enrichment_tier,
           price_advance, price_door
    FROM events
    WHERE id IN (${placeholders})
      AND full_description_en IS NOT NULL AND full_description_en <> ''
  `).all(...ids) as RewriteEvent[];

  if (rows.length === 0) {
    console.log('No matching events with descriptions found.');
    db.close();
    process.exit(0);
  }

  console.log(`Found ${rows.length} events with descriptions (of ${ids.length} requested)`);
  const missing = ids.filter(id => !rows.find(r => r.id === id));
  if (missing.length > 0) {
    console.log(`  Missing/no description: ${missing.length} IDs skipped`);
  }

  // Run gate checks to get current failures
  const failures = new Map<string, GateFailure[]>();
  let totalFailures = 0;
  for (const event of rows) {
    const eventFailures = getGateFailures(event);
    failures.set(event.id, eventFailures);
    if (eventFailures.length > 0) totalFailures++;
  }
  console.log(`Gate check: ${totalFailures} events still have errors (after gate tightening)`);

  // Filter to only events that still have failures
  const eventsToRewrite = rows.filter(r => (failures.get(r.id) || []).length > 0);
  if (eventsToRewrite.length === 0) {
    console.log('All events now pass gates after tightening — no rewrites needed!');
    db.close();
    process.exit(0);
  }

  console.log(`Events needing rewrite: ${eventsToRewrite.length}`);

  // Look up venue intel
  const venueIntel = new Map<string, string | null>();
  for (const event of eventsToRewrite) {
    if (event.venue_name && !venueIntel.has(event.venue_name)) {
      venueIntel.set(event.venue_name, lookupVenueIntel(event.venue_name));
    }
  }

  // Look up entity knowledge
  const entityKnowledge = new Map<string, { name: string; entity_type: string; bio: string | null; genre: string | null }[]>();
  for (const event of eventsToRewrite) {
    entityKnowledge.set(event.id, lookupEntityKnowledge(db, event.title));
  }

  db.close();

  // Auto-increment rewrite batch numbers from existing briefs
  let startBatch = 1;
  if (existsSync(BRIEFS_DIR)) {
    const existing = readdirSync(BRIEFS_DIR)
      .filter(f => f.match(/^rewrite-\d+\.md$/))
      .map(f => parseInt(f.match(/rewrite-(\d+)/)?.[1] || '0', 10));
    if (existing.length > 0) {
      startBatch = Math.max(...existing) + 1;
    }
  }

  // Split into batches and generate
  if (!existsSync(BRIEFS_DIR)) {
    mkdirSync(BRIEFS_DIR, { recursive: true });
  }

  const totalEvents = Math.min(eventsToRewrite.length, count * batches);
  const actualBatches = Math.ceil(totalEvents / count);

  for (let i = 0; i < actualBatches; i++) {
    const batchNumber = startBatch + i;
    const slice = eventsToRewrite.slice(i * count, (i + 1) * count);

    // Select exemplars
    const batchTypes = slice.map(e => e.type);
    const exemplarPaths = selectExemplars(batchTypes);

    // Build brief
    const brief = buildRewriteBrief(slice, failures, venueIntel, entityKnowledge, exemplarPaths, batchNumber);

    const briefPath = join(BRIEFS_DIR, `rewrite-${batchNumber}.md`);
    writeFileSync(briefPath, brief, 'utf-8');

    const manifestPath = writeRewriteManifest(batchNumber, slice.map(e => e.id));

    // Summary
    console.log(`\nRewrite Batch R${batchNumber}: ${slice.length} events`);
    for (const e of slice) {
      const ef = failures.get(e.id) || [];
      const codes = ef.map(f => f.code).join(', ');
      console.log(`  ${e.type.padEnd(12)} ${e.title.substring(0, 40).padEnd(42)} ${codes}`);
    }
    console.log(`  Written: ${briefPath}`);
    console.log(`  Manifest: ${manifestPath}`);
  }

  console.log(`\n=== Generated ${actualBatches} rewrite batch(es) ===`);
  console.log(`\nTo run rewrites:`);
  for (let i = 0; i < actualBatches; i++) {
    const bn = startBatch + i;
    console.log(`  Batch R${bn}: spawn subagent with temp-briefs/rewrite-${bn}.md`);
  }
  console.log(`\nTo save:`);
  for (let i = 0; i < actualBatches; i++) {
    const bn = startBatch + i;
    console.log(`  bun run scripts/save-batch.ts --manifest=temp-briefs/rewrite-${bn}.manifest.json --session=rewrite-${bn} --batch=R${bn} --clean`);
  }
  console.log('');
}

main();
