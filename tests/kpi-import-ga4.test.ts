/**
 * Tests for scripts/kpi-import-ga4.ts (S102 — full 5-engine AI-referral channel).
 *
 * No live network: the GA4 response is the synthesized Step-1-shape fixture.
 * Covers:
 *   (a) host-filter maps all 6 source strings → 5 engine tokens (chatgpt.com AND
 *       chat.openai.com both → chatgpt); drops organic/direct
 *   (b) ALIAS-SUM (load-bearing): chatgpt.com + chat.openai.com on the same
 *       (observed_date, landing_page) sum to ONE chatgpt row, sessions 5+3=8
 *   (c) EXACTNESS: a "google" organic row + "(direct)" are dropped, and "google"
 *       is NOT attributed to gemini (proves exact-host match, not substring)
 *   (d) idempotency on the grain holds for the new engines (gemini/claude)
 *   + near-miss guard: re-scoped to host-string DRIFT (now also catches
 *     chatgpt/openai drift); exact mapped hosts never fire it
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

describe('(a) AI_HOST_TO_ENGINE map — full 5-engine channel + chatgpt alias', () => {
  test('6 source strings → 5 engine tokens; chatgpt.com AND chat.openai.com both → chatgpt', () => {
    expect(Object.keys(AI_HOST_TO_ENGINE).sort()).toEqual([
      'chat.openai.com',
      'chatgpt.com',
      'claude.ai',
      'copilot.microsoft.com',
      'gemini.google.com',
      'perplexity.ai',
    ]);
    expect(AI_HOST_TO_ENGINE['chatgpt.com']).toBe('chatgpt');
    expect(AI_HOST_TO_ENGINE['chat.openai.com']).toBe('chatgpt'); // alias folds to same engine
    expect(AI_HOST_TO_ENGINE['perplexity.ai']).toBe('perplexity');
    expect(AI_HOST_TO_ENGINE['claude.ai']).toBe('claude');
    expect(AI_HOST_TO_ENGINE['gemini.google.com']).toBe('gemini');
    expect(AI_HOST_TO_ENGINE['copilot.microsoft.com']).toBe('copilot');
    // distinct engine tokens = 5
    expect(new Set(Object.values(AI_HOST_TO_ENGINE)).size).toBe(5);
  });
});

describe('ga4DateToIso', () => {
  test('"20260526" → "2026-05-26"', () => {
    expect(ga4DateToIso('20260526')).toBe('2026-05-26');
  });
});

describe('(a) host filter — all engines kept, decoys dropped', () => {
  test('keeps the 5 engines (chatgpt twice after alias-sum), drops google/(direct)', () => {
    const { rows, nearMisses } = transformRows(FIXTURE);
    // After alias-sum: chatgpt×2 (this-week, festivals), perplexity, claude, gemini, copilot = 6 rows
    expect(rows.length).toBe(6);
    expect(rows.map((r) => r.referrer_engine).sort()).toEqual([
      'chatgpt', 'chatgpt', 'claude', 'copilot', 'gemini', 'perplexity',
    ]);
    // all 5 distinct engines present
    expect(new Set(rows.map((r) => r.referrer_engine)).size).toBe(5);
    // exact mapped hosts produce no near-miss noise
    expect(nearMisses).toEqual([]);
  });
});

describe('(b) ALIAS-SUM — chatgpt.com + chat.openai.com on same grain → one row, summed', () => {
  test('one chatgpt row for (2026-05-26, /en/festivals) with sessions 5+3=8', () => {
    const { rows } = transformRows(FIXTURE);
    const festivals = rows.filter(
      (r) => r.referrer_engine === 'chatgpt' && r.landing_page === '/en/festivals' && r.observed_date === '2026-05-26',
    );
    expect(festivals.length).toBe(1);            // ONE row, not two
    expect(festivals[0].sessions).toBe(8);       // summed, not overwritten to 3
    // the non-colliding chatgpt row is untouched
    const thisWeek = rows.find((r) => r.landing_page === '/en/this-week')!;
    expect(thisWeek).toEqual({ referrer_engine: 'chatgpt', landing_page: '/en/this-week', sessions: 9, observed_date: '2026-05-26' });
  });

  test('alias-sum survives the upsert — stored chatgpt/festivals row is 8', () => {
    const { rows } = transformRows(FIXTURE);
    writeRows(db, rows, '2026-06-03T10:00:00.000Z');
    const stored = db
      .prepare("SELECT sessions FROM ga4_ai_referrals WHERE referrer_engine='chatgpt' AND landing_page='/en/festivals' AND observed_date='2026-05-26'")
      .get() as { sessions: number };
    expect(stored.sessions).toBe(8);
  });
});

describe('(c) EXACTNESS — no organic/direct false attribution', () => {
  test('google (30 sessions) and (direct) are dropped; google is NOT mapped to gemini', () => {
    const { rows, nearMisses } = transformRows(FIXTURE);
    // nothing landed on "/" (the decoys' landing page)
    expect(rows.some((r) => r.landing_page === '/')).toBe(false);
    // the only gemini row came from gemini.google.com → /en/nightlife, never from google
    const gemini = rows.filter((r) => r.referrer_engine === 'gemini');
    expect(gemini.length).toBe(1);
    expect(gemini[0].landing_page).toBe('/en/nightlife');
    // "google" has no AI-engine substring → not even a near-miss (silent drop)
    expect(nearMisses).not.toContain('google');
  });
});

describe('(d) idempotency on the grain — including new engines', () => {
  function count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM ga4_ai_referrals').get() as { n: number }).n;
  }

  test('re-import of identical data yields the same row count (no duplicates)', () => {
    const { rows } = transformRows(FIXTURE);
    writeRows(db, rows, '2026-06-03T10:00:00.000Z');
    expect(count()).toBe(6);
    writeRows(db, rows, '2026-06-03T11:00:00.000Z');
    expect(count()).toBe(6);
  });

  test('changed sessions UPDATES in place for a gemini row — latest wins, no new row', () => {
    const { rows } = transformRows(FIXTURE);
    writeRows(db, rows, '2026-06-03T10:00:00.000Z');

    const bumped = rows.map((r) =>
      r.referrer_engine === 'gemini' ? { ...r, sessions: 42 } : r,
    );
    writeRows(db, bumped, '2026-06-03T12:00:00.000Z');

    expect(count()).toBe(6); // still no new row
    const updated = db
      .prepare("SELECT sessions, imported_at FROM ga4_ai_referrals WHERE referrer_engine='gemini' AND landing_page='/en/nightlife' AND observed_date='2026-05-28'")
      .get() as { sessions: number; imported_at: string };
    expect(updated.sessions).toBe(42);
    expect(updated.imported_at).toBe('2026-06-03T12:00:00.000Z');
  });
});

describe('near-miss guard — re-scoped to host-string drift', () => {
  test('an unmapped AI-looking host is surfaced (now incl. openai/chatgpt drift); exact hosts do not fire', () => {
    const resp: Ga4Response = {
      rows: [
        { dimensionValues: [{ value: '20260601' }, { value: 'labs.perplexity.com' }, { value: '/' }], metricValues: [{ value: '4' }, { value: '3' }] },
        { dimensionValues: [{ value: '20260601' }, { value: 'assistant.openai.com' }, { value: '/' }], metricValues: [{ value: '2' }, { value: '2' }] },
        { dimensionValues: [{ value: '20260601' }, { value: 'gemini.google.com' }, { value: '/en/x' }], metricValues: [{ value: '1' }, { value: '1' }] },
        { dimensionValues: [{ value: '20260601' }, { value: 'google' }, { value: '/' }], metricValues: [{ value: '9' }, { value: '9' }] },
      ],
    };
    const { rows, nearMisses } = transformRows(resp);
    // only the exact gemini host imports
    expect(rows.length).toBe(1);
    expect(rows[0].referrer_engine).toBe('gemini');
    // drift hosts surfaced (perplexity substring + the newly-added openai hint)
    expect(nearMisses).toContain('labs.perplexity.com');
    expect(nearMisses).toContain('assistant.openai.com');
    // exact mapped host is NOT a near-miss; plain organic is silent
    expect(nearMisses).not.toContain('gemini.google.com');
    expect(nearMisses).not.toContain('google');
  });
});
