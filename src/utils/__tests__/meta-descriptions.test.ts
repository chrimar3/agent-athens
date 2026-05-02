// Unit tests for meta description generators
import { describe, test, expect } from 'bun:test';
import {
  generateEventMetaDescription,
  generateHubMetaDescription,
  generateVenueMetaDescription,
  generateVenueIndexMetaDescription,
  formatDateShort,
} from '../meta-descriptions';
import type { Event, Filters } from '../../types';
import type { VenueMetaInput } from '../meta-descriptions';

// --- Helper: build a minimal Event for testing ---
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    id: 'test-event-123',
    title: 'Jazz Night at Half Note',
    description: 'An evening of smooth jazz.',
    startDate: '2026-03-15T21:00:00+02:00',
    type: 'concert',
    genres: ['jazz'],
    tags: [],
    venue: {
      name: 'Half Note Jazz Club',
      address: '17 Trivonianou St',
      neighborhood: 'Mets',
    },
    price: { type: 'with-ticket', amount: 15, currency: 'EUR' },
    url: 'https://example.com',
    source: 'viva.gr',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    language: 'en',
    hasNativeGreek: false,
    ticketUrlResolved: null,
    ...overrides,
  };
}

// ============================================================
// formatDateShort
// ============================================================
describe('formatDateShort', () => {
  test('formats full ISO datetime', () => {
    expect(formatDateShort('2026-03-15T21:00:00+02:00')).toBe('Mar 15, 2026');
  });

  test('formats date-only ISO string', () => {
    expect(formatDateShort('2026-01-01')).toBe('Jan 1, 2026');
  });

  test('formats year-end date', () => {
    expect(formatDateShort('2025-12-31T20:00:00+02:00')).toBe('Dec 31, 2025');
  });

  test('returns empty string for invalid date', () => {
    expect(formatDateShort('not-a-date')).toBe('');
  });
});

// ============================================================
// generateEventMetaDescription
// ============================================================
describe('generateEventMetaDescription', () => {
  test('concert with all fields starts with "Live "', () => {
    const event = makeEvent({ type: 'concert' });
    const result = generateEventMetaDescription(event);
    expect(result.startsWith('Live ')).toBe(true);
    expect(result).toContain('Half Note Jazz Club');
    expect(result).toContain('Mar 15, 2026');
    expect(result).toContain('From \u20AC15');
  });

  // LivePrefix for live-event types
  const livePrefixTypes = ['concert', 'dj_set', 'performance', 'show'] as const;
  for (const type of livePrefixTypes) {
    test(`has "Live " prefix for type: ${type}`, () => {
      const event = makeEvent({ type });
      expect(generateEventMetaDescription(event).startsWith('Live ')).toBe(true);
    });
  }

  // No LivePrefix for these types
  const noLivePrefixTypes = ['exhibition', 'cinema', 'theater', 'workshop', 'festival', 'tech', 'other'] as const;
  for (const type of noLivePrefixTypes) {
    test(`no "Live " prefix for type: ${type}`, () => {
      const event = makeEvent({ type });
      expect(generateEventMetaDescription(event).startsWith('Live ')).toBe(false);
    });
  }

  test('price.type === "open" shows "Open entry"', () => {
    const event = makeEvent({ price: { type: 'open' } });
    expect(generateEventMetaDescription(event)).toContain('Open entry');
  });

  test('price.type === "donation" shows "Open entry"', () => {
    const event = makeEvent({ price: { type: 'donation' } });
    expect(generateEventMetaDescription(event)).toContain('Open entry');
  });

  test('price.amount shows "From \u20ACN"', () => {
    const event = makeEvent({ price: { type: 'with-ticket', amount: 25 } });
    expect(generateEventMetaDescription(event)).toContain('From \u20AC25');
  });

  test('with-ticket but no amount shows "Tickets available"', () => {
    const event = makeEvent({ price: { type: 'with-ticket' } });
    expect(generateEventMetaDescription(event)).toContain('Tickets available');
  });

  test('contains en-dash separator', () => {
    const event = makeEvent();
    expect(generateEventMetaDescription(event)).toContain(' \u2014 ');
  });

  test('never exceeds 155 chars', () => {
    const event = makeEvent({
      title: 'A Very Long Event Title That Goes On And On And On To Test The Character Limit Enforcement Logic In The Meta Description Generator',
      venue: { name: 'Some Extremely Long Venue Name That Also Pushes The Limit', address: '123 Street', neighborhood: 'Very Long Neighborhood Name' },
    });
    const result = generateEventMetaDescription(event);
    expect(result.length).toBeLessThanOrEqual(155);
  });

  test('missing neighborhood causes no dangling comma', () => {
    const event = makeEvent({
      venue: { name: 'Half Note Jazz Club', address: '17 Trivonianou St' },
    });
    const result = generateEventMetaDescription(event);
    expect(result).not.toContain(', \u2014');
    expect(result).not.toContain(',  ');
  });

  test('enriched override uses fullDescription with "Updated daily."', () => {
    const event = makeEvent({
      fullDescription: 'Experience an unforgettable evening of smooth jazz at Athens premier venue. The artists deliver world-class performances.',
    });
    const result = generateEventMetaDescription(event);
    expect(result).toContain('Updated daily.');
  });

  test('enriched override respects 155-char limit', () => {
    const longDesc = 'A'.repeat(200) + '. End sentence.';
    const event = makeEvent({ fullDescription: longDesc });
    const result = generateEventMetaDescription(event);
    expect(result.length).toBeLessThanOrEqual(155);
  });
});

