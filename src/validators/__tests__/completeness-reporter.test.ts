import { describe, test, expect } from 'bun:test';
import {
  buildCompletenessReport,
  deriveAriaLevel,
  type CompletenessReport,
  type BucketReport,
  type AriaAggregate,
  type RatchetState,
  type VenueBucketReport,
} from '../completeness-reporter';
import type { SchemaValidationSummary, SchemaValidationResult } from '../schema-completeness';
import { generateEventSlug } from '../../generators/event-page';
import type { Event, EventType } from '../../types';

// Sprint 2 Component C — zero aggregate placeholder for tests that don't
// exercise the aria slot. Real aria data is produced by scripts/audit-aria.ts
// and consumed by generate-site.ts; the reporter is a pure passthrough for it.
function emptyAria(): AriaAggregate {
  return {
    hub_template: { total: 0, pass: 0, warn: 0, fail: 0, info: 0 },
    event_template: { total: 0, pass: 0, warn: 0, fail: 0, info: 0 },
  };
}

// Sprint 2 Component B-2 — placeholder ratchet for tests that don't exercise
// the place layer's ratchet state. Mirrors emptyAria() pattern from C.
function emptyRatchet(): RatchetState {
  return {
    venueSameAs: { coverage: 0, populated: 0, total: 0, threshold: 0.5, currentSeverity: 'info' },
  };
}

// Minimal Event factory — only the fields the reporter joins on (id, title, venue.name, type)
// matter; rest is filler to satisfy the type.
function makeEvent(overrides: { id: string; title: string; venueName: string; type: EventType }): Event {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    id: overrides.id,
    title: overrides.title,
    description: '',
    hasNativeGreek: false,
    startDate: '2026-05-15T20:00:00+03:00',
    type: overrides.type,
    genres: [],
    tags: [],
    venue: {
      name: overrides.venueName,
      address: '',
    },
    price: { type: 'open' },
    ticketUrlResolved: null,
    source: 'test',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    language: 'en',
  };
}

function makeResult(slug: string, errors: string[] = [], warnings: string[] = []): SchemaValidationResult {
  return { slug, errors, warnings };
}

function makeSummary(details: SchemaValidationResult[]): SchemaValidationSummary {
  let passCount = 0, warnCount = 0, failCount = 0;
  for (const r of details) {
    if (r.errors.length > 0) failCount++;
    else if (r.warnings.length > 0) warnCount++;
    else passCount++;
  }
  return { total: details.length, passCount, warnCount, failCount, details };
}

