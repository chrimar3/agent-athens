#!/usr/bin/env bun
/**
 * Computed weekly digest (Phase 2A, spec §5.5) — the operator's 30 min/week.
 *
 * Every number is computed from existing artifacts (deploy-cadence.log,
 * enrichment_log, scrape_stats, quarantine registry, search-visibility CSV,
 * the decisions queue, the Phase-1 exit gate). Nothing hand-maintained.
 * Output: docs/digest/<ISO-week>.md (picked up by the daily artifact commit)
 * plus a 5-line ntfy summary via the deadman's sendPush.
 *
 * launchd: com.agentathens.digest, Sundays 08:30.
 */
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { DateTime } from 'luxon';
import { loadQuarantine } from '../src/utils/quarantine';
import { writeFileNoFollow } from '../src/watchdog/host-files';
import { queryUntrustedDb } from '../src/watchdog/untrusted-db';
import { readTailBounded, stripControl } from '../src/watchdog/signal-sources';

const ROOT = join(import.meta.dir, '..');

export interface DigestInputs {
  weekLabel: string; // e.g. 2026-W33
  deployDays: string[]; // dates with deploy-success within the window
  windowDates: string[]; // the 7 dates of the window (oldest first)
  enrichPerDay: Record<string, number>; // saves per date (absent = 0)
  sourceTotals: Array<{ source: string; events: number }>;
  quarantined: Record<string, { since: string; reason: string }>;
  bing: { avgPosition: number | null; impressions7d: number | null };
  decisionsPending: number;
  exitGate: 'PASS' | 'FAIL' | 'UNKNOWN';
}

/**
 * A container-derived string made inert in the digest's Markdown (security
 * loop round 9): scrape_stats.source and the quarantine registry come from
 * files the container writes. Control, zero-width and bidi characters are
 * removed and newlines flattened (stripControl), the text is capped at `max`
 * characters, and every ASCII punctuation character is backslash-escaped
 * (CommonMark renders `\x` as a literal x), so no link, image, HTML tag,
 * heading, list, table or autolink can come out of it.
 */
