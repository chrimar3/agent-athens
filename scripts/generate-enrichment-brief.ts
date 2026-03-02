#!/usr/bin/env bun
/**
 * Generate Enrichment Brief
 *
 * Selects a diverse batch of unenriched events, assembles venue/entity context,
 * and produces a self-contained markdown brief for subagent consumption.
 *
 * Usage:
 *   bun run scripts/generate-enrichment-brief.ts --count=5
 *   bun run scripts/generate-enrichment-brief.ts --count=5 --batch=3
 *   bun run scripts/generate-enrichment-brief.ts --count=5 --batches=3
 *
 * Output:
 *   temp-briefs/batch-NNN.md              (the brief for the subagent)
 *   temp-briefs/batch-NNN.manifest.json   (manifest of event IDs for save-batch)
 *   stdout: summary of what was selected
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import Database from 'bun:sqlite';
import { classifyEvent, getWordTarget, structureToTier } from '../src/enrichment/enrichment-matrix';

const DB_PATH = 'data/events.db';
const VENUE_INTEL_PATH = 'config/venue-intelligence.md';
const EXEMPLARS_DIR = 'exemplars';
const ANTI_PATTERNS_PATH = 'docs/enrichment-anti-patterns.md';
const TEMPLATE_PATH = 'docs/MASTER-ENRICHMENT-TEMPLATE.md';
const BRIEFS_DIR = 'temp-briefs';
const MAX_VENUE_INTEL_WORDS = 200;
const MAX_TOKENS = 4000;
const DEFAULT_MAX_PER_TYPE = 2;

// ============================================================================
// Types
// ============================================================================

interface EventRecord {
  id: string;
  title: string;
  type: string;
  venue_name: string | null;
  price_type: string | null;
  start_date: string;
  end_date: string | null;
  time_doors: string | null;
  url: string | null;
  description: string | null;
  source: string | null;
}

interface EntityKnowledge {
  name: string;
  entity_type: string;
  bio: string | null;
  genre: string | null;
}

// ============================================================================
// Manifest & Recent Openings
// ============================================================================

export interface BatchManifest {
  batch_id: number;
  generated_at: string;
  event_ids: string[];
}

export function writeManifest(batchNumber: number, eventIds: string[]): string {
  const manifest: BatchManifest = {
    batch_id: batchNumber,
    generated_at: new Date().toISOString(),
    event_ids: eventIds,
  };
  if (!existsSync(BRIEFS_DIR)) {
    mkdirSync(BRIEFS_DIR, { recursive: true });
  }
  const manifestPath = join(BRIEFS_DIR, `batch-${batchNumber}.manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifestPath;
}

const RECENT_OPENINGS_PATH = 'temp-descriptions/recent-openings.json';

export interface RecentOpening {
  event_id: string;
  opening_sentence: string;
  saved_at: string;
}

export function loadRecentOpenings(): RecentOpening[] {
  if (!existsSync(RECENT_OPENINGS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(RECENT_OPENINGS_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

// ============================================================================
// CLI
// ============================================================================

export function parseArgs(): { count: number; batches: number; startBatch: number } {
  const args = process.argv.slice(2);
  const countArg = args.find(a => a.startsWith('--count='));
  const batchArg = args.find(a => a.startsWith('--batch='));
  const batchesArg = args.find(a => a.startsWith('--batches='));

  const count = parseInt(countArg?.split('=')[1] || '5', 10);
  const batches = parseInt(batchesArg?.split('=')[1] || '1', 10);

  // Auto-increment batch number from existing briefs
  let startBatch = 1;
  if (batchArg) {
    startBatch = parseInt(batchArg.split('=')[1], 10);
  } else if (existsSync(BRIEFS_DIR)) {
    const existing = readdirSync(BRIEFS_DIR)
      .filter(f => f.match(/^batch-\d+\.md$/))
      .map(f => parseInt(f.match(/batch-(\d+)/)?.[1] || '0', 10));
    if (existing.length > 0) {
      startBatch = Math.max(...existing) + 1;
    }
  }

  return { count, batches, startBatch };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Select a diverse batch of unenriched events.
 * Round-robin across types, max MAX_PER_TYPE per type, soonest first within type.
 * Exhibition-safe: uses end_date for exhibitions (TIER 1 rule).
 */
