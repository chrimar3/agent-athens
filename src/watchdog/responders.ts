/** Responder layer (Phase 2A): detection → scoped action. Pure planner +
 *  side-effecting executor, mirroring the classifier/runner split so the
 *  decision logic is exhaustively testable. Every action is bounded by a
 *  12h per-kind cooldown (a flapping breach must not loop actions) and the
 *  executor is fault-isolated: a throwing action degrades to a failed
 *  outcome, never crashes the watchdog (S222: detection-without-response
 *  persisted 5 outage-days precisely because response required a human). */
import type { DeadmanResult } from './classifier';

export type ActionKind = 'REDEPLOY' | 'AUTH_CHECK' | 'QUARANTINE_SOURCE' | 'QUEUE_ENTRY';

export interface PlannedAction {
  kind: ActionKind;
  target?: string; // e.g. source id for QUARANTINE_SOURCE
  summary: string; // human-readable, lands in notification body
}

export interface ResponderState {
  lastActionMs: Partial<Record<ActionKind, number>>;
}

export interface ActionOutcome extends PlannedAction {
  ran: boolean; // false = dry-run
  ok: boolean | null; // null when not run
  detail: string;
}

const COOLDOWN_MS = 12 * 3_600_000;

const SOURCE_RE = /^source: (\S+) returned 0 events/;

export function planResponse(result: DeadmanResult, state: ResponderState, nowMs: number): PlannedAction[] {
  const cooled = (k: ActionKind) => {
    const last = state.lastActionMs[k];
    return last !== undefined && nowMs - last < COOLDOWN_MS;
  };
  const actions: PlannedAction[] = [];

  switch (result.status) {
    case 'STALE_DEPLOY':
      if (!cooled('REDEPLOY')) {
        actions.push({ kind: 'REDEPLOY', summary: 'attempt gate-respecting redeploy of current dist/' });
      }
      break;
    case 'STALE_ENRICH':
      if (!cooled('AUTH_CHECK')) {
        actions.push({ kind: 'AUTH_CHECK', summary: 'run auto-enrich.sh --auth-check-only and capture evidence' });
      }
      break;
    case 'SOURCE_DEAD':
      for (const r of result.reasons) {
        const m = r.match(SOURCE_RE);
        if (m && !cooled('QUARANTINE_SOURCE')) {
          actions.push({
            kind: 'QUARANTINE_SOURCE',
            target: m[1],
            summary: `quarantine dead source ${m[1]} (ends alert spam; digest lists it)`,
          });
        }
      }
      break;
    case 'DB_MISSING':
      // Restore is destructive-adjacent and human-only by spec §5.1.
      actions.push({
        kind: 'QUEUE_ENTRY',
        summary: 'DB missing/degenerate — surface restore runbook (~/agent-athens-backups) in decisions queue',
      });
      break;
    default:
      break; // OK / PIPELINE_FAIL / ADDRESSLESS_VENUES handled by signals + venue-address-autofix
  }
  return actions;
}

export async function executeActions(
  actions: PlannedAction[],
  opts: { dryRun: boolean; statePath: string; projectDir: string },
): Promise<ActionOutcome[]> {
  const { readFileSync, writeFileSync, existsSync } = await import('fs');
  const state: ResponderState = existsSync(opts.statePath)
    ? (JSON.parse(readFileSync(opts.statePath, 'utf8')) as ResponderState)
    : { lastActionMs: {} };
  const outcomes: ActionOutcome[] = [];

  for (const a of actions) {
    if (opts.dryRun) {
      outcomes.push({ ...a, ran: false, ok: null, detail: 'dry-run' });
      continue;
    }
    let ok = false;
    let detail = '';
    try {
      if (a.kind === 'REDEPLOY') {
        const p = Bun.spawnSync(['bash', `${opts.projectDir}/scripts/redeploy.sh`], { cwd: opts.projectDir });
        ok = p.exitCode === 0;
        detail = ok
          ? 'redeploy verified ready'
          : `redeploy.sh exit=${p.exitCode}: ${new TextDecoder().decode(p.stderr).slice(0, 300)}`;
      } else if (a.kind === 'AUTH_CHECK') {
        const p = Bun.spawnSync(['bash', `${opts.projectDir}/scripts/auto-enrich.sh`, '--auth-check-only'], {
          cwd: opts.projectDir,
        });
        ok = p.exitCode === 0;
        detail = ok ? 'auth ok' : `auth check failed rc=${p.exitCode} — see logs/auth-precheck-last.log`;
      } else if (a.kind === 'QUARANTINE_SOURCE' && a.target) {
        const path = `${opts.projectDir}/config/quarantined-sources.json`;
        const q = existsSync(path)
          ? (JSON.parse(readFileSync(path, 'utf8')) as { sources: Record<string, { since: string; reason: string }> })
          : { sources: {} as Record<string, { since: string; reason: string }> };
        if (!q.sources[a.target]) {
          q.sources[a.target] = {
            since: new Date().toISOString().slice(0, 10),
            reason: 'SOURCE_DEAD ≥3 consecutive zero/failed runs (auto)',
          };
          writeFileSync(path, JSON.stringify(q, null, 2) + '\n');
        }
        ok = true;
        detail = `quarantined ${a.target}`;
      } else if (a.kind === 'QUEUE_ENTRY') {
        ok = true; // queue entries are computed by decisions-queue.ts predicates; nothing to persist
        detail = 'queue predicate will surface this';
      }
    } catch (e) {
      ok = false;
      detail = `responder threw: ${String(e).slice(0, 200)}`;
    }
    state.lastActionMs[a.kind] = Date.now();
    outcomes.push({ ...a, ran: true, ok, detail });
  }
  writeFileSync(opts.statePath, JSON.stringify(state) + '\n');
  return outcomes;
}
