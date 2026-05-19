import { describe, test, expect } from 'bun:test';
import { buildContainedInPlace, resolveEventStatus, ORGANIZATION_SCHEMA, getCountryCode, getCurrencyCode, availabilityForEventStatus } from '../src/utils/schema-geo';
import { renderPage } from '../src/templates/page';
import { sampleConcert, sampleTheaterPerformance, sampleWorkshop, sampleFreeExhibition, sampleConcertWithTicket } from './fixtures/events';
import { generateEventSchema } from '../src/generators/event-page';
import type { PageMetadata } from '../src/types';

// ── containedInPlace ──────────────────────────────────────

describe('buildContainedInPlace', () => {
  test('event with English neighborhood includes neighborhood level', () => {
    const chain = buildContainedInPlace('Mets') as any;
    expect(chain['@type']).toBe('Place');
    expect(chain.name).toBe('Mets');
    expect(chain.sameAs).toContain('Q6823368');
    expect(chain.geo['@type']).toBe('GeoCoordinates');
  });

  test('event without neighborhood starts at municipality', () => {
    const chain = buildContainedInPlace(null) as any;
    expect(chain.name).toBe('Municipality of Athens');
    expect(chain.sameAs).toContain('Q1524');
  });

  test('event with undefined neighborhood starts at municipality', () => {
    const chain = buildContainedInPlace(undefined) as any;
    expect(chain.name).toBe('Municipality of Athens');
  });

  test('Gazi neighborhood resolves correctly', () => {
    const chain = buildContainedInPlace('Gazi') as any;
    expect(chain.name).toBe('Gazi');
    expect(chain.sameAs).toContain('Q5528361');
  });

  test('Greek value Γκάζι resolves to Gazi', () => {
    const chain = buildContainedInPlace('Γκάζι') as any;
    expect(chain.name).toBe('Gazi');
    expect(chain.sameAs).toContain('Q5528361');
  });

  test('Greek value Κουκάκι resolves to Koukaki', () => {
    const chain = buildContainedInPlace('Κουκάκι') as any;
    expect(chain.name).toBe('Koukaki');
    expect(chain.sameAs).toContain('Q6433832');
  });

  test('unknown neighborhood falls back to municipality', () => {
    const chain = buildContainedInPlace('SomeUnknownPlace') as any;
    expect(chain.name).toBe('Municipality of Athens');
  });

  test('chain ends at Greece (Q41)', () => {
    const chain = buildContainedInPlace('Kolonaki') as any;
    // Kolonaki → Municipality → Attica → Greece
    const municipality = chain.containedInPlace;
    expect(municipality.name).toBe('Municipality of Athens');
    const attica = municipality.containedInPlace;
    expect(attica.name).toBe('Attica');
    expect(attica.sameAs).toContain('Q178517');
    const greece = attica.containedInPlace;
    expect(greece.name).toBe('Greece');
    expect(greece.sameAs).toContain('Q41');
    expect(greece.containedInPlace).toBeUndefined();
  });

  test('sameAs URLs are valid Wikidata format', () => {
    const chain = buildContainedInPlace('Mets') as any;
    expect(chain.sameAs).toMatch(/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/);
    expect(chain.containedInPlace.sameAs).toMatch(/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/);
  });
});

// ── resolveEventStatus ────────────────────────────────────

describe('resolveEventStatus', () => {
  test('future concert returns EventScheduled', () => {
    expect(resolveEventStatus('2099-01-01', null, 'concert'))
      .toBe('https://schema.org/EventScheduled');
  });

  test('past concert returns EventCompleted', () => {
    expect(resolveEventStatus('2020-01-01', null, 'concert'))
      .toBe('https://schema.org/EventCompleted');
  });

  test('exhibition with future endDate returns EventScheduled', () => {
    expect(resolveEventStatus('2020-01-01', '2099-12-31', 'exhibition'))
      .toBe('https://schema.org/EventScheduled');
  });

  test('exhibition with past endDate returns EventCompleted', () => {
    expect(resolveEventStatus('2020-01-01', '2020-06-01', 'exhibition'))
      .toBe('https://schema.org/EventCompleted');
  });

  test('non-exhibition ignores endDate', () => {
    // Concert with past start but future end — should still be Completed
    expect(resolveEventStatus('2020-01-01', '2099-12-31', 'concert'))
      .toBe('https://schema.org/EventCompleted');
  });

  test('exhibition without endDate uses startDate', () => {
    expect(resolveEventStatus('2020-01-01', null, 'exhibition'))
      .toBe('https://schema.org/EventCompleted');
  });
});

// ── Organization schema on homepage ───────────────────────

