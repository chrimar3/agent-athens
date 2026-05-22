import { describe, test, expect } from 'bun:test';
import { buildWeekendCapsule } from '../weekend-capsule';
import { STRINGS } from '../../i18n/strings';
import type { EditorPick } from '../editor-picks';
import type { Event, EventType, Price } from '../../types';

const t = STRINGS.en;

function makeEvent(overrides: Partial<Event> & {
  id?: string;
  title?: string;
  startDate?: string;
  type?: EventType;
  venueName?: string;
  price?: Price;
}): Event {
  const { venueName, ...rest } = overrides;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    id: overrides.id ?? 'evt-' + Math.random().toString(36).slice(2, 8),
    title: overrides.title ?? 'Test Event',
    description: '',
    startDate: overrides.startDate ?? '2026-05-23T20:00:00+03:00',
    type: overrides.type ?? 'concert',
    genres: [],
    tags: [],
    venue: { name: venueName ?? 'Half Note', address: 'Athens' },
    price: overrides.price ?? { type: 'open' },
    source: 'test',
    createdAt: '2026-05-22T00:00:00Z',
    updatedAt: '2026-05-22T00:00:00Z',
    language: 'en',
    hasNativeGreek: false,
    ticketUrlResolved: null,
    ...rest,
  } as Event;
}

const CITY = 'central Athens';

