import { test, expect, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DateTime } from 'luxon';
import { fetchBingMetrics } from '../scripts/fetch-bing-metrics';
import { getBingMetrics } from '../scripts/monitor-search-visibility';
import { proofMetrics } from '../src/utils/proof-metrics';
const dir = mkdtempSync(join(tmpdir(), 'measurement-integrity-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const now = DateTime.fromISO('2026-09-20T12:00:00+03:00');
const aggregate = { impressions_7d: 10, clicks_7d: 1, avg_position_7d: 2, top10_count_7d: 1 };
for (const timestamp of ['2020-01-01T00:00:00Z', '2026-09-21T12:00:00Z', 'bad']) {
  test(`Bing rejects invalid snapshot time ${timestamp}`, () => {
    const path = join(dir, 'bing.json');
    writeFileSync(path, JSON.stringify({ timestamp, status: 'ok', aggregate }));
    expect(getBingMetrics(path, now).impressions).toBe('STALE');
  });
}
test('Bing rejects nonnumeric aggregate', () => {
  const path = join(dir, 'bing.json');
  writeFileSync(path, JSON.stringify({ timestamp: now.toISO(), status: 'ok', aggregate: { ...aggregate, impressions_7d: '10' } }));
  expect(getBingMetrics(path, now).impressions).toBe('STALE');
});
for (const body of [{ error: 'not statistics' }, { d: [{ Date: '/Date(1789894800000)/', Query: 'x', Impressions: -1, Clicks: 0, AvgImpressionPosition: 2 }] }]) {
  test('Bing malformed successful HTTP response is unavailable', async () => {
    const result = await fetchBingMetrics({ apiKey: 'fixture', now, fetchImpl: (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch });
    expect(result.status).toBe('stale');
  });
}
for (const body of ['{}', 'not JSON', '{"events":{"byType":{}}}']) {
  test(`Incomplete proof evidence is unknown: ${body}`, () => {
    writeFileSync(join(dir, 'build-completeness.json'), body);
    writeFileSync(join(dir, 'test-summary.json'), body);
    const result = proofMetrics({ pageableCount: 1, dataDir: dir, now });
    expect(result.schema.passClean).toBeNull();
    expect(result.tests).toBe('—');
  });
}
test('Proof does not describe old indexing data as the last seven days', () => {
  writeFileSync(join(dir, 'build-completeness.json'), '{}');
  writeFileSync(join(dir, 'test-summary.json'), '{}');
  writeFileSync(join(dir, 'search-visibility-log.csv'), 'date,bing_impressions_7d,bing_avg_position_7d,bing_top10_count_7d\n2026-05-21,21,9.76,2\n');
  expect(proofMetrics({ pageableCount: 1, dataDir: dir, now }).indexing).toBe('—');
});
test('Bing excludes future-dated statistics while retaining valid empty responses', async () => {
  const row = { Date: `/Date(${now.plus({ days: 1 }).toMillis()})/`, Query: 'https://example.test/', Impressions: 10, Clicks: 1, AvgImpressionPosition: 2 };
  const result = await fetchBingMetrics({ apiKey: 'fixture', now, fetchImpl: (async () => Response.json({ d: [row] })) as unknown as typeof fetch });
  expect(result.status).toBe('ok');
  expect(result.aggregate.impressions_7d).toBe(0);
  expect(result.aggregate.top10_count_7d).toBe(0);
});
test('Fresh valid Bing snapshot remains numeric', () => {
  const path = join(dir, 'bing.json');
  writeFileSync(path, JSON.stringify({ timestamp: now.toISO(), status: 'ok', aggregate }));
  expect(getBingMetrics(path, now).impressions).toBe(10);
});
test('Bing accepts the 25-hour boundary and preserves a fresh authentication failure', () => {
  const path = join(dir, 'bing.json');
  writeFileSync(path, JSON.stringify({ timestamp: now.minus({ hours: 25 }).toISO(), status: 'ok', aggregate }));
  expect(getBingMetrics(path, now).impressions).toBe(10);
  expect(getBingMetrics(path, now.plus({ milliseconds: 1 })).impressions).toBe('STALE');
  writeFileSync(path, JSON.stringify({ timestamp: now.toISO(), status: 'auth_fail', aggregate }));
  expect(getBingMetrics(path, now).impressions).toBe('AUTH_FAIL');
});
test('A known schema failure remains visible even when other evidence is absent', () => {
  writeFileSync(join(dir, 'build-completeness.json'), JSON.stringify({ hubs: { fail: 1 } }));
  expect(proofMetrics({ pageableCount: 1, dataDir: dir, now }).schema.passClean).toBe(false);
});
