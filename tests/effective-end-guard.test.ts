/**
 * effectiveEndSql — parity + seam guard (campaign Phase 6, 2026-07-07).
 *
 * 1. PARITY: the SQL fragment must agree with resolveEffectiveEnd() (the
 *    canonical TS resolver) on every event shape. The Tier-1 exhibition rule
 *    metastasized into hand-copied SQL that then drifted from the classifier
 *    (S189 made end_date govern ALL types; G1 added presumption windows) —
 *    this test makes the two implementations provably lockstep.
 *
 * 2. GUARD (no-bypass shape, S95 precedent): live code must not add NEW raw
 *    `start_date >= date('now')`-style predicates. Existing offenders are
 *    allowlisted below with a TODO to migrate (see
 *    specs/effective-end-migration-remaining.md); the list only shrinks.
 */
import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { effectiveEndSql, isCurrentSql, athensTodaySql } from '../src/db/effective-end-sql';
import { resolveEffectiveEnd, getRunImplyingTypes, presumptionWindowDays } from '../src/utils/event-lifecycle';

describe('effectiveEndSql parity with resolveEffectiveEnd', () => {
  const shapes: Array<{ label: string; start_date: string; end_date: string | null; type: string }> = [
    { label: 'exhibition with end_date', start_date: '2026-05-01', end_date: '2026-09-30', type: 'exhibition' },
    { label: 'exhibition NULL end (presumed 90d)', start_date: '2026-05-01', end_date: null, type: 'exhibition' },
    { label: 'theater run with end_date', start_date: '2026-06-01T21:00:00', end_date: '2026-09-30', type: 'theater' },
    { label: 'theater NULL end (presumed 45d)', start_date: '2026-06-01T21:00:00', end_date: null, type: 'theater' },
    { label: 'festival NULL end (presumed 30d)', start_date: '2026-07-01', end_date: null, type: 'festival' },
    { label: 'concert with end_date (S189: governs)', start_date: '2026-07-01T20:00:00', end_date: '2026-07-03', type: 'concert' },
    { label: 'concert NULL end (start governs)', start_date: '2026-07-01T20:00:00', end_date: null, type: 'concert' },
    { label: 'dj_set naive-ts', start_date: '2026-08-15T23:00:00', end_date: null, type: 'dj_set' },
    { label: 'workshop date-only', start_date: '2026-08-15', end_date: null, type: 'workshop' },
  ];

  test('SQL fragment and TS resolver return the same effective end for every shape', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE events (id TEXT PRIMARY KEY, start_date TEXT, end_date TEXT, type TEXT)');
    const ins = db.prepare('INSERT INTO events VALUES ($id, $s, $e, $t)');
    shapes.forEach((sh, i) => ins.run({ $id: `p${i}`, $s: sh.start_date, $e: sh.end_date, $t: sh.type }));

    const rows = db.prepare(
      `SELECT id, ${effectiveEndSql()} AS eff FROM events ORDER BY id`,
    ).all() as Array<{ id: string; eff: string }>;

    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i];
      const ts = resolveEffectiveEnd({ startDate: sh.start_date, endDate: sh.end_date, type: sh.type });
      const sql = rows.find((r) => r.id === `p${i}`)!.eff;
      expect(`${sh.label}: ${sql}`).toBe(`${sh.label}: ${ts.date}`);
    }
    db.close();
  });

  test('column prefix qualifies every column reference', () => {
    const sql = effectiveEndSql('e.');
    expect(sql).toContain('e.end_date');
    expect(sql).toContain('e.start_date');
    expect(sql).toContain('e.type');
    expect(sql).not.toMatch(/(?<![.\w])end_date/); // no unqualified refs
  });

  test('presumption windows come from the shared config, one WHEN per run-implying type', () => {
    const sql = effectiveEndSql();
    for (const t of getRunImplyingTypes()) {
      expect(sql).toContain(`'${t}'`);
      expect(sql).toContain(`+${presumptionWindowDays(t)} days`);
    }
  });

  test('athensTodaySql returns YYYY-MM-DD and isCurrentSql binds $today', () => {
    expect(athensTodaySql()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isCurrentSql()).toContain('>= $today');
  });
});

describe('raw date-predicate seam guard', () => {
  // Existing offenders, frozen 2026-07-07 — TODO: migrate to effectiveEndSql()
  // per specs/effective-end-migration-remaining.md. This list only shrinks;
  // adding a file here instead of consuming the helper defeats the seam.
  const ALLOWED_RAW_SITES = new Set([
    'scripts/enrich-venues.ts',
    'scripts/venue-ticket-mapping.ts',
    'scripts/search-ticket-urls.ts',
    'scripts/import-ab-test-descriptions.ts',
    'scripts/crossref-ticket-urls.ts',
    'scripts/search-more-tickets.ts',
    'scripts/extract-ticket-urls.ts',
    'scripts/daily-manual.ts',
    'scripts/backfill-ticket-urls.ts',
  ]);
  // The helper's own docs name the anti-pattern; archived scripts are dead code.
  const EXCLUDED = [/^scripts\/_archive\//, /^src\/db\/effective-end-sql\.ts$/, /__tests__/, /\.test\.ts$/];

  const RAW_PREDICATE = /start_date\s*(>=|<=|<|>)\s*date\((['"])now\2/;

  function scanDir(dir: string, root: string, hits: string[]): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = full.slice(root.length + 1);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === '.git') continue;
        scanDir(full, root, hits);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      if (EXCLUDED.some((re) => re.test(rel))) continue;
      if (ALLOWED_RAW_SITES.has(rel)) continue;
      const text = readFileSync(full, 'utf-8');
      if (RAW_PREDICATE.test(text)) hits.push(rel);
    }
  }

  test('no NEW raw start_date-vs-date(now) predicates outside the allowlist', () => {
    const root = join(import.meta.dir, '..');
    const hits: string[] = [];
    scanDir(join(root, 'src'), root, hits);
    scanDir(join(root, 'scripts'), root, hits);
    expect(hits).toEqual([]);
  });

  test('allowlist entries still contain the pattern (self-pruning: remove migrated files)', () => {
    const root = join(import.meta.dir, '..');
    for (const rel of ALLOWED_RAW_SITES) {
      const text = readFileSync(join(root, rel), 'utf-8');
      expect(`${rel}: ${RAW_PREDICATE.test(text)}`).toBe(`${rel}: true`);
    }
  });
});