describe('buildWeekendCapsule — S1 literal + token substitution', () => {
  test('S1 starts with literal "Athens events this weekend" and substitutes all tokens', () => {
    const events: Event[] = [
      makeEvent({ id: 'a', title: 'Alpha Show', startDate: '2026-05-23T20:00:00+03:00', type: 'concert', venueName: 'Half Note' }),
      makeEvent({ id: 'b', title: 'Beta Night', startDate: '2026-05-24T21:00:00+03:00', type: 'theater', venueName: 'Onassis Stegi' }),
      makeEvent({ id: 'c', title: 'Gamma Expo', startDate: '2026-05-24T11:00:00+03:00', type: 'exhibition', venueName: 'EMST' }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    expect(out).not.toBeNull();
    // literal at word position 1
    expect(out!.startsWith('Athens events this weekend')).toBe(true);
    // tokens substituted, no residue
    expect(out).not.toContain('{');
    expect(out).not.toContain('}');
    // count token
    expect(out).toContain('3 cultural events');
    // date_range constant
    expect(out).toContain('Friday to Sunday');
  });

  test('example selector picks startDate ASC → title ASC → id ASC', () => {
    // Two events same date — title decides; two events same date+title — id decides.
    const events: Event[] = [
      makeEvent({ id: 'z', title: 'Zeta', startDate: '2026-05-24T20:00:00+03:00', type: 'concert' }),
      makeEvent({ id: 'a1', title: 'Alpha', startDate: '2026-05-23T20:00:00+03:00', type: 'concert' }),
      makeEvent({ id: 'a2', title: 'Alpha', startDate: '2026-05-23T20:00:00+03:00', type: 'concert' }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    // Earliest startDate wins → "Alpha" appears (a1 by id), then "Alpha" again (a2) — but example_1/2 are titles
    expect(out).toContain('from Alpha to Alpha');
  });

  test('category_summary uses i18n typeLabels and " and " join', () => {
    const events: Event[] = [
      makeEvent({ id: '1', type: 'concert' }),
      makeEvent({ id: '2', type: 'concert' }),
      makeEvent({ id: '3', type: 'theater' }),
      makeEvent({ id: '4', type: 'exhibition' }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    // Top categories by count: concert (2), theater (1), exhibition (1) — labels from typeLabels
    expect(out).toContain('Concert');
    expect(out).toContain('Theatre');
    expect(out).toContain('Exhibition');
    expect(out).toContain(' and ');
  });
});

describe('buildWeekendCapsule — S2 empty-picks branch', () => {
  test('renders S2 verbatim with computed counts when editorPicks is empty', () => {
    const events: Event[] = [
      makeEvent({ id: '1', price: { type: 'open' }, venueName: 'A' }),
      makeEvent({ id: '2', price: { type: 'open' }, venueName: 'B' }),
      makeEvent({ id: '3', price: { type: 'with-ticket', amount: 15 }, venueName: 'C' }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    expect(out).toContain('This weekend guide covers 2 open events and 1 with-ticket events across 3 venues in central Athens');
    expect(out).toContain('refreshed daily with dates, prices, and editorial context for every listing.');
  });

  test('city_descriptor param interpolates literally', () => {
    const events: Event[] = [makeEvent({}), makeEvent({}), makeEvent({})];
    const out = buildWeekendCapsule(events, 'en', [], 'the Attica region', t);
    expect(out).toContain('in the Attica region');
  });
});

describe('buildWeekendCapsule — venue counting', () => {
  test('distinct venue.name; "Πολλαπλοί Χώροι" counts as 1 (natural Set)', () => {
    const events: Event[] = [
      makeEvent({ id: '1', venueName: 'Half Note' }),
      makeEvent({ id: '2', venueName: 'Half Note' }),  // dup
      makeEvent({ id: '3', venueName: 'Πολλαπλοί Χώροι' }),
      makeEvent({ id: '4', venueName: 'Πολλαπλοί Χώροι' }),  // dup sentinel
      makeEvent({ id: '5', venueName: 'SNFCC' }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    // 3 distinct: Half Note, Πολλαπλοί Χώροι, SNFCC
    expect(out).toContain('across 3 venues');
  });
});

describe('buildWeekendCapsule — Tier 1 price gating', () => {
  test('open_count uses e.price.type === "open" (NOT string equality, NOT "free")', () => {
    const events: Event[] = [
      makeEvent({ id: '1', price: { type: 'open' } }),
      makeEvent({ id: '2', price: { type: 'donation' } }),  // NOT counted as open
      makeEvent({ id: '3', price: { type: 'with-ticket', amount: 20 } }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    // 1 open, 2 with-ticket (donation falls into non-open bucket)
    expect(out).toContain('1 open events and 2 with-ticket events');
    // Tier 1: never say "free"
    expect(out).not.toContain('free');
    expect(out).not.toContain('Free');
  });
});

describe('buildWeekendCapsule — degradation paths', () => {
  test('count === 0 → returns null', () => {
    expect(buildWeekendCapsule([], 'en', [], CITY, t)).toBeNull();
  });

  test('count < 2 → drops " — from X to Y" tail but keeps S1 lead', () => {
    const events: Event[] = [
      makeEvent({ id: '1', title: 'Solo Show', type: 'concert' }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    expect(out).not.toBeNull();
    expect(out!.startsWith('Athens events this weekend')).toBe(true);
    expect(out).not.toContain(' — from ');
    expect(out).not.toContain(' to Solo Show');
  });

  test('open_count === 0 → drops the open clause in S2', () => {
    const events: Event[] = [
      makeEvent({ id: '1', price: { type: 'with-ticket', amount: 10 } }),
      makeEvent({ id: '2', price: { type: 'with-ticket', amount: 15 } }),
      makeEvent({ id: '3', price: { type: 'with-ticket', amount: 20 } }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    // No "open events" mention; with-ticket clause survives
    expect(out).not.toContain('open events');
    expect(out).toContain('3 with-ticket events');
  });

  test('with_ticket_count === 0 → drops the with-ticket clause in S2', () => {
    const events: Event[] = [
      makeEvent({ id: '1', price: { type: 'open' } }),
      makeEvent({ id: '2', price: { type: 'open' } }),
      makeEvent({ id: '3', price: { type: 'open' } }),
    ];

    const out = buildWeekendCapsule(events, 'en', [], CITY, t);

    expect(out).toContain('3 open events');
    expect(out).not.toContain('with-ticket events');
  });
});
