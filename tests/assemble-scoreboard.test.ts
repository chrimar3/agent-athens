/**
 * scripts/assemble-scoreboard.ts — Scoreboard v0 (Phase 8).
 *
 * Synthetic fixtures only: a temp sqlite FILE (the script opens by path, and
 * the prod-db-guard preload forbids data/events.db under `bun test`) and a
 * fake health report written in the exact line format scripts/health-check.ts
 * emits. The fixture asserts its own preconditions so it fails loudly if it
 * ever stops exercising the exhibition/end_date rule it exists to pin.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { assembleScoreboard, openEventsDbReadOnly, parseHealthReport } from '../scripts/assemble-scoreboard';
import { isCurrentSql, athensTodaySql } from '../src/db/effective-end-sql';

const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts', 'assemble-scoreboard.ts');
const SCHEMA = readFileSync(join(ROOT, 'src', 'db', 'schema.sql'), 'utf-8');

// ---------------------------------------------------------------------------
// Fixture: events. Dates are far past (2025) / far future (2099) so the split
// is stable for decades. The exhibition has a PAST start and a FUTURE end — a
// start_date-only predicate drops it; the canonical predicate keeps it.
// The dedup loser (merged_into set) is a FUTURE row of an otherwise-counted
// source: any count that forgets the live-row filter picks it up.
// ---------------------------------------------------------------------------
type Seed = { id: string; start: string; end: string | null; type: string; source: string; mergedInto?: string };
const SEED: Seed[] = [
  { id: 'past-concert',        start: '2025-03-01T20:00:00', end: null,         type: 'concert',    source: 'athinorama.gr' },
  { id: 'past-theater-run',    start: '2025-01-10',          end: '2025-02-10', type: 'theater',    source: 'more.com' },
  { id: 'future-concert',      start: '2099-01-01T20:00:00', end: null,         type: 'concert',    source: 'athinorama.gr' },
  { id: 'running-exhibition',  start: '2020-01-01',          end: '2099-12-31', type: 'exhibition', source: 'more.com' },
  { id: 'future-dj',           start: '2099-06-01T23:00:00', end: null,         type: 'dj_set',     source: 'residentadvisor' },
  { id: 'future-dup-loser',    start: '2099-01-01T20:00:00', end: null,         type: 'concert',    source: 'athinorama.gr', mergedInto: 'future-concert' },
];
const RAW_ROWS = SEED.length; // 6, incl. the loser
const EXPECTED_TOTAL = 5;     // live rows only (merged_into IS NULL)
const EXPECTED_CURRENT = 3;   // future-concert, running-exhibition, future-dj (NOT the loser)
const EXPECTED_PER_SOURCE = { 'athinorama.gr': 2, 'more.com': 2, residentadvisor: 1 };

// Production events.db is journal_mode=wal; sqlite3-CLI closes in the daily
// pipeline leave it with NO -wal/-shm sidecars, which is the state a
// `readonly: true` open cannot cope with. Mirror that here.
function seedDb(path: string): void {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  const ins = db.prepare(`
    INSERT INTO events (id, title, start_date, end_date, type, venue_name, price_type, source, merged_into, created_at, updated_at)
    VALUES ($id, $title, $start, $end, $type, 'Fixture Venue', 'open', $source, $merged, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')
  `);
  for (const s of SEED) ins.run({ $id: s.id, $title: `Title ${s.id}`, $start: s.start, $end: s.end, $type: s.type, $source: s.source, $merged: s.mergedInto ?? null });
  const stat = db.prepare(`
    INSERT INTO scrape_stats (source, scraped_at, events_found, events_new, events_updated, duration_ms, success, error_message)
    VALUES ($source, $at, $found, 0, 0, 1000, $ok, $err)
  `);
  stat.run({ $source: 'athinorama', $at: '2026-09-02T04:00:00Z', $found: 177, $ok: 1, $err: null });
  stat.run({ $source: 'more', $at: '2026-09-02T04:01:00Z', $found: 0, $ok: 0, $err: 'timeout' });
  // Bun defers the real close while statements are un-finalized, which would
  // leave the WAL un-checkpointed; deleting the sidecars then loses the rows.
  ins.finalize();
  stat.finalize();
  db.close(true);
  removeWalSidecars(path);
}

function removeWalSidecars(path: string): void {
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

/** SQLite header bytes 18/19 are 2 when the file is in WAL mode (1 = rollback). */
function isWalFile(path: string): boolean {
  const header = readFileSync(path).subarray(18, 20);
  return header[0] === 2 && header[1] === 2;
}