// Multi-hall venues that legitimately host different events on the same day.
// These are excluded from the enriched-sibling filter to avoid over-filtering.
const MULTI_HALL_VENUES = new Set([
  'μέγαρο μουσικής αθηνών',
  'megaron athens concert hall',
  'megaron mousikis',
  'τεχνόπολη δήμου αθηναίων',
  'technopolis city of athens',
  'onassis stegi',
  'στέγη ιδρύματος ωνάση',
]);

export function selectDiverseBatch(db: Database, count: number, maxPerType: number = DEFAULT_MAX_PER_TYPE): EventRecord[] {
  if (count <= 0) return [];

  // Build a set of already-enriched (venue, date) combos to skip cross-source duplicates.
  // If venue+date already has an enriched event, skip the unenriched sibling.
  const enrichedCombos = new Set<string>();
  const enrichedRows = db.prepare(`
    SELECT LOWER(TRIM(venue_name)) as venue, SUBSTR(start_date,1,10) as date
    FROM events
    WHERE full_description IS NOT NULL AND full_description <> ''
      AND location_status IN ('verified_athens', 'pass_through')
  `).all() as { venue: string; date: string }[];
  for (const r of enrichedRows) {
    enrichedCombos.add(`${r.venue}|${r.date}`);
  }

  // Query all eligible events grouped by type, soonest first
  const rows = db.prepare(`
    SELECT id, title, type, venue_name, price_type, start_date, end_date,
           time_doors, url, description, source
    FROM events
    WHERE (full_description IS NULL OR full_description = '')
      AND needs_enrichment = 1
      AND location_status IN ('verified_athens', 'pass_through')
      AND date(COALESCE(
        CASE WHEN type='exhibition' THEN end_date ELSE NULL END,
        start_date
      )) >= date('now')
    ORDER BY type, start_date ASC
  `).all() as EventRecord[];

  if (rows.length === 0) return [];

  // Filter out events that already have an enriched sibling at same venue+date.
  // Skips multi-hall venues where different events legitimately share a date.
  const filtered = rows.filter(row => {
    const venue = (row.venue_name || '').toLowerCase().trim();
    if (MULTI_HALL_VENUES.has(venue)) return true;
    const key = `${venue}|${row.start_date.slice(0, 10)}`;
    return !enrichedCombos.has(key);
  });

  if (filtered.length === 0) return [];

  // Group by type
  const byType = new Map<string, EventRecord[]>();
  for (const row of filtered) {
    const existing = byType.get(row.type) || [];
    existing.push(row);
    byType.set(row.type, existing);
  }

  // Round-robin selection: pick 1 from each type, then 2nd from each, until we have enough
  const selected: EventRecord[] = [];
  const typePointers = new Map<string, number>();
  const typeCounts = new Map<string, number>();

  for (const type of byType.keys()) {
    typePointers.set(type, 0);
    typeCounts.set(type, 0);
  }

  // Sort types by count descending so we pick from the biggest pools first
  const sortedTypes = [...byType.keys()].sort(
    (a, b) => (byType.get(b)?.length || 0) - (byType.get(a)?.length || 0)
  );

  let round = 0;
  while (selected.length < count) {
    let addedThisRound = false;

    for (const type of sortedTypes) {
      if (selected.length >= count) break;

      const typeCount = typeCounts.get(type) || 0;
      if (typeCount >= maxPerType) continue;

      const events = byType.get(type) || [];
      const pointer = typePointers.get(type) || 0;

      if (pointer < events.length) {
        selected.push(events[pointer]);
        typePointers.set(type, pointer + 1);
        typeCounts.set(type, typeCount + 1);
        addedThisRound = true;
      }
    }

    if (!addedThisRound) break; // No more events to pick from
    round++;
    if (round > 100) break; // Safety valve
  }

  return selected;
}

/**
 * Look up venue intelligence from config/venue-intelligence.md.
 * Parses ### VenueName headers to find matching sections.
 * Returns null if venue not found, truncated to MAX_VENUE_INTEL_WORDS.
 */
