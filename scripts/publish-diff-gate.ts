#!/usr/bin/env bun
/**
 * Publish content-diff gate (security loop round 8).
 *
 *   bun run scripts/publish-diff-gate.ts <distDir> <statsFile> [--accept]
 *
 * Computes stats of the BUILT SITE ONLY (never opens the database) and
 * compares them with the stats of the previous accepted publish:
 *
 *   - htmlPages        number of *.html files under distDir
 *   - eventPages       event-detail pages: events/<slug>/index.html and
 *                      en/events/<slug>/index.html (the layout generate-site.ts
 *                      writes and src/generators/orphan-sweep.ts recognises)
 *   - totalBytes       bytes of every regular file under distDir (symlinks
 *                      are not followed and not counted)
 *   - linkHosts        external hosts of <a href> / <area href>
 *   - scriptHosts      <script src>, <link rel=modulepreload>, <link rel=preload as=script>
 *   - iframeHosts      <iframe src>, <frame src>, <embed src>, <object data>
 *   - stylesheetHosts  <link rel=stylesheet>, <link rel=preload as=style>
 *   - imgHosts         <img src|srcset>, <source srcset>
 *   - preloadHosts     other <link rel=preload|prefetch>
 *   - ticketLinkHosts  <a class="edp-cta"> — the event-page ticket / venue CTA
 *                      (src/generators/event-page.ts)
 * External = http(s) after resolving against the page URL (or its <base
 * href>), host not agentathens.com / www.agentathens.com. Hosts are the
 * lower-cased (punycoded) hostnames the URL parser yields. Pages are parsed
 * one at a time with cheerio's spec-compliant parse5 mode (the tree a browser
 * builds), so memory is bounded by the largest page per thread; with ≥256
 * pages the parse is spread over AA_DIFF_WORKERS worker threads (default:
 * available CPUs, max 4 — about 120 MB per thread; 1 = single thread).
 *
 * Anomalies (exit 3, one reason per line, nothing written):
 *   - any new external script, iframe or stylesheet host;
 *   - more than AA_DIFF_MAX_NEW_HOSTS (default 10) new external link hosts;
 *   - when the previous stats had ≥1 ticket-link host: more than
 *     AA_DIFF_MAX_NEW_TICKET_HOSTS (default 3) new ticket-link hosts;
 *   - event-page count dropping by more than AA_DIFF_MAX_DROP_PCT (default 30)
 *     percent or growing by more than AA_DIFF_MAX_GROWTH_PCT (default 200);
 *   - total HTML pages dropping by more than AA_DIFF_MAX_DROP_PCT percent.
 *
 * Exit codes:
 *   0  no anomaly (or first run: statsFile absent), or --accept — new stats
 *      written atomically (temp file + rename; refused when statsFile is a
 *      symlink or not a regular file)
 *   2  usage or I/O error: bad arguments or env, distDir missing / not a
 *      directory / no HTML pages, statsFile present but a symlink, not a
 *      regular file, unreadable, not JSON or of another version (--accept
 *      replaces an unparseable regular file), statsFile inside distDir
 *   3  anomalies found; stats left unchanged. Review the listed hosts/pages,
 *      then re-run with --accept to make this build the new baseline.
 */
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { randomBytes } from 'crypto';
import { availableParallelism } from 'os';
import { fileURLToPath } from 'url';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { load } from 'cheerio';
import { BASE_URL } from '../src/config/site-url';

export const STATS_VERSION = 1;

export interface DistStats {
  version: typeof STATS_VERSION;
  generatedAt: string;
  htmlPages: number;
  eventPages: number;
  totalBytes: number;
  linkHosts: string[];
  scriptHosts: string[];
  iframeHosts: string[];
  stylesheetHosts: string[];
  imgHosts: string[];
  preloadHosts: string[];
  ticketLinkHosts: string[];
}

const HOST_FIELDS = ['linkHosts', 'scriptHosts', 'iframeHosts', 'stylesheetHosts', 'imgHosts', 'preloadHosts', 'ticketLinkHosts'] as const;
type HostField = (typeof HOST_FIELDS)[number];

