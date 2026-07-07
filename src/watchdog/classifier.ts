// Pure freshness classifier for the deadman watchdog.
//
// Pure by design: all inputs (including `nowMs` and thresholds) are injected, no
// I/O, no Date.now() — so it is exhaustively unit-testable and deterministic. The
// runner (scripts/deadman-watchdog.ts) gathers the live signals via adapters and
// hands them here. Everything is epoch-ms end to end: callers must normalize any
// ISO-UTC / date-only / offset-bearing timestamp to epoch-ms BEFORE this point, so
// no timezone ambiguity reaches the staleness math (a 3am-phantom-alert guard).
//
// Why "watch outcomes, not precursors": the June 2026 enrichment outage degraded
// the auth precursor gradually (hang → fast-fail over days) while the clean,
// user-visible symptom was simply "no fresh enrichment landing". So MAX(enriched_at)
// staleness is PRIMARY; auth-precheck state only CORROBORATES (can force a flag when
// the DB still looks fresh, never silences one).

export type DeadmanStatus =
  | "OK"
  | "DB_MISSING"
  | "STALE_DEPLOY"
  | "STALE_ENRICH"
  | "PIPELINE_FAIL"
  | "ADDRESSLESS_VENUES"
  | "SOURCE_DEAD";

export interface DeadmanThresholds {
  deployStaleHours: number;
  enrichStaleHours: number;
}

export interface DeadmanInputs {
  /** epoch-ms of last deploy-success; null = signal missing (treated as stale). */
  lastDeployMs: number | null;
  /** epoch-ms of MAX(enriched_at); null = signal missing (treated as stale). */
  lastEnrichMs: number | null;
  /** launchd (or future routine) health: false = a pipeline job last-exited non-zero. */
  pipelineHealthy: boolean;
  /** corroborating only: false forces STALE_ENRICH; null = unknown (log absent), ignored. */
  authPrecheckOk: boolean | null;
  /** events table row count; null = DB missing/unreadable, 0 = empty — both CATASTROPHIC. */
  dbRowCount: number | null;
  /** true = the DB read failed BUSY/LOCKED while the file exists (writer active).
   *  Suppresses DB_MISSING — WAL contention during enrichment is normal, not a
   *  catastrophe (the 2026-07-05 double false-alarm). Default false. */
  dbBusy?: boolean;
  /** active source ids with ≥3 consecutive zero/failed scrape runs (adapter-computed).
   *  Silent source death — each shrinks the product invisibly. Default []. */
  deadSources?: string[];
  /** venue names of publishable events whose address resolves empty (DB + config).
   *  Each is a future F2b hard-stop → deploy drought (the June freeze class). Default []. */
  addresslessVenues?: string[];
  /** last build-failure error line (from logs/build-outcome.log) newer than the last
   *  deploy; surfaced with STALE_DEPLOY so a drought arrives pre-diagnosed. Default null. */
  buildFailureCause?: string | null;
  nowMs: number;
  thresholds: DeadmanThresholds;
}

export interface DeadmanResult {
  status: DeadmanStatus;
  /** every failing signal, each naming its stale-by duration; empty when OK. */
  reasons: string[];
}

function ageHours(tsMs: number, nowMs: number): number {
  return (nowMs - tsMs) / 3_600_000;
}

/** Stale iff the signal is missing, or strictly older than the threshold. */
function isStale(tsMs: number | null, nowMs: number, thresholdHours: number): boolean {
  if (tsMs === null) return true;
  return ageHours(tsMs, nowMs) > thresholdHours;
}

