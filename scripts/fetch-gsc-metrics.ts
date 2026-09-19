#!/usr/bin/env bun
/**
 * Read-only Search Console measurement for the daily visibility monitor.
 * Usage: bun run scripts/fetch-gsc-metrics.ts [--output=/path/gsc.json] [--credentials=/path/key.json]
 *
 * Totals are property aggregates, not sums of query rows (which omit data).
 * top10_count_7d counts OBSERVED queries with impressions and average position
 * <=10; anonymized/omitted queries are not included. It is not an indexed-page
 * count or a complete keyword census. API dates are Pacific calendar dates;
 * the collection timestamp and monitor's daily row use Europe/Athens.
 * Passive monitoring only: no indexing requests, submission, or active alerts.
 * Sources: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 * https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data
 */
import { createSign } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { DateTime } from 'luxon';

const SITE = 'sc-domain:agentathens.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const QUERY_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
const DEFAULT_CREDENTIALS = join(homedir(), '.config/agentathens/gcp-kpi-reader.json');
const DEFAULT_OUTPUT = join(import.meta.dir, '../logs/gsc-latest.json');
const ATHENS = 'Europe/Athens';
const API_TIMEZONE = 'America/Los_Angeles';
const ROW_LIMIT = 25000;
// Seven days expose at most 7 * 50K rows. One extra page detects exhaustion.
const MAX_QUERY_PAGES = 15;
const MAX_FINAL_LAG_DAYS = 4;

type Status = 'ok' | 'empty' | 'stale' | 'auth_fail' | 'missing_credentials';
export interface GscAggregate {
  impressions_7d: number;
  clicks_7d: number;
  avg_position_7d: number;
  top10_count_7d: number;
}
export interface GscFetchResult {
  timestamp: string;
  status: Status;
  reason: string;
  site: string;
  period: { start_date: string; end_date: string; timezone: string; data_state: 'final' } | null;
  aggregate: GscAggregate | null;
  query_coverage: {
    rows_returned: number;
    truncated: boolean;
    semantics: 'observed_queries_with_average_position_lte_10';
  } | null;
}
export interface GscOptions {
  credentialsPath?: string;
  now?: DateTime;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  outputPath?: string;
}
export interface GscMetricsRow {
  impressions: number | string;
  clicks: number | string;
  avgPosition: number | string;
  top10: number | string;
}
interface Row { clicks: number; impressions: number; position: number; keys?: string[] }
class CollectionError extends Error {
  constructor(readonly status: Status, readonly reason: string) { super(reason); }
}
const invalidResponse = () => new CollectionError('stale', 'invalid_response');
const finiteNonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

function rowsFrom(body: unknown): Row[] {
  if (!body || typeof body !== 'object' || Array.isArray(body) || 'error' in body) throw invalidResponse();
  const rows = (body as { rows?: unknown }).rows;
  // The API legitimately omits rows for a successful response with no data.
  if (rows === undefined) return [];
  if (!Array.isArray(rows) || rows.some(r => !r || !finiteNonnegative(r.clicks) ||
    !finiteNonnegative(r.impressions) || !finiteNonnegative(r.position) || r.clicks > r.impressions ||
    (r.impressions > 0 && r.position < 1))) throw invalidResponse();
  return rows;
}

