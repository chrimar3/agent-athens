#!/usr/bin/env bun
// Deadman watchdog — independent freshness alarm.
//
// Runs on its OWN launchd slot (com.agentathens.deadman, every 6h), independent of
// the pipeline slots so it fires even when they are dead/unloaded. Closes the silent-
// drought class (4 occurrences, 4 distinct causes, 1 shared root: no active delivery).
//
// Three signals → pure classifier (src/watchdog/classifier.ts) → FOUR delivery layers
// on breach: (1) osascript notification, (2) msmtp email, (3) heartbeat row,
// (4) ntfy.sh push (off-machine; the unguessable topic is the only access control,
// so the topic is a secret read from $AGENTATHENS_NTFY_TOPIC or the untracked file
// ~/.config/agentathens/ntfy-topic — never from the tracked config). If the email
// send itself fails, layer (1) escalates with a distinct "EMAIL DELIVERY FAILED"
// notification and layer (3) records email_ok=false — we never silently lose the
// alert, and we never add a second EMAIL transport (one SMTP path, no
// GUI/TCC-flaky fallback; the push layer is a different axis, not email).
//
// Everything is epoch-ms end to end: each adapter normalizes its timestamp (ISO-UTC
// deploy log, date-only/offset sitemap lastmod) to epoch-ms BEFORE the classifier, so
// no timezone parse mismatch can read fresh-as-stale across midnight.
//
// Security loop round 7: the repo's logs/ folder is written by pipeline
// containers. Deploy freshness therefore comes from the HOST record
// ${AA_STATE_DIR:-~/.config/agentathens-docker}/deploys.log when it exists
// (newest non-restore line); only without it (container setup not installed)
// from logs/deploy-cadence.log, and then every alert says "from
// container-writable logs". Every logs/ read is bounded, refuses symlinks and
// non-regular files, parses strictly, and quoted text has control characters
// removed (src/watchdog/signal-sources.ts). So is every reason before delivery.
//
// Security loop round 8: data/events.db is container-written too, and a
// planted recursive VIEW named `events` once hung this watchdog forever. The
// DB is never opened here: every DB signal comes from ONE queryUntrustedDb()
// read (src/watchdog/untrusted-db.ts: private copy, no views or foreign
// triggers, queries in a child killed after 30 s). A refused or runaway DB is
// its own status, DB_REFUSED, and says so in the alert. The whole run also
// has a wall-clock limit (10 min): when it is hit the watchdog alerts through
// the same notification, email, push and heartbeat layers and exits 1.

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { classifyDeadman, type DeadmanInputs, type DeadmanResult } from "../src/watchdog/classifier";
import { planResponse, executeActions, hostStateDir, type ResponderState } from "../src/watchdog/responders";
import { osascriptNotificationArgv } from "../src/watchdog/notify";
import { appendFileNoFollow, hostLogDir } from "../src/watchdog/host-files";
import { sendEmail, type EmailConfig } from "../src/watchdog/email";
import {
  authPrecheckFromLog, buildFailureCauseFromLog, deployFreshness, stripControl, type DeploySignal,
} from "../src/watchdog/signal-sources";
import { loadQuarantine, filterQuarantined } from "../src/utils/quarantine";
import { findVenueConfig } from "../src/quality/location-filter";
import { ACTIVE_SOURCE_IDS } from "../src/config/active-source-ids";
import {
  killUntrustedDbReaders, queryUntrustedDb, UNTRUSTED_DB_DEFAULT_TIMEOUT_MS, type UntrustedDbResult, type UntrustedQuery,
} from "../src/watchdog/untrusted-db";

