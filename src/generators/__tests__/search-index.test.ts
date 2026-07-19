/**
 * search-index generator tests.
 *
 * ISOLATION (2026-07-19): these tests MUST NOT write to the real dist/.
 * Previously DIST_DIR pointed at `../../../dist` and generateSearchIndex had no
 * outDir parameter, so every run overwrote the production deploy artifact
 * dist/search-index.json with 4 fixture events. Confirmed live: a test run left
 * dist/search-index.json at 2 events ("Jazz Night at Half Note") while the
 * deployed site served 218 — the next deploy from that tree would have shipped a
 * 2-event site search. dist/ is gitignored, so the deploy gate's git-provenance
 * check cannot catch it.
 *
 * Convention (mirrors tests/preload/prod-db-guard.preload.ts): write to a temp
 * dir, never a real artifact path. `does not write to the real dist/` below
 * keeps this pinned — it fails if any test in this file regains dist/ access.
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, existsSync, readFileSync, rmSync, mkdtempSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { generateSearchIndex } from '../search-index';
import { sampleConcert, sampleFreeExhibition, allSampleEvents } from '../../../tests/fixtures/events';

/** Temp output dir — replaces the former `../../../dist`. */
let OUT_DIR: string;

/** The real artifact this suite must never touch. */
const REAL_DIST_INDEX = resolve(join(import.meta.dir, '../../../dist/search-index.json'));

/** Pre-suite fingerprint of the real artifact, captured before any generate call. */
let realIndexBefore: { existed: boolean; content: string; mtimeMs: number };

function readIndex(): any {
  return JSON.parse(readFileSync(join(OUT_DIR, 'search-index.json'), 'utf-8'));
}

describe('generateSearchIndex', () => {
  beforeAll(() => {
    realIndexBefore = existsSync(REAL_DIST_INDEX)
      ? {
          existed: true,
          content: readFileSync(REAL_DIST_INDEX, 'utf-8'),
          mtimeMs: statSync(REAL_DIST_INDEX).mtimeMs,
        }
      : { existed: false, content: '', mtimeMs: 0 };

    OUT_DIR = mkdtempSync(join(tmpdir(), 'search-index-test-'));
    mkdirSync(OUT_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(OUT_DIR, { recursive: true, force: true });
  });

  test('generates valid JSON index file', () => {
    generateSearchIndex(allSampleEvents, OUT_DIR);
    const indexPath = join(OUT_DIR, 'search-index.json');
    expect(existsSync(indexPath)).toBe(true);

    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    expect(index).toHaveProperty('events');
    expect(index).toHaveProperty('venues');
    expect(index).toHaveProperty('categories');
    expect(index).toHaveProperty('generated');
  });

  test('includes all events with required fields', () => {
    generateSearchIndex(allSampleEvents, OUT_DIR);
    const index = readIndex();

    expect(index.events).toHaveLength(allSampleEvents.length);

    const first = index.events[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('titleN');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('venue');
    expect(first).toHaveProperty('venueN');
    expect(first).toHaveProperty('date');
    expect(first).toHaveProperty('slug');
    expect(first).toHaveProperty('price');
  });

  test('titleN correctly strips Greek accents', () => {
    const greekEvent = {
      ...sampleConcert,
      id: 'greek-test-1',
      title: 'Μουσική Βραδιά',
    };
    generateSearchIndex([greekEvent], OUT_DIR);
    const index = readIndex();

    expect(index.events[0].titleN).toBe('μουσικη βραδια');
  });

  test('deduplicates venues by slug', () => {
    const event1 = { ...sampleConcert, id: 'test-1' };
    const event2 = {
      ...sampleConcert,
      id: 'test-2',
      title: 'Another Night',
      venue: { ...sampleConcert.venue }, // Same venue
    };
    generateSearchIndex([event1, event2], OUT_DIR);
    const index = readIndex();

    // Two events at Half Note Jazz Club should produce one venue record
    expect(index.venues.filter((v: any) => v.name === 'Half Note Jazz Club')).toHaveLength(1);
    expect(index.venues.find((v: any) => v.name === 'Half Note Jazz Club').eventCount).toBe(2);
  });

  test('categories include expected entries with counts', () => {
    generateSearchIndex(allSampleEvents, OUT_DIR);
    const index = readIndex();

    expect(index.categories.length).toBeGreaterThan(0);
    // All categories should have slug, title, titleN, count
    for (const cat of index.categories) {
      expect(cat).toHaveProperty('slug');
      expect(cat).toHaveProperty('title');
      expect(cat).toHaveProperty('titleN');
      expect(typeof cat.count).toBe('number');
    }
  });

  test('empty events array produces valid but empty index', () => {
    generateSearchIndex([], OUT_DIR);
    const index = readIndex();

    expect(index.events).toHaveLength(0);
    expect(index.venues).toHaveLength(0);
    // Categories still exist (from config) but with 0 counts
    expect(index.categories.length).toBeGreaterThan(0);
    for (const cat of index.categories) {
      expect(cat.count).toBe(0);
    }
  });

  test('price field maps correctly', () => {
    generateSearchIndex([sampleConcert, sampleFreeExhibition], OUT_DIR);
    const index = readIndex();

    const concert = index.events.find((e: any) => e.id === sampleConcert.id);
    const exhibition = index.events.find((e: any) => e.id === sampleFreeExhibition.id);
    expect(concert.price).toBe('with-ticket');
    expect(exhibition.price).toBe('open');
  });

  /**
   * THE PIN. Every test above has now run and called generateSearchIndex.
   * If any of them reaches the real dist/, this fails.
   *
   * Precondition-asserted so it cannot go vacuous: OUT_DIR must actually hold a
   * generated index, proving the suite really exercised the generator rather
   * than silently no-opping (the failure mode that let the original bug hide).
   */
  test('does not write to the real dist/', () => {
    // Precondition: the suite genuinely generated something, somewhere.
    expect(existsSync(join(OUT_DIR, 'search-index.json'))).toBe(true);
    expect(resolve(OUT_DIR)).not.toBe(resolve(join(import.meta.dir, '../../../dist')));

    // The real artifact must be byte-identical to its pre-suite state.
    if (realIndexBefore.existed) {
      expect(existsSync(REAL_DIST_INDEX)).toBe(true);
      expect(readFileSync(REAL_DIST_INDEX, 'utf-8')).toBe(realIndexBefore.content);
      expect(statSync(REAL_DIST_INDEX).mtimeMs).toBe(realIndexBefore.mtimeMs);
    } else {
      // Absent before ⟹ must still be absent; the suite must not create it.
      expect(existsSync(REAL_DIST_INDEX)).toBe(false);
    }
  });
});
