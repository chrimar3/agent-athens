/**
 * Tests for the save-path observability changes added in Session 98.
 *
 * Two columns on enrichment_log:
 *   - saved_to_events BOOLEAN: 1 when both UPDATE events and INSERT
 *     enrichment_log succeed; 0 when UPDATE fails but we still log the
 *     failure; NULL for historical rows (pre-migration).
 *   - run_id TEXT: propagated from process.env.RUN_ID if present, NULL
 *     otherwise. Forward-only — ad-hoc developer invocations write NULL.
 *
 * Plus a wrapper-reconciliation query pattern used by auto-enrich.sh to
 * count actual saves per run (replacing exit-code inference).
 *
 * All six tests below FAIL against the current save-batch.ts. They pass
 * after Step 3 wires saved_to_events + run_id into the INSERT.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { saveBatch, ensureV4Columns } from '../scripts/save-batch';

const TEST_DIR = 'temp-descriptions';

const VALID_DESCRIPTION = `**What is it?** A concert at Test Venue in central Athens on 15 June 2027. The programme brings together a quartet of musicians for an evening of contemporary Greek composition.

**Why it matters** The ensemble has toured Greek cultural centres for three seasons now, building a following for their interpretive work on modern Greek song cycles.

**What to expect** Doors open at 20:30, performance starts at 21:00. Seating is flexible and the venue runs a bar through the interval. Around ninety minutes with a short pause between halves.

**Good to know** Metro to Syntagma and a short walk east. Payment by card or cash at the door if tickets remain. Programme notes distributed on entry. Suitable for ages 12 and up.

<!-- timeliness-expires: 2027-06-15 -->`;

function createTestDB(): Database {
  const db = new Database(':memory:');
  db.run('PRAGMA journal_mode = WAL');

  db.run(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      venue_name TEXT,
      price_type TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      genres TEXT,
      description TEXT,
      full_description TEXT,
      full_description_gr TEXT,
      full_description_en TEXT,
      tags TEXT,
      source TEXT,
      needs_enrichment INTEGER DEFAULT 1,
      location_status TEXT DEFAULT 'verified_athens',
      enriched_at TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE enrichment_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      enrichment_version TEXT,
      word_count_en INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ensureV4Columns adds all Session-98 observability columns alongside
  // the v4 schema, so tests get a post-migration-shaped DB for free.
  ensureV4Columns(db);

  return db;
}

function insertEvent(db: Database, id: string): void {
  db.prepare(`
    INSERT INTO events (id, title, type, venue_name, price_type, start_date, source, needs_enrichment, location_status)
    VALUES (?, 'Test Concert', 'concert', 'Test Venue', 'with-ticket', '2027-06-15T21:00:00', 'test', 1, 'verified_athens')
  `).run(id);
}

function writeDescription(eventId: string, content: string = VALID_DESCRIPTION): void {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, `${eventId}.md`), content, 'utf-8');
}

function cleanupFiles(eventIds: string[]): void {
  for (const id of eventIds) {
    try { rmSync(join(TEST_DIR, `${id}.md`)); } catch {}
    try { rmSync(join(TEST_DIR, `${id}.tags.json`)); } catch {}
  }
  try { rmSync(join(TEST_DIR, 'recent-openings.json')); } catch {}
}

describe('saved_to_events on successful save (Case 1)', () => {
  const eventId = 's98-case1-event';

  beforeEach(() => { delete process.env.RUN_ID; });
  afterEach(() => cleanupFiles([eventId]));

  test('writes saved_to_events=1 when UPDATE events and INSERT enrichment_log both succeed', () => {
    const db = createTestDB();
    insertEvent(db, eventId);
    writeDescription(eventId);

    saveBatch(db, [eventId], 'test-session', 1, false);

    const row = db.prepare(
      `SELECT saved_to_events FROM enrichment_log WHERE event_id = ? ORDER BY id DESC LIMIT 1`,
    ).get(eventId) as { saved_to_events: number | null } | undefined;

    expect(row).toBeDefined();
    expect(row!.saved_to_events).toBe(1);
    db.close();
  });
});

describe('saved_to_events on save failure (Case 2)', () => {
  const eventId = 's98-case2-event';

  afterEach(() => cleanupFiles([eventId]));

  test('writes saved_to_events=0 when the events UPDATE fails but logs the attempt', () => {
    const db = createTestDB();
    insertEvent(db, eventId);
    writeDescription(eventId);

    // Trigger-based failure injection: RAISE(FAIL) on UPDATE of this event.
    // Simulates a SQLite constraint violation or other runtime error. The
    // save-batch must still log the attempt with saved_to_events=0 so the
    // wrapper-reconciliation query can distinguish "tried and failed" from
    // "never attempted".
    db.run(`
      CREATE TRIGGER fail_update_events
      BEFORE UPDATE ON events
      WHEN NEW.id = '${eventId}'
      BEGIN
        SELECT RAISE(FAIL, 'simulated UPDATE failure');
      END
    `);

    try {
      saveBatch(db, [eventId], 'test-session', 1, false);
    } catch {
      // save-batch may propagate or swallow; both acceptable for this test.
    }

    const row = db.prepare(
      `SELECT saved_to_events FROM enrichment_log WHERE event_id = ? ORDER BY id DESC LIMIT 1`,
    ).get(eventId) as { saved_to_events: number | null } | undefined;

    expect(row).toBeDefined();
    expect(row!.saved_to_events).toBe(0);

    // Events row should not have been updated — trigger aborted it.
    const evt = db.prepare(`SELECT full_description_en FROM events WHERE id = ?`).get(eventId) as { full_description_en: string | null };
    expect(evt.full_description_en).toBeNull();

    db.close();
  });
});

describe('wrapper reconciliation query (Cases 3 + 4)', () => {
  // These don't exercise the save path directly — they verify the SQL shape
  // auto-enrich.sh will use to replace exit-code inference. Kept in this
  // file so all Session 98 expectations land in one place.

  test('Case 3: SUM(saved_to_events=1) counts actual saves within a run', () => {
    const db = createTestDB();

    db.prepare(`INSERT INTO events (id, title, type, start_date) VALUES (?, 'e', 'concert', '2027-01-01')`).run('e1');
    db.prepare(`INSERT INTO events (id, title, type, start_date) VALUES (?, 'e', 'concert', '2027-01-01')`).run('e2');
    db.prepare(`INSERT INTO events (id, title, type, start_date) VALUES (?, 'e', 'concert', '2027-01-01')`).run('e3');
    db.prepare(`INSERT INTO events (id, title, type, start_date) VALUES (?, 'e', 'concert', '2027-01-01')`).run('e4');

    db.prepare(
      `INSERT INTO enrichment_log (event_id, batch_number, run_id, saved_to_events) VALUES (?, ?, ?, ?)`,
    ).run('e1', 1, 'run-A', 1);
    db.prepare(
      `INSERT INTO enrichment_log (event_id, batch_number, run_id, saved_to_events) VALUES (?, ?, ?, ?)`,
    ).run('e2', 1, 'run-A', 1);
    db.prepare(
      `INSERT INTO enrichment_log (event_id, batch_number, run_id, saved_to_events) VALUES (?, ?, ?, ?)`,
    ).run('e3', 1, 'run-A', 0);
    db.prepare(
      `INSERT INTO enrichment_log (event_id, batch_number, run_id, saved_to_events) VALUES (?, ?, ?, ?)`,
    ).run('e4', 1, 'run-B', 1);

    const runA = db.prepare(
      `SELECT COUNT(*) AS saved FROM enrichment_log WHERE run_id = ? AND batch_number = ? AND saved_to_events = 1`,
    ).get('run-A', 1) as { saved: number };
    expect(runA.saved).toBe(2);

    const runB = db.prepare(
      `SELECT COUNT(*) AS saved FROM enrichment_log WHERE run_id = ? AND batch_number = ? AND saved_to_events = 1`,
    ).get('run-B', 1) as { saved: number };
    expect(runB.saved).toBe(1);

    db.close();
  });

  test('Case 4: subprocess exits non-zero after saves commit → DB query still reports real count', () => {
    const db = createTestDB();

    // Reproduces the 2026-04-23 pattern: all 5 of a batch's events saved,
    // then subprocess exits non-zero. The wrapper's DB query returns 5; the
    // wrapper's $? would report failure. The fix is to trust the DB.
    for (let i = 1; i <= 5; i++) {
      db.prepare(`INSERT INTO events (id, title, type, start_date) VALUES (?, 'e', 'concert', '2027-01-01')`).run(`evt-${i}`);
      db.prepare(
        `INSERT INTO enrichment_log (event_id, batch_number, run_id, saved_to_events) VALUES (?, ?, ?, ?)`,
      ).run(`evt-${i}`, 2, '1714000000-99999', 1);
    }

    const result = db.prepare(
      `SELECT COUNT(*) AS saved FROM enrichment_log WHERE run_id = ? AND batch_number = ? AND saved_to_events = 1`,
    ).get('1714000000-99999', 2) as { saved: number };

    expect(result.saved).toBe(5);
    db.close();
  });
});

describe('run_id env var propagation (Cases 5 + 6)', () => {
  const eventId5 = 's98-case5-event';
  const eventId6 = 's98-case6-event';

  afterEach(() => cleanupFiles([eventId5, eventId6]));

  test('Case 5: RUN_ID env var is written to enrichment_log.run_id', () => {
    const db = createTestDB();
    insertEvent(db, eventId5);
    writeDescription(eventId5);

    process.env.RUN_ID = '1714000000-55555';
    try {
      saveBatch(db, [eventId5], 'test-session', 1, false);
    } finally {
      delete process.env.RUN_ID;
    }

    const row = db.prepare(
      `SELECT run_id FROM enrichment_log WHERE event_id = ? ORDER BY id DESC LIMIT 1`,
    ).get(eventId5) as { run_id: string | null } | undefined;

    expect(row).toBeDefined();
    expect(row!.run_id).toBe('1714000000-55555');
    db.close();
  });

  test('Case 6: absent RUN_ID env var writes NULL (ad-hoc invocation)', () => {
    const db = createTestDB();
    insertEvent(db, eventId6);
    writeDescription(eventId6);

    delete process.env.RUN_ID;
    saveBatch(db, [eventId6], 'test-session', 1, false);

    const row = db.prepare(
      `SELECT run_id FROM enrichment_log WHERE event_id = ? ORDER BY id DESC LIMIT 1`,
    ).get(eventId6) as { run_id: string | null } | undefined;

    expect(row).toBeDefined();
    expect(row!.run_id).toBeNull();
    db.close();
  });
});
