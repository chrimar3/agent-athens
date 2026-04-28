#!/usr/bin/env bun
/**
 * S100 — Seed tracked_prompts from config/tracked-prompts.json.
 *
 * Idempotent via INSERT OR REPLACE on prompt_id (PRIMARY KEY). Re-running
 * with an updated config picks up changes; rotated_out_at is preserved
 * across re-seeds (only set/cleared via direct SQL, not by this script).
 *
 * Usage:
 *   bun run scripts/kpi-seed-prompts.ts
 */

import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

const PROJECT_DIR = join(import.meta.dir, "..");
const DB_PATH = join(PROJECT_DIR, "data/kpi.db");
const CONFIG_PATH = join(PROJECT_DIR, "config/tracked-prompts.json");

interface PromptConfig {
  prompt_id: string;
  text: string;
  lang: "en" | "el";
  format: "question" | "comparison" | "recommendation";
  target_page: string;
  expected_lead_engines: string[];
}

function main() {
  console.log("=== S100 KPI seed tracked_prompts ===");
  console.log("Config: " + CONFIG_PATH);
  console.log("DB:     " + DB_PATH);
  console.log("");

  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const prompts = JSON.parse(raw) as PromptConfig[];
  if (!Array.isArray(prompts) || prompts.length === 0) {
    console.error("ERROR: config is empty or not an array");
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readwrite: true });
  db.exec("PRAGMA foreign_keys = ON;");

  const upsert = db.prepare(`
    INSERT INTO tracked_prompts (prompt_id, text, lang, format, target_page, expected_lead_engines, city)
    VALUES ($prompt_id, $text, $lang, $format, $target_page, $expected_lead_engines, 'athens')
    ON CONFLICT(prompt_id) DO UPDATE SET
      text = excluded.text,
      lang = excluded.lang,
      format = excluded.format,
      target_page = excluded.target_page,
      expected_lead_engines = excluded.expected_lead_engines
  `);

  const txn = db.transaction((rows: PromptConfig[]) => {
    for (const p of rows) {
      upsert.run({
        $prompt_id: p.prompt_id,
        $text: p.text,
        $lang: p.lang,
        $format: p.format,
        $target_page: p.target_page,
        $expected_lead_engines: JSON.stringify(p.expected_lead_engines),
      });
    }
  });
  txn(prompts);

  console.log("  seeded/updated " + prompts.length + " prompt(s)");
  console.log("");

  // Verify: print a summary row per prompt with a Greek-rendering spot-check.
  const all = db.prepare("SELECT prompt_id, lang, format, target_page, substr(text, 1, 60) AS preview FROM tracked_prompts ORDER BY prompt_id").all() as any[];
  console.log("Current tracked_prompts:");
  for (const r of all) {
    console.log("  " + r.prompt_id + "  " + r.lang + "  " + r.format.padEnd(14) + "  " + r.target_page.padEnd(15) + "  " + r.preview);
  }

  db.close();
}

main();