export function classifyDeadman(inputs: DeadmanInputs): DeadmanResult {
  const {
    lastDeployMs, lastEnrichMs, pipelineHealthy, authPrecheckOk, dbRowCount, nowMs, thresholds,
    dbBusy = false, deadSources = [], addresslessVenues = [], buildFailureCause = null,
  } = inputs;
  const reasons: string[] = [];

  // DB presence/row floor — the catastrophe that precedes every other signal: if
  // events.db is gone or empty, the deploy is serving a frozen/stale site and
  // enrichment can't run. Highest priority so "restore required" headlines instead
  // of being masked under STALE_DEPLOY (the 2026-06-30 incident).
  // dbBusy exception: an unreadable-but-present DB under an active writer is WAL
  // contention, not loss — no reason pushed (the adapter already retried once).
  const dbDegenerate = (dbRowCount === null && !dbBusy) || (dbRowCount !== null && dbRowCount <= 0);
  if (dbDegenerate) {
    reasons.push(
      dbRowCount === null
        ? "db: events.db missing or unreadable — CATASTROPHIC, restore from backup required"
        : "db: events.db has 0 rows (empty) — CATASTROPHIC, restore from backup required",
    );
  }

  // Deploy freshness (outcome — a dark site is the highest-impact symptom).
  const deployStale = isStale(lastDeployMs, nowMs, thresholds.deployStaleHours);
  if (deployStale) {
    reasons.push(
      lastDeployMs === null
        ? "deploy: no deploy-success signal found (logs/deploy-cadence.log missing/empty)"
        : `deploy: stale by ${ageHours(lastDeployMs, nowMs).toFixed(1)}h (threshold ${thresholds.deployStaleHours}h)`,
    );
  }

  // Enrichment freshness — MAX(enriched_at) PRIMARY, auth-precheck CORROBORATING.
  const enrichDbStale = isStale(lastEnrichMs, nowMs, thresholds.enrichStaleHours);
  const authForcesFlag = authPrecheckOk === false;
  if (enrichDbStale) {
    reasons.push(
      lastEnrichMs === null
        ? "enrich: no enriched_at value in DB"
        : `enrich: stale by ${ageHours(lastEnrichMs, nowMs).toFixed(1)}h (threshold ${thresholds.enrichStaleHours}h)`,
    );
  }
  if (authForcesFlag) {
    reasons.push("enrich: auth pre-check failing (corroborating — fresh DB but enrichment writes will stop)");
  }
  const enrichStale = enrichDbStale || authForcesFlag;

  // Pipeline health (precursor — fires even when outcomes still look fresh).
  if (!pipelineHealthy) {
    reasons.push("pipeline: a scheduled job last-exited non-zero (health adapter)");
  }

  // Build-failure cause (campaign Phase 5): a drought should arrive pre-diagnosed.
  // Only meaningful alongside a stale deploy — a fresh deploy supersedes old causes.
  if (deployStale && buildFailureCause) {
    reasons.push(`build: last failure — ${buildFailureCause}`);
  }

  // Addressless publishable venues (pre-drought warning): each one is a future
  // F2b schema-gate hard-stop → blocked deploy (the June 2026 3-week freeze class).
  if (addresslessVenues.length > 0) {
    reasons.push(
      `venues: ${addresslessVenues.length} publishable venue(s) missing address — ` +
      `F2b gate will hard-stop the next build. Add to config/athens-venues.json: ` +
      addresslessVenues.join(', '),
    );
  }

  // Silent source death: ≥3 consecutive zero/failed runs for a source that used
  // to produce. Not a freshness breach, but the product shrinks invisibly.
  for (const src of deadSources) {
    reasons.push(`source: ${src} returned 0 events / failed for ≥3 consecutive runs (SOURCE_DEAD)`);
  }

  // Primary status by outcome-first priority; reasons[] still names every breach.
  // DB_MISSING outranks all — it's the precondition failure under the others.
  // ADDRESSLESS_VENUES outranks SOURCE_DEAD: it blocks the NEXT build, a dead
  // source only thins future content.
  let status: DeadmanStatus = "OK";
  if (dbDegenerate) status = "DB_MISSING";
  else if (deployStale) status = "STALE_DEPLOY";
  else if (enrichStale) status = "STALE_ENRICH";
  else if (!pipelineHealthy) status = "PIPELINE_FAIL";
  else if (addresslessVenues.length > 0) status = "ADDRESSLESS_VENUES";
  else if (deadSources.length > 0) status = "SOURCE_DEAD";

  return { status, reasons };
}
