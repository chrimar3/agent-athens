// Tests for scripts/assert-events-db-healthy.sh — the wrapper-side degenerate-DB
// gate used by daily-automated.sh. Drives the shell script as a subprocess with a
// SOURCE_DB env override (pattern from tests/backup-events-db.test.ts).
//
// Context: 2026-06-30 incident — daily-automated.sh:86 checked only `[[ -f events.db ]]`,
// so an auto-created empty file passed as "Dependencies OK" and the whole pipeline ran
// against a tableless DB. This gate replaces existence with validity.
// @see specs/db-availability-build-2026-06-30.md
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { join } from "path";
import { tmpdir } from "os";

const SCRIPT = join(import.meta.dir, "..", "scripts", "assert-events-db-healthy.sh");
const REAL_DUD = join(import.meta.dir, "..", "data", "events.db.empty-2026-06-30");

let workDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "aa-assertdb-test-"));
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeValidDb(path: string, rows: number): void {
  const db = new Database(path);
  db.run("CREATE TABLE events (id INTEGER PRIMARY KEY, payload TEXT)");
  const ins = db.prepare("INSERT INTO events (payload) VALUES (?)");
  for (let i = 0; i < rows; i++) ins.run(randomBytes(32).toString("hex"));
  db.close();
}

function makeTablelessDb(path: string): void {
  new Database(path).close();
}

function runGuard(sourceDb: string) {
  return Bun.spawnSync(["bash", SCRIPT], {
    env: { ...process.env, SOURCE_DB: sourceDb },
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("assert-events-db-healthy.sh", () => {
  test("healthy DB (rows>0) → exit 0", () => {
    const p = join(workDir, "events.db");
    makeValidDb(p, 200);
    expect(runGuard(p).exitCode).toBe(0);
  });

  test("0-row DB → non-zero exit, loud stderr", () => {
    const p = join(workDir, "events.db");
    makeValidDb(p, 0);
    const r = runGuard(p);
    expect(r.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(r.stderr)).toMatch(/degenerate|empty|0 row|refus/i);
  });

  test("tableless DB → non-zero exit", () => {
    const p = join(workDir, "events.db");
    makeTablelessDb(p);
    expect(runGuard(p).exitCode).not.toBe(0);
  });

  test("missing DB file → non-zero exit", () => {
    const p = join(workDir, "nope.db");
    expect(runGuard(p).exitCode).not.toBe(0);
  });

  test("corrupt file (not a database) → non-zero exit", () => {
    const p = join(workDir, "events.db");
    writeFileSync(p, "this is not a sqlite database");
    expect(runGuard(p).exitCode).not.toBe(0);
  });

  test("the REAL preserved 4KB dud → non-zero exit (regression guard for 06-30)", () => {
    if (!existsSync(REAL_DUD)) return;
    expect(runGuard(REAL_DUD).exitCode).not.toBe(0);
  });
});