// ---------------------------------------------------------------------------
// Fixture: health report, in the exact shape health-check.ts writes.
// ---------------------------------------------------------------------------
const REPORT_WITH_ALERTS = [
  'AGENT ATHENS HEALTH REPORT - 2026-09-02',
  '='.repeat(50),
  '',
  'SCRAPING',
  '-'.repeat(50),
  '  v athinorama          177 events (+4)',
  '  x more                  0 events (-37)',
  '  ! ra                   30 events (-56)',
  '  v snfcc                19 events (same)',
  '',
  'DATABASE',
  '-'.repeat(50),
  '  Total: 19108 | Visible: 573 | Hidden: 18535',
  '  New unverified venues: 12',
  '',
  'BUILD',
  '-'.repeat(50),
  '  v 28.7s | 2498 pages | Schema valid: 574/574',
  '  ? build cache warm (not an alert — glyph line outside ALERTS)',
  '',
  'ENRICHMENT',
  '-'.repeat(50),
  '  397/574 (69.2%) enriched',
  '',
  'ALERTS',
  '-'.repeat(50),
  '  ! more scrape failed: timeout',
  '  ? ra dropped 65% - investigate',
  '  ? 12 new unverified venues - run venue review',
  '',
].join('\n');

const REPORT_HEALTHY = [
  'AGENT ATHENS HEALTH REPORT - 2026-08-30',
  '='.repeat(50),
  '',
  'SCRAPING',
  '-'.repeat(50),
  '  v athinorama          170 events (same)',
  '',
  'DATABASE',
  '-'.repeat(50),
  '  Total: 19000 | Visible: 570 | Hidden: 18430',
  '',
  'BUILD',
  '-'.repeat(50),
  '  v 30.1s | 2400 pages | Schema valid: 570/570',
  '',
  'ENRICHMENT',
  '-'.repeat(50),
  '  390/570 (68.4%) enriched',
  '',
  '  All systems healthy',
  '',
].join('\n');

