/**
 * scripts/db-read.ts — the enrichment session's only database read path
 * (security loop round 1). It replaced the Bash(sqlite3 -readonly *) grant,
 * whose shell exposed file-writing SQL functions and dot-commands. Every test
 * here runs against a temporary database; data/events.db is never opened
 * (tests/preload guards it anyway).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { Database } from 'bun:sqlite';
import { validateReadOnlySql, runReadOnlyQuery } from '../scripts/db-read';

const ROOT = resolve(import.meta.dir, '..');
let dir: string;
let dbPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'aa-db-read-'));
  dbPath = join(dir, 'fixture.db');
  const db = new Database(dbPath, { create: true });
  db.run('CREATE TABLE events (id TEXT, title TEXT, venue_name TEXT)');
  const ins = db.prepare('INSERT INTO events VALUES (?, ?, ?)');
  for (let i = 0; i < 300; i++) ins.run(`ev-${i}`, `Title ${i}; DROP TABLE events`, i % 2 ? 'Gazarte' : 'Κύτταρο');
  db.close();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const rowCount = () => {
  const db = new Database(dbPath, { readonly: true });
  const n = (db.query('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
  db.close();
  return n;
};

describe('validateReadOnlySql refuses anything that is not one read-only statement', () => {
  const refused = [
    'DELETE FROM events',
    'UPDATE events SET title = 1',
    'INSERT INTO events VALUES (1,2,3)',
    'DROP TABLE events',
    "ATTACH 'other.db' AS o",
    "SELECT 1; ATTACH 'x.db' AS x",
    'SELECT 1; DELETE FROM events',
    'SELECT 1;SELECT 2',
    'PRAGMA journal_mode = DELETE',
    'PRAGMA writable_schema = 1',
    "VACUUM INTO '/tmp/copy.db'",
    'WITH x AS (SELECT 1) DELETE FROM events',
    "WITH x AS (SELECT 1) INSERT INTO events SELECT 1, 2, 3",
    "SELECT load_extension('/tmp/evil')",
    "SELECT writefile('/tmp/x', 'y')",
    "SELECT readfile('.env')",
    'EXPLAIN DELETE FROM events',
    'CREATE TABLE t (a)',
    'BEGIN',
    '',
    '   ',
    '-- only a comment',
  ];
  for (const sql of refused) {
    test(`refused: ${JSON.stringify(sql)}`, () => {
      expect(validateReadOnlySql(sql)).not.toBeNull();
    });
  }

  const allowed = [
    'SELECT id, title FROM events LIMIT 5',
    'select count(*) from events',
    "SELECT * FROM events WHERE title LIKE '%delete%'",
    "SELECT * FROM events WHERE title = 'a; DROP TABLE events'",
    'SELECT "update", 1',
    'WITH v AS (SELECT venue_name FROM events) SELECT venue_name, COUNT(*) FROM v GROUP BY venue_name',
    "SELECT name FROM pragma_table_info('events')",
    'SELECT 1;',
    'SELECT 1; -- trailing comment',
    '/* lead */ SELECT 1',
  ];
  for (const sql of allowed) {
    test(`allowed: ${JSON.stringify(sql)}`, () => {
      expect(validateReadOnlySql(sql)).toBeNull();
    });
  }
});

describe('runReadOnlyQuery', () => {
  test('returns columns and rows as JSON-ready data', () => {
    const r = runReadOnlyQuery(dbPath, "SELECT id, venue_name FROM events WHERE id = 'ev-1'");
    expect(r.columns).toEqual(['id', 'venue_name']);
    expect(r.rows).toEqual([{ id: 'ev-1', venue_name: 'Gazarte' }]);
    expect(r.truncated).toBe(false);
  });

  test('caps rows (default 100) and says it truncated', () => {
    const r = runReadOnlyQuery(dbPath, 'SELECT id FROM events');
    expect(r.rows.length).toBe(100);
    expect(r.truncated).toBe(true);
  });

  test('a requested row cap above the ceiling is clamped', () => {
    const r = runReadOnlyQuery(dbPath, 'SELECT id FROM events', { maxRows: 100000 });
    expect(r.rows.length).toBeLessThanOrEqual(200);
    expect(r.truncated).toBe(true);
  });

  test('caps output bytes', () => {
    const r = runReadOnlyQuery(dbPath, "SELECT id, printf('%.2000c', 'x') AS big FROM events", { maxRows: 200 });
    expect(JSON.stringify(r.rows).length).toBeLessThanOrEqual(64 * 1024);
    expect(r.truncated).toBe(true);
  });

  test('write statements throw and leave the database untouched', () => {
    for (const sql of ['DELETE FROM events', 'WITH x AS (SELECT 1) DELETE FROM events', 'SELECT 1; DELETE FROM events']) {
      expect(() => runReadOnlyQuery(dbPath, sql)).toThrow();
    }
    expect(rowCount()).toBe(300);
  });

  test('VACUUM INTO is refused and no file appears (bun:sqlite would otherwise write it from a read-only handle)', () => {
    const out = join(dir, 'copy.db');
    expect(() => runReadOnlyQuery(dbPath, `VACUUM INTO '${out}'`)).toThrow();
    expect(existsSync(out)).toBe(false);
  });

  test('a missing database is an error, never created', () => {
    const missing = join(dir, 'nope.db');
    expect(() => runReadOnlyQuery(missing, 'SELECT 1')).toThrow();
    expect(existsSync(missing)).toBe(false);
  });
});

describe('CLI contract', () => {
  const run = (...args: string[]) => {
    const r = Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts', 'db-read.ts'), ...args], { cwd: dir });
    return { code: r.exitCode, out: new TextDecoder().decode(r.stdout), err: new TextDecoder().decode(r.stderr) };
  };

  test('a refused statement exits 2 before any database is opened, with a retry hint', () => {
    const r = run('DELETE FROM events');
    expect(r.code).toBe(2);
    expect(r.err).toContain('db-read');
    expect(r.err).toContain('SELECT');
  });

  test('no argument, or more than one, is a usage error (exit 2)', () => {
    expect(run().code).toBe(2);
    expect(run('SELECT 1', 'SELECT 2').code).toBe(2);
  });

  test('there is no flag to point it at another database file', () => {
    const r = run(`--db=${dbPath}`, 'SELECT 1');
    expect(r.code).toBe(2);
  });

  test('the CLI never leaves stray files in its working directory', () => {
    const before = readdirSync(dir).sort();
    run("VACUUM INTO 'stray.db'");
    expect(readdirSync(dir).sort()).toEqual(before);
  });
});
