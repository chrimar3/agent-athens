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
import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { DateTime } from 'luxon';
import { loadQuarantine } from '../src/utils/quarantine';

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

export function renderDigest(i: DigestInputs): string {
  const deploySet = new Set(i.deployDays);
  const deployCount = i.windowDates.filter((d) => deploySet.has(d)).length;
  const zeroSaveDays = i.windowDates.filter((d) => !(i.enrichPerDay[d] > 0)).length;
  const totalSaves = i.windowDates.reduce((s, d) => s + (i.enrichPerDay[d] ?? 0), 0);

  const lines: string[] = [];
  lines.push('<!-- COMPUTED by scripts/weekly-digest.ts -->');
  lines.push(`# Agent Athens — Week ${i.weekLabel}`);
  lines.push('');
  lines.push(`**Phase-1 exit gate: ${i.exitGate}** · Deploys **${deployCount}/7** · Enrichment **${totalSaves} saves**${zeroSaveDays > 0 ? ` (**${zeroSaveDays} zero-save day${zeroSaveDays === 1 ? '' : 's'}**)` : ''} · Decisions pending: **${i.decisionsPending}** ([queue](../DECISIONS-QUEUE.md))`);
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
    lines.push(`- ${s.source}: ${s.events} events`);
  }
  const qs = Object.entries(i.quarantined);
  if (qs.length > 0) {
    lines.push('');
    lines.push(`Quarantined: ${qs.map(([id, q]) => `**${id}** (since ${q.since})`).join(', ')} — see the decisions queue.`);
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

if (import.meta.main) {
  const now = DateTime.now().setZone('Europe/Athens');
  const weekLabel = `${now.year}-W${String(now.weekNumber).padStart(2, '0')}`;
  const windowDates = Array.from({ length: 7 }, (_, k) => now.minus({ days: 7 - k }).toISODate()!);

  let deployDays: string[] = [];
  try {
    deployDays = readFileSync(join(ROOT, 'logs', 'deploy-cadence.log'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('deploy-success'))
      .map((l) => l.slice(0, 10));
  } catch { /* missing log → 0/7, honestly */ }

  const enrichPerDay: Record<string, number> = {};
  const sourceTotals: Array<{ source: string; events: number }> = [];
  try {
    const db = new Database(join(ROOT, 'data', 'events.db'), { readonly: true });
    for (const r of db
      .query(`SELECT date(created_at) d, COUNT(*) c FROM enrichment_log WHERE saved_to_events=1 AND created_at > datetime('now','-8 days') GROUP BY d`)
      .all() as Array<{ d: string; c: number }>) {
      enrichPerDay[r.d] = r.c;
    }
    for (const r of db
      .query(`SELECT source, SUM(events_found) e FROM scrape_stats WHERE scraped_at > datetime('now','-8 days') GROUP BY source ORDER BY e DESC`)
      .all() as Array<{ source: string; e: number }>) {
      sourceTotals.push({ source: r.source, events: r.e ?? 0 });
    }
    db.close();
  } catch { /* DB unavailable → empty sections, honestly */ }

  let bing: DigestInputs['bing'] = { avgPosition: null, impressions7d: null };
  try {
    const rows = readFileSync(join(ROOT, 'data', 'search-visibility-log.csv'), 'utf8').trim().split('\n');
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
    const m = readFileSync(join(ROOT, 'docs', 'DECISIONS-QUEUE.md'), 'utf8').match(/\*\*Pending: (\d+)\*\*/);
    decisionsPending = m ? parseInt(m[1]) : 0;
  } catch { /* queue not yet generated */ }

  let exitGate: DigestInputs['exitGate'] = 'UNKNOWN';
  const gate = Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts', 'phase1-exit-gate.ts')], { cwd: ROOT });
  const gateOut = new TextDecoder().decode(gate.stdout);
  if (gateOut.includes('PHASE1: PASS')) exitGate = 'PASS';
  else if (gateOut.includes('PHASE1: FAIL')) exitGate = 'FAIL';

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
  writeFileSync(outPath, md);
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
