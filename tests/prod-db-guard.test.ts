/**
 * Keeps the prod-DB test guard ARMED (2026-07-07).
 *
 * The preload (tests/preload/prod-db-guard.preload.ts, wired via bunfig.toml
 * [test].preload) blocks every bun:sqlite open of data/events.db from the
 * test suite — the structural fix for the S200 mark-flip incident, where a
 * test opened prod writable and mutated 4 merged_into marks with no audit row.
 *
 * These assertions fail if the preload is deleted, un-wired from bunfig.toml,
 * or weakened — so "guard exists" is itself under test (same pattern as the
 * effective-end seam guard's self-pruning allowlist).
 */
import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { resolve, join } from 'path';
import { mkdtempSync, rmSync, copyFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';

const ROOT = resolve(import.meta.dir, '..');
const PROD_DB = join(ROOT, 'data', 'events.db');

describe('prod-db-guard preload', () => {
  test('opening the production DB writable from a test THROWS', () => {
    expect(() => new Database(PROD_DB)).toThrow(/prod-db-guard/);
  });

  test('opening the production DB readonly from a test ALSO throws (no reads either)', () => {
    expect(() => new Database(PROD_DB, { readonly: true })).toThrow(/prod-db-guard/);
  });

  test('a relative path resolving to prod is blocked too', () => {
    // Tests run with cwd = repo root; resolve() canonicalizes before matching.
    expect(() => new Database('data/events.db')).toThrow(/prod-db-guard/);
  });

  test(':memory: databases are unaffected', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (x)');
    db.close();
  });

  test('a COPY of prod at a temp path passes (the sanctioned fixture route)', () => {
    if (!existsSync(PROD_DB)) return; // CI without prod DB: copy route untestable, skip silently
    const dir = mkdtempSync(join(tmpdir(), 'prod-db-guard-'));
    const copy = join(dir, 'events-copy.db');
    try {
      copyFileSync(PROD_DB, copy);
      // No {readonly:true}: a copied WAL-mode DB without its -wal/-shm fails
      // readonly opens in Bun 1.3.0 (banked in mistakes.md, Subagent Enrichment
      // Issues 2026-02-26). The path difference is what the guard checks.
      const db = new Database(copy);
      db.prepare('SELECT COUNT(*) FROM events').get();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
