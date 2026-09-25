/**
 * Security loop round 8 — host jobs read the container-written events.db only
 * through src/watchdog/untrusted-db.ts.
 *
 * A judge hung the deadman watchdog forever with a recursive VIEW named
 * `events` in data/events.db (which pipeline containers write). The helper
 * copies the file with no-follow regular-file checks into a private temp dir,
 * opens the copy read-only with trusted_schema=OFF and query_only=ON, refuses
 * any view, any trigger that is not the project's own, and a required table
 * that is missing or virtual, and runs the queries in a child killed at a
 * wall clock. These tests drive it with hostile fixtures, then the deadman
 * end to end (DB_REFUSED alert text, the 10-minute run limit via its test
 * seam), the enrichment-check CLI, and pin that no launchd host job opens the
 * database directly.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ALLOWED_TRIGGER_SQL_SHA256, queryUntrustedDb, type UntrustedQuery } from '../../src/watchdog/untrusted-db';

const ROOT = join(import.meta.dir, '..', '..');
const DEADMAN = join(ROOT, 'scripts', 'deadman-watchdog.ts');
const CLI = join(ROOT, 'scripts', 'untrusted-db-query.ts');

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'aa-untrusted-db-test-')); tmpDirs.push(d); return d; };

const Q: Record<string, UntrustedQuery> = {
  count: { sql: 'SELECT COUNT(*) AS c FROM events', tables: ['events'] },
  max: { sql: 'SELECT MAX(enriched_at) AS m FROM events', tables: ['events'] },
  byVenue: { sql: 'SELECT venue_name, COUNT(*) AS n FROM events GROUP BY venue_name ORDER BY venue_name', tables: ['events'] },
  stats: { sql: 'SELECT source, success FROM scrape_stats WHERE source = ? ORDER BY scraped_at DESC LIMIT ?', params: ['benaki', 2], tables: ['scrape_stats'] },
};

/** A normal DB in WAL mode (the production journal mode), -wal left in place. */
function normalDb(dir = tmp()): string {
  const p = join(dir, 'events.db');
  const db = new Database(p, { create: true });
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA wal_autocheckpoint=0');
  db.exec('CREATE TABLE events (id TEXT, venue_name TEXT, enriched_at TEXT)');
  db.exec('CREATE TABLE scrape_stats (source TEXT, scraped_at TEXT, events_found INTEGER, success INTEGER)');
  db.exec("INSERT INTO events VALUES ('a', 'Gazarte', '2026-09-20 10:00:00'), ('b', 'Gazarte', '2026-09-21 11:00:00'), ('c', 'Onassis', NULL)");
  db.exec("INSERT INTO scrape_stats VALUES ('benaki', '2026-09-20', 3, 1), ('benaki', '2026-09-21', 0, 0), ('benaki', '2026-09-19', 1, 1)");
  // Keep the connection's changes in the -wal (not checkpointed on close).
  return p;
}

function hostile(sql: string[]): string {
  const p = join(tmp(), 'events.db');
  const db = new Database(p, { create: true });
  for (const s of sql) db.exec(s);
  db.close();
  return p;
}

const RECURSIVE_VIEW = "CREATE VIEW events AS WITH RECURSIVE r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r) SELECT x AS id, x AS enriched_at FROM r";
/** A plain table whose generated column makes every read of it run for minutes. */
// (Rows first, column after: an INSERT would evaluate the column per row.)
const SLOW_TABLE = [
  'CREATE TABLE events (id INTEGER, venue_name TEXT)',
  'WITH RECURSIVE r(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM r LIMIT 2000) INSERT INTO events(id) SELECT x FROM r',
  'ALTER TABLE events ADD COLUMN enriched_at TEXT GENERATED ALWAYS AS (length(hex(zeroblob(50000000 + (id % 2))))) VIRTUAL',
];

