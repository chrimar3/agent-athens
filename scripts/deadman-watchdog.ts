#!/usr/bin/env bun
// Deadman watchdog — independent freshness alarm.
//
// Runs on its OWN launchd slot (com.agentathens.deadman, every 6h), independent of
// the pipeline slots so it fires even when they are dead/unloaded. Closes the silent-
// drought class (4 occurrences, 4 distinct causes, 1 shared root: no active delivery).
//
// Three signals → pure classifier (src/watchdog/classifier.ts) → THREE delivery layers
// on breach: (1) osascript notification, (2) msmtp email, (3) heartbeat row. If the
// email send itself fails, layer (1) escalates with a distinct "EMAIL DELIVERY FAILED"
// notification and layer (3) records email_ok=false — we never silently lose the alert,
// and we never add a second email transport (one path, no GUI/TCC-flaky fallback).
//
// Everything is epoch-ms end to end: each adapter normalizes its timestamp (ISO-UTC
// deploy log, date-only/offset sitemap lastmod) to epoch-ms BEFORE the classifier, so
// no timezone parse mismatch can read fresh-as-stale across midnight.

import { Database } from "bun:sqlite";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { classifyDeadman, type DeadmanInputs, type DeadmanResult } from "../src/watchdog/classifier";

const ROOT = resolve(import.meta.dir, "..");
const CONFIG_PATH = join(ROOT, "config", "monitoring.json");
const DEPLOY_LOG = join(ROOT, "logs", "deploy-cadence.log");
const AUTH_LOG = join(ROOT, "logs", "auth-precheck-last.log");
const DB_PATH = join(ROOT, "data", "events.db");
const HEARTBEAT_CSV = join(ROOT, "logs", "deadman-heartbeat.csv");
const SITEMAP_URL = "https://agentathens.com/sitemap-events.xml";

interface MonitoringConfig {
  deploy_stale_hours: number;
  enrich_stale_hours: number;
  pipeline_health_labels: string[];
  notify: { enabled: boolean };
  email: { enabled: boolean; recipient: string; msmtp_account: string };
}

function loadConfig(): MonitoringConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

// ── Signal adapters ────────────────────────────────────────────────────────────
// Each returns epoch-ms | null (null = signal missing → classifier treats as stale).
// Each is independently fault-isolated by the caller: an adapter throwing degrades
// that one signal to "unknown", never crashes the watchdog.

/** Deploy freshness: last `deploy-success` in deploy-cadence.log; live-curl fallback. */
async function deploySignalMs(): Promise<number | null> {
  if (existsSync(DEPLOY_LOG)) {
    const lines = readFileSync(DEPLOY_LOG, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+deploy-success$/);
      if (m) {
        const ms = Date.parse(m[1]); // ISO-UTC → epoch-ms
        return Number.isNaN(ms) ? null : ms;
      }
    }
  }
  // Fallback: newest <lastmod> from the live sitemap (date-only or offset → epoch-ms).
  try {
    const res = await fetch(SITEMAP_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const xml = await res.text();
    const stamps = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)]
      .map((mm) => Date.parse(mm[1].trim()))
      .filter((n) => !Number.isNaN(n));
    return stamps.length ? Math.max(...stamps) : null;
  } catch {
    return null;
  }
}

/** Enrichment freshness: MAX(enriched_at). Issues only a SELECT (no data mutation).
 *  WAL opens are state-dependent in Bun: {readonly:true} sometimes can't reach -shm,
 *  and a bare {} throws "flags must include READONLY or READWRITE". So try readonly
 *  first (zero side effects — ideal for a monitor) and fall back to readwrite when the
 *  WAL state forces it. create:false → a missing DB throws → null → stale (fail-loud). */
function openEventsDb(): Database {
  try {
    return new Database(DB_PATH, { readonly: true });
  } catch {
    return new Database(DB_PATH, { readwrite: true, create: false });
  }
}

function enrichSignalMs(): number | null {
  const db = openEventsDb();
  try {
    const row = db.prepare("SELECT MAX(enriched_at) AS m FROM events").get() as { m: string | null };
    if (!row?.m) return null;
    // enriched_at is stored "YYYY-MM-DD HH:MM:SS" in Athens local wall-time; parse as such.
    const ms = Date.parse(row.m.replace(" ", "T")); // local-tz interpretation, → epoch-ms
    return Number.isNaN(ms) ? null : ms;
  } finally {
    db.close();
  }
}

