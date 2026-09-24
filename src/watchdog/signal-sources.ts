/** Deadman signal sources: prefer host-only records, read container-writable
 *  logs as untrusted (security loop round 7).
 *
 *  The deadman runs on the Mac, but the repo's logs/ folder is written by
 *  pipeline containers. A compromised run could append a fresh
 *  `deploy-success` line to logs/deploy-cadence.log and keep the STALE_DEPLOY
 *  alarm quiet while the site goes dark, or plant a symlink to a FIFO or a
 *  huge file there. So:
 *
 *  - Deploy freshness comes from the HOST record
 *    ${AA_STATE_DIR:-~/.config/agentathens-docker}/deploys.log when it exists.
 *    The host wrapper appends `<ISO-UTC> <deploy_id> <64 hex>` from publish's
 *    PUBLISH-RESULT line and no container mounts that folder. Lines ending in
 *    ` restore` record a restore, not a new deploy, and are skipped; the
 *    newest remaining line must parse or the signal is missing (stale: alert,
 *    never fall back to an older line or to container logs).
 *  - Only when deploys.log does not exist (container setup not installed yet)
 *    does freshness come from logs/deploy-cadence.log, and the signal's label
 *    then says "from container-writable logs" so every alert shows it.
 *  - Every logs/ read is bounded (the last LOG_READ_MAX_BYTES), refuses a
 *    symlink or a non-regular file, parses lines strictly, and any text it
 *    passes on has control characters removed and a length cap. */
import { closeSync, constants, existsSync, fstatSync, openSync, readSync } from 'fs';
import { join } from 'path';
import { lastKnownGoodDeploy } from './responders';

/** Upper bound on bytes read from any container-writable log. */
export const LOG_READ_MAX_BYTES = 256 * 1024;

/** The last `maxBytes` of a regular file, or null when it is missing, a
 *  symlink (O_NOFOLLOW), not a regular file (FIFO, device, directory) or
 *  unreadable. When the read starts mid-file the first, partial line is
 *  dropped. Never blocks on a FIFO (O_NONBLOCK) and never throws. */
export function readTailBounded(path: string, maxBytes = LOG_READ_MAX_BYTES): string | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return null;
    const start = Math.max(0, st.size - maxBytes);
    const len = st.size - start;
    const buf = Buffer.alloc(len);
    let got = 0;
    while (got < len) {
      const n = readSync(fd, buf, got, len - got, start + got);
      if (n <= 0) break;
      got += n;
    }
    let text = buf.subarray(0, got).toString('utf8');
    if (start > 0) {
      const nl = text.indexOf('\n');
      text = nl === -1 ? '' : text.slice(nl + 1);
    }
    return text;
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/** Text safe to put in an alert, a notification or a CSV cell: C0/C1 control
 *  characters (newlines, tabs and U+2028/2029 become spaces), zero-width and bidi-override
 *  characters removed, runs of spaces collapsed, at most `max` characters. */
export function stripControl(raw: string, max = 500): string {
  const s = String(raw)
    .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, Math.max(0, max - 1)).join('') + '…' : s;
}

const CADENCE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) deploy-success$/;

/** Newest `deploy-success` time in a deploy-cadence.log text, epoch-ms. */
export function lastCadenceSuccessMs(text: string): number | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(CADENCE_RE);
    if (m) {
      const ms = Date.parse(m[1]);
      return Number.isNaN(ms) ? null : ms;
    }
  }
  return null;
}

export type DeploySource = 'host-record' | 'container-logs';

export interface DeploySignal {
  /** epoch-ms of the last successful deploy; null = missing (stale). */
  ms: number | null;
  source: DeploySource;
  /** Where the value came from, for alert text. Says "from container-writable
   *  logs" whenever the host record was not used. */
  label: string;
}

/** Deploy freshness with host-record precedence (see the file comment).
 *  `stateDir` is the host-only state dir; `cadenceLog` the repo's
 *  logs/deploy-cadence.log. */
export function deployFreshness(stateDir: string, cadenceLog: string): DeploySignal {
  const record = join(stateDir, 'deploys.log');
  if (existsSync(record)) {
    const good = lastKnownGoodDeploy(record);
    const ms = good ? Date.parse(good.at) : NaN;
    return Number.isNaN(ms)
      ? { ms: null, source: 'host-record', label: `host record ${record}: no readable deploy line (newest non-restore line missing or malformed)` }
      : { ms, source: 'host-record', label: `host record ${record}` };
  }
  const text = readTailBounded(cadenceLog);
  const ms = text === null ? null : lastCadenceSuccessMs(text);
  return {
    ms,
    source: 'container-logs',
    label: `logs/deploy-cadence.log — from container-writable logs (host record ${record} not installed yet)` +
      (text === null ? '; the log is missing, a symlink or not a regular file' : ms === null ? '; no deploy-success line' : ''),
  };
}

// [^\n] rather than `.`: a U+2028 in the quoted text must not end the match early.
const BUILD_FAILURE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) build-failure ([^\n]+)$/;

/** Last build-failure line of logs/build-outcome.log (container-writable),
 *  if newer than the last deploy. The quoted error text is sanitized and
 *  labelled as coming from container-writable logs. */
export function buildFailureCauseFromLog(path: string, lastDeployMs: number | null): string | null {
  const text = readTailBounded(path);
  if (text === null) return null;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(BUILD_FAILURE_RE);
    if (!m) continue;
    const ms = Date.parse(m[1]);
    if (Number.isNaN(ms)) return null;
    if (lastDeployMs !== null && ms <= lastDeployMs) return null; // deploy since → stale cause
    const cause = stripControl(m[2], 300);
    return cause ? `${cause} (from container-writable logs)` : null;
  }
  return null;
}

/** Corroborating auth state from auth-precheck-last.log (container-writable):
 *  the last line that is exactly `exit=N`. null when absent or unparseable.
 *  It can only ADD a STALE_ENRICH flag (classifier), never silence one. */
export function authPrecheckFromLog(path: string): boolean | null {
  const text = readTailBounded(path, 64 * 1024);
  if (text === null) return null;
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^exit=(-?\d{1,5})$/);
    if (m) return m[1] === '0';
  }
  return null;
}