// ============================================================
// generateHubMetaDescription
// ============================================================
describe('generateHubMetaDescription', () => {
  test('no filters shows count and Αθήνα', () => {
    const result = generateHubMetaDescription({}, 42);
    expect(result).toContain('42');
    expect(result).toContain('Αθήνα');
  });

  test('type=concert uses Greek translation', () => {
    const result = generateHubMetaDescription({ type: 'concert' }, 10);
    expect(result).toContain('\u03C3\u03C5\u03BD\u03B1\u03C5\u03BB\u03AF\u03B5\u03C2'); // συναυλίες
  });

  test('time=this-week includes time range', () => {
    const result = generateHubMetaDescription({ time: 'this-week' }, 20);
    expect(result.length).toBeGreaterThan(0);
  });

  test('price=open includes free indicator', () => {
    const result = generateHubMetaDescription({ price: 'open' }, 15);
    const lower = result.toLowerCase();
    expect(lower.includes('\u03B4\u03C9\u03C1\u03B5\u03AC\u03BD') || lower.includes('free')).toBe(true); // δωρεάν
  });

  test('always contains Greek daily update sentence', () => {
    const result = generateHubMetaDescription({}, 50);
    expect(result).toContain('Ενημέρωση κάθε μέρα από 10+ χώρους');
  });

  test('never exceeds 155 chars', () => {
    const result = generateHubMetaDescription(
      { type: 'concert', time: 'this-week', price: 'open', genre: 'progressive-psychedelic-rock' },
      999,
    );
    expect(result.length).toBeLessThanOrEqual(155);
  });
});

// ============================================================
// generateVenueMetaDescription
// ============================================================
describe('generateVenueMetaDescription', () => {
  test('venue with events includes count, name, neighborhood, and Next:', () => {
    const venue: VenueMetaInput = {
      name: 'Half Note Jazz Club',
      neighborhood: 'Mets',
      events: [{ title: 'Jazz Night', startDate: '2026-03-15T21:00:00+02:00' }],
      eventCount: 5,
    };
    const result = generateVenueMetaDescription(venue);
    expect(result).toContain('5');
    expect(result).toContain('Half Note Jazz Club');
    expect(result).toContain('Mets');
    expect(result).toContain('Next:');
  });

  test('no neighborhood means no dangling comma', () => {
    const venue: VenueMetaInput = {
      name: 'Half Note Jazz Club',
      events: [{ title: 'Jazz Night', startDate: '2026-03-15T21:00:00+02:00' }],
      eventCount: 3,
    };
    const result = generateVenueMetaDescription(venue);
    expect(result).not.toContain('Jazz Club,.');
    expect(result).not.toContain(', .');
  });

  test('empty events array means no "Next:" segment', () => {
    const venue: VenueMetaInput = {
      name: 'Half Note Jazz Club',
      neighborhood: 'Mets',
      events: [],
      eventCount: 0,
    };
    const result = generateVenueMetaDescription(venue);
    expect(result).not.toContain('Next:');
  });

  test('never exceeds 155 chars', () => {
    const venue: VenueMetaInput = {
      name: 'An Extremely Long Venue Name That Keeps Going And Going',
      neighborhood: 'A Very Long Neighborhood Name',
      events: [{ title: 'An Extremely Long Event Title That Also Keeps Going', startDate: '2026-03-15T21:00:00+02:00' }],
      eventCount: 42,
    };
    const result = generateVenueMetaDescription(venue);
    expect(result.length).toBeLessThanOrEqual(155);
  });
});

// ============================================================
// generateVenueIndexMetaDescription
// ============================================================
describe('generateVenueIndexMetaDescription', () => {
  test('count=25 produces correct description', () => {
    const result = generateVenueIndexMetaDescription(25);
    expect(result).toContain('25 event venues');
    expect(result).toContain('Athens');
  });

  test('count=1 uses singular "venue"', () => {
    const result = generateVenueIndexMetaDescription(1);
    expect(result).toContain('1 event venue');
    expect(result).not.toContain('venues');
  });
});
