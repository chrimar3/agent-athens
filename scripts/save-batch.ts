#!/usr/bin/env bun
/**
 * Save Batch — Enrichment v4 (Manifest-Driven)
 *
 * Reads description files from temp-descriptions/ for event IDs listed in a
 * manifest file, saves to DB with full enrichment logging. Extracts opening
 * sentences for cross-batch dedup, and optionally cleans up batch files.
 *
 * Usage:
 *   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-35.manifest.json --session=batch-35 --batch=35
 *   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-35.manifest.json --batch=35 --clean
 *   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-35.manifest.json --dry-run
 *
 * Expects files like:
 *   temp-descriptions/<event-id>.md          — description content
 *   temp-descriptions/<event-id>.tags.json   — optional tags array
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import Database from 'bun:sqlite';
import { validateQualityGates, validateEnglishDescription, validateGreekDescription } from '../src/enrichment/quality-gates';
import { countWords } from '../src/enrichment/word-counter';
import type { EventForEnrichment } from '../src/enrichment/description-generator';
import { classifyEvent, getWordTarget, structureToTier } from '../src/enrichment/enrichment-matrix';

const DB_PATH = 'data/events.db';
const DESCRIPTIONS_DIR = 'temp-descriptions';
const RECENT_OPENINGS_PATH = join(DESCRIPTIONS_DIR, 'recent-openings.json');
const MAX_RECENT_OPENINGS = 30;

// ============================================================================
// Types
// ============================================================================

export interface SaveResult {
  eventId: string;
  success: boolean;
  wordCount: number;
  qualityScore: number;
  hadPreviousDescription: boolean;
  error?: string;
}

export interface BatchManifest {
  batch_id: number;
  generated_at: string;
  event_ids: string[];
  output_dir?: string;
}

export interface RecentOpening {
  event_id: string;
  opening_sentence: string;
  saved_at: string;
}

// ============================================================================
// CLI
// ============================================================================

export function parseArgs(): { session: string; batch: number; dryRun: boolean; manifestPath: string; clean: boolean } {
  const args = process.argv.slice(2);
  const sessionArg = args.find(a => a.startsWith('--session='));
  const batchArg = args.find(a => a.startsWith('--batch='));
  const manifestArg = args.find(a => a.startsWith('--manifest='));
  const dryRun = args.includes('--dry-run');
  const clean = args.includes('--clean');

  if (!manifestArg) {
    throw new Error('--manifest=<path> is required. Usage: bun run scripts/save-batch.ts --manifest=temp-briefs/batch-N.manifest.json');
  }

  // Default session name: month-year
  const now = new Date();
  const defaultSession = `${now.toLocaleString('en', { month: 'short' }).toLowerCase()}-${now.getFullYear()}`;

  return {
    session: sessionArg?.split('=')[1] || defaultSession,
    batch: parseInt(batchArg?.split('=')[1] || '1', 10),
    dryRun,
    manifestPath: manifestArg.split('=')[1],
    clean,
  };
}

// ============================================================================
// Manifest & Openings
// ============================================================================

export function loadManifest(path: string): BatchManifest {
  if (!existsSync(path)) {
    throw new Error(`Manifest not found: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    throw new Error(`Invalid manifest JSON: ${path}`);
  }
}

export function extractOpeningSentence(description: string): string {
  const match = description.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1].trim() : description.substring(0, 120).trim();
}

export function appendRecentOpenings(newOpenings: RecentOpening[]): void {
  let existing: RecentOpening[] = [];
  if (existsSync(RECENT_OPENINGS_PATH)) {
    try {
      existing = JSON.parse(readFileSync(RECENT_OPENINGS_PATH, 'utf-8'));
    } catch {
      existing = [];
    }
  }
  // Deduplicate by event_id, keeping the latest entry for each
  const byId = new Map<string, RecentOpening>();
  for (const entry of [...existing, ...newOpenings]) {
    byId.set(entry.event_id, entry);
  }
  const combined = [...byId.values()].slice(-MAX_RECENT_OPENINGS);
  writeFileSync(RECENT_OPENINGS_PATH, JSON.stringify(combined, null, 2), 'utf-8');
}

export function cleanupBatchFiles(eventIds: string[], outputDir?: string): void {
  const descDir = outputDir || DESCRIPTIONS_DIR;
  let cleaned = 0;
  for (const id of eventIds) {
    const mdPath = join(descDir, `${id}.md`);
    const grMdPath = join(descDir, `${id}.gr.md`);
    const tagsPath = join(descDir, `${id}.tags.json`);
    if (existsSync(mdPath)) {
      unlinkSync(mdPath);
      cleaned++;
    }
    if (existsSync(grMdPath)) {
      unlinkSync(grMdPath);
    }
    if (existsSync(tagsPath)) {
      unlinkSync(tagsPath);
    }
  }
  // If using a batch subdir, remove the review file and the dir itself if empty
  if (outputDir && existsSync(outputDir)) {
    const reviewPath = join(outputDir, `batch-${outputDir.split('batch-').pop()}-review.md`);
    if (existsSync(reviewPath)) unlinkSync(reviewPath);
    try {
      const { rmdirSync } = require('fs');
      rmdirSync(outputDir);
      console.log(`Cleaned up ${cleaned} description file(s) and removed ${outputDir}/`);
    } catch {
      // Dir not empty — that's fine, don't force-remove
      console.log(`Cleaned up ${cleaned} description file(s) from ${outputDir}/`);
    }
  } else {
    console.log(`Cleaned up ${cleaned} description file(s)`);
  }
}

// ============================================================================
// Core Logic
// ============================================================================

export function loadEventContext(db: Database, eventId: string): EventForEnrichment | null {
  const row = db.prepare(`
    SELECT id, title, start_date, venue_name, type, genres, price_type
    FROM events WHERE id = ?
  `).get(eventId) as any;

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
}

export function ensureV4Columns(db: Database): void {
  const columns = db.prepare("PRAGMA table_info(enrichment_log)").all() as { name: string }[];
  const existingCols = new Set(columns.map(c => c.name));

  const needed = [
    { name: 'description_before', type: 'TEXT' },
    { name: 'description_after', type: 'TEXT' },
    { name: 'batch_number', type: 'INTEGER' },
    { name: 'session_id', type: 'TEXT' },
    { name: 'quality_score', type: 'INTEGER' },
    { name: 'quality_issues', type: 'TEXT' },
    { name: 'tags_applied', type: 'TEXT' },
  ];

  for (const col of needed) {
    if (!existingCols.has(col.name)) {
      db.run(`ALTER TABLE enrichment_log ADD COLUMN ${col.name} ${col.type}`);
    }
  }
}

export function saveBatch(
  db: Database,
  eventIds: string[],
  session: string,
  batch: number,
  dryRun: boolean,
  outputDir?: string,
): { results: SaveResult[]; openings: RecentOpening[] } {
  ensureV4Columns(db);

  // Use batch-scoped dir if provided, fall back to flat temp-descriptions/
  const descDir = outputDir || DESCRIPTIONS_DIR;

  const results: SaveResult[] = [];
  const openings: RecentOpening[] = [];

  for (const eventId of eventIds) {
    const descPath = join(descDir, `${eventId}.md`);
    const grDescPath = join(descDir, `${eventId}.gr.md`);
    const tagsPath = join(descDir, `${eventId}.tags.json`);

    if (!existsSync(descPath)) {
      results.push({
        eventId,
        success: false,
        wordCount: 0,
        qualityScore: 0,
        hadPreviousDescription: false,
        error: `Description file not found: ${descPath}`,
      });
      console.log(`  x ${eventId} — description file missing`);
      continue;
    }

    const description = readFileSync(descPath, 'utf-8');
    const wordResult = countWords(description);

    // Load optional Greek description (secondary language)
    const hasGreek = existsSync(grDescPath);
    const grDescription = hasGreek ? readFileSync(grDescPath, 'utf-8') : null;
    const grWordCount = grDescription ? countWords(grDescription) : null;

    // Load optional tags
    let tags: string[] | null = null;
    if (existsSync(tagsPath)) {
      try {
        tags = JSON.parse(readFileSync(tagsPath, 'utf-8'));
      } catch {
        console.log(`  WARNING: Invalid tags file for ${eventId}, skipping tags`);
      }
    }

    // Load event context for quality check
    const event = loadEventContext(db, eventId);
    if (!event) {
      results.push({
        eventId,
        success: false,
        wordCount: wordResult.count,
        qualityScore: 0,
        hadPreviousDescription: false,
        error: 'Event not found in DB',
      });
      console.log(`  x ${eventId} — event not found in DB`);
      continue;
    }

    // Read current description (for before/after logging)
    const current = db.prepare("SELECT full_description, tags FROM events WHERE id = ?")
      .get(eventId) as { full_description: string | null; tags: string | null } | null;
    const descriptionBefore = current?.full_description || null;

    // Determine tier from event type (via enrichment matrix), not word count
    const target = getWordTarget({
      type: event.type || 'other',
      venue_name: event.venue,
      title: event.title,
    });
    const tier = structureToTier(target.structure);
    const gateResult = validateQualityGates(event, description, tier);

    // Validate Greek description if present (secondary language)
    let grGateResult = null;
    if (grDescription) {
      grGateResult = validateGreekDescription(event, grDescription, tier);
    }

    const tagsJson = tags ? JSON.stringify(tags) : current?.tags || null;

    if (!dryRun) {
      // Update event — English .md is primary (display + EN column), Greek .gr.md is secondary
      db.prepare(`
        UPDATE events SET
          full_description = ?,
          full_description_en = ?,
          full_description_gr = ?,
          tags = ?,
          needs_enrichment = 0,
          enriched_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(description, description, grDescription, tagsJson, eventId);

      // Log to enrichment_log with full before/after
      db.prepare(`
        INSERT OR REPLACE INTO enrichment_log (
          event_id, enrichment_version, description_before, description_after,
          batch_number, session_id, quality_score, quality_issues,
          tags_applied, word_count_en
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId, 'v4', descriptionBefore, description,
        batch, session, gateResult.score,
        JSON.stringify(gateResult.issues.map(i => `[${i.severity}] ${i.code}: ${i.message}`)),
        tagsJson, wordResult.count
      );
    }

    // Extract opening sentence
    openings.push({
      event_id: eventId,
      opening_sentence: extractOpeningSentence(description),
      saved_at: new Date().toISOString(),
    });

    const grTag = grDescription ? ` | GR:${grWordCount?.count ?? 0}w` : '';
    const grStatus = grGateResult ? (grGateResult.passed ? '/GR:OK' : '/GR:WARN') : '';
    const status = gateResult.passed ? 'OK' : 'WARN';
    console.log(`  ${gateResult.passed ? '+' : '!'} ${eventId.substring(0, 12)}... | ${wordResult.count}w${grTag} | score:${gateResult.score}${grGateResult ? `/${grGateResult.score}` : ''} | ${status}${grStatus}${tags ? ` | ${tags.length} tags` : ''}`);

    results.push({
      eventId,
      success: true,
      wordCount: wordResult.count,
      qualityScore: gateResult.score,
      hadPreviousDescription: descriptionBefore !== null,
    });
  }

  return { results, openings };
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const { session, batch, dryRun, manifestPath, clean } = parseArgs();

  console.log(`\n=== Save Batch ${dryRun ? '(DRY RUN)' : ''} ===`);
  console.log(`Session: ${session} | Batch: ${batch} | Manifest: ${manifestPath}\n`);

  const manifest = loadManifest(manifestPath);
  console.log(`Manifest: ${manifest.event_ids.length} event(s) from batch ${manifest.batch_id}\n`);

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  const { results, openings } = saveBatch(db, manifest.event_ids, session, batch, dryRun, manifest.output_dir);

  db.close();

  // Append opening sentences
  if (!dryRun && openings.length > 0) {
    appendRecentOpenings(openings);
    console.log(`\nAppended ${openings.length} opening(s) to recent-openings.json`);
  }

  // Summary
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const anyFailed = failed.length > 0;
  const avgScore = succeeded.length > 0
    ? Math.round(succeeded.reduce((sum, r) => sum + r.qualityScore, 0) / succeeded.length)
    : 0;

  console.log(`\n=== Summary ===`);
  console.log(`Saved: ${succeeded.length}/${results.length}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Average quality score: ${avgScore}/100`);
  console.log(`First enrichments: ${succeeded.filter(r => !r.hadPreviousDescription).length}`);
  console.log(`Re-enrichments: ${succeeded.filter(r => r.hadPreviousDescription).length}`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.map(r => `${r.eventId} (${r.error})`).join(', ')}`);
  }

  // Cleanup
  if (clean && !dryRun) {
    if (anyFailed) {
      console.log(`\nSkipping cleanup: ${failed.length} event(s) failed — preserving files for retry`);
    } else {
      console.log('');
      cleanupBatchFiles(manifest.event_ids, manifest.output_dir);
    }
  }

  console.log('');
}

// Only run main() when executed directly, not when imported for testing
const isDirectRun = import.meta.path === Bun.main;
if (isDirectRun) {
  main();
}
