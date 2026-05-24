#!/usr/bin/env bun
// Missed-build check for the daily auto build+deploy chain.
//
// Reads the last `deploy-success` line of logs/deploy-cadence.log, computes
// hours since that UTC timestamp. If > 26h (24h window + 2h grace for the
// 08:00 Athens fire + ~2.5h run), fires an osascript notification, appends
// to logs/deploy-cadence-ALERT.log, and exits non-zero so launchd surfaces
// it in the stderr log. Silent exit 0 when fresh.
//
// Why UTC math: storage is UTC (locale-independent, monotonic across the
// EET<->EEST DST switch). Display can convert to Athens. See the comment
// at scripts/daily-automated.sh line ~618 for the storage-side rationale.
//
// Alert pattern: no shared notify util exists. Established precedent in
// scripts/daily-enrichment-check.sh is inline osascript. We use Bun.spawnSync
// with an argv array (no shell, no injection surface).

import { resolve } from "node:path";

const CADENCE_LOG = resolve(import.meta.dir, "..", "logs", "deploy-cadence.log");
const ALERT_LOG = resolve(import.meta.dir, "..", "logs", "deploy-cadence-ALERT.log");
const STALE_THRESHOLD_HOURS = 26;

type StaleReason =
  | { kind: "missing" }
  | { kind: "empty" }
  | { kind: "unparseable"; line: string }
  | { kind: "old"; hours: number; iso: string };

async function loadLastSuccess(): Promise<StaleReason | { kind: "fresh"; hours: number; iso: string }> {
  const file = Bun.file(CADENCE_LOG);
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

function formatStaleMessage(reason: StaleReason): string {
  switch (reason.kind) {
    case "missing":
      return "Daily deploy cadence broken: logs/deploy-cadence.log does not exist yet (first run pending or pipeline never reached deploy-success).";
    case "empty":
      return "Daily deploy cadence broken: logs/deploy-cadence.log exists but is empty (no deploy-success lines yet).";
    case "unparseable":
      return `Daily deploy cadence broken: last line of logs/deploy-cadence.log is unparseable: "${reason.line.slice(0, 80)}"`;
    case "old":
      return `Daily deploy stale: ${reason.hours.toFixed(1)}h since last success (${reason.iso}).`;
  }
}

function fireOsascriptAlert(message: string): void {
  // AppleScript string-literal escape — double-up the double quotes inside.
  const safeMessage = message.replace(/"/g, '\\"');
  const script = `display notification "${safeMessage}" with title "Agent Athens" subtitle "Deploy cadence broken" sound name "Basso"`;
  Bun.spawnSync(["osascript", "-e", script]);
}

async function appendAlertLog(message: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const line = `${stamp} ${message}\n`;
  // Read existing content (if any) and write back with the new line appended,
  // since Bun.write overwrites. Append-only semantics preserved by manual concat.
  const existing = (await Bun.file(ALERT_LOG).exists())
    ? await Bun.file(ALERT_LOG).text()
    : "";
  await Bun.write(ALERT_LOG, existing + line);
}

const result = await loadLastSuccess();

if (result.kind === "fresh") {
  // Silent exit 0 — deploy chain is healthy.
  process.exit(0);
}

const message = formatStaleMessage(result);
fireOsascriptAlert(message);
await appendAlertLog(message);
// Also write to stderr so launchd's StandardErrorPath captures it.
console.error(message);
process.exit(1);
