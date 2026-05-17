import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DateTime } from 'luxon';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  fetchBingMetrics,
  loadApiKey,
  parseBingDate,
  type BingAggregate,
} from '../../scripts/fetch-bing-metrics';

const NOW = DateTime.fromISO('2026-05-17T12:00:00', { zone: 'Europe/Athens' });
const TMP = join(import.meta.dir, 'tmp-bing');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function bingDate(daysAgo: number): string {
  const d = NOW.minus({ days: daysAgo });
  return `/Date(${d.toMillis()}-0700)/`;
}

function makeFetch(responses: Record<string, { status: number; body: unknown }>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    const endpoint = new URL(urlStr).pathname.split('/').pop() ?? '';
    const r = responses[endpoint];
    if (!r) {
      return new Response(JSON.stringify({ error: 'not stubbed' }), { status: 404 });
    }
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
}

describe('parseBingDate', () => {
  test('parses /Date(epoch-tz)/ format', () => {
    const parsed = parseBingDate('/Date(1778223600000-0700)/');
    expect(parsed).not.toBeNull();
    expect(parsed!.toMillis()).toBe(1778223600000);
  });

  test('returns null for malformed input', () => {
    expect(parseBingDate('not a date')).toBeNull();
    expect(parseBingDate('')).toBeNull();
  });
});

describe('loadApiKey', () => {
  test('reads non-empty key file', async () => {
    const p = join(TMP, 'key');
    writeFileSync(p, 'TESTKEY123\n');
    const key = await loadApiKey(p);
    expect(key).toBe('TESTKEY123');
  });

  test('throws on missing key file', async () => {
    expect(loadApiKey(join(TMP, 'absent'))).rejects.toThrow(/bing-api-key|absent/i);
  });

  test('throws on empty key file', async () => {
    const p = join(TMP, 'empty');
    writeFileSync(p, '');
    expect(loadApiKey(p)).rejects.toThrow(/empty/i);
  });
});

