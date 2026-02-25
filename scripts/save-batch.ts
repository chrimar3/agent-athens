#!/usr/bin/env bun
/**
 * Save Batch — Enrichment v4
 *
 * Reads description files from temp-descriptions/, saves to DB with full
 * enrichment logging (before/after tracking, batch metadata, quality scores).
 *
 * Usage:
 *   bun run scripts/save-batch.ts [--session=<name>] [--batch=<number>] [--dry-run]
 *   bun run scripts/save-batch.ts --session=feb-2026 --batch=3
 *
 * Expects files like:
 *   temp-descriptions/<event-id>.md          — description content
 *   temp-descriptions/<event-id>.tags.json   — optional tags array
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Database from 'bun:sqlite';
import { validateQualityGates } from '../src/enrichment/quality-gates';
import { countWords } from '../src/enrichment/word-counter';
import type { EventForEnrichment } from '../src/enrichment/description-generator';

const DB_PATH = 'data/events.db';
const DESCRIPTIONS_DIR = 'temp-descriptions';

interface SaveResult {
  eventId: string;
  success: boolean;
  wordCount: number;
  qualityScore: number;
  hadPreviousDescription: boolean;
  error?: string;
}

function parseArgs(): { session: string; batch: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  const sessionArg = args.find(a => a.startsWith('--session='));
  const batchArg = args.find(a => a.startsWith('--batch='));
  const dryRun = args.includes('--dry-run');

  // Default session name: month-year
  const now = new Date();
  const defaultSession = `${now.toLocaleString('en', { month: 'short' }).toLowerCase()}-${now.getFullYear()}`;

  return {
    session: sessionArg?.split('=')[1] || defaultSession,
    batch: parseInt(batchArg?.split('=')[1] || '1', 10),
    dryRun,
  };
}

function loadEventContext(db: Database, eventId: string): EventForEnrichment | null {
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

function main(): void {
  const { session, batch, dryRun } = parseArgs();

  console.log(`\n=== Save Batch ${dryRun ? '(DRY RUN)' : ''} ===`);
  console.log(`Session: ${session} | Batch: ${batch}\n`);

  if (!existsSync(DESCRIPTIONS_DIR)) {
    console.error(`No ${DESCRIPTIONS_DIR}/ directory found.`);
    process.exit(1);
  }

  // Find all .md files in temp-descriptions/
  const files = readdirSync(DESCRIPTIONS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    console.log('No description files found in temp-descriptions/');
    process.exit(0);
  }

  console.log(`Found ${files.length} description file(s)\n`);

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  // Ensure enrichment_log has v4 columns
  ensureV4Columns(db);

  const results: SaveResult[] = [];

  for (const file of files) {
    const eventId = file.replace('.md', '');
    const descPath = join(DESCRIPTIONS_DIR, file);
    const tagsPath = join(DESCRIPTIONS_DIR, `${eventId}.tags.json`);

    const description = readFileSync(descPath, 'utf-8');
    const wordResult = countWords(description);

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

    // Run quality gates
    const tier = wordResult.count >= 250 ? 'premium' : wordResult.count >= 150 ? 'standard' : 'stub';
    const gateResult = validateQualityGates(event, description, tier);

    const tagsJson = tags ? JSON.stringify(tags) : current?.tags || null;

    if (!dryRun) {
      // Update event
      db.prepare(`
        UPDATE events SET
          full_description = ?,
          tags = ?,
          needs_enrichment = 0,
          enriched_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(description, tagsJson, eventId);

      // Log to enrichment_log with full before/after
      db.prepare(`
        INSERT INTO enrichment_log (
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

    const status = gateResult.passed ? 'OK' : 'WARN';
    console.log(`  ${gateResult.passed ? '+' : '!'} ${eventId.substring(0, 12)}... | ${wordResult.count}w | score:${gateResult.score} | ${status}${tags ? ` | ${tags.length} tags` : ''}`);

    results.push({
      eventId,
      success: true,
      wordCount: wordResult.count,
      qualityScore: gateResult.score,
      hadPreviousDescription: descriptionBefore !== null,
    });
  }

  db.close();

  // Summary
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const avgScore = succeeded.length > 0
    ? Math.round(succeeded.reduce((sum, r) => sum + r.qualityScore, 0) / succeeded.length)
    : 0;

  console.log(`\n=== Summary ===`);
  console.log(`Saved: ${succeeded.length}/${results.length}${dryRun ? ' (dry run)' : ''}`);
  console.log(`Average quality score: ${avgScore}/100`);
  console.log(`First enrichments: ${succeeded.filter(r => !r.hadPreviousDescription).length}`);
  console.log(`Re-enrichments: ${succeeded.filter(r => r.hadPreviousDescription).length}`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.map(r => r.eventId).join(', ')}`);
  }
  console.log('');
}

function ensureV4Columns(db: Database): void {
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

main();
