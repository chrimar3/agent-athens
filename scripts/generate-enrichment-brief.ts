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
import { classifyEvent, getWordTarget, structureToTier, TIMELINESS_HINTS } from '../src/enrichment/enrichment-matrix';

const DB_PATH = 'data/events.db';
const VENUE_INTEL_PATH = 'config/venue-intelligence.md';
const ENTITY_LOCKING_PATH = 'config/entity-locking.json';
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
  ticket_url?: string | null;
  ticket_url_status?: string | null;
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
  output_dir: string;
}

/** Domains that hang or confabulate under WebFetch in headless runs.
 *  more.com: queue-it wall → observed 572s hang → wall-clock batch kill
 *  (logs/auto-enrich-2026-08-10.log). snfcc.org: 403. ra.co: 403.
 *  The brief instructs WebSearch as the substitute — do not silently drop
 *  the research step. Pinned by tests/enrichment-brief-blocklist.test.ts. */
export const FETCH_BLOCKLIST = ['more.com', 'snfcc.org', 'ra.co'] as const;

export function renderFetchBlocklistSection(): string {
  return [
    '## Fetch blocklist (hard rule)',
    '',
    `Do NOT WebFetch these domains — they hang or block and will kill the whole batch: ${FETCH_BLOCKLIST.join(', ')}.`,
    'Use WebSearch for facts you would have fetched from them. If a fact exists only on a blocked domain, write what the other sources support and flag the gap in concerns.jsonl instead of fetching.',
    '',
  ].join('\n');
}

export function writeManifest(batchNumber: number, eventIds: string[]): string {
  const outputDir = `temp-descriptions/batch-${batchNumber}`;
  const manifest: BatchManifest = {
    batch_id: batchNumber,
    generated_at: new Date().toISOString(),
    event_ids: eventIds,
    output_dir: outputDir,
  };
  if (!existsSync(BRIEFS_DIR)) {
    mkdirSync(BRIEFS_DIR, { recursive: true });
  }
  // Create batch-scoped output directory for subagent isolation
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
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
// Tier-priority config (S110)
//
// Events whose effective date (start_date for non-exhibitions, end_date for
// exhibitions per the Tier 1 rule) falls in `tier1_window` get queue priority
// over events outside it. Update this file's dates when the next deadline lands;
// no code change needed.
// ============================================================================

const ENRICHMENT_PRIORITY_PATH = 'config/enrichment-priority.json';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface EnrichmentPriorityConfig {
  tier1_window: {
    label: string;
    start: string;  // YYYY-MM-DD
    end: string;    // YYYY-MM-DD
    rationale?: string;
  };
}

const DEFAULT_PRIORITY_CONFIG: EnrichmentPriorityConfig = {
  tier1_window: {
    label: 'no-window',
    start: '1970-01-01',
    end: '1970-01-01',
    rationale: 'Fallback when config/enrichment-priority.json is missing — no event will match Tier 1 priority.',
  },
};

export function loadEnrichmentPriorityConfig(): EnrichmentPriorityConfig {
  if (!existsSync(ENRICHMENT_PRIORITY_PATH)) return DEFAULT_PRIORITY_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(ENRICHMENT_PRIORITY_PATH, 'utf-8'));
    const tw = raw?.tier1_window;
    if (!tw || !ISO_DATE.test(tw.start) || !ISO_DATE.test(tw.end)) {
      return DEFAULT_PRIORITY_CONFIG;
    }
    return {
      tier1_window: {
        label: tw.label || 'unlabeled',
        start: tw.start,
        end: tw.end,
        rationale: tw.rationale,
      },
    };
  } catch {
    return DEFAULT_PRIORITY_CONFIG;
  }
}

// ============================================================================
// CLI
// ============================================================================

