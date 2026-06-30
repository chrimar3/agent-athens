// Tests for scripts/backup-events-db.sh — the integrity floor (Step 1) and
// dud-aware prune (Step 2). Drives the shell script as a subprocess with
// SOURCE_DB / BACKUP_DIR / retention env overrides.
//
// Context: 2026-06-30 incident — an empty events.db was backed up over the day's
// slot (114B dud) and the time-only prune then deleted a good backup. These tests
// pin the two guards that make that impossible. @see specs/db-loss-incident-2026-06-30.md
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readdirSync, statSync } from "fs";
import { randomBytes } from "crypto";
import { join } from "path";
import { tmpdir } from "os";

const SCRIPT = join(import.meta.dir, "..", "scripts", "backup-events-db.sh");
const REAL_DUD = join(import.meta.dir, "..", "data", "events.db.empty-2026-06-30");

let workDir: string;
let backupDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "aa-backup-test-"));
  backupDir = join(workDir, "backups");
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** A structurally valid events.db with `rows` rows of INCOMPRESSIBLE payload, so
 *  its gzip stays well above the dud thresholds (random data won't compress away). */
function makeValidDb(path: string, rows: number): void {
  const db = new Database(path);
  db.run("CREATE TABLE events (id INTEGER PRIMARY KEY, enriched_at TEXT, payload TEXT)");
  const ins = db.prepare("INSERT INTO events (enriched_at, payload) VALUES (?, ?)");
  for (let i = 0; i < rows; i++) ins.run("2026-06-29 10:00:00", randomBytes(256).toString("hex"));
  db.close();
}

/** An empty SQLite file (no events table) — mirrors the 4KB dud. */
function makeEmptyDb(path: string): void {
  new Database(path).close();
}

// Default test env isolates ONE guard per test: dud floor scaled down (2KB) so
// modest valid fixtures aren't seen as duds; size-ratio floor OFF (0) except in
// its own test, so it doesn't interfere with prune/healthy cases.
function runBackup(env: Record<string, string>) {
  return Bun.spawnSync(["bash", SCRIPT], {
    env: {
      ...process.env,
      BACKUP_DIR: backupDir,
      BACKUP_MIN_VALID_BYTES: "2000",
      BACKUP_MIN_SIZE_RATIO: "0",
      ...env,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
}

function gzFiles(): string[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir).filter((f) => f.endsWith(".db.gz"));
}

describe("backup integrity floor (Step 1)", () => {
  test("healthy DB (rows>0, integrity ok) → backup PROCEEDS (exit 0, one gz written)", () => {
    const src = join(workDir, "events.db");
    makeValidDb(src, 200);
    const r = runBackup({ SOURCE_DB: src });
    expect(r.exitCode).toBe(0);
    const gz = gzFiles();
    expect(gz.length).toBe(1);
    expect(statSync(join(backupDir, gz[0])).size).toBeGreaterThan(0);
  });

  test("0-row DB → REFUSED (non-zero exit, no gz written)", () => {
    const src = join(workDir, "events.db");
    makeValidDb(src, 0);
    const r = runBackup({ SOURCE_DB: src });
    expect(r.exitCode).not.toBe(0);
    expect(gzFiles().length).toBe(0);
  });

  test("empty DB / no events table → REFUSED (no gz, loud stderr)", () => {
    const src = join(workDir, "events.db");
    makeEmptyDb(src);
    const r = runBackup({ SOURCE_DB: src });
    expect(r.exitCode).not.toBe(0);
    expect(gzFiles().length).toBe(0);
    expect(new TextDecoder().decode(r.stderr)).toMatch(/REFUS|integrity|0 row|empty/i);
  });

  test("corrupt file (not a database) → REFUSED", () => {
    const src = join(workDir, "events.db");
    writeFileSync(src, "this is not a sqlite database");
    const r = runBackup({ SOURCE_DB: src });
    expect(r.exitCode).not.toBe(0);
    expect(gzFiles().length).toBe(0);
  });

  test("the REAL preserved 4KB dud → REFUSED (regression guard for the 06-30 incident)", () => {
    if (!existsSync(REAL_DUD)) return; // skip if forensic file was cleaned up
    const r = runBackup({ SOURCE_DB: REAL_DUD });
    expect(r.exitCode).not.toBe(0);
    expect(gzFiles().length).toBe(0);
  });

  test("valid but anomalously smaller than prior backup → REFUSED, prior slot survives", () => {
    // Prior good backup = a large dummy gz; today's source = tiny valid DB.
    const prior = join(backupDir, "events-2000-01-01.db.gz");
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(prior, Buffer.alloc(5_000_000, 1)); // 5MB "prior"
    const src = join(workDir, "events.db");
    makeValidDb(src, 1); // gzips to a few hundred bytes << 5MB * ratio
    const r = runBackup({ SOURCE_DB: src, BACKUP_MIN_SIZE_RATIO: "0.5" });
    expect(r.exitCode).not.toBe(0);
    expect(existsSync(prior)).toBe(true); // prior NOT clobbered
  });
});

describe("dud-aware prune (Step 2)", () => {
  test("a dud backup is deleted regardless of age; good backups survive", () => {
    mkdirSync(backupDir, { recursive: true });
    // a recent DUD (114B) + a recent GOOD backup (large)
    const dud = join(backupDir, "events-2026-06-20.db.gz");
    const good = join(backupDir, "events-2026-06-28.db.gz");
    writeFileSync(dud, Buffer.alloc(114, 0));
    writeFileSync(good, Buffer.alloc(2_000_000, 1));
    const src = join(workDir, "events.db");
    makeValidDb(src, 200);
    const r = runBackup({ SOURCE_DB: src, BACKUP_RETENTION_DAYS: "7" });
    expect(r.exitCode).toBe(0);
    expect(existsSync(dud)).toBe(false); // dud purged
    expect(existsSync(good)).toBe(true); // good survives
  });

  test("retention keeps all good backups within window even with a dud present", () => {
    mkdirSync(backupDir, { recursive: true });
    // 3 good recent backups + 1 dud, all within the 7-day window
    const goods = ["events-2026-06-26.db.gz", "events-2026-06-27.db.gz", "events-2026-06-28.db.gz"];
    for (const g of goods) writeFileSync(join(backupDir, g), Buffer.alloc(2_000_000, 1));
    writeFileSync(join(backupDir, "events-2026-06-25.db.gz"), Buffer.alloc(114, 0)); // dud
    const src = join(workDir, "events.db");
    makeValidDb(src, 200);
    const r = runBackup({ SOURCE_DB: src, BACKUP_RETENTION_DAYS: "7" });
    expect(r.exitCode).toBe(0);
    for (const g of goods) expect(existsSync(join(backupDir, g))).toBe(true);
    expect(existsSync(join(backupDir, "events-2026-06-25.db.gz"))).toBe(false);
  });
});
