#!/usr/bin/env bun
/**
 * Agent Athens - Health Check Script
 *
 * Generates health reports for the data pipeline.
 *
 * Usage:
 *   bun run scripts/health-check.ts           # Daily health report
 *   bun run scripts/health-check.ts --weekly  # 7-day trend report
 *   bun run scripts/health-check.ts --quality # Data quality audit
 *   bun run scripts/health-check.ts --output /path/to/report.txt
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const DB_PATH = join(import.meta.dir, '../data/events.db');
const REPORTS_DIR = join(import.meta.dir, '../data/health-reports');

// 40 min. Was 30s — which fired on every run once builds grew to 342-1883s,
// making the report unreadable as truth. 2400s catches genuine runaways only.
export const BUILD_TIME_WARN_MS = 2_400_000;

// One population for every ratio the report prints: visible upcoming events,
// end_date-aware for exhibitions (Tier-1 rule — a running exhibition is
// upcoming). Numerator and denominator must both use this, or the report
// prints nonsense like "2546/421 (604.8%) enriched" (2026-08-10 report).
const VISIBLE_UPCOMING = `
  location_status IN ('verified_athens', 'pass_through')
  AND date(COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date)) >= date('now')
`;

interface ScrapeStats {
  source: string;
  scraped_at: string;
  events_found: number;
  events_new: number;
  events_updated: number;
  duration_ms: number;
  success: number;
  error_message: string | null;
}

interface GenerationStats {
  generated_at: string;
  total_events: number;
  pages_generated: number;
  build_duration_ms: number;
  deploy_success: number;
}

interface Alert {
  level: 'CRITICAL' | 'WARNING';
  message: string;
}

// ============================================================================
// DATABASE QUERIES
// ============================================================================

function getDb(): Database {
  return new Database(DB_PATH);
}

function getLatestScrapeStats(): ScrapeStats[] {
  const db = getDb();
  try {
    // Get the most recent scrape for each source
    const stats = db.prepare(`
      SELECT s.*
      FROM scrape_stats s
      INNER JOIN (
        SELECT source, MAX(scraped_at) as max_date
        FROM scrape_stats
        WHERE date(scraped_at) = date('now')
        GROUP BY source
      ) latest ON s.source = latest.source AND s.scraped_at = latest.max_date
      ORDER BY s.source
    `).all() as ScrapeStats[];
    return stats;
  } finally {
    db.close();
  }
}

function getYesterdayScrapeStats(): Map<string, number> {
  const db = getDb();
  try {
    const stats = db.prepare(`
      SELECT source, events_found
      FROM scrape_stats
      WHERE date(scraped_at) = date('now', '-1 day')
      AND success = 1
      GROUP BY source
      ORDER BY scraped_at DESC
    `).all() as { source: string; events_found: number }[];

    const map = new Map<string, number>();
    for (const s of stats) {
      if (!map.has(s.source)) {
        map.set(s.source, s.events_found);
      }
    }
    return map;
  } finally {
    db.close();
  }
}

function getLatestGenerationStats(): GenerationStats | null {
  const db = getDb();
  try {
    const stats = db.prepare(`
      SELECT * FROM generation_stats
      ORDER BY generated_at DESC
      LIMIT 1
    `).get() as GenerationStats | null;
    return stats;
  } finally {
    db.close();
  }
}

function getDatabaseSummary(): { total: number; visible: number; hidden: number; unverified: number } {
  const db = getDb();
  try {
    const total = (db.prepare(`SELECT COUNT(*) as count FROM events`).get() as { count: number }).count;
    const visible = (db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE location_status IN ('verified_athens', 'pass_through')
      AND date(start_date) >= date('now')
    `).get() as { count: number }).count;
    const hidden = (db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE location_status NOT IN ('verified_athens', 'pass_through')
      OR date(start_date) < date('now')
    `).get() as { count: number }).count;
    const unverified = (db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE location_status = 'unverified'
    `).get() as { count: number }).count;
    return { total, visible, hidden, unverified };
  } finally {
    db.close();
  }
}

function getNewUnverifiedVenues(): string[] {
  const db = getDb();
  try {
    const venues = db.prepare(`
      SELECT DISTINCT venue_name FROM events
      WHERE location_status = 'unverified'
      AND date(created_at) = date('now')
      LIMIT 20
    `).all() as { venue_name: string }[];
    return venues.map(v => v.venue_name);
  } finally {
    db.close();
  }
}

export function getEnrichmentStats(dbIn?: Database): { enriched: number; total: number } {
  const db = dbIn ?? getDb();
  try {
    const enriched = (db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE needs_enrichment = 0 AND ${VISIBLE_UPCOMING}
    `).get() as { count: number }).count;
    const total = (db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE ${VISIBLE_UPCOMING}
    `).get() as { count: number }).count;
    return { enriched, total };
  } finally {
    if (!dbIn) db.close();
  }
}

export function getSchemaValidationStats(dbIn?: Database): { valid: number; total: number } {
  const db = dbIn ?? getDb();
  try {
    const valid = (db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE schema_json IS NOT NULL AND ${VISIBLE_UPCOMING}
    `).get() as { count: number }).count;
    const total = (db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE ${VISIBLE_UPCOMING}
    `).get() as { count: number }).count;
    return { valid, total };
  } finally {
    if (!dbIn) db.close();
  }
}

function getWeeklyStats(): Map<string, Map<string, number>> {
  const db = getDb();
  try {
    const stats = db.prepare(`
      SELECT
        source,
        date(scraped_at) as scrape_date,
        MAX(events_found) as events_found
      FROM scrape_stats
      WHERE date(scraped_at) >= date('now', '-7 days')
      AND success = 1
      GROUP BY source, date(scraped_at)
      ORDER BY source, scrape_date
    `).all() as { source: string; scrape_date: string; events_found: number }[];

    const result = new Map<string, Map<string, number>>();
    for (const s of stats) {
      if (!result.has(s.source)) {
        result.set(s.source, new Map());
      }
      result.get(s.source)!.set(s.scrape_date, s.events_found);
    }
    return result;
  } finally {
    db.close();
  }
}

function getQualityStats(): Array<{
  source: string;
  total: number;
  withPrice: number;
  withTicketUrl: number;
}> {
  const db = getDb();
  try {
    const stats = db.prepare(`
      SELECT
        source,
        COUNT(*) as total,
        SUM(CASE WHEN price_amount IS NOT NULL OR price_type = 'open' THEN 1 ELSE 0 END) as with_price,
        SUM(CASE WHEN ticket_url IS NOT NULL THEN 1 ELSE 0 END) as with_ticket_url
      FROM events
      WHERE location_status IN ('verified_athens', 'pass_through')
      AND date(start_date) >= date('now')
      GROUP BY source
      ORDER BY source
    `).all() as Array<{ source: string; total: number; with_price: number; with_ticket_url: number }>;

    return stats.map(s => ({
      source: s.source,
      total: s.total,
      withPrice: s.with_price,
      withTicketUrl: s.with_ticket_url
    }));
  } finally {
    db.close();
  }
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateDailyReport(): string {
  const today = new Date().toISOString().split('T')[0];
  const alerts: Alert[] = [];
  const lines: string[] = [];

  lines.push(`AGENT ATHENS HEALTH REPORT - ${today}`);
  lines.push('='.repeat(50));
  lines.push('');

  // SCRAPING SECTION
  lines.push('SCRAPING');
  lines.push('-'.repeat(50));

  const todayStats = getLatestScrapeStats();
  const yesterdayStats = getYesterdayScrapeStats();

  if (todayStats.length === 0) {
    lines.push('  No scrape data for today');
    alerts.push({ level: 'WARNING', message: 'No scrape stats recorded today' });
  } else {
    for (const stat of todayStats) {
      const yesterday = yesterdayStats.get(stat.source) || 0;
      const diff = stat.events_found - yesterday;
      const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'same' : `${diff}`;

      const icon = stat.success ? (diff < 0 && Math.abs(diff) > yesterday * 0.5 ? '  ' : '  ') : '  ';
      const statusIcon = stat.success ? (diff < 0 && Math.abs(diff) > yesterday * 0.5 ? '!' : 'v') : 'x';

      lines.push(`  ${statusIcon} ${stat.source.padEnd(18)} ${String(stat.events_found).padStart(4)} events (${diffStr})`);

      // Check for alerts
      if (!stat.success) {
        alerts.push({ level: 'CRITICAL', message: `${stat.source} scrape failed: ${stat.error_message}` });
      } else if (stat.events_found === 0) {
        alerts.push({ level: 'CRITICAL', message: `${stat.source} returned 0 events` });
      } else if (yesterday > 0 && stat.events_found < yesterday * 0.5) {
        alerts.push({ level: 'WARNING', message: `${stat.source} dropped ${Math.round((1 - stat.events_found/yesterday) * 100)}% - investigate` });
      }
    }
  }
  lines.push('');

  // DATABASE SECTION
  lines.push('DATABASE');
  lines.push('-'.repeat(50));

  const dbSummary = getDatabaseSummary();
  lines.push(`  Total: ${dbSummary.total} | Visible: ${dbSummary.visible} | Hidden: ${dbSummary.hidden}`);

  const newVenues = getNewUnverifiedVenues();
  if (newVenues.length > 0) {
    lines.push(`  New unverified venues: ${newVenues.length}`);
    if (newVenues.length > 10) {
      alerts.push({ level: 'WARNING', message: `${newVenues.length} new unverified venues - run venue review` });
    }
  }
  lines.push('');

  // BUILD SECTION
  lines.push('BUILD');
  lines.push('-'.repeat(50));

  const genStats = getLatestGenerationStats();
  if (genStats) {
    const buildTime = (genStats.build_duration_ms / 1000).toFixed(1);
    const schemaStats = getSchemaValidationStats();
    lines.push(`  v ${buildTime}s | ${genStats.pages_generated} pages | Schema valid: ${schemaStats.valid}/${schemaStats.total}`);

    if (genStats.build_duration_ms > BUILD_TIME_WARN_MS) {
      alerts.push({ level: 'WARNING', message: `Build time ${buildTime}s exceeds ${BUILD_TIME_WARN_MS / 1000}s threshold` });
    }
  } else {
    lines.push('  No build data recorded');
    alerts.push({ level: 'WARNING', message: 'No build stats recorded' });
  }
  lines.push('');

  // ENRICHMENT SECTION
  lines.push('ENRICHMENT');
  lines.push('-'.repeat(50));

  const enrichmentStats = getEnrichmentStats();
  const enrichmentPct = enrichmentStats.total > 0
    ? ((enrichmentStats.enriched / enrichmentStats.total) * 100).toFixed(1)
    : '0.0';
  lines.push(`  ${enrichmentStats.enriched}/${enrichmentStats.total} (${enrichmentPct}%) enriched`);
  lines.push('');

  // ALERTS SECTION
  if (alerts.length > 0) {
    lines.push('ALERTS');
    lines.push('-'.repeat(50));
    for (const alert of alerts) {
      const icon = alert.level === 'CRITICAL' ? '!' : '?';
      lines.push(`  ${icon} ${alert.message}`);
    }
  } else {
    lines.push('  All systems healthy');
  }
  lines.push('');

  return lines.join('\n');
}

function generateWeeklyReport(): string {
  const lines: string[] = [];

  lines.push('AGENT ATHENS - 7-DAY TREND REPORT');
  lines.push('='.repeat(70));
  lines.push('');

  const weeklyStats = getWeeklyStats();

  if (weeklyStats.size === 0) {
    lines.push('No scrape data available for the past 7 days.');
    return lines.join('\n');
  }

  // Get all dates in the past 7 days
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Header with day names
  const dayNames = dates.map(d => {
    const day = new Date(d).toLocaleDateString('en-US', { weekday: 'short' });
    return day.substring(0, 3);
  });

  lines.push(`${'Source'.padEnd(16)} ${dayNames.map(d => d.padStart(5)).join(' ')}  Trend`);
  lines.push('-'.repeat(70));

  for (const [source, dateMap] of weeklyStats) {
    const counts = dates.map(d => dateMap.get(d) || 0);
    const countStrs = counts.map(c => c > 0 ? String(c).padStart(5) : '    -');

    // Determine trend
    let trend = '  stable';
    const nonZeroCounts = counts.filter(c => c > 0);
    if (nonZeroCounts.length >= 3) {
      const allSame = nonZeroCounts.every(c => c === nonZeroCounts[0]);
      if (allSame && nonZeroCounts.length >= 5) {
        trend = '? stale?';
      } else if (nonZeroCounts[nonZeroCounts.length - 1] > nonZeroCounts[0] * 1.2) {
        trend = '^ growing';
      } else if (nonZeroCounts[nonZeroCounts.length - 1] < nonZeroCounts[0] * 0.8) {
        trend = 'v declining';
      }
    }

    lines.push(`${source.padEnd(16)} ${countStrs.join(' ')} ${trend}`);
  }

  lines.push('');
  lines.push('Legend: ? = may be stale (identical counts 5+ days)');
  lines.push('');

  return lines.join('\n');
}

function generateQualityReport(): string {
  const lines: string[] = [];

  lines.push('AGENT ATHENS - DATA QUALITY AUDIT');
  lines.push('='.repeat(70));
  lines.push('');

  const qualityStats = getQualityStats();

  if (qualityStats.length === 0) {
    lines.push('No event data available for quality audit.');
    return lines.join('\n');
  }

  lines.push(`${'Source'.padEnd(18)} ${'Events'.padStart(7)} ${'With Price'.padStart(12)} ${'%'.padStart(6)} ${'Ticket URL'.padStart(12)} ${'%'.padStart(6)}`);
  lines.push('-'.repeat(70));

  for (const stat of qualityStats) {
    const pricePct = stat.total > 0 ? ((stat.withPrice / stat.total) * 100).toFixed(1) : '0.0';
    const ticketPct = stat.total > 0 ? ((stat.withTicketUrl / stat.total) * 100).toFixed(1) : '0.0';

    lines.push(
      `${stat.source.padEnd(18)} ${String(stat.total).padStart(7)} ` +
      `${String(stat.withPrice).padStart(12)} ${pricePct.padStart(5)}% ` +
      `${String(stat.withTicketUrl).padStart(12)} ${ticketPct.padStart(5)}%`
    );
  }

  lines.push('-'.repeat(70));

  // Totals
  const totals = qualityStats.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      withPrice: acc.withPrice + s.withPrice,
      withTicketUrl: acc.withTicketUrl + s.withTicketUrl
    }),
    { total: 0, withPrice: 0, withTicketUrl: 0 }
  );

  const totalPricePct = totals.total > 0 ? ((totals.withPrice / totals.total) * 100).toFixed(1) : '0.0';
  const totalTicketPct = totals.total > 0 ? ((totals.withTicketUrl / totals.total) * 100).toFixed(1) : '0.0';

  lines.push(
    `${'TOTAL'.padEnd(18)} ${String(totals.total).padStart(7)} ` +
    `${String(totals.withPrice).padStart(12)} ${totalPricePct.padStart(5)}% ` +
    `${String(totals.withTicketUrl).padStart(12)} ${totalTicketPct.padStart(5)}%`
  );

  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const isWeekly = args.includes('--weekly');
  const isQuality = args.includes('--quality');

  // Parse output path
  const outputIdx = args.indexOf('--output');
  let outputPath: string | null = null;
  if (outputIdx >= 0 && args[outputIdx + 1]) {
    outputPath = args[outputIdx + 1];
  }

  let report: string;

  if (isWeekly) {
    report = generateWeeklyReport();
  } else if (isQuality) {
    report = generateQualityReport();
  } else {
    report = generateDailyReport();
  }

  // Print to console
  console.log(report);

  // Save to file if output path specified or default location
  if (outputPath) {
    writeFileSync(outputPath, report);
    console.log(`\nReport saved to: ${outputPath}`);
  } else if (!isWeekly && !isQuality) {
    // Save daily reports by default
    if (!existsSync(REPORTS_DIR)) {
      mkdirSync(REPORTS_DIR, { recursive: true });
    }
    const today = new Date().toISOString().split('T')[0];
    const reportPath = join(REPORTS_DIR, `${today}.txt`);
    writeFileSync(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);
  }
}

// import.meta.main guard (2026-08-11): without it, merely importing this
// module (e.g. from tests) ran the full report against the production DB —
// caught by the prod-db-guard preload the first time a test imported it.
if (import.meta.main) {
  main().catch(console.error);
}
