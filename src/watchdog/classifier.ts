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

export type DeadmanStatus = "OK" | "STALE_DEPLOY" | "STALE_ENRICH" | "PIPELINE_FAIL";

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
  const { lastDeployMs, lastEnrichMs, pipelineHealthy, authPrecheckOk, nowMs, thresholds } = inputs;
  const reasons: string[] = [];

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

  // Primary status by outcome-first priority; reasons[] still names every breach.
  let status: DeadmanStatus = "OK";
  if (deployStale) status = "STALE_DEPLOY";
  else if (enrichStale) status = "STALE_ENRICH";
  else if (!pipelineHealthy) status = "PIPELINE_FAIL";

  return { status, reasons };
}
