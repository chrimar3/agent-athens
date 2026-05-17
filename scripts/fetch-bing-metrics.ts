#!/usr/bin/env bun

// Bing Webmaster API fetcher. Writes logs/bing-latest.json with 7d-window aggregates
// (impressions, clicks, avg position, top10 count). Status: ok | stale | auth_fail.
// Consumed by scripts/monitor-search-visibility.ts to populate the 4 bing_*_7d CSV cols.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { DateTime } from 'luxon';
import { ATHENS_TZ } from '../src/utils/format-date';

const PROJECT_DIR = join(import.meta.dir, '..');
const DEFAULT_KEY_PATH = join(homedir(), '.config/agentathens/bing-api-key');
const DEFAULT_LOG_PATH = join(PROJECT_DIR, 'logs/bing-latest.json');
const BING_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const DEFAULT_SITE = 'https://agentathens.com/';
const TIMEOUT_MS = 30000;

export interface BingAggregate {
  impressions_7d: number;
  clicks_7d: number;
  avg_position_7d: number;
  top10_count_7d: number;
}

export interface BingFetchResult {
  timestamp: string;
  status: 'ok' | 'stale' | 'auth_fail';
  aggregate: BingAggregate;
}

const ZERO: BingAggregate = {
  impressions_7d: 0,
  clicks_7d: 0,
  avg_position_7d: 0,
  top10_count_7d: 0,
};

export function parseBingDate(s: string): DateTime | null {
  // Bing returns .NET WCF format: /Date(epoch_msec±tzoffset)/
  const m = s.match(/\/Date\((-?\d+)[-+]?\d*\)\//);
  if (!m) return null;
  const dt = DateTime.fromMillis(parseInt(m[1], 10));
  return dt.isValid ? dt : null;
}

export async function loadApiKey(path: string): Promise<string> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new Error(`bing-api-key absent at ${path}: ${(err as Error).message}`);
  }
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`bing-api-key file is empty at ${path}`);
  return trimmed;
}

interface BingRow {
  Date?: string;
  Query?: string;
  Impressions?: number;
  Clicks?: number;
  AvgImpressionPosition?: number;
}

function unwrap(body: unknown): BingRow[] {
  if (body && typeof body === 'object' && 'd' in body) {
    const d = (body as { d: unknown }).d;
    if (Array.isArray(d)) return d as BingRow[];
    if (d && typeof d === 'object' && 'results' in d) {
      const r = (d as { results: unknown }).results;
      if (Array.isArray(r)) return r as BingRow[];
    }
  }
  return [];
}

function isAuthFail(status: number): boolean {
  return status === 401 || status === 403;
}

async function callEndpoint(
  endpoint: string,
  apiKey: string,
  siteUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ status: number; rows: BingRow[] }> {
  const url = new URL(`${BING_BASE}/${endpoint}`);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('siteUrl', siteUrl);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url.toString(), { signal: ac.signal });
    if (res.status !== 200) {
      return { status: res.status, rows: [] };
    }
    const body = await res.json();
    return { status: 200, rows: unwrap(body) };
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchOpts {
  apiKey: string;
  siteUrl?: string;
  now?: DateTime;
  fetchImpl?: typeof fetch;
  lastGood?: BingAggregate | null;
}

export async function fetchBingMetrics(opts: FetchOpts): Promise<BingFetchResult> {
  const siteUrl = opts.siteUrl ?? DEFAULT_SITE;
  const now = (opts.now ?? DateTime.now()).setZone(ATHENS_TZ);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cutoff = now.minus({ days: 7 }).toMillis();
  const ts = now.toISO() ?? new Date().toISOString();

  let qstats: { status: number; rows: BingRow[] };
  let pstats: { status: number; rows: BingRow[] };
  try {
    qstats = await callEndpoint('GetQueryStats', opts.apiKey, siteUrl, fetchImpl);
    pstats = await callEndpoint('GetPageStats', opts.apiKey, siteUrl, fetchImpl);
  } catch {
    return { timestamp: ts, status: 'stale', aggregate: opts.lastGood ?? ZERO };
  }

  if (isAuthFail(qstats.status) || isAuthFail(pstats.status)) {
    return { timestamp: ts, status: 'auth_fail', aggregate: opts.lastGood ?? ZERO };
  }
  if (qstats.status !== 200 || pstats.status !== 200) {
    return { timestamp: ts, status: 'stale', aggregate: opts.lastGood ?? ZERO };
  }

  const inWindow = (r: BingRow) => {
    if (!r.Date) return false;
    const dt = parseBingDate(r.Date);
    return dt !== null && dt.toMillis() >= cutoff;
  };

  const qrows = qstats.rows.filter(inWindow);
  const prows = pstats.rows.filter(inWindow);

  let impressions = 0;
  let clicks = 0;
  let positionWeighted = 0;
  for (const r of qrows) {
    const imp = r.Impressions ?? 0;
    const clk = r.Clicks ?? 0;
    const pos = r.AvgImpressionPosition ?? 0;
    impressions += imp;
    clicks += clk;
    positionWeighted += imp * pos;
  }
  const avgPosition = impressions > 0 ? positionWeighted / impressions : 0;

  const top10Pages = new Set<string>();
  for (const r of prows) {
    const pos = r.AvgImpressionPosition ?? Infinity;
    if (pos > 0 && pos <= 10 && r.Query) {
      let url = r.Query;
      try { url = decodeURIComponent(url); } catch { /* keep raw */ }
      top10Pages.add(url);
    }
  }

  return {
    timestamp: ts,
    status: 'ok',
    aggregate: {
      impressions_7d: impressions,
      clicks_7d: clicks,
      avg_position_7d: avgPosition,
      top10_count_7d: top10Pages.size,
    },
  };
}

async function main() {
  const apiKey = await loadApiKey(DEFAULT_KEY_PATH);

  let lastGood: BingAggregate | null = null;
  try {
    if (existsSync(DEFAULT_LOG_PATH)) {
      const prev = JSON.parse(readFileSync(DEFAULT_LOG_PATH, 'utf-8'));
      if (prev?.status === 'ok' && prev?.aggregate) lastGood = prev.aggregate;
    }
  } catch { /* ignore prior-state read errors */ }

  const result = await fetchBingMetrics({ apiKey, lastGood });

  try {
    const tmp = DEFAULT_LOG_PATH + '.tmp';
    writeFileSync(tmp, JSON.stringify(result, null, 2));
    renameSync(tmp, DEFAULT_LOG_PATH);
  } catch (err) {
    console.error('Failed to write bing-latest.json:', err);
    process.exit(1);
  }

  console.log(`Bing metrics: status=${result.status}`);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  await main();
}
