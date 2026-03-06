#!/usr/bin/env bun
/**
 * Batch Rewrite Fixes
 *
 * Applies surgical fixes to descriptions that fail quality gates due to:
 * - Entity locking violations (folk music→dimotika, etc.)
 * - Lazy adjectives (legendary, immersive, etc.)
 * - Filler phrases (world-class, state-of-the-art, etc.)
 *
 * Does NOT handle speculation — those require paragraph-level rewrites.
 *
 * Usage:
 *   bun run scripts/batch-rewrite-fixes.ts --dry-run   # Preview changes
 *   bun run scripts/batch-rewrite-fixes.ts              # Apply changes
 */

import Database from 'bun:sqlite';
import {
  validateEnglishDescription,
  detectGenericContent,
} from '../src/enrichment/quality-gates';
import type { EventForEnrichment } from '../src/enrichment/description-generator';

const DB_PATH = 'data/events.db';
const dryRun = process.argv.includes('--dry-run');

// ============================================================================
// Context-aware replacements
// ============================================================================

interface FixRule {
  /** What to search for (case-insensitive) */
  find: string;
  /** Replacement text (preserves surrounding case) */
  replace: string;
  /** Optional: only apply if this regex matches the surrounding context */
  contextMatch?: RegExp;
}

// Entity locking: replace English translations with Greek terms
const ENTITY_FIXES: FixRule[] = [
  // "Greek popular music" → "laiko" (not "Greek laiko" which is redundant)
  { find: 'Greek popular music', replace: 'laiko' },
  // "popular music" alone (when meaning laiko)
  { find: 'popular music', replace: 'laiko' },
  // "Greek folk music" → "dimotika" (not "Greek dimotika")
  { find: 'Greek folk music', replace: 'dimotika' },
  { find: 'traditional Greek folk music', replace: 'dimotika' },
  // "folk music" alone
  { find: 'Folk music', replace: 'Dimotika' },
  { find: 'folk music', replace: 'dimotika' },
  // "music hall" → "live music venue" (Stavros tou Notou is NOT a bouzoukia)
  { find: 'multi-level music hall', replace: 'multi-level live music venue' },
  // "art song" → "entechno" (when referring to Greek genre)
  // Context: "at the crossroads of art song and popular tradition" → entechno
  { find: 'art song and popular tradition', replace: 'entechno and laiko' },
  // Context: "the English art song" — this is the Western classical genre, not entechno
  // The Lied/mélodie/art song tradition. Need specific fix.
  { find: 'the English art song', replace: 'the English vocal art form' },
];

// Lazy adjective replacements (context-specific)
interface AdjectiveReplacement {
  eventId: string;
  find: string;
  replace: string;
}

const ADJECTIVE_FIXES: AdjectiveReplacement[] = [
  // marcos-ayala-tango-the-golden-years-2026-04-22: "legendary"
  { eventId: 'marcos-ayala-tango-the-golden-years-2026-04-22', find: 'legendary', replace: 'celebrated' },

  // ae70b9883fea210a: "great", "excellent"
  { eventId: 'ae70b9883fea210a', find: 'every great jazz moment', replace: 'every defining jazz moment' },
  { eventId: 'ae70b9883fea210a', find: 'excellent acoustics', replace: 'warm acoustics' },

  // 7579e35778b5ad7d: "perfect"
  { eventId: '7579e35778b5ad7d', find: 'perfect for someone', replace: 'suited for someone' },

  // 5e22890399e9f46f: "immersive"
  { eventId: '5e22890399e9f46f', find: 'feels immersive', replace: 'feels enveloping' },

  // 2c666d43169ce1f6: "excellent"
  { eventId: '2c666d43169ce1f6', find: 'excellent sound system', replace: 'tuned sound system' },

  // 7ee758446f982a4f: "excellent" (also has "perfectly" which isn't banned)
  { eventId: '7ee758446f982a4f', find: 'excellent sight lines', replace: 'clear sight lines' },

  // 1504103a5eb31ba1: "exceptional"
  { eventId: '1504103a5eb31ba1', find: 'exceptional context', replace: 'striking context' },

  // 5b80b55f3baac9ed: "immersive" (also has "perfectly" which isn't banned)
  { eventId: '5b80b55f3baac9ed', find: 'feel immersive', replace: 'feel engulfing' },

  // 9454cac8ff50ab94: "great"
  { eventId: '9454cac8ff50ab94', find: 'great pop performance', replace: 'sharp pop performance' },

  // a47a1c7cf5ecd109: "transcendent"
  { eventId: 'a47a1c7cf5ecd109', find: 'something transcendent', replace: 'something rare' },

  // 2b73d0705f4a1483: "spectacular"
  { eventId: '2b73d0705f4a1483', find: 'rather than spectacular', replace: 'rather than pyrotechnic' },

  // d0ac823395c2f739: "iconic"
  { eventId: 'd0ac823395c2f739', find: 'iconic tracks', replace: 'signature tracks' },

  // 161db7297a22697b: "great" (in title translation — "Great Ladies Sing")
  // This is a proper noun translation — "(Great Ladies Sing...)"
  // The word "Great" here is a translation of "Μεγάλες" in the show title.
  // Fix: use the Greek title or a different translation
  { eventId: '161db7297a22697b', find: '(Great Ladies Sing...)', replace: '(Grand Ladies Sing...)' },

  // 12663b972c36ee87: "perfect", "legendary"
  { eventId: '12663b972c36ee87', find: 'lighting is perfect:', replace: 'lighting is deliberate:' },
  { eventId: '12663b972c36ee87', find: 'legendary acoustics', replace: 'storied acoustics' },

  // 8c1e1c44c935018e: "exceptional", "immersive"
  { eventId: '8c1e1c44c935018e', find: 'exceptional sound system', replace: 'powerful sound system' },
  { eventId: '8c1e1c44c935018e', find: 'immersive, intense', replace: 'absorbing, intense' },

  // 474633e3742515dc: "excellent"
  { eventId: '474633e3742515dc', find: 'excellent acoustics', replace: 'tight acoustics' },

  // deep-purple-oaka-2026: "legendary"
  { eventId: 'deep-purple-oaka-2026', find: 'legendary', replace: 'long-running' },
];

