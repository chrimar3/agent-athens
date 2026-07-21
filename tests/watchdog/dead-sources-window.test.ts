/**
 * Outcome 2 — the watchdog must stop silently forgetting long-dead sources.
 *
 * deadSourcesSignal's 30-day "produced recently" guard exists so dormant /
 * seasonal / brand-new sources do not flap. But it had a blind spot: a source
 * dead LONGER than 30 days dropped out of the alert set entirely — going quiet
 * precisely because it had been broken too long (clubber.gr would have vanished
 * from alerts around 2026-08-04).
 *
 * The rule pinned here: a streak of HARD failures (success=0) is never
 * seasonal quietness — a dormant source records 0 events WITH success=1 — so
 * an all-hard-failed streak is reported regardless of when the source last
 * produced. Zero-event successful streaks keep the original 30-day guard.
 *
 * Synthetic fixture DB only (DEADMAN_DB_PATH); the prod-db-guard preload
 * blocks data/events.db from tests anyway.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "deadman-fixture-"));
const FIXTURE_DB = join(dir, "scrape-stats-fixture.db");
const savedEnv = process.env.DEADMAN_DB_PATH;

function isoDaysAgo(days: number, offsetMinutes = 0): string {
  return new Date(Date.now() - days * 86_400_000 + offsetMinutes * 60_000).toISOString();
}

let deadSourcesSignal: () => string[];

beforeAll(async () => {
  const db = new Database(FIXTURE_DB, { create: true });
  db.exec(`CREATE TABLE scrape_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    scraped_at TEXT NOT NULL,
    events_found INTEGER DEFAULT 0,
    events_new INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    duration_ms INTEGER,
    success INTEGER DEFAULT 1,
    error_message TEXT
  );`);
  const ins = db.prepare(
    `INSERT INTO scrape_stats (source, scraped_at, events_found, events_new, events_updated, duration_ms, success, error_message)
     VALUES (?, ?, ?, 0, 0, 1000, ?, ?)`,
  );
  const run = (source: string, daysAgo: number, found: number, success: 0 | 1, err: string | null = null) =>
    ins.run(source, isoDaysAgo(daysAgo), found, success, err);

  // clubber — LONG-DEAD, hard-failing: produced 60d ago, last 3 runs success=0.
  // The old guard forgot this case entirely (produced >30d ago → never reported).
  run("clubber", 60, 12, 1);
  run("clubber", 3, 0, 0, "clubber.gr feed is not iCal");
  run("clubber", 2, 0, 0, "clubber.gr feed is not iCal");
  run("clubber", 1, 0, 0, "clubber.gr feed is not iCal");

  // benaki — DORMANT/SEASONAL: produced 45d ago; last 3 runs 0 events but success=1.
  // Must NOT be reported (the original anti-flap intent, preserved).
  run("benaki", 45, 5, 1);
  run("benaki", 3, 0, 1);
  run("benaki", 2, 0, 1);
  run("benaki", 1, 0, 1);

  // halfnote — FRESH DEATH: produced 10d ago; last 3 runs 0 events success=1.
  // The original rule: still reported (produced within the 30-day window).
  run("halfnote", 10, 7, 1);
  run("halfnote", 3, 0, 1);
  run("halfnote", 2, 0, 1);
  run("halfnote", 1, 0, 1);

  // ra — BRAND-NEW: only 2 runs on record (below SOURCE_DEAD_STREAK). Never reported.
  run("ra", 2, 0, 0, "boom");
  run("ra", 1, 0, 0, "boom");

  // snfcc — MIXED beyond the window: hard fails interleaved with zero-event
  // successes, produced 60d ago. Ambiguous → stays conservative, NOT reported.
  run("snfcc", 60, 9, 1);
  run("snfcc", 3, 0, 0, "timeout");
  run("snfcc", 2, 0, 1);
  run("snfcc", 1, 0, 0, "timeout");

  // more — HEALTHY: recent productive run. Never reported.
  run("more", 2, 0, 1);
  run("more", 1, 34, 1);
  db.close();

  process.env.DEADMAN_DB_PATH = FIXTURE_DB;
  ({ deadSourcesSignal } = await import("../../scripts/deadman-watchdog"));
});

afterAll(() => {
  if (savedEnv === undefined) delete process.env.DEADMAN_DB_PATH;
  else process.env.DEADMAN_DB_PATH = savedEnv;
  rmSync(dir, { recursive: true, force: true });
});

describe("deadSourcesSignal — long-dead sources stay surfaced, dormant ones stay quiet", () => {
  test("fixture precondition: clubber's last production is OUTSIDE the 30-day window", () => {
    const db = new Database(FIXTURE_DB, { readonly: true });
    const row = db
      .prepare(
        `SELECT 1 AS hit FROM scrape_stats
         WHERE source='clubber' AND events_found > 0 AND scraped_at >= datetime('now', '-30 days') LIMIT 1`,
      )
      .get();
    db.close();
    expect(row).toBeNull(); // if this ever passes the window, the long-dead case is no longer exercised
  });

  test("hard-failing source dead >30 days is STILL reported (the 2026-08-04 blind spot)", () => {
    expect(deadSourcesSignal()).toContain("clubber");
  });

  test("dormant/seasonal source (0 events but success=1, produced >30d ago) is NOT reported", () => {
    expect(deadSourcesSignal()).not.toContain("benaki");
  });

  test("fresh death within the window is still reported (original rule preserved)", () => {
    expect(deadSourcesSignal()).toContain("halfnote");
  });

  test("brand-new source with fewer than 3 runs is NOT reported", () => {
    expect(deadSourcesSignal()).not.toContain("ra");
  });

  test("mixed hard-fail/quiet-success streak beyond the window stays conservative — NOT reported", () => {
    expect(deadSourcesSignal()).not.toContain("snfcc");
  });

  test("healthy source is NOT reported", () => {
    expect(deadSourcesSignal()).not.toContain("more");
  });
});
