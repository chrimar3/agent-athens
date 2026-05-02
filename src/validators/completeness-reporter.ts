/**
 * Per-EventType schema completeness reporter (Sprint 2 Component D).
 *
 * Pure consumer of SchemaValidationSummary from schema-completeness.ts.
 * Joins event-page validation results against pageableEvents on
 * generateEventSlug, buckets events by EventType, and emits a tracked
 * data/build-completeness.json artifact for cross-build trend analysis.
 *
 * Hubs and venues are tallied as flat aggregates (disjoint schemas, no
 * EventType dimension). Layered scoring (event/offer/place/aria) ships
 * as status flags only; place_level + aria_level flip to "measured"
 * when Components B and C land.
 */

import type { SchemaValidationSummary } from './schema-completeness';
import type { Event, EventType } from '../types';
import { generateEventSlug } from '../generators/event-page';
import { writeJsonApiIfChangedSync } from '../utils/write-if-changed';

// Declaration order must mirror types.ts:69-81. The `satisfies` clause makes
// TypeScript fail compile if the EventType union evolves and BUCKET_ORDER
// drifts — preventing silent loss of a new EventType bucket.
const BUCKET_ORDER = [
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

export interface BucketReport {
  type: EventType;
  total: number;
  pass: number;
  warn: number;
  fail: number;
  passRate: number; // whole percent, rounded
}

export interface PageGroupReport {
  total: number;
  pass: number;
  warn: number;
  fail: number;
}

export interface CompletenessReport {
  meta: { lastUpdate: string };
  layers: {
    event_level: 'measured' | 'not_measured';
    offer_level: 'measured' | 'not_measured';
    place_level: 'measured' | 'not_measured';
    aria_level: 'measured' | 'not_measured';
    datafeed_level: 'measured' | 'not_measured';
  };
  events: {
    byType: BucketReport[];
    totals: Omit<BucketReport, 'type'>;
    orphanSlugs: string[];
  };
  hubs: PageGroupReport;
  venues: PageGroupReport;
  datafeed: PageGroupReport;
}

type Verdict = 'pass' | 'warn' | 'fail';

function classify(errors: readonly string[], warnings: readonly string[]): Verdict {
  if (errors.length > 0) return 'fail';
  if (warnings.length > 0) return 'warn';
  return 'pass';
}

function emptyGroup(): PageGroupReport {
  return { total: 0, pass: 0, warn: 0, fail: 0 };
}

function tally(group: PageGroupReport, verdict: Verdict): void {
  group.total++;
  group[verdict]++;
}

export function buildCompletenessReport(
  summary: SchemaValidationSummary,
  events: Event[],
): CompletenessReport {
  // Build slug → EventType map. generateEventSlug is the canonical join key
  // shared with the page generator.
  const slugToType = new Map<string, EventType>();
  for (const event of events) {
    slugToType.set(generateEventSlug(event), event.type);
  }

  // Per-EventType accumulators, one per bucket. Only buckets with total > 0
  // appear in the final byType output.
  const buckets = new Map<EventType, PageGroupReport>();
  for (const type of BUCKET_ORDER) {
    buckets.set(type, emptyGroup());
  }

  const hubs = emptyGroup();
  const venues = emptyGroup();
  const datafeed = emptyGroup();
  const orphanSlugs: string[] = [];

  for (const result of summary.details) {
    const verdict = classify(result.errors, result.warnings);

    if (result.slug.startsWith('hub:')) {
      tally(hubs, verdict);
      continue;
    }
    if (result.slug.startsWith('venue:')) {
      tally(venues, verdict);
      continue;
    }
    if (result.slug.startsWith('datafeed:')) {
      tally(datafeed, verdict);
      continue;
    }

    // Event slug. Strip optional en/ mirror prefix before lookup; the English
    // page validates the same Event row.
    const lookupSlug = result.slug.startsWith('en/')
      ? result.slug.slice(3)
      : result.slug;

    const type = slugToType.get(lookupSlug);
    if (!type) {
      orphanSlugs.push(result.slug);
      continue;
    }

    tally(buckets.get(type)!, verdict);
  }

  const byType: BucketReport[] = [];
  const totals = emptyGroup();

  for (const type of BUCKET_ORDER) {
    const group = buckets.get(type)!;
    if (group.total === 0) continue;
    byType.push({
      type,
      total: group.total,
      pass: group.pass,
      warn: group.warn,
      fail: group.fail,
      passRate: Math.round((group.pass / group.total) * 100),
    });
    totals.total += group.total;
    totals.pass += group.pass;
    totals.warn += group.warn;
    totals.fail += group.fail;
  }

  const totalsWithRate: Omit<BucketReport, 'type'> = {
    ...totals,
    passRate: totals.total > 0 ? Math.round((totals.pass / totals.total) * 100) : 0,
  };

  orphanSlugs.sort();

  return {
    meta: { lastUpdate: new Date().toISOString() },
    layers: {
      event_level: 'measured',
      offer_level: 'measured',
      place_level: 'not_measured',
      aria_level: 'not_measured',
      datafeed_level: 'measured',
    },
    events: {
      byType,
      totals: totalsWithRate,
      orphanSlugs,
    },
    hubs,
    venues,
    datafeed,
  };
}

export function writeCompletenessReport(
  report: CompletenessReport,
  outputPath: string,
): boolean {
  return writeJsonApiIfChangedSync(outputPath, report);
}

export function printBucketSummary(report: CompletenessReport): void {
  const { totals, byType, orphanSlugs } = report.events;
  if (totals.total === 0) {
    console.log('   📦 Per-EventType breakdown: no events to bucket');
    return;
  }

  console.log(`   📦 Per-EventType breakdown (${totals.pass}/${totals.total} = ${totals.passRate}%):`);
  for (const bucket of byType) {
    const label = bucket.type.padEnd(11);
    console.log(
      `      ${label} ${bucket.pass}/${bucket.total} (${bucket.passRate}%)` +
        (bucket.warn > 0 ? `  ⚠️  ${bucket.warn}` : '') +
        (bucket.fail > 0 ? `  ❌ ${bucket.fail}` : ''),
    );
  }

  if (orphanSlugs.length > 0) {
    const sample = orphanSlugs.slice(0, 5).join(', ');
    const more = orphanSlugs.length > 5 ? ` (+${orphanSlugs.length - 5} more)` : '';
    console.log(`   ⚠️  ${orphanSlugs.length} orphan slug(s) — validated pages without matching event: ${sample}${more}`);
  }
}