export async function fetchGscMetrics(options: GscOptions = {}): Promise<GscFetchResult> {
  const now = (options.now ?? DateTime.now()).setZone(ATHENS);
  const result: GscFetchResult = {
    timestamp: now.toISO()!, status: 'stale', reason: '', site: SITE,
    period: null, aggregate: null, query_coverage: null,
  };
  const timeoutMs = options.timeoutMs ?? 45000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;

  async function requestJson(url: string, init: RequestInit, tokenRequest = false): Promise<any> {
    const requestController = new AbortController();
    const requestTimer = setTimeout(() => requestController.abort(), Math.min(timeoutMs, 10000));
    const signal = AbortSignal.any([controller.signal, requestController.signal]);
    try {
      const res = await fetchImpl(url, { ...init, signal });
      if (!res.ok) {
        const auth = res.status === 401 || res.status === 403 || (tokenRequest && res.status === 400);
        throw new CollectionError(auth ? 'auth_fail' : 'stale', `${tokenRequest ? 'token' : 'api'}_http_${res.status}`);
      }
      try { return await res.json(); } catch { throw invalidResponse(); }
    } catch (error) {
      if (signal.aborted) throw new CollectionError('stale', 'request_timeout');
      if (error instanceof CollectionError) throw error;
      // Network errors, API bodies and JWT/key parsing errors may contain secrets.
      throw new CollectionError('stale', 'request_failed');
    } finally { clearTimeout(requestTimer); }
  }

  try {
    const credentialsPath = options.credentialsPath ?? DEFAULT_CREDENTIALS;
    if (!existsSync(credentialsPath)) throw new CollectionError('missing_credentials', 'credentials_missing');
    let assertion: string;
    try {
      const sa = JSON.parse(readFileSync(credentialsPath, 'utf8'));
      if (typeof sa.client_email !== 'string' || !sa.client_email || typeof sa.private_key !== 'string') throw new Error();
      const iat = Math.floor(now.toSeconds());
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const claim = Buffer.from(JSON.stringify({
        iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        aud: TOKEN_URL, iat, exp: iat + 3600,
      })).toString('base64url');
      const signer = createSign('RSA-SHA256');
      signer.update(`${header}.${claim}`);
      assertion = `${header}.${claim}.${signer.sign(sa.private_key).toString('base64url')}`;
    } catch { throw new CollectionError('auth_fail', 'credentials_invalid'); }
    const token = await requestJson(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    }, true);
    if (typeof token?.access_token !== 'string' || !token.access_token) throw invalidResponse();
    async function query(body: Record<string, unknown>): Promise<Row[]> {
      return rowsFrom(await requestJson(QUERY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'web', aggregationType: 'byProperty', dataState: 'final', ...body }),
      }));
    }
    // Discover the latest available FINAL date instead of assuming Google's delay.
    const today = now.startOf('day');
    const discoveryStart = today.minus({ days: 10 }).toISODate()!;
    const discoveryEnd = today.minus({ days: 1 }).toISODate()!;
    const dates = await query({ startDate: discoveryStart, endDate: discoveryEnd, dimensions: ['date'], rowLimit: 10 });
    if (!dates.length) throw new CollectionError('empty', 'no_final_rows');
    const dateKeys = dates.map(r => {
      const date = r.keys?.[0];
      if (r.keys?.length !== 1 || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !DateTime.fromISO(date, { zone: API_TIMEZONE }).isValid || date < discoveryStart || date > discoveryEnd) throw invalidResponse();
      return date;
    });
    const endDate = dateKeys.sort().at(-1)!;
    const end = DateTime.fromISO(endDate, { zone: ATHENS });
    result.period = { start_date: end.minus({ days: 6 }).toISODate()!, end_date: endDate, timezone: API_TIMEZONE, data_state: 'final' };
    if (today.diff(end, 'days').days > MAX_FINAL_LAG_DAYS) throw new CollectionError('stale', 'final_data_delayed');
    const period = { startDate: result.period.start_date, endDate };
    const totals = await query(period);
    if (!totals.length) throw new CollectionError('empty', 'no_period_rows');
    if (totals.length !== 1) throw invalidResponse();
    if (totals[0].impressions === 0) throw new CollectionError('empty', 'no_period_impressions');

    let returned = 0;
    let top10 = 0;
    let truncated = true;
    for (let page = 0; page < MAX_QUERY_PAGES; page++) {
      const rows = await query({ ...period, dimensions: ['query'], rowLimit: ROW_LIMIT, startRow: page * ROW_LIMIT });
      if (rows.length > ROW_LIMIT || rows.some(r => r.keys?.length !== 1 || typeof r.keys[0] !== 'string')) throw invalidResponse();
      returned += rows.length;
      top10 += rows.filter(r => r.impressions > 0 && r.position <= 10).length;
      if (rows.length < ROW_LIMIT) { truncated = false; break; }
    }
    result.aggregate = {
      impressions_7d: totals[0].impressions, clicks_7d: totals[0].clicks,
      avg_position_7d: totals[0].position, top10_count_7d: top10,
    };
    result.query_coverage = { rows_returned: returned, truncated, semantics: 'observed_queries_with_average_position_lte_10' };
    result.status = 'ok';
    result.reason = 'final_period_collected';
  } catch (error) {
    result.status = error instanceof CollectionError ? error.status : 'stale';
    result.reason = error instanceof CollectionError ? error.reason : 'collection_failed';
    result.aggregate = null;
    result.query_coverage = null;
  } finally { clearTimeout(timer); }
  return result;
}