/** Largest page parsed; a bigger .html file is an error, not silently skipped. */
const MAX_PAGE_BYTES = 32 * 1024 * 1024;
/** Largest stats file read. */
const MAX_STATS_BYTES = 64 * 1024 * 1024;
/** Hosts listed per anomaly line. */
const MAX_HOSTS_PER_LINE = 10;

const SITE_HOSTS: ReadonlySet<string> = (() => {
  const host = new URL(BASE_URL).hostname.toLowerCase().replace(/^www\./, '');
  return new Set([host, `www.${host}`]);
})();

export class GateError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message);
  }
}

// ============================================================================
// Stats from dist/
// ============================================================================

function isEventPage(relPath: string): boolean {
  const p = relPath.split(sep);
  if (p[0] === 'events' && p.length === 3 && p[2] === 'index.html') return true;
  return p[0] === 'en' && p[1] === 'events' && p.length === 4 && p[3] === 'index.html';
}

/** Public URL of a dist file, the base its relative links resolve against. */
function pageUrl(relPath: string): string {
  const posix = relPath.split(sep).map(encodeURIComponent).join('/');
  return `${BASE_URL}/${posix}`;
}

/** External http(s) host of `raw` resolved against `base`, or null. */
function externalHost(raw: string | undefined, base: string): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!host || SITE_HOSTS.has(host)) return null;
  return host;
}

function srcsetUrls(srcset: string | undefined): string[] {
  if (!srcset) return [];
  return srcset.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
}

function readPage(path: string): string {
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const size = fstatSync(fd).size;
    if (size > MAX_PAGE_BYTES) {
      throw new GateError(`page too large to scan: ${path} (${size} bytes > ${MAX_PAGE_BYTES})`, 'inspect the page; the build never emits pages that large');
    }
    const buf = Buffer.allocUnsafe(size);
    let off = 0;
    while (off < size) {
      const n = readSync(fd, buf, off, size - off, off);
      if (n === 0) break;
      off += n;
    }
    return buf.toString('utf-8', 0, off);
  } finally {
    closeSync(fd);
  }
}