const ROOT = resolve(import.meta.dir, "..");
const CONFIG_PATH = join(ROOT, "config", "monitoring.json");
const DEPLOY_LOG = join(ROOT, "logs", "deploy-cadence.log");
const AUTH_LOG = join(ROOT, "logs", "auth-precheck-last.log");
// Resolved at CALL time (not module load) so tests can point at a fixture DB via
// DEADMAN_DB_PATH regardless of module-import order.
const dbPath = (): string => process.env.DEADMAN_DB_PATH || join(ROOT, "data", "events.db");
// DEADMAN_DRY_RUN=1 → classify + print, skip all delivery (notify/email/heartbeat).
// Lets the watchdog be verified against a degenerate DB without spamming channels.
const DRY_RUN = process.env.DEADMAN_DRY_RUN === "1";
// Round 8: wall clock for the whole run and for the one DB read. The env
// overrides are test seams (a positive integer of milliseconds, else ignored).
const msFromEnv = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isSafeInteger(v) && v > 0 ? v : fallback;
};
export const DEADMAN_WALL_CLOCK_MS = 10 * 60_000;
const wallClockMs = (): number => msFromEnv("DEADMAN_WALL_CLOCK_MS", DEADMAN_WALL_CLOCK_MS);
const dbTimeoutMs = (): number => msFromEnv("DEADMAN_DB_TIMEOUT_MS", UNTRUSTED_DB_DEFAULT_TIMEOUT_MS);
// Host-only (security loop round 4): logs/ is writable by pipeline
// containers, which could plant a symlink there for this host job to write
// through. The heartbeat lives in hostLogDir() and is opened O_NOFOLLOW.
// Resolved at call time so tests can point AA_STATE_DIR at a temp dir.
export const heartbeatPath = (): string => join(hostLogDir(), "deadman-heartbeat.csv");
// Responder cooldown state (Phase 2A); deleting it merely re-enables actions
// immediately, so it is safe to lose. Kept in the HOST-only state dir
// (AA_STATE_DIR, default ~/.config/agentathens-docker) since security loop
// round 3: data/ is writable by pipeline containers, and cooldowns decide how
// often the host acts. Resolved at call time so tests can point AA_STATE_DIR
// at a temp dir.
const responderStatePath = (): string => join(hostStateDir(), "responder-state.json");
function loadResponderState(path: string): ResponderState {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ResponderState;
  } catch {
    return { lastActionMs: {} };
  }
}
const SITEMAP_URL = "https://agentathens.com/sitemap-events.xml";

export interface MonitoringConfig {
  deploy_stale_hours: number;
  enrich_stale_hours: number;
  pipeline_health_labels: string[];
  notify: { enabled: boolean };
  email: EmailConfig;
  // Layer 4 — off-machine push via ntfy. Optional so older configs stay valid.
  // No topic here: the repo is public and the topic name is the ONLY access
  // control, so it comes from resolvePushTopic() (env or untracked file) and
  // must never appear in alert bodies or logs.
  push?: { enabled: boolean; server?: string };
}

export const NTFY_TOPIC_ENV = "AGENTATHENS_NTFY_TOPIC";
/** Override for the topic file path (tests point it at a temp dir). */
export const NTFY_TOPIC_FILE_ENV = "AGENTATHENS_NTFY_TOPIC_FILE";
const ntfyTopicFile = (): string =>
  process.env[NTFY_TOPIC_FILE_ENV] || join(homedir(), ".config", "agentathens", "ntfy-topic");
// ntfy topic names: letters, digits, `_` and `-`, at most 64 chars. Anything
// else (a slash, a query string) would change the request URL, so it is refused.
const NTFY_TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** The push topic: $AGENTATHENS_NTFY_TOPIC, else the untracked topic file.
 *  Never throws. On failure `detail` says where to put it; the rejected value
 *  itself is never echoed (it may be a near-miss of the real secret). */
export function resolvePushTopic(): { topic: string } | { topic: null; detail: string } {
  const file = ntfyTopicFile();
  let raw = process.env[NTFY_TOPIC_ENV]?.trim() || "";
  if (!raw) {
    try {
      if (existsSync(file)) raw = readFileSync(file, "utf-8").trim();
    } catch {
      raw = "";
    }
  }
  if (!raw) {
    return { topic: null, detail: `push topic not configured — set $${NTFY_TOPIC_ENV} or write it to ${file}` };
  }
  if (!NTFY_TOPIC_RE.test(raw)) {
    return { topic: null, detail: `push topic rejected — must match ${NTFY_TOPIC_RE} (check $${NTFY_TOPIC_ENV} / ${file})` };
  }
  return { topic: raw };
}

function loadConfig(): MonitoringConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

// ── Signal adapters ────────────────────────────────────────────────────────────
// Each returns epoch-ms | null (null = signal missing → classifier treats as stale).
// Each is independently fault-isolated by the caller: an adapter throwing degrades
// that one signal to "unknown", never crashes the watchdog.

