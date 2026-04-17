#!/usr/bin/env bun

/**
 * Search Visibility Monitor
 *
 * Daily monitoring script that logs search-engine discoverability metrics
 * to an append-only CSV. Automated metrics run unattended; manual metrics
 * (GSC indexed, Bing indexed, AI citations) are provided via CLI flags.
 *
 * Usage:
 *   bun run scripts/monitor-search-visibility.ts
 *   bun run scripts/monitor-search-visibility.ts --gsc-indexed=450 --bing-indexed=120
 *   bun run scripts/monitor-search-visibility.ts --ai-citations=3
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = join(import.meta.dir, '..');
const DIST_DIR = join(PROJECT_DIR, 'dist');
const CSV_PATH = join(PROJECT_DIR, 'data/search-visibility-log.csv');
const BASE_URL = 'https://agentathens.com';

const CSV_HEADER = 'date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,robots_http,sitemap_http,llms_http,sample_accessible,sample_size,gsc_indexed,bing_indexed,ai_citations_count,notes';

// ── CLI arg parsing ──────────────────────────────────────────

function parseManualMetrics(): { gscIndexed: string; bingIndexed: string; aiCitations: string } {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return {
    gscIndexed: args['gsc-indexed'] ?? '',
    bingIndexed: args['bing-indexed'] ?? '',
    aiCitations: args['ai-citations'] ?? '',
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

  const [robots, sitemap, llms] = await Promise.all([
    headCheck(`${BASE_URL}/robots.txt`),
    headCheck(`${BASE_URL}/sitemap-index.xml`),
    headCheck(`${BASE_URL}/llms.txt`),
  ]);
  console.log(`Endpoints: robots=${robots}, sitemap=${sitemap}, llms=${llms}`);

  const sample = await sampleAccessibility(eventUrls, venueUrls, editorialUrls);
  console.log(`Sample accessibility: ${sample.accessible}/${sample.sampleSize}`);

  if (manual.gscIndexed || manual.bingIndexed || manual.aiCitations) {
    console.log(`Manual: gsc=${manual.gscIndexed || '-'}, bing=${manual.bingIndexed || '-'}, ai=${manual.aiCitations || '-'}`);
  }

  // Assemble CSV row
  const row = [
    athensDate(),
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
    manual.aiCitations,
    '',
  ].join(',');

  // Append to CSV (create with header if missing)
  if (!existsSync(CSV_PATH)) {
    writeFileSync(CSV_PATH, CSV_HEADER + '\n');
    console.log(`\nCreated ${CSV_PATH}`);
  }
  appendFileSync(CSV_PATH, row + '\n');
  console.log(`✅ Row appended to ${CSV_PATH}`);
}

main();