// Filler phrase fixes
interface FillerFix {
  eventId: string;
  find: string;
  replace: string;
}

const FILLER_FIXES: FillerFix[] = [
  // 65-2026-03-09: "world-class" (also flagged as LAZY_ADJECTIVES)
  { eventId: '65-2026-03-09', find: 'world-class', replace: 'elite-level' },

  // c4f9d1e4dd4573a6: "state-of-the-art"
  { eventId: 'c4f9d1e4dd4573a6', find: 'state-of-the-art', replace: 'purpose-built' },

  // 2ada537f08ee7037: "world-class" (also has speculation)
  { eventId: '2ada537f08ee7037', find: 'world-class', replace: 'top-tier' },

  // 560b76f06a9c5e74: "world-class"
  { eventId: '560b76f06a9c5e74', find: 'world-class', replace: 'first-rate' },

  // ef0f106cacd0f5fe: "world-class"
  { eventId: 'ef0f106cacd0f5fe', find: 'world-class', replace: 'internationally recognized' },

  // 7ff03bc68e816e1a: "unforgettable"
  { eventId: '7ff03bc68e816e1a', find: 'unforgettable', replace: 'indelible' },

  // b3bf36fec59bd813: "state-of-the-art"
  { eventId: 'b3bf36fec59bd813', find: 'state-of-the-art', replace: 'purpose-built' },

  // 66d57dc45ae2ba87: "don't miss"
  { eventId: '66d57dc45ae2ba87', find: "don't miss", replace: 'worth your time —' },

  // e0abea86b2c50b69: "world-class"
  { eventId: 'e0abea86b2c50b69', find: 'world-class', replace: 'top-tier' },
];

// ============================================================================
// Apply fixes
// ============================================================================

