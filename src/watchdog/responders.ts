/** Responder layer (Phase 2A): detection → scoped action. Pure planner +
 *  side-effecting executor, mirroring the classifier/runner split so the
 *  decision logic is exhaustively testable. Every action is bounded by a
 *  12h per-kind cooldown (a flapping breach must not loop actions) and the
 *  executor is fault-isolated: a throwing action degrades to a failed
 *  outcome, never crashes the watchdog (S222: detection-without-response
 *  persisted 5 outage-days precisely because response required a human).
 *
 *  STALE_DEPLOY (security loop round 3): the responder NEVER ships the
 *  current dist/. dist/, logs/deploy-cadence.log and .netlify/state.json are
 *  written by pipeline runs (containers), so a deploy driven by them would let
 *  a compromised run publish with the host's Netlify login. Instead it
 *  restores the last deploy the HOST recorded as verified — the newest line of
 *  $AA_STATE_DIR/deploys.log (default ~/.config/agentathens-docker), which the
 *  host wrapper appends from publish's `PUBLISH-RESULT` line and no container
 *  can write. With no usable record it only alerts, naming the manual
 *  commands. Restore is the rollback direction: it can only put a previously
 *  verified deploy back, never new content.
 *
 *  Security loop round 5: the restore no longer uses the host's Netlify CLI
 *  login. It runs the container job `bash docker/aa-run.sh restore <deploy_id>`
 *  (exit 0 = the job restored the deploy and verified it live), so the host
 *  needs no account-wide Netlify credential for the watchdog. Without
 *  docker/aa-run.sh (container setup not installed) it only alerts. The job's
 *  output is never copied into the alert: only its exit code is reported. */
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { DeadmanResult } from './classifier';

export type ActionKind = 'RESTORE_KNOWN_GOOD' | 'AUTH_CHECK' | 'QUARANTINE_SOURCE' | 'QUEUE_ENTRY';

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

/** Host-only state dir (quarantine marker, verified-deploys record, responder
 *  cooldowns). Containers never mount it. */
export function hostStateDir(): string {
  return process.env.AA_STATE_DIR || join(homedir(), '.config', 'agentathens-docker');
}

export interface KnownGoodDeploy {
  at: string;
  deployId: string;
  distHash: string;
}

// `<ISO-8601-UTC> <deploy_id> <dist_hash>`, as the host wrapper appends it.
const DEPLOY_RECORD_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) ([0-9A-Za-z]{1,64}) ([0-9a-f]{64})$/;
const RESTORE_RECORD_RE = /^\S+ [0-9a-f]{20,40} restore$/;

/** Newest record in the host's verified-deploys log, or null when the file is
 *  missing, empty or its LAST non-empty line is malformed (never silently
 *  falls back to an older entry: a damaged record means alert, not act). */
export function lastKnownGoodDeploy(path: string): KnownGoodDeploy | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  // docker/aa-run.sh restore appends "<time> <id> restore" (round 6) so the
  // live check expects the restored deploy; such a line records no newly
  // verified deploy and is skipped. Any other malformed newest line still
  // yields null (alert only).
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => !RESTORE_RECORD_RE.test(l));
  const m = lines.length ? lines[lines.length - 1].match(DEPLOY_RECORD_RE) : null;
  return m ? { at: m[1], deployId: m[2], distHash: m[3] } : null;
}

export const MANUAL_DEPLOY_RUNBOOK =
  'Manual: restore a verified deploy with `bash docker/aa-run.sh restore <deploy_id>` (container job, no host login). ' +
  'With the host Netlify login only: list recent deploys with `netlify api listSiteDeploys --data \'{"site_id":"<site>","per_page":10}\'`, ' +
  'restore with `netlify api restoreSiteDeploy --data \'{"site_id":"<site>","deploy_id":"<id>"}\'`, ' +
  'or ship a fresh build with `bun run deploy` (scripts/redeploy.sh: refuses under quarantine; runs the origin, deploy and published-artifact gates).';

/** The id format the container restore job accepts (Netlify deploy ids are
 *  24 lowercase hex characters; up to 40 allowed). Anything else is refused
 *  before it reaches the wrapper's argv. */
const RESTORE_ID_RE = /^[0-9a-f]{24,40}$/;

/** Wall-clock bound for the container restore job (image start + API calls). */
const RESTORE_TIMEOUT_MS = 15 * 60_000;

