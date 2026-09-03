#!/usr/bin/env bun
/**
 * Scoreboard v0 (Phase 8) — assembles data/scoreboard.json from the newest
 * health report and a READ-ONLY look at events.db (live rows only: dedup
 * losers with merged_into set are excluded from every count).
 *
 * Usage:
 *   bun run scripts/assemble-scoreboard.ts [--db=PATH] [--reports-dir=PATH] [--out=PATH]
 *
 * The health report is plain text (scripts/health-check.ts generateDailyReport);
 * field names below mirror its section labels. Unknown lines are ignored so a
 * future report line can never break the scoreboard. Every failure exits
 * non-zero with one stderr line naming what failed and what to try (rule 5).
 */
import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { isCurrentSql, athensTodaySql } from '../src/db/effective-end-sql';

const ROOT = resolve(import.meta.dir, '..');
const DEFAULTS = {
  dbPath: join(ROOT, 'data', 'events.db'),
  reportsDir: join(ROOT, 'data', 'health-reports'),
  outPath: join(ROOT, 'data', 'scoreboard.json'),
};

export class ScoreboardError extends Error {
  constructor(what: string, tryNext: string) {
    super(`assemble-scoreboard: FAILED — ${what} — try: ${tryNext}`);
  }
}

type ScrapeStatus = 'ok' | 'warning' | 'failed' | 'unknown';
const GLYPH_STATUS: Record<string, ScrapeStatus> = { v: 'ok', '!': 'warning', x: 'failed', '?': 'unknown' };

export interface HealthReportBlock {
  report_date: string | null;
  report_file: string;
  scraping: Record<string, { status: ScrapeStatus; events: number; delta: number }>;
  database: { total: number; visible: number; hidden: number; new_unverified_venues: number } | null;
  build: { duration_s: number; pages: number; schema_valid: number; schema_total: number } | null;
  enrichment: { enriched: number; total: number; pct: number } | null;
  alerts: Array<{ level: 'CRITICAL' | 'WARNING'; message: string }>;
}

export interface Scoreboard {
  generated_at: string;
  // Live rows only (merged_into IS NULL) — intentionally lower than
  // health_report.database.total, which is health-check's raw row count.
  total_events: number;
  upcoming_events: number;
  per_source: Record<string, number>;
  health_report: HealthReportBlock;
  // Filled by the citation-panel and crawler-telemetry sensors (queued as
  // separate issues) — this script only reserves the keys.
  citations: null;
  crawlers: null;
}

const REPORT_FILE = /^\d{4}-\d{2}-\d{2}\.txt$/;

export function newestReportFile(reportsDir: string): string {
  if (!existsSync(reportsDir)) {
    throw new ScoreboardError(
      `health-reports dir not found: ${reportsDir}`,
      'run `bun run scripts/health-check.ts` (or the daily pipeline) so a report exists, or pass --reports-dir=PATH',
    );
  }
  const files = readdirSync(reportsDir).filter((f) => REPORT_FILE.test(f)).sort();
  if (files.length === 0) {
    throw new ScoreboardError(
      `no YYYY-MM-DD.txt health report in ${reportsDir}`,
      'run `bun run scripts/health-check.ts` to write one, or pass --reports-dir=PATH',
    );
  }
  return files[files.length - 1];
}

export function parseHealthReport(text: string, fileName: string): HealthReportBlock {
  const block: HealthReportBlock = {
    report_date: null,
    report_file: fileName,
    scraping: {},
    database: null,
    build: null,
    enrichment: null,
    alerts: [],
  };
  const SECTIONS = new Set(['SCRAPING', 'DATABASE', 'BUILD', 'ENRICHMENT', 'ALERTS']);
  let section = '';

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (SECTIONS.has(line.trim())) {
      section = line.trim();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^AGENT ATHENS HEALTH REPORT - (\d{4}-\d{2}-\d{2})/))) {
      block.report_date = m[1];
    } else if (section === 'SCRAPING' && (m = line.match(/^\s+([vx!?])\s+(\S+)\s+(\d+) events \((same|[+-]\d+)\)/))) {
      block.scraping[m[2]] = {
        status: GLYPH_STATUS[m[1]] ?? 'unknown',
        events: Number(m[3]),
        delta: m[4] === 'same' ? 0 : Number(m[4]),
      };
    } else if (section === 'DATABASE' && (m = line.match(/^\s+Total: (\d+) \| Visible: (\d+) \| Hidden: (\d+)/))) {
      block.database = { total: Number(m[1]), visible: Number(m[2]), hidden: Number(m[3]), new_unverified_venues: 0 };
    } else if (section === 'DATABASE' && (m = line.match(/^\s+New unverified venues: (\d+)/))) {
      // health-check omits this line when the count is 0, hence the default above.
      if (block.database) block.database.new_unverified_venues = Number(m[1]);
    } else if (section === 'BUILD' && (m = line.match(/^\s+v ([\d.]+)s \| (\d+) pages \| Schema valid: (\d+)\/(\d+)/))) {
      block.build = { duration_s: Number(m[1]), pages: Number(m[2]), schema_valid: Number(m[3]), schema_total: Number(m[4]) };
    } else if (section === 'ENRICHMENT' && (m = line.match(/^\s+(\d+)\/(\d+) \(([\d.]+)%\) enriched/))) {
      block.enrichment = { enriched: Number(m[1]), total: Number(m[2]), pct: Number(m[3]) };
    } else if (section === 'ALERTS' && (m = line.match(/^\s+([!?]) (.+)$/))) {
      block.alerts.push({ level: m[1] === '!' ? 'CRITICAL' : 'WARNING', message: m[2] });
    }
  }
  return block;
}

