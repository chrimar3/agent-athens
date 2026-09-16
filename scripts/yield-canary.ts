#!/usr/bin/env bun
/**
 * Scraper yield canary (issue #1) — READ-ONLY look at scrape_stats.
 *
 * For every ACTIVE source (src/config/active-source-ids.ts) compare its
 * events_found on the COMPARISON DAY — the most recent day a quorum of active
 * sources ran, see pickComparisonDay — against the trailing mean of that
 * source's successful runs in the prior --window-days (the comparison day is
 * NOT part of its own baseline). Trip when latest < threshold * mean. Separately
 * report the pipeline as stale when that day is more than --max-age-days old.
 *
 * Usage:
 *   bun run scripts/yield-canary.ts [--db=PATH] [--threshold=0.6] [--window-days=30]
 *                                   [--max-age-days=2] [--dry-run]
 *
 * Exit codes: 0 healthy · 2 at least one source tripped, or the pipeline itself
 * is stale · 1 the canary itself could not run (missing DB, bad flag, gh
 * failure). On either failure stderr carries ONE rule-5 line, and (unless
 * --dry-run) one GitHub issue per TRIPPED source is opened, deduped against
 * open issues whose title starts with "Yield canary: <source>". Staleness files
 * no issue — it is an exit-code/stderr signal only. YIELD_CANARY_GH=PATH swaps
 * the `gh` binary and YIELD_CANARY_TODAY=YYYY-MM-DD pins the clock (both are
 * test seams); production uses `gh` on PATH and the Europe/Athens date.
 *
 * NOT WIRED INTO ANY CYCLE (as of 2026-09-16). Nothing invokes this script — no
 * scripts/daily-automated.sh call, no launchd plist, no CI job — so issue #1's
 * "disabling a scraper produces an issue within one cycle" is NOT yet
 * demonstrable. That wiring (one `|| true` invocation at the end of
 * daily-automated.sh, so exit 2 cannot abort the pipeline under `set -e`) is a
 * separate change; until it lands this is a standalone read-only script you run
 * by hand.
 *
 * KNOWN BLIND SPOT — removing a scraper from the ACTIVE LIST is invisible here.
 * scrape-all.ts derives `type SourceId = typeof ACTIVE_SOURCE_IDS[number]` and
 * declares `SOURCES: Record<SourceId, …>`, so deleting a scraper from the scrape
 * list REQUIRES deleting it from src/config/active-source-ids.ts — the very list
 * this script iterates. Such a source stops being evaluated and can never trip
 * (pinned by the "inactive sources are not evaluated" test). What IS caught: a
 * quarantined source (config/quarantined-sources.json makes scrape-all write no
 * scrape_stats row, so latest = 0 against a healthy mean → trip), a scraper that
 * runs but yields little, and a pipeline that stopped running at all.
 *
 * Why 0.6 and a 30-day mean, not the health-check's 50%-vs-yesterday rule:
 * that rule missed a 47% single-day drop on 2026-09-06 and is blind to a slow
 * slide (each day within 50% of the last). A 40% drop against a month-long
 * baseline catches both.
 */
import { Database } from 'bun:sqlite';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { ACTIVE_SOURCE_IDS } from '../src/config/active-source-ids';

const ROOT = resolve(import.meta.dir, '..');
const DEFAULTS = {
  dbPath: join(ROOT, 'data', 'events.db'),
  threshold: 0.6,
  windowDays: 30,
  // Below this many prior successful days the baseline is noise, not a mean.
  minSamples: 3,
  // A comparison day older than this means the pipeline itself has stopped —
  // the canary's own blind spot if it only ever compares data against data.
  maxAgeDays: 2,
  label: 'proposed',
};
const EXIT_TRIPPED = 2;

export class CanaryError extends Error {
  constructor(what: string, tryNext: string) {
    super(`yield-canary: FAILED — ${what} — try: ${tryNext}`);
  }
}

export type YieldStatus = 'ok' | 'tripped' | 'insufficient';

export interface SourceYield {
  source: string;
  /** The comparison day: most recent date a QUORUM of active sources ran (see pickComparisonDay); null when there is none. */
  latestRunDate: string | null;
  /** Per-day max events_found on latestRunDate; 0 when the source has no row there. */
  latest: number;
  /** Mean of per-day max events_found over successful prior days in the window; null if no samples. */
  mean: number | null;
  samples: number;
  threshold: number;
  windowDays: number;
  status: YieldStatus;
}

