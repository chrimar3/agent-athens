/**
 * scripts/yield-canary.ts — Scraper yield canary (issue #1).
 *
 * Synthetic fixtures only: a temp sqlite FILE seeded from src/db/schema.sql
 * (the prod-db-guard preload forbids data/events.db under `bun test`, and the
 * CLI opens by path). Every fixture asserts its own precondition so a test can
 * never go vacuous if the seed drifts. GitHub is never touched: in-process
 * tests inject a fake issue sink; CLI tests point YIELD_CANARY_GH at a fake
 * `gh` shell script that logs its argv and answers `issue list` from a file.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ACTIVE_SOURCE_IDS } from '../src/config/active-source-ids';
import {
  athensToday,
  dayDiff,
  computeYields,
  runCanary,
  openScrapeStatsReadOnly,
  issueTitle,
  issueTitlePrefix,
  type IssueSink,
  type SourceYield,
} from '../scripts/yield-canary';

const ROOT = join(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts', 'yield-canary.ts');
const SCHEMA = readFileSync(join(ROOT, 'src', 'db', 'schema.sql'), 'utf-8');

// The latest run window is derived from the data (max date in scrape_stats),
// never from the wall clock, so these dates can stay fixed forever.
const LATEST = '2026-09-14';
const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;

type StatRow = { source: string; date: string; found: number; success?: 0 | 1; time?: string };

function seedStats(path: string, rows: StatRow[]): void {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  const stat = db.prepare(`
    INSERT INTO scrape_stats (source, scraped_at, events_found, events_new, events_updated, duration_ms, success, error_message)
    VALUES ($source, $at, $found, 0, 0, 1000, $ok, NULL)
  `);
  for (const r of rows) {
    stat.run({ $source: r.source, $at: `${r.date}T${r.time ?? '05:00:00.000'}Z`, $found: r.found, $ok: r.success ?? 1 });
  }
  stat.finalize();
  db.close(true);
  // Production leaves no -wal/-shm after sqlite3-CLI closes; mirror that so a
  // `{ readonly: true }` regression would surface as SQLITE_CANTOPEN here.
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

/** history: per-day events_found for the days BEFORE LATEST (day 1..n). */
function history(source: string, counts: number[], startDay = 1): StatRow[] {
  return counts.map((found, i) => ({ source, date: day(startDay + i), found }));
}

class FakeSink implements IssueSink {
  created: Array<{ title: string; body: string; label: string }> = [];
  constructor(public openTitles: string[] = []) {}
  async listOpenTitles(_search: string): Promise<string[]> { return this.openTitles; }
  async create(title: string, body: string, label: string): Promise<void> { this.created.push({ title, body, label }); }
}

function byId(yields: SourceYield[], source: string): SourceYield {
  const y = yields.find((s) => s.source === source);
  if (!y) throw new Error(`fixture precondition: ${source} missing from yields`);
  return y;
}