describe('fetchBingMetrics', () => {
  test('happy path → status=ok, all metrics populated', async () => {
    const fetchImpl = makeFetch({
      GetQueryStats: {
        status: 200,
        body: {
          d: [
            { Date: bingDate(2), Query: 'q1', Impressions: 10, Clicks: 1, AvgImpressionPosition: 5 },
            { Date: bingDate(4), Query: 'q2', Impressions: 20, Clicks: 2, AvgImpressionPosition: 8 },
          ],
        },
      },
      GetPageStats: {
        status: 200,
        body: {
          d: [
            { Date: bingDate(1), Query: 'https://agentathens.com/', Impressions: 30, Clicks: 3, AvgImpressionPosition: 5 },
            { Date: bingDate(3), Query: 'https://agentathens.com/this-weekend/', Impressions: 10, Clicks: 0, AvgImpressionPosition: 12 },
          ],
        },
      },
    });

    const result = await fetchBingMetrics({ apiKey: 'k', now: NOW, fetchImpl });
    expect(result.status).toBe('ok');
    expect(result.aggregate.impressions_7d).toBe(30); // 10 + 20 from query stats
    expect(result.aggregate.clicks_7d).toBe(3); // 1 + 2 from query stats
    // weighted avg position: (10*5 + 20*8) / (10+20) = 210/30 = 7
    expect(result.aggregate.avg_position_7d).toBe(7);
    // top10 count: pages with position ≤ 10 → just the homepage row (pos=5)
    expect(result.aggregate.top10_count_7d).toBe(1);
  });

  test('transient 5xx → status=stale, last-good preserved', async () => {
    const fetchImpl = makeFetch({
      GetQueryStats: { status: 503, body: { error: 'service unavailable' } },
      GetPageStats: { status: 503, body: { error: 'service unavailable' } },
    });
    const lastGood: BingAggregate = {
      impressions_7d: 100, clicks_7d: 10, avg_position_7d: 4.5, top10_count_7d: 7,
    };
    const result = await fetchBingMetrics({ apiKey: 'k', now: NOW, fetchImpl, lastGood });
    expect(result.status).toBe('stale');
    expect(result.aggregate).toEqual(lastGood);
  });

  test('persistent 401 → status=auth_fail (distinct from stale)', async () => {
    const fetchImpl = makeFetch({
      GetQueryStats: { status: 401, body: { error: 'unauthorized' } },
    });
    const result = await fetchBingMetrics({ apiKey: 'bad', now: NOW, fetchImpl });
    expect(result.status).toBe('auth_fail');
  });

  test('empty corpus → status=ok, zeros', async () => {
    const fetchImpl = makeFetch({
      GetQueryStats: { status: 200, body: { d: [] } },
      GetPageStats: { status: 200, body: { d: [] } },
    });
    const result = await fetchBingMetrics({ apiKey: 'k', now: NOW, fetchImpl });
    expect(result.status).toBe('ok');
    expect(result.aggregate.impressions_7d).toBe(0);
    expect(result.aggregate.clicks_7d).toBe(0);
    expect(result.aggregate.avg_position_7d).toBe(0);
    expect(result.aggregate.top10_count_7d).toBe(0);
  });

  test('top10_count derivation: pages at positions 1, 5, 8, 11, 50 → count=3', async () => {
    const fetchImpl = makeFetch({
      GetQueryStats: { status: 200, body: { d: [] } },
      GetPageStats: {
        status: 200,
        body: {
          d: [
            { Date: bingDate(1), Query: 'https://agentathens.com/a', Impressions: 1, Clicks: 0, AvgImpressionPosition: 1 },
            { Date: bingDate(1), Query: 'https://agentathens.com/b', Impressions: 1, Clicks: 0, AvgImpressionPosition: 5 },
            { Date: bingDate(1), Query: 'https://agentathens.com/c', Impressions: 1, Clicks: 0, AvgImpressionPosition: 8 },
            { Date: bingDate(1), Query: 'https://agentathens.com/d', Impressions: 1, Clicks: 0, AvgImpressionPosition: 11 },
            { Date: bingDate(1), Query: 'https://agentathens.com/e', Impressions: 1, Clicks: 0, AvgImpressionPosition: 50 },
          ],
        },
      },
    });
    const result = await fetchBingMetrics({ apiKey: 'k', now: NOW, fetchImpl });
    expect(result.aggregate.top10_count_7d).toBe(3);
  });

  test('rows outside 7d window are excluded', async () => {
    const fetchImpl = makeFetch({
      GetQueryStats: {
        status: 200,
        body: {
          d: [
            { Date: bingDate(2), Query: 'recent', Impressions: 100, Clicks: 10, AvgImpressionPosition: 5 },
            { Date: bingDate(20), Query: 'old', Impressions: 999, Clicks: 99, AvgImpressionPosition: 99 },
          ],
        },
      },
      GetPageStats: { status: 200, body: { d: [] } },
    });
    const result = await fetchBingMetrics({ apiKey: 'k', now: NOW, fetchImpl });
    expect(result.aggregate.impressions_7d).toBe(100);
    expect(result.aggregate.clicks_7d).toBe(10);
  });

  test('distinct pages dedup in top10 count', async () => {
    const fetchImpl = makeFetch({
      GetQueryStats: { status: 200, body: { d: [] } },
      GetPageStats: {
        status: 200,
        body: {
          d: [
            { Date: bingDate(1), Query: 'https://agentathens.com/a', Impressions: 1, Clicks: 0, AvgImpressionPosition: 5 },
            { Date: bingDate(2), Query: 'https://agentathens.com/a', Impressions: 1, Clicks: 0, AvgImpressionPosition: 3 },
            { Date: bingDate(3), Query: 'https://agentathens.com/b', Impressions: 1, Clicks: 0, AvgImpressionPosition: 7 },
          ],
        },
      },
    });
    const result = await fetchBingMetrics({ apiKey: 'k', now: NOW, fetchImpl });
    expect(result.aggregate.top10_count_7d).toBe(2); // a and b distinct, despite a appearing twice
  });
});