describe('buildCompletenessReport', () => {
  test('empty input returns empty report with all-zero totals', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), emptyRatchet());
    expect(report.events.byType).toEqual([]);
    expect(report.events.totals.total).toBe(0);
    expect(report.events.totals.pass).toBe(0);
    expect(report.events.orphanSlugs).toEqual([]);
    expect(report.hubs).toEqual({ total: 0, pass: 0, warn: 0, fail: 0, info: 0 });
    expect(report.venues).toEqual({ total: 0, pass: 0, warn: 0, fail: 0, info: 0 });
    expect(report.datafeed).toEqual({ total: 0, pass: 0, warn: 0, fail: 0, info: 0 });
  });

  test('2.3: registers field-validation posture (location full/FAIL, endDate partial/WARN)', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), emptyRatchet());
    expect(report.fieldValidation.location).toEqual({ coverage: 'full', severity: 'fail' });
    expect(report.fieldValidation.endDate).toEqual({ coverage: 'partial', severity: 'warn' });
  });

  test('only EventTypes present in input appear in byType (lean artifact)', () => {
    const concertEvent = makeEvent({ id: 'aaaa1111', title: 'Jazz Night', venueName: 'Half Note', type: 'concert' });
    const theaterEvent = makeEvent({ id: 'bbbb2222', title: 'Antigone', venueName: 'Megaron', type: 'theater' });
    const events = [concertEvent, theaterEvent];

    const summary = makeSummary([
      makeResult(generateEventSlug(concertEvent)),
      makeResult(generateEventSlug(theaterEvent)),
    ]);

    const report = buildCompletenessReport(summary, events, emptyAria(), emptyRatchet());
    const types = report.events.byType.map(b => b.type);
    expect(types).toEqual(['concert', 'theater']);
    expect(types).not.toContain('exhibition');
    expect(types).not.toContain('other');
  });

  test('validation result with no matching event lands in orphanSlugs, not in byType', () => {
    const event = makeEvent({ id: 'cccc3333', title: 'Concert', venueName: 'Gagarin', type: 'concert' });
    const summary = makeSummary([
      makeResult(generateEventSlug(event)),
      makeResult('ghost-event-no-match'),
    ]);

    const report = buildCompletenessReport(summary, [event], emptyAria(), emptyRatchet());
    expect(report.events.byType).toHaveLength(1);
    expect(report.events.byType[0].type).toBe('concert');
    expect(report.events.byType[0].total).toBe(1);
    expect(report.events.orphanSlugs).toEqual(['ghost-event-no-match']);
  });

  test('English mirror (en/{slug}) buckets to the same EventType', () => {
    const event = makeEvent({ id: 'dddd4444', title: 'Recital', venueName: 'Onassis', type: 'concert' });
    const slug = generateEventSlug(event);
    const summary = makeSummary([
      makeResult(slug),
      makeResult(`en/${slug}`),
    ]);

    const report = buildCompletenessReport(summary, [event], emptyAria(), emptyRatchet());
    expect(report.events.byType).toHaveLength(1);
    const concertBucket = report.events.byType[0];
    expect(concertBucket.type).toBe('concert');
    expect(concertBucket.total).toBe(2); // both bare and en/ counted as distinct page validations
    expect(report.events.orphanSlugs).toEqual([]);
  });

  test('hub: and venue: prefixed results pass through to hubs/venues, never byType or orphans', () => {
    const event = makeEvent({ id: 'eeee5555', title: 'Show', venueName: 'Technopolis', type: 'show' });
    const summary = makeSummary([
      makeResult(generateEventSlug(event)),
      makeResult('hub:today'),
      makeResult('hub:concerts', [], ['warning']),
      makeResult('venue:gagarin'),
      makeResult('venue:megaron', ['error'], []),
    ]);

    const report = buildCompletenessReport(summary, [event], emptyAria(), emptyRatchet());
    expect(report.events.byType).toHaveLength(1);
    expect(report.events.byType[0].type).toBe('show');
    expect(report.events.orphanSlugs).toEqual([]);
    expect(report.hubs).toEqual({ total: 2, pass: 1, warn: 1, fail: 0, info: 0 });
    expect(report.venues).toEqual({ total: 2, pass: 1, warn: 0, fail: 1, info: 0 });
  });

  test('pass/warn/fail classification mirrors validator rule (errors > 0 = fail; else warnings > 0 = warn; else pass)', () => {
    const e1 = makeEvent({ id: '1111aaaa', title: 'A', venueName: 'V1', type: 'cinema' });
    const e2 = makeEvent({ id: '2222bbbb', title: 'B', venueName: 'V2', type: 'cinema' });
    const e3 = makeEvent({ id: '3333cccc', title: 'C', venueName: 'V3', type: 'cinema' });
    const e4 = makeEvent({ id: '4444dddd', title: 'D', venueName: 'V4', type: 'cinema' });

    const summary = makeSummary([
      makeResult(generateEventSlug(e1)),                              // pass
      makeResult(generateEventSlug(e2), [], ['w1']),                  // warn
      makeResult(generateEventSlug(e3), ['e1'], []),                  // fail
      makeResult(generateEventSlug(e4), ['e1'], ['w1']),              // fail (errors win)
    ]);

    const report = buildCompletenessReport(summary, [e1, e2, e3, e4], emptyAria(), emptyRatchet());
    const cinema = report.events.byType.find(b => b.type === 'cinema')!;
    expect(cinema.total).toBe(4);
    expect(cinema.pass).toBe(1);
    expect(cinema.warn).toBe(1);
    expect(cinema.fail).toBe(2);
    expect(cinema.passRate).toBe(25); // 1/4 = 25%
  });

  test('layer flags: all five measured when aria aggregate carries fresh meta', () => {
    const ariaFresh: AriaAggregate = {
      ...emptyAria(),
      meta: { lastUpdate: new Date().toISOString() },
    };
    const report = buildCompletenessReport(makeSummary([]), [], ariaFresh, emptyRatchet());
    expect(report.layers.event_level).toBe('measured');
    expect(report.layers.offer_level).toBe('measured');
    expect(report.layers.place_level).toBe('measured');
    expect(report.layers.aria_level).toBe('measured');
    expect(report.layers.datafeed_level).toBe('measured');
  });

  // Sprint 2 Component C — aria slot is a pure passthrough of the
  // ariaAggregate parameter. Reporter does not read filesystem for ARIA
  // data; scripts/audit-aria.ts produces the aggregate, generate-site.ts
  // loads it and passes it in.
  test('aria slot: empty aggregate produces zero hub_template + event_template counts', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), emptyRatchet());
    expect(report.aria).toEqual({
      hub_template: { total: 0, pass: 0, warn: 0, fail: 0, info: 0 },
      event_template: { total: 0, pass: 0, warn: 0, fail: 0, info: 0 },
    });
  });

  test('aria slot: passthrough — values from ariaAggregate parameter appear unchanged in report', () => {
    const ariaInput: AriaAggregate = {
      hub_template: { total: 50, pass: 45, warn: 5, fail: 0, info: 0 },
      event_template: { total: 100, pass: 92, warn: 6, fail: 2, info: 0 },
    };
    const report = buildCompletenessReport(makeSummary([]), [], ariaInput, emptyRatchet());
    expect(report.aria).toEqual(ariaInput);
  });

  // Sprint 2 Component A — datafeed:{slug} prefix routes into the new datafeed
  // aggregate, not byType and not orphanSlugs.
  test('datafeed: prefixed results route into datafeed aggregate, not byType or orphans', () => {
    const event = makeEvent({ id: 'ffff6666', title: 'Show', venueName: 'X', type: 'concert' });
    const summary = makeSummary([
      makeResult(generateEventSlug(event)),
      makeResult('datafeed:events'),                      // pass
      makeResult('datafeed:other-feed', [], ['warn1']),   // warn
      makeResult('datafeed:bad-feed', ['err1'], []),      // fail
    ]);

    const report = buildCompletenessReport(summary, [event], emptyAria(), emptyRatchet());
    expect(report.events.byType).toHaveLength(1);
    expect(report.events.byType[0].type).toBe('concert');
    expect(report.events.orphanSlugs).toEqual([]);
    expect(report.datafeed).toEqual({ total: 3, pass: 1, warn: 1, fail: 1, info: 0 });
  });

  test('byType order matches EventType declaration order in types.ts', () => {
    // Build one event per EventType in scrambled order
    const declarationOrder: EventType[] = [
      'concert', 'dj_set', 'exhibition', 'cinema', 'theater', 'festival',
      'performance', 'show', 'workshop', 'tech', 'dance', 'other',
    ];
    const scrambled: EventType[] = [
      'other', 'cinema', 'concert', 'dance', 'dj_set', 'exhibition',
      'festival', 'performance', 'show', 'tech', 'theater', 'workshop',
    ];
    const events = scrambled.map((t, i) =>
      makeEvent({ id: `id${i.toString().padStart(8, '0')}`, title: `T${i}`, venueName: `V${i}`, type: t })
    );
    const details = events.map(e => makeResult(generateEventSlug(e)));

    const report = buildCompletenessReport(makeSummary(details), events, emptyAria(), emptyRatchet());
    expect(report.events.byType.map(b => b.type)).toEqual(declarationOrder);
  });

  test('events.totals reconciles with sum across byType buckets', () => {
    const events = [
      makeEvent({ id: 'aa111111', title: 'A', venueName: 'V', type: 'concert' }),
      makeEvent({ id: 'bb222222', title: 'B', venueName: 'V', type: 'concert' }),
      makeEvent({ id: 'cc333333', title: 'C', venueName: 'V', type: 'theater' }),
    ];
    const details = [
      makeResult(generateEventSlug(events[0])),
      makeResult(generateEventSlug(events[1]), [], ['w']),
      makeResult(generateEventSlug(events[2]), ['e'], []),
    ];

    const report = buildCompletenessReport(makeSummary(details), events, emptyAria(), emptyRatchet());
    const sumTotal = report.events.byType.reduce((acc, b) => acc + b.total, 0);
    const sumPass = report.events.byType.reduce((acc, b) => acc + b.pass, 0);
    expect(report.events.totals.total).toBe(sumTotal);
    expect(report.events.totals.pass).toBe(sumPass);
    expect(report.events.totals.total).toBe(3);
    expect(report.events.totals.pass).toBe(1);
    expect(report.events.totals.warn).toBe(1);
    expect(report.events.totals.fail).toBe(1);
  });

  test('orphanSlugs is sorted alphabetically (deterministic for git-friendly artifact)', () => {
    const summary = makeSummary([
      makeResult('zebra-event'),
      makeResult('apple-event'),
      makeResult('mango-event'),
    ]);
    const report = buildCompletenessReport(summary, [], emptyAria(), emptyRatchet());
    expect(report.events.orphanSlugs).toEqual(['apple-event', 'mango-event', 'zebra-event']);
  });

  test('meta.lastUpdate is a valid ISO timestamp', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), emptyRatchet());
    expect(report.meta.lastUpdate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(report.meta.lastUpdate).toString()).not.toBe('Invalid Date');
  });
});