export function lookupVenueIntel(venueName: string | null): string | null {
  if (!venueName) return null;
  if (!existsSync(VENUE_INTEL_PATH)) return null;

  const content = readFileSync(VENUE_INTEL_PATH, 'utf-8');
  const sections = content.split(/^### /m);

  // Normalize venue name for matching
  const normalizedVenue = venueName.toLowerCase().replace(/[^\w\sα-ωά-ώ]/gi, '').trim();

  for (const section of sections) {
    const headerLine = section.split('\n')[0].trim();
    const normalizedHeader = headerLine.toLowerCase().replace(/[^\w\sα-ωά-ώ]/gi, '').trim();

    // Check if venue name matches header (or header contains venue name)
    if (normalizedHeader.includes(normalizedVenue) || normalizedVenue.includes(normalizedHeader)) {
      if (normalizedHeader.length < 3) continue; // Skip too-short matches

      const fullSection = `### ${section}`;
      // Truncate to MAX_VENUE_INTEL_WORDS
      const words = fullSection.split(/\s+/);
      if (words.length > MAX_VENUE_INTEL_WORDS) {
        return words.slice(0, MAX_VENUE_INTEL_WORDS).join(' ') + '\n[...truncated]';
      }
      return fullSection.trim();
    }
  }

  return null;
}

/**
 * Look up entity knowledge from the entity_knowledge table.
 * Matches against event title words.
 */
export function lookupEntityKnowledge(db: Database, title: string): EntityKnowledge[] {
  // Check if table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='entity_knowledge'"
  ).get();
  if (!tableExists) return [];

  // Extract meaningful words from title (3+ chars)
  const titleWords = title
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .map(w => w.toLowerCase().replace(/[^a-zα-ωά-ώ0-9]/gi, ''));

  if (titleWords.length === 0) return [];

  // Search for matching entities
  const entities: EntityKnowledge[] = [];
  for (const word of titleWords) {
    if (word.length < 3) continue;
    const matches = db.prepare(`
      SELECT name, entity_type, bio, genre
      FROM entity_knowledge
      WHERE LOWER(name) LIKE ? OR LOWER(canonical_name) LIKE ?
    `).all(`%${word}%`, `%${word}%`) as EntityKnowledge[];

    for (const match of matches) {
      if (!entities.find(e => e.name === match.name)) {
        entities.push(match);
      }
    }
  }

  return entities;
}

/**
 * Select exemplar file paths matching the batch's event types.
 * Returns 2-3 paths with type-matching priority.
 */