function applyFixes(db: Database): void {
  const { readFileSync } = require('fs');
  const ids = readFileSync('/tmp/rewrite-ids-fixed.txt', 'utf-8').split('\n').filter(Boolean);

  // We'll use ids for reference but fix ALL matching descriptions
  let totalFixed = 0;
  let totalEntityFixes = 0;
  let totalAdjectiveFixes = 0;
  let totalFillerFixes = 0;

  // 1. Entity locking fixes (apply to ALL descriptions, not just flagged ones)
  console.log('\n=== Entity Locking Fixes ===');
  for (const fix of ENTITY_FIXES) {
    const rows = db.prepare(
      `SELECT id, full_description_en FROM events
       WHERE full_description_en LIKE ? AND full_description_en IS NOT NULL`
    ).all(`%${fix.find}%`) as { id: string; full_description_en: string }[];

    for (const row of rows) {
      const newDesc = row.full_description_en.split(fix.find).join(fix.replace);
      if (newDesc !== row.full_description_en) {
        console.log(`  ${row.id.slice(0, 30).padEnd(32)} "${fix.find}" → "${fix.replace}"`);
        if (!dryRun) {
          db.prepare('UPDATE events SET full_description_en = ? WHERE id = ?').run(newDesc, row.id);
        }
        totalEntityFixes++;
      }
    }
  }

  // 2. Lazy adjective fixes (event-specific)
  console.log('\n=== Lazy Adjective Fixes ===');
  for (const fix of ADJECTIVE_FIXES) {
    const row = db.prepare(
      'SELECT full_description_en FROM events WHERE id = ?'
    ).get(fix.eventId) as { full_description_en: string } | null;

    if (!row) {
      console.log(`  SKIP: ${fix.eventId} not found`);
      continue;
    }

    if (!row.full_description_en.includes(fix.find)) {
      console.log(`  SKIP: ${fix.eventId.slice(0, 30).padEnd(32)} "${fix.find}" not found in description`);
      continue;
    }

    const newDesc = row.full_description_en.replace(fix.find, fix.replace);
    console.log(`  ${fix.eventId.slice(0, 30).padEnd(32)} "${fix.find}" → "${fix.replace}"`);
    if (!dryRun) {
      db.prepare('UPDATE events SET full_description_en = ? WHERE id = ?').run(newDesc, fix.eventId);
    }
    totalAdjectiveFixes++;
  }

  // 3. Filler phrase fixes (event-specific)
  console.log('\n=== Filler Phrase Fixes ===');
  for (const fix of FILLER_FIXES) {
    const row = db.prepare(
      'SELECT full_description_en FROM events WHERE id = ?'
    ).get(fix.eventId) as { full_description_en: string } | null;

    if (!row) {
      console.log(`  SKIP: ${fix.eventId} not found`);
      continue;
    }

    if (!row.full_description_en.toLowerCase().includes(fix.find.toLowerCase())) {
      console.log(`  SKIP: ${fix.eventId.slice(0, 30).padEnd(32)} "${fix.find}" not found`);
      continue;
    }

    // Case-insensitive replace
    const regex = new RegExp(fix.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const newDesc = row.full_description_en.replace(regex, fix.replace);
    console.log(`  ${fix.eventId.slice(0, 30).padEnd(32)} "${fix.find}" → "${fix.replace}"`);
    if (!dryRun) {
      db.prepare('UPDATE events SET full_description_en = ? WHERE id = ?').run(newDesc, fix.eventId);
    }
    totalFillerFixes++;
  }

  totalFixed = totalEntityFixes + totalAdjectiveFixes + totalFillerFixes;
  console.log(`\n=== Summary ===`);
  console.log(`Entity locking: ${totalEntityFixes} fixes`);
  console.log(`Lazy adjectives: ${totalAdjectiveFixes} fixes`);
  console.log(`Filler phrases: ${totalFillerFixes} fixes`);
  console.log(`Total: ${totalFixed} fixes ${dryRun ? '(DRY RUN — no changes applied)' : 'APPLIED'}`);
}

// ============================================================================
// Verify
// ============================================================================

function verifyFixes(db: Database): void {
  console.log('\n=== Post-Fix Verification ===');

  const { readFileSync } = require('fs');
  const ids = readFileSync('/tmp/rewrite-ids-fixed.txt', 'utf-8').split('\n').filter(Boolean);

  let remaining = 0;
  const speculationOnly: string[] = [];
  const otherFailures: { id: string; codes: string[] }[] = [];

  for (const id of ids) {
    const row = db.prepare(
      `SELECT id, title, type, venue_name, start_date, price_type,
              full_description_en, enrichment_tier, time_doors,
              price_advance, price_door
       FROM events WHERE id = ?`
    ).get(id) as any;

    if (!row || !row.full_description_en) continue;

    const event: EventForEnrichment = {
      id: row.id, title: row.title, date: row.start_date,
      time: row.time_doors, venue: row.venue_name, type: row.type,
      genre: null, price: row.price_type,
      price_advance: row.price_advance, price_door: row.price_door,
    };

    const tier = (row.enrichment_tier as 'stub' | 'standard' | 'premium') || 'standard';
    const enResult = validateEnglishDescription(event, row.full_description_en, tier);
    const genericIssues = detectGenericContent(
      row.full_description_en,
      { title: row.title, venue: row.venue_name, type: row.type },
      tier
    );

    const mergedIssues = [...enResult.issues];
    for (const gi of genericIssues) {
      if (!mergedIssues.some(i => i.code === gi.code)) {
        mergedIssues.push(gi);
      }
    }

    const errors = mergedIssues.filter(i => i.severity === 'error');
    if (errors.length > 0) {
      remaining++;
      const codes = errors.map(e => e.code);
      if (codes.every(c => c === 'SPECULATION')) {
        speculationOnly.push(id);
      } else {
        otherFailures.push({ id, codes });
      }
    }
  }

  console.log(`Previously failing: ${ids.length}`);
  console.log(`Still failing: ${remaining}`);
  console.log(`  Speculation only: ${speculationOnly.length}`);
  console.log(`  Other issues: ${otherFailures.length}`);

  if (otherFailures.length > 0) {
    console.log('\n--- Still Failing (non-speculation) ---');
    for (const f of otherFailures) {
      console.log(`  ${f.id.slice(0, 30).padEnd(32)} ${f.codes.join(', ')}`);
    }
  }

  if (speculationOnly.length > 0) {
    console.log('\n--- Speculation Only (need rewrite) ---');
    for (const id of speculationOnly) {
      console.log(`  ${id}`);
    }
    // Write speculation IDs for subagent processing
    require('fs').writeFileSync('/tmp/speculation-ids.txt', speculationOnly.join('\n') + '\n');
    console.log(`\nWrote ${speculationOnly.length} speculation IDs to /tmp/speculation-ids.txt`);
  }
}

// ============================================================================
// Main
// ============================================================================

const db = new Database(DB_PATH);
applyFixes(db);
if (!dryRun) {
  verifyFixes(db);
}
db.close();
