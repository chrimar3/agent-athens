// Tests for src/db/db-health.ts — the build-side degenerate-DB guard.
//
// Context: 2026-06-30 incident — the daily build ran against a tableless events.db
// and code-1'd mid-generation at getAllEvents (after ~13,606 image copies). This
// guard converts that into a clean, loud abort BEFORE any work. The canonical
// predicate (events readable AND COUNT(*)>0 AND integrity_check='ok') mirrors
// scripts/backup-events-db.sh:87-97. @see specs/db-availability-build-2026-06-30.md
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { join } from "path";
import { tmpdir } from "os";
import { validateDbHealth, assertEventsDbHealthy } from "../src/db/db-health";

const REAL_DUD = join(import.meta.dir, "..", "data", "events.db.empty-2026-06-30");

let workDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "aa-dbhealth-test-"));
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** A structurally valid events.db with `rows` rows. */
function makeValidDb(path: string, rows: number): void {
  const db = new Database(path);
  db.run("CREATE TABLE events (id INTEGER PRIMARY KEY, payload TEXT)");
  const ins = db.prepare("INSERT INTO events (payload) VALUES (?)");
  for (let i = 0; i < rows; i++) ins.run(randomBytes(32).toString("hex"));
  db.close();
}

/** An empty SQLite file with NO events table — mirrors the 4KB dud. */
function makeTablelessDb(path: string): void {
  new Database(path).close();
}

describe("validateDbHealth (pure)", () => {
  test("healthy DB (rows>0, integrity ok) → healthy:true, no errors", () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE events (id INTEGER PRIMARY KEY, payload TEXT)");
    db.run("INSERT INTO events (payload) VALUES ('x'), ('y'), ('z')");
    const r = validateDbHealth(db);
    db.close();
    expect(r.healthy).toBe(true);
    expect(r.rowCount).toBe(3);
    expect(r.integrityOk).toBe(true);
    expect(r.errors.length).toBe(0);
  });

  test("0-row DB → degenerate (healthy:false, error mentions empty)", () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE events (id INTEGER PRIMARY KEY)");
    const r = validateDbHealth(db);
    db.close();
    expect(r.healthy).toBe(false);
    expect(r.rowCount).toBe(0);
    expect(r.errors.join(" ")).toMatch(/empty|0 row/i);
  });

  test("tableless DB (no events table) → degenerate, does not throw", () => {
    const db = new Database(":memory:");
    const r = validateDbHealth(db);
    db.close();
    expect(r.healthy).toBe(false);
    expect(r.errors.join(" ")).toMatch(/table|no such|tableless|missing/i);
  });
});

describe("assertEventsDbHealthy (opens read-only, never creates)", () => {
  test("healthy DB → does NOT throw", () => {
    const p = join(workDir, "events.db");
    makeValidDb(p, 50);
    expect(() => assertEventsDbHealthy(p)).not.toThrow();
  });

  test("0-row DB → throws degenerate error", () => {
    const p = join(workDir, "events.db");
    makeValidDb(p, 0);
    expect(() => assertEventsDbHealthy(p)).toThrow(/degenerate|empty|refus/i);
  });

  test("tableless DB → throws degenerate error", () => {
    const p = join(workDir, "events.db");
    makeTablelessDb(p);
    expect(() => assertEventsDbHealthy(p)).toThrow(/degenerate|table|refus/i);
  });

  test("missing DB file → throws (never auto-creates the file)", () => {
    const p = join(workDir, "does-not-exist.db");
    expect(() => assertEventsDbHealthy(p)).toThrow(/degenerate|missing|refus|open/i);
    // critical: the guard must NOT manufacture an empty file (the 06-30 engine)
    expect(existsSync(p)).toBe(false);
  });

  test("corrupt file (not a database) → throws", () => {
    const p = join(workDir, "events.db");
    writeFileSync(p, "this is not a sqlite database");
    expect(() => assertEventsDbHealthy(p)).toThrow();
  });

  test("the REAL preserved 4KB dud → throws (regression guard for 06-30)", () => {
    if (!existsSync(REAL_DUD)) return; // skip if forensic file was cleaned up
    expect(() => assertEventsDbHealthy(REAL_DUD)).toThrow(/degenerate|table|empty|refus/i);
  });
});
