#!/usr/bin/env bun
/**
 * Sprint 2 Component C — post-build CLI ARIA audit (WARN-level only).
 *
 * Runs Pa11y against sampled hub + event-detail + English mirror pages
 * in dist/. Writes per-page detail to data/build-aria-report.json and
 * per-template aggregate to data/build-aria-aggregate.json (consumed by
 * generate-site.ts during buildCompletenessReport).
 *
 * Default: all hubs + 5 stratified events per EventType (≤60) + all
 * English mirrors. --full: every event-detail page in dist/.
 *
 * file:// scheme: CSS/JS does not load, so checks are limited to
 * static-HTML WCAG2AA via Pa11y's HTML CodeSniffer runner. Color
 * contrast and JS-derived a11y issues are out of scope. Sprint 3 may
 * add a served-URL pass for those issues if WARN→FAIL promotion needs
 * them.
 *
 * WARN-level: process always exits 0; build is never gated on audit.
 * Sprint 3 promotes WARN→FAIL.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import type { EventType } from '../src/types';
import { generateEventSlug } from '../src/generators/event-page';
import { getAllEvents } from '../src/db/database';
import {
  writeJsonApiIfChangedSync,
  writeFileIfChangedSync,
} from '../src/utils/write-if-changed';
import type {
  AriaAggregate,
  PageGroupReport as ReporterPageGroupReport,
} from '../src/validators/completeness-reporter';

// Mirror BUCKET_ORDER from src/validators/completeness-reporter.ts.
// `satisfies` clause guards against EventType union drift.
const EVENT_TYPES = [
  'concert',
  'dj_set',
  'exhibition',
  'cinema',
  'theater',
  'festival',
  'performance',
  'show',
  'workshop',
  'tech',
  'dance',
  'other',
] as const satisfies readonly EventType[];

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const DIST_DIR = join(PROJECT_ROOT, 'dist');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const PA11Y_BIN = join(PROJECT_ROOT, 'node_modules/.bin/pa11y');

const SAMPLE_PER_TYPE = 5;
const CONCURRENCY = 4;

export type Pa11yIssue = {
  code: string;
  type: 'error' | 'warning' | 'notice';
  typeCode: number;
  message: string;
  context: string;
  selector: string;
  runner: string;
  runnerExtras: Record<string, unknown>;
};

export type PageVerdict = 'pass' | 'warn' | 'fail' | 'audit_error';

export type Template = 'hub_template' | 'event_template';

// Re-export AriaAggregate so consumers of this script need only one import.
// Single source of truth lives in completeness-reporter.ts.
export type PageGroupReport = ReporterPageGroupReport;
export type { AriaAggregate };

export type PerPageDetail = {
  url: string; // project-relative path
  template: Template;
  verdict: PageVerdict;
  issueCount: number;
  issues: Pa11yIssue[];
  errorMessage?: string;
};

export type AriaReport = {
  meta: { lastUpdate: string };
  pages: PerPageDetail[];
};

// ─── Pure logic (test surface) ─────────────────────────────────────────

export function classify(issues: Pa11yIssue[]): PageVerdict {
  if (issues.length === 0) return 'pass';
  if (issues.some((i) => i.type === 'error')) return 'fail';
  return 'warn';
}

export function emptyGroup(): PageGroupReport {
  return { total: 0, pass: 0, warn: 0, fail: 0, info: 0 };
}

export function tallyAggregate(group: PageGroupReport, verdict: PageVerdict): void {
  if (verdict === 'audit_error') return;
  group.total++;
  group[verdict]++;
}

// ─── Discovery ─────────────────────────────────────────────────────────

function discoverHubs(): string[] {
  return readdirSync(DIST_DIR)
    .filter((name) => name.endsWith('.html'))
    .map((name) => join(DIST_DIR, name));
}

function discoverEnglishMirrors(): string[] {
  const enEventsDir = join(DIST_DIR, 'en', 'events');
  if (!existsSync(enEventsDir)) return [];
  return readdirSync(enEventsDir)
    .map((slug) => join(enEventsDir, slug, 'index.html'))
    .filter((p) => existsSync(p));
}

function shuffle<T>(arr: T[]): T[] {
  return arr
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function discoverEventSample(full: boolean): string[] {
  const eventsDir = join(DIST_DIR, 'events');
  if (!existsSync(eventsDir)) return [];

  if (full) {
    return readdirSync(eventsDir)
      .map((slug) => join(eventsDir, slug, 'index.html'))
      .filter((p) => existsSync(p));
  }

  const events = getAllEvents();
  const slugToType = new Map<string, EventType>();
  for (const event of events) {
    slugToType.set(generateEventSlug(event), event.type);
  }

  const byType = new Map<EventType, string[]>();
  for (const type of EVENT_TYPES) byType.set(type, []);

  for (const slug of readdirSync(eventsDir)) {
    const path = join(eventsDir, slug, 'index.html');
    if (!existsSync(path)) continue;
    const type = slugToType.get(slug);
    if (!type) continue; // orphan: page without matching event row
    byType.get(type)!.push(path);
  }

  const sample: string[] = [];
  for (const type of EVENT_TYPES) {
    const candidates = byType.get(type) ?? [];
    sample.push(...shuffle(candidates).slice(0, SAMPLE_PER_TYPE));
  }
  return sample;
}

// ─── Pa11y subprocess ──────────────────────────────────────────────────

async function auditPage(
  filePath: string,
  template: Template,
): Promise<PerPageDetail> {
  const url = `file://${filePath}`;
  const proc = Bun.spawn({
    cmd: [PA11Y_BIN, url, '--reporter', 'json'],
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  // Pa11y exit 0 = clean, 2 = issues found (both produce valid JSON).
  // Anything else (1, 124, etc.) is a tool-level error.
  if (exitCode !== 0 && exitCode !== 2) {
    return {
      url: relative(PROJECT_ROOT, filePath),
      template,
      verdict: 'audit_error',
      issueCount: 0,
      issues: [],
      errorMessage: (stderr || stdout).slice(0, 500),
    };
  }

  let issues: Pa11yIssue[];
  try {
    issues = JSON.parse(stdout);
  } catch (e) {
    return {
      url: relative(PROJECT_ROOT, filePath),
      template,
      verdict: 'audit_error',
      issueCount: 0,
      issues: [],
      errorMessage: `JSON parse error: ${(e as Error).message}`,
    };
  }

  const verdict = classify(issues);
  return {
    url: relative(PROJECT_ROOT, filePath),
    template,
    verdict,
    issueCount: issues.length,
    issues,
  };
}

// ─── Concurrent runner ─────────────────────────────────────────────────

async function auditWithConcurrency(
  targets: { path: string; template: Template }[],
  concurrency: number,
): Promise<PerPageDetail[]> {
  const results: PerPageDetail[] = new Array(targets.length);
  let nextIdx = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= targets.length) return;
      const { path, template } = targets[idx]!;
      results[idx] = await auditPage(path, template);
      completed++;
      if (completed % 25 === 0 || completed === targets.length) {
        process.stderr.write(
          `[aria-audit]   ${completed}/${targets.length} pages audited\n`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ─── Top-level orchestration ───────────────────────────────────────────

export async function runAudit(opts: { full: boolean }): Promise<{
  report: AriaReport;
  aggregate: AriaAggregate;
}> {
  const hubs = discoverHubs();
  const events = discoverEventSample(opts.full);
  const enMirrors = discoverEnglishMirrors();

  console.log(
    `[aria-audit] discovery: ${hubs.length} hubs, ${events.length} events, ${enMirrors.length} en-mirrors`,
  );

  const targets: { path: string; template: Template }[] = [
    ...hubs.map((p) => ({ path: p, template: 'hub_template' as const })),
    ...events.map((p) => ({ path: p, template: 'event_template' as const })),
    ...enMirrors.map((p) => ({ path: p, template: 'event_template' as const })),
  ];

  console.log(
    `[aria-audit] auditing ${targets.length} pages (concurrency=${CONCURRENCY})…`,
  );
  const startMs = Date.now();
  const pages = await auditWithConcurrency(targets, CONCURRENCY);
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`[aria-audit] complete in ${elapsedSec}s`);

  const hubAgg = emptyGroup();
  const eventAgg = emptyGroup();
  for (const page of pages) {
    if (page.template === 'hub_template') tallyAggregate(hubAgg, page.verdict);
    else tallyAggregate(eventAgg, page.verdict);
  }

  const now = new Date().toISOString();
  const report: AriaReport = { meta: { lastUpdate: now }, pages };
  const aggregate: AriaAggregate = {
    hub_template: hubAgg,
    event_template: eventAgg,
  };

  return { report, aggregate };
}

async function main(): Promise<void> {
  const full = process.argv.includes('--full');
  console.log(`[aria-audit] mode=${full ? 'full' : 'sampled'}`);

  const { report, aggregate } = await runAudit({ full });

  writeJsonApiIfChangedSync(
    join(DATA_DIR, 'build-aria-report.json'),
    report as unknown as Record<string, unknown>,
  );
  writeFileIfChangedSync(
    join(DATA_DIR, 'build-aria-aggregate.json'),
    JSON.stringify(aggregate, null, 2),
  );

  const errCount = report.pages.filter((p) => p.verdict === 'audit_error').length;
  console.log(
    `[aria-audit] hub_template: ${aggregate.hub_template.pass}/${aggregate.hub_template.total} pass; ` +
      `event_template: ${aggregate.event_template.pass}/${aggregate.event_template.total} pass` +
      (errCount > 0 ? ` (${errCount} audit_error)` : ''),
  );

  // WARN-level: never propagate non-zero exit. Build is never gated on audit.
  process.exit(0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('[aria-audit] fatal:', err);
    process.exit(0);
  });
}
