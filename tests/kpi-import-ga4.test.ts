/**
 * Tests for scripts/kpi-import-ga4.ts (S100b GA4 leg).
 *
 * No live network: the GA4 response is the captured Step-1 spike fixture.
 * Covers the brief's three required behaviors plus the near-miss guard:
 *   (a) host-filter keeps ONLY the 3 in-scope AI hosts, drops everything else
 *   (b) response → kpi.db row mapping uses the REAL ga4_ai_referrals columns
 *   (c) idempotent on (observed_date, referrer_engine, landing_page) grain:
 *       re-import = same row count; changed sessions UPDATES in place
 *   + near-miss guard: a dropped source containing an AI engine substring is
 *     surfaced (not imported, not silently lost)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  AI_HOST_TO_ENGINE,
  ga4DateToIso,
  transformRows,
  writeRows,
  ensureGa4Index,
  type Ga4Response,
} from '../scripts/kpi-import-ga4';

const FIXTURE: Ga4Response = JSON.parse(
  readFileSync(join(import.meta.dir, 'fixtures/ga4-airef-response.json'), 'utf8'),
);
const TMP_DIR = join(import.meta.dir, 'tmp/kpi-import-ga4');
const TMP_DB = join(TMP_DIR, 'test-kpi.db');

/** Mirror the real ga4_ai_referrals table (kpi-init.ts) into a throwaway db. */
function freshDb(): Database {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  const db = new Database(TMP_DB, { create: true });
  db.exec(`CREATE TABLE ga4_ai_referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_engine TEXT NOT NULL CHECK (referrer_engine IN ('chatgpt','perplexity','gemini','copilot','claude')),
    landing_page TEXT NOT NULL,
    sessions INTEGER NOT NULL DEFAULT 0,
    observed_date TEXT NOT NULL,
    imported_at TEXT NOT NULL
  );`);
  ensureGa4Index(db);
  return db;
}

let db: Database;
beforeEach(() => { db = freshDb(); });
afterEach(() => { db.close(); rmSync(TMP_DIR, { recursive: true, force: true }); });

describe('AI_HOST_TO_ENGINE map', () => {
  test('holds exactly the 3 in-scope hosts (2026-05-30 GEO ruling, NOT the 5 the CHECK allows)', () => {
    expect(Object.keys(AI_HOST_TO_ENGINE).sort()).toEqual(
      ['chatgpt.com', 'copilot.microsoft.com', 'perplexity.ai'],
    );
    expect(AI_HOST_TO_ENGINE['chatgpt.com']).toBe('chatgpt');
    expect(AI_HOST_TO_ENGINE['perplexity.ai']).toBe('perplexity');
    expect(AI_HOST_TO_ENGINE['copilot.microsoft.com']).toBe('copilot');
  });
});

describe('ga4DateToIso', () => {
  test('"20260526" → "2026-05-26"', () => {
    expect(ga4DateToIso('20260526')).toBe('2026-05-26');
  });
});

describe('(a) host filter', () => {
  test('keeps ONLY chatgpt/perplexity/copilot rows, drops direct/google/bing', () => {
    const { rows } = transformRows(FIXTURE);
    // fixture: chatgpt.com x2, perplexity.ai x1, copilot.microsoft.com x1 = 4 AI rows
    expect(rows.length).toBe(4);
    const engines = rows.map((r) => r.referrer_engine).sort();
    expect(engines).toEqual(['chatgpt', 'chatgpt', 'copilot', 'perplexity']);
    // none of the dropped hosts leaked through
    expect(rows.some((r) => (r.referrer_engine as string) === '(direct)')).toBe(false);
  });
});

describe('(b) response → row mapping uses real columns', () => {
  test('maps date/sessionSource/landingPage/sessions correctly (sessions metric, not activeUsers)', () => {
    const { rows } = transformRows(FIXTURE);
    const first = rows.find((r) => r.landing_page === '/en/this-week')!;
    expect(first).toEqual({
      referrer_engine: 'chatgpt',
      landing_page: '/en/this-week',
      sessions: 9, // metricValues[0]=sessions(9), NOT [1]=activeUsers(7)
      observed_date: '2026-05-26',
    });
    expect(typeof first.sessions).toBe('number');
  });
});

describe('near-miss guard', () => {
  test('a dropped source containing an AI engine substring is surfaced, not imported', () => {
    const resp: Ga4Response = {
      rows: [
        { dimensionValues: [{ value: '20260601' }, { value: 'labs.perplexity.com' }, { value: '/' }], metricValues: [{ value: '4' }, { value: '3' }] },
        { dimensionValues: [{ value: '20260601' }, { value: 'google' }, { value: '/' }], metricValues: [{ value: '2' }, { value: '2' }] },
      ],
    };
    const { rows, nearMisses } = transformRows(resp);
    expect(rows.length).toBe(0); // not imported (host string not in map)
    expect(nearMisses).toContain('labs.perplexity.com');
    expect(nearMisses).not.toContain('google'); // plain non-AI miss is silent
  });
});

describe('(c) idempotency on the grain', () => {
  function count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM ga4_ai_referrals').get() as { n: number }).n;
  }

  test('re-import of identical data yields the same row count (no duplicates)', () => {
    const { rows } = transformRows(FIXTURE);
    writeRows(db, rows, '2026-06-03T10:00:00.000Z');
    expect(count()).toBe(4);
    writeRows(db, rows, '2026-06-03T11:00:00.000Z');
    expect(count()).toBe(4);
  });

  test('changed sessions UPDATES in place — latest value wins, no new row', () => {
    const { rows } = transformRows(FIXTURE);
    writeRows(db, rows, '2026-06-03T10:00:00.000Z');

    const bumped = rows.map((r) =>
      r.landing_page === '/en/this-week' && r.referrer_engine === 'chatgpt'
        ? { ...r, sessions: 99 }
        : r,
    );
    writeRows(db, bumped, '2026-06-03T12:00:00.000Z');

    expect(count()).toBe(4); // still no new row
    const updated = db
      .prepare("SELECT sessions, imported_at FROM ga4_ai_referrals WHERE referrer_engine='chatgpt' AND landing_page='/en/this-week' AND observed_date='2026-05-26'")
      .get() as { sessions: number; imported_at: string };
    expect(updated.sessions).toBe(99); // latest wins
    expect(updated.imported_at).toBe('2026-06-03T12:00:00.000Z'); // imported_at refreshed
  });
});