export function parseArgs(): { count: number; batches: number; startBatch: number; typeFilter: string | null } {
  const args = process.argv.slice(2);
  const countArg = args.find(a => a.startsWith('--count='));
  const batchArg = args.find(a => a.startsWith('--batch='));
  const batchesArg = args.find(a => a.startsWith('--batches='));
  const typeArg = args.find(a => a.startsWith('--type='));

  const count = parseInt(countArg?.split('=')[1] || '5', 10);
  const batches = parseInt(batchesArg?.split('=')[1] || '1', 10);
  const typeFilter = typeArg?.split('=')[1] || null;

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

  return { count, batches, startBatch, typeFilter };
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

export function selectDiverseBatch(
  db: Database,
  count: number,
  maxPerType: number = DEFAULT_MAX_PER_TYPE,
  typeFilter: string | null = null,
  priorityConfig?: EnrichmentPriorityConfig,
): EventRecord[] {
  if (count <= 0) return [];

  // Resolve the Tier 1 window. Caller may inject (used by tests); otherwise
  // load from config/enrichment-priority.json. Validated to ISO YYYY-MM-DD
  // by loadEnrichmentPriorityConfig so the literals below are safe to inline.
  const config = priorityConfig ?? loadEnrichmentPriorityConfig();
  const t1Start = config.tier1_window.start;
  const t1End = config.tier1_window.end;
  if (!ISO_DATE.test(t1Start) || !ISO_DATE.test(t1End)) {
    throw new Error(`Invalid tier1_window dates: start=${t1Start} end=${t1End}`);
  }

  // Build a set of already-enriched (venue, date) combos to skip cross-source duplicates.
  // If venue+date already has an enriched event, skip the unenriched sibling.
  const enrichedCombos = new Set<string>();
  const enrichedRows = db.prepare(`
    SELECT LOWER(TRIM(venue_name)) as venue, SUBSTR(start_date,1,10) as date
    FROM events
    WHERE full_description IS NOT NULL AND full_description <> ''
      AND location_status IN ('verified_athens', 'pass_through')
      AND merged_into IS NULL
  `).all() as { venue: string; date: string }[];
  for (const r of enrichedRows) {
    enrichedCombos.add(`${r.venue}|${r.date}`);
  }

  // Query all eligible events. ORDER BY a tier-priority CASE first so the
  // per-type buckets built below are tier-sorted internally; the round-robin
  // then naturally picks Tier 1 events of each type before Tier 2/3.
  // Tier rule mirrors the sizing query in the S110 brief — exhibitions use
  // end_date (Tier 1 rule), everything else uses start_date.
  const typeClause = typeFilter ? `AND type = ?` : '';
  const params = typeFilter ? [typeFilter] : [];
  const effectiveDate = `date(COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date))`;
  const rows = db.prepare(`
    SELECT id, title, type, venue_name, price_type, start_date, end_date,
           time_doors, url, description, source, ticket_url, ticket_url_status
    FROM events
    WHERE (full_description IS NULL OR full_description = '')
      AND needs_enrichment = 1
      AND location_status IN ('verified_athens', 'pass_through')
      AND merged_into IS NULL
      AND ${effectiveDate} >= date('now')
      ${typeClause}
    ORDER BY
      CASE
        WHEN ${effectiveDate} BETWEEN '${t1Start}' AND '${t1End}' THEN 1
        WHEN ${effectiveDate} < '${t1Start}' THEN 2
        WHEN ${effectiveDate} > '${t1End}' THEN 3
        ELSE 4
      END,
      type,
      start_date ASC
  `).all(...params) as EventRecord[];

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
/**
 * Load Entity Locking config for English description rules.
 */
export function loadEntityLocking(): EntityLockingConfig | null {
  if (!existsSync(ENTITY_LOCKING_PATH)) return null;
  try {
    return JSON.parse(readFileSync(ENTITY_LOCKING_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

interface EntityLockingConfig {
  cultural_terms: {
    music_genres?: string[];
    instruments?: string[];
    venue_types?: string[];
    cultural_concepts?: string[];
  };
  formatting_rules?: {
    dates: string;
    times: string;
    currency: string;
  };
}

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
  const batchDir = `temp-descriptions/batch-${batchNumber}`;

  lines.push(`# Enrichment Brief — Batch ${batchNumber}`);
  lines.push('');

  // Verification checklist for subagent isolation
  lines.push('## VERIFICATION CHECKLIST');
  lines.push(`- This is Batch ${batchNumber}`);
  lines.push(`- Event IDs: ${events.map(e => e.id).join(', ')}`);
  lines.push(`- Write descriptions to: ${batchDir}/`);
  lines.push('- BEFORE writing any file, verify the event ID appears in this list');
  lines.push(`- ⚠️ DO NOT omit --batch-dir= from write commands. Files without --batch-dir go to a shared directory and contaminate other batches.`);
  lines.push('');

  lines.push('You are writing premium event descriptions for Agent Athens, an AI-curated cultural events calendar for Athens, Greece.');
  lines.push('');

  // Condensed rules
  lines.push('## Rules');
  lines.push('');
  lines.push('1. **8-section structure** (for 400+ word events): Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer. For shorter events, see Rule 19.');
  lines.push('2. **Voice**: Second person ("you"), present tense, sensory-first. Transport before inform.');
  lines.push('3. **Word count**: Per-event target shown below each event (NOT always 400-600). Follow the target range — these are hard constraints, not suggestions.');
  lines.push('4. **Details table**: 4 rows — Setting, Vibe, Sound, Door (or Format/Access for tech events)');
  lines.push('5. **Filter section**: Always include "If you [don\'t want X]... But if you [want Y]..."');
  lines.push('6. **Show don\'t tell**: No lazy adjectives — legendary, immersive, iconic, captivating, mesmerizing, breathtaking, enchanting, amazing, incredible, fantastic, wonderful, stunning, vibrant, extraordinary, exceptional, world-class, phenomenal, remarkable');
  lines.push('7. **No speculation**: Never write "likely", "perhaps", "probably", "promises to", "the show will". State only verified facts. If you don\'t know something, omit it — don\'t guess.');
  lines.push('8. **Tribe**: Describe crowd by character/behavior, not demographics');
  lines.push('9. **Logistics**: Say "accessible by metro" or "X-minute walk from [station name]". Do NOT include metro LINE NUMBERS or LINE COLORS — these change and have a 20% historical error rate. Ticket prices, practical tips.');
  lines.push('10. **Closer**: One tight sentence — scarcity, uniqueness, or urgency');
  lines.push('11. **CRITICAL: Do not fabricate information.** If you can\'t find a fact, omit it.');
  lines.push('12. **Terminology**: Use "open" not "free". Latin transliteration for Greek names in prose.');
  lines.push('13. **Description only**: No tags, no "Last verified", no info tables beyond Aspect/Details.');
  lines.push('14. **VENUE OPENINGS**: If you write sensory details about a venue\'s physical space (smells, decor, lighting, food/drink), you MUST have found these through WebSearch or venue intel provided. Do not invent plausible atmosphere. If no venue details are available, open with the event\'s sound, the performer\'s first action, or the audience\'s energy instead.');
  lines.push('15. **CREDENTIALS**: If you cannot verify a specific release, album, label, or credential through web search, do not include it. State what you can confirm. A missing detail is always better than a wrong one. If web search returns nothing on an artist, say so in batch-review.md and use a venue-forward approach.');
  lines.push('16. **OPENING DIVERSITY**: Do not default to sound-first openings. After writing all descriptions in this batch, re-read your openings consecutively. If more than 2 of 5 use the same entry strategy (sound-first, space-first, action-first), rewrite one using a different approach. Options: visual detail, physical action, temporal framing, contrast/tension, a question the space poses.');
  lines.push('17. **CLOSER DIVERSITY**: Do not reuse the word "combination" or the phrase "will not reassemble/recur" across multiple closers in the same batch. Each closer must find its own structural fact or framing.');
  lines.push('18. **POST-WRITE WORD CHECK**: After drafting, count words. If over the card maximum, cut whole paragraphs — starting with the one with the lowest ratio of named entities to total words. Do not trim sentences from multiple paragraphs. Recount. Repeat until within range.');
  lines.push('19. **STRUCTURE BY WORD BUDGET**: ≤200 words → three-part block (What is it? / Why it matters / What to expect). 201-400 words → hybrid (anchor + condensed sections + closer). 400+ words → full 8-section. Structure follows word budget, not how much you know.');
  lines.push('20. **NAMED ENTITY ANCHORING**: The event title and primary artist/company name must appear beyond the opening paragraph. For ≤200w: name in at least 2 of 3 sections. For 200+w: at least 3 occurrences across the full text.');
  lines.push('21. **GIVEN DATA BEFORE ATMOSPHERE**: Exhaust Category 1 facts (title, artist, venue, genre, date, price, source details) before reaching for Category 2 atmosphere. If word budget is tight, facts win.');
  lines.push('22. **TIMELINESS SIGNAL REQUIRED**: Every description must answer "why now?" Tier 1 (preferred): anniversary, milestone, comeback, premiere, album release. Tier 2: season position, limited run, Athens premiere. Tier 3 (always available): seasonal fit, calendar position, programming context. See per-event timeliness hint below.');
  lines.push('23. **TIMELINESS STALENESS FLAG**: After writing, add `<!-- timeliness-expires: YYYY-MM-DD -->` at the end of the description. Date = when the timeliness claim becomes stale (closing date, +90 days for album hooks, series end date for recurring).');
  lines.push('24. **VENUE-SPECIFIC INSIDER DETAIL**: Every enrichment must contain at least one concrete, venue-or-event-specific detail not derivable from structured fields (address, metro, price, capacity, event time) or from the venue profile\'s standing character. Qualifying: door/arrival timing, terrace or smoking policy, late-night atmosphere shifts, sightline or acoustic notes, seasonal operation changes, crowd-by-hour patterns, walking quirks between transit and venue, seating or standing dynamics. Woven into narrative prose — never a header, bullet list, or "Practical info" coda. Required for hybrid (201–400w) and full (400w+) — absence is a fail. Attempted for three-part blocks (≤200w) — may be omitted if topical load is heavy (log as "insider omitted: topical load"). If venue is not in the Enrichment Knowledge Base and no insider detail is verifiable, lead with genre-prototypical experience (Safe Inferences) and flag the gap to the ED for KB expansion. Never fabricate insider detail.');
  lines.push('25. **INCOMPLETE WRITES**: If you cannot complete a description body — corrupt input, conflicting required fields, event type missing from matrix, unrecoverable Master Template violation — do not stall. Write the minimum schema description: "[Event name] is a [event type] at [venue name] in [neighborhood], Athens[, on [date]]. [Admission language]." Save via save-batch.ts. Append concern with concern_type="incomplete-write" and one-sentence concern_text describing what blocked the full write. Continue to next event.');
  lines.push('');
  lines.push(renderFetchBlocklistSection());

  // Concerns taxonomy (S110f)
  lines.push('## Concerns');
  lines.push('');
  lines.push('When you flag a concern, append a JSONL line to');
  lines.push(`temp-descriptions/batch-${batchNumber}/concerns.jsonl with shape:`);
  lines.push('  {"event_id": "...", "concern_type": "...", "concern_text": "...", "timestamp": "..."}');
  lines.push('');
  lines.push('Valid concern_type values (use exactly one per concern entry):');
  lines.push('- entity-resolution-uncertain');
  lines.push('- venue-mismatch-or-unknown');
  lines.push('- date-conflict-or-unparseable');
  lines.push('- neighborhood-mismatch');
  lines.push('- ticket-merchant-unverified');
  lines.push('- venue-change-suspected');
  lines.push('- timeliness-stale-risk');
  lines.push('- credential-redirect-applied');
  lines.push('- word-count-overshoot');
  lines.push('- thin-context');
  lines.push('- fabrication-temptation-resisted');
  lines.push('- incomplete-write');
  lines.push('');
  lines.push('If none fit, do not flag a concern. Do not invent a concern_type — the');
  lines.push('validator config will flag unknown types as drift.');
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

  // Entity Locking terms for English descriptions
  lines.push('## Entity Locking (English Descriptions)');
  lines.push('');
  lines.push('These terms MUST remain untranslated in English descriptions:');
  lines.push('');
  const entityLocking = loadEntityLocking();
  if (entityLocking) {
    const ct = entityLocking.cultural_terms;
    if (ct.music_genres) lines.push(`- **Music genres**: ${ct.music_genres.join(', ')}`);
    if (ct.instruments) lines.push(`- **Instruments**: ${ct.instruments.join(', ')}`);
    if (ct.venue_types) lines.push(`- **Venue types**: ${ct.venue_types.join(', ')}`);
    if (ct.cultural_concepts) lines.push(`- **Cultural concepts**: ${ct.cultural_concepts.join(', ')}`);
    lines.push('- **Venue names**: Inherit from DB (use Latin transliteration or established English name)');
    lines.push('- **Neighborhoods**: Inherit from DB (use established transliterations)');
    if (entityLocking.formatting_rules) {
      const fr = entityLocking.formatting_rules;
      lines.push(`- **Date format**: ${fr.dates}`);
      lines.push(`- **Time format**: ${fr.times}`);
      lines.push(`- **Currency**: ${fr.currency}`);
    }
  } else {
    lines.push('- Config not found at `config/entity-locking.json` — use common sense for cultural terms');
  }
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

    // Tier-4 AI-discovery ask: emit only for ticketed events with no trustworthy ticket_url.
    // Trustworthy = ticket_url_status in {'direct','venue_registry','ai_discovered'} AND ticket_url non-null.
    // Everything else (generated pollution, null, unresolved, venue_fallback) asks Claude to try.
    const trustedStatuses = new Set(['direct', 'venue_registry', 'ai_discovered']);
    const hasTrustedTicketUrl = !!event.ticket_url && trustedStatuses.has(event.ticket_url_status || '');
    const isTicketed = event.price_type === 'with-ticket' || event.price_type === 'tba';
    if (isTicketed && !hasTrustedTicketUrl) {
      lines.push('');
      lines.push(`> **TICKET URL NEEDED** for "${event.title}" @ ${event.venue_name || 'unknown venue'}.`);
      lines.push(`> If you can confirm a direct purchase page on more.com, ticketservices.gr, viva.gr, or the venue's own site (web-search if needed), append this line under the event's YAML frontmatter in your response:`);
      lines.push(`>   \`ticket_url_discovered: https://...\``);
      lines.push(`> Omit the line if you can't find one. Do NOT fabricate URLs.`);
    }

    // Per-event enrichment matrix targets
    const category = classifyEvent({ type: event.type, venue_name: event.venue_name, title: event.title });
    const target = getWordTarget({ type: event.type, venue_name: event.venue_name, title: event.title });
    lines.push(`- **Category**: ${category}`);
    lines.push(`- **Target words**: ${target.min}-${target.max}`);
    lines.push(`- **Structure**: ${target.structure}`);
    lines.push(`- **HARD CONSTRAINT**: Description MUST be ${target.min}-${target.max} words.`);
    const timelinessHint = TIMELINESS_HINTS[event.type] || TIMELINESS_HINTS['other'];
    lines.push(`- **Timeliness hint**: ${timelinessHint}`);

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
  lines.push(`2. **Write description**: Save to batch directory (${batchDir}/):`);
  lines.push('   ```bash');
  lines.push(`   bun run scripts/write-description.ts <event-id> --batch-dir=${batchDir} "<description text>"`);
  lines.push('   ```');
  lines.push('3. **Gate check**: Validate quality with metadata flags (no DB needed):');
  lines.push('   ```bash');
  lines.push(`   bun run scripts/auto-gate-check.ts ${batchDir}/<event-id>.md --tier=<tier> --event-id=<event-id> \\`);
  lines.push('     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \\');
  lines.push('     --event-date=<date> --event-price=<price>');
  lines.push('   ```');
  lines.push('   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium');
  lines.push('4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):');
  lines.push('   ```bash');
  lines.push(`   bun run scripts/write-tags.ts <event-id> --batch-dir=${batchDir} Tag1 Tag2 Tag3...`);
  lines.push('   ```');
  lines.push('5. **Save decision** (deterministic, no operator branch):');
  lines.push('   - When all gate scores ≥ 80, the description is complete. If you have any');
  lines.push(`     concerns, append a JSONL line to temp-descriptions/batch-${batchNumber}/concerns.jsonl.`);
  lines.push('     Both the description and any concerns are produced; neither is contingent');
  lines.push('     on the other.');
  lines.push('   - When any gate score < 80, append a concern to concerns.jsonl describing the');
  lines.push('     failure. The description file (already written in step 2) stays — the concern');
  lines.push('     is the signal for the post-save validator. Continue to next event.');
  lines.push('   - After all events in the batch are processed, run save-batch.ts:');
  lines.push('   ```bash');
  lines.push(`   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-${batchNumber}.manifest.json --session=batch-${batchNumber} --batch=${batchNumber} --clean`);
  lines.push('   ```');
  lines.push('   There is no operator-input branch. Do not ask whether to save.');
  lines.push('');

  // Per-event gate check commands with full metadata flags
  lines.push('### Per-Event Gate Check Commands');
  lines.push('');
  lines.push('Copy-paste these with the correct tier for each event:');
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

  lines.push(`After all events, create \`${batchDir}/batch-${batchNumber}-review.md\` with:`);
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
  const { count, batches, startBatch, typeFilter } = parseArgs();

  console.log(`\n=== Generate Enrichment Brief ===`);
  console.log(`Start batch: ${startBatch} | Batches: ${batches} | Events per batch: ${count}${typeFilter ? ` | Type: ${typeFilter}` : ''}\n`);

  const db = new Database(DB_PATH);

  // 1. Select all events for all batches at once
  //    Scale MAX_PER_TYPE by batch count so each batch can maintain diversity
  //    When filtering by type, lift maxPerType to the total needed
  const totalNeeded = count * batches;
  const scaledMaxPerType = typeFilter ? totalNeeded : DEFAULT_MAX_PER_TYPE * batches;
  const allEvents = selectDiverseBatch(db, totalNeeded, scaledMaxPerType, typeFilter);
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