/** Adds the external hosts of one page to `sets`. */
export function collectPageHosts(html: string, pageBase: string, sets: Record<HostField, Set<string>>): void {
  const $ = load(html);
  const baseHref = $('base[href]').first().attr('href');
  let base = pageBase;
  if (baseHref) {
    try {
      base = new URL(baseHref.trim(), pageBase).href;
    } catch {
      /* invalid <base> is ignored, as by browsers */
    }
  }
  const add = (field: HostField, raw: string | undefined) => {
    const h = externalHost(raw, base);
    if (h) sets[field].add(h);
  };
  $('a[href], area[href]').each((_, el) => {
    const href = $(el).attr('href');
    add('linkHosts', href);
    if (el.tagName === 'a' && ($(el).attr('class') ?? '').split(/\s+/).includes('edp-cta')) add('ticketLinkHosts', href);
  });
  $('script[src]').each((_, el) => add('scriptHosts', $(el).attr('src')));
  $('iframe[src], frame[src], embed[src]').each((_, el) => add('iframeHosts', $(el).attr('src')));
  $('object[data]').each((_, el) => add('iframeHosts', $(el).attr('data')));
  $('link[href]').each((_, el) => {
    const rels = ($(el).attr('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const as = ($(el).attr('as') ?? '').trim().toLowerCase();
    const href = $(el).attr('href');
    if (rels.includes('stylesheet')) add('stylesheetHosts', href);
    if (rels.includes('modulepreload')) add('scriptHosts', href);
    if (rels.includes('preload') || rels.includes('prefetch')) {
      if (as === 'script') add('scriptHosts', href);
      else if (as === 'style') add('stylesheetHosts', href);
      else add('preloadHosts', href);
    }
  });
  $('img[src]').each((_, el) => add('imgHosts', $(el).attr('src')));
  $('img[srcset], source[srcset]').each((_, el) => {
    for (const u of srcsetUrls($(el).attr('srcset'))) add('imgHosts', u);
  });
}

type HostSets = Record<HostField, Set<string>>;
type HostLists = Record<HostField, string[]>;
/** [absolute path, path relative to distDir] of one HTML page. */
type PageRef = [string, string];

const emptySets = (): HostSets => Object.fromEntries(HOST_FIELDS.map((f) => [f, new Set<string>()])) as HostSets;

/** Parses the pages one at a time (memory: one page) and returns their external hosts. */
function scanPages(pages: PageRef[]): HostLists {
  const sets = emptySets();
  let scanned = 0;
  for (const [abs, rel] of pages) {
    // Parsed trees are garbage at once; a periodic collection keeps each
    // thread's heap near one page instead of letting it grow with the scan.
    if (++scanned % 200 === 0) Bun.gc(false);
    let html: string;
    try {
      html = readPage(abs);
    } catch (e) {
      if (e instanceof GateError) throw e;
      throw new GateError(`cannot read ${abs}: ${(e as Error).message}`, 'check permissions on the dist tree');
    }
    collectPageHosts(html, pageUrl(rel), sets);
  }
  return Object.fromEntries(HOST_FIELDS.map((f) => [f, [...sets[f]]])) as HostLists;
}

/** Below this many pages the scan stays on the main thread. */
const PARALLEL_MIN_PAGES = 256;

/** Splits the pages over `workers` threads running this module (see the worker entry at the bottom). */
async function scanPagesParallel(pages: PageRef[], workers: number): Promise<HostLists> {
  const slices: PageRef[][] = Array.from({ length: workers }, () => []);
  pages.forEach((p, i) => slices[i % workers].push(p));
  const self = fileURLToPath(import.meta.url);
  const results = await Promise.all(slices.map((slice) => new Promise<HostLists>((resolveSlice, rejectSlice) => {
    const worker = new Worker(self, { workerData: { aaDiffGateWorker: true, pages: slice } });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      void worker.terminate();
    };
    worker.once('message', (m: { ok: true; sets: HostLists } | { ok: false; message: string; hint: string }) =>
      finish(() => (m.ok ? resolveSlice(m.sets) : rejectSlice(new GateError(m.message, m.hint)))));
    worker.once('error', (e) => finish(() => rejectSlice(new GateError(`scan worker failed: ${e.message}`, 'retry with AA_DIFF_WORKERS=1 to scan on one thread'))));
    worker.once('exit', (code) => finish(() => rejectSlice(new GateError(`scan worker exited (${code}) without a result`, 'retry with AA_DIFF_WORKERS=1 to scan on one thread'))));
  })));
  const merged = emptySets();
  for (const r of results) for (const f of HOST_FIELDS) for (const h of r[f]) merged[f].add(h);
  return Object.fromEntries(HOST_FIELDS.map((f) => [f, [...merged[f]]])) as HostLists;
}

/**
 * Walks distDir (no symlink following) and scans every HTML page, one page
 * in memory per thread. `workers` > 1 spreads the parse over that many
 * threads once there are at least PARALLEL_MIN_PAGES pages.
 */
export async function computeDistStats(distDir: string, options: { workers?: number; now?: Date } = {}): Promise<DistStats> {
  const root = resolve(distDir);
  let rootStat;
  try {
    rootStat = statSync(root);
  } catch {
    throw new GateError(`dist directory not found: ${distDir}`, 'build the site first (bun run src/generate-site.ts) or pass the right path');
  }
  if (!rootStat.isDirectory()) throw new GateError(`not a directory: ${distDir}`, 'pass the built site directory (dist/)');

  const pages: PageRef[] = [];
  let eventPages = 0;
  let totalBytes = 0;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      throw new GateError(`cannot read directory ${dir}: ${(e as Error).message}`, 'check permissions on the dist tree');
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      totalBytes += lstatSync(full).size;
      if (!/\.html?$/i.test(entry.name)) continue;
      const rel = relative(root, full);
      pages.push([full, rel]);
      if (isEventPage(rel)) eventPages++;
    }
  }
  if (pages.length === 0) throw new GateError(`no HTML pages under ${distDir}`, 'build the site first; an empty dist/ is never published');

  const workers = Math.max(1, Math.min(options.workers ?? 1, pages.length));
  const hosts = workers > 1 && pages.length >= PARALLEL_MIN_PAGES ? await scanPagesParallel(pages, workers) : scanPages(pages);
  const sorted = (l: string[]) => [...l].sort();
  return {
    version: STATS_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    htmlPages: pages.length,
    eventPages,
    totalBytes,
    linkHosts: sorted(hosts.linkHosts),
    scriptHosts: sorted(hosts.scriptHosts),
    iframeHosts: sorted(hosts.iframeHosts),
    stylesheetHosts: sorted(hosts.stylesheetHosts),
    imgHosts: sorted(hosts.imgHosts),
    preloadHosts: sorted(hosts.preloadHosts),
    ticketLinkHosts: sorted(hosts.ticketLinkHosts),
  };
}

