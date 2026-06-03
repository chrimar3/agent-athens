#!/usr/bin/env bun
/**
 * S100b — Read data/kpi.db and print a per-layer KPI summary.
 *
 * The citation arc collects across several measurement layers (GA4 referrals,
 * GSC long queries, server-log AI bots, manual observations, Bing/BWT). Most are
 * still empty. This reader prints EVERY layer: populated ones summarize real
 * numbers; empty ones print an honest empty-state marker (never a fabricated
 * "0", never silently dropped); a missing table reads as "not initialized".
 *
 * Read-only. Does not write, does not create tables.
 *
 * Usage:
 *   bun run scripts/kpi-report.ts
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = join(import.meta.dir, '..', 'data/kpi.db');
const LABEL_WIDTH = 22;

export interface LayerSpec {
  table: string;
  label: string;
  /** Honest empty-state phrasing for this specific layer. */
  emptyMsg: string;
}

export const LAYERS: LayerSpec[] = [
  { table: 'ga4_ai_referrals', label: 'GA4 AI referrals', emptyMsg: 'no AI-referral sessions imported yet' },
  { table: 'gsc_queries_long', label: 'GSC long queries', emptyMsg: 'no GSC queries imported yet' },
  { table: 'server_log_ai_bots', label: 'Server-log AI bots', emptyMsg: 'no server-log bot hits imported yet' },
  { table: 'manual_citation_log', label: 'Manual citations', emptyMsg: 'no manual observations logged yet' },
  { table: 'bwt_grounding_queries', label: 'Bing grounding (BWT)', emptyMsg: 'no BWT grounding queries imported yet' },
  { table: 'bwt_ai_citations', label: 'Bing AI citations (BWT)', emptyMsg: 'no BWT citations imported yet' },
  { table: 'tracked_prompts', label: 'Tracked prompts', emptyMsg: 'no prompts seeded yet' },
];

function tableExists(db: Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function rowCount(db: Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

/** Detailed summary for the GA4 AI-referral layer (the one with real data). */
function ga4Summary(db: Database): string {
  const total = (db.prepare('SELECT COALESCE(SUM(sessions),0) AS s FROM ga4_ai_referrals').get() as { s: number }).s;
  const span = db.prepare('SELECT MIN(observed_date) AS lo, MAX(observed_date) AS hi FROM ga4_ai_referrals').get() as { lo: string; hi: string };
  const rows = rowCount(db, 'ga4_ai_referrals');
  const byEngine = db
    .prepare('SELECT referrer_engine, SUM(sessions) AS s FROM ga4_ai_referrals GROUP BY referrer_engine ORDER BY s DESC')
    .all() as { referrer_engine: string; s: number }[];
  const split = byEngine.map((e) => `${e.referrer_engine} ${e.s}`).join(', ');
  return `${total} sessions · ${split} · ${span.lo}→${span.hi} · ${rows} rows`;
}

/** Render one layer line: not-initialized / empty-state / summary. */
function renderLayer(db: Database, layer: LayerSpec): string {
  const label = layer.label.padEnd(LABEL_WIDTH);
  if (!tableExists(db, layer.table)) return `${label}: — not initialized (run kpi-init) —`;
  const n = rowCount(db, layer.table);
  if (n === 0) return `${label}: — ${layer.emptyMsg} —`;
  if (layer.table === 'ga4_ai_referrals') return `${label}: ${ga4Summary(db)}`;
  return `${label}: ${n} rows`;
}

export function renderReport(db: Database): string {
  const lines = ['=== S100 KPI report (data/kpi.db) ===', ''];
  for (const layer of LAYERS) lines.push(renderLayer(db, layer));
  return lines.join('\n');
}

/**
 * Open kpi.db for reading. Deliberately NOT `{ readonly: true }`: the importer
 * runs the db in WAL mode, and SQLite cannot open a WAL database read-only (it
 * needs write access to the -shm wal-index → SQLITE_CANTOPEN). Instead open a
 * normal handle and enforce read-only at the connection level via query_only.
 */
export function openReportDb(path: string): Database {
  const db = new Database(path);
  db.exec('PRAGMA query_only = ON;');
  return db;
}

function main(): void {
  const db = openReportDb(DB_PATH);
  console.log(renderReport(db));
  db.close();
}

if (import.meta.main) main();