describe('Organization schema', () => {
  test('ORGANIZATION_SCHEMA has correct structure', () => {
    expect(ORGANIZATION_SCHEMA['@type']).toBe('Organization');
    expect(ORGANIZATION_SCHEMA.name).toBe('agent-athens');
    expect(ORGANIZATION_SCHEMA.url).toBe('https://agentathens.com');
  });

  test('homepage includes Organization JSON-LD', () => {
    const metadata: PageMetadata = {
      title: 'Test',
      description: 'Test page',
      keywords: 'test',
      url: 'index',  // homepage
      eventCount: 1,
      lastUpdate: '2026-03-02T10:00:00Z',
      filters: {}
    };
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('"@type": "Organization"');
  });

  test('non-homepage does NOT include Organization JSON-LD', () => {
    const metadata: PageMetadata = {
      title: 'Concerts',
      description: 'Concert events',
      keywords: 'concerts',
      url: 'concerts',
      eventCount: 1,
      lastUpdate: '2026-03-02T10:00:00Z',
      filters: { type: 'concert' }
    };
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).not.toContain('"@type": "Organization"');
  });
});

// ── Integration: containedInPlace in rendered schema ──────

describe('containedInPlace in rendered schema', () => {
  test('homepage schema includes containedInPlace in list items', () => {
    const metadata: PageMetadata = {
      title: 'Test',
      description: 'Test',
      keywords: 'test',
      url: '',
      eventCount: 2,
      lastUpdate: '2026-03-02T10:00:00Z',
      filters: {}
    };
    const html = renderPage(metadata, [sampleConcert, sampleWorkshop]);
    expect(html).toContain('containedInPlace');
    expect(html).toContain('Municipality of Athens');
  });

  test('event card has dynamic eventStatus', () => {
    const metadata: PageMetadata = {
      title: 'Test',
      description: 'Test',
      keywords: 'test',
      url: '',
      eventCount: 1,
      lastUpdate: '2026-03-02T10:00:00Z',
      filters: {}
    };
    // sampleConcert has startDate in 2025 — should be EventCompleted
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('EventCompleted');
  });
});

// ── city-geodata accessors ────────────────────────────────

describe('city-geodata accessors', () => {
  test('getCountryCode returns GR', () => {
    expect(getCountryCode()).toBe('GR');
  });

  test('getCurrencyCode returns EUR', () => {
    expect(getCurrencyCode()).toBe('EUR');
  });

  test('city-geodata.json exposes country.code and country.currency', () => {
    const raw = JSON.parse(
      require('fs').readFileSync(
        require('path').join(__dirname, '..', 'config', 'city-geodata.json'),
        'utf-8'
      )
    );
    expect(raw.country.code).toBe('GR');
    expect(raw.country.currency).toBe('EUR');
  });
});

// ── availabilityForEventStatus ────────────────────────────

describe('availabilityForEventStatus', () => {
  test('EventScheduled → InStock', () => {
    expect(availabilityForEventStatus('https://schema.org/EventScheduled'))
      .toEqual({ kind: 'emit', value: 'https://schema.org/InStock' });
  });

  test('EventPostponed → InStock (deliberate per Strategist 2026-04-29)', () => {
    expect(availabilityForEventStatus('https://schema.org/EventPostponed'))
      .toEqual({ kind: 'emit', value: 'https://schema.org/InStock' });
  });

  test('EventRescheduled → InStock', () => {
    expect(availabilityForEventStatus('https://schema.org/EventRescheduled'))
      .toEqual({ kind: 'emit', value: 'https://schema.org/InStock' });
  });

  test('EventCancelled → Discontinued', () => {
    expect(availabilityForEventStatus('https://schema.org/EventCancelled'))
      .toEqual({ kind: 'emit', value: 'https://schema.org/Discontinued' });
  });

  test('EventCompleted → omit_offer', () => {
    expect(availabilityForEventStatus('https://schema.org/EventCompleted'))
      .toEqual({ kind: 'omit_offer' });
  });

  test('unknown status → InStock (defensive default)', () => {
    expect(availabilityForEventStatus('https://schema.org/SomethingUnknown'))
      .toEqual({ kind: 'emit', value: 'https://schema.org/InStock' });
  });
});

// ── offers.validFrom removed ──────────────────────────────

describe('offers.validFrom emission', () => {
  // S139: generateEventSchema returns a @graph envelope; the Event entity is
  // member 0 per Q2 ordering ruling. Extract it before asserting on offers.
  const extractEvent = (jsonLd: string): any => {
    const envelope = JSON.parse(jsonLd);
    return envelope['@graph']?.[0] ?? envelope;
  };

  test('paid event with ticket does NOT emit validFrom in offers (when offers is present)', () => {
    // sampleConcertWithTicket has 2025 dates → EventCompleted post-S3 → offers omitted entirely.
    // Force a future date so the offers block is emitted, then assert validFrom is absent.
    const futureEvent = {
      ...sampleConcertWithTicket,
      startDate: '2099-11-15T21:30:00+03:00',
      endDate: '2099-11-16T00:00:00+03:00',
    };
    const schema = extractEvent(generateEventSchema(futureEvent, 'el'));
    expect(schema.offers).toBeDefined();
    expect(schema.offers['@type']).toBe('Offer');
    expect(schema.offers.validFrom).toBeUndefined();
  });

  test('open-price event has no validFrom either (offers block has no temporal anchor)', () => {
    const schema = extractEvent(generateEventSchema(sampleFreeExhibition, 'el'));
    if (schema.offers) {
      expect(schema.offers.validFrom).toBeUndefined();
    }
  });
});