/** Deploy freshness (round 7): the host record deploys.log when it exists;
 *  otherwise logs/deploy-cadence.log (container-writable, labelled as such),
 *  and only when that has no deploy-success line, the live sitemap. */
async function deploySignal(): Promise<DeploySignal> {
  const sig = deployFreshness(hostStateDir(), DEPLOY_LOG);
  if (sig.source === "host-record" || sig.ms !== null) return sig;
  // Fallback: newest <lastmod> from the live sitemap (date-only or offset → epoch-ms).
  const label = `${sig.label}; value from the live sitemap lastmod`;
  try {
    const res = await fetch(SITEMAP_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return sig;
    const xml = (await res.text()).slice(0, 5_000_000);
    const stamps = [...xml.matchAll(/<lastmod>([^<]{1,64})<\/lastmod>/g)]
      .map((mm) => Date.parse(mm[1].trim()))
      .filter((n) => !Number.isNaN(n));
    return stamps.length ? { ms: Math.max(...stamps), source: sig.source, label } : sig;
  } catch {
    return sig;
  }
}

/** Silent source death (campaign Phase 5): an active source whose last
 *  SOURCE_DEAD_STREAK runs all returned 0 events or failed.
 *
 *  Two rules, one anti-flap intent:
 *  - Zero-event runs that still report success=1 are AMBIGUOUS (dormant/seasonal
 *    sources legitimately produce nothing for weeks — low-volume sources like
 *    benaki must not flap), so those only count as dead while the source produced
 *    events within the last 30 days.
 *  - A streak of HARD failures (success=0) is never seasonal quietness — a dormant
 *    source succeeds with 0 events; a broken one errors. So an all-hard-failed
 *    streak is reported REGARDLESS of when the source last produced. Without this,
 *    a source dead longer than 30 days silently dropped out of the alert set —
 *    going quiet precisely because it had been broken too long (the clubber.gr
 *    blind spot: alerts would have stopped ~2026-08-04). Brand-new sources are
 *    still protected by the streak-length floor, and there is no flap: hard
 *    failures either persist (keep alerting) or resolve (stop alerting). */
const SOURCE_DEAD_STREAK = 3;

/** Every query the watchdog runs against events.db, read in ONE untrusted-DB
 *  pass (round 8). Only SELECTs; the rows are validated where they are used. */
function deadmanDbQueries(): Record<string, UntrustedQuery> {
  const q: Record<string, UntrustedQuery> = {
    // Enrichment freshness: MAX(enriched_at).
    enrich: { sql: "SELECT MAX(enriched_at) AS m FROM events", tables: ["events"] },
    // DB presence/row floor: events table row count.
    count: { sql: "SELECT COUNT(*) AS c FROM events", tables: ["events"] },
    // Addressless publishable venues (see addresslessFromDb).
    addressless: {
      sql: `SELECT DISTINCT venue_name FROM events
       WHERE location_status IN ('verified_athens', 'pass_through')
         AND merged_into IS NULL
         AND is_cancelled = 0
         AND (venue_address IS NULL OR TRIM(venue_address) = '')
         AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')`,
      tables: ["events"],
    },
  };
  for (const src of ACTIVE_SOURCE_IDS) {
    q[`runs:${src}`] = {
      sql: `SELECT events_found, success FROM scrape_stats
         WHERE source = ? ORDER BY scraped_at DESC LIMIT ?`,
      params: [src, SOURCE_DEAD_STREAK],
      tables: ["scrape_stats"],
    };
    q[`recent:${src}`] = {
      sql: `SELECT 1 AS hit FROM scrape_stats
         WHERE source = ? AND events_found > 0 AND scraped_at >= datetime('now', '-30 days')
         LIMIT 1`,
      params: [src],
      tables: ["scrape_stats"],
    };
  }
  return q;
}

/** One untrusted read of events.db (round 8). A failing count query counts as
 *  a failed read (the busy retry below applies to it). */
async function readDeadmanDb(requireTables: string[] = ["events"]): Promise<UntrustedDbResult> {
  const r = await queryUntrustedDb({
    dbPath: dbPath(),
    requireTables,
    queries: deadmanDbQueries(),
    timeoutMs: dbTimeoutMs(),
  });
  if (r.ok && r.errors.count) return { ok: false, kind: "error", detail: `row count query failed: ${r.errors.count}` };
  return r;
}

/** Busy-vs-missing disambiguation (campaign Phase 5). On 2026-07-05 the watchdog
 *  emailed CATASTROPHIC "DB missing" twice during ordinary WAL contention (the
 *  S195 class: readonly open succeeds, first read throws while the enrichment
 *  writer holds the lock). Retry once after 30s; if the file EXISTS but reads
 *  still fail, report busy — the classifier then declines to declare DB_MISSING.
 *  Round 8: a copy torn by a concurrent writer fails the same way (kind
 *  "error"); a missing file, a refusal or a timeout is not retried. */
export async function readDeadmanDbWithRetry(): Promise<{ res: UntrustedDbResult; busy: boolean }> {
  const first = await readDeadmanDb();
  if (first.ok || first.kind !== "error") return { res: first, busy: false };
  await Bun.sleep(30_000);
  const second = await readDeadmanDb();
  return { res: second, busy: !second.ok && second.kind === "error" };
}

function enrichFromDb(r: UntrustedDbResult): number | null {
  if (!r.ok) return null;
  const m = r.rows.enrich?.[0]?.m;
  if (typeof m !== "string" || !m) return null;
  // enriched_at is stored "YYYY-MM-DD HH:MM:SS" in Athens local wall-time; parse as such.
  const ms = Date.parse(m.replace(" ", "T")); // local-tz interpretation, → epoch-ms
  return Number.isNaN(ms) ? null : ms;
}

/** Row count, or null when the DB is missing, refused or unreadable. */
function rowCountFromDb(r: UntrustedDbResult): number | null {
  if (!r.ok) return null;
  const c = r.rows.count?.[0]?.c;
  return typeof c === "number" && Number.isSafeInteger(c) && c >= 0 ? c : null;
}

/** Dead sources from the rows of one untrusted read (see SOURCE_DEAD_STREAK). */
export function deadSourcesFromDb(r: UntrustedDbResult): string[] {
  if (!r.ok) return [];
  const dead: string[] = [];
  for (const src of ACTIVE_SOURCE_IDS) {
    const lastRuns = (r.rows[`runs:${src}`] ?? []) as Array<{ events_found: unknown; success: unknown }>;
    if (lastRuns.length < SOURCE_DEAD_STREAK) continue;
    const allDegenerate = lastRuns.every((row) => row.events_found === 0 || row.success === 0);
    if (!allDegenerate) continue;
    // Rule B — long-dead: every recent run HARD-FAILED. Not window-limited.
    const allHardFailed = lastRuns.every((row) => row.success === 0);
    if (allHardFailed) {
      dead.push(src);
      continue;
    }
    // Rule A — fresh death: quiet/failed streak on a source that was producing
    // within the window. (Beyond the window, quiet-but-succeeding is dormancy.)
    const producedRecently = (r.rows[`recent:${src}`] ?? []).length > 0;
    if (producedRecently) dead.push(src);
  }
  // Phase 2A: already-quarantined sources are handled — the digest lists
  // them; repeating SOURCE_DEAD every 6h for a known-quarantined source is
  // alert fatigue (clubber pushed 8+ identical alerts, S222).
  // DEADMAN_QUARANTINE_PATH: test seam, same pattern as DEADMAN_DB_PATH —
  // the dead-sources-window fixtures use clubber as their long-dead specimen
  // and must not be silenced by the REAL registry quarantining real clubber.
  const quarantinePath = process.env.DEADMAN_QUARANTINE_PATH || join(ROOT, "config", "quarantined-sources.json");
  return filterQuarantined(dead, loadQuarantine(quarantinePath));
}

/** Silent source death on its own (tests; main() reuses its one read):
 *  needs only scrape_stats. */
export async function deadSourcesSignal(): Promise<string[]> {
  return deadSourcesFromDb(await readDeadmanDb([]));
}

/** Addressless publishable venues (campaign Phase 5): the pre-drought signal.
 *  Mirrors the [address-guard] cascade (event.venue_address || config address):
 *  a publishable, still-current event whose venue resolves to no address is a
 *  future F2b hard-stop. The standing mitigation idea from mistakes.md
 *  2026-07-05, finally built — delivered through the one channel that reaches
 *  a human instead of a warn line in an unread scrape log. */
function addresslessFromDb(r: UntrustedDbResult): string[] {
  if (!r.ok) return [];
  return (r.rows.addressless ?? [])
    .map((row) => row.venue_name)
    .filter((name): name is string => typeof name === "string")
    .filter((name) => !findVenueConfig(name)?.address?.trim());
}

/** Last build-failure line from logs/build-outcome.log, if newer than the last
 *  deploy-success — so a drought's first alert already names the failing gate.
 *  Container-writable: bounded, strict, sanitized (signal-sources.ts). */
function buildFailureCauseSignal(lastDeployMs: number | null): string | null {
  return buildFailureCauseFromLog(join(ROOT, "logs", "build-outcome.log"), lastDeployMs);
}

/** Corroborating auth state: the last `exit=N` line in auth-precheck-last.log
 *  (container-writable; bounded, strict). null if absent. */
function authPrecheckOk(): boolean | null {
  return authPrecheckFromLog(AUTH_LOG);
}

/** Pluggable pipeline-health source — launchd today, swappable to routine-status later. */
interface PipelineHealthSource {
  readonly name: string;
  isHealthy(labels: string[]): boolean;
}

const launchdHealth: PipelineHealthSource = {
  name: "launchd",
  isHealthy(labels) {
    // `launchctl list <label>` prints a dict incl. "LastExitStatus" = N. A scheduled
    // job that last-exited non-zero (and isn't currently running) is unhealthy.
    for (const label of labels) {
      const out = Bun.spawnSync(["launchctl", "list", label], { timeout: 10_000, killSignal: "SIGKILL" });
      if (out.exitCode !== 0) continue; // label not loaded → not our failure to flag
      const text = new TextDecoder().decode(out.stdout);
      const exitM = text.match(/"LastExitStatus"\s*=\s*(-?\d+)/);
      const pidM = text.match(/"PID"\s*=\s*(\d+)/);
      if (pidM) continue; // currently running → fine
      if (exitM && exitM[1] !== "0") return false;
    }
    return true;
  },
};

// ── Delivery layers ──────────────────────────────────────────────────────────
// The message is result.reasons[0], which can quote a scraped venue name.
// It reaches AppleScript only as an argument (src/watchdog/notify.ts), never
// as script text (security loop round 4).
function fireNotification(title: string, subtitle: string, message: string): void {
  // Bounded (round 8): no sync call may outlast the run's wall clock.
  Bun.spawnSync(osascriptNotificationArgv({ title, subtitle, message, sound: "Basso" }), { timeout: 15_000, killSignal: "SIGKILL" });
}

/** Layer 4 — off-machine push via ntfy (https://ntfy.sh). A DIFFERENT AXIS from
 *  email, so it does not violate the "never a second email transport" rule above:
 *  it reaches the operator's phone/browser when they are away from this machine.
 *  No auth — the unguessable random topic (resolvePushTopic: env or untracked
 *  file, never the public repo) is the only access control, which is exactly why
 *  the alert body must carry no secrets (status + reasons only; the topic itself
 *  never goes in a body). No topic → skipped, and main() logs that once per run.
 *  Same { ok, skipped, detail } contract as sendEmail. NEVER throws/rejects —
 *  that non-throw guarantee is the fault isolation that keeps a push failure
 *  from crashing or silencing the other delivery layers. `fetchFn` is injectable
 *  so tests exercise this with zero live network calls. */
export async function sendPush(
  cfg: MonitoringConfig,
  title: string,
  body: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; skipped: boolean; detail: string }> {
  try {
    // Belt-and-braces: main() already exits before delivery in dry-run, but the
    // guard lives here too so no caller can push during DEADMAN_DRY_RUN=1.
    if (process.env.DEADMAN_DRY_RUN === "1") return { ok: false, skipped: true, detail: "dry-run" };
    if (!cfg.push?.enabled) return { ok: false, skipped: true, detail: "push disabled in config" };
    const resolved = resolvePushTopic();
    if (resolved.topic === null) return { ok: false, skipped: true, detail: resolved.detail };
    const topic = resolved.topic;
    const server = (cfg.push.server || "https://ntfy.sh").replace(/\/+$/, "");
    const res = await fetchFn(`${server}/${topic}`, {
      method: "POST",
      headers: { Title: title, Priority: "high", Tags: "rotating_light" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true, skipped: false, detail: "sent" };
    return { ok: false, skipped: false, detail: `ntfy HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, skipped: false, detail: `ntfy unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function writeHeartbeat(row: Record<string, string | number | boolean>): void {
  const header = "timestamp,status,deploy_age_h,enrich_age_h,pipeline_ok,email,reasons";
  const line = [
    row.timestamp, row.status, row.deploy_age_h, row.enrich_age_h, row.pipeline_ok, row.email,
    `"${String(row.reasons).replace(/"/g, "'")}"`,
  ].join(",");
  appendFileNoFollow(heartbeatPath(), line + "\n", header + "\n");
}

function ageH(ms: number | null, now: number): string {
  return ms === null ? "null" : ((now - ms) / 3_600_000).toFixed(1);
}

/** The alert line for a run stopped by its wall clock (round 8). */
export function wallClockReason(limitMs: number): string {
  const limit = limitMs >= 60_000 ? `${Math.round(limitMs / 60_000)} min` : `${limitMs / 1000} s`;
  return `deadman: this run hit its ${limit} wall-clock limit and was stopped before it checked every signal — ` +
    `something it reads is hanging (data/events.db, logs/, launchctl, the network or a responder). ` +
    `Run it by hand to see where: DEADMAN_DRY_RUN=1 bun run scripts/deadman-watchdog.ts`;
}

/** Wall clock hit (round 8): alert through the normal layers — notification,
 *  email, push, heartbeat — then exit 1. Each layer is bounded or never
 *  throws; a last timer exits even if one of them stalls. */
async function onWallClock(cfg: MonitoringConfig, limitMs: number): Promise<never> {
  setTimeout(() => process.exit(1), 90_000);
  killUntrustedDbReaders();
  const status = "WALL_CLOCK_TIMEOUT";
  const reason = wallClockReason(limitMs);
  const tsIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  if (DRY_RUN) {
    console.log(`[deadman:DRY_RUN] @ ${tsIso} status=${status} (would exit 1)`);
    console.log(`  • ${reason}`);
    process.exit(1);
  }
  console.error(`[deadman] ${status} @ ${tsIso}\n  • ${reason}`);
  try {
    if (cfg.notify.enabled) fireNotification("Agent Athens", `Deadman: ${status}`, reason);
  } catch (e) {
    console.error(`[deadman] notification failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const mail = sendEmail(cfg.email, `[Agent Athens] DEADMAN: ${status}`, `Deadman watchdog stopped at ${tsIso} (host wall-clock).\n\nStatus: ${status}\n\n  • ${reason}\n`);
  const emailState = mail.ok ? "sent" : mail.skipped ? "skipped" : "FAILED";
  if (!mail.ok) console.error(`[deadman] email ${emailState}: ${mail.detail}`);
  const push = await sendPush(cfg, `Agent Athens DEADMAN: ${status}`, `${status} @ ${tsIso}\n- ${reason}`)
    .catch((e) => ({ ok: false, skipped: false, detail: `sendPush threw: ${e}` }));
  console.error(`[deadman] push ${push.ok ? "sent" : push.skipped ? `skipped: ${push.detail}` : `FAILED: ${push.detail}`}`);
  try {
    writeHeartbeat({ timestamp: tsIso, status, deploy_age_h: "null", enrich_age_h: "null", pipeline_ok: "unknown", email: emailState, reasons: reason });
  } catch (e) {
    console.error(`[deadman] HEARTBEAT NOT WRITTEN to ${heartbeatPath()}: ${e instanceof Error ? e.message : String(e)}`);
  }
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────
// Wrapped in a function + import.meta.main guard so importing this module (tests
// export deadSourcesSignal / sendPush) can NEVER run the watchdog or fire delivery.
async function main(): Promise<never> {
const cfg = loadConfig();
const nowMs = Date.now();
// Round 8: the whole run has a wall clock; hitting it alerts and exits 1.
const limitMs = wallClockMs();
setTimeout(() => { void onWallClock(cfg, limitMs); }, limitMs);

// Fault-isolate each adapter: a failure degrades one signal to "unknown", which the
// classifier treats as stale (fail-loud), rather than crashing the watchdog silent.
const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
const deploy = await deploySignal().catch(
  (): DeploySignal => ({ ms: null, source: "container-logs", label: "deploy signal adapter failed" }),
);
const lastDeployMs = deploy.ms;
const deployFrom = deploy.source === "host-record" ? "host record" : "from container-writable logs";
// Round 8: ONE untrusted read of events.db feeds every DB signal. Busy-aware:
// retries once after 30s and reports a failing read of a present file as busy
// (NOT missing) — kills the 2026-07-05 false-CATASTROPHIC class. A refusal or
// a timeout is DB_REFUSED, named in the alert.
const db = await readDeadmanDbWithRetry().catch(
  (e): { res: UntrustedDbResult; busy: boolean } => ({ res: { ok: false, kind: "error", detail: `db adapter failed: ${e}` }, busy: false }),
);
const lastEnrichMs = safe(() => enrichFromDb(db.res), null);
const dbRowCount = safe(() => rowCountFromDb(db.res), null);
const dbBusy = db.busy;
const dbRefused = !db.res.ok && (db.res.kind === "refused" || db.res.kind === "timeout") ? db.res.detail : null;
const authOk = safe(authPrecheckOk, null);
const pipelineHealthy = safe(() => launchdHealth.isHealthy(cfg.pipeline_health_labels), true);
// Cause signals (Phase 5) — fault-isolated; a failing adapter degrades to
// "no signal", never blocks the freshness classification.
const deadSources = safe(() => deadSourcesFromDb(db.res), []);
const addresslessVenues = safe(() => addresslessFromDb(db.res), []);
const buildFailureCause = safe(() => buildFailureCauseSignal(lastDeployMs), null);

const inputs: DeadmanInputs = {
  lastDeployMs,
  deploySource: deploy.label,
  lastEnrichMs,
  pipelineHealthy,
  authPrecheckOk: authOk,
  dbRowCount,
  dbBusy,
  dbRefused,
  deadSources,
  addresslessVenues,
  buildFailureCause,
  nowMs,
  thresholds: { deployStaleHours: cfg.deploy_stale_hours, enrichStaleHours: cfg.enrich_stale_hours },
};

const classified: DeadmanResult = classifyDeadman(inputs);
// Reasons can quote container-written text (venue names from the DB, log
// lines); strip control characters before any delivery layer sees them.
const result: DeadmanResult = { ...classified, reasons: classified.reasons.map((r) => stripControl(r, 1000)) };
const tsIso = new Date(nowMs).toISOString().replace(/\.\d+Z$/, "Z");

// Responder layer (Phase 2A): scoped action BEFORE notification so the alert
// arrives with its outcome. Fault-isolated like every adapter; DRY_RUN plans
// but never executes. STALE_DEPLOY never ships dist/: the responder restores
// the last deploy the host recorded as verified (hostStateDir()/deploys.log)
// through the container job `docker/aa-run.sh restore <id>` (round 5: no host
// Netlify login needed) or, without a record or the wrapper, only alerts
// (src/watchdog/responders.ts).
const plannedActions = safe(() => planResponse(result, loadResponderState(responderStatePath()), nowMs), []);
const responderOutcomes = await executeActions(plannedActions, {
  dryRun: DRY_RUN,
  statePath: responderStatePath(),
  projectDir: ROOT,
  stateDir: hostStateDir(),
}).catch(() => [] as Awaited<ReturnType<typeof executeActions>>);
const responderLine =
  responderOutcomes
    .map((o) => `${o.kind}${o.target ? ":" + o.target : ""}=${o.ok === null ? "planned" : o.ok ? "ok" : "FAILED"}`)
    .join(" ") || "none";

// Dry-run: report the classification + exit code without firing any delivery layer.
if (DRY_RUN) {
  console.log(`[deadman:DRY_RUN] @ ${tsIso} status=${result.status} (would exit ${result.status === "OK" ? 0 : 1})`);
  console.log(`  signals: deploy=${ageH(lastDeployMs, nowMs)}h (${deployFrom}) enrich=${ageH(lastEnrichMs, nowMs)}h dbRows=${dbRowCount ?? "null"} pipeline=${pipelineHealthy ? "ok" : "FAIL"}`);
  for (const r of result.reasons) console.log(`  • ${r}`);
  console.log(`  responder (planned only): ${responderLine}`);
  process.exit(result.status === "OK" ? 0 : 1);
}

let emailState = "n/a";

if (result.status === "OK") {
  emailState = "n/a";
  console.log(`[deadman] OK @ ${tsIso} — deploy ${ageH(lastDeployMs, nowMs)}h (${deployFrom}), enrich ${ageH(lastEnrichMs, nowMs)}h, pipeline ${pipelineHealthy ? "ok" : "FAIL"}`);
} else {
  const subject = `[Agent Athens] DEADMAN: ${result.status}`;
  const body =
    `Deadman watchdog breach at ${tsIso} (host wall-clock).\n\n` +
    `Status: ${result.status}\n\nFailing signals:\n` +
    result.reasons.map((r) => `  • ${r}`).join("\n") +
    `\n\nResponder: ${responderLine}\n` +
    responderOutcomes.map((o) => `  → ${o.summary}: ${o.detail}`).join("\n") +
    `\n\nSignal ages: deploy=${ageH(lastDeployMs, nowMs)}h (${deploy.label}), enrich=${ageH(lastEnrichMs, nowMs)}h, pipeline=${pipelineHealthy ? "ok" : "non-zero-exit"}.\n` +
    `Thresholds: deploy ${cfg.deploy_stale_hours}h, enrich ${cfg.enrich_stale_hours}h.\n`;

  // Layer 1 — local notification (always).
  if (cfg.notify.enabled) {
    fireNotification("Agent Athens", `Deadman: ${result.status}`, result.reasons[0] ?? result.status);
  }
  // Layer 2 — email (one path). On send-failure, escalate Layer 1 + mark heartbeat.
  const mail = sendEmail(cfg.email, subject, body);
  if (mail.ok) {
    emailState = "sent";
  } else if (mail.skipped) {
    emailState = "skipped";
    console.error(`[deadman] email skipped: ${mail.detail}`);
  } else {
    emailState = "FAILED";
    console.error(`[deadman] EMAIL DELIVERY FAILED: ${mail.detail}`);
    if (cfg.notify.enabled) {
      fireNotification("Agent Athens", "⚠️ EMAIL DELIVERY FAILED", `${result.status} — email could not be sent; ${mail.detail}`);
    }
  }
  // Layer 4 — off-machine push (ntfy). Body is status + reasons ONLY — never
  // config values, never the topic. sendPush never throws; the extra .catch is
  // defense-in-depth so no future edit can let a push failure reach layer 3.
  const push = await sendPush(
    cfg,
    `Agent Athens DEADMAN: ${result.status}`,
    `${result.status} @ ${tsIso}\n` +
      result.reasons.map((r) => `- ${r}`).join("\n") +
      `\nresponder: ${responderLine}`,
  ).catch((e) => ({ ok: false, skipped: false, detail: `sendPush threw: ${e}` }));
  if (push.ok) {
    console.error(`[deadman] push sent`);
  } else if (push.skipped) {
    console.error(`[deadman] push skipped: ${push.detail}`);
  } else {
    console.error(`[deadman] PUSH DELIVERY FAILED: ${push.detail}`);
  }
  console.error(`[deadman] ${result.status} @ ${tsIso}\n${result.reasons.map((r) => "  • " + r).join("\n")}`);
}

// Layer 3 — heartbeat (always; email column is the !ok marker on delivery failure).
// A refused write (symlink planted at the path) must not hide the status, so
// it is reported and turns the exit code non-zero instead of crashing.
let heartbeatOk = true;
try {
  writeHeartbeat({
    timestamp: tsIso,
    status: result.status,
    deploy_age_h: ageH(lastDeployMs, nowMs),
    enrich_age_h: ageH(lastEnrichMs, nowMs),
    pipeline_ok: pipelineHealthy,
    email: emailState,
    responder: responderLine,
    reasons: result.reasons.join(" | "),
  });
} catch (e) {
  heartbeatOk = false;
  console.error(`[deadman] HEARTBEAT NOT WRITTEN to ${heartbeatPath()}: ${e instanceof Error ? e.message : String(e)}. If it is a symlink, something planted it: inspect it, delete it, and rerun the deadman.`);
}

process.exit(result.status === "OK" && heartbeatOk ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