export function openEventsDbReadOnly(dbPath: string): Database {
  if (!existsSync(dbPath)) {
    throw new ScoreboardError(
      `events database not found: ${dbPath}`,
      'check data/events.db exists (restore the newest 7-day rolling backup — see scripts/backup-events-db.sh — if missing) or pass --db=PATH',
    );
  }
  // NOT `{ readonly: true }`: events.db is journal_mode=wal and a readonly
  // handle cannot create the -wal/-shm sidecars, so after any sqlite3-CLI close
  // (which deletes them) the first query fails SQLITE_CANTOPEN. query_only
  // gives the same guarantee at the connection level ("attempt to write a
  // readonly database") while still being allowed to open the sidecars.
  try {
    const db = new Database(dbPath);
    db.exec('PRAGMA query_only = 1');
    return db;
  } catch (e) {
    throw new ScoreboardError(`could not open ${dbPath}: ${(e as Error).message}`, 'verify the file is a sqlite database and that its directory is writable (WAL sidecars)');
  }
}

// Dedup losers keep their row with merged_into = survivor id (never deleted);
// every count here is over live rows only, or the same event counts N times.
const LIVE = 'merged_into IS NULL';

function readDbCounts(dbPath: string): Pick<Scoreboard, 'total_events' | 'upcoming_events' | 'per_source'> {
  const db = openEventsDbReadOnly(dbPath);
  try {
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${LIVE}`).get() as { n: number }).n;
    const upcoming = (db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${LIVE} AND ${isCurrentSql()}`).get({ $today: athensTodaySql() }) as { n: number }).n;
    const rows = db.prepare(`SELECT source, COUNT(*) AS n FROM events WHERE ${LIVE} GROUP BY source ORDER BY source`).all() as Array<{ source: string; n: number }>;
    const per_source: Record<string, number> = {};
    for (const r of rows) per_source[r.source] = r.n;
    return { total_events: total, upcoming_events: upcoming, per_source };
  } catch (e) {
    if (e instanceof ScoreboardError) throw e;
    throw new ScoreboardError(
      `query against ${dbPath} failed: ${(e as Error).message}`,
      'SQLITE_CANTOPEN/"unable to open database file" = WAL sidecars could not be created (check directory permissions); otherwise confirm the DB has the events table (run scripts/assert-events-db-healthy.sh)',
    );
  } finally {
    db.close();
  }
}

export function assembleScoreboard(opts: { dbPath?: string; reportsDir?: string; outPath?: string } = {}): Scoreboard {
  const dbPath = opts.dbPath ?? DEFAULTS.dbPath;
  const reportsDir = opts.reportsDir ?? DEFAULTS.reportsDir;
  const outPath = opts.outPath ?? DEFAULTS.outPath;

  const reportFile = newestReportFile(reportsDir);
  const health_report = parseHealthReport(readFileSync(join(reportsDir, reportFile), 'utf-8'), reportFile);
  const counts = readDbCounts(dbPath);

  const scoreboard: Scoreboard = {
    generated_at: new Date().toISOString(),
    ...counts,
    health_report,
    citations: null,
    crawlers: null,
  };

  try {
    writeFileSync(outPath, JSON.stringify(scoreboard, null, 2) + '\n');
  } catch (e) {
    throw new ScoreboardError(`could not write ${outPath}: ${(e as Error).message}`, 'check the directory exists and is writable, or pass --out=PATH');
  }
  return scoreboard;
}

function parseArgs(argv: string[]): { dbPath?: string; reportsDir?: string; outPath?: string } {
  const opts: { dbPath?: string; reportsDir?: string; outPath?: string } = {};
  for (const arg of argv) {
    if (arg.startsWith('--db=')) opts.dbPath = resolve(arg.slice('--db='.length));
    else if (arg.startsWith('--reports-dir=')) opts.reportsDir = resolve(arg.slice('--reports-dir='.length));
    else if (arg.startsWith('--out=')) opts.outPath = resolve(arg.slice('--out='.length));
    else throw new ScoreboardError(`unknown argument ${arg}`, 'use --db=PATH --reports-dir=PATH --out=PATH');
  }
  return opts;
}

if (import.meta.main) {
  try {
    const sb = assembleScoreboard(parseArgs(process.argv.slice(2)));
    console.log(`assemble-scoreboard: wrote scoreboard (total=${sb.total_events}, upcoming=${sb.upcoming_events}, report=${sb.health_report.report_file})`);
  } catch (e) {
    const msg = e instanceof ScoreboardError ? e.message : `assemble-scoreboard: FAILED — ${(e as Error).message} — try: rerun with --db/--reports-dir/--out to isolate the failing input`;
    console.error(msg);
    process.exit(1);
  }
}