export function mdText(raw: unknown, max = 80): string {
  return stripControl(String(raw ?? ''), max).replace(/[!-/:-@[-`{-~]/g, (c) => `\\${c}`);
}

/** A count from the container-written DB: a finite non-negative integer, else 0. */
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0);

export function renderDigest(i: DigestInputs): string {
  const deploySet = new Set(i.deployDays);
  const deployCount = i.windowDates.filter((d) => deploySet.has(d)).length;
  const zeroSaveDays = i.windowDates.filter((d) => !(i.enrichPerDay[d] > 0)).length;
  const totalSaves = i.windowDates.reduce((s, d) => s + (i.enrichPerDay[d] ?? 0), 0);

  const lines: string[] = [];
  lines.push('<!-- COMPUTED by scripts/weekly-digest.ts -->');
  lines.push(`# Agent Athens — Week ${i.weekLabel}`);
  lines.push('');
  lines.push(`**Phase-1 exit gate: ${i.exitGate}** · Deploys **${deployCount}/7** · Enrichment **${totalSaves} saves**${zeroSaveDays > 0 ? ` (**${zeroSaveDays} zero-save day${zeroSaveDays === 1 ? '' : 's'}**)` : ''} · Decisions pending: **${i.decisionsPending}** ([queue](../../data/DECISIONS-QUEUE.md))`);
  lines.push('');

  lines.push('## Pipeline');
  lines.push('');
  for (const d of i.windowDates) {
    lines.push(`- ${d}: deploy ${deploySet.has(d) ? '✓' : '✗'} · saves ${i.enrichPerDay[d] ?? 0}`);
  }
  lines.push('');

  lines.push('## Sources (week totals)');
  lines.push('');
  for (const s of i.sourceTotals) {
    lines.push(`- ${mdText(s.source)}: ${count(s.events)} events`);
  }
  const qs = Object.entries(i.quarantined);
  if (qs.length > 0) {
    lines.push('');
    lines.push(`Quarantined: ${qs.map(([id, q]) => `**${mdText(id)}** (since ${mdText(q?.since, 40)})`).join(', ')} — see the decisions queue.`);
  }
  lines.push('');

  lines.push('## Visibility');
  lines.push('');
  lines.push(
    i.bing.avgPosition !== null
      ? `- Bing: avg position ${i.bing.avgPosition}, ${i.bing.impressions7d ?? '?'} impressions/7d`
      : '- Bing: no data this week',
  );
  lines.push('- Google (GSC): still blind — unblinding is Phase 3 work');
  lines.push('');
  return lines.join('\n');
}

/** Wall clock for the Phase-1 exit gate child (its DB read has its own 30 s). */
export const EXIT_GATE_TIMEOUT_MS = 90_000;

/**
 * Run scripts/phase1-exit-gate.ts and read its verdict (security loop round
 * 9): the child is killed at `timeoutMs`, and only an exact last stdout line
 * `PHASE1: PASS` / `PHASE1: FAIL` counts — a timeout, a crash or anything
 * else is UNKNOWN.
 */
export function runExitGate(opts: { script?: string; timeoutMs?: number } = {}): DigestInputs['exitGate'] {
  const gate = Bun.spawnSync([process.execPath, opts.script ?? join(ROOT, 'scripts', 'phase1-exit-gate.ts')], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'inherit',
    timeout: opts.timeoutMs ?? EXIT_GATE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024,
  });
  if (gate.signalCode || gate.exitCode === null) {
    console.error(`[digest] phase1-exit-gate did not finish (${gate.signalCode ?? 'no exit code'}) — gate UNKNOWN`);
    return 'UNKNOWN';
  }
  const last = gate.stdout.toString().trimEnd().split('\n').pop() ?? '';
  if (last === 'PHASE1: PASS') return 'PASS';
  if (last === 'PHASE1: FAIL') return 'FAIL';
  return 'UNKNOWN';
}

if (import.meta.main) {
  const now = DateTime.now().setZone('Europe/Athens');
  const weekLabel = `${now.year}-W${String(now.weekNumber).padStart(2, '0')}`;
  const windowDates = Array.from({ length: 7 }, (_, k) => now.minus({ days: 7 - k }).toISODate()!);

  // Container-written files (logs/, data/ incl. data/DECISIONS-QUEUE.md) are read
  // with readTailBounded (security loop round 9): no-follow, regular files
  // only, never blocks on a FIFO, bounded size.
  // Missing or refused log → 0/7, honestly.
  const deployDays = (readTailBounded(join(ROOT, 'logs', 'deploy-cadence.log')) ?? '')
    .split('\n')
    .filter((l) => l.includes('deploy-success'))
    .map((l) => l.slice(0, 10));

  const enrichPerDay: Record<string, number> = {};
  const sourceTotals: Array<{ source: string; events: number }> = [];
  // Security loop round 8: events.db is container-written, so it is read
  // through queryUntrustedDb (private copy, no views or foreign triggers,
  // queries in a child killed at its wall clock), never opened here.
  const dbRead = await queryUntrustedDb({
    dbPath: join(ROOT, 'data', 'events.db'),
    requireTables: [],
    queries: {
      enrich: { sql: `SELECT date(created_at) d, COUNT(*) c FROM enrichment_log WHERE saved_to_events=1 AND created_at > datetime('now','-8 days') GROUP BY d`, tables: ['enrichment_log'] },
      sources: { sql: `SELECT source, SUM(events_found) e FROM scrape_stats WHERE scraped_at > datetime('now','-8 days') GROUP BY source ORDER BY e DESC`, tables: ['scrape_stats'] },
    },
  });
  if (dbRead.ok) {
    for (const r of dbRead.rows.enrich ?? []) {
      if (typeof r.d === 'string' && typeof r.c === 'number') enrichPerDay[r.d] = r.c;
    }
    for (const r of dbRead.rows.sources ?? []) {
      if (typeof r.source === 'string') sourceTotals.push({ source: r.source, events: typeof r.e === 'number' ? r.e : 0 });
    }
  } else {
    // DB unavailable → empty sections, honestly; the log says why.
    console.error(`[digest] events.db not read (${dbRead.kind}): ${dbRead.detail}`);
  }

  let bing: DigestInputs['bing'] = { avgPosition: null, impressions7d: null };
  try {
    const csv = readTailBounded(join(ROOT, 'data', 'search-visibility-log.csv'), 4 * 1024 * 1024);
    if (csv === null) throw new Error('unavailable');
    const rows = csv.trim().split('\n');
    const header = rows[0].split(',');
    const last = rows[rows.length - 1].split(',');
    const col = (name: string) => {
      const idx = header.findIndex((h) => h.includes(name));
      const v = idx >= 0 ? parseFloat(last[idx]) : NaN;
      return Number.isFinite(v) ? v : null;
    };
    bing = { avgPosition: col('bing_avg_position'), impressions7d: col('bing_impressions') };
  } catch { /* CSV unavailable */ }

  let decisionsPending = 0;
  try {
    const m = (readTailBounded(join(ROOT, 'data', 'DECISIONS-QUEUE.md'), 1024 * 1024) ?? '').match(/\*\*Pending: (\d{1,6})\*\*/);
    decisionsPending = m ? parseInt(m[1]) : 0;
  } catch { /* queue not yet generated */ }

  const exitGate = runExitGate();

  const md = renderDigest({
    weekLabel,
    deployDays,
    windowDates,
    enrichPerDay,
    sourceTotals,
    quarantined: loadQuarantine(join(ROOT, 'config', 'quarantined-sources.json')).sources,
    bing,
    decisionsPending,
    exitGate,
  });

  const outDir = join(ROOT, 'docs', 'digest');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${weekLabel}.md`);
  // No-follow (security loop round 4): refuse a symlink planted at the digest
  // path rather than write through it as the owner.
  writeFileNoFollow(outPath, md);
  console.log(`[digest] wrote ${outPath}`);

  // 5-line ntfy summary via the deadman's push layer (module import is safe:
  // deadman main() is import.meta.main-guarded).
  const { sendPush } = await import('./deadman-watchdog');
  const cfgRaw = JSON.parse(readFileSync(join(ROOT, 'config', 'monitoring.json'), 'utf8'));
  const summaryLines = md.split('\n').find((l) => l.startsWith('**Phase-1 exit gate'));
  const push = await sendPush(cfgRaw, `Agent Athens weekly digest ${weekLabel}`, summaryLines ?? 'digest generated').catch(
    (e: unknown) => ({ ok: false, skipped: false, detail: String(e) }),
  );
  console.log(`[digest] push ${push.ok ? 'sent' : push.skipped ? 'skipped' : 'FAILED: ' + push.detail}`);
}