export function selectExemplars(batchTypes: string[]): string[] {
  if (!existsSync(EXEMPLARS_DIR)) return [];

  const files = readdirSync(EXEMPLARS_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');
  const selected: string[] = [];

  // First pass: match types in the batch
  const uniqueTypes = [...new Set(batchTypes)];
  for (const type of uniqueTypes) {
    if (selected.length >= 3) break;
    const match = files.find(f => f.startsWith(type + '-'));
    if (match && !selected.includes(match)) {
      selected.push(match);
    }
  }

  // Second pass: ensure at least 1 different type for variety
  if (selected.length < 2) {
    for (const file of files) {
      if (selected.length >= 3) break;
      if (!selected.includes(file)) {
        selected.push(file);
      }
    }
  }

  return selected.map(f => join(EXEMPLARS_DIR, f));
}

/**
 * Estimate token count from text.
 * Uses ~0.75 tokens per word as heuristic (English + markdown).
 */
export function estimateTokens(text: string): { tokens: number; overBudget: boolean } {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const tokens = Math.ceil(words * 0.75);
  return { tokens, overBudget: tokens > MAX_TOKENS - 200 }; // 200 token headroom
}

/**
 * Build the complete brief markdown.
 */
export function buildBrief(
  events: EventRecord[],
  venueIntel: Map<string, string | null>,
  entityKnowledge: Map<string, EntityKnowledge[]>,
  exemplarPaths: string[],
  batchNumber: number,
  recentOpenings?: RecentOpening[],
): string {
  const lines: string[] = [];

  lines.push(`# Enrichment Brief — Batch ${batchNumber}`);
  lines.push('');
  lines.push('You are writing premium event descriptions for Agent Athens, an AI-curated cultural events calendar for Athens, Greece.');
  lines.push('');

  // Condensed rules
  lines.push('## Rules');
  lines.push('');
  lines.push('1. **8-section structure**: Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer');
  lines.push('2. **Voice**: Second person ("you"), present tense, sensory-first. Transport before inform.');
  lines.push('3. **Word count**: Per-event target shown below each event (NOT always 400-600). Follow the target range — these are hard constraints, not suggestions.');
  lines.push('4. **Details table**: 4 rows — Setting, Vibe, Sound, Door (or Format/Access for tech events)');
  lines.push('5. **Filter section**: Always include "If you [don\'t want X]... But if you [want Y]..."');
  lines.push('6. **Show don\'t tell**: No lazy adjectives (amazing, incredible, fantastic, wonderful, stunning, vibrant)');
  lines.push('7. **Tribe**: Describe crowd by character/behavior, not demographics');
  lines.push('8. **Logistics**: Metro station, walking distance, ticket prices, practical tips');
  lines.push('9. **Closer**: One tight sentence — scarcity, uniqueness, or urgency');
  lines.push('10. **CRITICAL: Do not fabricate information.** If you can\'t find a fact, omit it.');
  lines.push('11. **Terminology**: Use "open" not "free". Latin transliteration for Greek names in prose.');
  lines.push('12. **Description only**: No tags, no "Last verified", no info tables beyond Aspect/Details.');
  lines.push('13. **VENUE OPENINGS**: If you write sensory details about a venue\'s physical space (smells, decor, lighting, food/drink), you MUST have found these through WebSearch or venue intel provided. Do not invent plausible atmosphere. If no venue details are available, open with the event\'s sound, the performer\'s first action, or the audience\'s energy instead.');
  lines.push('14. **CREDENTIALS**: If you cannot verify a specific release, album, label, or credential through web search, do not include it. State what you can confirm. A missing detail is always better than a wrong one. If web search returns nothing on an artist, say so in batch-review.md and use a venue-forward approach.');
  lines.push('15. **OPENING DIVERSITY**: Do not default to sound-first openings. After writing all descriptions in this batch, re-read your openings consecutively. If more than 2 of 5 use the same entry strategy (sound-first, space-first, action-first), rewrite one using a different approach. Options: visual detail, physical action, temporal framing, contrast/tension, a question the space poses.');
  lines.push('16. **CLOSER DIVERSITY**: Do not reuse the word "combination" or the phrase "will not reassemble/recur" across multiple closers in the same batch. Each closer must find its own structural fact or framing.');
  lines.push('');

  // Exemplar references
  lines.push('## Exemplars (read for structural guidance)');
  lines.push('');
  for (const path of exemplarPaths) {
    const filename = path.split('/').pop() || path;
    lines.push(`- \`${path}\` — ${getExemplarAnnotation(filename)}`);
  }
  lines.push('');

  // Anti-patterns reference
  lines.push('## Anti-patterns');
  lines.push('');
  lines.push(`Read \`${ANTI_PATTERNS_PATH}\` for 10 confirmed mistakes to avoid.`);
  lines.push('');

  // Recent openings dedup section
  if (recentOpenings && recentOpenings.length > 0) {
    const recent = recentOpenings.slice(-15);
    lines.push('## Recent Openings (DO NOT REUSE)');
    lines.push('');
    lines.push('These opening sentences were used in recent batches. Use a DIFFERENT entry strategy:');
    lines.push('');
    for (const o of recent) {
      lines.push(`- "${o.opening_sentence}"`);
    }
    lines.push('');
  }

  // Events
  lines.push('---');
  lines.push('');
  lines.push('## Events to Enrich');
  lines.push('');

  for (const event of events) {
    lines.push(`### ${event.title}`);
    lines.push(`- **ID**: ${event.id}`);
    lines.push(`- **Type**: ${event.type}`);
    lines.push(`- **Venue**: ${event.venue_name || 'TBA'}`);
    lines.push(`- **Price**: ${event.price_type || 'tba'}`);
    lines.push(`- **Date**: ${event.start_date}${event.end_date ? ` to ${event.end_date}` : ''}`);
    if (event.time_doors) lines.push(`- **Time**: ${event.time_doors}`);
    if (event.url) lines.push(`- **URL**: ${event.url}`);
    lines.push(`- **Source**: ${event.source || 'unknown'}`);

    // Per-event enrichment matrix targets
    const category = classifyEvent({ type: event.type, venue_name: event.venue_name, title: event.title });
    const target = getWordTarget({ type: event.type, venue_name: event.venue_name, title: event.title });
    lines.push(`- **Category**: ${category}`);
    lines.push(`- **Target words**: ${target.min}-${target.max}`);
    lines.push(`- **Structure**: ${target.structure}`);
    lines.push(`- **HARD CONSTRAINT**: Description MUST be ${target.min}-${target.max} words.`);

    // Venue intel
    const intel = venueIntel.get(event.venue_name || '');
    if (intel) {
      lines.push(`- **Venue intel** (from database):`);
      lines.push('  ```');
      // Indent venue intel
      for (const line of intel.split('\n').slice(0, 15)) {
        lines.push(`  ${line}`);
      }
      lines.push('  ```');
    } else {
      lines.push(`- **Venue intel**: Not in database. WebSearch "${event.venue_name || event.title} Athens" for context.`);
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
  lines.push('1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.');
  lines.push('2. **Write description**: Save to file:');
  lines.push('   ```bash');
  lines.push('   bun run scripts/write-description.ts <event-id> "<description text>"');
  lines.push('   ```');
  lines.push('3. **Gate check**: Validate quality (use the tier shown for each event):');
  lines.push('   ```bash');
  lines.push('   bun run scripts/auto-gate-check.ts temp-descriptions/<event-id>.md --tier=<tier> --event-id=<event-id>');
  lines.push('   ```');
  lines.push('   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium');
  lines.push('4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):');
  lines.push('   ```bash');
  lines.push('   bun run scripts/write-tags.ts <event-id> Tag1 Tag2 Tag3...');
  lines.push('   ```');
  lines.push('5. **Save decision** (after completing ALL events in this batch):');
  lines.push('   - If ALL gate scores are >= 85 AND all have 0 errors: auto-save to database:');
  lines.push('   ```bash');
  lines.push(`   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-${batchNumber}.manifest.json --session=batch-${batchNumber} --batch=${batchNumber} --clean`);
  lines.push('   ```');
  lines.push(`   Note "AUTO-SAVED" at the top of batch-${batchNumber}-review.md.`);
  lines.push('   - If ANY score is < 85 OR any have errors: do NOT run save-batch.ts.');
  lines.push(`     Note "LEFT FOR REVIEW" at the top of batch-${batchNumber}-review.md with reasons.`);
  lines.push('');
  lines.push('After all events, create `temp-descriptions/batch-' + batchNumber + '-review.md` with:');
  lines.push('');
  lines.push('| Event ID | Title | Gate Score | Issues | Confidence |');
  lines.push('|----------|-------|------------|--------|------------|');
  for (const event of events) {
    lines.push(`| ${event.id} | ${event.title} | /100 | | |`);
  }
  lines.push('');

  return lines.join('\n');
}

function getExemplarAnnotation(filename: string): string {
  const annotations: Record<string, string> = {
    'theater-cherry-orchard.md': 'Historical depth, accessibility info',
    'theater-medea.md': 'Site-specific staging, temperature advice',
    'concert-mattrey.md': 'Basement venue detail, credentials chain',
    'concert-three-times-three.md': 'Format explanation, cross-community appeal',
    'classical-magic-ticket.md': 'Audience-specific framing, practical pricing',
    'dj-set-pharaoh.md': 'Venue-as-concept framing, verified sensory details, tribe split (diners vs listeners)',
    'exhibition-lanthimos.md': 'Space-first opening, two-audience tribe split, Format/Access table for exhibitions',
  };
  return annotations[filename] || 'structural reference';
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const { count, batches, startBatch } = parseArgs();

  console.log(`\n=== Generate Enrichment Brief ===`);
  console.log(`Start batch: ${startBatch} | Batches: ${batches} | Events per batch: ${count}\n`);

  const db = new Database(DB_PATH);

  // 1. Select all events for all batches at once
  //    Scale MAX_PER_TYPE by batch count so each batch can maintain diversity
  const totalNeeded = count * batches;
  const scaledMaxPerType = DEFAULT_MAX_PER_TYPE * batches;
  const allEvents = selectDiverseBatch(db, totalNeeded, scaledMaxPerType);
  if (allEvents.length === 0) {
    console.log('No eligible events found for enrichment.');
    db.close();
    process.exit(0);
  }

  console.log(`Selected ${allEvents.length} events total:`);
  const typeCounts = new Map<string, number>();
  for (const e of allEvents) {
    const c = typeCounts.get(e.type) || 0;
    typeCounts.set(e.type, c + 1);
  }
  console.log(`Type distribution: ${[...typeCounts.entries()].map(([t, c]) => `${t}:${c}`).join(', ')}`);

  // 2. Look up venue intel for all events
  const venueIntel = new Map<string, string | null>();
  for (const event of allEvents) {
    if (event.venue_name && !venueIntel.has(event.venue_name)) {
      venueIntel.set(event.venue_name, lookupVenueIntel(event.venue_name));
    }
  }
  const foundVenues = [...venueIntel.values()].filter(v => v !== null).length;
  console.log(`Venue intel: ${foundVenues}/${venueIntel.size} venues found in database`);

  // 3. Look up entity knowledge for all events
  const entityKnowledge = new Map<string, EntityKnowledge[]>();
  for (const event of allEvents) {
    entityKnowledge.set(event.id, lookupEntityKnowledge(db, event.title));
  }
  const foundEntities = [...entityKnowledge.values()].filter(v => v.length > 0).length;
  console.log(`Entity knowledge: ${foundEntities}/${allEvents.length} events have matching entities`);

  db.close();

  // 4. Load recent openings for dedup
  const recentOpenings = loadRecentOpenings();
  if (recentOpenings.length > 0) {
    console.log(`Recent openings loaded: ${recentOpenings.length} (for dedup reference)`);
  }

  // 5. Split into batches and generate each
  if (!existsSync(BRIEFS_DIR)) {
    mkdirSync(BRIEFS_DIR, { recursive: true });
  }

  const actualBatches = Math.ceil(allEvents.length / count);
  for (let i = 0; i < actualBatches; i++) {
    const batchNumber = startBatch + i;
    const slice = allEvents.slice(i * count, (i + 1) * count);

    // Select exemplars for this slice's types
    const batchTypes = slice.map(e => e.type);
    const exemplarPaths = selectExemplars(batchTypes);

    // Build and write brief
    const brief = buildBrief(slice, venueIntel, entityKnowledge, exemplarPaths, batchNumber, recentOpenings);

    const briefPath = join(BRIEFS_DIR, `batch-${batchNumber}.md`);
    writeFileSync(briefPath, brief, 'utf-8');

    // Write manifest
    const manifestPath = writeManifest(batchNumber, slice.map(e => e.id));

    // Token estimate
    const { tokens, overBudget } = estimateTokens(brief);
    console.log(`\nBatch ${batchNumber}: ${slice.length} events, ~${tokens} tokens${overBudget ? ' ⚠ OVER BUDGET' : ''}`);
    for (const e of slice) {
      console.log(`  ${e.type.padEnd(12)} ${e.title.substring(0, 50)}${e.title.length > 50 ? '...' : ''}`);
    }
    console.log(`  Written: ${briefPath}`);
    console.log(`  Manifest: ${manifestPath}`);
  }

  console.log(`\n=== Generated ${actualBatches} batch(es) ===`);
  console.log(`\nTo run enrichment:`);
  for (let i = 0; i < actualBatches; i++) {
    const bn = startBatch + i;
    console.log(`  Batch ${bn}: spawn subagent with temp-briefs/batch-${bn}.md`);
  }
  console.log(`\nTo save:`);
  for (let i = 0; i < actualBatches; i++) {
    const bn = startBatch + i;
    console.log(`  bun run scripts/save-batch.ts --manifest=temp-briefs/batch-${bn}.manifest.json --session=batch-${bn} --batch=${bn} --clean`);
  }
  console.log('');
}

// Only run main() when executed directly, not when imported for testing
const isDirectRun = import.meta.path === Bun.main;
if (isDirectRun) {
  main();
}