// Sprint 2 Component B-2 — place layer aggregate (Q-B2 hybrid: per-template + byVenue).
describe('buildCompletenessReport — place layer (Q-B2)', () => {
  test('place_level flag flips to "measured"', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), emptyRatchet());
    expect(report.layers.place_level).toBe('measured');
  });

  test('place.venue_template mirrors venues aggregate (template-axis lens)', () => {
    const summary = makeSummary([
      makeResult('venue:half-note'),
      makeResult('venue:onassis-stegi', [], ['w1']),
    ]);
    const report = buildCompletenessReport(summary, [], emptyAria(), emptyRatchet());
    expect(report.place.venue_template).toEqual(report.venues);
    expect(report.place.venue_template.total).toBe(2);
    expect(report.place.venue_template.pass).toBe(1);
    expect(report.place.venue_template.warn).toBe(1);
  });

  test('place.event_template counts event pages from summary.details', () => {
    const e1 = makeEvent({ id: 'aaaa1111', title: 'A', venueName: 'Half Note', type: 'concert' });
    const e2 = makeEvent({ id: 'bbbb2222', title: 'B', venueName: 'Onassis Stegi', type: 'theater' });
    const summary = makeSummary([
      makeResult(generateEventSlug(e1)),
      makeResult(generateEventSlug(e2), [], ['w1']),
      makeResult('venue:half-note'),  // not counted in event_template
    ]);
    const report = buildCompletenessReport(summary, [e1, e2], emptyAria(), emptyRatchet());
    expect(report.place.event_template.total).toBe(2);
    expect(report.place.event_template.pass).toBe(1);
    expect(report.place.event_template.warn).toBe(1);
  });

  test('place.byVenue empty corpus → []', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), emptyRatchet());
    expect(report.place.byVenue).toEqual([]);
  });

  test('place.byVenue populated → entries sorted alphabetically by normalized venue key', () => {
    const ev1 = makeEvent({ id: 'aaaa1111', title: 'A', venueName: 'Zappeio', type: 'concert' });
    const ev2 = makeEvent({ id: 'bbbb2222', title: 'B', venueName: 'Half Note', type: 'concert' });
    const ev3 = makeEvent({ id: 'cccc3333', title: 'C', venueName: 'Onassis Stegi', type: 'theater' });
    const summary = makeSummary([
      makeResult(generateEventSlug(ev1)),
      makeResult(generateEventSlug(ev2)),
      makeResult(generateEventSlug(ev3), [], ['w1']),
    ]);
    const report = buildCompletenessReport(summary, [ev1, ev2, ev3], emptyAria(), emptyRatchet());
    expect(report.place.byVenue.map(b => b.venue)).toEqual(['half note', 'onassis stegi', 'zappeio']);
    const half = report.place.byVenue.find(b => b.venue === 'half note')!;
    expect(half.total).toBe(1);
    expect(half.pass).toBe(1);
    expect(half.passRate).toBe(100);
  });

  test('place.byVenue includes sameAsState: "present" when any event at the venue has venue.sameAs', () => {
    const ev1 = makeEvent({ id: 'aaaa1111', title: 'A', venueName: 'Half Note', type: 'concert' });
    ev1.venue.sameAs = ['https://www.wikidata.org/wiki/Q12345'];
    const ev2 = makeEvent({ id: 'bbbb2222', title: 'B', venueName: 'Onassis Stegi', type: 'theater' });
    const summary = makeSummary([
      makeResult(generateEventSlug(ev1)),
      makeResult(generateEventSlug(ev2)),
    ]);
    const report = buildCompletenessReport(summary, [ev1, ev2], emptyAria(), emptyRatchet());
    expect(report.place.byVenue.find(b => b.venue === 'half note')!.sameAsState).toBe('present');
    expect(report.place.byVenue.find(b => b.venue === 'onassis stegi')!.sameAsState).toBe('missing');
  });

  test('place.ratchet is the passthrough of ratchetState parameter', () => {
    const ratchet: RatchetState = {
      venueSameAs: { coverage: 0.42, populated: 17, total: 40, threshold: 0.5, currentSeverity: 'info' },
    };
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), ratchet);
    expect(report.place.ratchet).toEqual(ratchet);
  });

  test('place.byVenue normalizeVenueKey collapses Greek diacritics + casing variants', () => {
    const ev1 = makeEvent({ id: 'aaaa1111', title: 'A', venueName: 'Ίλιον Plus', type: 'concert' });
    const ev2 = makeEvent({ id: 'bbbb2222', title: 'B', venueName: 'ΙΛΙΟΝ Plus', type: 'concert' });
    const summary = makeSummary([
      makeResult(generateEventSlug(ev1)),
      makeResult(generateEventSlug(ev2)),
    ]);
    const report = buildCompletenessReport(summary, [ev1, ev2], emptyAria(), emptyRatchet());
    // Both events at the same canonical venue → single byVenue entry with total 2.
    expect(report.place.byVenue).toHaveLength(1);
    expect(report.place.byVenue[0].total).toBe(2);
  });

  // Q-B8b lock 2026-05-04: ratchet denominator is active-reachable venue count
  // (computed in generate-site.ts via getActiveReachableVenueKeys), not registry length.
  // The reporter is pure passthrough — this test prevents regression if anyone
  // ever adds recompute logic that re-derives total from a different basis.
  test('place.ratchet.total passes through whatever denominator generate-site.ts computed (Q-B8b)', () => {
    const ratchet: RatchetState = {
      venueSameAs: { coverage: 0, populated: 0, total: 244, threshold: 0.5, currentSeverity: 'info' },
    };
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), ratchet);
    expect(report.place.ratchet.venueSameAs.total).toBe(244);
    expect(report.place.ratchet).toBe(ratchet);
  });
});