export interface IssueSink {
  /** Titles of OPEN issues matching `search` (gh's search is fuzzy; callers re-filter by prefix). */
  listOpenTitles(search: string): Promise<string[]>;
  create(title: string, body: string, label: string): Promise<void>;
}

/** Today in Europe/Athens (project rule: never the host's local zone), YYYY-MM-DD. */
export function athensToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Whole days from `from` to `to`, both YYYY-MM-DD; negative when `to` is earlier. */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function openScrapeStatsReadOnly(dbPath: string): Database {
  if (!existsSync(dbPath)) {
    throw new CanaryError(
      `events database not found: ${dbPath}`,
      'check data/events.db exists (restore the newest 7-day rolling backup — see scripts/backup-events-db.sh — if missing) or pass --db=PATH',
    );
  }
  // NOT `{ readonly: true }`: events.db is journal_mode=wal and a readonly
  // handle cannot create the -wal/-shm sidecars the daily sqlite3-CLI closes
  // delete, so the first query would fail SQLITE_CANTOPEN. query_only refuses
  // writes at the connection level while still being allowed to open them.
  try {
    const db = new Database(dbPath);
    db.exec('PRAGMA query_only = 1');
    return db;
  } catch (e) {
    throw new CanaryError(`could not open ${dbPath}: ${(e as Error).message}`, 'verify the file is a sqlite database and that its directory is writable (WAL sidecars)');
  }
}

export interface ComputeOptions {
  activeSources: readonly string[];
  threshold: number;
  windowDays: number;
}

/**
 * The comparison day is the most recent date on which a QUORUM (half, rounded
 * up) of the active sources wrote a scrape_stats row — NOT simply MAX(date).
 * A single-source run (`bun run scripts/scrape-all.ts --source more`, a
 * documented production flag) writes exactly one row; if that day were the
 * comparison day every other active source would read latest=0 against a
 * healthy mean and one invocation would file an issue for each of them.
 * Quorum counts ATTEMPTS (scrape-all writes a row per source it runs, success
 * or not), so a full pipeline day always qualifies and a partial run never does.
 * Returns null when no day in the window carries a quorum — the pipeline has
 * not completed a full cycle, which runCanary reports as staleness.
 */
export function pickComparisonDay(db: Database, activeSources: readonly string[], windowDays: number): string | null {
  const rows = db
    .prepare(
      `SELECT DISTINCT date(scraped_at) AS d, source AS s FROM scrape_stats
       WHERE date(scraped_at) >= date((SELECT MAX(date(scraped_at)) FROM scrape_stats), '-' || $days || ' days')`,
    )
    .all({ $days: String(windowDays) }) as Array<{ d: string; s: string }>;
  const active = new Set(activeSources);
  const quorum = Math.max(1, Math.ceil(active.size / 2));
  const perDay = new Map<string, number>();
  for (const r of rows) if (active.has(r.s)) perDay.set(r.d, (perDay.get(r.d) ?? 0) + 1);
  let best: string | null = null;
  for (const [d, n] of perDay) if (n >= quorum && (best === null || d > best)) best = d;
  return best;
}

/**
 * Both the latest yield and every history sample are PER-DAY MAX events_found.
 * A day can hold several runs (a manual rerun after a failure, the 2026-09-13
 * double run) and a 0-event retry must not read as a collapse — nor drag the
 * baseline down — when the same day also produced a full scrape.
 */
export function computeYields(db: Database, opts: ComputeOptions): SourceYield[] {
  const latestRunDate = pickComparisonDay(db, opts.activeSources, opts.windowDays);

  const latestStmt = db.prepare(
    `SELECT MAX(events_found) AS n FROM scrape_stats WHERE source = $source AND date(scraped_at) = $latest`,
  );
  // Prior days only (< latest), successful runs only, inside the window.
  const historyStmt = db.prepare(`
    SELECT AVG(day_max) AS mean, COUNT(*) AS samples FROM (
      SELECT date(scraped_at) AS d, MAX(events_found) AS day_max
      FROM scrape_stats
      WHERE source = $source
        AND success = 1
        AND date(scraped_at) < $latest
        AND date(scraped_at) >= date($latest, '-' || $days || ' days')
      GROUP BY d
    )
  `);

  const out: SourceYield[] = [];
  for (const source of opts.activeSources) {
    if (latestRunDate === null) {
      out.push({ source, latestRunDate: null, latest: 0, mean: null, samples: 0, threshold: opts.threshold, windowDays: opts.windowDays, status: 'insufficient' });
      continue;
    }
    const latestRow = latestStmt.get({ $source: source, $latest: latestRunDate }) as { n: number | null };
    const latest = latestRow.n ?? 0;
    const h = historyStmt.get({ $source: source, $latest: latestRunDate, $days: String(opts.windowDays) }) as { mean: number | null; samples: number };
    const samples = h.samples;
    const mean = samples > 0 ? h.mean : null;
    let status: YieldStatus;
    if (mean === null || samples < DEFAULTS.minSamples) status = 'insufficient';
    else status = latest < opts.threshold * mean ? 'tripped' : 'ok';
    out.push({ source, latestRunDate, latest, mean, samples, threshold: opts.threshold, windowDays: opts.windowDays, status });
  }
  return out;
}

