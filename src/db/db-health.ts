// Degenerate-DB guard — the build-side half of the 2026-06-30 hardening family.
//
// On 2026-06-30 the daily build ran against a tableless events.db and code-1'd
// mid-generation at getAllEvents (after ~13,606 image copies). Root loop: a missing
// DB opened with {create:true} (database.ts:30) auto-materialises an empty 114B file,
// which then passes the wrapper's existence-only check. This module lets the build
// (and anything else) assert DB health WITHOUT opening the create:true singleton, so
// it never manufactures that empty file.
//
// Canonical predicate (kept consistent across the family — Guard 6):
//   events table readable  AND  COUNT(*) > 0  AND  PRAGMA integrity_check = 'ok'
// Siblings: scripts/backup-events-db.sh:87-97 (shell), src/watchdog/classifier.ts
// (TS, row-count only), scripts/assert-events-db-healthy.sh (shell, wrapper gate).
// @see specs/db-availability-build-2026-06-30.md
import { Database } from "bun:sqlite";
import { join } from "path";

const DEFAULT_DB_PATH = join(import.meta.dir, "../../data/events.db");

export interface DbHealth {
  healthy: boolean;
  rowCount: number;
  integrityOk: boolean;
  errors: string[];
}

/**
 * Pure health check against an already-open handle. No I/O of its own (no open,
 * no close) — so it unit-tests in-memory like src/watchdog/classifier.ts. Treats a
 * missing `events` table (or any query error) as degenerate rather than throwing.
 */
export function validateDbHealth(db: Database): DbHealth {
  const errors: string[] = [];
  let rowCount = -1;
  let integrityOk = false;

  try {
    const row = db.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number };
    rowCount = row?.c ?? 0;
  } catch (e) {
    // "no such table: events" — a tableless/degenerate DB.
    errors.push(`events table unreadable (tableless/degenerate): ${(e as Error).message}`);
    return { healthy: false, rowCount: 0, integrityOk: false, errors };
  }

  if (rowCount <= 0) {
    errors.push(`events table is empty (0 rows) — degenerate DB`);
  }

  try {
    const r = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    const verdict = r?.integrity_check ?? "<no result>";
    integrityOk = verdict === "ok";
    if (!integrityOk) errors.push(`integrity_check='${verdict}' (expected 'ok') — corrupt DB`);
  } catch (e) {
    errors.push(`integrity_check failed: ${(e as Error).message}`);
  }

  return { healthy: errors.length === 0, rowCount, integrityOk, errors };
}

/**
 * Open events.db for a read WITHOUT ever creating it. NEVER uses {create:true},
 * so a missing DB throws instead of being silently manufactured into an empty file
 * (the 06-30 engine).
 *
 * WAL opens are state-dependent in Bun and fail in TWO modes: {readonly:true} can
 * throw at open(), OR open() succeeds and the first table read throws "unable to
 * open database file" (it can't map the -shm sidecar). So we probe a real table
 * read under readonly and, on EITHER failure, fall back to {readwrite,create:false}
 * — which reads WAL reliably and still never creates a missing file. This extends
 * the readonly→readwrite fallback in scripts/deadman-watchdog.ts:83-89 to cover the
 * read-time mode the live DB actually hit.
 */
function openReadableNoCreate(dbPath: string): Database {
  try {
    const db = new Database(dbPath, { readonly: true });
    // Probe a table read to surface the WAL "unable to open" trap up front.
    db.prepare("SELECT 1 FROM events LIMIT 1").get();
    return db;
  } catch {
    // WAL trap or a tableless file ("no such table"). Reopen readwrite (still
    // create:false → a MISSING file throws here and propagates as degenerate).
    return new Database(dbPath, { readwrite: true, create: false });
  }
}

/**
 * Open events.db read-only (WAL-safe) and assert it is healthy; throw a clear,
 * loud Error otherwise. Pairs with the wrapper gate (scripts/assert-events-db-healthy.sh)
 * and the deadman watchdog as the build-side member of the family.
 *
 * @param dbPath defaults to the real events.db; an explicit path is for tests.
 */
export function assertEventsDbHealthy(dbPath: string = DEFAULT_DB_PATH): DbHealth {
  let db: Database;
  try {
    db = openReadableNoCreate(dbPath);
  } catch (e) {
    // Missing/unopenable file — create:false means it is NOT manufactured here.
    throw new Error(
      `refusing to build: events.db degenerate (missing/unopenable at ${dbPath}) — ` +
      `restore from backup (data/events.db.bak-* or /Users/chrism/agent-athens-backups) ` +
      `then rebuild. [${(e as Error).message}]`,
    );
  }

  try {
    const health = validateDbHealth(db);
    if (!health.healthy) {
      throw new Error(
        `refusing to build: events.db degenerate (missing/empty/tableless/corrupt) — ` +
        `${health.errors.join("; ")}. Restore from backup ` +
        `(data/events.db.bak-* or /Users/chrism/agent-athens-backups) then rebuild.`,
      );
    }
    return health;
  } finally {
    db.close();
  }
}