// ============================================================================
// Comparison
// ============================================================================

export interface GateLimits {
  maxNewHosts: number;
  maxNewTicketHosts: number;
  maxDropPct: number;
  maxGrowthPct: number;
}

export const DEFAULT_LIMITS: GateLimits = { maxNewHosts: 10, maxNewTicketHosts: 3, maxDropPct: 30, maxGrowthPct: 200 };

/** Printable host: [a-z0-9.-_:[]] only, bounded. */
export function sanitizeHost(host: string): string {
  return host.toLowerCase().replace(/[^a-z0-9._:\[\]-]/g, '?').slice(0, 100);
}

function hostList(hosts: string[]): string {
  const shown = hosts.slice(0, MAX_HOSTS_PER_LINE).map(sanitizeHost).join(', ');
  return hosts.length > MAX_HOSTS_PER_LINE ? `${shown}, … (+${hosts.length - MAX_HOSTS_PER_LINE} more)` : shown;
}

const added = (cur: string[], prev: string[]) => {
  const p = new Set(prev);
  return cur.filter((h) => !p.has(h));
};

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** One line per anomaly; empty when the build looks like the previous one. */
export function compareStats(prev: DistStats, cur: DistStats, limits: GateLimits = DEFAULT_LIMITS): string[] {
  const reasons: string[] = [];
  const kinds: Array<[HostField, string]> = [['scriptHosts', 'script'], ['iframeHosts', 'iframe/embed'], ['stylesheetHosts', 'stylesheet']];
  for (const [field, label] of kinds) {
    const fresh = added(cur[field], prev[field]);
    if (fresh.length > 0) reasons.push(`new external ${label} host${fresh.length === 1 ? '' : 's'}: ${hostList(fresh)}`);
  }
  const newLinks = added(cur.linkHosts, prev.linkHosts);
  if (newLinks.length > limits.maxNewHosts) {
    reasons.push(`${newLinks.length} new external link hosts (max ${limits.maxNewHosts}): ${hostList(newLinks)}`);
  }
  const newTickets = added(cur.ticketLinkHosts, prev.ticketLinkHosts);
  if (prev.ticketLinkHosts.length > 0 && newTickets.length > limits.maxNewTicketHosts) {
    reasons.push(`${newTickets.length} new ticket-link hosts (max ${limits.maxNewTicketHosts}): ${hostList(newTickets)}`);
  }
  if (prev.eventPages > 0) {
    const change = ((cur.eventPages - prev.eventPages) / prev.eventPages) * 100;
    if (-change > limits.maxDropPct) reasons.push(`event pages dropped ${pct(-change)} (${prev.eventPages} → ${cur.eventPages}, max drop ${limits.maxDropPct}%)`);
    if (change > limits.maxGrowthPct) reasons.push(`event pages grew ${pct(change)} (${prev.eventPages} → ${cur.eventPages}, max growth ${limits.maxGrowthPct}%)`);
  }
  if (prev.htmlPages > 0) {
    const drop = ((prev.htmlPages - cur.htmlPages) / prev.htmlPages) * 100;
    if (drop > limits.maxDropPct) reasons.push(`HTML pages dropped ${pct(drop)} (${prev.htmlPages} → ${cur.htmlPages}, max drop ${limits.maxDropPct}%)`);
  }
  return reasons;
}

