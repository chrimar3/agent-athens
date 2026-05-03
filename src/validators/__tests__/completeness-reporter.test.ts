import { describe, test, expect } from 'bun:test';
import {
  buildCompletenessReport,
  type CompletenessReport,
  type BucketReport,
  type AriaAggregate,
} from '../completeness-reporter';
import type { SchemaValidationSummary, SchemaValidationResult } from '../schema-completeness';
import { generateEventSlug } from '../../generators/event-page';
import type { Event, EventType } from '../../types';

// Sprint 2 Component C — zero aggregate placeholder for tests that don't
// exercise the aria slot. Real aria data is produced by scripts/audit-aria.ts
// and consumed by generate-site.ts; the reporter is a pure passthrough for it.
function emptyAria(): AriaAggregate {
  return {
    hub_template: { total: 0, pass: 0, warn: 0, fail: 0 },
    event_template: { total: 0, pass: 0, warn: 0, fail: 0 },
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
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria());
    expect(report.events.byType).toEqual([]);
    expect(report.events.totals.total).toBe(0);
    expect(report.events.totals.pass).toBe(0);
    expect(report.events.orphanSlugs).toEqual([]);
    expect(report.hubs).toEqual({ total: 0, pass: 0, warn: 0, fail: 0 });
    expect(report.venues).toEqual({ total: 0, pass: 0, warn: 0, fail: 0 });
    expect(report.datafeed).toEqual({ total: 0, pass: 0, warn: 0, fail: 0 });
  });

  test('only EventTypes present in input appear in byType (lean artifact)', () => {
    const concertEvent = makeEvent({ id: 'aaaa1111', title: 'Jazz Night', venueName: 'Half Note', type: 'concert' });
    const theaterEvent = makeEvent({ id: 'bbbb2222', title: 'Antigone', venueName: 'Megaron', type: 'theater' });
    const events = [concertEvent, theaterEvent];

    const summary = makeSummary([
      makeResult(generateEventSlug(concertEvent)),
      makeResult(generateEventSlug(theaterEvent)),
    ]);

    const report = buildCompletenessReport(summary, events, emptyAria());
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

    const report = buildCompletenessReport(summary, [event], emptyAria());
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

    const report = buildCompletenessReport(summary, [event], emptyAria());
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

    const report = buildCompletenessReport(summary, [event], emptyAria());
    expect(report.events.byType).toHaveLength(1);
    expect(report.events.byType[0].type).toBe('show');
    expect(report.events.orphanSlugs).toEqual([]);
    expect(report.hubs).toEqual({ total: 2, pass: 1, warn: 1, fail: 0 });
    expect(report.venues).toEqual({ total: 2, pass: 1, warn: 0, fail: 1 });
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

    const report = buildCompletenessReport(summary, [e1, e2, e3, e4], emptyAria());
    const cinema = report.events.byType.find(b => b.type === 'cinema')!;
    expect(cinema.total).toBe(4);
    expect(cinema.pass).toBe(1);
    expect(cinema.warn).toBe(1);
    expect(cinema.fail).toBe(2);
    expect(cinema.passRate).toBe(25); // 1/4 = 25%
  });

  test('layer flags: event/offer/aria/datafeed measured; place_level not_measured (post-Component-C)', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria());
    expect(report.layers.event_level).toBe('measured');
    expect(report.layers.offer_level).toBe('measured');
    expect(report.layers.place_level).toBe('not_measured');
    expect(report.layers.aria_level).toBe('measured');
    expect(report.layers.datafeed_level).toBe('measured');
  });

  // Sprint 2 Component C — aria slot is a pure passthrough of the
  // ariaAggregate parameter. Reporter does not read filesystem for ARIA
  // data; scripts/audit-aria.ts produces the aggregate, generate-site.ts
  // loads it and passes it in.
  test('aria slot: empty aggregate produces zero hub_template + event_template counts', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria());
    expect(report.aria).toEqual({
      hub_template: { total: 0, pass: 0, warn: 0, fail: 0 },
      event_template: { total: 0, pass: 0, warn: 0, fail: 0 },
    });
  });

  test('aria slot: passthrough — values from ariaAggregate parameter appear unchanged in report', () => {
    const ariaInput: AriaAggregate = {
      hub_template: { total: 50, pass: 45, warn: 5, fail: 0 },
      event_template: { total: 100, pass: 92, warn: 6, fail: 2 },
    };
    const report = buildCompletenessReport(makeSummary([]), [], ariaInput);
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

    const report = buildCompletenessReport(summary, [event], emptyAria());
    expect(report.events.byType).toHaveLength(1);
    expect(report.events.byType[0].type).toBe('concert');
    expect(report.events.orphanSlugs).toEqual([]);
    expect(report.datafeed).toEqual({ total: 3, pass: 1, warn: 1, fail: 1 });
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

    const report = buildCompletenessReport(makeSummary(details), events, emptyAria());
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

    const report = buildCompletenessReport(makeSummary(details), events, emptyAria());
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
    const report = buildCompletenessReport(summary, [], emptyAria());
    expect(report.events.orphanSlugs).toEqual(['apple-event', 'mango-event', 'zebra-event']);
  });

  test('meta.lastUpdate is a valid ISO timestamp', () => {
    const report = buildCompletenessReport(makeSummary([]), [], emptyAria());
    expect(report.meta.lastUpdate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(report.meta.lastUpdate).toString()).not.toBe('Invalid Date');
  });
});
