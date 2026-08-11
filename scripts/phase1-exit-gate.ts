#!/usr/bin/env bun
/**
 * Phase-1 exit gate (spec §4, docs/superpowers/specs/2026-08-11-…design.md):
 * 7 consecutive days, each with a deploy-success line and ≥1 enrichment save,
 * and origin/main pushed within the window. Pure function + CLI shell so the
 * rule is testable without the live logs. Europe/Athens dates throughout.
 *
 * Phase 1 is DONE only when this prints PASS — no earlier claim permitted
 * (verification-before-completion: the gate is computed, never asserted).
 */

export interface GateInput {
  deployLog: string; // contents of logs/deploy-cadence.log
  enrichDays: string[]; // dates (YYYY-MM-DD) with ≥1 enrichment_log save
  pushedThrough: string | null; // commit date (YYYY-MM-DD) of origin/main tip
  today: string; // YYYY-MM-DD, Europe/Athens
}

export function evaluateGate(input: GateInput): {
  pass: boolean;
  days: Array<{ date: string; deploy: boolean; enrich: boolean }>;
} {
  const deployDates = new Set(
    input.deployLog
      .split('\n')
      .filter((l) => l.includes('deploy-success'))
      .map((l) => l.slice(0, 10)),
  );
  const enrich = new Set(input.enrichDays);
  const days: Array<{ date: string; deploy: boolean; enrich: boolean }> = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(`${input.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    days.push({ date, deploy: deployDates.has(date), enrich: enrich.has(date) });
  }
  const windowStart = days[0].date;
  const pushOk = input.pushedThrough !== null && input.pushedThrough >= windowStart;
  return { pass: pushOk && days.every((x) => x.deploy && x.enrich), days };
}

if (import.meta.main) {
  const { Database } = await import('bun:sqlite');
  const { readFileSync } = await import('fs');
  const { DateTime } = await import('luxon');
  const today = DateTime.now().setZone('Europe/Athens').toISODate()!;
  const deployLog = readFileSync('logs/deploy-cadence.log', 'utf8');
  const db = new Database('data/events.db', { readonly: true });
  const rows = db
    .query(
      `SELECT DISTINCT date(created_at) d FROM enrichment_log
       WHERE saved_to_events = 1 AND created_at > datetime('now', '-9 days')`,
    )
    .all() as Array<{ d: string }>;
  db.close();
  const pushed = Bun.spawnSync(['git', 'log', '-1', '--format=%cs', 'origin/main']).stdout.toString().trim() || null;
  const r = evaluateGate({ deployLog, enrichDays: rows.map((x) => x.d), pushedThrough: pushed, today });
  for (const d of r.days) console.log(`${d.date}  deploy=${d.deploy ? '✓' : '✗'}  enrich=${d.enrich ? '✓' : '✗'}`);
  console.log(`PHASE1: ${r.pass ? 'PASS' : 'FAIL'}`);
  process.exit(r.pass ? 0 : 1);
}
