import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DateTime } from 'luxon';
import { collectGscMetrics, fetchGscMetrics, gscMetricsRow } from '../../scripts/fetch-gsc-metrics';
import { refreshGscMetrics } from '../../scripts/monitor-search-visibility';

const NOW = DateTime.fromISO('2026-09-19T00:10:00', { zone: 'Europe/Athens' });
const key = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
let dir: string;
let credentialsPath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'athens-gsc-test-'));
  credentialsPath = join(dir, 'credentials.json');
  writeFileSync(credentialsPath, JSON.stringify({ client_email: 'fixture@example.invalid', private_key: key }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const row = (impressions: number, clicks: number, position: number, keys?: string[]) => ({ impressions, clicks, position, ctr: clicks / impressions, ...(keys ? { keys } : {}) });
function api(options: { dates?: unknown; total?: unknown; queries?: unknown[]; status?: number; tokenStatus?: number } = {}) {
  const requests: { url: string; body: any; signal: AbortSignal | null | undefined }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com')) {
      const jwt = new URLSearchParams(String(init?.body)).get('assertion')!;
      requests.push({ url, body: JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()), signal: init?.signal });
      return Response.json(options.tokenStatus ? { error: 'SECRET_MUST_NOT_APPEAR' } : { access_token: 'fixture-token' }, { status: options.tokenStatus ?? 200 });
    }
    const body = JSON.parse(String(init?.body));
    requests.push({ url, body, signal: init?.signal });
    if (options.status) return Response.json({ error: 'SECRET_MUST_NOT_APPEAR' }, { status: options.status });
    if (body.dimensions?.[0] === 'date') return Response.json(options.dates ?? { rows: [row(10, 2, 5, ['2026-09-15'])] });
    if (body.dimensions?.[0] === 'query') return Response.json(options.queries?.shift() ?? { rows: [row(5, 1, 5, ['one']), row(1, 0, 11, ['two'])] });
    return Response.json(options.total ?? { rows: [row(1074, 22, 7.460893854748603)] });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

describe('Search Console final-period collector', () => {
  test('uses read-only scope, final data, property totals and observed query rankings', async () => {
    const fake = api();
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: fake.fetchImpl });
    expect(result.status).toBe('ok');
    expect(result.period).toEqual({ start_date: '2026-09-09', end_date: '2026-09-15', timezone: 'America/Los_Angeles', data_state: 'final' });
    expect(result.aggregate).toEqual({ impressions_7d: 1074, clicks_7d: 22, avg_position_7d: 7.460893854748603, top10_count_7d: 1 });
    expect(result.query_coverage).toMatchObject({ rows_returned: 2, truncated: false, semantics: 'observed_queries_with_average_position_lte_10' });
    expect(fake.requests[0].body.scope).toBe('https://www.googleapis.com/auth/webmasters.readonly');
    expect(fake.requests.every(r => r.signal instanceof AbortSignal)).toBe(true);
    expect(fake.requests.slice(1).every(r => r.body.dataState === 'final' && r.body.type === 'web')).toBe(true);
    const total = fake.requests.find(r => r.body.startDate === '2026-09-09' && !r.body.dimensions);
    expect(total?.body.aggregationType).toBe('byProperty');
    expect(total?.url).toContain('sc-domain%3Aagentathens.com');
  });

  test('paginates query rows so rankings beyond the first page are included', async () => {
    const first = Array.from({ length: 25000 }, (_, i) => row(1, 0, 20, [`query-${i}`]));
    const fake = api({ queries: [{ rows: first }, { rows: [row(1, 0, 10, ['last'])] }] });
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: fake.fetchImpl });
    expect(result.aggregate?.top10_count_7d).toBe(1);
    expect(result.query_coverage?.rows_returned).toBe(25001);
    expect(fake.requests.filter(r => r.body.dimensions?.[0] === 'query').map(r => r.body.startRow)).toEqual([0, 25000]);
  });

  test('successful empty response is NO_DATA, never invented zero traffic', async () => {
    const fake = api({ dates: {} });
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: fake.fetchImpl });
    expect(result.status).toBe('empty');
    expect(result.aggregate).toBeNull();
    expect(gscMetricsRow(result, NOW)).toEqual({ impressions: 'NO_DATA', clicks: 'NO_DATA', avgPosition: 'NO_DATA', top10: 'NO_DATA' });
  });

  test('old final data remains stale even when just fetched', async () => {
    const fake = api({ dates: { rows: [row(10, 1, 5, ['2026-09-10'])] } });
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: fake.fetchImpl });
    expect(result.status).toBe('stale');
    expect(result.reason).toBe('final_data_delayed');
    expect(gscMetricsRow(result, NOW).impressions).toBe('STALE');
  });

  test('missing credentials remains distinct and performs no request', async () => {
    const fake = api();
    const result = await fetchGscMetrics({ credentialsPath: join(dir, 'absent'), now: NOW, fetchImpl: fake.fetchImpl });
    expect(result.status).toBe('missing_credentials');
    expect(fake.requests.length).toBe(0);
    expect(gscMetricsRow(result, NOW).clicks).toBe('MISSING_CREDENTIALS');
  });

  for (const status of [401, 403, 503]) {
    test(`API HTTP ${status} is truthful and never exposes server response content`, async () => {
      const fake = api({ status });
      const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: fake.fetchImpl });
      expect(result.status).toBe(status === 503 ? 'stale' : 'auth_fail');
      expect(result.aggregate).toBeNull();
      expect(JSON.stringify(result)).not.toContain('SECRET_MUST_NOT_APPEAR');
    });
  }

  test('token rejection is AUTH_FAIL without secret-bearing error details', async () => {
    const fake = api({ tokenStatus: 400 });
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: fake.fetchImpl });
    expect(result.status).toBe('auth_fail');
    expect(JSON.stringify(result)).not.toContain('SECRET_MUST_NOT_APPEAR');
  });

  test('malformed rows cannot turn into healthy numbers', async () => {
    const fake = api({ total: { rows: [{ clicks: 2, impressions: 'not numeric', position: 5 }] } });
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: fake.fetchImpl });
    expect(result.status).toBe('stale');
    expect(result.reason).toBe('invalid_response');
  });

  test('aborted network calls produce a sanitized stale result', async () => {
    const fetchImpl = ((_input: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('SECRET_MUST_NOT_APPEAR')), { once: true });
    })) as typeof fetch;
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl, timeoutMs: 10 });
    expect(result.status).toBe('stale');
    expect(result.reason).toBe('request_timeout');
    expect(JSON.stringify(result)).not.toContain('SECRET_MUST_NOT_APPEAR');
  });

  test('stale, malformed and future-dated cached results never look healthy', async () => {
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: api().fetchImpl });
    expect(gscMetricsRow({ ...result, timestamp: NOW.minus({ hours: 26 }).toISO() }, NOW).impressions).toBe('STALE');
    expect(gscMetricsRow({ ...result, timestamp: 'garbage' }, NOW).impressions).toBe('STALE');
    expect(gscMetricsRow({ ...result, timestamp: NOW.plus({ hours: 2 }).toISO() }, NOW).impressions).toBe('STALE');
    expect(gscMetricsRow(undefined, NOW).impressions).toBe('STALE');
  });

  test('collector replaces a last-good snapshot on failure instead of passing it off as current', async () => {
    const outputPath = join(dir, 'logs/gsc-latest.json');
    await collectGscMetrics({ credentialsPath, outputPath, now: NOW, fetchImpl: api().fetchImpl });
    await collectGscMetrics({ credentialsPath, outputPath, now: NOW, fetchImpl: api({ status: 503 }).fetchImpl });
    const disk = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(disk.status).toBe('stale');
    expect(disk.aggregate).toBeNull();
  });

  test('scheduled monitor refresh collects, persists and maps real metrics without a separate job', async () => {
    const outputPath = join(dir, 'logs/gsc-latest.json');
    const result = await refreshGscMetrics({ credentialsPath, outputPath, now: NOW, fetchImpl: api().fetchImpl });
    expect(result.metrics).toEqual({ impressions: 1074, clicks: 22, avgPosition: 7.460893854748603, top10: 1 });
    expect(result.notes).toContain('gsc_period=2026-09-09..2026-09-15');
    expect(result.notes).toContain('observed_queries');
    expect(JSON.parse(readFileSync(outputPath, 'utf8')).status).toBe('ok');
  });
  test('zero-impression property response is empty rather than an invented ranking of zero', async () => {
    const fake = api({ total: { rows: [{ clicks: 0, impressions: 0, position: 0, ctr: 0 }] } });
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: fake.fetchImpl });
    expect(result.status).toBe('empty');
    expect(result.aggregate).toBeNull();
    expect(gscMetricsRow(result, NOW).avgPosition).toBe('NO_DATA');
  });

  test('a snapshot with a mismatched period or impossible position is rejected', async () => {
    const result = await fetchGscMetrics({ credentialsPath, now: NOW, fetchImpl: api().fetchImpl });
    expect(gscMetricsRow({ ...result, period: { ...result.period, start_date: '2026-01-01' } }, NOW).clicks).toBe('STALE');
    expect(gscMetricsRow({ ...result, aggregate: { ...result.aggregate, avg_position_7d: 0 } }, NOW).clicks).toBe('STALE');
    expect(gscMetricsRow({ ...result, period: { end_date: 42 } }, NOW).clicks).toBe('STALE');
  });

  test('snapshot write failure is marked stale by the monitor while other collection can continue', async () => {
    const blockedPath = join(dir, 'file');
    writeFileSync(blockedPath, 'existing file');
    const result = await refreshGscMetrics({ credentialsPath, outputPath: join(blockedPath, 'gsc.json'), now: NOW, fetchImpl: api().fetchImpl });
    expect(result.status).toBe('stale');
    expect(result.metrics.impressions).toBe('STALE');
    expect(result.notes).toContain('snapshot_write_failed');
  });

  test('standalone collector exits nonzero and writes explicit missing-credential state', () => {
    const output = join(dir, 'gsc.json');
    const processResult = Bun.spawnSync([process.execPath, join(import.meta.dir, '../../scripts/fetch-gsc-metrics.ts'), `--credentials=${join(dir, 'missing')}`, `--output=${output}`]);
    expect(processResult.exitCode).toBe(1);
    expect(processResult.stdout.toString()).toContain('missing_credentials');
    expect(processResult.stderr.toString()).toContain('retry');
    expect(JSON.parse(readFileSync(output, 'utf8')).aggregate).toBeNull();
  });

});
