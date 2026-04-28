#!/usr/bin/env bun
/**
 * S100 — Initialize the KPI tracking database (data/kpi.db).
 *
 * Idempotent: re-running creates missing tables/indexes; existing tables
 * are preserved. Schema is the watchdog-floor analog for the citation arc;
 * pre-amplification baseline (Step 8) writes against this schema.
 *
 * Tables (7):
 *   tracked_prompts           — 5 GEO Strategist priority prompts (Step 2 seeds)
 *   manual_citation_log       — weekly per-prompt × per-engine observations
 *   bwt_grounding_queries     — Bing Webmaster Tools AI Performance import
 *   bwt_ai_citations          — BWT page-keyed citations import
 *   gsc_queries_long          — Google Search Console long-query (AI-style) cuts
 *   ga4_ai_referrals          — GA4 sessions where referrer matches AI engines
 *   server_log_ai_bots        — Netlify access-log AI-bot fetches
 *
 * kpi.db is intentionally separate from data/events.db. Different write
 * patterns (append-mostly), different backup cadence, different consumer
 * surface. Do NOT consolidate.
 *
 * S91 (scripts/monitor-search-visibility.ts) writes data/search-visibility-log.csv
 * with daily aggregate counters. kpi.db decomposes those into per-row tables
 * for analytical drill-down. The two are complementary; do NOT consolidate.
 *
 * Usage:
 *   bun run scripts/kpi-init.ts
 *   bun run scripts/kpi-init.ts --status     # show table counts, no DDL
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync } from "fs";

const PROJECT_DIR = join(import.meta.dir, "..");
const DB_PATH = join(PROJECT_DIR, "data/kpi.db");

const SCHEMA_DDL: { name: string; sql: string }[] = [
  {
    name: "tracked_prompts",
    sql: `
      CREATE TABLE IF NOT EXISTS tracked_prompts (
        prompt_id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        lang TEXT NOT NULL CHECK (lang IN ('en', 'el')),
        format TEXT NOT NULL CHECK (format IN ('question', 'comparison', 'recommendation')),
        target_page TEXT NOT NULL,
        expected_lead_engines TEXT NOT NULL,
        city TEXT NOT NULL DEFAULT 'athens',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        rotated_out_at TEXT
      );
    `,
  },
  {
    name: "manual_citation_log",
    sql: `
      CREATE TABLE IF NOT EXISTS manual_citation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt_id TEXT NOT NULL REFERENCES tracked_prompts(prompt_id),
        engine TEXT NOT NULL CHECK (engine IN ('chatgpt','perplexity','gemini','copilot')),
        observed_at TEXT NOT NULL,
        cited INTEGER NOT NULL CHECK (cited IN (0, 1)),
        rank INTEGER,
        cited_url TEXT,
        notes TEXT,
        city TEXT NOT NULL DEFAULT 'athens'
      );
    `,
  },
  {
    name: "bwt_grounding_queries",
    sql: `
      CREATE TABLE IF NOT EXISTS bwt_grounding_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        citations INTEGER NOT NULL DEFAULT 0,
        cited_pages INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT NOT NULL,
        export_window_start TEXT NOT NULL,
        export_window_end TEXT NOT NULL
      );
    `,
  },
  {
    name: "bwt_ai_citations",
    sql: `
      CREATE TABLE IF NOT EXISTS bwt_ai_citations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_url TEXT NOT NULL,
        citations INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT NOT NULL,
        export_window_start TEXT NOT NULL,
        export_window_end TEXT NOT NULL
      );
    `,
  },
  {
    name: "gsc_queries_long",
    sql: `
      CREATE TABLE IF NOT EXISTS gsc_queries_long (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        page_url TEXT NOT NULL,
        impressions INTEGER NOT NULL DEFAULT 0,
        clicks INTEGER NOT NULL DEFAULT 0,
        position REAL,
        observed_date TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
    `,
  },
  {
    name: "ga4_ai_referrals",
    sql: `
      CREATE TABLE IF NOT EXISTS ga4_ai_referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_engine TEXT NOT NULL CHECK (referrer_engine IN ('chatgpt','perplexity','gemini','copilot','claude')),
        landing_page TEXT NOT NULL,
        sessions INTEGER NOT NULL DEFAULT 0,
        observed_date TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
    `,
  },
  {
    name: "server_log_ai_bots",
    sql: `
      CREATE TABLE IF NOT EXISTS server_log_ai_bots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_name TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        ts TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
    `,
  },
];

const INDEXES_DDL: string[] = [
  "CREATE INDEX IF NOT EXISTS idx_manual_observed ON manual_citation_log(observed_at);",
  "CREATE INDEX IF NOT EXISTS idx_bwt_grounding_window ON bwt_grounding_queries(export_window_end);",
  "CREATE INDEX IF NOT EXISTS idx_gsc_observed ON gsc_queries_long(observed_date);",
  "CREATE INDEX IF NOT EXISTS idx_ga4_observed ON ga4_ai_referrals(observed_date);",
  "CREATE INDEX IF NOT EXISTS idx_botlog_ts ON server_log_ai_bots(ts);",
  "CREATE INDEX IF NOT EXISTS idx_botlog_bot ON server_log_ai_bots(bot_name);",
];

function init(db: Database): void {
  console.log("=== S100 KPI database init ===");
  console.log("Path: " + DB_PATH);
  console.log("");

  for (const t of SCHEMA_DDL) {
    db.exec(t.sql);
    console.log("  table: " + t.name + " — ready");
  }
  for (const idx of INDEXES_DDL) {
    db.exec(idx);
  }
  console.log("  indexes: " + INDEXES_DDL.length + " created/verified");
  console.log("");
}

function status(db: Database): void {
  console.log("=== S100 KPI database status ===");
  console.log("Path: " + DB_PATH);
  console.log("");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  for (const t of tables) {
    const c = db.prepare("SELECT COUNT(*) AS n FROM " + t.name).get() as { n: number };
    console.log("  " + t.name.padEnd(28) + " " + String(c.n).padStart(8) + " rows");
  }
  console.log("");
  const idxCount = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").get() as { n: number };
  console.log("  indexes (incl autoindex): " + idxCount.n);
}

function main() {
  const args = process.argv.slice(2);
  const statusOnly = args.includes("--status");

  const isNew = !existsSync(DB_PATH);
  const db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  if (statusOnly) {
    status(db);
  } else {
    if (isNew) console.log("(creating new database)");
    init(db);
    status(db);
  }

  db.close();
}

main();