let work: string;
beforeAll(() => { work = mkdtempSync(join(tmpdir(), 'aa-yield-canary-')); });
afterAll(() => { rmSync(work, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------
// Pure math over a seeded DB: computeYields()
// ---------------------------------------------------------------------------
describe('computeYields — trailing mean over the prior window, latest run excluded', () => {
  const SOURCES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
  let dbPath: string;

  beforeAll(() => {
    dbPath = join(work, 'math.db');
    seedStats(dbPath, [
      // alpha: 3 healthy days at 100 then a drop to 59 — the boundary case.
      ...history('alpha', [100, 100, 100], 11),
      { source: 'alpha', date: LATEST, found: 59 },
      // beta: identical history, latest exactly at threshold*mean (60) — NOT a trip.
      ...history('beta', [100, 100, 100], 11),
      { source: 'beta', date: LATEST, found: 60 },
      // gamma: only 2 samples → insufficient history even though latest is 0.
      ...history('gamma', [50, 50], 12),
      { source: 'gamma', date: LATEST, found: 0 },
      // delta: healthy history, NO row at all in the latest window (scraper disabled).
      ...history('delta', [40, 44, 36], 11),
      // epsilon: history polluted with things the mean must ignore —
      //   a failed run (success=0) at 0, a row 40 days ago at 10000 (outside the
      //   30-day window), and two runs on one day (per-day max wins).
      ...history('epsilon', [100, 100, 100], 11),
      { source: 'epsilon', date: day(12), found: 0, success: 0, time: '12:00:00.000' },
      { source: 'epsilon', date: day(13), found: 10, time: '01:00:00.000' }, // same day as the 100 above → max=100
      { source: 'epsilon', date: '2026-08-05', found: 10000 },
      { source: 'epsilon', date: LATEST, found: 90 },
      // zeta: two runs in the latest window; the max (80) is the yield, not the 0 rerun.
      ...history('zeta', [100, 100, 100], 11),
      { source: 'zeta', date: LATEST, found: 0, time: '01:00:00.000' },
      { source: 'zeta', date: LATEST, found: 80, time: '05:00:00.000' },
      // Inactive source with a catastrophic drop: must be ignored entirely.
      ...history('eventbrite', [500, 500, 500], 11),
      { source: 'eventbrite', date: LATEST, found: 1 },
    ]);
  });

  test('fixture precondition: latest run date is LATEST and delta has no row there', () => {
    const db = openScrapeStatsReadOnly(dbPath);
    try {
      const maxDate = (db.prepare(`SELECT MAX(date(scraped_at)) AS d FROM scrape_stats`).get() as { d: string }).d;
      expect(maxDate).toBe(LATEST);
      const deltaLatest = (db.prepare(`SELECT COUNT(*) AS n FROM scrape_stats WHERE source='delta' AND date(scraped_at)=?`).get(LATEST) as { n: number }).n;
      expect(deltaLatest).toBe(0);
      const deltaHistory = (db.prepare(`SELECT COUNT(*) AS n FROM scrape_stats WHERE source='delta'`).get() as { n: number }).n;
      expect(deltaHistory).toBe(3);
    } finally {
      db.close();
    }
  });

  function compute(threshold = 0.6, windowDays = 30) {
    const db = openScrapeStatsReadOnly(dbPath);
    try {
      return computeYields(db, { activeSources: SOURCES, threshold, windowDays });
    } finally {
      db.close();
    }
  }

  test('mean is over the PRIOR days only — the latest run is not part of its own baseline', () => {
    const alpha = byId(compute(), 'alpha');
    expect(alpha.latestRunDate).toBe(LATEST);
    expect(alpha.latest).toBe(59);
    expect(alpha.samples).toBe(3);
    // With the latest row leaked into the mean this would be 89.75, not 100.
    expect(alpha.mean).toBe(100);
  });

  test('threshold boundary: latest < threshold*mean trips; latest == threshold*mean does not', () => {
    const y = compute();
    expect(byId(y, 'alpha').status).toBe('tripped'); // 59 < 60
    expect(byId(y, 'beta').status).toBe('ok');       // 60 is not < 60
  });

  test('--threshold is honoured: at 0.5 the 59-of-100 case is healthy', () => {
    expect(byId(compute(0.5), 'alpha').status).toBe('ok');
    expect(byId(compute(0.5), 'alpha').threshold).toBe(0.5);
  });

  test('fewer than 3 prior samples → insufficient history, never a trip (even at 0)', () => {
    const gamma = byId(compute(), 'gamma');
    expect(gamma.samples).toBe(2);
    expect(gamma.latest).toBe(0);
    expect(gamma.status).toBe('insufficient');
  });

  test('active source with NO row in the latest window counts as 0 and trips (disabled-scraper criterion)', () => {
    const delta = byId(compute(), 'delta');
    expect(delta.latest).toBe(0);
    expect(delta.mean).toBe(40);
    expect(delta.samples).toBe(3);
    expect(delta.status).toBe('tripped');
  });

  test('history ignores failed runs, rows outside the window, and takes the per-day max', () => {
    const eps = byId(compute(), 'epsilon');
    expect(eps.samples).toBe(3);   // days 11,12,13 — not the 08-05 row, not a 4th "day" from the rerun
    expect(eps.mean).toBe(100);    // the success=0 zero and the 10-event rerun did not dent it
    expect(eps.status).toBe('ok'); // 90 ≥ 60
  });

  test('a wider --window-days pulls the 40-day-old row into the mean', () => {
    const eps = byId(compute(0.6, 60), 'epsilon');
    expect(eps.samples).toBe(4);
    expect(eps.mean).toBe(2575); // (100+100+100+10000)/4
  });

  test('latest yield is the per-day max, so a 0-event rerun does not mask a real 80', () => {
    const zeta = byId(compute(), 'zeta');
    expect(zeta.latest).toBe(80);
    expect(zeta.status).toBe('ok');
  });

  test('inactive sources are not evaluated even when they crater', () => {
    const y = compute();
    expect(y.map((s) => s.source).sort()).toEqual([...SOURCES].sort());
    expect(y.find((s) => s.source === 'eventbrite')).toBeUndefined();
  });

  test('a mean of 0 (dead-for-30-days source) cannot trip — nothing is below 0', () => {
    const p = join(work, 'zero-mean.db');
    seedStats(p, [...history('alpha', [0, 0, 0], 11), { source: 'alpha', date: LATEST, found: 0 }]);
    const db = openScrapeStatsReadOnly(p);
    try {
      const alpha = byId(computeYields(db, { activeSources: ['alpha'], threshold: 0.6, windowDays: 30 }), 'alpha');
      expect(alpha.mean).toBe(0);
      expect(alpha.status).toBe('ok');
    } finally {
      db.close();
    }
  });

  test('a lone single-source run on a LATER day is not the comparison day (no mass false trip)', () => {
    // `bun run scripts/scrape-all.ts --source more` is a documented production
    // flag and writes exactly ONE scrape_stats row. Without a quorum rule that
    // row becomes the global MAX date, every other active source reads as
    // latest=0 against a healthy mean, and one invocation files N issues.
    const p = join(work, 'single-source-day.db');
    const srcs = ['alpha', 'beta', 'gamma', 'delta'];
    seedStats(p, [
      ...srcs.flatMap((s) => [...history(s, [100, 100, 100], 11), { source: s, date: LATEST, found: 100 }]),
      { source: 'alpha', date: '2026-09-15', found: 120 }, // manual single-source run the day after
    ]);
    const db = openScrapeStatsReadOnly(p);
    try {
      // Fixture precondition: the global MAX date really is the lone day.
      const maxDate = (db.prepare(`SELECT MAX(date(scraped_at)) AS d FROM scrape_stats`).get() as { d: string }).d;
      expect(maxDate).toBe('2026-09-15');
      const onMax = (db.prepare(`SELECT COUNT(DISTINCT source) AS n FROM scrape_stats WHERE date(scraped_at)='2026-09-15'`).get() as { n: number }).n;
      expect(onMax).toBe(1);

      const y = computeYields(db, { activeSources: srcs, threshold: 0.6, windowDays: 30 });
      for (const s of y) {
        expect(s.latestRunDate).toBe(LATEST); // the last day a quorum of sources ran
        expect(s.latest).toBe(100);
        expect(s.status).toBe('ok');
      }
    } finally {
      db.close();
    }
  });

  test('empty scrape_stats → every active source is insufficient (no latest window at all)', () => {
    const p = join(work, 'empty.db');
    seedStats(p, []);
    const db = openScrapeStatsReadOnly(p);
    try {
      const y = computeYields(db, { activeSources: ['alpha', 'beta'], threshold: 0.6, windowDays: 30 });
      expect(y).toHaveLength(2);
      for (const s of y) {
        expect(s.status).toBe('insufficient');
        expect(s.latestRunDate).toBeNull();
      }
    } finally {
      db.close();
    }
  });
});

// ---------------------------------------------------------------------------
// runCanary(): issue creation + dedupe through an injected sink
// ---------------------------------------------------------------------------
describe('runCanary — one issue per tripped source, deduped against open issues', () => {
  let dbPath: string;
  beforeAll(() => {
    dbPath = join(work, 'issues.db');
    seedStats(dbPath, [
      ...history('alpha', [100, 100, 100], 11), { source: 'alpha', date: LATEST, found: 3 },
      ...history('beta', [200, 200, 200], 11),  { source: 'beta', date: LATEST, found: 10 },
      ...history('kappa', [50, 50, 50], 11),    { source: 'kappa', date: LATEST, found: 50 },
    ]);
  });

  test('issue title carries source, latest and mean; the dedupe prefix is its stable head', () => {
    expect(issueTitlePrefix('alpha')).toBe('Yield canary: alpha');
    expect(issueTitle('alpha', 3, 100)).toBe('Yield canary: alpha dropped to 3 (30-day mean 100)');
    expect(issueTitle('alpha', 3, 100)).toStartWith(issueTitlePrefix('alpha'));
  });

  test('two tripped sources → two issues labelled "proposed", healthy source gets none', async () => {
    const sink = new FakeSink([]);
    const r = await runCanary({ dbPath, activeSources: ['alpha', 'beta', 'kappa'], threshold: 0.6, windowDays: 30, dryRun: false, sink });
    expect(r.tripped.map((t) => t.source).sort()).toEqual(['alpha', 'beta']);
    expect(sink.created.map((c) => c.title).sort()).toEqual([
      'Yield canary: alpha dropped to 3 (30-day mean 100)',
      'Yield canary: beta dropped to 10 (30-day mean 200)',
    ]);
    for (const c of sink.created) expect(c.label).toBe('proposed');
    const body = sink.created.find((c) => c.title.includes('alpha'))!.body;
    // Body sections in the required order: problem → evidence → smallest change → verify at T+14 → rollback
    const order = ['Problem', 'Evidence', 'Smallest change', 'Verify at T+14', 'Rollback'].map((h) => body.indexOf(h));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(body).toContain('latest: 3');
    expect(body).toContain('30-day mean: 100');
    expect(body).toContain('samples: 3');
    expect(body).toContain('threshold: 0.6');
  });

  test('an OPEN issue whose title starts with "Yield canary: <source>" suppresses a duplicate for that source only', async () => {
    // Stale numbers in the existing title on purpose: the dedupe key is the
    // prefix, not the exact title — a second day of decline must not re-file.
    const sink = new FakeSink(['Yield canary: alpha dropped to 7 (30-day mean 101)', 'Scraper yield canary']);
    const r = await runCanary({ dbPath, activeSources: ['alpha', 'beta', 'kappa'], threshold: 0.6, windowDays: 30, dryRun: false, sink });
    expect(r.tripped.map((t) => t.source).sort()).toEqual(['alpha', 'beta']); // still reported as tripped
    expect(sink.created.map((c) => c.title)).toEqual(['Yield canary: beta dropped to 10 (30-day mean 200)']);
    expect(r.suppressed).toEqual(['alpha']);
  });

  test('the unrelated open issue "Scraper yield canary" (#1) is not a dedupe hit for any source', async () => {
    const sink = new FakeSink(['Scraper yield canary']);
    await runCanary({ dbPath, activeSources: ['alpha'], threshold: 0.6, windowDays: 30, dryRun: false, sink });
    expect(sink.created).toHaveLength(1);
  });

  test('a source with insufficient history never trips and never files an issue, even beside a real trip', async () => {
    // The invariant the quarantined `clubber` case rests on: 0 prior samples and
    // latest 0 is NOT evidence of a drop, and must never reach GitHub as
    // "clubber dropped to 0 (30-day mean 0)". Pinned at the runCanary/CLI seam,
    // because that is where the tripped set is turned into issues.
    const p = join(work, 'insufficient-vs-tripped.db');
    seedStats(p, [
      ...history('alpha', [100, 100, 100], 11), { source: 'alpha', date: LATEST, found: 3 }, // genuinely tripped
      { source: 'newbie', date: LATEST, found: 0 },                                          // 0 prior samples, latest 0
    ]);
    const active = ['alpha', 'newbie'];
    // Fixture precondition: newbie really is 'insufficient' (not merely absent).
    const probe = await runCanary({ dbPath: p, activeSources: active, threshold: 0.6, windowDays: 30, dryRun: true, sink: new FakeSink([]), today: LATEST });
    expect(byId(probe.yields, 'newbie').status).toBe('insufficient');
    expect(byId(probe.yields, 'newbie').latest).toBe(0);
    expect(byId(probe.yields, 'alpha').status).toBe('tripped');

    expect(probe.tripped.map((t) => t.source)).toEqual(['alpha']);
    expect(probe.wouldCreate.map((w) => w.source)).toEqual(['alpha']);
    expect(JSON.stringify(probe.wouldCreate)).not.toContain('newbie');

    const sink = new FakeSink([]);
    const live = await runCanary({ dbPath: p, activeSources: active, threshold: 0.6, windowDays: 30, dryRun: false, sink, today: LATEST });
    expect(live.tripped.map((t) => t.source)).toEqual(['alpha']);
    expect(sink.created.map((c) => c.title)).toEqual(['Yield canary: alpha dropped to 3 (30-day mean 100)']);
    expect(JSON.stringify(sink.created)).not.toContain('newbie');
  });

  test('--dry-run creates nothing and does not even consult the sink', async () => {
    const sink = new FakeSink([]);
    let listCalls = 0;
    sink.listOpenTitles = async () => { listCalls++; return []; };
    const r = await runCanary({ dbPath, activeSources: ['alpha', 'beta'], threshold: 0.6, windowDays: 30, dryRun: true, sink });
    expect(r.tripped).toHaveLength(2);
    expect(r.wouldCreate.map((w) => w.title)).toEqual([
      'Yield canary: alpha dropped to 3 (30-day mean 100)',
      'Yield canary: beta dropped to 10 (30-day mean 200)',
    ]);
    expect(sink.created).toHaveLength(0);
    expect(listCalls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Staleness: a pipeline that stopped entirely must not read as healthy
// ---------------------------------------------------------------------------
describe('staleness — a stalled pipeline is the failure a yield canary most needs to catch', () => {
  let dbPath: string;
  const srcs = ['alpha', 'beta', 'gamma'];
  beforeAll(() => {
    dbPath = join(work, 'stale.db');
    seedStats(dbPath, srcs.flatMap((s) => [...history(s, [100, 100, 100], 11), { source: s, date: LATEST, found: 100 }]));
  });

  test('fixture precondition: every source is healthy on the comparison day, so only age can fail', async () => {
    const r = await runCanary({ dbPath, activeSources: srcs, threshold: 0.6, windowDays: 30, dryRun: true, sink: new FakeSink([]), today: LATEST });
    expect(r.yields.map((y) => y.status)).toEqual(['ok', 'ok', 'ok']);
    expect(r.stale).toBeNull();
  });

  test('comparison day older than maxAgeDays → stale, with the age and the limit named', async () => {
    const r = await runCanary({ dbPath, activeSources: srcs, threshold: 0.6, windowDays: 30, dryRun: true, sink: new FakeSink([]), today: '2026-09-30', maxAgeDays: 2 });
    expect(r.stale).not.toBeNull();
    expect(r.stale!.latestRunDate).toBe(LATEST);
    expect(r.stale!.ageDays).toBe(16);
    expect(r.stale!.maxAgeDays).toBe(2);
    expect(r.tripped).toHaveLength(0); // nothing tripped — staleness is the ONLY signal here
  });

  test('exactly at the limit is not stale; one day past it is', async () => {
    const at = await runCanary({ dbPath, activeSources: srcs, threshold: 0.6, windowDays: 30, dryRun: true, sink: new FakeSink([]), today: '2026-09-16', maxAgeDays: 2 });
    expect(at.stale).toBeNull();
    const past = await runCanary({ dbPath, activeSources: srcs, threshold: 0.6, windowDays: 30, dryRun: true, sink: new FakeSink([]), today: '2026-09-17', maxAgeDays: 2 });
    expect(past.stale!.ageDays).toBe(3);
  });

  test('staleness files NO GitHub issue — it is an exit-code/stderr signal only', async () => {
    const sink = new FakeSink([]);
    let listCalls = 0;
    sink.listOpenTitles = async () => { listCalls++; return []; };
    const r = await runCanary({ dbPath, activeSources: srcs, threshold: 0.6, windowDays: 30, dryRun: false, sink, today: '2026-10-30', maxAgeDays: 2 });
    expect(r.stale).not.toBeNull();
    expect(sink.created).toHaveLength(0);
    expect(listCalls).toBe(0);
  });

  test('empty scrape_stats → stale with no comparison day at all (not a quiet exit 0)', async () => {
    const p = join(work, 'stale-empty.db');
    seedStats(p, []);
    const r = await runCanary({ dbPath: p, activeSources: srcs, threshold: 0.6, windowDays: 30, dryRun: true, sink: new FakeSink([]), today: LATEST });
    expect(r.stale).not.toBeNull();
    expect(r.stale!.latestRunDate).toBeNull();
    expect(r.stale!.ageDays).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLI: exit codes, rule-5 stderr line, fake-gh seam
// ---------------------------------------------------------------------------
/**
 * YIELD_CANARY_TODAY pins the clock: the fixtures' newest scrape_stats row is
 * LATEST forever, so without the pin every CLI run would be stale. Tests that
 * exercise staleness override it (or drop it, for the real-clock path).
 */
function runCli(args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync(['bun', 'run', SCRIPT, ...args], {
    cwd: ROOT, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, YIELD_CANARY_TODAY: LATEST, ...env },
  });
  return { code: r.exitCode, out: new TextDecoder().decode(r.stdout), err: new TextDecoder().decode(r.stderr) };
}

/**
 * Fake `gh`: appends its argv to LOG (one line per call — the multi-line
 * --body is flattened so the log stays line-parsable); for `issue list` prints
 * the JSON in LIST_FILE. Never touches the network. bash 3.2-safe.
 */
function writeFakeGh(dir: string, listJson: string): { gh: string; log: string } {
  const gh = join(dir, 'fake-gh');
  const log = join(dir, 'gh-calls.log');
  const listFile = join(dir, 'gh-list.json');
  writeFileSync(listFile, listJson);
  writeFileSync(gh, `#!/bin/bash
printf '%s' "$*" | tr '\\n' ' ' >> "${log}"; printf '\\n' >> "${log}"
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then cat "${listFile}"; exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "create" ]; then echo "https://github.com/example/repo/issues/999"; exit 0; fi
echo "fake-gh: unexpected call: $*" >&2; exit 64
`);
  chmodSync(gh, 0o755);
  return { gh, log };
}

describe('CLI — exit codes and rule-5 stderr', () => {
  let trippedDb: string;
  let healthyDb: string;
  const active = [...ACTIVE_SOURCE_IDS];

  beforeAll(() => {
    // The CLI evaluates the REAL active list, so seed every real source.
    // `megaron` is the one that drops (real 2026-09-06-class incident: ~47%).
    trippedDb = join(work, 'cli-tripped.db');
    healthyDb = join(work, 'cli-healthy.db');
    expect(active).toContain('megaron');
    expect(active.length).toBeGreaterThanOrEqual(3);
    const rows = (dropTo: number): StatRow[] => active.flatMap((s) => [
      ...history(s, [100, 100, 100], 11),
      { source: s, date: LATEST, found: s === 'megaron' ? dropTo : 100 },
    ]);
    seedStats(trippedDb, rows(53));   // 47% drop — the health-check's 50%-vs-yesterday rule misses this
    seedStats(healthyDb, rows(100));
  });

  test('--dry-run on a tripped DB → exit non-zero, ONE rule-5 stderr line naming source/latest/mean/threshold, would-be issue on stdout, gh never called', () => {
    const { gh, log } = writeFakeGh(join(work), '[]');
    const r = runCli([`--db=${trippedDb}`, '--dry-run'], { YIELD_CANARY_GH: gh });
    expect(r.code).not.toBe(0);
    const errLines = r.err.trim().split('\n');
    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toStartWith('yield-canary: FAILED — ');
    expect(errLines[0]).toContain('megaron');
    expect(errLines[0]).toContain('latest=53');
    expect(errLines[0]).toContain('mean=100');
    expect(errLines[0]).toContain('threshold=0.6');
    expect(errLines[0]).toMatch(/ — try: /);
    expect(r.out).toContain('[DRY RUN]');
    expect(r.out).toContain('Yield canary: megaron dropped to 53 (30-day mean 100)');
    expect(existsSync(log)).toBe(false); // dry-run never shells out to gh
  });

  test('healthy DB → exit 0 and one stdout summary line, gh never called', () => {
    const { gh, log } = writeFakeGh(join(work), '[]');
    const r = runCli([`--db=${healthyDb}`], { YIELD_CANARY_GH: gh });
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    const outLines = r.out.trim().split('\n');
    expect(outLines).toHaveLength(1);
    expect(outLines[0]).toContain(`${active.length} active sources`);
    expect(outLines[0]).toMatch(/0 tripped/);
    expect(existsSync(log)).toBe(false);
  });

  test('healthy sources but a stale comparison day → exit non-zero with ONE rule-5 line, and gh is never called', () => {
    const { gh, log } = writeFakeGh(mkdtempSync(join(work, 'gh-stale-')), '[]');
    const r = runCli([`--db=${healthyDb}`], { YIELD_CANARY_TODAY: '2026-10-14', YIELD_CANARY_GH: gh });
    expect(r.code).toBe(2);
    const errLines = r.err.trim().split('\n');
    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toStartWith('yield-canary: FAILED — ');
    expect(errLines[0]).toContain(LATEST);
    expect(errLines[0]).toContain('30 days old');
    expect(errLines[0]).toMatch(/ — try: /);
    expect(r.out).toContain('0 tripped');
    expect(existsSync(log)).toBe(false); // staleness never files an issue
  });

  test('with the REAL clock (no YIELD_CANARY_TODAY) the fixed-in-the-past fixture is stale', () => {
    // Precondition: the wall clock is past the fixture — true forever, since the
    // fixture dates never move. --max-age-days=1 keeps the assertion independent
    // of HOW far past, so this cannot start failing on a particular day.
    expect(dayDiff(LATEST, athensToday())).toBeGreaterThanOrEqual(2);
    const r = runCli([`--db=${healthyDb}`, '--dry-run', '--max-age-days=1'], { YIELD_CANARY_TODAY: '' });
    expect(r.code).toBe(2);
    expect(r.err).toContain('yield-canary: FAILED');
    expect(r.err).toContain('stale pipeline');
    expect(r.err).toContain(LATEST);
  });

  test('--max-age-days widens the staleness limit, and a bad value exits 1 naming the flag', () => {
    const ok = runCli([`--db=${healthyDb}`, '--max-age-days=60'], { YIELD_CANARY_TODAY: '2026-10-14' });
    expect(ok.err).toBe('');
    expect(ok.code).toBe(0);
    const bad = runCli([`--db=${healthyDb}`, '--max-age-days=0']);
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('yield-canary: FAILED');
    expect(bad.err).toContain('--max-age-days');
  });

  test('live mode with fake gh: creates the issue once, dedupes when an open one exists', () => {
    const dir1 = mkdtempSync(join(work, 'gh1-'));
    const a = writeFakeGh(dir1, '[]');
    const r1 = runCli([`--db=${trippedDb}`], { YIELD_CANARY_GH: a.gh });
    expect(r1.code).not.toBe(0);
    const calls1 = readFileSync(a.log, 'utf-8').trim().split('\n');
    expect(calls1.filter((c) => c.startsWith('issue list')).length).toBe(1);
    expect(calls1.filter((c) => c.startsWith('issue list'))[0]).toContain('--state open');
    expect(calls1.filter((c) => c.startsWith('issue list'))[0]).toContain('Yield canary: megaron');
    const creates1 = calls1.filter((c) => c.startsWith('issue create'));
    expect(creates1).toHaveLength(1);
    expect(creates1[0]).toContain('Yield canary: megaron dropped to 53 (30-day mean 100)');
    expect(creates1[0]).toContain('--label proposed');
    expect(r1.out).toContain('created:');

    const dir2 = mkdtempSync(join(work, 'gh2-'));
    const b = writeFakeGh(dir2, JSON.stringify([{ number: 41, title: 'Yield canary: megaron dropped to 60 (30-day mean 99)', state: 'OPEN' }]));
    const r2 = runCli([`--db=${trippedDb}`], { YIELD_CANARY_GH: b.gh });
    expect(r2.code).not.toBe(0); // still tripped — the exit code is the pipeline signal
    const calls2 = readFileSync(b.log, 'utf-8').trim().split('\n');
    expect(calls2.filter((c) => c.startsWith('issue create'))).toHaveLength(0);
    expect(r2.out).toContain('already open');
  });

  test('gh itself failing → exit 1 with FAILED/try:, the trip is still named', () => {
    const dir = mkdtempSync(join(work, 'gh-broken-'));
    const gh = join(dir, 'broken-gh');
    writeFileSync(gh, '#!/bin/bash\necho "gh: HTTP 401 not logged in" >&2\nexit 4\n');
    chmodSync(gh, 0o755);
    const r = runCli([`--db=${trippedDb}`], { YIELD_CANARY_GH: gh });
    expect(r.code).toBe(1);
    expect(r.err).toContain('yield-canary: FAILED');
    expect(r.err).toContain('megaron');
    expect(r.err).toMatch(/try:/);
  });

  test('--threshold=0.5 makes the 47% drop healthy (documents why 0.6 is the default)', () => {
    const r = runCli([`--db=${trippedDb}`, '--dry-run', '--threshold=0.5']);
    expect(r.code).toBe(0);
  });

  test('missing DB → exit 1, stderr names the path and says what to try, and NO stub DB is created', () => {
    const missing = join(work, 'missing-events.db');
    const r = runCli([`--db=${missing}`, '--dry-run']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('yield-canary: FAILED');
    expect(r.err).toContain(missing);
    expect(r.err).toMatch(/try:/);
    expect(existsSync(missing)).toBe(false);
  });

  test('unknown argument / bad threshold → exit 1 naming the argument and the accepted flags', () => {
    const r = runCli(['--bogus=1']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('yield-canary: FAILED');
    expect(r.err).toContain('--bogus=1');
    expect(r.err).toContain('--threshold=');
    const t = runCli([`--db=${healthyDb}`, '--threshold=abc']);
    expect(t.code).toBe(1);
    expect(t.err).toContain('yield-canary: FAILED');
    expect(t.err).toContain('abc');
  });

  test('WAL-mode DB with NO -wal/-shm sidecars → not SQLITE_CANTOPEN, and no write ever happens', () => {
    // Fresh DB in its own dir: earlier CLI runs re-create the sidecars on the
    // shared fixture, which would mask the `{ readonly: true }` failure class.
    const dir = mkdtempSync(join(work, 'wal-'));
    const walDb = join(dir, 'events.db');
    seedStats(walDb, active.flatMap((s) => [...history(s, [100, 100, 100], 11), { source: s, date: LATEST, found: 100 }]));
    expect(readFileSync(walDb).subarray(18, 20)).toEqual(Buffer.from([2, 2])); // header bytes 18/19 = WAL
    expect(existsSync(`${walDb}-wal`)).toBe(false);
    expect(existsSync(`${walDb}-shm`)).toBe(false);
    const before = readFileSync(walDb);
    const r = runCli([`--db=${walDb}`, '--dry-run']);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(readFileSync(walDb).equals(before)).toBe(true);
  });
});
