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
import { join } from 'path';
import { queryUntrustedDb } from '../src/watchdog/untrusted-db';
import { readTailBounded, stripControl } from '../src/watchdog/signal-sources';

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GateRead = { ok: true; input: GateInput } | { ok: false; reason: string };

/**
 * The gate's inputs, read as a host job (security loop round 9): the weekly
 * digest runs this script on the Mac, and data/events.db and
 * logs/deploy-cadence.log are container-written. The DB goes through
 * queryUntrustedDb (private copy, no views or foreign triggers, a child killed
 * at its wall clock) and the log through readTailBounded (no-follow, regular
 * files only, never blocks on a FIFO, last 256 KiB), so neither a recursive
 * view nor a FIFO can hang it. Anything unreadable makes the gate UNKNOWN,
 * never PASS.
 */
export async function readGateInputs(root: string, today: string, dbTimeoutMs = 30_000): Promise<GateRead> {
  const deployLog = readTailBounded(join(root, 'logs', 'deploy-cadence.log'));
  if (deployLog === null) {
    return { ok: false, reason: 'logs/deploy-cadence.log is missing, not a regular file, or unreadable' };
  }
  const db = await queryUntrustedDb({
    dbPath: join(root, 'data', 'events.db'),
    requireTables: [],
    timeoutMs: dbTimeoutMs,
    queries: {
      enrich: {
        sql: `SELECT DISTINCT date(created_at) d FROM enrichment_log
       WHERE saved_to_events = 1 AND created_at > datetime('now', '-9 days')`,
        tables: ['enrichment_log'],
      },
    },
  });
  if (!db.ok) return { ok: false, reason: `events.db not read (${db.kind}): ${stripControl(db.detail, 300)}` };
  const rows = db.rows.enrich;
  if (!rows) return { ok: false, reason: `events.db enrichment_log not read: ${stripControl(db.errors.enrich ?? 'table absent', 300)}` };
  const enrichDays = rows.map((r) => r.d).filter((d): d is string => typeof d === 'string' && DATE_RE.test(d));
  const git = Bun.spawnSync(['git', 'log', '-1', '--format=%cs', 'origin/main'], {
    cwd: root, stdout: 'pipe', stderr: 'ignore', timeout: 10_000,
  });
  const pushedRaw = git.stdout.toString().trim();
  const pushedThrough = git.exitCode === 0 && DATE_RE.test(pushedRaw) ? pushedRaw : null;
  return { ok: true, input: { deployLog, enrichDays, pushedThrough, today } };
}

if (import.meta.main) {
  const { DateTime } = await import('luxon');
  const today = DateTime.now().setZone('Europe/Athens').toISODate()!;
  const read = await readGateInputs(join(import.meta.dir, '..'), today);
  if (!read.ok) {
    // The reason goes to stderr: it can carry container-chosen text (a table
    // name), and the digest reads only the verdict line on stdout.
    console.error(`[phase1-exit-gate] ${read.reason}`);
    console.log('PHASE1: UNKNOWN');
    process.exit(2);
  }
  const r = evaluateGate(read.input);
  for (const d of r.days) console.log(`${d.date}  deploy=${d.deploy ? '✓' : '✗'}  enrich=${d.enrich ? '✓' : '✗'}`);
  console.log(`PHASE1: ${r.pass ? 'PASS' : 'FAIL'}`);
  process.exit(r.pass ? 0 : 1);
}
