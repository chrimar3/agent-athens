#!/usr/bin/env bun

// S136 one-shot CSV schema migration:
// drop `ai_citations_count` (idx 16); add 8 new columns (gsc_*_7d, bing_*_7d) at idx 16-23.
// 20-col → 27-col. Idempotent: re-runs after migration are no-ops.

import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = join(import.meta.dir, '..');
const CSV_PATH = join(PROJECT_DIR, 'data/search-visibility-log.csv');
const BACKUP_PATH = CSV_PATH + '.pre-s136-backup';

const OLD_HEADER =
  'date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,' +
  'indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,' +
  'robots_http,sitemap_http,llms_http,sample_accessible,sample_size,' +
  'gsc_indexed,bing_indexed,ai_citations_count,' +
  'enriched_last_24h,wrapper_discrepancy_last_24h,notes';

const NEW_HEADER =
  'date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,' +
  'indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,' +
  'robots_http,sitemap_http,llms_http,sample_accessible,sample_size,' +
  'gsc_indexed,bing_indexed,' +
  'gsc_impressions_7d,gsc_clicks_7d,gsc_avg_position_7d,gsc_top10_count_7d,' +
  'bing_impressions_7d,bing_clicks_7d,bing_avg_position_7d,bing_top10_count_7d,' +
  'enriched_last_24h,wrapper_discrepancy_last_24h,notes';

const AI_CITATIONS_IDX = 16; // index in old header to drop
const NEW_COLS_COUNT = 8;

function transformRow(cols: string[]): string[] {
  // Drop old index 16 (ai_citations_count), insert 8 empties at new positions 16-23
  const before = cols.slice(0, AI_CITATIONS_IDX); // 0-15
  const after = cols.slice(AI_CITATIONS_IDX + 1); // old 17-19 → new 24-26
  const inserted = new Array(NEW_COLS_COUNT).fill('');
  return [...before, ...inserted, ...after];
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const tag = dryRun ? '[dry-run] ' : '';

  if (!existsSync(CSV_PATH)) {
    console.error(`ABORT: ${CSV_PATH} not found`);
    process.exit(1);
  }

  const raw = readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split('\n');
  // trailing empty line if file ends with \n
  const trailingNewline = lines[lines.length - 1] === '';
  const dataLines = trailingNewline ? lines.slice(0, -1) : lines;

  if (dataLines.length === 0) {
    console.error('ABORT: CSV is empty');
    process.exit(1);
  }

  const header = dataLines[0];
  const rows = dataLines.slice(1);

  // Idempotency check
  if (header === NEW_HEADER) {
    console.log(`${tag}Header already matches new shape (27 cols). No migration needed.`);
    return;
  }
  if (header !== OLD_HEADER) {
    console.error(`ABORT: Header does not match expected OLD or NEW shape.\nGot:\n  ${header}\nExpected OLD:\n  ${OLD_HEADER}`);
    process.exit(1);
  }

  const oldColCount = header.split(',').length;
  if (oldColCount !== 20) {
    console.error(`ABORT: Expected 20-col OLD header, got ${oldColCount}`);
    process.exit(1);
  }

  const newRows = rows.map((line) => {
    if (line === '') return ''; // preserve blank lines (shouldn't exist mid-file but be safe)
    const cols = line.split(',');
    if (cols.length !== oldColCount) {
      console.warn(`WARN: row has ${cols.length} cols, expected ${oldColCount}: ${line.slice(0, 60)}...`);
    }
    return transformRow(cols).join(',');
  });

  // Assert delta
  const newHeaderCols = NEW_HEADER.split(',').length;
  if (newHeaderCols !== 27) {
    console.error(`ABORT: new header is ${newHeaderCols} cols, expected 27`);
    process.exit(1);
  }
  if (newHeaderCols - oldColCount !== 7) {
    console.error(`ABORT: col delta is ${newHeaderCols - oldColCount}, expected +7`);
    process.exit(1);
  }

  console.log(`${tag}Migration plan:`);
  console.log(`  CSV path: ${CSV_PATH}`);
  console.log(`  Backup path: ${BACKUP_PATH}`);
  console.log(`  Rows: ${rows.length} → ${newRows.length} (unchanged)`);
  console.log(`  Columns: ${oldColCount} → ${newHeaderCols} (+7)`);
  console.log(`  Drop: ai_citations_count (old idx ${AI_CITATIONS_IDX})`);
  console.log(`  Add at new indices 16-23: gsc_impressions_7d, gsc_clicks_7d, gsc_avg_position_7d, gsc_top10_count_7d, bing_impressions_7d, bing_clicks_7d, bing_avg_position_7d, bing_top10_count_7d`);
  console.log(`  Sample first-row transform:`);
  if (rows[0]) {
    console.log(`    OLD: ${rows[0]}`);
    console.log(`    NEW: ${newRows[0]}`);
  }

  if (dryRun) {
    console.log(`${tag}Dry-run complete. Re-run without --dry-run to apply.`);
    return;
  }

  // Backup original
  copyFileSync(CSV_PATH, BACKUP_PATH);
  console.log(`Backup written: ${BACKUP_PATH}`);

  // Atomic write
  const newContent = [NEW_HEADER, ...newRows].join('\n') + (trailingNewline ? '\n' : '');
  const tmp = CSV_PATH + '.tmp';
  writeFileSync(tmp, newContent);
  renameSync(tmp, CSV_PATH);
  console.log(`Migration applied. CSV is now 27 columns.`);
}

main();
