/**
 * Prod-DB test guard — preload (2026-07-07).
 *
 * WHY: src/db/__tests__/migrations.test.ts:30 opened data/events.db WRITABLE
 * from the test suite; during an S200 `bun test` run it (or code sharing that
 * hole) flipped 4 `merged_into` marks in one second with no audit row — a raw
 * writer bypassing the marking path, corrupting dedup mark-state and blocking
 * the GEO reland. This preload makes the class structurally impossible: under
 * `bun test` (bunfig.toml [test].preload), EVERY `bun:sqlite` Database open of
 * the production DB path throws — read OR write, however the path was built.
 *
 * Convention: tests use `:memory:` (tests/helpers/db-helpers.createTestDB) or
 * a COPY of prod at a different path (copyFileSync → tmp). Copies pass this
 * guard automatically because the path differs.
 *
 * tests/prod-db-guard.test.ts keeps this preload ARMED: it asserts the throw,
 * so deleting the preload (or dropping it from bunfig.toml) fails the suite.
 */
import { mock } from 'bun:test';
import * as realSqlite from 'bun:sqlite';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dir, '../..');
const PROD_DB = resolve(join(ROOT, 'data', 'events.db'));

function isProdDbPath(filename: unknown): boolean {
  if (typeof filename !== 'string') return false; // :memory: via undefined/empty handled below
  if (filename === ':memory:' || filename === '') return false;
  // Canonicalize against cwd — catches absolute, relative, and ../-style forms.
  const abs = resolve(filename);
  // Exact match plus WAL/SHM siblings (opening the -wal directly is also prod access).
  return abs === PROD_DB || abs === `${PROD_DB}-wal` || abs === `${PROD_DB}-shm`;
}

const RealDatabase = realSqlite.Database;

class GuardedDatabase extends RealDatabase {
  constructor(filename?: string, options?: number | object) {
    if (isProdDbPath(filename)) {
      throw new Error(
        `[prod-db-guard] BLOCKED: test attempted to open the PRODUCTION database (${filename}). ` +
        `Tests must never touch data/events.db — read or write. Use createTestDB() ` +
        `(tests/helpers/db-helpers, :memory:) or copyFileSync prod to a temp path first. ` +
        `Context: the S200 mark-flip incident (4 merged_into rows mutated by a test run).`,
      );
    }
    super(filename, options);
  }
}

mock.module('bun:sqlite', () => ({
  ...realSqlite,
  Database: GuardedDatabase,
  default: GuardedDatabase,
}));
