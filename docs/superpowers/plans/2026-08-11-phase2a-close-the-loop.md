# Phase 2A (Close the Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert detection into action — per-breach responder runbooks, source auto-quarantine, addressless-venue auto-proposals, a self-clearing decisions queue, a computed weekly digest, and the armed phase3-weekly measurement job — per spec §5.1/§5.5 (`docs/superpowers/specs/2026-08-11-autonomous-profitable-system-design.md`).

**Architecture:** A responder layer slots into the deadman's `main()` (deadman-watchdog.ts:382-398, after `classifyDeadman`, before delivery) as a fault-isolated step, mirroring the existing adapter pattern (`safe()` wrappers, DRY_RUN respected). Responder decisions come from a pure planner (`planResponse()`, unit-testable like `classifyDeadman`); actions run behind a cooldown state file so a flapping breach cannot loop an action. The decisions queue is **computed and self-clearing**: entries are predicates re-evaluated at generation time, so operator resolution = fixing the thing, no state mutation. The digest is 100% computed from existing artifacts.

**Tech Stack:** Bun + `bun:test`, launchd, existing deadman delivery layers (`sendPush` ntfy / `sendEmail` msmtp / `fireNotification` osascript — deadman-watchdog.ts:274-330).

## Global Constraints

- Runtime is **Bun, never Node**. Timezone `Europe/Athens` for date-facing logic. Never `git add -A`.
- Main checkout stays parked on `main`; all work in a worktree (`git worktree add ../aa-wt-phase2a -b feat/phase2a-close-the-loop main`), merged back promptly. Run `bun install --frozen-lockfile` in the worktree first (pre-commit tsc hook needs node_modules).
- TDD Iron Law; retrofitted pins use mutation runs as RED. Pure planners get exhaustive unit tests; executors get stub-driven tests; **no live launchd canary of a responder without DRY_RUN first**.
- Responders must be **fault-isolated** exactly like the signal adapters (deadman-watchdog.ts:352-366): a throwing responder degrades to "no action taken", never crashes the watchdog or blocks delivery layers.
- Responder actions must respect existing gates: any redeploy goes through `scripts/deploy-gate.sh`; never write fake `deploy-success` lines to `logs/deploy-cadence.log`.
- Known pre-existing suite failures (do not chase): `en-cornerstone-presence` class (date-conditional dist), `enrichment-v4` entity-staleness (time-drift fixture).
- Do not run heavy interactive/multi-agent work concurrently with enrichment slots (01/10/13/16:30/19/22) when validating responder behavior — S222 lesson: session contention starves `claude -p` batches and contaminates canaries.
- `tests/` may not open `data/events.db` (prod-db-guard preload) — fixture `:memory:` DBs only. Tests that spawn production scripts must isolate every file the script writes (`LOG_DIR_OVERRIDE` precedent, S222).

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `src/watchdog/responders.ts` (create) | pure `planResponse()` + `executeActions()` with cooldown + dry-run | 1 |
| `scripts/deadman-watchdog.ts` (modify :382-398) | wire responder step between classify and delivery | 2 |
| `scripts/redeploy.sh` (create) | gate-respecting standalone redeploy (used by responder + humans) | 1 |
| `config/quarantined-sources.json` (create) | quarantine registry read by scrape-all + deadman | 3 |
| `scripts/scrape-all.ts` (modify main loop ~:1660-1680, `deadSourcesSignal` consumer side) | skip quarantined sources; log skips | 3 |
| `scripts/venue-address-autofix.ts` (create) | geocode addressless publishable venues → decisions-queue proposals | 4 |
| `scripts/decisions-queue.ts` (create) | predicate-based queue generator → `docs/DECISIONS-QUEUE.md` | 5 |
| `scripts/weekly-digest.ts` (create) + plist | computed weekly digest → `docs/digest/` + ntfy summary | 6 |
| `~/Library/LaunchAgents/com.agentathens.phase3-weekly.plist` (create, per script header) | arm the existing measurement script | 7 |

Execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (validation). Tasks 3-6 are independent of each other after 1-2.

---

### Task 1: Responder planner + executor (pure core) and `scripts/redeploy.sh`

**Files:**
- Create: `src/watchdog/responders.ts`, `scripts/redeploy.sh`
- Test: `tests/watchdog-responders.test.ts`