export async function collectGscMetrics(options: GscOptions = {}): Promise<GscFetchResult> {
  const result = await fetchGscMetrics(options);
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT;
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    const temp = `${outputPath}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(result, null, 2) + '\n');
    renameSync(temp, outputPath);
  } catch { throw new Error('GSC snapshot write failed; check the output directory permissions and retry.'); }
  return result;
}

/** Never treat a recent retrieval timestamp as proof that the underlying data is current. */
export function gscMetricsRow(value: unknown, now: DateTime = DateTime.now()): GscMetricsRow {
  const marked = (marker: string): GscMetricsRow => ({ impressions: marker, clicks: marker, avgPosition: marker, top10: marker });
  if (!value || typeof value !== 'object') return marked('STALE');
  const result = value as GscFetchResult;
  const timestamp = typeof result.timestamp === 'string' ? DateTime.fromISO(result.timestamp) : DateTime.invalid('missing');
  const ageHours = now.diff(timestamp, 'hours').hours;
  if (!timestamp.isValid || ageHours < 0 || ageHours > 25) return marked('STALE');
  if (result.status === 'auth_fail') return marked('AUTH_FAIL');
  if (result.status === 'missing_credentials') return marked('MISSING_CREDENTIALS');
  if (result.status === 'empty') return marked('NO_DATA');
  if (result.status !== 'ok' || !result.aggregate || result.site !== SITE) return marked('STALE');
  if (typeof result.period?.end_date !== 'string' || typeof result.period.start_date !== 'string') return marked('STALE');
  const end = DateTime.fromISO(result.period.end_date, { zone: ATHENS });
  const ageDays = end ? now.setZone(ATHENS).startOf('day').diff(end, 'days').days : NaN;
  const agg = result.aggregate;
  if (!end?.isValid || ageDays < 1 || ageDays > MAX_FINAL_LAG_DAYS ||
    result.period.data_state !== 'final' || result.period.timezone !== API_TIMEZONE ||
    result.period.start_date !== end.minus({ days: 6 }).toISODate() ||
    agg.impressions_7d <= 0 || agg.avg_position_7d < 1 || agg.clicks_7d > agg.impressions_7d ||
    !Object.values(agg).every(finiteNonnegative) ||
    !finiteNonnegative(agg.impressions_7d) || !finiteNonnegative(agg.clicks_7d) ||
    !finiteNonnegative(agg.avg_position_7d) || !finiteNonnegative(agg.top10_count_7d)) return marked('STALE');
  return { impressions: agg.impressions_7d, clicks: agg.clicks_7d, avgPosition: agg.avg_position_7d, top10: agg.top10_count_7d };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some(a => !/^--(?:output|credentials)=.+$/.test(a))) {
    console.error('Usage: bun run scripts/fetch-gsc-metrics.ts [--output=/path/gsc.json] [--credentials=/path/key.json]');
    process.exitCode = 1;
  } else {
    try {
      const result = await collectGscMetrics({
        outputPath: args.find(a => a.startsWith('--output='))?.slice('--output='.length),
        credentialsPath: args.find(a => a.startsWith('--credentials='))?.slice('--credentials='.length),
      });
      console.log(`[gsc-metrics] status=${result.status} reason=${result.reason} period=${result.period?.start_date ?? '?'}..${result.period?.end_date ?? '?'} aggregate=${JSON.stringify(result.aggregate)}`);
      if (result.status !== 'ok' && result.status !== 'empty') {
        console.error('[gsc-metrics] Check service-account property access, credentials and network connectivity; then retry.');
        process.exitCode = 1;
      }
    } catch {
      console.error('[gsc-metrics] Could not write snapshot; check the output directory permissions and retry.');
      process.exitCode = 1;
    }
  }
}
