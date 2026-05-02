import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  utimesSync,
} from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { findOrphanSlugs, sweepOrphans } from '../../src/generators/orphan-sweep';

describe('findOrphanSlugs (pure)', () => {
  test('returns dist entries not in valid set', () => {
    expect(findOrphanSlugs(['a', 'b', 'c'], new Set(['a', 'b']))).toEqual(['c']);
  });

  test('empty valid set returns all dist entries', () => {
    expect(findOrphanSlugs(['a', 'b'], new Set())).toEqual(['a', 'b']);
  });

  test('empty dist set returns []', () => {
    expect(findOrphanSlugs([], new Set(['a']))).toEqual([]);
  });

  test('identical sets return []', () => {
    expect(findOrphanSlugs(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });

  test('case-sensitive: mismatched case is NOT a match', () => {
    expect(findOrphanSlugs(['Foo'], new Set(['foo']))).toEqual(['Foo']);
  });
});

describe('sweepOrphans (orchestrator)', () => {
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'orphan-sweep-test-'));
    mkdirSync(join(dist, 'events'), { recursive: true });
    mkdirSync(join(dist, 'en', 'events'), { recursive: true });
    mkdirSync(join(dist, 'api'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  function writeEventHtml(slug: string, langDir: 'events' | 'en/events' = 'events'): string {
    const dir = join(dist, langDir, slug);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'index.html');
    writeFileSync(path, '<html></html>');
    return path;
  }

  function writeApiJson(name: string): string {
    const path = join(dist, 'api', `${name}.json`);
    writeFileSync(path, '{}');
    return path;
  }

  function writeFile(relPath: string): string {
    const path = join(dist, relPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'x');
    return path;
  }

  function setMtime(path: string, mtimeMs: number): void {
    const sec = mtimeMs / 1000;
    utimesSync(path, sec, sec);
  }

  function buildStart(): number {
    // Pick a build start that's in the future relative to fixture mtime
    // so any "old" file (default mtime ≈ now) is older than buildStart.
    return Date.now() + 60_000;
  }

  // --- 6. event HTML in validSlugs is kept regardless of OLD mtime ---
  test('event HTML in validSlugs is kept (false-positive protection)', () => {
    const path = writeEventHtml('valid-slug');
    setMtime(path, Date.now() - 300_000); // very old
    const result = sweepOrphans({
      distDir: dist,
      validEventSlugs: new Set(['valid-slug']),
      buildStartTime: buildStart(),
      armNonEvent: true, // even with non-event arm, slug-membership protects
    });
    expect(existsSync(path)).toBe(true);
    expect(result.eventOrphansSwept).toBe(0);
  });

  // --- 7. event HTML NOT in validSlugs is swept (arm-by-default) + parent prune ---
  test('event HTML not in validSlugs is swept; parent dir pruned; PROTECTED_ROOT preserved', () => {
    const path = writeEventHtml('orphan-slug');
    setMtime(path, Date.now() + 60_000); // NEW mtime — irrelevant for event-html
    const slugDir = dirname(path);
    const eventsRoot = join(dist, 'events');

    const result = sweepOrphans({
      distDir: dist,
      validEventSlugs: new Set(['some-other-slug']),
      buildStartTime: buildStart(),
      armNonEvent: false, // arm-by-default still applies for event paths
    });

    expect(existsSync(path)).toBe(false); // file unlinked
    expect(existsSync(slugDir)).toBe(false); // empty parent pruned
    expect(existsSync(eventsRoot)).toBe(true); // PROTECTED_ROOT preserved
    expect(result.eventOrphansSwept).toBe(1);
  });

  // --- 8. event JSON in validSlugs is kept regardless of OLD mtime ---
  test('event API JSON in validSlugs is kept (false-positive protection)', () => {
    const path = writeApiJson('valid-slug');
    setMtime(path, Date.now() - 300_000);
    sweepOrphans({
      distDir: dist,
      validEventSlugs: new Set(['valid-slug']),
      buildStartTime: buildStart(),
      armNonEvent: true,
    });
    expect(existsSync(path)).toBe(true);
  });

  // --- 9. event JSON NOT in validSlugs falls through to mtime; armNonEvent=false → flagged not swept ---
  test('event API JSON not in validSlugs + old mtime + armNonEvent=false → flagged not swept', () => {
    const path = writeApiJson('orphan-event-slug');
    setMtime(path, Date.now() - 300_000); // old
    const result = sweepOrphans({
      distDir: dist,
      validEventSlugs: new Set(['other']),
      buildStartTime: buildStart(),
      armNonEvent: false,
    });
    expect(existsSync(path)).toBe(true); // not swept (dry run for non-event)
    expect(result.mtimeOrphansFlagged).toBe(1);
    expect(result.mtimeOrphansSwept).toBe(0);
  });

  // --- 10. event JSON NOT in validSlugs + old mtime + armNonEvent=true → swept ---
  test('event API JSON not in validSlugs + old mtime + armNonEvent=true → swept', () => {
    const path = writeApiJson('orphan-event-slug');
    setMtime(path, Date.now() - 300_000);
    const result = sweepOrphans({
      distDir: dist,
      validEventSlugs: new Set(['other']),
      buildStartTime: buildStart(),
      armNonEvent: true,
    });
    expect(existsSync(path)).toBe(false);
    expect(result.mtimeOrphansSwept).toBe(1);
  });

  // --- 11. category JSON not in validSlugs + NEW mtime → kept (mtime fallback passes) ---
  test('category-aggregation JSON with current mtime is kept under mtime fallback', () => {
    const path = writeApiJson('dj_set-this-week');
    setMtime(path, Date.now() + 120_000); // newer than buildStart
    const start = buildStart();
    const result = sweepOrphans({
      distDir: dist,
      validEventSlugs: new Set(),
      buildStartTime: start,
      armNonEvent: true, // even when armed, current-mtime files are kept
    });
    expect(existsSync(path)).toBe(true);
    expect(result.mtimeOrphansSwept).toBe(0);
  });

  // --- 12. non-event HTML (homepage) + old mtime + armNonEvent=true → swept (mtime path) ---
  test('non-event HTML (homepage) with old mtime + armNonEvent=true is swept', () => {
    const path = writeFile('index.html');
    setMtime(path, Date.now() - 300_000);
    const result = sweepOrphans({
      distDir: dist,
      validEventSlugs: new Set(),
      buildStartTime: buildStart(),
      armNonEvent: true,
    });
    expect(existsSync(path)).toBe(false);
    expect(result.mtimeOrphansSwept).toBe(1);
  });

  // --- 13. en/events HTML not in validSlugs is swept (English mirror coverage) ---
  test('English-mirror en/events HTML not in validSlugs is swept', () => {
    const path = writeEventHtml('orphan-en-slug', 'en/events');
    setMtime(path, Date.now() + 60_000);
    const result = sweepOrphans({
      distDir: dist,
      validEventSlugs: new Set(['something-else']),
      buildStartTime: buildStart(),
      armNonEvent: false,
    });
    expect(existsSync(path)).toBe(false);
    expect(result.eventOrphansSwept).toBe(1);
  });

  // --- 14. idempotency: second invocation sweeps 0 ---
  test('idempotent: second consecutive invocation sweeps 0 event orphans', () => {
    writeEventHtml('orphan-1');
    writeEventHtml('orphan-2', 'en/events');

    const opts = {
      distDir: dist,
      validEventSlugs: new Set<string>(),
      buildStartTime: buildStart(),
      armNonEvent: false,
    };
    const first = sweepOrphans(opts);
    expect(first.eventOrphansSwept).toBe(2);

    const second = sweepOrphans(opts);
    expect(second.eventOrphansSwept).toBe(0);
    expect(second.mtimeOrphansFlagged).toBe(0);
    expect(second.mtimeOrphansSwept).toBe(0);
  });
});