**Interfaces:**
- Consumes: `DeadmanResult` / `DeadmanStatus` from `src/watchdog/classifier.ts:16-62` (statuses: `OK | DB_MISSING | STALE_DEPLOY | STALE_ENRICH | PIPELINE_FAIL | ADDRESSLESS_VENUES | SOURCE_DEAD`).
- Produces: `planResponse(result: DeadmanResult, state: ResponderState, nowMs: number): PlannedAction[]`; `executeActions(actions, opts: { dryRun: boolean; statePath: string }): Promise<ActionOutcome[]>`; `scripts/redeploy.sh` → exit 0 on verified `state=ready`, non-zero otherwise, appends its own `deploy-success` line ONLY via the same mechanism run_deploy uses (see step 3 note).

- [ ] **Step 1: Write the failing planner tests** — `tests/watchdog-responders.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { planResponse, type ResponderState } from '../src/watchdog/responders';

const HOUR = 3_600_000;
const fresh: ResponderState = { lastActionMs: {} };
const now = 1_700_000_000_000;
const result = (status: string, reasons: string[] = []) => ({ status, reasons }) as never;

describe('planResponse', () => {
  test('STALE_DEPLOY plans a redeploy', () => {
    const a = planResponse(result('STALE_DEPLOY'), fresh, now);
    expect(a.map((x) => x.kind)).toContain('REDEPLOY');
  });

  test('STALE_ENRICH plans an auth check, never a redeploy', () => {
    const a = planResponse(result('STALE_ENRICH'), fresh, now);
    expect(a.map((x) => x.kind)).toContain('AUTH_CHECK');
    expect(a.map((x) => x.kind)).not.toContain('REDEPLOY');
  });

  test('SOURCE_DEAD plans quarantine proposals per source named in reasons', () => {
    const a = planResponse(
      result('SOURCE_DEAD', ['source: clubber returned 0 events / failed for ≥3 consecutive runs (SOURCE_DEAD)']),
      fresh, now,
    );
    const q = a.find((x) => x.kind === 'QUARANTINE_SOURCE');
    expect(q?.target).toBe('clubber');
  });

  test('DB_MISSING plans NO automated action (restore is human-only) but a queue entry', () => {
    const a = planResponse(result('DB_MISSING'), fresh, now);
    expect(a.map((x) => x.kind)).not.toContain('REDEPLOY');
    expect(a.map((x) => x.kind)).toContain('QUEUE_ENTRY');
  });

  test('cooldown: same action within 12h is suppressed', () => {
    const state: ResponderState = { lastActionMs: { REDEPLOY: now - 2 * HOUR } };
    expect(planResponse(result('STALE_DEPLOY'), state, now)).toEqual([]);
  });

  test('cooldown expired (>12h) → action planned again', () => {
    const state: ResponderState = { lastActionMs: { REDEPLOY: now - 13 * HOUR } };
    expect(planResponse(result('STALE_DEPLOY'), state, now).length).toBeGreaterThan(0);
  });

  test('OK plans nothing', () => {
    expect(planResponse(result('OK'), fresh, now)).toEqual([]);
  });
});
```

Run: `bun test tests/watchdog-responders.test.ts` → FAIL (module missing). That is the RED.

- [ ] **Step 2: Implement `src/watchdog/responders.ts`**

