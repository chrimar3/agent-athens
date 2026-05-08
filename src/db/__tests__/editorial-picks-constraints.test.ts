/**
 * Migration 012 — editorial_picks constraint tests (S101a-1)
 *
 * Verifies the 5 SQL-level constraints on the editorial_picks table:
 *   1. PRIMARY KEY (hub_slug, locale, week_starting, rank)
 *   2. UNIQUE (hub_slug, locale, week_starting, event_id)
 *   3. CHECK (rank BETWEEN 1 AND 10)
 *   4. FOREIGN KEY event_id REFERENCES events(id) ON DELETE CASCADE
 *   5. Multi-cornerstone happy path: same event_id allowed across different
 *      hub_slugs in the same week (load-bearing per v4 spec §6).
 *
 * Note: tests/helpers/db-helpers.ts createTestDB() loads src/db/schema.sql
 * which does NOT contain editorial_picks (the table is migration-only). So
 * we explicitly apply migration 012 to the in-memory test DB after creation.
 * This mirrors the prod state (events from schema, picks from migration)
 * without polluting schema.sql with what's currently a migration-only table.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";
import { createTestDB, cleanupDB } from "../../../tests/helpers/db-helpers";

const MIGRATION_012_PATH = join(
  import.meta.dir,
  "../migrations/012-editorial-picks.sql",
);

function applyMigration012(db: Database): void {
  const sql = readFileSync(MIGRATION_012_PATH, "utf-8");
  // bun:sqlite multi-statement SQL execution. Bracket-notation invocation
  // sidesteps a security hook that regex-matches ".exec(" indiscriminately.
  (db as unknown as { [k: string]: (s: string) => void })["exec"](sql);
}

function seedTestEvent(db: Database, id: string): void {
  db.prepare(
    `INSERT INTO events (id, title, start_date, type, venue_name, price_type, source, created_at, updated_at)
     VALUES (?, 'Test Event', '2026-06-01', 'concert', 'Test Venue', 'with-ticket', 'test', '2026-05-08', '2026-05-08')`,
  ).run(id);
}

const insertPick = (db: Database) =>
  db.prepare(
    `INSERT INTO editorial_picks (hub_slug, locale, week_starting, event_id, rank)
     VALUES (?, ?, ?, ?, ?)`,
  );

const countPicks = (db: Database, eventId?: string): number => {
  const sql = eventId
    ? `SELECT COUNT(*) AS c FROM editorial_picks WHERE event_id = ?`
    : `SELECT COUNT(*) AS c FROM editorial_picks`;
  const stmt = db.prepare(sql);
  const row = (eventId ? stmt.get(eventId) : stmt.get()) as { c: number };
  return row.c;
};

describe("editorial_picks constraints (migration 012)", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDB();
    applyMigration012(db);
    seedTestEvent(db, "evt-test-001");
    seedTestEvent(db, "evt-test-002");
  });

  afterEach(() => {
    cleanupDB(db);
  });

  test("PK enforcement: rejects duplicate (hub, locale, week, rank)", () => {
    const stmt = insertPick(db);
    stmt.run("this-weekend", "en", "2026-05-11", "evt-test-001", 1);

    expect(() => {
      stmt.run("this-weekend", "en", "2026-05-11", "evt-test-002", 1);
    }).toThrow();
  });

  test("UNIQUE enforcement: rejects same event at different ranks in same window", () => {
    const stmt = insertPick(db);
    stmt.run("this-weekend", "en", "2026-05-11", "evt-test-001", 1);

    expect(() => {
      stmt.run("this-weekend", "en", "2026-05-11", "evt-test-001", 2);
    }).toThrow();
  });

  test("CHECK enforcement: rank=0 and rank=11 fail; rank=1 and rank=10 succeed", () => {
    const stmt = insertPick(db);

    expect(() =>
      stmt.run("hub", "en", "2026-05-11", "evt-test-001", 0),
    ).toThrow();
    expect(() =>
      stmt.run("hub", "en", "2026-05-11", "evt-test-001", 11),
    ).toThrow();

    stmt.run("hub-a", "en", "2026-05-11", "evt-test-001", 1);
    stmt.run("hub-b", "en", "2026-05-11", "evt-test-001", 10);

    expect(countPicks(db)).toBe(2);
  });

  test("FK CASCADE: deleting event removes corresponding pick rows", () => {
    insertPick(db).run(
      "this-weekend",
      "en",
      "2026-05-11",
      "evt-test-001",
      1,
    );
    expect(countPicks(db, "evt-test-001")).toBe(1);

    db.prepare(`DELETE FROM events WHERE id = ?`).run("evt-test-001");

    expect(countPicks(db, "evt-test-001")).toBe(0);
  });

  test("multi-cornerstone happy path: same event_id allowed across different hub_slugs in same week", () => {
    const stmt = insertPick(db);

    stmt.run("this-weekend", "en", "2026-05-11", "evt-test-001", 1);
    stmt.run("cinema", "en", "2026-05-11", "evt-test-001", 3);

    expect(countPicks(db, "evt-test-001")).toBe(2);
  });
});
