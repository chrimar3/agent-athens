/**
 * Tests for scripts/kpi-report.ts (S100b reader).
 *
 * Seeds a temp kpi.db with known rows and asserts the rendered report reflects
 * them. Key contract (brief): populated layers summarize real numbers;
 * UNPOPULATED layers print an honest empty-state marker — NOT a fabricated "0",
 * NOT silently omitted. A missing table reads as "not initialized".
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { LAYERS, renderReport, openReportDb } from '../scripts/kpi-report';

const TMP_DIR = join(import.meta.dir, 'tmp/kpi-report');
const TMP_DB = join(TMP_DIR, 'test-kpi.db');

/** Create the 7 kpi.db tables (minimal shapes the report reads). */
function makeDb(withAllTables = true): Database {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  const db = new Database(TMP_DB, { create: true });
  db.exec(`CREATE TABLE ga4_ai_referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_engine TEXT NOT NULL, landing_page TEXT NOT NULL,
    sessions INTEGER NOT NULL DEFAULT 0, observed_date TEXT NOT NULL, imported_at TEXT NOT NULL
  );`);
  if (withAllTables) {
    db.exec('CREATE TABLE gsc_queries_long (id INTEGER PRIMARY KEY);');
    db.exec('CREATE TABLE server_log_ai_bots (id INTEGER PRIMARY KEY);');
    db.exec('CREATE TABLE manual_citation_log (id INTEGER PRIMARY KEY);');
    db.exec('CREATE TABLE bwt_grounding_queries (id INTEGER PRIMARY KEY);');
    db.exec('CREATE TABLE bwt_ai_citations (id INTEGER PRIMARY KEY);');
    db.exec('CREATE TABLE tracked_prompts (prompt_id TEXT PRIMARY KEY);');
  }
  return db;
}

/** Find the rendered line for a given layer label. */
function lineFor(report: string, label: string): string {
  return report.split('\n').find((l) => l.includes(label)) ?? '';
}

let db: Database;
afterEach(() => { db?.close(); rmSync(TMP_DIR, { recursive: true, force: true }); });

describe('renderReport — populated GA4 layer', () => {
  beforeEach(() => {
    db = makeDb();
    const ins = db.prepare('INSERT INTO ga4_ai_referrals (referrer_engine, landing_page, sessions, observed_date, imported_at) VALUES (?,?,?,?,?)');
    ins.run('chatgpt', '/en/a', 5, '2026-05-26', 'x');
    ins.run('chatgpt', '/en/c', 3, '2026-05-28', 'x');
    ins.run('perplexity', '/en/b', 2, '2026-05-27', 'x');
    db.prepare('INSERT INTO tracked_prompts (prompt_id) VALUES (?)').run('p1');
    db.prepare('INSERT INTO tracked_prompts (prompt_id) VALUES (?)').run('p2');
  });

  test('GA4 line summarizes total sessions, per-engine split, and date span', () => {
    const line = lineFor(renderReport(db), 'GA4 AI referrals');
    expect(line).toContain('10 sessions');        // 5+3+2
    expect(line).toContain('chatgpt 8');           // 5+3
    expect(line).toContain('perplexity 2');
    expect(line).toContain('2026-05-26');          // span start
    expect(line).toContain('2026-05-28');          // span end
  });

  test('a populated non-special layer shows its row count', () => {
    const line = lineFor(renderReport(db), 'Tracked prompts');
    expect(line).toContain('2');
  });
});

describe('renderReport — honest empty-state (not fabricated zeros)', () => {
  beforeEach(() => { db = makeDb(); }); // all tables exist, all empty except none

  test('an empty layer prints an empty-state marker, never silently omitted', () => {
    const report = renderReport(db);
    const gscLine = lineFor(report, 'GSC long queries');
    expect(gscLine).not.toBe('');                  // present, not omitted
    expect(gscLine).toContain('—');                // empty-state marker
  });

  test('empty layers do NOT fabricate a "0 sessions"/"0 rows" number', () => {
    const report = renderReport(db);
    const serverLine = lineFor(report, 'Server-log AI bots');
    expect(serverLine).not.toMatch(/\b0 (sessions|rows)\b/);
  });

  test('every configured layer appears exactly once', () => {
    const report = renderReport(db);
    for (const layer of LAYERS) {
      expect(lineFor(report, layer.label)).not.toBe('');
    }
  });
});

describe('openReportDb — WAL compatibility (regression)', () => {
  test('opens a WAL-mode db for reading without SQLITE_CANTOPEN', () => {
    // Reproduce the live failure mode: the importer leaves kpi.db in WAL mode,
    // and `{ readonly: true }` cannot open it (needs to write the -shm).
    db = makeDb();
    db.exec('PRAGMA journal_mode = WAL;');
    db.prepare('INSERT INTO ga4_ai_referrals (referrer_engine, landing_page, sessions, observed_date, imported_at) VALUES (?,?,?,?,?)')
      .run('chatgpt', '/en/x', 7, '2026-06-01', 'x');
    db.close();

    const ro = openReportDb(TMP_DB);
    const report = renderReport(ro); // must not throw
    expect(lineFor(report, 'GA4 AI referrals')).toContain('7 sessions');
    // query_only is enforced: writes are rejected at the connection level.
    expect(() => ro.exec("INSERT INTO ga4_ai_referrals (referrer_engine, landing_page, sessions, observed_date, imported_at) VALUES ('chatgpt','/y',1,'2026-06-01','x')")).toThrow();
    ro.close();
    db = makeDb(); // reset handle for afterEach close()
  });
});

describe('renderReport — uninitialized table', () => {
  test('a missing table reads as "not initialized", not as empty data', () => {
    db = makeDb(false); // only ga4_ai_referrals exists
    const line = lineFor(renderReport(db), 'GSC long queries');
    expect(line.toLowerCase()).toContain('not initialized');
  });
});
