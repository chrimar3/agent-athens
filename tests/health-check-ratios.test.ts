import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';

// Fixture: 3 visible upcoming (2 enriched, 2 schema-valid), 1 hidden, 1 past —
// the ratio must be n/3 with n ≤ 3, never all-time/upcoming ("2546/421 =
// 604.8% enriched", data/health-reports/2026-08-10.txt). The running
// exhibition (start past, end future) pins the Tier-1 end_date rule.
// Precondition test asserts the fixture actually exercises the
// mixed-population trap.
function fixtureDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE events (
    id TEXT PRIMARY KEY, type TEXT, start_date TEXT, end_date TEXT,
    location_status TEXT, needs_enrichment INTEGER, schema_json TEXT)`);
  const ins = db.prepare(`INSERT INTO events VALUES (?,?,?,?,?,?,?)`);
  ins.run('up-1', 'concert', '2099-01-01', null, 'verified_athens', 0, '{}');
  ins.run('up-2', 'concert', '2099-01-02', null, 'verified_athens', 1, null);
  ins.run('up-3', 'exhibition', '2000-01-01', '2099-06-01', 'pass_through', 0, '{}');
  ins.run('hidden', 'concert', '2099-01-01', null, 'unverified', 0, '{}');
  ins.run('past', 'concert', '2000-01-01', null, 'verified_athens', 0, '{}');
  return db;
}

describe('health-check ratios use one population', () => {
  test('fixture precondition: mixed populations present', () => {
    const db = fixtureDb();
    const c = (db.query(`SELECT COUNT(*) c FROM events`).get() as { c: number }).c;
    expect(c).toBe(5);
    const upcomingStartOnly = (
      db.query(`SELECT COUNT(*) c FROM events WHERE date(start_date) >= date('now')`).get() as { c: number }
    ).c;
    expect(upcomingStartOnly).toBe(3); // excludes the running exhibition — the trap the fix must avoid
  });

  test('enrichment ratio is visible-upcoming over visible-upcoming (end_date-aware)', async () => {
    const { getEnrichmentStats } = await import('../scripts/health-check');
    const s = getEnrichmentStats(fixtureDb());
    expect(s.total).toBe(3); // up-1, up-2, up-3 (running exhibition counts)
    expect(s.enriched).toBe(2); // up-1, up-3 — NOT the hidden or past enriched rows
    expect(s.enriched).toBeLessThanOrEqual(s.total);
  });

  test('schema ratio uses the same population', async () => {
    const { getSchemaValidationStats } = await import('../scripts/health-check');
    const s = getSchemaValidationStats(fixtureDb());
    expect(s.total).toBe(3);
    expect(s.valid).toBe(2); // up-1, up-3
    expect(s.valid).toBeLessThanOrEqual(s.total);
  });

  test('build-time threshold is the 40-minute constant, not 30s', async () => {
    const mod = await import('../scripts/health-check');
    expect(mod.BUILD_TIME_WARN_MS).toBe(2_400_000);
  });
});