describe('queryUntrustedDb — a normal database', () => {
  test('returns the same rows as a direct read (WAL copy included); an absent table skips its query', async () => {
    const p = normalDb();
    const direct = new Database(p, { readonly: true });
    const expected = {
      count: direct.query(Q.count.sql).all(),
      max: direct.query(Q.max.sql).all(),
      byVenue: direct.query(Q.byVenue.sql).all(),
      stats: direct.query(Q.stats.sql).all('benaki', 2),
    };
    direct.close();
    expect(existsSync(`${p}-wal`)).toBe(true);
    const r = await queryUntrustedDb({ dbPath: p, requireTables: ['events'], queries: { ...Q, gone: { sql: 'SELECT * FROM enrichment_log', tables: ['enrichment_log'] } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.count).toEqual(expected.count as never);
    expect(r.rows.max).toEqual(expected.max as never);
    expect(r.rows.byVenue).toEqual(expected.byVenue as never);
    expect(r.rows.stats).toEqual(expected.stats as never);
    expect(r.rows.gone).toBeNull();
    expect(r.errors).toEqual({});
  });

  test('a failing query is reported by name and does not sink the others; maxRows truncates', async () => {
    const r = await queryUntrustedDb({
      dbPath: normalDb(),
      requireTables: ['events'],
      queries: { bad: { sql: 'SELECT no_such_column FROM events', tables: ['events'] }, count: Q.count, all: { sql: 'SELECT id FROM events', tables: ['events'] } },
      maxRows: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.errors.bad).toContain('no_such_column');
    expect(r.rows.bad).toBeNull();
    expect(r.rows.count).toEqual([{ c: 3 }]);
    expect(r.rows.all).toHaveLength(2);
    expect(r.truncated).toEqual(['all']);
  });

  test('the project schema (src/db/schema.sql + migration 002) is accepted, and its triggers are exactly the allowlist', async () => {
    const p = join(tmp(), 'events.db');
    const db = new Database(p, { create: true });
    db.exec(readFileSync(join(ROOT, 'src/db/schema.sql'), 'utf-8'));
    db.exec(readFileSync(join(ROOT, 'src/db/migrations/002-enrichment-queue-table.sql'), 'utf-8'));
    const triggers = db.query("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as Array<{ name: string; sql: string }>;
    db.close();
    const derived = Object.fromEntries(triggers.map((t) => [t.name, createHash('sha256').update(t.sql.replace(/\s+/g, ' ').trim()).digest('hex')]));
    expect(derived).toEqual({ ...ALLOWED_TRIGGER_SQL_SHA256 });
    const r = await queryUntrustedDb({ dbPath: p, requireTables: ['events', 'scrape_stats'], queries: { count: Q.count } });
    expect(r).toEqual({ ok: true, rows: { count: [{ c: 0 }] }, errors: {}, truncated: [] });
  });
});

describe('queryUntrustedDb — hostile databases are refused, never hang', () => {
  test('a recursive VIEW named events → refused quickly, naming the view', async () => {
    const t0 = Date.now();
    const r = await queryUntrustedDb({ dbPath: hostile([RECURSIVE_VIEW]), requireTables: ['events'], queries: Q, timeoutMs: 20_000 });
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(r).toMatchObject({ ok: false, kind: 'refused' });
    if (!r.ok) expect(r.detail).toContain('view ("events")');
  });

  test('any view at all → refused, even when the needed tables are real', async () => {
    const r = await queryUntrustedDb({
      dbPath: hostile(['CREATE TABLE events (id TEXT, enriched_at TEXT)', 'CREATE VIEW innocent AS SELECT 1']),
      requireTables: ['events'], queries: { count: Q.count },
    });
    expect(r).toMatchObject({ ok: false, kind: 'refused' });
  });

  test('a trigger that is not one of the project\'s own → refused; so is an allowlisted NAME with other SQL', async () => {
    for (const trig of [
      "CREATE TRIGGER t_evil AFTER INSERT ON events BEGIN SELECT 1; END",
      "CREATE TRIGGER events_ai AFTER INSERT ON events BEGIN DELETE FROM events; END",
    ]) {
      const r = await queryUntrustedDb({ dbPath: hostile(['CREATE TABLE events (id TEXT)', trig]), requireTables: ['events'], queries: { count: Q.count } });
      expect(r).toMatchObject({ ok: false, kind: 'refused' });
      if (!r.ok) expect(r.detail).toContain('trigger');
    }
  });

  test('events as a virtual table, or missing → refused; a query table that is virtual → refused', async () => {
    const virt = await queryUntrustedDb({ dbPath: hostile(['CREATE VIRTUAL TABLE events USING fts5(title)']), requireTables: ['events'], queries: { count: Q.count } });
    expect(virt).toMatchObject({ ok: false, kind: 'refused' });
    if (!virt.ok) expect(virt.detail).toContain('virtual');
    const none = await queryUntrustedDb({ dbPath: hostile(['CREATE TABLE other (x)']), requireTables: ['events'], queries: { count: Q.count } });
    expect(none).toMatchObject({ ok: false, kind: 'refused' });
    const qv = await queryUntrustedDb({
      dbPath: hostile(['CREATE TABLE events (id TEXT)', 'CREATE VIRTUAL TABLE scrape_stats USING fts5(source)']),
      requireTables: ['events'], queries: { stats: Q.stats },
    });
    expect(qv).toMatchObject({ ok: false, kind: 'refused' });
  });

  test('a symlinked database, a symlinked -wal, a FIFO and a directory → refused without blocking; no file → missing', async () => {
    const good = normalDb();
    const d = tmp();
    symlinkSync(good, join(d, 'events.db'));
    const t0 = Date.now();
    const sym = await queryUntrustedDb({ dbPath: join(d, 'events.db'), requireTables: ['events'], queries: Q });
    expect(sym).toMatchObject({ ok: false, kind: 'refused' });
    if (!sym.ok) expect(sym.detail).toContain('symlink');

    const d2 = tmp();
    const db2 = join(d2, 'events.db');
    writeFileSync(db2, readFileSync(good));
    symlinkSync(join(tmp(), 'secret'), `${db2}-wal`);
    expect(await queryUntrustedDb({ dbPath: db2, requireTables: ['events'], queries: Q })).toMatchObject({ ok: false, kind: 'refused' });

    const d3 = tmp();
    expect(Bun.spawnSync(['mkfifo', join(d3, 'events.db')]).exitCode).toBe(0);
    const fifo = await queryUntrustedDb({ dbPath: join(d3, 'events.db'), requireTables: ['events'], queries: Q });
    expect(fifo).toMatchObject({ ok: false, kind: 'refused' });

    const d4 = tmp();
    mkdirSync(join(d4, 'events.db'));
    expect(await queryUntrustedDb({ dbPath: join(d4, 'events.db'), requireTables: ['events'], queries: Q })).toMatchObject({ ok: false, kind: 'refused' });
    expect(Date.now() - t0).toBeLessThan(10_000);

    expect(await queryUntrustedDb({ dbPath: join(tmp(), 'events.db'), requireTables: ['events'], queries: Q })).toMatchObject({ ok: false, kind: 'missing' });
  });

  test('a file over maxBytes → refused before any copy', async () => {
    const r = await queryUntrustedDb({ dbPath: normalDb(), requireTables: ['events'], queries: Q, maxBytes: 1024 });
    expect(r).toMatchObject({ ok: false, kind: 'refused' });
    if (!r.ok) expect(r.detail).toContain('limit');
  });

  test('a table whose reads run away is stopped at the wall clock (timeout within bound)', async () => {
    const t0 = Date.now();
    const r = await queryUntrustedDb({ dbPath: hostile(SLOW_TABLE), requireTables: ['events'], queries: { max: Q.max }, timeoutMs: 1500 });
    const took = Date.now() - t0;
    expect(r).toMatchObject({ ok: false, kind: 'timeout' });
    if (!r.ok) expect(r.detail).toContain('did not finish within 1.5s');
    expect(took).toBeGreaterThanOrEqual(1400);
    expect(took).toBeLessThan(15_000);
  });

  test('a table name that is not a plain identifier is rejected before anything runs', async () => {
    const r = await queryUntrustedDb({ dbPath: normalDb(), requireTables: ['events; DROP TABLE x'], queries: Q });
    expect(r).toMatchObject({ ok: false, kind: 'error' });
  });
});

// ---------------------------------------------------------------------------
// The deadman, end to end (dry run: classification printed, no delivery).
// ---------------------------------------------------------------------------
function deadmanEnv(state: string, dbFile: string, extra: Record<string, string> = {}) {
  mkdirSync(join(state, 'logs'), { recursive: true });
  mkdirSync(join(state, 'bin'), { recursive: true });
  // A stub osascript, so no real notification appears on a Mac.
  writeFileSync(join(state, 'bin', 'osascript'), '#!/bin/bash\nexit 0\n');
  chmodSync(join(state, 'bin', 'osascript'), 0o755);
  const at = new Date(Date.now() - 2 * 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z');
  writeFileSync(join(state, 'deploys.log'), `${at} ${'a'.repeat(24)} ${'b'.repeat(64)}\n`);
  return {
    PATH: `${join(state, 'bin')}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    HOME: state,
    AA_STATE_DIR: state,
    DEADMAN_DB_PATH: dbFile,
    DEADMAN_QUARANTINE_PATH: join(state, 'no-quarantine.json'),
    AGENTATHENS_NTFY_TOPIC_FILE: join(state, 'no-topic'),
    HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9',
    ...extra,
  };
}
function runDeadman(env: Record<string, string>) {
  const t0 = Date.now();
  const r = Bun.spawnSync(['bun', DEADMAN], { cwd: ROOT, env, stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString(), ms: Date.now() - t0 };
}

describe('deadman-watchdog.ts — the database is read through the untrusted-DB reader', () => {
  test('a recursive VIEW named events → DB_REFUSED within bound, the alert names the view', () => {
    const state = tmp();
    const r = runDeadman(deadmanEnv(state, hostile([RECURSIVE_VIEW]), { DEADMAN_DRY_RUN: '1' }));
    expect(r.ms).toBeLessThan(30_000);
    expect(r.code).toBe(1);
    expect(r.out).toContain('status=DB_REFUSED');
    expect(r.out).toContain('events.db REFUSED');
    expect(r.out).toContain('view');
    expect(r.out).not.toContain('missing or unreadable');
  });

  test('a runaway table → DB_REFUSED at the DB wall clock, with the timeout in the alert', () => {
    const state = tmp();
    const r = runDeadman(deadmanEnv(state, hostile(SLOW_TABLE), { DEADMAN_DRY_RUN: '1', DEADMAN_DB_TIMEOUT_MS: '1500' }));
    expect(r.ms).toBeLessThan(30_000);
    expect(r.code).toBe(1);
    expect(r.out).toContain('status=DB_REFUSED');
    expect(r.out).toContain('did not finish within 1.5s');
  });

  test('a symlinked events.db → DB_REFUSED (the target is never read)', () => {
    const state = tmp();
    const d = tmp();
    symlinkSync(normalDb(), join(d, 'events.db'));
    const r = runDeadman(deadmanEnv(state, join(d, 'events.db'), { DEADMAN_DRY_RUN: '1' }));
    expect(r.out).toContain('status=DB_REFUSED');
    expect(r.out).toContain('symlink');
  });

  test('a normal database → the same signals as a direct read (enrich age, row count), no refusal', () => {
    const state = tmp();
    const p = join(tmp(), 'events.db');
    const db = new Database(p, { create: true });
    const local = new Date(Date.now() - 3_600_000).toISOString().slice(0, 19).replace('T', ' ');
    db.run('CREATE TABLE events (enriched_at TEXT)');
    db.run('INSERT INTO events (enriched_at) VALUES (?), (?)', [local, '2026-01-01 00:00:00']);
    db.close();
    const r = runDeadman(deadmanEnv(state, p, { DEADMAN_DRY_RUN: '1' }));
    expect(r.out).toMatch(/enrich=[01]\.\dh/);
    expect(r.out).toContain('dbRows=2');
    expect(r.out).not.toContain('REFUSED');
  });

  test('the whole run has a wall clock: hitting it alerts through notification/email/push/heartbeat and exits 1', () => {
    const state = tmp();
    const env = deadmanEnv(state, hostile(SLOW_TABLE), { DEADMAN_WALL_CLOCK_MS: '2000', DEADMAN_DB_TIMEOUT_MS: '600000' });
    const r = runDeadman(env);
    expect(r.code).toBe(1);
    expect(r.ms).toBeLessThan(30_000);
    expect(r.err).toContain('WALL_CLOCK_TIMEOUT');
    expect(r.err).toContain('wall-clock limit');
    // Email and push are not configured in the fixture HOME: skipped, and said so.
    expect(r.err).toContain('email skipped');
    expect(r.err).toContain('push skipped');
    const hb = readFileSync(join(state, 'logs', 'deadman-heartbeat.csv'), 'utf-8');
    expect(hb).toContain(',WALL_CLOCK_TIMEOUT,');
    // Dry run says what it would have sent.
    const dry = runDeadman(deadmanEnv(tmp(), hostile(SLOW_TABLE), { DEADMAN_DRY_RUN: '1', DEADMAN_WALL_CLOCK_MS: '2000', DEADMAN_DB_TIMEOUT_MS: '600000' }));
    expect(dry.code).toBe(1);
    expect(dry.out).toContain('status=WALL_CLOCK_TIMEOUT');
  });

  test('the default limits are 10 minutes for the run and 30 s for the DB read', () => {
    const src = readFileSync(DEADMAN, 'utf-8');
    expect(src).toContain('export const DEADMAN_WALL_CLOCK_MS = 10 * 60_000;');
    expect(readFileSync(join(ROOT, 'src/watchdog/untrusted-db.ts'), 'utf-8')).toContain('export const UNTRUSTED_DB_DEFAULT_TIMEOUT_MS = 30_000;');
  });
});

// ---------------------------------------------------------------------------
// The CLI the enrichment check uses.
// ---------------------------------------------------------------------------
describe('scripts/untrusted-db-query.ts', () => {
  const cli = (args: string[]) => {
    const r = Bun.spawnSync(['bun', CLI, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  test('prints NAME=<count> lines, an empty value for a skipped query, and the rows as a table without control characters', () => {
    const p = join(tmp(), 'events.db');
    const db = new Database(p, { create: true });
    db.exec('CREATE TABLE events (title TEXT, start_date TEXT)');
    db.run('INSERT INTO events VALUES (?, ?)', ['Concert\n::error::x\u001b[31m', '2026-10-01']);
    db.close();
    const r = cli(['--db', p, '--require-table', 'events',
      '--count', 'TOTAL', 'events', 'SELECT COUNT(*) FROM events',
      '--count', 'LOGGED', 'enrichment_log', 'SELECT COUNT(*) FROM enrichment_log',
      '--rows', 'events', 'SELECT title, start_date AS date FROM events']);
    expect(r.code).toBe(0);
    const lines = r.out.trimEnd().split('\n');
    expect(lines.slice(0, 3)).toEqual(['TOTAL=1', 'LOGGED=', '--- rows']);
    expect(lines[3]).toMatch(/^title\s+date$/);
    expect(lines[5]).toContain('Concert ::error::x[31m');
    expect(r.out).not.toContain('\u001b');
    for (const l of lines) expect(l.startsWith('::')).toBe(false);
  });

  test('a refused database exits 1 with a message; a non-integer count is refused; bad arguments exit 2', () => {
    const v = cli(['--db', hostile([RECURSIVE_VIEW]), '--require-table', 'events', '--count', 'N', 'events', 'SELECT COUNT(*) FROM events']);
    expect(v.code).toBe(1);
    expect(v.err).toContain('REFUSED');
    expect(v.out).toBe('');
    const p = normalDb();
    const s = cli(['--db', p, '--count', 'N', 'events', "SELECT 'x'"]);
    expect(s.code).toBe(1);
    expect(s.err).toContain('not a non-negative integer');
    expect(cli(['--db', p, '--count', 'lower', 'events', 'SELECT 1']).code).toBe(2);
    expect(cli(['--db', p]).code).toBe(2);
    expect(cli(['--count', 'N', 'events', 'SELECT 1']).code).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Pin: no host launchd job opens events.db directly.
// ---------------------------------------------------------------------------
describe('host launchd jobs never open data/events.db directly', () => {
  // The scripts the plists at the repo root and in config/launchd/ run on the host.
  const HOST_TS = ['scripts/deadman-watchdog.ts', 'scripts/weekly-digest.ts', 'scripts/monitor-search-visibility.ts', 'scripts/check-deploy-cadence.ts', 'scripts/fetch-bing-metrics.ts'];

  test('the TypeScript host jobs import no bun:sqlite; the DB readers go through queryUntrustedDb', () => {
    for (const f of HOST_TS) {
      const src = readFileSync(join(ROOT, f), 'utf-8');
      expect(`${f}: ${/from ['"]bun:sqlite['"]/.test(src)}`).toBe(`${f}: false`);
      expect(`${f}: ${/new Database\(/.test(src)}`).toBe(`${f}: false`);
    }
    for (const f of HOST_TS.slice(0, 3)) expect(readFileSync(join(ROOT, f), 'utf-8')).toContain('queryUntrustedDb');
  });

  test('the plists still run exactly these host jobs (a new host job needs a look here)', () => {
    const plists = [
      ...require('fs').readdirSync(ROOT).filter((f: string) => /^com\.agentathens\..*\.plist$/.test(f)),
      ...require('fs').readdirSync(join(ROOT, 'config', 'launchd')).map((f: string) => `config/launchd/${f}`),
    ];
    const ran = new Set<string>();
    for (const p of plists) {
      const xml = readFileSync(join(ROOT, p), 'utf-8');
      for (const m of xml.matchAll(/scripts\/([A-Za-z0-9._-]+\.(?:ts|sh))/g)) ran.add(`scripts/${m[1]}`);
    }
    expect([...ran].sort()).toEqual([
      'scripts/check-deploy-cadence.ts', 'scripts/daily-automated.sh', 'scripts/daily-enrichment-check.sh',
      'scripts/deadman-watchdog.ts', 'scripts/fetch-bing-metrics.ts', 'scripts/monitor-search-visibility.ts',
      'scripts/phase3-weekly.sh', 'scripts/weekly-digest.ts',
    ]);
  });
});