export function planResponse(result: DeadmanResult, state: ResponderState, nowMs: number): PlannedAction[] {
  const cooled = (k: ActionKind) => {
    const last = state.lastActionMs[k];
    return last !== undefined && nowMs - last < COOLDOWN_MS;
  };
  const actions: PlannedAction[] = [];

  switch (result.status) {
    case 'STALE_DEPLOY':
      if (!cooled('RESTORE_KNOWN_GOOD')) {
        actions.push({
          kind: 'RESTORE_KNOWN_GOOD',
          summary: 'ensure the live site serves the last host-verified deploy (restore it if not; alert only without a record)',
        });
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

/** RESTORE_KNOWN_GOOD: have the container job put the last host-verified
 *  deploy back live. Reads only host-side state; runs nothing but
 *  `bash <projectDir>/docker/aa-run.sh restore <id>`. */
function restoreKnownGood(stateDir: string, projectDir: string, timeoutMs: number): { ok: boolean; detail: string } {
  const record = join(stateDir, 'deploys.log');
  const good = lastKnownGoodDeploy(record);
  if (!good) {
    return {
      ok: false,
      detail: `alert only — no usable host record of a verified deploy (${record} missing, empty or malformed); nothing changed. ${MANUAL_DEPLOY_RUNBOOK}`,
    };
  }
  if (!RESTORE_ID_RE.test(good.deployId)) {
    return {
      ok: false,
      detail: `alert only — the last recorded deploy id (${good.at}) is not 24-40 lowercase hex, so it is not passed to the restore job; nothing changed. ${MANUAL_DEPLOY_RUNBOOK}`,
    };
  }
  const aaRun = join(projectDir, 'docker', 'aa-run.sh');
  if (!existsSync(aaRun)) {
    return {
      ok: false,
      detail: `alert only — ${aaRun} is not installed (container setup, docker/README.md), so the last verified deploy ${good.deployId} (recorded ${good.at}) was not restored; nothing changed. ${MANUAL_DEPLOY_RUNBOOK}`,
    };
  }
  const p = Bun.spawnSync(['bash', aaRun, 'restore', good.deployId], {
    cwd: projectDir,
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  if (p.exitCode === 0) {
    return {
      ok: true,
      detail: `restored the last verified deploy ${good.deployId} (recorded ${good.at}) with docker/aa-run.sh restore. If the live site was serving another deploy, the host never recorded it as verified — find out what published it.`,
    };
  }
  const how = p.exitCode === null ? `was killed after ${Math.round(timeoutMs / 1000)}s` : `failed with exit ${p.exitCode}`;
  return {
    ok: false,
    detail: `docker/aa-run.sh restore ${good.deployId} ${how}; the live site may still serve an unverified deploy (see the aa-run log). ${MANUAL_DEPLOY_RUNBOOK}`,
  };
}

export async function executeActions(
  actions: PlannedAction[],
  opts: {
    dryRun: boolean;
    statePath: string;
    projectDir: string;
    /** Host-only state dir holding deploys.log (default hostStateDir()). */
    stateDir?: string;
    /** Wall-clock bound for the container restore job (tests pass a short one). */
    restoreTimeoutMs?: number;
  },
): Promise<ActionOutcome[]> {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  let state: ResponderState = { lastActionMs: {} };
  try {
    if (existsSync(opts.statePath)) state = JSON.parse(readFileSync(opts.statePath, 'utf8')) as ResponderState;
  } catch {
    state = { lastActionMs: {} }; // an unreadable cooldown file only re-enables actions
  }
  if (!state || typeof state.lastActionMs !== 'object' || state.lastActionMs === null) state = { lastActionMs: {} };
  const outcomes: ActionOutcome[] = [];

  for (const a of actions) {
    if (opts.dryRun) {
      outcomes.push({ ...a, ran: false, ok: null, detail: 'dry-run' });
      continue;
    }
    let ok = false;
    let detail = '';
    try {
      if (a.kind === 'RESTORE_KNOWN_GOOD') {
        const r = restoreKnownGood(opts.stateDir ?? hostStateDir(), opts.projectDir, opts.restoreTimeoutMs ?? RESTORE_TIMEOUT_MS);
        ok = r.ok;
        detail = r.detail;
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
  mkdirSync(dirname(opts.statePath), { recursive: true });
  writeFileSync(opts.statePath, JSON.stringify(state) + '\n');
  return outcomes;
}