export function issueTitlePrefix(source: string): string {
  return `Yield canary: ${source}`;
}

export function issueTitle(source: string, latest: number, mean: number, windowDays = DEFAULTS.windowDays): string {
  return `${issueTitlePrefix(source)} dropped to ${latest} (${windowDays}-day mean ${fmt(mean)})`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function issueBody(y: SourceYield): string {
  const mean = y.mean ?? 0;
  const pct = mean > 0 ? Math.round((1 - y.latest / mean) * 100) : 0;
  return [
    `## Problem`,
    `Scraper \`${y.source}\` yielded ${y.latest} events in the latest run (${y.latestRunDate}), a ${pct}% drop against its ${y.windowDays}-day mean. Below the canary threshold, so either the site changed shape, the scraper was disabled/removed from the active list, or the source genuinely has fewer events. Until known, the site is quietly publishing a thinner ${y.source} listing every day.`,
    ``,
    `## Evidence`,
    `- latest: ${y.latest} (per-day max events_found on ${y.latestRunDate}; 0 = no scrape_stats row for the source that day)`,
    `- ${y.windowDays}-day mean: ${fmt(mean)}`,
    `- samples: ${y.samples} successful prior days`,
    `- threshold: ${y.threshold} (trip when latest < threshold × mean = ${fmt(y.threshold * mean)})`,
    `- detector: \`bun run scripts/yield-canary.ts --dry-run\` (reads scrape_stats read-only)`,
    ``,
    `## Smallest change`,
    `Run the scraper by hand (\`bun run scripts/scrape-all.ts --source ${y.source}\` or its manual equivalent), compare the fetched page against the selectors in \`src/scrapers/\`, and fix the one selector / pagination step that broke. If the source was intentionally disabled, remove it from \`src/config/active-source-ids.ts\` so the canary stops evaluating it.`,
    ``,
    `## Verify at T+14`,
    `Fourteen days after the fix, \`bun run scripts/yield-canary.ts --dry-run\` reports \`${y.source}\` as ok and the ${y.windowDays}-day mean has recovered toward ${fmt(mean)}. If the canary re-trips within that window, the fix did not hold.`,
    ``,
    `## Rollback`,
    `Revert the scraper change (single commit). The canary itself is a standalone read-only script — nothing invokes it on a schedule yet, so there is nothing to disable and nothing to roll back on its side; it never writes to the database.`,
  ].join('\n');
}

/** Real `gh` on PATH (or YIELD_CANARY_GH) — the only place that talks to GitHub. */
export class GhIssueSink implements IssueSink {
  constructor(private bin: string = process.env.YIELD_CANARY_GH || 'gh') {}

  private run(args: string[]): string {
    const r = Bun.spawnSync([this.bin, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    if (r.exitCode !== 0) {
      const err = new TextDecoder().decode(r.stderr).trim().split('\n')[0] || `exit ${r.exitCode}`;
      throw new CanaryError(
        `gh ${args.slice(0, 2).join(' ')} failed (${err})`,
        'run `gh auth status`; re-run with --dry-run to see the would-be issues without GitHub; the yield drop itself is still real',
      );
    }
    return new TextDecoder().decode(r.stdout);
  }

  async listOpenTitles(search: string): Promise<string[]> {
    const out = this.run(['issue', 'list', '--state', 'open', '--search', search, '--json', 'title', '--limit', '50']);
    let parsed: unknown;
    try {
      parsed = JSON.parse(out);
    } catch {
      throw new CanaryError('gh issue list returned non-JSON', 'upgrade gh (needs --json support) or check `gh auth status`');
    }
    return Array.isArray(parsed) ? parsed.map((i) => String((i as { title?: unknown }).title ?? '')) : [];
  }

  async create(title: string, body: string, label: string): Promise<void> {
    this.run(['issue', 'create', '--title', title, '--body', body, '--label', label]);
  }
}

export interface RunOptions {
  dbPath: string;
  activeSources: readonly string[];
  threshold: number;
  windowDays: number;
  dryRun: boolean;
  sink: IssueSink;
  /** YYYY-MM-DD the run is judged against; defaults to the Europe/Athens date. */
  today?: string;
  /** Comparison day older than this (in days) = stale pipeline. Default 2. */
  maxAgeDays?: number;
}

export interface Staleness {
  /** The comparison day that is too old, or null when no full run exists at all. */
  latestRunDate: string | null;
  today: string;
  /** Days between the comparison day and `today`; null when there is no comparison day. */
  ageDays: number | null;
  maxAgeDays: number;
}

export interface RunResult {
  yields: SourceYield[];
  tripped: SourceYield[];
  /** Sources whose issue was skipped because one with the "Yield canary: <source>" prefix is already open. */
  suppressed: string[];
  created: Array<{ source: string; title: string }>;
  /** Filled only in dry-run: what live mode would have filed (before dedupe). */
  wouldCreate: Array<{ source: string; title: string; body: string }>;
  /**
   * Non-null when the newest full pipeline day is older than maxAgeDays (or
   * there is none). Every yield here is "data compared against data": if the
   * pipeline stops, the last day it DID run keeps looking healthy forever. This
   * is the only signal that says so.
   */
  stale: Staleness | null;
}

export async function runCanary(opts: RunOptions): Promise<RunResult> {
  const db = openScrapeStatsReadOnly(opts.dbPath);
  let yields: SourceYield[];
  try {
    yields = computeYields(db, { activeSources: opts.activeSources, threshold: opts.threshold, windowDays: opts.windowDays });
  } catch (e) {
    if (e instanceof CanaryError) throw e;
    throw new CanaryError(
      `query against ${opts.dbPath} failed: ${(e as Error).message}`,
      'confirm the DB has the scrape_stats table (src/db/schema.sql) — run scripts/assert-events-db-healthy.sh',
    );
  } finally {
    db.close();
  }

  const tripped = yields.filter((y) => y.status === 'tripped');
  const today = opts.today ?? athensToday();
  const maxAgeDays = opts.maxAgeDays ?? DEFAULTS.maxAgeDays;
  const comparisonDay = yields[0]?.latestRunDate ?? null;
  const ageDays = comparisonDay === null ? null : dayDiff(comparisonDay, today);
  const stale =
    comparisonDay === null || (ageDays !== null && ageDays > maxAgeDays)
      ? { latestRunDate: comparisonDay, today, ageDays, maxAgeDays }
      : null;
  const result: RunResult = { yields, tripped, suppressed: [], created: [], wouldCreate: [], stale };

  for (const y of tripped) {
    const title = issueTitle(y.source, y.latest, y.mean ?? 0, y.windowDays);
    const body = issueBody(y);
    if (opts.dryRun) {
      result.wouldCreate.push({ source: y.source, title, body });
      continue;
    }
    // Dedupe on the prefix, not the exact title: the numbers change daily and
    // a second day of decline must not file a second issue.
    const prefix = issueTitlePrefix(y.source);
    try {
      const open = await opts.sink.listOpenTitles(prefix);
      if (open.some((t) => t.startsWith(prefix))) {
        result.suppressed.push(y.source);
        continue;
      }
      await opts.sink.create(title, body, DEFAULTS.label);
      result.created.push({ source: y.source, title });
    } catch (e) {
      // The GitHub failure must not hide the yield drop it was reporting.
      const inner = e instanceof CanaryError ? e.message.replace(/^yield-canary: FAILED — /, '').replace(/ — try: .*$/, '') : (e as Error).message;
      throw new CanaryError(
        `${inner} while filing "${title}" (${y.source} latest=${y.latest} mean=${fmt(y.mean ?? 0)} threshold=${y.threshold})`,
        'run `gh auth status`; re-run with --dry-run to see the would-be issues without GitHub; the yield drop itself is still real',
      );
    }
  }
  return result;
}

/** ONE rule-5 stderr line covering both failure kinds (staleness and trips). */
function failureLine(r: RunResult): string {
  const parts: string[] = [];
  if (r.stale) {
    parts.push(
      r.stale.latestRunDate === null
        ? `stale: no day in the window has a quorum of active sources in scrape_stats (today ${r.stale.today})`
        : `stale pipeline: newest full run ${r.stale.latestRunDate} is ${r.stale.ageDays} days old (limit ${r.stale.maxAgeDays})`,
    );
  }
  if (r.tripped.length > 0) {
    parts.push(`yield drop: ${r.tripped.map((y) => `${y.source} latest=${y.latest} mean=${fmt(y.mean ?? 0)} threshold=${y.threshold}`).join('; ')}`);
  }
  return new CanaryError(
    parts.join(' | '),
    r.stale
      ? 'check the daily pipeline actually ran (tail logs/deploy-cadence.log; launchctl list | grep agent-athens), then re-run; --max-age-days=N widens the limit'
      : 'scrape the source by hand (bun run scripts/scrape-all.ts --source <id>) and compare against src/scrapers/; see the "Yield canary: <source>" issue(s)',
  ).message;
}

function parseArgs(argv: string[]): { dbPath: string; threshold: number; windowDays: number; maxAgeDays: number; dryRun: boolean } {
  const usage = 'use --db=PATH --threshold=0.6 --window-days=30 --max-age-days=2 --dry-run';
  const o = { dbPath: DEFAULTS.dbPath, threshold: DEFAULTS.threshold, windowDays: DEFAULTS.windowDays, maxAgeDays: DEFAULTS.maxAgeDays, dryRun: false };
  for (const arg of argv) {
    if (arg.startsWith('--db=')) o.dbPath = resolve(arg.slice('--db='.length));
    else if (arg.startsWith('--threshold=')) {
      const v = Number(arg.slice('--threshold='.length));
      if (!Number.isFinite(v) || v <= 0 || v > 1) throw new CanaryError(`bad --threshold value "${arg.slice('--threshold='.length)}" (need 0 < t <= 1)`, usage);
      o.threshold = v;
    } else if (arg.startsWith('--window-days=')) {
      const v = Number(arg.slice('--window-days='.length));
      if (!Number.isInteger(v) || v < 1) throw new CanaryError(`bad --window-days value "${arg.slice('--window-days='.length)}" (need a positive integer)`, usage);
      o.windowDays = v;
    } else if (arg.startsWith('--max-age-days=')) {
      const v = Number(arg.slice('--max-age-days='.length));
      if (!Number.isInteger(v) || v < 1) throw new CanaryError(`bad --max-age-days value "${arg.slice('--max-age-days='.length)}" (need a positive integer)`, usage);
      o.maxAgeDays = v;
    } else if (arg === '--dry-run') o.dryRun = true;
    else throw new CanaryError(`unknown argument ${arg}`, usage);
  }
  return o;
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const today = process.env.YIELD_CANARY_TODAY || athensToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      throw new CanaryError(`bad YIELD_CANARY_TODAY value "${today}"`, 'unset it (production uses the Europe/Athens date) or set YYYY-MM-DD');
    }
    const r = await runCanary({ ...args, today, activeSources: ACTIVE_SOURCE_IDS, sink: new GhIssueSink() });
    const insufficient = r.yields.filter((y) => y.status === 'insufficient').map((y) => `${y.source}(${y.samples} samples, latest ${y.latest})`);
    const latestDate = r.yields[0]?.latestRunDate ?? 'none';
    console.log(
      `yield-canary: ${r.yields.length} active sources, latest full run ${latestDate}, ${r.tripped.length} tripped, ${insufficient.length} insufficient history` +
        (insufficient.length ? ` [${insufficient.join(', ')}]` : '') +
        (r.stale ? `, STALE (${r.stale.ageDays ?? 'no'} days old, limit ${r.stale.maxAgeDays})` : '') +
        ` (threshold ${args.threshold}, window ${args.windowDays}d)`,
    );
    if (r.tripped.length === 0 && !r.stale) process.exit(0);

    if (args.dryRun) {
      for (const w of r.wouldCreate) {
        console.log(`[DRY RUN] would open issue (label ${DEFAULTS.label}): ${w.title}`);
        console.log(w.body.split('\n').map((l) => `    ${l}`).join('\n'));
      }
    } else {
      for (const c of r.created) console.log(`created: ${c.title}`);
      for (const s of r.suppressed) console.log(`already open: an issue titled "${issueTitlePrefix(s)}…" exists — not re-filed`);
    }
    console.error(failureLine(r));
    process.exit(EXIT_TRIPPED);
  } catch (e) {
    const msg = e instanceof CanaryError ? e.message : new CanaryError(`unexpected: ${(e as Error).message}`, 'run with --dry-run and inspect the stack').message;
    console.error(msg);
    process.exit(1);
  }
}
