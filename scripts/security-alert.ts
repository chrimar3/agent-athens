#!/usr/bin/env bun
// security-alert.ts — send ONE security alert through the deadman's delivery
// path: the macOS notification (layer 1) and the msmtp email (layer 2).
// Host-side, security loop round 7.
//
// Usage (from the repo root, on the Mac):
//   bun run scripts/security-alert.ts -- "<message>"
// The message is taken from argv only (all arguments after an optional "--",
// joined with spaces). It is never interpolated into a shell or into
// AppleScript source: the notification passes it as an osascript run-handler
// argument (src/watchdog/notify.ts) and the email hands it to msmtp on stdin
// (src/watchdog/email.ts). Control characters (newlines included) are removed
// and it is capped at MAX_MESSAGE characters; the subject is
// "[agent-athens security] " plus its first SUBJECT_CHARS characters.
//
// Exit codes (callers such as docker/integrity-check.sh treat it as
// best-effort):
//   0  email sent, OR email disabled / not configured (the reason is printed)
//   1  email delivery failed (msmtp returned an error; the notification also
//      says so)
//   2  usage: no message given (nothing sent)
//
// config/monitoring.json decides whether the notification (notify.enabled)
// and the email (email.enabled, recipient, msmtp_account) are used; the
// app password lives in ~/.msmtprc as for the deadman. An unreadable config
// counts as "email not configured" (exit 0) and the notification still fires.

import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { sendEmail, type EmailConfig, type EmailDeps, type SendResult } from "../src/watchdog/email";
import { osascriptNotificationArgv } from "../src/watchdog/notify";
import { stripControl } from "../src/watchdog/signal-sources";

const ROOT = resolve(import.meta.dir, "..");
const CONFIG_PATH = join(ROOT, "config", "monitoring.json");

export const SUBJECT_PREFIX = "[agent-athens security]";
export const MAX_MESSAGE = 2000;
export const SUBJECT_CHARS = 120;

export interface AlertConfig {
  notify?: { enabled?: boolean };
  email?: EmailConfig;
}

export interface AlertDeps {
  config?: () => AlertConfig;
  notify?: (argv: string[]) => void;
  email?: EmailDeps;
  now?: () => Date;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

/** The message from argv: everything after an optional leading "--". */
export function messageFromArgv(args: string[]): string {
  const rest = args[0] === "--" ? args.slice(1) : args;
  return stripControl(rest.join(" "), MAX_MESSAGE);
}

function loadConfig(): AlertConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as AlertConfig;
}

function notifyMac(argv: string[]): void {
  Bun.spawnSync(argv, { stdout: "ignore", stderr: "ignore" });
}

/** Returns the process exit code. Never throws. */
export function runSecurityAlert(args: string[], deps: AlertDeps = {}): number {
  const out = deps.out ?? ((l: string) => console.log(l));
  const err = deps.err ?? ((l: string) => console.error(l));
  const message = messageFromArgv(args);
  if (!message) {
    err('security-alert: usage: bun run scripts/security-alert.ts -- "<message>" (no message given; nothing sent)');
    return 2;
  }

  let cfg: AlertConfig = {};
  let configProblem = "";
  try {
    cfg = (deps.config ?? loadConfig)();
  } catch (e) {
    configProblem = `config/monitoring.json unreadable (${e instanceof Error ? e.name : "error"})`;
  }

  const subject = `${SUBJECT_PREFIX} ${stripControl(message, SUBJECT_CHARS)}`;
  const at = (deps.now ?? (() => new Date()))().toISOString().replace(/\.\d+Z$/, "Z");
  const body =
    `${message}\n\n` +
    `Sent by scripts/security-alert.ts on ${stripControl(hostname(), 100)} at ${at} (host wall-clock).\n`;

  const notify = (subtitle: string, text: string) => {
    if (cfg.notify?.enabled === false) return;
    try {
      (deps.notify ?? notifyMac)(osascriptNotificationArgv({ title: "Agent Athens", subtitle, message: text, sound: "Basso" }));
    } catch {
      // No osascript (not a Mac) or it failed: the email and stdout still carry the alert.
    }
  };

  notify("Security alert", message);

  const mail: SendResult = configProblem
    ? { ok: false, skipped: true, detail: configProblem }
    : sendEmail(cfg.email, subject, body, deps.email);
  if (mail.ok) {
    out(`security-alert: email sent (${subject})`);
    return 0;
  }
  if (mail.skipped) {
    out(`security-alert: email not sent — ${mail.detail}. Alert: ${message}`);
    return 0;
  }
  err(`security-alert: EMAIL DELIVERY FAILED — ${stripControl(mail.detail, 300)}. Alert: ${message}`);
  notify("⚠️ EMAIL DELIVERY FAILED", `security alert email could not be sent; ${stripControl(mail.detail, 300)}`);
  return 1;
}

if (import.meta.main) {
  process.exit(runSecurityAlert(process.argv.slice(2)));
}
