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
import { countListedEventsInDb } from '../src/utils/listed-count';

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
export type SensorVerdict = 'fresh' | 'stale' | 'malformed';
/**
 * The report must carry the run's own Athens date: run_health_check writes it
 * seconds before run_scoreboard in scripts/daily-automated.sh, so ANY older
 * date means today's health check did not write — the exact case Codex #7
 * named ("yesterday's report republished as a fresh scoreboard"). health-check
 * dates the file with the same Athens-local helper, so there is no zone slack.
 */
const MAX_REPORT_AGE_DAYS = 0;
const GLYPH_STATUS: Record<string, ScrapeStatus> = { v: 'ok', '!': 'warning', x: 'failed', '?': 'unknown' };

export interface HealthReportBlock {
  report_date: string | null;
  report_file: string;
  /** Athens today − report_date, in whole days; null when report_date is unreadable. */
  report_age_days: number | null;
  /**
   * run_health_check is NON-FATAL in scripts/daily-automated.sh, so a failed
   * health check leaves yesterday's report as the newest file and this script
   * republishes it under a fresh generated_at. Without this flag re-stamped
   * evidence is indistinguishable from today's. True when the report is not
   * dated today (Athens), is dated in the future (clock skew — it would stay
   * the lexically newest file forever), or carries no parseable date.
   */
  stale: boolean;
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
  // Current live ROWS of every location status — not what the site lists.
  upcoming_events: number;
  // Events the site lists: the one shared count (src/utils/listed-count.ts),
  // the same number llms.txt and the health report state.
  listed_events: number;
  per_source: Record<string, number>;
  health_report: HealthReportBlock;
  // Per-sensor verdict for the Analyst's precondition step: 'malformed' means
  // the report parsed to none of its expected sections (a crashed or truncated
  // health-check), 'stale' means the report is not dated the run's own Athens
  // day (or its date is in the future or not a real calendar day).
  sensor_status: { health_report: SensorVerdict };
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
    report_age_days: null,
    stale: true, // until dated against `today` in assembleScoreboard
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
    } else if (section === 'DATABASE' && (m = line.match(/^\s+(?:Total|All rows): (\d+) \| (?:Visible|Publishable current rows[^:]*): (\d+) \| (?:Hidden|Other rows): (\d+)/))) {
      // Pre-2026-09-23 reports say Total/Visible/Hidden; later ones label the same counts as rows.
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

/** True only for a YYYY-MM-DD string that names a real calendar day. */
function isCalendarDate(s: string): boolean {
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Whole days from `from` to `to`, both YYYY-MM-DD; negative when `to` is earlier. */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Stamps report_age_days/stale onto `block` and returns the sensor verdict.
 * Malformed wins over stale: a report that parsed to NO expected section says
 * nothing about its own age, and the repair is different (fix health-check,
 * not the schedule).
 */
export function gradeHealthReport(block: HealthReportBlock, today: string): SensorVerdict {
  // A header like 9999-99-99 matches the regex but is not a date, and
  // Date.parse silently rolls 2026-02-30 forward to March 2: only a value
  // that round-trips through the calendar counts.
  const raw = block.report_date !== null && isCalendarDate(block.report_date) ? dayDiff(block.report_date, today) : NaN;
  const age = Number.isFinite(raw) ? raw : null;
  block.report_age_days = age;
  // Two-sided: a future-dated report is untrustworthy, not fresh.
  block.stale = age === null || age < 0 || age > MAX_REPORT_AGE_DAYS;
  // The two sections health-check always writes. Neither present = the file is
  // not a health report at all (crash output, truncation, wrong file).
  const malformed = Object.keys(block.scraping).length === 0 && block.database === null;
  if (malformed) return 'malformed';
  return block.stale ? 'stale' : 'fresh';
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

function readDbCounts(dbPath: string): Pick<Scoreboard, 'total_events' | 'upcoming_events' | 'listed_events' | 'per_source'> {
  const db = openEventsDbReadOnly(dbPath);
  try {
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${LIVE}`).get() as { n: number }).n;
    const upcoming = (db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${LIVE} AND ${isCurrentSql()}`).get({ $today: athensTodaySql() }) as { n: number }).n;
    const rows = db.prepare(`SELECT source, COUNT(*) AS n FROM events WHERE ${LIVE} GROUP BY source ORDER BY source`).all() as Array<{ source: string; n: number }>;
    const per_source: Record<string, number> = {};
    for (const r of rows) per_source[r.source] = r.n;
    return { total_events: total, upcoming_events: upcoming, listed_events: countListedEventsInDb(db), per_source };
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

export function assembleScoreboard(opts: { dbPath?: string; reportsDir?: string; outPath?: string; today?: string } = {}): Scoreboard {
  const dbPath = opts.dbPath ?? DEFAULTS.dbPath;
  const reportsDir = opts.reportsDir ?? DEFAULTS.reportsDir;
  const outPath = opts.outPath ?? DEFAULTS.outPath;
  // Injectable so the freshness pins are deterministic; athensTodaySql() is the
  // project's Athens-local today (never the host zone, never SQLite's UTC now).
  const today = opts.today ?? athensTodaySql();

  const reportFile = newestReportFile(reportsDir);
  const health_report = parseHealthReport(readFileSync(join(reportsDir, reportFile), 'utf-8'), reportFile);
  // Deliberately NOT a throw: a malformed report must still produce a
  // scoreboard, or the Analyst reads the previous run's file and never learns
  // the sensor broke.
  const health_status = gradeHealthReport(health_report, today);
  const counts = readDbCounts(dbPath);

  const scoreboard: Scoreboard = {
    generated_at: new Date().toISOString(),
    ...counts,
    health_report,
    sensor_status: { health_report: health_status },
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
    console.log(
      `assemble-scoreboard: wrote scoreboard (listed=${sb.listed_events}, total_rows=${sb.total_events}, current_rows=${sb.upcoming_events}, ` +
        `report=${sb.health_report.report_file}, health_report=${sb.sensor_status.health_report}, age_days=${sb.health_report.report_age_days})`,
    );
  } catch (e) {
    const msg = e instanceof ScoreboardError ? e.message : `assemble-scoreboard: FAILED — ${(e as Error).message} — try: rerun with --db/--reports-dir/--out to isolate the failing input`;
    console.error(msg);
    process.exit(1);
  }
}