// ============================================================================
// Stats file I/O
// ============================================================================

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** The parsed stats, or a reason they cannot be used. */
export function parseStats(text: string): DistStats | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 'not valid JSON';
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'not a JSON object';
  const d = data as Record<string, unknown>;
  if (d.version !== STATS_VERSION) return `version is not ${STATS_VERSION}`;
  for (const k of ['htmlPages', 'eventPages', 'totalBytes'] as const) if (!isCount(d[k])) return `field ${k} is not a count`;
  for (const k of HOST_FIELDS) {
    const v = d[k];
    if (!Array.isArray(v) || !v.every((h) => typeof h === 'string' && h.length > 0 && h.length <= 253)) return `field ${k} is not a host list`;
  }
  return d as unknown as DistStats;
}

type PreviousStats = { kind: 'absent' } | { kind: 'ok'; stats: DistStats } | { kind: 'malformed'; reason: string };

function readPreviousStats(statsFile: string): PreviousStats {
  let st;
  try {
    st = lstatSync(statsFile);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' };
    throw new GateError(`cannot stat ${statsFile}: ${(e as Error).message}`, 'check the path and its permissions');
  }
  if (st.isSymbolicLink()) throw new GateError(`refusing: stats file is a symlink: ${statsFile}`, 'replace it with a regular file (or remove the link) and re-run');
  if (!st.isFile()) throw new GateError(`stats file is not a regular file: ${statsFile}`, 'pass a regular file path');
  if (st.size > MAX_STATS_BYTES) throw new GateError(`stats file too large: ${statsFile} (${st.size} bytes)`, 'inspect it; the gate writes a few KB');
  let text: string;
  try {
    text = readPage(statsFile);
  } catch (e) {
    if (e instanceof GateError) throw e;
    throw new GateError(`cannot read stats file ${statsFile}: ${(e as Error).message}`, 'check its permissions; the gate never treats an unreadable baseline as a first run');
  }
  const parsed = parseStats(text);
  return typeof parsed === 'string' ? { kind: 'malformed', reason: parsed } : { kind: 'ok', stats: parsed };
}