```ts
/** Responder layer (Phase 2A): detection → scoped action. Pure planner +
 *  side-effecting executor, mirroring the classifier/runner split so the
 *  decision logic is exhaustively testable. Every action is bounded by a
 *  12h per-kind cooldown (a flapping breach must not loop actions) and the
 *  executor is fault-isolated: a throwing action degrades to a failed
 *  outcome, never crashes the watchdog (S222: detection-without-response
 *  died of exactly this class of fragility). */
import type { DeadmanResult } from './classifier';

export type ActionKind = 'REDEPLOY' | 'AUTH_CHECK' | 'QUARANTINE_SOURCE' | 'QUEUE_ENTRY';

export interface PlannedAction {
  kind: ActionKind;
  target?: string;           // e.g. source id for QUARANTINE_SOURCE
  summary: string;           // human-readable, lands in notification body
}

export interface ResponderState {
  lastActionMs: Partial<Record<ActionKind, number>>;
}

export interface ActionOutcome extends PlannedAction {
  ran: boolean;              // false = dry-run or cooldown-suppressed at exec time
  ok: boolean | null;        // null when not run
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
      if (!cooled('REDEPLOY')) actions.push({ kind: 'REDEPLOY', summary: 'attempt gate-respecting redeploy of current dist/' });
      break;
    case 'STALE_ENRICH':
      if (!cooled('AUTH_CHECK')) actions.push({ kind: 'AUTH_CHECK', summary: 'run auto-enrich.sh --auth-check-only and capture evidence' });
      break;
    case 'SOURCE_DEAD':
      for (const r of result.reasons) {
        const m = r.match(SOURCE_RE);
        if (m && !cooled('QUARANTINE_SOURCE')) {
          actions.push({ kind: 'QUARANTINE_SOURCE', target: m[1], summary: `quarantine dead source ${m[1]} (ends alert spam; digest lists it)` });
        }
      }
      break;
    case 'DB_MISSING':
      // Restore is destructive-adjacent and human-only by spec §5.1.
      actions.push({ kind: 'QUEUE_ENTRY', summary: 'DB missing/degenerate — surface restore runbook (~/agent-athens-backups) in decisions queue' });
      break;
    default:
      break; // OK / PIPELINE_FAIL / ADDRESSLESS_VENUES handled by signals + Task 4
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
        detail = ok ? 'redeploy verified ready' : `redeploy.sh exit=${p.exitCode}: ${new TextDecoder().decode(p.stderr).slice(0, 300)}`;
      } else if (a.kind === 'AUTH_CHECK') {
        const p = Bun.spawnSync(['bash', `${opts.projectDir}/scripts/auto-enrich.sh`, '--auth-check-only'], { cwd: opts.projectDir });
        ok = p.exitCode === 0;
        detail = ok ? 'auth ok' : `auth check failed rc=${p.exitCode} — see logs/auth-precheck-last.log`;
      } else if (a.kind === 'QUARANTINE_SOURCE' && a.target) {
        const path = `${opts.projectDir}/config/quarantined-sources.json`;
        const q = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { sources: {} };
        if (!q.sources[a.target]) {
          q.sources[a.target] = { since: new Date().toISOString().slice(0, 10), reason: 'SOURCE_DEAD ≥3 consecutive zero/failed runs (auto)' };
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
```

- [ ] **Step 3: Create `scripts/redeploy.sh`** — the standalone, gate-respecting redeploy the responder (and humans) call:

```bash
#!/bin/bash
# Gate-respecting standalone redeploy (Phase 2A). Used by the STALE_DEPLOY
# responder and by humans. Refuses when the deploy-gate refuses; verifies
# platform-side state=ready (CLI exit 0 ≠ published — banked gotcha).
# Does NOT write deploy-cadence lines: only the pipeline's run_deploy records
# cadence (manual success lines masked a real drought once — S193).
set -o pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR" || exit 1
bash scripts/deploy-gate.sh || { echo "[redeploy] deploy-gate refused" >&2; exit 2; }
OUT=$(mktemp); ERR=$(mktemp)
netlify deploy --prod --no-build --dir=dist --message "Responder redeploy $(date +%Y-%m-%dT%H:%M)" --json >"$OUT" 2>"$ERR" &
PID=$!
( END=$(( $(date +%s) + ${DEPLOY_TIMEOUT:-900} )); while [ "$(date +%s)" -lt "$END" ]; do kill -0 "$PID" 2>/dev/null || exit 0; sleep 15; done; kill "$PID" 2>/dev/null ) &
WD=$!
RC=0; wait "$PID" || RC=$?
kill "$WD" 2>/dev/null; wait "$WD" 2>/dev/null
[ "$RC" -ne 0 ] && { echo "[redeploy] CLI exit=$RC $(head -c 300 "$ERR")" >&2; exit 3; }
SITE_ID=$(jq -r .siteId .netlify/state.json); DID=$(tr -d '\000-\010\013\014\016-\037' <"$OUT" | jq -r '.deploy_id // .id // empty')
[ -z "$DID" ] && { echo "[redeploy] no deploy id in CLI output" >&2; exit 4; }
STATE=$(netlify api getSiteDeploy --data "{\"site_id\":\"$SITE_ID\",\"deploy_id\":\"$DID\"}" 2>/dev/null | jq -r .state)
[ "$STATE" = "ready" ] || { echo "[redeploy] state=$STATE (not ready)" >&2; exit 5; }
echo "[redeploy] verified ready deploy_id=$DID"
```

- [ ] **Step 4: Green + executor stub tests.** Add to the test file: executor dry-run returns `ran:false`; QUARANTINE_SOURCE against a temp config path writes the entry (use a temp `projectDir` with a `config/` dir and a stub `scripts/redeploy.sh` that exits 0 — never the real one). Run `bun test tests/watchdog-responders.test.ts` → all green. `bash -n scripts/redeploy.sh` → clean.

