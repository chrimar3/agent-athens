import { describe, test, expect } from 'bun:test';
import { buildContainedInPlace, resolveEventStatus, ORGANIZATION_SCHEMA } from '../src/utils/schema-geo';
import { renderPage } from '../src/templates/page';
import { sampleConcert, sampleTheaterPerformance, sampleWorkshop, sampleFreeExhibition } from './fixtures/events';
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
    expect(ORGANIZATION_SCHEMA.url).toBe('https://agentathens.netlify.app');
  });

  test('homepage includes Organization JSON-LD', () => {
    const metadata: PageMetadata = {
      title: 'Test',
      description: 'Test page',
      keywords: 'test',
      url: 'index',  // homepage
      eventCount: 1,
      lastUpdate: '2026-03-02T10:00:00Z',
      filters: { type: '', time: '', price: '', neighborhood: '' }
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
      filters: { type: 'concert', time: '', price: '', neighborhood: '' }
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
      filters: { type: '', time: '', price: '', neighborhood: '' }
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
      filters: { type: '', time: '', price: '', neighborhood: '' }
    };
    // sampleConcert has startDate in 2025 — should be EventCompleted
    const html = renderPage(metadata, [sampleConcert]);
    expect(html).toContain('EventCompleted');
  });
});