// Aria freshness gate. Stale aggregate data must not silently masquerade as
// 'measured'. Threshold: 7 days. Counts always pass through unchanged — only
// the layer flag flips. Zeroing counts would silent-wrong-flip proofMetrics
// passClean (which reads .fail, not layers).
describe('deriveAriaLevel', () => {
  const NOW = new Date('2026-05-22T12:00:00.000Z');
  const iso = (daysAgo: number) =>
    new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  test("undefined meta → 'not_measured'", () => {
    expect(deriveAriaLevel(undefined, NOW)).toBe('not_measured');
  });

  test("meta with no lastUpdate → 'not_measured'", () => {
    expect(deriveAriaLevel({}, NOW)).toBe('not_measured');
  });

  test("unparseable lastUpdate → 'not_measured'", () => {
    expect(deriveAriaLevel({ lastUpdate: 'not-a-date' }, NOW)).toBe('not_measured');
  });

  test("aggregate from today → 'measured'", () => {
    expect(deriveAriaLevel({ lastUpdate: iso(0) }, NOW)).toBe('measured');
  });

  test("aggregate from 6 days ago → 'measured' (still within 7d window)", () => {
    expect(deriveAriaLevel({ lastUpdate: iso(6) }, NOW)).toBe('measured');
  });

  test("aggregate from 8 days ago → 'stale'", () => {
    expect(deriveAriaLevel({ lastUpdate: iso(8) }, NOW)).toBe('stale');
  });

  test("aggregate from 18 days ago → 'stale' (the real-world case from 2026-05-22)", () => {
    expect(deriveAriaLevel({ lastUpdate: iso(18) }, NOW)).toBe('stale');
  });

  test('future-skewed timestamp → measured (negative age tolerated)', () => {
    expect(deriveAriaLevel({ lastUpdate: iso(-1) }, NOW)).toBe('measured');
  });
});

