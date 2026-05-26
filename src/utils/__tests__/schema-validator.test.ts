import { describe, test, expect } from 'bun:test';
import { validateEventSchema } from '../schema-validator';

const COMPLETE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'MusicEvent',
  'name': 'Test Concert',
  'description': 'A test event description',
  'startDate': '2026-03-15T21:00:00+02:00',
  'endDate': '2026-03-15T23:30:00+02:00',
  'eventStatus': 'https://schema.org/EventScheduled',
  'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
  'inLanguage': 'en',
  'url': 'https://agentathens.com/events/test/',
  'location': {
    '@type': 'EventVenue',
    'name': 'Half Note Jazz Club',
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': 'Trivonianou 17',
      'addressLocality': 'Athens',
      'addressRegion': 'Attica',
      'addressCountry': 'GR',
    },
    'geo': {
      '@type': 'GeoCoordinates',
      'latitude': 37.9684,
      'longitude': 23.7372,
    },
  },
  'isAccessibleForFree': false,
  'offers': {
    '@type': 'Offer',
    'price': '15',
    'priceCurrency': 'EUR',
    'availability': 'https://schema.org/InStock',
    'url': 'https://example.com/tickets',
    'seller': {
      '@type': 'Organization',
      'name': 'Example.com',
      'url': 'https://example.com/',
    },
  },
  'image': 'https://agentathens.com/images/og/concert-default.png',
  'performer': {
    '@type': 'MusicGroup',
    'name': 'Test Artist',
  },
};

describe('validateEventSchema', () => {
  test('complete schema passes with no missing or warnings', () => {
    const json = JSON.stringify(COMPLETE_SCHEMA);
    const result = validateEventSchema(json, '/events/test/');
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('missing @type is flagged as mandatory', () => {
    const schema = { ...COMPLETE_SCHEMA };
    delete (schema as Record<string, unknown>)['@type'];
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).toContain('@type');
  });

  test('missing nested location.name is flagged as mandatory', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    delete schema.location.name;
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).toContain('location.name');
  });

  test('missing image is flagged as recommended warning', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    delete schema.image;
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).toEqual([]);
    expect(result.warnings).toContain('image');
  });

  test('missing performer is flagged as recommended warning', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    delete schema.performer;
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).toEqual([]);
    expect(result.warnings).toContain('performer');
  });

  test('1.3b: single-occurrence event (MusicEvent) missing endDate is NOT warned', () => {
    // endDate is type-conditional, not generic-recommended: a concert is one day.
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    delete schema.endDate;
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.warnings).not.toContain('endDate');
  });

  test('1.3b: multi-day type (ExhibitionEvent) missing endDate IS warned', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    schema['@type'] = 'ExhibitionEvent';
    delete schema.endDate;
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.warnings).toContain('endDate');
  });

  test('1.3b: multi-day type (Festival) WITH endDate is not warned', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    schema['@type'] = 'Festival'; // keeps endDate from COMPLETE_SCHEMA
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.warnings).not.toContain('endDate');
  });

  test('invalid JSON returns INVALID_JSON in missing', () => {
    const result = validateEventSchema('not valid json {{{', '/events/broken/');
    expect(result.missing).toContain('INVALID_JSON');
  });

  test('empty object flags all mandatory fields', () => {
    const result = validateEventSchema('{}', '/events/empty/');
    expect(result.missing).toContain('@context');
    expect(result.missing).toContain('@type');
    expect(result.missing).toContain('name');
    expect(result.missing).toContain('location');
    expect(result.missing).toContain('inLanguage');
    expect(result.missing.length).toBeGreaterThanOrEqual(10);
  });

  test('empty string values are flagged as missing', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    schema.name = '';
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).toContain('name');
  });

  test('null values are flagged as missing', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    schema.description = null;
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).toContain('description');
  });

  test('url is preserved in result', () => {
    const result = validateEventSchema('{}', '/events/my-event/');
    expect(result.url).toBe('/events/my-event/');
  });
});

// ─── Offers contract (Sprint 1 Session 3 — Strategist 2026-04-29) ─────

describe('validateEventSchema — offers contract', () => {
  test('EventCompleted with NO offers does NOT flag offers as mandatory', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    schema.eventStatus = 'https://schema.org/EventCompleted';
    delete schema.offers;
    const result = validateEventSchema(JSON.stringify(schema), '/events/past/');
    expect(result.missing).not.toContain('offers');
  });

  test('EventScheduled with NO offers DOES flag offers as mandatory (regression-guard)', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    schema.eventStatus = 'https://schema.org/EventScheduled';
    delete schema.offers;
    const result = validateEventSchema(JSON.stringify(schema), '/events/future/');
    expect(result.missing).toContain('offers');
  });

  test('offers present but missing seller flags as mandatory', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    delete schema.offers.seller;
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).toContain('offers.seller');
  });

  test('offers.seller as a non-Organization shape (string) flags as mandatory', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    schema.offers.seller = 'just-a-string';
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).toContain('offers.seller');
  });

  test('offers.seller with dual-type ["Place", "Organization"] passes Organization check', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    schema.offers.seller = {
      '@type': ['Place', 'Organization'],
      name: 'Benaki Museum',
      url: 'https://www.benaki.org/'
    };
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).not.toContain('offers.seller');
  });

  test('offers present but missing offers.url flags as INFO (not WARN, not FAIL)', () => {
    const schema = JSON.parse(JSON.stringify(COMPLETE_SCHEMA));
    delete schema.offers.url;
    const result = validateEventSchema(JSON.stringify(schema), '/events/test/');
    expect(result.missing).not.toContain('offers.url');
    expect(result.warnings).not.toContain('offers.url');
    expect(result.info ?? []).toContain('offers.url');
  });
});
