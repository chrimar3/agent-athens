#!/usr/bin/env bun
// Missed-build check for the daily auto build+deploy chain.
//
// Reads the last `deploy-success` line of logs/deploy-cadence.log, computes
// hours since that UTC timestamp. If > 26h (24h window + 2h grace for the
// 08:00 Athens fire + ~2.5h run), fires an osascript notification, appends
// to the host-only alert log (see alertLogPath), and exits non-zero so
// launchd surfaces it in the stderr log. Silent exit 0 when fresh.
//
// Why UTC math: storage is UTC (locale-independent, monotonic across the
// EET<->EEST DST switch). Display can convert to Athens. See the comment
// at scripts/daily-automated.sh line ~618 for the storage-side rationale.
//
// Alert pattern: no shared notify util exists. Established precedent in
// scripts/daily-enrichment-check.sh is inline osascript. We use Bun.spawnSync
// with an argv array (no shell, no injection surface).
//
// Trust boundary: this runs on the Mac as the owner, but logs/ in the repo is
// writable by pipeline containers. So logs/deploy-cadence.log is read as
// untrusted text (quoted only after control characters are replaced, and
// passed to AppleScript as argv), and the alert log is NOT written in the
// repo: it goes to ${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/logs,
// a folder no container mounts, with an append that refuses symlinks
// (lstat + O_NOFOLLOW). A planted symlink at either path is never followed.

import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CADENCE_LOG = resolve(import.meta.dir, "..", "logs", "deploy-cadence.log");
const STALE_THRESHOLD_HOURS = 26;

type StaleReason =
  | { kind: "missing" }
  | { kind: "empty" }
  | { kind: "unparseable"; line: string }
  | { kind: "old"; hours: number; iso: string };

/** Host-only alert log: ${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/logs/deploy-cadence-ALERT.log. */
export function alertLogPath(env: Record<string, string | undefined> = process.env): string {
  const stateDir = env.AA_STATE_DIR || join(env.HOME || homedir(), ".config", "agentathens-docker");
  return join(stateDir, "logs", "deploy-cadence-ALERT.log");
}

async function loadLastSuccess(cadenceLog: string): Promise<StaleReason | { kind: "fresh"; hours: number; iso: string }> {
  const file = Bun.file(cadenceLog);
  if (!(await file.exists())) {
    return { kind: "missing" };
  }
  const text = await file.text();
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { kind: "empty" };
  }
  const last = lines[lines.length - 1];
  // Format: "<ISO-8601-UTC> deploy-success"  e.g. "2026-05-23T08:32:11Z deploy-success"
  const match = last.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+deploy-success$/);
  if (!match) {
    return { kind: "unparseable", line: last };
  }
  const iso = match[1];
  const parsedMs = Date.parse(iso);
  if (Number.isNaN(parsedMs)) {
    return { kind: "unparseable", line: last };
  }
  const hours = (Date.now() - parsedMs) / 3_600_000;
  if (hours > STALE_THRESHOLD_HOURS) {
    return { kind: "old", hours, iso };
  }
  return { kind: "fresh", hours, iso };
}

export function formatStaleMessage(reason: StaleReason): string {
  switch (reason.kind) {
    case "missing":
      return "Daily deploy cadence broken: logs/deploy-cadence.log does not exist yet (first run pending or pipeline never reached deploy-success).";
    case "empty":
      return "Daily deploy cadence broken: logs/deploy-cadence.log exists but is empty (no deploy-success lines yet).";
    case "unparseable":
      return `Daily deploy cadence broken: last line of logs/deploy-cadence.log is unparseable: "${reason.line.slice(0, 80).replace(/[\u0000-\u001f\u007f]/g, "?")}"`;
    case "old":
      return `Daily deploy stale: ${reason.hours.toFixed(1)}h since last success (${reason.iso}).`;
  }
}

/**
 * The message can quote a line from logs/deploy-cadence.log, which pipeline
 * runs write. It is passed to AppleScript as an argument, never spliced into
 * the script text, so no quote or backslash in it can change the script.
 */
export function osascriptAlertArgs(message: string): string[] {
  return [
    "osascript",
    "-e", "on run argv",
    "-e", 'display notification (item 1 of argv) with title "Agent Athens" subtitle "Deploy cadence broken" sound name "Basso"',
    "-e", "end run",
    "--", message,
  ];
}

function fireOsascriptAlert(message: string): void {
  Bun.spawnSync(osascriptAlertArgs(message));
}

/**
 * Append text to a host-only file without following symlinks. The parent
 * folder is created 0700 and must be a real directory; the file must be
 * absent or a regular file; O_NOFOLLOW closes the lstat-to-open race.
 * Throws (never writes) when either check fails.
 */
export function appendFileNoFollow(path: string, text: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirStat = lstatSync(dir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error(`${dir} is a symlink or not a directory; refusing to write ${path}`);
  }
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) throw new Error(`${path} is a symlink; refusing to follow it`);
    if (!st.isFile()) throw new Error(`${path} is not a regular file; refusing to write it`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`${path} is not a regular file; refusing to write it`);
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

export interface CadenceCheckOptions {
  cadenceLog: string;
  alertLog: string;
  notify: (message: string) => void;
  log: (message: string) => void;
}

/** 0 when the last deploy is fresh; otherwise alerts and returns 1. */
export async function runCadenceCheck(opts: CadenceCheckOptions): Promise<number> {
  const result = await loadLastSuccess(opts.cadenceLog);
  if (result.kind === "fresh") return 0;

  const message = formatStaleMessage(result);
  opts.notify(message);
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  try {
    appendFileNoFollow(opts.alertLog, `${stamp} ${message}\n`);
  } catch (err) {
    opts.log(`check-deploy-cadence: refused to write the alert log ${opts.alertLog}: ${(err as Error).message}. Remove whatever is at that path (it should be a plain file in a folder only you can write) and re-run.`);
  }
  // Also write to stderr so launchd's StandardErrorPath captures it.
  opts.log(message);
  return 1;
}

if (import.meta.main) {
  const code = await runCadenceCheck({
    cadenceLog: CADENCE_LOG,
    alertLog: alertLogPath(),
    notify: fireOsascriptAlert,
    log: (m) => console.error(m),
  });
  process.exit(code);
}