describe('buildCompletenessReport — aria_level derivation', () => {
  const NOW_MS = Date.now();
  const daysAgo = (d: number) => new Date(NOW_MS - d * 86_400_000).toISOString();

  test("fresh aria meta → layers.aria_level === 'measured', counts preserved", () => {
    const aria: AriaAggregate = {
      hub_template: { total: 1168, pass: 1166, warn: 0, fail: 2, info: 0 },
      event_template: { total: 490, pass: 490, warn: 0, fail: 0, info: 0 },
      meta: { lastUpdate: daysAgo(1) },
    };
    const report = buildCompletenessReport(makeSummary([]), [], aria, emptyRatchet());
    expect(report.layers.aria_level).toBe('measured');
    expect(report.aria.hub_template.fail).toBe(2); // counts unchanged
  });

  test("stale aria meta (18d) → layers.aria_level === 'stale', counts preserved", () => {
    const aria: AriaAggregate = {
      hub_template: { total: 1168, pass: 1166, warn: 0, fail: 2, info: 0 },
      event_template: { total: 490, pass: 490, warn: 0, fail: 0, info: 0 },
      meta: { lastUpdate: daysAgo(18) },
    };
    const report = buildCompletenessReport(makeSummary([]), [], aria, emptyRatchet());
    expect(report.layers.aria_level).toBe('stale');
    expect(report.aria.hub_template.fail).toBe(2); // counts unchanged — silent-wrong guard
    expect(report.aria.hub_template.total).toBe(1168);
  });

  test("missing meta → layers.aria_level === 'not_measured', zero counts pass through", () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria(), emptyRatchet());
    expect(report.layers.aria_level).toBe('not_measured');
    expect(report.aria.hub_template.fail).toBe(0);
  });
});