- [ ] **Step 5: Commit** — `git add src/watchdog/responders.ts scripts/redeploy.sh tests/watchdog-responders.test.ts && git commit -m "feat(responder): pure planner + cooldown executor + gate-respecting redeploy"`.

---

### Task 2: Wire responders into the deadman

**Files:**
- Modify: `scripts/deadman-watchdog.ts` (insert between `:382` `classifyDeadman` and the `:395` OK/else delivery block)
- Test: extend `tests/watchdog-responders.test.ts` (wiring pin)

**Interfaces:**
- Consumes: `planResponse`/`executeActions` (Task 1). State file: `data/responder-state.json` (gitignored — add to `.gitignore`).
- Produces: notification/email/push bodies gain a `Responder:` section listing outcomes; heartbeat row gains a `responder` column (e.g. `REDEPLOY:ok`); `DRY_RUN` env (already read at :386) also dry-runs responders.

- [ ] **Step 1 (RED):** wiring pin — a test that greps `scripts/deadman-watchdog.ts` for `planResponse(` and `executeActions(` (same textual-pin style as the settings pins; the behavioral coverage lives in Task 1's unit tests). Watch it fail.
- [ ] **Step 2:** insert after `const result: DeadmanResult = classifyDeadman(inputs);` (line 382):

```ts
// Responder layer (Phase 2A): scoped action BEFORE notification so the alert
// arrives with its outcome ("redeploy attempted → verified ready"). Fault-
// isolated like every adapter; DRY_RUN plans but never executes.
const plannedActions = safe(() => planResponse(result, loadResponderState(RESPONDER_STATE_PATH), nowMs), []);
const responderOutcomes = await executeActions(plannedActions, {
  dryRun: DRY_RUN,
  statePath: RESPONDER_STATE_PATH,
  projectDir: PROJECT_DIR,
}).catch(() => []);
const responderLine = responderOutcomes.map((o) => `${o.kind}${o.target ? ':' + o.target : ''}=${o.ok === null ? 'planned' : o.ok ? 'ok' : 'FAILED'}`).join(' ') || 'none';
```

with `RESPONDER_STATE_PATH`/`PROJECT_DIR`/`loadResponderState` defined alongside the other config constants, the `Responder: ${responderLine}` line appended to `body` (:400-405) and the push text (:431), and `responder: responderLine` added to `writeHeartbeat` (:444-452).
- [ ] **Step 3:** `bun test tests/watchdog-responders.test.ts` green; then a **DRY_RUN canary**: `DRY_RUN=1 bun run scripts/deadman-watchdog.ts` — expect classification output plus planned-not-executed responder lines, exit code unchanged. Then the real 6h launchd slot runs it live; with all signals green today the responder should plan nothing (verify next heartbeat row shows `responder: none`).
- [ ] **Step 4:** Commit.

---

### Task 3: Source quarantine honored by the scraper

**Files:**
- Create: `config/quarantined-sources.json` (seed: `{ "sources": {} }`)
- Modify: `scripts/scrape-all.ts` main loop (~:1660-1680 where `sourcesToRun` is computed from `SOURCES`) and `scripts/deadman-watchdog.ts` `deadSourcesSignal` (:162-171) to skip already-quarantined sources (ends the 2-week clubber alert spam)
- Test: `tests/quarantine-sources.test.ts`

**Interfaces:**
- Produces: `loadQuarantine(path?): { sources: Record<string, { since: string; reason: string }> }` exported from a small `src/utils/quarantine.ts`; scrape-all logs `⏸ QUARANTINED <id> (since <date>)` and writes a `scrape_stats` row with `success=1, events_found=0, error_message='quarantined'` is **wrong** — write NO scrape_stats row for quarantined sources (a fake success row would poison `deadSourcesSignal` history); just skip.

- [ ] **Step 1 (RED):** test: with a temp quarantine file naming `clubber`, the sources list excludes clubber and includes athinorama; with the seed empty file, nothing is excluded; `deadSourcesSignal`-side: quarantined ids are filtered from its return (test the filter as a pure function on a string array).
- [ ] **Step 2:** implement `src/utils/quarantine.ts` + wire both consumers. In scrape-all, filter `sourcesToRun = sourcesToRun.filter(id => !quarantined[id])` with the skip log.
- [ ] **Step 3:** green; `bun run scripts/scrape-all.ts --dry-run --source clubber` after seeding clubber in the config → prints the quarantine skip and scrapes nothing. **Then actually quarantine clubber** (it has been captcha-dead since Jul 29; the responder would do this on the next SOURCE_DEAD anyway): add the entry with reason `sgcaptcha wall since 2026-07-29 (S222)`. Un-quarantining later is a decisions-queue item.
- [ ] **Step 4:** Commit (config seed + code + test).

---

### Task 4: Addressless-venue auto-proposal (`venue-address-autofix.ts`)

The deadman already computes `addresslessVenuesSignal()` (deadman-watchdog.ts:201, classifier `ADDRESSLESS_VENUES` status) — the detection half of mistakes.md:1197's proposal exists. This task builds the response half: **geocode and propose, never auto-write the curated config**.

**Files:**
- Create: `scripts/venue-address-autofix.ts`
- Modify: `scripts/daily-automated.sh` — invoke in full mode BEFORE the build phase (so proposals exist before the F2b gate could fire)
- Test: `tests/venue-address-autofix.test.ts`

**Interfaces:**
- Consumes: the same venue query `addresslessVenuesSignal` uses (read that function first and reuse its SQL verbatim); the existing geocoding util used by `scripts/geocode-missing-venues.ts` (read it; reuse its client + env key, do not duplicate).
- Produces: `data/venue-address-proposals.json` — `[{ venue, proposedAddress, geocodeConfidence, since }]` — consumed by the decisions queue (Task 5). Exit 0 always (advisory; the F2b gate stays the enforcement point).

- [ ] **Step 1 (RED):** test the pure core `buildProposals(venues: string[], geocode: (v) => Promise<GeoResult|null>)` with a stub geocoder: found → proposal row with address + confidence; not-found → row with `proposedAddress: null` (still queued — the human must decide); dedup per venue.
- [ ] **Step 2:** implement; CLI shell reads DB (readonly) → writes the proposals file. Wire one line into `daily-automated.sh` full mode before the build phase: `bun run scripts/venue-address-autofix.ts || log "venue-autofix advisory failed (non-fatal)"`.
- [ ] **Step 3:** green + live smoke: run once; inspect proposals file (health reports say ~20 unverified venues exist, so expect rows). Commit.

---

### Task 5: Self-clearing decisions queue

**Files:**
- Create: `scripts/decisions-queue.ts` → generates `docs/DECISIONS-QUEUE.md`
- Test: `tests/decisions-queue.test.ts`

**Interfaces:**
- Consumes (each a predicate function over existing artifacts — inject file/DB contents for tests): venue-address proposals (Task 4 file, pending while venue still lacks an address in `config/athens-venues.json`); quarantined sources (pending while entry exists); `event_concerns` rows of types `venue-mismatch-or-unknown` / `venue-change-suspected` on **upcoming** events (pending while the event row is unchanged); operator one-timers from a static registry in the script (GitHub App install — PHASE3.md §5 step 1; `sudo pmset` runbook — LAUNCHD-SETUP.md; affiliate/partnership submissions arrive in Phase 3).
- Produces: `docs/DECISIONS-QUEUE.md` with header `<!-- COMPUTED by scripts/decisions-queue.ts — do not edit; fix the underlying thing and regenerate -->`, sections per kind, each entry with evidence and the exact action to take. **Every count computed, nothing hand-maintained.**

- [ ] **Step 1 (RED):** tests with synthetic inputs: an addressless proposal renders an entry; the same venue WITH a config address renders nothing (self-clearing — this is the load-bearing assertion, pin it both ways); quarantined source renders with its `since`; empty inputs → the file still renders with "Nothing pending" (never a missing file).
- [ ] **Step 2:** implement (pure `renderQueue(inputs): string` + CLI shell gathering inputs). Wire into `daily-automated.sh` right after venue-address-autofix. The pipeline's artifact commit picks the .md up daily.
- [ ] **Step 3:** green + live generation; read the output yourself for sanity. Commit.

---

### Task 6: Computed weekly digest

**Files:**
- Create: `scripts/weekly-digest.ts` → `docs/digest/YYYY-'W'WW.md`; plist `com.agentathens.digest` (Sundays 08:30, after the 08:00 run's scrape starts but reading last-7-days data — timing is fine because all inputs are file/DB reads)
- Test: `tests/weekly-digest.test.ts`

**Interfaces:**
- Consumes (all injected for tests): `logs/deploy-cadence.log` (deploy-success days — same parsing as `phase1-exit-gate.ts`; import `evaluateGate`'s date-extraction or reuse the log-parsing helper — do NOT re-implement), `enrichment_log` saves/day, `scrape_stats` per-source totals + quarantine list, `data/search-visibility-log.csv` last row (bing position/impressions; gsc columns will say STALE until Phase 3), `docs/DECISIONS-QUEUE.md` pending count (parse its computed header count), `scripts/phase1-exit-gate.ts` verdict (run it, capture PASS/FAIL — while Phase 1's gate is open this is the headline).
- Produces: one markdown file per ISO week + an ntfy push of the 5-line summary via the deadman's `sendPush` (import it — deadman-watchdog.ts:304 exports it; the import is safe because main() is `import.meta.main`-guarded).

- [ ] **Step 1 (RED):** test `renderDigest(inputs)` with synthetic inputs: 7/7 green week renders "7/7 deploys"; a week with quarantined clubber lists it under Sources; zero-save days render honestly ("2 zero-save days"); a FAIL exit-gate renders the FAIL headline. Assert the fixture precondition (inputs actually contain the mixed cases).
- [ ] **Step 2:** implement render + CLI gather. Create the plist (copy `com.agentathens.check-deploy-cadence.plist` structure: `StartCalendarInterval` Sunday `Weekday=0` `Hour=8 Minute=30`, label `com.agentathens.digest`, program `bun run scripts/weekly-digest.ts`), install to `~/Library/LaunchAgents`, `launchctl load`. Per LAUNCHD-SETUP.md:79-83, the installed plist is operational truth — also commit the repo template copy.
- [ ] **Step 3:** green; run once manually (`bun run scripts/weekly-digest.ts`), read the digest, verify the ntfy push arrives on your device. Then `launchctl start com.agentathens.digest` as the launchd canary. Commit.

---

### Task 7: Arm `phase3-weekly` (measurement without a session)

- [ ] **Step 1:** Read `scripts/phase3-weekly.sh` (118 lines) fully — its header specifies label `com.agentathens.phase3-weekly`, Sundays 09:47, and a `PHASE3_SMOKE=1` prerequisite-check mode. Honor exactly what the header specifies; do not redesign.
- [ ] **Step 2:** `PHASE3_SMOKE=1 bash scripts/phase3-weekly.sh` — fix only missing prerequisites it reports (the Perplexity key already exists at `~/.config/agentathens/perplexity-api-key` per the leverage audit §1c).
- [ ] **Step 3:** Write + install + `launchctl load` the plist per the header spec; run one `launchctl start com.agentathens.phase3-weekly` canary; verify `logs/phase3-weekly.log` appears and the probe artifacts land where the script says. Commit the repo template.

---

### Task 8: Validation gate + record

- [ ] **Step 1:** Full suite green (known env failures only); merge worktree → main; push; remove worktree.
- [ ] **Step 2:** DRY_RUN deadman + one live 6h heartbeat showing `responder:` column; digest + decisions-queue files generated and committed by the next daily run.
- [ ] **Step 3:** Append S-entry to `.claude/notes/mistakes.md` (only if new bugs surfaced) + session-log entry. Update `docs/known-issues.md` clubber entry status → quarantined.
- [ ] **Step 4:** The spec's Phase-2 exit gate (14 zero-intervention days) starts counting only when 2B also lands; note the start date in the session log when it does.

## Self-Review (performed at write time)

- **Spec coverage §5.1:** STALE_DEPLOY→redeploy ✓(T1/T2), SOURCE_DEAD→quarantine ✓(T1/T3), AUTH_FAIL→capture+escalate ✓(AUTH_CHECK action; capture exists via Phase-1 log), DB_MISSING→human-only runbook surfaced ✓(T1/T5). §5.5: decisions queue ✓(T5), weekly digest ✓(T6), arm phase3-weekly ✓(T7). Cloud backstop routine (§5.2) is **deliberately deferred to the operator GitHub App install** — it appears as a decisions-queue one-timer (T5); the routine itself gets built in a follow-up once the App is installed (it cannot file issues without it).
- **Placeholder scan:** two bounded read-first instructions (reuse `addresslessVenuesSignal` SQL, honor `phase3-weekly.sh` header) — explicit executor steps, not gaps.
- **Type consistency:** `PlannedAction`/`ActionOutcome`/`ResponderState` consistent across T1/T2; quarantine shape `{sources: Record<id,{since,reason}>}` consistent across T1-executor/T3/T5/T6.
