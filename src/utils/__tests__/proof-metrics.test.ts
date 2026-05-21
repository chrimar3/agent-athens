import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { proofMetrics } from '../proof-metrics';

const PROJECT_DIR = join(import.meta.dir, '..', '..', '..');
const SRC_FILE = join(import.meta.dir, '..', 'proof-metrics.ts');

function mkFixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'proof-metrics-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

describe('proofMetrics()', () => {
  test('eventCount mirrors the passed pageableCount arg (not a hardcoded literal)', () => {
    const result = proofMetrics({ pageableCount: 9999, dataDir: mkFixtureDir({}) });
    expect(result.eventCount).toBe(9999);

    const result2 = proofMetrics({ pageableCount: 1, dataDir: mkFixtureDir({}) });
    expect(result2.eventCount).toBe(1);
  });

  test('drift guard: implementation source contains no hardcoded credibility numbers', () => {
    // Reads the .ts source itself, not data/test-summary.json. 2380 legitimately
    // lives in the JSON artifact — that's the whole point of the snapshot — and
    // triggering on it would defeat the test.
    const src = readFileSync(SRC_FILE, 'utf-8');
    for (const banned of ['2730', '2380', '3280']) {
      expect(src.includes(banned)).toBe(false);
    }
  });

  test('reads schema.validatedAt from build-completeness.json#meta.lastUpdate', () => {
    const dir = mkFixtureDir({
      'build-completeness.json': JSON.stringify({
        meta: { lastUpdate: '2026-05-22T00:00:00.000Z' },
        events: { byType: [] },
        hubs: { fail: 0 },
        venues: { fail: 0 },
        aria: {},
        place: {},
      }),
    });
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.schema.validatedAt).toBe('2026-05-22T00:00:00.000Z');
  });

  test('passClean = true when all grounded fail aggregates are zero', () => {
    const dir = mkFixtureDir({
      'build-completeness.json': JSON.stringify({
        meta: { lastUpdate: '2026-05-22T00:00:00.000Z' },
        events: {
          byType: [
            { type: 'concert', fail: 0, warn: 0 },
            { type: 'dj_set', fail: 0, warn: 4 }, // warns allowed
          ],
        },
        hubs: { fail: 0 },
        venues: { fail: 0 },
        aria: {
          hub_template: { fail: 0 },
          event_template: { fail: 0 },
        },
        place: {
          venue_template: { fail: 0 },
          event_template: { fail: 0 },
        },
      }),
    });
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.schema.passClean).toBe(true);
  });

  test('passClean = false when any grounded fail aggregate is nonzero (incl. aria)', () => {
    const dir = mkFixtureDir({
      'build-completeness.json': JSON.stringify({
        meta: { lastUpdate: '2026-05-22T00:00:00.000Z' },
        events: { byType: [{ type: 'concert', fail: 0 }] },
        hubs: { fail: 0 },
        venues: { fail: 0 },
        aria: {
          hub_template: { fail: 2 }, // <— the real-world signal today
          event_template: { fail: 0 },
        },
        place: {
          venue_template: { fail: 0 },
          event_template: { fail: 0 },
        },
      }),
    });
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.schema.passClean).toBe(false);
  });

  test('passClean = false when an event byType has fails', () => {
    const dir = mkFixtureDir({
      'build-completeness.json': JSON.stringify({
        meta: { lastUpdate: '2026-05-22T00:00:00.000Z' },
        events: { byType: [{ type: 'concert', fail: 3 }] },
        hubs: { fail: 0 },
        venues: { fail: 0 },
        aria: { hub_template: { fail: 0 }, event_template: { fail: 0 } },
        place: { venue_template: { fail: 0 }, event_template: { fail: 0 } },
      }),
    });
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.schema.passClean).toBe(false);
  });

  test('reads test summary fields from test-summary.json', () => {
    const dir = mkFixtureDir({
      'test-summary.json': JSON.stringify({
        pass: 100, skip: 2, fail: 0, expects: 500, files: 10, ranAt: '2026-05-22T00:00:00+03:00',
      }),
    });
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.tests).toEqual({
      pass: 100, skip: 2, fail: 0, expects: 500, files: 10, ranAt: '2026-05-22T00:00:00+03:00',
    });
  });

  test("honest-absence: missing test-summary.json → tests is '—'", () => {
    const dir = mkFixtureDir({}); // no files
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.tests).toBe('—');
  });

  test("honest-absence: missing build-completeness.json → schema = { passClean: null, validatedAt: '—' }", () => {
    const dir = mkFixtureDir({}); // no files
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.schema).toEqual({ passClean: null, validatedAt: '—' });
  });

  // Invariant lock: proofMetrics reads .fail aggregates exclusively, never the
  // layers block. A stale aria_level flag must NOT flip passClean false when
  // the underlying fail counts are zero. Without this guard, the freshness gate
  // could silently mask the truth proofMetrics is designed to surface.
  test("layers.aria_level === 'stale' does NOT affect passClean when all .fail counts are zero", () => {
    const dir = mkFixtureDir({
      'build-completeness.json': JSON.stringify({
        meta: { lastUpdate: '2026-05-22T00:00:00.000Z' },
        layers: {
          event_level: 'measured',
          offer_level: 'measured',
          place_level: 'measured',
          aria_level: 'stale',          // <— the freshness gate's signal
          datafeed_level: 'measured',
        },
        events: { byType: [{ type: 'concert', fail: 0 }] },
        hubs: { fail: 0 },
        venues: { fail: 0 },
        aria: {
          hub_template: { fail: 0 },
          event_template: { fail: 0 },
        },
        place: {
          venue_template: { fail: 0 },
          event_template: { fail: 0 },
        },
      }),
    });
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.schema.passClean).toBe(true);
  });

  test('reads bing 7d indexing row from search-visibility-log.csv', () => {
    const csv =
      'date,sitemap_events,sitemap_venues,sitemap_editorial,sitemap_total,indexnow_submitted,indexnow_success,indexnow_batches,indexnow_last_run,robots_http,sitemap_http,llms_http,sample_accessible,sample_size,gsc_indexed,bing_indexed,gsc_impressions_7d,gsc_clicks_7d,gsc_avg_position_7d,gsc_top10_count_7d,bing_impressions_7d,bing_clicks_7d,bing_avg_position_7d,bing_top10_count_7d,enriched_last_24h,wrapper_discrepancy_last_24h,notes\n' +
      '2026-05-21,3873,38,1210,5121,3940,3940,1,2026-05-20T09:44:59.684Z,200,200,200,9,10,,,STALE,STALE,STALE,STALE,21,0,9.761904761904763,2,13,0,\n';
    const dir = mkFixtureDir({ 'search-visibility-log.csv': csv });
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.indexing).not.toBe('—');
    if (result.indexing !== '—') {
      expect(result.indexing.bing_impressions_7d).toBe(21);
      expect(result.indexing.bing_clicks_7d).toBe(0);
      expect(result.indexing.bing_avg_position_7d).toBeCloseTo(9.76, 1);
      expect(result.indexing.bing_top10_count_7d).toBe(2);
      expect(result.indexing.date).toBe('2026-05-21');
    }
  });

  test("honest-absence: missing search-visibility-log.csv → indexing is '—'", () => {
    const dir = mkFixtureDir({});
    const result = proofMetrics({ pageableCount: 1, dataDir: dir });
    expect(result.indexing).toBe('—');
  });
});