/** Corroborating auth state: parse the last `exit=N` in auth-precheck-last.log. null if absent. */
function authPrecheckOk(): boolean | null {
  if (!existsSync(AUTH_LOG)) return null;
  const lines = readFileSync(AUTH_LOG, "utf-8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^exit=(-?\d+)/);
    if (m) return m[1] === "0";
  }
  return null;
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
      const out = Bun.spawnSync(["launchctl", "list", label]);
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
function fireNotification(title: string, subtitle: string, message: string): void {
  // AppleScript string-literal escape — mirror check-deploy-cadence.ts:71-76.
  const esc = (s: string) => s.replace(/"/g, '\\"');
  const script = `display notification "${esc(message)}" with title "${esc(title)}" subtitle "${esc(subtitle)}" sound name "Basso"`;
  Bun.spawnSync(["osascript", "-e", script]);
}

/** Returns true if msmtp accepted the message. Never throws. */
function sendEmail(cfg: MonitoringConfig, subject: string, body: string): { ok: boolean; skipped: boolean; detail: string } {
  const rc = join(homedir(), ".msmtprc");
  if (!cfg.email.enabled) return { ok: false, skipped: true, detail: "email disabled in config" };
  if (!existsSync(rc)) return { ok: false, skipped: true, detail: "~/.msmtprc absent (app-password not set up)" };
  const headers = `To: ${cfg.email.recipient}\nFrom: ${cfg.email.recipient}\nSubject: ${subject}\n\n`;
  const proc = Bun.spawnSync(["msmtp", "-a", cfg.email.msmtp_account, cfg.email.recipient], {
    stdin: Buffer.from(headers + body),
  });
  if (proc.exitCode === 0) return { ok: true, skipped: false, detail: "sent" };
  return { ok: false, skipped: false, detail: `msmtp exit ${proc.exitCode}: ${new TextDecoder().decode(proc.stderr).trim()}` };
}

function writeHeartbeat(row: Record<string, string | number | boolean>): void {
  const header = "timestamp,status,deploy_age_h,enrich_age_h,pipeline_ok,email,reasons";
  const line = [
    row.timestamp, row.status, row.deploy_age_h, row.enrich_age_h, row.pipeline_ok, row.email,
    `"${String(row.reasons).replace(/"/g, "'")}"`,
  ].join(",");
  if (!existsSync(HEARTBEAT_CSV)) appendFileSync(HEARTBEAT_CSV, header + "\n");
  appendFileSync(HEARTBEAT_CSV, line + "\n");
}

function ageH(ms: number | null, now: number): string {
  return ms === null ? "null" : ((now - ms) / 3_600_000).toFixed(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const cfg = loadConfig();
const nowMs = Date.now();

// Fault-isolate each adapter: a failure degrades one signal to "unknown", which the
// classifier treats as stale (fail-loud), rather than crashing the watchdog silent.
const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
const lastDeployMs = await deploySignalMs().catch(() => null);
const lastEnrichMs = safe(enrichSignalMs, null);
const authOk = safe(authPrecheckOk, null);
const pipelineHealthy = safe(() => launchdHealth.isHealthy(cfg.pipeline_health_labels), true);

const inputs: DeadmanInputs = {
  lastDeployMs,
  lastEnrichMs,
  pipelineHealthy,
  authPrecheckOk: authOk,
  nowMs,
  thresholds: { deployStaleHours: cfg.deploy_stale_hours, enrichStaleHours: cfg.enrich_stale_hours },
};

const result: DeadmanResult = classifyDeadman(inputs);
const tsIso = new Date(nowMs).toISOString().replace(/\.\d+Z$/, "Z");

let emailState = "n/a";

if (result.status === "OK") {
  emailState = "n/a";
  console.log(`[deadman] OK @ ${tsIso} — deploy ${ageH(lastDeployMs, nowMs)}h, enrich ${ageH(lastEnrichMs, nowMs)}h, pipeline ${pipelineHealthy ? "ok" : "FAIL"}`);
} else {
  const subject = `[Agent Athens] DEADMAN: ${result.status}`;
  const body =
    `Deadman watchdog breach at ${tsIso} (host wall-clock).\n\n` +
    `Status: ${result.status}\n\nFailing signals:\n` +
    result.reasons.map((r) => `  • ${r}`).join("\n") +
    `\n\nSignal ages: deploy=${ageH(lastDeployMs, nowMs)}h, enrich=${ageH(lastEnrichMs, nowMs)}h, pipeline=${pipelineHealthy ? "ok" : "non-zero-exit"}.\n` +
    `Thresholds: deploy ${cfg.deploy_stale_hours}h, enrich ${cfg.enrich_stale_hours}h.\n`;

  // Layer 1 — local notification (always).
  if (cfg.notify.enabled) {
    fireNotification("Agent Athens", `Deadman: ${result.status}`, result.reasons[0] ?? result.status);
  }
  // Layer 2 — email (one path). On send-failure, escalate Layer 1 + mark heartbeat.
  const mail = sendEmail(cfg, subject, body);
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
  console.error(`[deadman] ${result.status} @ ${tsIso}\n${result.reasons.map((r) => "  • " + r).join("\n")}`);
}

// Layer 3 — heartbeat (always; email column is the !ok marker on delivery failure).
writeHeartbeat({
  timestamp: tsIso,
  status: result.status,
  deploy_age_h: ageH(lastDeployMs, nowMs),
  enrich_age_h: ageH(lastEnrichMs, nowMs),
  pipeline_ok: pipelineHealthy,
  email: emailState,
  reasons: result.reasons.join(" | "),
});

process.exit(result.status === "OK" ? 0 : 1);
