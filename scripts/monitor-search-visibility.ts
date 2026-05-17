#!/usr/bin/env bun

/**
 * Search Visibility Monitor
 *
 * Daily monitoring script that logs search-engine discoverability metrics
 * to an append-only CSV. Automated metrics run unattended; manual metrics
 * (GSC indexed, Bing indexed) are provided via CLI flags. Bing 7d aggregates
 * read from logs/bing-latest.json (written by scripts/fetch-bing-metrics.ts).
 * GSC 7d aggregates hardcoded to STALE pending S138 OAuth fallback.
 *
 * Usage:
 *   bun run scripts/monitor-search-visibility.ts
 *   bun run scripts/monitor-search-visibility.ts --gsc-indexed=450 --bing-indexed=120
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';

const PROJECT_DIR = join(import.meta.dir, '..');
const DIST_DIR = join(PROJECT_DIR, 'dist');
const CSV_PATH = join(PROJECT_DIR, 'data/search-visibility-log.csv');
const DB_PATH = join(PROJECT_DIR, 'data/events.db');
const BASE_URL = 'https://agentathens.com';

export const CSV_HEADER = 'date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,robots_http,sitemap_http,llms_http,sample_accessible,sample_size,gsc_indexed,bing_indexed,gsc_impressions_7d,gsc_clicks_7d,gsc_avg_position_7d,gsc_top10_count_7d,bing_impressions_7d,bing_clicks_7d,bing_avg_position_7d,bing_top10_count_7d,enriched_last_24h,wrapper_discrepancy_last_24h,notes';
const ENRICHED_COL_INDEX = 24;
const WRAPPER_DISCREPANCY_COL_INDEX = 25;

// ── CLI arg parsing ──────────────────────────────────────────

function parseManualMetrics(): { gscIndexed: string; bingIndexed: string } {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return {
    gscIndexed: args['gsc-indexed'] ?? '',
    bingIndexed: args['bing-indexed'] ?? '',
  };
}

// ── Sitemap metrics ──────────────────────────────────────────

function loadSitemapUrls(filename: string): string[] {
  const filepath = join(DIST_DIR, filename);
  try {
    const xml = readFileSync(filepath, 'utf-8');
    const urls: string[] = [];
    const regex = /<loc>([^<]+)<\/loc>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  } catch {
    return [];
  }
}

// ── IndexNow stats from JSON ─────────────────────────────────

interface IndexNowStats {
  submitted: number | string;
  success: number | string;
  batches: number | string;
  lastRun: string;
}

function getIndexNowStats(): IndexNowStats {
  const jsonPath = join(PROJECT_DIR, 'logs/indexnow-latest.json');
  try {
    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    const ageHours = (Date.now() - new Date(data.timestamp).getTime()) / 3600000;
    if (ageHours > 25) {
      return { submitted: 'STALE', success: 'STALE', batches: 'STALE', lastRun: data.timestamp };
    }
    return {
      submitted: data.submitted,
      success: data.success,
      batches: data.batches,
      lastRun: data.timestamp,
    };
  } catch {
    return { submitted: '', success: '', batches: '', lastRun: '' };
  }
}

// ── Enrichment throughput stats ──────────────────────────────
// Observability side-effects must never kill production path.
// All DB/file access wrapped in try/catch; on failure, emit ''.

export interface EnrichmentStats {
  enrichedLast24h: number | string;
}

export function lastRowBefore(today: string, csvPath: string = CSV_PATH): string[] | null {
  try {
    if (!existsSync(csvPath)) return null;
    const lines = readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1);
    for (let i = lines.length - 1; i >= 0; i--) {
      const fields = lines[i].split(',');
      if (fields[0] !== today) return fields;
    }
    return null;
  } catch {
    return null;
  }
}

export function getEnrichmentStats(
  today: string,
  dbPath: string = DB_PATH,
  csvPath: string = CSV_PATH,
): EnrichmentStats {
  try {
    // Production DB is WAL mode; readonly:true forbids creating the WAL/SHM
    // helper files SQLite needs to READ a WAL DB, so opening fails with
    // SQLITE_CANTOPEN. This is SELECT-only; correctness is preserved without
    // the flag, and the connection closes immediately.
    const db = new Database(dbPath);
    const row = db
      .query<{ c: number }, []>(
        "SELECT COUNT(*) as c FROM events WHERE enriched_at > datetime('now','-1 day')",
      )
      .get();
    db.close();
    const count = row?.c ?? 0;

    const priorRow = lastRowBefore(today, csvPath);
    const priorEnrich = priorRow?.[ENRICHED_COL_INDEX];
    const priorWasZero = priorEnrich === '0';

    if (count === 0 && priorWasZero) return { enrichedLast24h: 'STALE_ENRICHMENT' };
    return { enrichedLast24h: count };
  } catch {
    return { enrichedLast24h: '' };
  }
}

export function migrateCsvIfNeeded(csvPath: string = CSV_PATH): void {
  try {
    if (!existsSync(csvPath)) {
      writeFileSync(csvPath, CSV_HEADER + '\n');
      return;
    }
    const content = readFileSync(csvPath, 'utf-8');
    const firstNewline = content.indexOf('\n');
    if (firstNewline < 0) return;

    const existingHeader = content.slice(0, firstNewline);
    if (existingHeader === CSV_HEADER) return;

    const oldCols = existingHeader.split(',').length;
    const newCols = CSV_HEADER.split(',').length;
    const toInsert = newCols - oldCols;
    // Only handle pure append: new columns inserted before the trailing `notes`
    // column. Any out-of-order header divergence is unsafe to auto-migrate.
    if (toInsert <= 0) return;

    const rest = content.slice(firstNewline + 1);
    const migratedLines = rest.split('\n').map(line => {
      if (line.length === 0) return line;
      const fields = line.split(',');
      if (fields.length !== oldCols) return line;
      // Insert `toInsert` empty fields right before the last field (notes).
      fields.splice(oldCols - 1, 0, ...Array(toInsert).fill(''));
      return fields.join(',');
    });

    const tmpPath = csvPath + '.tmp';
    writeFileSync(tmpPath, CSV_HEADER + '\n' + migratedLines.join('\n'));
    renameSync(tmpPath, csvPath);
  } catch {
    // never throw — observability must not kill production
  }
}

// ── Manual-metrics in-place patch ────────────────────────────
// Patches today's existing row's manual columns (gsc_indexed,
// bing_indexed). Strict: refuses to insert when today's row is missing —
// surfaces launchd failure rather than papering over it. Clobber-protected:
// requires force=true to overwrite already-populated manual values. Atomic:
// read → modify in memory → write .tmp → renameSync, mirroring migrateCsvIfNeeded.

export function updateTodayRowManualMetrics(
  today: string,
  manual: { gscIndexed: string; bingIndexed: string },
  force: boolean,
  csvPath: string = CSV_PATH,
): 'updated' | 'no-row' | 'clobber-blocked' {
  const content = readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');
  const headerCols = lines[0].split(',');
  const gscIdx = headerCols.indexOf('gsc_indexed');
  const bingIdx = headerCols.indexOf('bing_indexed');

  let rowIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith(today + ',')) {
      rowIdx = i;
      break;
    }
  }
  if (rowIdx === -1) return 'no-row';

  const row = lines[rowIdx].split(',');
  const populated = row[gscIdx] || row[bingIdx];
  if (populated && !force) return 'clobber-blocked';

  row[gscIdx] = manual.gscIndexed;
  row[bingIdx] = manual.bingIndexed;
  lines[rowIdx] = row.join(',');

  const tmpPath = csvPath + '.tmp';
  writeFileSync(tmpPath, lines.join('\n'));
  renameSync(tmpPath, csvPath);
  return 'updated';
}

// ── Wrapper-reconciliation discrepancy signal (Session 98) ───
// Counts auto-enrich log lines where the subprocess exited non-zero but saves
// happened anyway — the stream-idle-misreport class Session 98 was built to
// surface. If >0 for 3 consecutive daily rows, emit STALE_WRAPPER to flag
// that the underlying upstream issue is persistent.

const LOGS_DIR = join(PROJECT_DIR, 'logs');
const WRAPPER_MISREPORT_PATTERN = /WARN: subprocess exited \d+ but \d+ events saved successfully/g;

export interface WrapperDiscrepancyStats {
  wrapperDiscrepancyLast24h: number | string;
}

export function yesterdayAthensDate(today: string): string {
  // Parse YYYY-MM-DD, subtract one day in UTC (safe at the day-granularity we need).
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function countMisreportsInLog(logPath: string): number {
  try {
    if (!existsSync(logPath)) return 0;
    const content = readFileSync(logPath, 'utf-8');
    const matches = content.match(WRAPPER_MISREPORT_PATTERN);
    return matches?.length ?? 0;
  } catch {
    return 0;
  }
}

export function getWrapperDiscrepancyStats(
  today: string,
  csvPath: string = CSV_PATH,
  logsDir: string = LOGS_DIR,
): WrapperDiscrepancyStats {
  try {
    // Count misreports in today's + yesterday's auto-enrich logs. Covers a full
    // rolling 24h at daily granularity without forcing log-line timestamp parsing.
    const yesterday = yesterdayAthensDate(today);
    const count =
      countMisreportsInLog(join(logsDir, `auto-enrich-${today}.log`)) +
      countMisreportsInLog(join(logsDir, `auto-enrich-${yesterday}.log`));

    // STALE_WRAPPER trigger: count > 0 today AND the last two prior daily rows
    // also had non-zero, non-empty counts. Three-consecutive-day elevated signal.
    if (count > 0) {
      const priorRows = lastTwoRowsBefore(today, csvPath);
      const hadDiscrepancy = (row: string[] | null) => {
        if (!row) return false;
        const v = row[WRAPPER_DISCREPANCY_COL_INDEX];
        return v !== undefined && v !== '' && v !== '0' && v !== 'STALE_WRAPPER';
      };
      if (hadDiscrepancy(priorRows[0]) && hadDiscrepancy(priorRows[1])) {
        return { wrapperDiscrepancyLast24h: 'STALE_WRAPPER' };
      }
    }
    return { wrapperDiscrepancyLast24h: count };
  } catch {
    return { wrapperDiscrepancyLast24h: '' };
  }
}

export function lastTwoRowsBefore(today: string, csvPath: string = CSV_PATH): [string[] | null, string[] | null] {
  try {
    if (!existsSync(csvPath)) return [null, null];
    const lines = readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1);
    const collected: string[][] = [];
    const seenDates = new Set<string>();
    for (let i = lines.length - 1; i >= 0 && collected.length < 2; i--) {
      const fields = lines[i].split(',');
      const rowDate = fields[0];
      if (rowDate === today) continue;
      if (seenDates.has(rowDate)) continue; // one row per date — use first seen (newest)
      seenDates.add(rowDate);
      collected.push(fields);
    }
    return [collected[0] ?? null, collected[1] ?? null];
  } catch {
    return [null, null];
  }
}

// ── Bing 7d metrics from logs/bing-latest.json ───────────────
// Reads the JSON written by scripts/fetch-bing-metrics.ts. Status drives
// marker semantics: ok → numeric values, stale → 'STALE', auth_fail →
// 'AUTH_FAIL'. Missing/unreadable JSON → 'STALE' (parity with existing
// STALE markers at lines 78, 136, 281).

export interface BingMetricsRow {
  impressions: number | string;
  clicks: number | string;
  avgPosition: number | string;
  top10: number | string;
}

export function getBingMetrics(jsonPath: string = join(PROJECT_DIR, 'logs/bing-latest.json')): BingMetricsRow {
  const staleRow: BingMetricsRow = { impressions: 'STALE', clicks: 'STALE', avgPosition: 'STALE', top10: 'STALE' };
  try {
    if (!existsSync(jsonPath)) return staleRow;
    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    if (data?.status === 'auth_fail') {
      return { impressions: 'AUTH_FAIL', clicks: 'AUTH_FAIL', avgPosition: 'AUTH_FAIL', top10: 'AUTH_FAIL' };
    }
    if (data?.status === 'stale') return staleRow;
    if (data?.status === 'ok' && data?.aggregate) {
      const agg = data.aggregate;
      return {
        impressions: agg.impressions_7d ?? 'STALE',
        clicks: agg.clicks_7d ?? 'STALE',
        avgPosition: agg.avg_position_7d ?? 'STALE',
        top10: agg.top10_count_7d ?? 'STALE',
      };
    }
    return staleRow;
  } catch {
    return staleRow;
  }
}

// ── Endpoint reachability ────────────────────────────────────

async function headCheck(url: string): Promise<number> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

// ── Stratified sample accessibility ──────────────────────────
// 4 events + 3 venues + 3 editorial = 10 URLs
// Concurrent HEAD requests, 5s timeout each

function randomSample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function sampleAccessibility(
  eventUrls: string[],
  venueUrls: string[],
  editorialUrls: string[],
): Promise<{ accessible: number; sampleSize: number }> {
  const sampleUrls = [
    ...randomSample(eventUrls, 4),
    ...randomSample(venueUrls, 3),
    ...randomSample(editorialUrls, 3),
  ];

  const statuses = await Promise.all(sampleUrls.map(url => headCheck(url)));
  const accessible = statuses.filter(s => s === 200).length;

  return { accessible, sampleSize: sampleUrls.length };
}

// ── Athens date ──────────────────────────────────────────────

function athensDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--update')) {
    const today = athensDate();
    const result = updateTodayRowManualMetrics(today, parseManualMetrics(), argv.includes('--force'));
    console.log(`[update] today=${today} result=${result}`);
    return;
  }

  console.log('📊 Search Visibility Monitor\n');

  const manual = parseManualMetrics();

  // Load sitemaps once — reuse for counts and sampling
  const eventUrls = loadSitemapUrls('sitemap-events.xml');
  const venueUrls = loadSitemapUrls('sitemap-venues.xml');
  const editorialUrls = loadSitemapUrls('sitemap-editorial.xml');
  const sitemapTotal = eventUrls.length + venueUrls.length + editorialUrls.length;

  console.log(`Sitemaps: events=${eventUrls.length}, venues=${venueUrls.length}, editorial=${editorialUrls.length}, total=${sitemapTotal}`);

  const indexnow = getIndexNowStats();
  console.log(`IndexNow: submitted=${indexnow.submitted}, success=${indexnow.success}, batches=${indexnow.batches}`);

  // Ensure CSV has current header; auto-inserts missing trailing columns
  // (insert-before-notes only — drop+insert reshapes are handled by
  // standalone migration scripts like migrate-search-visibility-csv.ts).
  // Must happen before enrichment stats read so lastRowBefore sees migrated rows.
  migrateCsvIfNeeded();

  const today = athensDate();
  const enrichment = getEnrichmentStats(today);
  console.log(`Enrichment: last_24h=${enrichment.enrichedLast24h}`);

  const wrapperStats = getWrapperDiscrepancyStats(today);
  console.log(`Wrapper discrepancy last_24h: ${wrapperStats.wrapperDiscrepancyLast24h}`);

  const [robots, sitemap, llms] = await Promise.all([
    headCheck(`${BASE_URL}/robots.txt`),
    headCheck(`${BASE_URL}/sitemap-index.xml`),
    headCheck(`${BASE_URL}/llms.txt`),
  ]);
  console.log(`Endpoints: robots=${robots}, sitemap=${sitemap}, llms=${llms}`);

  const sample = await sampleAccessibility(eventUrls, venueUrls, editorialUrls);
  console.log(`Sample accessibility: ${sample.accessible}/${sample.sampleSize}`);

  if (manual.gscIndexed || manual.bingIndexed) {
    console.log(`Manual: gsc=${manual.gscIndexed || '-'}, bing=${manual.bingIndexed || '-'}`);
  }

  const bing = getBingMetrics();
  console.log(`Bing 7d: impressions=${bing.impressions}, clicks=${bing.clicks}, avgPos=${bing.avgPosition}, top10=${bing.top10}`);

  // Assemble CSV row (27 cols, S136 shape)
  const row = [
    today,
    eventUrls.length,
    venueUrls.length,
    editorialUrls.length,
    sitemapTotal,
    indexnow.submitted,
    indexnow.success,
    indexnow.batches,
    indexnow.lastRun,
    robots,
    sitemap,
    llms,
    sample.accessible,
    sample.sampleSize,
    manual.gscIndexed,
    manual.bingIndexed,
    // GSC 7d (idx 16-19): S138-pending — service-account add-user silent fail blocks
    // the GSC API path. See docs/known-issues.md "GSC Service Account Add-User Silent Fail"
    // and specs/s138-gsc-oauth-fallback.md. These flip to real values when S138 lands.
    'STALE',
    'STALE',
    'STALE',
    'STALE',
    // Bing 7d (idx 20-23): populated from logs/bing-latest.json
    bing.impressions,
    bing.clicks,
    bing.avgPosition,
    bing.top10,
    enrichment.enrichedLast24h,
    wrapperStats.wrapperDiscrepancyLast24h,
    '',
  ].join(',');

  appendFileSync(CSV_PATH, row + '\n');
  console.log(`✅ Row appended to ${CSV_PATH}`);
}

if (import.meta.main) {
  main();
}