/** Temp file in the same directory, then rename over statsFile. Refuses a symlinked target. */
export function writeStatsAtomic(statsFile: string, stats: DistStats): void {
  const dir = dirname(resolve(statsFile));
  try {
    if (!statSync(dir).isDirectory()) throw new Error('not a directory');
  } catch (e) {
    throw new GateError(`stats directory unusable: ${dir}: ${(e as Error).message}`, 'create the directory first');
  }
  const tmp = join(dir, `.${basename(statsFile)}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`);
  const fd = openSync(tmp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o644);
  try {
    writeSync(fd, `${JSON.stringify(stats, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    let st;
    try {
      st = lstatSync(statsFile);
    } catch {
      st = null;
    }
    if (st?.isSymbolicLink()) throw new GateError(`refusing: stats file is a symlink: ${statsFile}`, 'replace it with a regular file and re-run');
    if (st && !st.isFile()) throw new GateError(`stats file is not a regular file: ${statsFile}`, 'pass a regular file path');
    renameSync(tmp, statsFile);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* already gone */
    }
    throw e;
  }
}

// ============================================================================
// CLI
// ============================================================================

const USAGE = 'usage: bun run scripts/publish-diff-gate.ts <distDir> <statsFile> [--accept]';

function envLimit(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d{1,9}$/.test(raw.trim())) throw new GateError(`${name} must be a non-negative integer (got ${JSON.stringify(raw.slice(0, 20))})`, `unset ${name} or set it to e.g. ${fallback}`);
  return Number(raw.trim());
}

export interface GateIO {
  out: (line: string) => void;
  err: (line: string) => void;
}

/** Runs the gate; resolves to the exit code (0 ok / 2 usage-IO / 3 anomalies). */
export async function runDiffGate(args: string[], env: Record<string, string | undefined> = process.env, io: GateIO = { out: console.log, err: console.error }): Promise<number> {
  const flags = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  if (flags.includes('-h') || flags.includes('--help')) {
    io.out(USAGE);
    return 0;
  }
  const unknown = flags.filter((f) => f !== '--accept');
  if (unknown.length > 0 || positional.length !== 2) {
    io.err(`publish-diff-gate: ${unknown.length > 0 ? `unknown option ${sanitizeHost(unknown[0])}` : 'expected <distDir> <statsFile>'}`);
    io.err(USAGE);
    return 2;
  }
  const accept = flags.includes('--accept');
  const [distDir, statsFile] = positional;
  try {
    const limits: GateLimits = {
      maxNewHosts: envLimit(env, 'AA_DIFF_MAX_NEW_HOSTS', DEFAULT_LIMITS.maxNewHosts),
      maxNewTicketHosts: envLimit(env, 'AA_DIFF_MAX_NEW_TICKET_HOSTS', DEFAULT_LIMITS.maxNewTicketHosts),
      maxDropPct: envLimit(env, 'AA_DIFF_MAX_DROP_PCT', DEFAULT_LIMITS.maxDropPct),
      maxGrowthPct: envLimit(env, 'AA_DIFF_MAX_GROWTH_PCT', DEFAULT_LIMITS.maxGrowthPct),
    };
    const workers = envLimit(env, 'AA_DIFF_WORKERS', Math.min(availableParallelism(), 4));
    const relStats = relative(resolve(distDir), resolve(statsFile));
    if (relStats === '' || (!relStats.startsWith('..') && !isAbsolute(relStats))) {
      throw new GateError(`stats file is inside distDir: ${statsFile}`, 'keep the stats file outside the published tree (e.g. logs/)');
    }
    const previous = readPreviousStats(statsFile);
    if (previous.kind === 'malformed' && !accept) {
      throw new GateError(`stats file unusable (${previous.reason}): ${statsFile}`, 'inspect it; re-run with --accept to replace it with this build\'s stats');
    }
    const t0 = Date.now();
    const current = await computeDistStats(distDir, { workers });
    const summary = `${current.htmlPages} HTML pages (${current.eventPages} event), ${current.totalBytes} bytes, ${current.linkHosts.length} link hosts, ${current.scriptHosts.length} script hosts, ${current.ticketLinkHosts.length} ticket-link hosts, scanned in ${Date.now() - t0} ms`;

    if (previous.kind === 'absent') {
      writeStatsAtomic(statsFile, current);
      io.out(`publish-diff-gate: first run — no previous stats; baseline written to ${statsFile}: ${summary}`);
      return 0;
    }
    if (previous.kind === 'malformed') {
      writeStatsAtomic(statsFile, current);
      io.out(`publish-diff-gate: --accept replaced an unusable stats file (${previous.reason}); baseline written to ${statsFile}: ${summary}`);
      return 0;
    }
    const reasons = compareStats(previous.stats, current, limits);
    if (reasons.length === 0) {
      writeStatsAtomic(statsFile, current);
      io.out(`publish-diff-gate: OK — ${summary}`);
      return 0;
    }
    if (accept) {
      for (const r of reasons) io.out(`ACCEPTED: ${r}`);
      writeStatsAtomic(statsFile, current);
      io.out(`publish-diff-gate: --accept — ${reasons.length} anomal${reasons.length === 1 ? 'y' : 'ies'} accepted; stats updated: ${summary}`);
      return 0;
    }
    for (const r of reasons) io.err(`ANOMALY: ${r}`);
    io.err(`publish-diff-gate: ${reasons.length} anomal${reasons.length === 1 ? 'y' : 'ies'}; stats not updated (${summary}). Review the lines above; if the change is intended, re-run with --accept.`);
    return 3;
  } catch (e) {
    if (e instanceof GateError) {
      io.err(`publish-diff-gate: ${e.message}`);
      io.err(`  next: ${e.hint}`);
      return 2;
    }
    io.err(`publish-diff-gate: I/O error: ${(e as Error).message}`);
    io.err('  next: check the paths and permissions, then re-run');
    return 2;
  }
}

// Scan-worker entry: scanPagesParallel starts this module as a worker thread.
if (!isMainThread && (workerData as { aaDiffGateWorker?: boolean } | null)?.aaDiffGateWorker === true) {
  const { pages } = workerData as { pages: PageRef[] };
  try {
    parentPort!.postMessage({ ok: true, sets: scanPages(pages) });
  } catch (e) {
    parentPort!.postMessage({ ok: false, message: (e as Error).message, hint: e instanceof GateError ? e.hint : 'retry with AA_DIFF_WORKERS=1' });
  }
} else if (import.meta.main) {
  process.exit(await runDiffGate(process.argv.slice(2)));
}