let work: string;
let dbPath: string;
let reportsDir: string;
let outPath: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'aa-scoreboard-test-'));
  dbPath = join(work, 'events.db');
  reportsDir = join(work, 'health-reports');
  outPath = join(work, 'scoreboard.json');
  mkdirSync(reportsDir);
  seedDb(dbPath);
  // Older report + a stray non-report file: the script must pick 2026-09-02.
  writeFileSync(join(reportsDir, '2026-08-30.txt'), REPORT_HEALTHY);
  writeFileSync(join(reportsDir, '2026-09-02.txt'), REPORT_WITH_ALERTS);
  writeFileSync(join(reportsDir, 'notes.txt'), 'not a report');
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('fixture preconditions (fail loudly if the fixture stops exercising the rule)', () => {
  // Must run BEFORE any in-process open: an open connection re-creates the
  // sidecars, and deleting them under it corrupts later opens (disk I/O error).
  test('fixture DB is WAL-mode with no -wal/-shm sidecars (the production shape after a sqlite3-CLI close)', () => {
    expect(isWalFile(dbPath)).toBe(true);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });

  test('at least one event is past, at least one is current, and the exhibition is current despite a past start', () => {
    const db = openEventsDbReadOnly(dbPath);
    const today = athensTodaySql();
    const rawRows = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
    const live = (db.prepare('SELECT COUNT(*) AS n FROM events WHERE merged_into IS NULL').get() as { n: number }).n;
    const rawCurrent = (db.prepare(`SELECT COUNT(*) AS n FROM events WHERE ${isCurrentSql()}`).get({ $today: today }) as { n: number }).n;
    const pastStartButCurrent = (db
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE substr(start_date, 1, 10) < $today AND ${isCurrentSql()}`)
      .get({ $today: today }) as { n: number }).n;
    db.close();
    expect(rawRows).toBe(RAW_ROWS);
    expect(live).toBe(EXPECTED_TOTAL);
    // The loser is current by date — only the merged_into filter can exclude it.
    expect(rawCurrent).toBe(EXPECTED_CURRENT + 1);
    expect(live - EXPECTED_CURRENT).toBeGreaterThan(0);
    expect(pastStartButCurrent).toBeGreaterThan(0);
  });
});

describe('openEventsDbReadOnly — the brief\'s read-only requirement', () => {
  test('a write on the returned connection is rejected', () => {
    const db = openEventsDbReadOnly(dbPath);
    try {
      expect(() => db.exec("INSERT INTO scrape_stats (source, scraped_at, events_found) VALUES ('mutant', '2026-01-01', 1)"))
        .toThrow(/readonly/);
      expect(() => db.exec('CREATE TABLE mutant (a)')).toThrow(/readonly/);
    } finally {
      db.close();
    }
  });
});

describe('assembleScoreboard — output shape', () => {
  let parsed: any;

  beforeAll(() => {
    assembleScoreboard({ dbPath, reportsDir, outPath });
    parsed = JSON.parse(readFileSync(outPath, 'utf-8'));
  });

  test('writes a JSON file ending in a newline', () => {
    const raw = readFileSync(outPath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test('generated_at is ISO-8601 and within the last minute', () => {
    expect(typeof parsed.generated_at).toBe('string');
    const t = Date.parse(parsed.generated_at);
    expect(Number.isNaN(t)).toBe(false);
    expect(new Date(t).toISOString()).toBe(parsed.generated_at);
    expect(Date.now() - t).toBeLessThan(60_000);
  });

  test('total_events counts live rows only (dedup losers with merged_into set are excluded)', () => {
    expect(parsed.total_events).toBe(EXPECTED_TOTAL);
    expect(parsed.total_events).toBeLessThan(RAW_ROWS);
  });

  test('upcoming_events uses the canonical effective-end predicate (running exhibition counts, loser does not)', () => {
    expect(parsed.upcoming_events).toBe(EXPECTED_CURRENT);
    expect(parsed.upcoming_events).toBeLessThan(parsed.total_events);
  });

  test('per_source maps source → live row count (loser not counted under athinorama.gr)', () => {
    expect(parsed.per_source).toEqual(EXPECTED_PER_SOURCE);
  });

  test('citations and crawlers are literal null placeholders', () => {
    expect('citations' in parsed).toBe(true);
    expect('crawlers' in parsed).toBe(true);
    expect(parsed.citations).toBeNull();
    expect(parsed.crawlers).toBeNull();
  });

  test('health_report comes from the NEWEST dated report, not the stray file or the older one', () => {
    expect(parsed.health_report.report_date).toBe('2026-09-02');
    expect(parsed.health_report.report_file).toBe('2026-09-02.txt');
  });

  test('health_report.scraping: one entry per source with status/events/delta', () => {
    expect(parsed.health_report.scraping).toEqual({
      athinorama: { status: 'ok', events: 177, delta: 4 },
      more: { status: 'failed', events: 0, delta: -37 },
      ra: { status: 'warning', events: 30, delta: -56 },
      snfcc: { status: 'ok', events: 19, delta: 0 },
    });
  });

  test('health_report.database totals', () => {
    expect(parsed.health_report.database).toEqual({
      total: 19108,
      visible: 573,
      hidden: 18535,
      new_unverified_venues: 12,
    });
  });

  test('health_report.build', () => {
    expect(parsed.health_report.build).toEqual({
      duration_s: 28.7,
      pages: 2498,
      schema_valid: 574,
      schema_total: 574,
    });
  });

  test('health_report.enrichment', () => {
    expect(parsed.health_report.enrichment).toEqual({ enriched: 397, total: 574, pct: 69.2 });
  });

  test('health_report.alerts: "!" → CRITICAL, "?" → WARNING, in report order', () => {
    expect(parsed.health_report.alerts).toEqual([
      { level: 'CRITICAL', message: 'more scrape failed: timeout' },
      { level: 'WARNING', message: 'ra dropped 65% - investigate' },
      { level: 'WARNING', message: '12 new unverified venues - run venue review' },
    ]);
  });

  test('required top-level keys are all present', () => {
    expect(Object.keys(parsed).sort()).toEqual(
      ['citations', 'crawlers', 'generated_at', 'health_report', 'per_source', 'sensor_status', 'total_events', 'upcoming_events'].sort(),
    );
  });
});

describe('assembleScoreboard — healthy report variant', () => {
  test('"All systems healthy" → alerts: [] and new_unverified_venues: 0 when the line is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aa-scoreboard-healthy-'));
    try {
      writeFileSync(join(dir, '2026-08-30.txt'), REPORT_HEALTHY);
      const out = join(dir, 'scoreboard.json');
      assembleScoreboard({ dbPath, reportsDir: dir, outPath: out });
      const p = JSON.parse(readFileSync(out, 'utf-8'));
      expect(p.health_report.report_date).toBe('2026-08-30');
      expect(p.health_report.alerts).toEqual([]);
      expect(p.health_report.database.new_unverified_venues).toBe(0);
      expect(p.health_report.scraping).toEqual({ athinorama: { status: 'ok', events: 170, delta: 0 } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Freshness sensor: run_health_check is NON-FATAL in scripts/daily-automated.sh,
// so a failed health check leaves YESTERDAY's report as the newest file and the
// scoreboard re-stamps it under a fresh generated_at. The Analyst gates only on
// generated_at, so without report_age_days/stale/sensor_status it can be fed
// re-dated stale evidence indefinitely. `today` is injected here so these pins
// do not rot with the wall clock.
// ---------------------------------------------------------------------------
function reportDatedHeader(date: string): string {
  return [
    `AGENT ATHENS HEALTH REPORT - ${date}`,
    '='.repeat(50),
    '',
    'SCRAPING',
    '-'.repeat(50),
    '  v athinorama          170 events (same)',
    '',
    'DATABASE',
    '-'.repeat(50),
    '  Total: 19000 | Visible: 570 | Hidden: 18430',
    '',
  ].join('\n');
}

/** Assemble from a throwaway reports dir holding exactly one file. */
function assembleWith(fileName: string, content: string, today: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aa-scoreboard-fresh-'));
  try {
    writeFileSync(join(dir, fileName), content);
    const out = join(dir, 'scoreboard.json');
    const returned: any = assembleScoreboard({ dbPath, reportsDir: dir, outPath: out, today });
    const written = JSON.parse(readFileSync(out, 'utf-8'));
    return { returned, written, raw: readFileSync(out, 'utf-8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('health_report freshness sensor — stale evidence cannot pass as fresh', () => {
  test("report dated today → age 0, stale false, sensor_status 'fresh'", () => {
    const { written } = assembleWith('2026-09-02.txt', reportDatedHeader('2026-09-02'), '2026-09-02');
    expect(written.health_report.report_age_days).toBe(0);
    expect(written.health_report.stale).toBe(false);
    expect(written.sensor_status.health_report).toBe('fresh');
  });

  test("report dated yesterday → age 1, STALE: health-check writes today's report seconds before this script, so yesterday's file means today's check did not run (Codex 2026-09-16 #7)", () => {
    const { written } = assembleWith('2026-09-01.txt', reportDatedHeader('2026-09-01'), '2026-09-02');
    expect(written.health_report.report_age_days).toBe(1);
    expect(written.health_report.stale).toBe(true);
    expect(written.sensor_status.health_report).toBe('stale');
  });

  test('a FUTURE-dated report (clock skew) is stale — it would otherwise be selected as newest and read fresh forever', () => {
    const { written } = assembleWith('2026-09-03.txt', reportDatedHeader('2026-09-03'), '2026-09-02');
    expect(written.health_report.report_age_days).toBe(-1);
    expect(written.health_report.stale).toBe(true);
    expect(written.sensor_status.health_report).toBe('stale');
  });

  test('an impossible calendar date (2026-02-30) is stale with a null age — Date.parse would silently roll it to March 2', () => {
    const { written } = assembleWith('2026-03-02.txt', reportDatedHeader('2026-02-30'), '2026-03-02');
    expect(written.health_report.report_age_days).toBeNull();
    expect(written.health_report.stale).toBe(true);
    expect(written.sensor_status.health_report).toBe('stale');
  });

  test('an unparseable header date (9999-99-99) is stale with a null age, never fresh', () => {
    const { written } = assembleWith('2026-09-02.txt', reportDatedHeader('9999-99-99'), '2026-09-02');
    expect(written.health_report.report_age_days).toBeNull();
    expect(written.health_report.stale).toBe(true);
    expect(written.sensor_status.health_report).toBe('stale');
  });

  test("report dated 2 days ago → stale", () => {
    const { written } = assembleWith('2026-08-31.txt', reportDatedHeader('2026-08-31'), '2026-09-02');
    expect(written.health_report.report_age_days).toBe(2);
    expect(written.health_report.stale).toBe(true);
    expect(written.sensor_status.health_report).toBe('stale');
  });

  test("report dated 3 days ago → age 3, stale true, sensor_status 'stale'", () => {
    const { written } = assembleWith('2026-08-30.txt', reportDatedHeader('2026-08-30'), '2026-09-02');
    expect(written.health_report.report_age_days).toBe(3);
    expect(written.health_report.stale).toBe(true);
    expect(written.sensor_status.health_report).toBe('stale');
  });

  test('age is computed against the injected today, not the wall clock', () => {
    const { written } = assembleWith('2026-08-30.txt', reportDatedHeader('2026-08-30'), '2026-09-06');
    expect(written.health_report.report_age_days).toBe(7);
  });

  test('a dated file whose header date is missing → report_date null, age null, stale true', () => {
    // Sections parse, so it is NOT malformed — only the date is unreadable.
    const noHeader = [
      'SCRAPING',
      '-'.repeat(50),
      '  v athinorama          170 events (same)',
      '',
      'DATABASE',
      '-'.repeat(50),
      '  Total: 19000 | Visible: 570 | Hidden: 18430',
      '',
    ].join('\n');
    const { written } = assembleWith('2026-09-02.txt', noHeader, '2026-09-02');
    expect(written.health_report.report_date).toBeNull();
    expect(written.health_report.report_age_days).toBeNull();
    expect(written.health_report.stale).toBe(true);
    expect(written.sensor_status.health_report).toBe('stale');
  });

  test("garbage in a correctly-dated file → sensor_status 'malformed', blocks null/empty, assembly still succeeds", () => {
    // The Analyst needs the signal more than it needs the assembly to fail:
    // a throwing assembler leaves the PREVIOUS scoreboard.json in place, which
    // is exactly the stale-evidence failure this sensor exists to catch.
    const garbage = 'Traceback (most recent call last):\n  health-check died\n<<<binary noise>>>\n';
    const { written, raw, returned } = assembleWith('2026-09-02.txt', garbage, '2026-09-02');
    expect(written.sensor_status.health_report).toBe('malformed');
    expect(written.health_report.report_date).toBeNull();
    expect(written.health_report.scraping).toEqual({});
    expect(written.health_report.database).toBeNull();
    expect(written.health_report.build).toBeNull();
    expect(written.health_report.enrichment).toBeNull();
    expect(written.health_report.alerts).toEqual([]);
    expect(written.health_report.report_file).toBe('2026-09-02.txt');
    // Still a valid, complete scoreboard: DB counts present, JSON parses.
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(written.total_events).toBe(EXPECTED_TOTAL);
    expect(returned.sensor_status.health_report).toBe('malformed');
  });

  test('malformed beats stale: garbage in an OLD file still reports malformed', () => {
    const { written } = assembleWith('2026-08-20.txt', 'nothing parseable here\n', '2026-09-02');
    expect(written.sensor_status.health_report).toBe('malformed');
    expect(written.health_report.stale).toBe(true);
  });

  test('a report with scraping entries but no DATABASE block is NOT malformed', () => {
    // Health-check can emit a scraping-only report; only a report with NEITHER
    // expected section counts as malformed, or the sensor cries wolf.
    const scrapingOnly = [
      'AGENT ATHENS HEALTH REPORT - 2026-09-02',
      '',
      'SCRAPING',
      '-'.repeat(50),
      '  v athinorama          170 events (same)',
      '',
    ].join('\n');
    const { written } = assembleWith('2026-09-02.txt', scrapingOnly, '2026-09-02');
    expect(written.health_report.database).toBeNull();
    expect(Object.keys(written.health_report.scraping).length).toBeGreaterThan(0);
    expect(written.sensor_status.health_report).toBe('fresh');
  });

  test('a report with a DATABASE block but no scraping entries is NOT malformed', () => {
    const dbOnly = [
      'AGENT ATHENS HEALTH REPORT - 2026-09-02',
      '',
      'DATABASE',
      '-'.repeat(50),
      '  Total: 19000 | Visible: 570 | Hidden: 18430',
      '',
    ].join('\n');
    const { written } = assembleWith('2026-09-02.txt', dbOnly, '2026-09-02');
    expect(written.health_report.scraping).toEqual({});
    expect(written.health_report.database).not.toBeNull();
    expect(written.sensor_status.health_report).toBe('fresh');
  });

  test('sensor_status is a top-level block with a health_report verdict', () => {
    const { written } = assembleWith('2026-09-02.txt', reportDatedHeader('2026-09-02'), '2026-09-02');
    expect(Object.keys(written.sensor_status)).toEqual(['health_report']);
    expect(['fresh', 'stale', 'malformed']).toContain(written.sensor_status.health_report);
  });

  test('every pre-existing health_report field survives the new ones', () => {
    const { written } = assembleWith('2026-09-02.txt', REPORT_WITH_ALERTS, '2026-09-02');
    expect(Object.keys(written.health_report).sort()).toEqual(
      ['alerts', 'build', 'database', 'enrichment', 'report_age_days', 'report_date', 'report_file', 'scraping', 'stale'].sort(),
    );
  });

  test('the default today is the Athens-local helper, never a UTC calendar day (source pin: a runtime pin is blind to the zone for ~21 h of every day)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'assemble-scoreboard.ts'), 'utf-8');
    expect(src).toContain('opts.today ?? athensTodaySql()');
    expect(src).not.toMatch(/const today = .*new Date\(\)/);
  });

  test('the default today path (no injection) resolves and grades an Athens-today report as fresh', () => {
    const today = athensTodaySql();
    const dir = mkdtempSync(join(tmpdir(), 'aa-scoreboard-wallclock-'));
    try {
      writeFileSync(join(dir, `${today}.txt`), reportDatedHeader(today));
      const out = join(dir, 'scoreboard.json');
      assembleScoreboard({ dbPath, reportsDir: dir, outPath: out });
      const p = JSON.parse(readFileSync(out, 'utf-8'));
      expect(p.health_report.report_age_days).toBe(0);
      expect(p.sensor_status.health_report).toBe('fresh');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 5: every failure exits non-zero and says what failed + what to try.
// ---------------------------------------------------------------------------
function runCli(args: string[]) {
  const r = Bun.spawnSync(['bun', 'run', SCRIPT, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  return { code: r.exitCode, out: new TextDecoder().decode(r.stdout), err: new TextDecoder().decode(r.stderr) };
}

describe('CLI — failure paths speak to the retrier', () => {
  test('missing DB → non-zero exit, stderr names the DB path and says what to try, and NO stub DB is created', () => {
    // A missing FILE in an EXISTING directory: without the existence guard,
    // bun:sqlite would create a 0-byte database here (the 2026-06-30
    // empty-events.db incident class) — the property pinned is "never create".
    const missing = join(work, 'missing-events.db');
    const r = runCli([`--db=${missing}`, `--reports-dir=${reportsDir}`, `--out=${join(work, 'unused.json')}`]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('assemble-scoreboard: FAILED');
    expect(r.err).toContain(missing);
    expect(r.err).toMatch(/try:/);
    expect(existsSync(missing)).toBe(false);
    expect(existsSync(join(work, 'unused.json'))).toBe(false);
  });

  test('empty reports dir → non-zero exit with a clear message', () => {
    const empty = join(work, 'empty-reports');
    mkdirSync(empty, { recursive: true });
    const r = runCli([`--db=${dbPath}`, `--reports-dir=${empty}`, `--out=${join(work, 'unused2.json')}`]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('assemble-scoreboard: FAILED');
    expect(r.err).toContain(empty);
    expect(r.err).toMatch(/try:/);
  });

  test('missing reports dir → non-zero exit with a clear message', () => {
    const missingDir = join(work, 'no-such-reports');
    const r = runCli([`--db=${dbPath}`, `--reports-dir=${missingDir}`, `--out=${join(work, 'unused3.json')}`]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('assemble-scoreboard: FAILED');
    expect(r.err).toContain(missingDir);
    expect(r.err).toMatch(/try:/);
  });

  test('unknown CLI argument → non-zero exit naming the argument and the accepted flags', () => {
    const r = runCli(['--bogus=1']);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('assemble-scoreboard: FAILED');
    expect(r.err).toContain('--bogus=1');
    expect(r.err).toMatch(/try:/);
  });

  test('happy path via CLI → exit 0 and the file is written where --out points', () => {
    const out = join(work, 'cli-scoreboard.json');
    const r = runCli([`--db=${dbPath}`, `--reports-dir=${reportsDir}`, `--out=${out}`]);
    expect(r.code).toBe(0);
    const p = JSON.parse(readFileSync(out, 'utf-8'));
    expect(p.total_events).toBe(EXPECTED_TOTAL);
    expect(p.upcoming_events).toBe(EXPECTED_CURRENT);
  });

  test('WAL-mode DB with NO -wal/-shm sidecars (post sqlite3-CLI close) → exit 0, not SQLITE_CANTOPEN', () => {
    // Fresh DB in its own dir: earlier in-process opens may have re-created the
    // sidecars on the shared fixture, which would mask the failure.
    const dir = mkdtempSync(join(tmpdir(), 'aa-scoreboard-wal-'));
    try {
      const walDb = join(dir, 'events.db');
      seedDb(walDb);
      expect(isWalFile(walDb)).toBe(true);
      expect(existsSync(`${walDb}-wal`)).toBe(false);
      expect(existsSync(`${walDb}-shm`)).toBe(false);
      const out = join(dir, 'scoreboard.json');
      const r = runCli([`--db=${walDb}`, `--reports-dir=${reportsDir}`, `--out=${out}`]);
      expect(r.err).toBe('');
      expect(r.code).toBe(0);
      expect(JSON.parse(readFileSync(out, 'utf-8')).total_events).toBe(EXPECTED_TOTAL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Seam guards (same convention as scripts/__tests__/deploy-gate.test.ts): the
// brief's "tracked and pushed" criterion lives in the shell wiring, not in the
// script, so pin it here or a green suite says nothing about it.
// ---------------------------------------------------------------------------
describe('daily-automated.sh seam guards — scoreboard reaches the daily commit', () => {
  const daily = readFileSync(join(ROOT, 'scripts', 'daily-automated.sh'), 'utf-8');

  test('PIPELINE_ALLOWLIST contains data/scoreboard.json', () => {
    const start = daily.indexOf('local PIPELINE_ALLOWLIST=(');
    expect(start).toBeGreaterThan(-1);
    const end = daily.indexOf(')', start);
    expect(end).toBeGreaterThan(start);
    expect(daily.slice(start, end)).toContain('"data/scoreboard.json"');
  });

  test('main() calls run_scoreboard AFTER run_health_check and BEFORE `if run_deploy`', () => {
    const mainStart = daily.indexOf('\nmain() {');
    expect(mainStart).toBeGreaterThan(-1);
    const body = daily.slice(mainStart);
    const health = body.indexOf('run_health_check');
    const scoreboard = body.indexOf('run_scoreboard');
    const deploy = body.indexOf('if run_deploy');
    expect(health).toBeGreaterThan(-1);
    expect(scoreboard).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(-1);
    expect(health).toBeLessThan(scoreboard);
    expect(scoreboard).toBeLessThan(deploy);
  });
});

describe('parseHealthReport — standalone contract', () => {
  test('is pessimistic until graded: stale true and age null before gradeHealthReport runs', () => {
    const b = parseHealthReport('AGENT ATHENS HEALTH REPORT - 2026-09-02\n', 'x.txt');
    expect(b.report_date).toBe('2026-09-02');
    expect(b.stale).toBe(true);
    expect(b.report_age_days).toBeNull();
  });
});

describe('producer/consumer seam guards — the sensor is only as good as what reads and writes it', () => {
  test('.claude/analyst-triage.md step 0 gates on sensor_status.health_report, fail-closed on a missing key', () => {
    const spec = readFileSync(join(ROOT, '.claude', 'analyst-triage.md'), 'utf-8');
    const step0 = spec.split('\n').find((l) => l.startsWith('0. Preconditions'));
    expect(step0).toBeDefined();
    expect(step0!).toContain('sensor_status.health_report');
    expect(step0!).toContain('not `fresh`');
    expect(step0!).toContain('report_age_days');
    expect(step0!).toContain('missing or non-string `sensor_status.health_report`');
    expect(step0!).toContain('unparseable `generated_at`');
    for (const v of ['fresh', 'stale', 'malformed']) expect(spec).toContain(v);
  });

  test('scripts/health-check.ts dates its report with the same Athens-local helper the grader uses (a UTC date reads one day old between 00:00 and 03:00 Athens)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'health-check.ts'), 'utf-8');
    expect((src.match(/const today = getAthensTodayStr\(\);/g) ?? []).length).toBe(2);
    expect(src).not.toMatch(/const today = new Date\(\)\.toISOString/);
  });
});
