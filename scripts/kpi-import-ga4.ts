#!/usr/bin/env bun
/**
 * S100b — Import GA4 AI-referral sessions into data/kpi.db (ga4_ai_referrals).
 *
 * Runtime: pure Bun. The @google-analytics/data client runs in-process under
 * Bun's default gRPC transport (confirmed by the Step-1 spike, property
 * 525325167) — no Python edge, no subprocess. Auth via the service-account key
 * at ~/.config/agentathens/gcp-kpi-reader.json (GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Scope (2026-05-30 GEO ruling): AI-referral secondary metric ONLY. Three hosts
 * — chatgpt.com / perplexity.ai / copilot.microsoft.com. NOT full-funnel
 * acquisition. The ga4_ai_referrals CHECK also allows gemini/claude, but we do
 * NOT widen to them here. A dropped source that *looks* like an AI engine
 * (substring match) is logged to stderr as UNMATCHED_AI_SOURCE so the first
 * real perplexity/copilot/gemini/claude referral under an unexpected host
 * string surfaces instead of being silently missed.
 *
 * Idempotent on the (observed_date, referrer_engine, landing_page) grain via a
 * UNIQUE index (idx_ga4_airef_grain, defined in kpi-init.ts) + UPSERT. Re-runs
 * update sessions in place; they never duplicate rows.
 *
 * Usage:
 *   bun run scripts/kpi-import-ga4.ts            # fetch live, write to kpi.db
 *   bun run scripts/kpi-import-ga4.ts --dry-run  # print rows it WOULD write, write nothing
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GA4_PROPERTY = 'properties/525325167';
const DB_PATH = join(import.meta.dir, '..', 'data/kpi.db');
const KEY_PATH = join(process.env.HOME ?? '', '.config/agentathens/gcp-kpi-reader.json');

export type EngineToken = 'chatgpt' | 'perplexity' | 'gemini' | 'copilot' | 'claude';

/**
 * In-scope AI referral hosts → canonical engine token. Three only, per the
 * 2026-05-30 GEO ruling. `chatgpt.com` is confirmed from real GA4 data; the
 * other two are unconfirmed (no live traffic yet) but are the documented hosts.
 */
export const AI_HOST_TO_ENGINE: Record<string, EngineToken> = {
  'chatgpt.com': 'chatgpt',
  'perplexity.ai': 'perplexity',
  'copilot.microsoft.com': 'copilot',
};

/** Substrings that flag a dropped source as a probable AI engine (near-miss guard). */
const AI_ENGINE_HINTS = ['perplexity', 'copilot', 'gemini', 'claude'] as const;

// ---------------------------------------------------------------------------
// Types (subset of the GA4 runReport response we depend on)
// ---------------------------------------------------------------------------

export interface Ga4ResponseRow {
  dimensionValues?: ({ value?: string | null } | null)[] | null;
  metricValues?: ({ value?: string | null } | null)[] | null;
}
export interface Ga4Response {
  rows?: Ga4ResponseRow[] | null;
}

export interface ImportRow {
  referrer_engine: EngineToken;
  landing_page: string;
  sessions: number;
  observed_date: string; // ISO YYYY-MM-DD
}

export interface TransformResult {
  rows: ImportRow[];
  /** Dropped sessionSource values that look like an AI engine but aren't in the map. */
  nearMisses: string[];
}

// ---------------------------------------------------------------------------
// Pure transform (identical logic regardless of live vs fixture source)
// ---------------------------------------------------------------------------

/** GA4 "date" dimension is YYYYMMDD; the table stores ISO YYYY-MM-DD. */
export function ga4DateToIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * Filter a runReport response (dims: date, sessionSource, landingPage; metrics:
 * sessions, activeUsers) down to in-scope AI hosts and map to ga4_ai_referrals
 * rows. Non-AI sources are dropped silently; AI-looking-but-unmapped sources are
 * collected in `nearMisses`.
 */
export function transformRows(resp: Ga4Response): TransformResult {
  const rows: ImportRow[] = [];
  const nearMisses: string[] = [];

  for (const row of resp.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const date = dims[0]?.value ?? '';
    const source = dims[1]?.value ?? '';
    const landing = dims[2]?.value ?? '';
    const engine = AI_HOST_TO_ENGINE[source];

    if (!engine) {
      if (source && AI_ENGINE_HINTS.some((h) => source.includes(h))) nearMisses.push(source);
      continue;
    }

    // metricValues[0] = sessions (NOT [1] = activeUsers)
    const sessions = Number(row.metricValues?.[0]?.value ?? '0');
    rows.push({
      referrer_engine: engine,
      landing_page: landing,
      sessions: Number.isFinite(sessions) ? sessions : 0,
      observed_date: ga4DateToIso(date),
    });
  }

  return { rows, nearMisses };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Defensive: guarantee the idempotency grain exists even on an un-migrated db. */
export function ensureGa4Index(db: Database): void {
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_ga4_airef_grain ON ga4_ai_referrals (observed_date, referrer_engine, landing_page);',
  );
}

/** UPSERT on the grain. Returns the number of rows written/updated. */
export function writeRows(db: Database, rows: ImportRow[], importedAt: string): number {
  const stmt = db.prepare(`
    INSERT INTO ga4_ai_referrals (observed_date, referrer_engine, landing_page, sessions, imported_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(observed_date, referrer_engine, landing_page)
    DO UPDATE SET sessions = excluded.sessions, imported_at = excluded.imported_at
  `);
  const tx = db.transaction((items: ImportRow[]) => {
    for (const r of items) {
      stmt.run(r.observed_date, r.referrer_engine, r.landing_page, r.sessions, importedAt);
    }
    return items.length;
  });
  return tx(rows);
}

// ---------------------------------------------------------------------------
// Live fetch (Bun gRPC client) — not exercised by the test suite
// ---------------------------------------------------------------------------

/** Whole COMPLETE days only: 8daysAgo→1daysAgo (today is partial/unstable). */
export async function fetchGa4(startDate = '8daysAgo', endDate = '1daysAgo'): Promise<Ga4Response> {
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??= KEY_PATH;
  const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
  const client = new BetaAnalyticsDataClient();
  const [resp] = await client.runReport({
    property: GA4_PROPERTY,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }, { name: 'sessionSource' }, { name: 'landingPage' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
    limit: 1000,
  });
  return resp as Ga4Response;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const importedAt = new Date().toISOString();

  console.log(`=== S100b GA4 AI-referral import ${dryRun ? '(dry-run)' : ''} ===`);
  const resp = await fetchGa4();
  const { rows, nearMisses } = transformRows(resp);

  for (const src of nearMisses) console.error(`UNMATCHED_AI_SOURCE=${src}`);

  if (rows.length === 0) {
    console.log('No AI-referral rows in window (honest zero — 3 in-scope hosts, complete days 8→1 ago).');
  } else {
    for (const r of rows) {
      console.log(`  ${r.observed_date}  ${r.referrer_engine.padEnd(11)} ${String(r.sessions).padStart(4)}  ${r.landing_page}`);
    }
  }

  if (dryRun) {
    console.log(`\n(dry-run) would write ${rows.length} row(s); wrote nothing.`);
    return;
  }

  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  ensureGa4Index(db);
  const n = writeRows(db, rows, importedAt);
  db.close();
  console.log(`\nUpserted ${n} row(s) into ga4_ai_referrals (imported_at=${importedAt}).`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
