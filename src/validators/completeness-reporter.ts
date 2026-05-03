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
import { normalizeVenueKey } from '../ticketing/venue-registry';
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
  /** Pages with INFO-tier findings. Orthogonal to pass/warn/fail — INFO does
   *  not downgrade pass status. Sprint 2 Component B-2 (Q-B1 lock). */
  info: number;
  passRate: number; // whole percent, rounded
}

export interface PageGroupReport {
  total: number;
  pass: number;
  warn: number;
  fail: number;
  /** Pages with INFO-tier findings. Orthogonal to pass/warn/fail — INFO does
   *  not downgrade pass status. Sprint 2 Component B-2 (Q-B1 lock). */
  info: number;
}

// Sprint 2 Component C — per-template ARIA aggregate. Per-page detail
// lives in data/build-aria-report.json; this slot mirrors `datafeed`'s
// flat-aggregate shape but split by template, since ARIA findings are
// template-systemic (one CSS/HTML pattern affects thousands of pages).
// Single source of truth: scripts/audit-aria.ts imports this type.
export interface AriaAggregate {
  hub_template: PageGroupReport;
  event_template: PageGroupReport;
}

// Sprint 2 Component B-2 — per-venue aggregate. byType precedent (BucketReport[])
// keyed by normalizeVenueKey(venue.name). sameAsState: 'present' if ANY event at
// the venue has venue.sameAs populated, 'missing' otherwise (Editorial filtering).
// Q-B2 hybrid lock 2026-05-03.
export interface VenueBucketReport {
  venue: string; // normalized venue key
  total: number;
  pass: number;
  warn: number;
  fail: number;
  info: number;
  passRate: number;
  sameAsState: 'present' | 'missing';
}

// Sprint 2 Component B-2 — ratchet diagnostic state surfaced in the artifact.
// Decided once at build start in generate-site.ts (single source of truth);
// reporter is a pure passthrough so consumers can see the why behind severity.
// Q-B1 lock 2026-05-03.
export interface RatchetState {
  venueSameAs: {
    coverage: number;
    populated: number;
    total: number;
    threshold: number;
    currentSeverity: 'info' | 'warn';
  };
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
  aria: AriaAggregate;
  // Sprint 2 Component B-2 (Q-B2 hybrid lock): per-template + per-venue.
  // venue_template + event_template are template-axis lenses on the same
  // underlying data (venues + event-page results); byVenue surfaces the
  // venue-axis lens for Editorial filtering; ratchet records why severity
  // is what it is.
  place: {
    venue_template: PageGroupReport;
    event_template: PageGroupReport;
    byVenue: VenueBucketReport[];
    ratchet: RatchetState;
  };
}

type Verdict = 'pass' | 'warn' | 'fail';

function classify(errors: readonly string[], warnings: readonly string[]): Verdict {
  if (errors.length > 0) return 'fail';
  if (warnings.length > 0) return 'warn';
  return 'pass';
}

function emptyGroup(): PageGroupReport {
  return { total: 0, pass: 0, warn: 0, fail: 0, info: 0 };
}

function tally(group: PageGroupReport, verdict: Verdict, hasInfo: boolean): void {
  group.total++;
  group[verdict]++;
  if (hasInfo) group.info++;
}

export function buildCompletenessReport(
  summary: SchemaValidationSummary,
  events: Event[],
  ariaAggregate: AriaAggregate,
  ratchetState: RatchetState,
): CompletenessReport {
  // Build slug → EventType map. generateEventSlug is the canonical join key
  // shared with the page generator.
  const slugToType = new Map<string, EventType>();
  // Sprint 2 Component B-2: parallel slug → normalized venue key map for byVenue.
  const slugToVenue = new Map<string, string>();
  // Track sameAs presence per venue: any event at venue X has venue.sameAs → present.
  const venueHasSameAs = new Map<string, boolean>();
  for (const event of events) {
    const slug = generateEventSlug(event);
    slugToType.set(slug, event.type);
    const venueKey = normalizeVenueKey(event.venue.name);
    if (venueKey) {
      slugToVenue.set(slug, venueKey);
      const hadSameAs = venueHasSameAs.get(venueKey) ?? false;
      const eventHasSameAs = !!(event.venue.sameAs && event.venue.sameAs.length > 0);
      venueHasSameAs.set(venueKey, hadSameAs || eventHasSameAs);
    }
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

  // Sprint 2 Component B-2: per-venue accumulator (event-page side) +
  // separate event_template aggregate (sum of all event-page validations,
  // covering the place layer's event-template axis per Q-B2 hybrid).
  const venueBuckets = new Map<string, PageGroupReport>();
  const eventTemplate = emptyGroup();

  for (const result of summary.details) {
    const verdict = classify(result.errors, result.warnings);
    const hasInfo = (result.info?.length ?? 0) > 0;

    if (result.slug.startsWith('hub:')) {
      tally(hubs, verdict, hasInfo);
      continue;
    }
    if (result.slug.startsWith('venue:')) {
      tally(venues, verdict, hasInfo);
      continue;
    }
    if (result.slug.startsWith('datafeed:')) {
      tally(datafeed, verdict, hasInfo);
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

    tally(buckets.get(type)!, verdict, hasInfo);

    // place layer: event_template + per-venue accumulation.
    tally(eventTemplate, verdict, hasInfo);
    const venueKey = slugToVenue.get(lookupSlug);
    if (venueKey) {
      let vbucket = venueBuckets.get(venueKey);
      if (!vbucket) {
        vbucket = emptyGroup();
        venueBuckets.set(venueKey, vbucket);
      }
      tally(vbucket, verdict, hasInfo);
    }
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
      info: group.info,
      passRate: Math.round((group.pass / group.total) * 100),
    });
    totals.total += group.total;
    totals.pass += group.pass;
    totals.warn += group.warn;
    totals.fail += group.fail;
    totals.info += group.info;
  }

  const totalsWithRate: Omit<BucketReport, 'type'> = {
    ...totals,
    passRate: totals.total > 0 ? Math.round((totals.pass / totals.total) * 100) : 0,
  };

  orphanSlugs.sort();

  // Sprint 2 Component B-2: build byVenue array, sorted alphabetically by key.
  // venue_template reuses the venues aggregate (same data, template-axis lens).
  const sortedVenueKeys = [...venueBuckets.keys()].sort();
  const byVenue: VenueBucketReport[] = sortedVenueKeys.map(venueKey => {
    const g = venueBuckets.get(venueKey)!;
    return {
      venue: venueKey,
      total: g.total,
      pass: g.pass,
      warn: g.warn,
      fail: g.fail,
      info: g.info,
      passRate: Math.round((g.pass / g.total) * 100),
      sameAsState: venueHasSameAs.get(venueKey) ? 'present' : 'missing',
    };
  });

  return {
    meta: { lastUpdate: new Date().toISOString() },
    layers: {
      event_level: 'measured',
      offer_level: 'measured',
      place_level: 'measured',
      aria_level: 'measured',
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
    aria: ariaAggregate,
    place: {
      venue_template: venues,
      event_template: eventTemplate,
      byVenue,
      ratchet: ratchetState,
    },
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
