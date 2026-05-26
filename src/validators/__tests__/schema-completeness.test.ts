import { describe, test, expect } from 'bun:test';
import { validateSchemaCompleteness, validateHubSchema, validateAllPages, validateDataFeed, validateVenueSchema, printSchemaSummary, validatePriceTypeVocabulary, flattenGraph, resolveSamePageReferences, validateOfferShape, checkOrphanReferences, checkMemberOrdering, checkCrossLocaleCanonical, checkPhaseKeyedNoindex, isEnLocalePath, validateVenueIdAndSlug, type SchemaValidationResult, type PageClass } from '../schema-completeness';

// Helper: wrap a JSON-LD object in minimal HTML
function wrapInHtml(schema: Record<string, unknown>): string {
  return `<!DOCTYPE html><html><head>
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
  </head><body></body></html>`;
}

// A fully valid schema matching what generateEventSchema() produces
function makeValidSchema(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    'name': 'Jazz Night at Half Note',
    'description': 'An evening of jazz standards with the Athens quartet.',
    'startDate': '2026-03-15T21:00:00+02:00',
    'eventStatus': 'https://schema.org/EventScheduled',
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'inLanguage': 'en',
    'url': 'https://agentathens.com/events/abc123-half-note-jazz/',
    'isAccessibleForFree': false,
    'offers': {
      '@type': 'Offer',
      'price': '15',
      'priceCurrency': 'EUR',
      'availability': 'https://schema.org/InStock',
      'url': 'https://example.com/tickets',
      'seller': {
        '@type': 'Organization',
        'name': 'Half Note Jazz Club',
        'url': 'https://halfnote.gr/',
      },
    },
    'location': {
      '@type': 'MusicVenue',
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
        'latitude': 37.9688,
        'longitude': 23.7375,
      },
    },
    'image': 'https://agentathens.com/images/events/abc123.jpg',
    'doorTime': '2026-03-15T20:30:00+02:00',
    ...overrides,
  };
}

describe('validateSchemaCompleteness', () => {
  describe('valid complete schema', () => {
    test('passes all checks with no errors or warnings', () => {
      const html = wrapInHtml(makeValidSchema());
      const result = validateSchemaCompleteness(html, 'test-event');
      expect(result.errors).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.slug).toBe('test-event');
    });
  });

  describe('mandatory field errors', () => {
    test('missing @type → ERROR', () => {
      const schema = makeValidSchema();
      delete schema['@type'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-type');
      expect(result.errors.some(e => e.includes('@type'))).toBe(true);
    });

    test('missing @context → ERROR', () => {
      const schema = makeValidSchema();
      delete schema['@context'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-context');
      expect(result.errors.some(e => e.includes('@context'))).toBe(true);
    });

    test('missing name → ERROR', () => {
      const schema = makeValidSchema({ name: '' });
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-name');
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    test('missing startDate → ERROR', () => {
      const schema = makeValidSchema();
      delete schema['startDate'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-date');
      expect(result.errors.some(e => e.includes('startDate'))).toBe(true);
    });

    test('startDate without timezone → ERROR', () => {
      const schema = makeValidSchema({ startDate: '2026-03-15T21:00:00' });
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-tz');
      expect(result.errors.some(e => e.includes('timezone'))).toBe(true);
    });

    test('missing location.name → ERROR', () => {
      const schema = makeValidSchema({
        location: { '@type': 'MusicVenue', name: '' },
      });
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-venue');
      expect(result.errors.some(e => e.includes('location.name'))).toBe(true);
    });

    test('missing offers + isAccessibleForFree:false → PASS (S134 reshape: with-ticket signal carried by isAccessibleForFree)', () => {
      const schema = makeValidSchema();
      delete schema['offers'];
      // isAccessibleForFree stays false (default in makeValidSchema) — this is the new floor.
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-offers-with-floor');
      expect(result.errors.some(e => e.toLowerCase().includes('offers'))).toBe(false);
    });

    test('missing offers + isAccessibleForFree undefined → ERROR (no ticketing signal at all)', () => {
      const schema = makeValidSchema();
      delete schema['offers'];
      delete schema['isAccessibleForFree'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-offers-no-signal');
      // The missing-isAccessibleForFree rule fires; the validator surfaces SOME error.
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('missing isAccessibleForFree → ERROR', () => {
      const schema = makeValidSchema();
      delete schema['isAccessibleForFree'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-free');
      expect(result.errors.some(e => e.includes('isAccessibleForFree'))).toBe(true);
    });

    test('missing eventStatus → ERROR', () => {
      const schema = makeValidSchema();
      delete schema['eventStatus'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-status');
      expect(result.errors.some(e => e.includes('eventStatus'))).toBe(true);
    });

    test('missing eventAttendanceMode → ERROR', () => {
      const schema = makeValidSchema();
      delete schema['eventAttendanceMode'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-mode');
      expect(result.errors.some(e => e.includes('eventAttendanceMode'))).toBe(true);
    });

    test('invalid @type not in SCHEMA_TYPE_MAP → ERROR', () => {
      const schema = makeValidSchema({ '@type': 'FakeEvent' });
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'bad-type');
      expect(result.errors.some(e => e.includes('@type'))).toBe(true);
    });

    test('price with € symbol → ERROR', () => {
      const schema = makeValidSchema({
        offers: {
          '@type': 'Offer',
          price: '€15',
          priceCurrency: 'EUR',
        },
      });
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'euro-symbol');
      expect(result.errors.some(e => e.includes('price') && e.includes('numeric'))).toBe(true);
    });
  });

  // S143 (Strategist 2026-05-20): Pre-resolution required-inline rule for
  // Event.location. Closes the literal-vs-graph blind spot where
  // resolveSamePageReferences() silently inlines bare-@id refs from same-page
  // venue nodes — making the post-resolution location.name check pass even
  // though the rendered HTML's Event.location is bare-@id (not Events-rich-
  // result-eligible per GSC URL Inspection). Same scope-drift class as
  // S139-fix-1/-2. Negative control is permanent — proves the rule catches
  // the class, not just current state.
  describe('S143 — Event.location required-inline rule', () => {
    test('bare-@id Event.location (with same-page venue node) → FAIL LOCATION_NOT_INLINE', () => {
      const venueId = 'https://agentathens.com/venues/half-note/#venue';
      const eventEntity = makeValidSchema({
        '@id': 'https://agentathens.com/events/abc/#event',
        location: { '@id': venueId },
      });
      delete (eventEntity as any)['@context'];
      const envelope = {
        '@context': 'https://schema.org',
        '@graph': [
          eventEntity,
          {
            '@type': 'MusicVenue',
            '@id': venueId,
            name: 'Half Note Jazz Club',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Trivonianou 17',
              addressLocality: 'Athens',
              addressRegion: 'Attica',
              addressCountry: 'GR',
            },
          },
        ],
      };
      const result = validateSchemaCompleteness(wrapInHtml(envelope), 'bare-id-location');
      expect(result.errors.some(e => e.includes('LOCATION_NOT_INLINE'))).toBe(true);
    });

    test('inline-with-@id Event.location (name + address inline, @id retained) → PASS', () => {
      const venueId = 'https://agentathens.com/venues/half-note/#venue';
      const eventEntity = makeValidSchema({
        '@id': 'https://agentathens.com/events/abc/#event',
        location: {
          '@type': 'MusicVenue',
          '@id': venueId,
          name: 'Half Note Jazz Club',
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'Trivonianou 17',
            addressLocality: 'Athens',
            addressRegion: 'Attica',
            addressCountry: 'GR',
          },
        },
      });
      delete (eventEntity as any)['@context'];
      const envelope = {
        '@context': 'https://schema.org',
        '@graph': [
          eventEntity,
          {
            '@type': 'MusicVenue',
            '@id': venueId,
            name: 'Half Note Jazz Club',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Trivonianou 17',
              addressLocality: 'Athens',
              addressRegion: 'Attica',
              addressCountry: 'GR',
            },
            geo: { '@type': 'GeoCoordinates', latitude: 37.9688, longitude: 23.7375 },
          },
        ],
      };
      const result = validateSchemaCompleteness(wrapInHtml(envelope), 'inline-with-id-location');
      expect(result.errors.some(e => e.includes('LOCATION_NOT_INLINE'))).toBe(false);
    });
  });

  describe('data quality warnings', () => {
    test('empty description → WARNING', () => {
      const schema = makeValidSchema({ description: '' });
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-desc');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('description'))).toBe(true);
    });

    test('missing description → WARNING', () => {
      const schema = makeValidSchema();
      delete schema['description'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-desc2');
      expect(result.warnings.some(w => w.includes('description'))).toBe(true);
    });

    test('2.2: empty streetAddress → ERROR (location-prefixed, feeds the build halt)', () => {
      const schema = makeValidSchema();
      (schema.location as Record<string, any>).address.streetAddress = '';
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-addr');
      expect(result.errors.some(e => e.includes('location.address.streetAddress'))).toBe(true);
      expect(result.warnings.some(w => w.includes('streetAddress'))).toBe(false);
    });

    test('missing location.geo (no canonical @id, fully-inline) → WARNING (scope-to-canonical falls back to inline geo when no @id ref)', () => {
      const schema = makeValidSchema();
      delete (schema.location as Record<string, any>).geo;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-geo');
      // S143 GEO-refined (2026-05-20): geo check scoped to canonical venue node
      // by @id lookup; for fully-inline events without an @id ref, falls back
      // to location.geo. Either way, truly missing geo → WARN (preserves the
      // venue-data-gap signal routed to Component B sameAs/geo backfill).
      expect(result.warnings.some(w => w.includes('location.geo coordinates missing'))).toBe(true);
    });

    test('missing location.geo on inline-with-@id Event.location but canonical venue node HAS geo → PASS (scope-to-canonical lookup succeeds)', () => {
      const venueId = 'https://agentathens.com/venues/half-note/#venue';
      const eventEntity = makeValidSchema({
        '@id': 'https://agentathens.com/events/abc/#event',
        location: {
          '@type': 'MusicVenue',
          '@id': venueId,
          name: 'Half Note Jazz Club',
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'Trivonianou 17',
            addressLocality: 'Athens',
            addressRegion: 'Attica',
            addressCountry: 'GR',
          },
          // NOTE: no geo on the inline projection — this is exactly the S143 inline shape
        },
      });
      delete (eventEntity as any)['@context'];
      const envelope = {
        '@context': 'https://schema.org',
        '@graph': [
          eventEntity,
          {
            '@type': 'MusicVenue',
            '@id': venueId,
            name: 'Half Note Jazz Club',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Trivonianou 17',
              addressLocality: 'Athens',
              addressRegion: 'Attica',
              addressCountry: 'GR',
            },
            geo: { '@type': 'GeoCoordinates', latitude: 37.9688, longitude: 23.7375 },
          },
        ],
      };
      const result = validateSchemaCompleteness(wrapInHtml(envelope), 'inline-geo-on-canonical');
      expect(result.warnings.some(w => w.includes('location.geo coordinates missing'))).toBe(false);
    });

    test('inline-with-@id Event.location AND canonical venue node both lack geo → WARNING (real venue-data gap surfaces)', () => {
      const venueId = 'https://agentathens.com/venues/crust/#venue';
      const eventEntity = makeValidSchema({
        '@id': 'https://agentathens.com/events/abc/#event',
        location: {
          '@type': 'MusicVenue',
          '@id': venueId,
          name: 'Crust',
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'Πρωτογένους 13, Αθήνα 105 54',
            addressLocality: 'Athens',
            addressRegion: 'Attica',
            addressCountry: 'GR',
          },
        },
      });
      delete (eventEntity as any)['@context'];
      const envelope = {
        '@context': 'https://schema.org',
        '@graph': [
          eventEntity,
          {
            '@type': 'MusicVenue',
            '@id': venueId,
            name: 'Crust',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Πρωτογένους 13, Αθήνα 105 54',
              addressLocality: 'Athens',
              addressRegion: 'Attica',
              addressCountry: 'GR',
            },
            // NOTE: no geo on canonical either — represents the ~25 real venue-data gaps
          },
        ],
      };
      const result = validateSchemaCompleteness(wrapInHtml(envelope), 'no-geo-anywhere');
      expect(result.warnings.some(w => w.includes('location.geo coordinates missing'))).toBe(true);
    });

    test('missing image → WARNING', () => {
      const schema = makeValidSchema();
      delete schema['image'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-img');
      expect(result.warnings.some(w => w.includes('image'))).toBe(true);
    });

    test('missing doorTime → no warning (Schema.org optional)', () => {
      const schema = makeValidSchema();
      delete schema['doorTime'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-door');
      expect(result.warnings.some(w => w.includes('doorTime'))).toBe(false);
    });

    test('placeholder "TBA" in name → WARNING', () => {
      const schema = makeValidSchema({ name: 'TBA' });
      // "TBA" as a name also triggers empty-name error? No — "TBA" is non-empty.
      // But it should trigger a placeholder warning.
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'tba-name');
      expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true);
    });

    test('placeholder "Unknown" in description → WARNING', () => {
      const schema = makeValidSchema({ description: 'Unknown' });
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'unk-desc');
      expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true);
    });

    test('placeholder "N/A" in streetAddress → WARNING', () => {
      const schema = makeValidSchema();
      (schema.location as Record<string, any>).address.streetAddress = 'N/A';
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'na-addr');
      expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true);
    });
  });

  describe('offers contract (Sprint 1 Session 3 — Strategist 2026-04-29)', () => {
    test('EventCompleted with NO offers does NOT flag offers as missing', () => {
      const schema = makeValidSchema({ eventStatus: 'https://schema.org/EventCompleted' });
      delete schema.offers;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'past-event');
      expect(result.errors.some(e => e === 'offers is missing')).toBe(false);
    });

    test('EventScheduled with NO offers + isAccessibleForFree:false → PASS (S134 reshape)', () => {
      // S134 (2026-05-11 Unclassifiable-Merchant decision): offers is optional
      // when classifier omits. With-ticket signal carried by isAccessibleForFree:false.
      // Sprint 1 regression-guard rewritten — the "offers is missing" rule was
      // removed per the rule reshape.
      const schema = makeValidSchema({
        eventStatus: 'https://schema.org/EventScheduled',
        isAccessibleForFree: false,
      });
      delete schema.offers;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'future-event');
      expect(result.errors.some(e => e.toLowerCase().includes('offers'))).toBe(false);
    });

    test('offers present but missing seller → ERROR', () => {
      const schema = makeValidSchema();
      delete (schema.offers as Record<string, any>).seller;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-seller');
      expect(result.errors.some(e => e.includes('seller'))).toBe(true);
    });

    test('offers.seller as a non-Organization shape (string) → ERROR', () => {
      const schema = makeValidSchema();
      (schema.offers as Record<string, any>).seller = 'just-a-string';
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'bad-seller-shape');
      expect(result.errors.some(e => e.includes('seller'))).toBe(true);
    });

    test('offers.seller as Organization without name → ERROR', () => {
      const schema = makeValidSchema();
      (schema.offers as Record<string, any>).seller = { '@type': 'Organization' };
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'seller-no-name');
      expect(result.errors.some(e => e.includes('seller'))).toBe(true);
    });

    test('offers.seller with dual-type ["Place", "Organization"] passes Organization check', () => {
      const schema = makeValidSchema();
      (schema.offers as Record<string, any>).seller = {
        '@type': ['Place', 'Organization'],
        name: 'Benaki Museum',
        url: 'https://www.benaki.org/'
      };
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'dual-type-seller');
      expect(result.errors.some(e => e.includes('seller'))).toBe(false);
    });

    test('offers present but missing offers.url → INFO (not WARN, not FAIL)', () => {
      const schema = makeValidSchema();
      delete (schema.offers as Record<string, any>).url;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-offers-url');
      expect(result.errors.some(e => e.includes('offers.url'))).toBe(false);
      expect(result.warnings.some(w => w.includes('offers.url'))).toBe(false);
      expect((result.info ?? []).some(i => i.includes('offers.url'))).toBe(true);
    });

    test('offers missing priceCurrency → ERROR', () => {
      const schema = makeValidSchema();
      delete (schema.offers as Record<string, any>).priceCurrency;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-currency');
      expect(result.errors.some(e => e.includes('priceCurrency'))).toBe(true);
    });

    test('offers missing availability → ERROR', () => {
      const schema = makeValidSchema();
      delete (schema.offers as Record<string, any>).availability;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-availability');
      expect(result.errors.some(e => e.includes('availability'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('no JSON-LD script tag → single error', () => {
      const html = '<!DOCTYPE html><html><head></head><body></body></html>';
      const result = validateSchemaCompleteness(html, 'no-jsonld');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('JSON-LD');
    });

    test('malformed JSON in script tag → single error', () => {
      const html = `<!DOCTYPE html><html><head>
        <script type="application/ld+json">{bad json</script>
      </head><body></body></html>`;
      const result = validateSchemaCompleteness(html, 'bad-json');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('parse');
    });
  });
});

// Helper: wrap multiple JSON-LD blocks in HTML
function wrapMultiJsonLd(...schemas: Record<string, unknown>[]): string {
  const blocks = schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n');
  return `<!DOCTYPE html><html><head>${blocks}</head><body></body></html>`;
}

function makeValidCollectionPage(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Concerts in Athens',
    'inLanguage': 'el',
    'mainEntity': {
      '@type': 'ItemList',
      'numberOfItems': 5,
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'item': { '@type': 'MusicEvent', 'name': 'Test' } }
      ]
    }
  };
}

function makeValidFAQPage(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': [
      {
        '@type': 'Question',
        'name': 'Where can I see live music in Athens?',
        'acceptedAnswer': { '@type': 'Answer', 'text': 'Athens has many venues...' }
      }
    ]
  };
}

describe('validateHubSchema', () => {
  test('valid hub page with CollectionPage + FAQPage passes', () => {
    const html = wrapMultiJsonLd(makeValidCollectionPage(), makeValidFAQPage());
    const result = validateHubSchema(html, 'concerts');
    expect(result.errors).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.slug).toBe('hub:concerts');
  });

  test('missing CollectionPage block → ERROR', () => {
    const html = wrapMultiJsonLd(makeValidFAQPage());
    const result = validateHubSchema(html, 'concerts');
    expect(result.errors.some(e => e.includes('CollectionPage'))).toBe(true);
  });

  test('missing FAQPage block → WARNING', () => {
    const html = wrapMultiJsonLd(makeValidCollectionPage());
    const result = validateHubSchema(html, 'concerts');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('FAQPage'))).toBe(true);
  });

  test('CollectionPage missing name → ERROR', () => {
    const cp = makeValidCollectionPage();
    delete cp.name;
    const html = wrapMultiJsonLd(cp, makeValidFAQPage());
    const result = validateHubSchema(html, 'concerts');
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });

  test('CollectionPage missing mainEntity → ERROR', () => {
    const cp = makeValidCollectionPage();
    delete cp.mainEntity;
    const html = wrapMultiJsonLd(cp, makeValidFAQPage());
    const result = validateHubSchema(html, 'concerts');
    expect(result.errors.some(e => e.includes('mainEntity'))).toBe(true);
  });

  test('FAQPage with empty mainEntity → ERROR', () => {
    const faq = makeValidFAQPage();
    faq.mainEntity = [];
    const html = wrapMultiJsonLd(makeValidCollectionPage(), faq);
    const result = validateHubSchema(html, 'concerts');
    expect(result.errors.some(e => e.includes('Question array'))).toBe(true);
  });

  test('FAQPage question missing acceptedAnswer → ERROR', () => {
    const faq = makeValidFAQPage();
    (faq.mainEntity as any[])[0] = { '@type': 'Question', 'name': 'Test?' };
    const html = wrapMultiJsonLd(makeValidCollectionPage(), faq);
    const result = validateHubSchema(html, 'concerts');
    expect(result.errors.some(e => e.includes('acceptedAnswer'))).toBe(true);
  });

  test('no JSON-LD at all → ERROR', () => {
    const html = '<!DOCTYPE html><html><head></head><body></body></html>';
    const result = validateHubSchema(html, 'concerts');
    expect(result.errors.some(e => e.includes('JSON-LD'))).toBe(true);
  });

  test('CollectionPage missing inLanguage → WARNING', () => {
    const cp = makeValidCollectionPage();
    delete cp.inLanguage;
    const html = wrapMultiJsonLd(cp, makeValidFAQPage());
    const result = validateHubSchema(html, 'concerts');
    expect(result.warnings.some(w => w.includes('inLanguage'))).toBe(true);
  });

  // Hub ListItem location.address.streetAddress parity guard (2026-05-27).
  // The hub ListItem builder (schema-graph-builders.ts) emitted streetAddress:''
  // for config-address venues whose DB venue_address was empty (237 nodes in the
  // 2026-05-27 dist/ scan) because it lacked the findVenueConfig fallback the
  // detail emitter (event-page.ts:176) has. validateHubSchema previously did not
  // inspect ListItem location.address — build-completeness stayed fail:0 (blind
  // spot). This guard mirrors the detail-page streetAddress check (line ~382),
  // scoped to "address present" so honest location-less items stay clean.
  describe('ListItem location.address.streetAddress (hub parity guard)', () => {
    function makeCpWithItemLocation(location: Record<string, any> | undefined): Record<string, unknown> {
      const cp = makeValidCollectionPage();
      const items = (cp.mainEntity as any).itemListElement as any[];
      if (location === undefined) delete items[0].item.location;
      else items[0].item.location = location;
      return cp;
    }
    const placeWith = (streetAddress: string) => ({
      '@type': 'MusicVenue',
      name: 'Cantina Social',
      address: { '@type': 'PostalAddress', streetAddress, addressLocality: 'Athens', addressRegion: 'Attica', addressCountry: 'GR' },
    });

    test('ListItem with location.address but empty streetAddress → ERROR', () => {
      const html = wrapMultiJsonLd(makeCpWithItemLocation(placeWith('')), makeValidFAQPage());
      const result = validateHubSchema(html, 'concerts');
      expect(result.errors.some(e =>
        e.includes('itemListElement') && e.includes('location.address.streetAddress'),
      )).toBe(true);
    });

    test('ListItem with a non-empty streetAddress passes', () => {
      const html = wrapMultiJsonLd(makeCpWithItemLocation(placeWith('Leokoriou 6-8, Athens 105 54')), makeValidFAQPage());
      const result = validateHubSchema(html, 'concerts');
      expect(result.errors.filter(e => e.includes('location.address.streetAddress'))).toHaveLength(0);
    });

    test('ListItem with no location/address block → no streetAddress error (honest omission)', () => {
      const html = wrapMultiJsonLd(makeCpWithItemLocation(undefined), makeValidFAQPage());
      const result = validateHubSchema(html, 'concerts');
      expect(result.errors.filter(e => e.includes('location.address.streetAddress'))).toHaveLength(0);
    });
  });

  // S139-fix (Strategist 2026-05-20) — ListItem Offer-shape coupling regression tests.
  // The drift class that produced 15 price-less ListItem Offers in the 2026-05-20
  // production deploy. These tests prove the validator catches the pre-fix state.
  describe('ListItem Offer-shape coupling (S139-fix)', () => {
    function makeCpWithListItemOffer(offer: Record<string, any> | undefined): Record<string, unknown> {
      const cp = makeValidCollectionPage();
      const items = (cp.mainEntity as any).itemListElement as any[];
      items[0].item.offers = offer;
      if (offer === undefined) delete items[0].item.offers;
      return cp;
    }

    test('price-less ListItem Offer (the pre-fix bug) → FAIL', () => {
      // Exact shape from validator.schema.org rejection: priceCurrency + availability,
      // no price field, no seller.
      const cp = makeCpWithListItemOffer({
        '@type': 'Offer',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
      });
      const html = wrapMultiJsonLd(cp, makeValidFAQPage());
      const result = validateHubSchema(html, 'concerts');
      expect(result.errors.some(e =>
        e.includes('CollectionPage.itemListElement[0].item.') &&
        e.includes('price or priceSpecification'),
      )).toBe(true);
    });

    test('Offer with price + priceCurrency + availability + seller passes', () => {
      const cp = makeCpWithListItemOffer({
        '@type': 'Offer',
        price: '15',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: 'Test Venue' },
      });
      const html = wrapMultiJsonLd(cp, makeValidFAQPage());
      const result = validateHubSchema(html, 'concerts');
      const itemListErrors = result.errors.filter(e => e.includes('itemListElement'));
      expect(itemListErrors).toHaveLength(0);
    });

    test('Offer with priceSpecification (instead of price) passes', () => {
      // Schema.org allows priceSpecification as an alternative to price.
      const cp = makeCpWithListItemOffer({
        '@type': 'Offer',
        priceSpecification: { '@type': 'PriceSpecification', price: 15, priceCurrency: 'EUR' },
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: 'Test Venue' },
      });
      const html = wrapMultiJsonLd(cp, makeValidFAQPage());
      const result = validateHubSchema(html, 'concerts');
      const priceErrors = result.errors.filter(e =>
        e.includes('itemListElement') && e.includes('price or priceSpecification'),
      );
      expect(priceErrors).toHaveLength(0);
    });

    test('Omitted offers (no offers field at all) passes — legitimate omit', () => {
      const cp = makeCpWithListItemOffer(undefined);
      const html = wrapMultiJsonLd(cp, makeValidFAQPage());
      const result = validateHubSchema(html, 'concerts');
      const itemListErrors = result.errors.filter(e => e.includes('itemListElement'));
      expect(itemListErrors).toHaveLength(0);
    });

    test('Multiple ListItems — only the malformed one FAILs (per-index error)', () => {
      const cp = makeValidCollectionPage();
      const items = (cp.mainEntity as any).itemListElement as any[];
      // Replace with 3 items: [valid, malformed, valid]
      items.length = 0;
      items.push({
        '@type': 'ListItem', position: 1,
        item: { '@type': 'MusicEvent', name: 'Good 1', offers: { '@type': 'Offer', price: '10', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', seller: { '@type': 'Organization', name: 'V' } } },
      });
      items.push({
        '@type': 'ListItem', position: 2,
        item: { '@type': 'MusicEvent', name: 'Bad', offers: { '@type': 'Offer', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } },
      });
      items.push({
        '@type': 'ListItem', position: 3,
        item: { '@type': 'MusicEvent', name: 'Good 2' },
      });
      const html = wrapMultiJsonLd(cp, makeValidFAQPage());
      const result = validateHubSchema(html, 'concerts');
      const priceErrors = result.errors.filter(e =>
        e.includes('itemListElement') && e.includes('price or priceSpecification'),
      );
      expect(priceErrors).toHaveLength(1);
      expect(priceErrors[0]).toContain('itemListElement[1]');
    });

    test('ListItem Offer rule walks @graph-wrapped CollectionPage', () => {
      // Real production shape: CollectionPage inside @graph envelope.
      // The validator's flattenGraph unwraps the envelope; the ListItem walk
      // then descends into the nested item.offers and applies the FAIL rule.
      const cp = makeCpWithListItemOffer({
        '@type': 'Offer',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
      });
      const envelope = { '@context': 'https://schema.org', '@graph': [cp, makeValidFAQPage()] };
      const html = `<!DOCTYPE html><html><head><script type="application/ld+json">${JSON.stringify(envelope)}</script></head><body></body></html>`;
      const result = validateHubSchema(html, 'concerts');
      expect(result.errors.some(e =>
        e.includes('itemListElement[0].item.') && e.includes('price or priceSpecification'),
      )).toBe(true);
    });
  });
});

describe('validateOfferShape (S139-fix helper)', () => {
  function validOffer(): Record<string, any> {
    return {
      '@type': 'Offer',
      price: '15',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'Test Venue' },
    };
  }

  test('valid Offer passes', () => {
    const result = validateOfferShape(validOffer());
    expect(result.errors).toHaveLength(0);
  });

  test('Offer with neither price nor priceSpecification → FAIL', () => {
    const offer = validOffer();
    delete offer.price;
    const result = validateOfferShape(offer);
    expect(result.errors.some(e => e.includes('price or priceSpecification'))).toBe(true);
  });

  test('Offer with priceSpecification (no price) passes', () => {
    const offer = validOffer();
    delete offer.price;
    offer.priceSpecification = { '@type': 'PriceSpecification', price: 15, priceCurrency: 'EUR' };
    const result = validateOfferShape(offer);
    expect(result.errors.some(e => e.includes('price or priceSpecification'))).toBe(false);
  });

  test('contextPrefix prepends to errors', () => {
    const offer = validOffer();
    delete offer.price;
    const result = validateOfferShape(offer, 'ListItem[7]: ');
    expect(result.errors[0]).toStartWith('ListItem[7]: ');
  });

  test('seller as @id-only same-page reference accepted (shape b)', () => {
    const offer = validOffer();
    offer.seller = { '@id': 'https://agentathens.com/#organization' };
    const result = validateOfferShape(offer);
    const sellerErrors = result.errors.filter(e => e.includes('seller'));
    expect(sellerErrors).toHaveLength(0);
  });

  test('price with currency symbol → FAIL', () => {
    const offer = validOffer();
    offer.price = '€15';
    const result = validateOfferShape(offer);
    expect(result.errors.some(e => e.includes('numeric'))).toBe(true);
  });

  test('missing priceCurrency → FAIL', () => {
    const offer = validOffer();
    delete offer.priceCurrency;
    const result = validateOfferShape(offer);
    expect(result.errors.some(e => e.includes('priceCurrency'))).toBe(true);
  });

  test('missing availability → FAIL', () => {
    const offer = validOffer();
    delete offer.availability;
    const result = validateOfferShape(offer);
    expect(result.errors.some(e => e.includes('availability'))).toBe(true);
  });
});

describe('validateAllPages', () => {
  test('returns summary with correct counts', () => {
    // Use a temp directory with known HTML files
    const { mkdtempSync, writeFileSync, mkdirSync } = require('fs');
    const { join } = require('path');
    const tmpDir = mkdtempSync(join(require('os').tmpdir(), 'schema-test-'));

    // Create event dirs with HTML
    const eventsDir = join(tmpDir, 'events');

    // Event 1: fully valid
    const dir1 = join(eventsDir, 'valid-event');
    mkdirSync(dir1, { recursive: true });
    writeFileSync(join(dir1, 'index.html'), wrapInHtml(makeValidSchema()));

    // Event 2: missing description (warning only)
    const dir2 = join(eventsDir, 'warn-event');
    mkdirSync(dir2, { recursive: true });
    const warnSchema = makeValidSchema({ description: '' });
    writeFileSync(join(dir2, 'index.html'), wrapInHtml(warnSchema));

    // Event 3: missing @type (error)
    const dir3 = join(eventsDir, 'error-event');
    mkdirSync(dir3, { recursive: true });
    const errSchema = makeValidSchema();
    delete errSchema['@type'];
    writeFileSync(join(dir3, 'index.html'), wrapInHtml(errSchema));

    const summary = validateAllPages(tmpDir, 'info');
    // 3 event pages + 1 DataFeed slot (Sprint 2 Component A — validateAllPages
    // appends validateDataFeed(distDir); the missing /api/events.json in tmpDir
    // surfaces as a fourth entry with a "missing" error).
    expect(summary.total).toBe(4);
    expect(summary.passCount).toBe(1);  // valid event
    expect(summary.warnCount).toBe(1);  // warn-event
    expect(summary.failCount).toBe(2);  // error-event + missing DataFeed
    expect(summary.details).toHaveLength(4);
    expect(summary.details.some(r => r.slug === 'datafeed:events')).toBe(true);
  });
});

// ─── validateDataFeed (Sprint 2 Component A) ─────────────────────
// /api/events.json is the Schema.org DataFeed surface for AI agents and
// structured-data consumers. Validates mandatory DataFeed fields per
// schema.org spec. Routes via `datafeed:events` slug prefix (mirrors
// the hub:/venue: prefix pattern Component D's reporter consumes).
describe('validateDataFeed', () => {
  const { mkdtempSync, writeFileSync, mkdirSync } = require('fs');
  const { join } = require('path');
  const os = require('os');

  function makeTmpDir(): string {
    return mkdtempSync(join(os.tmpdir(), 'datafeed-test-'));
  }

  function writeFeed(distDir: string, payload: any): void {
    const apiDir = join(distDir, 'api');
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, 'events.json'), JSON.stringify(payload, null, 2));
  }

  function makeValidFeed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'DataFeed',
      name: 'Agent Athens — Cultural Events',
      description: 'Cultural events in Athens, Greece. Updated daily.',
      dateModified: '2026-05-02T08:00:00+03:00',
      dataFeedElement: [{ '@type': 'MusicEvent', name: 'sample' }],
      ...overrides,
    };
  }

  test('valid DataFeed file → no errors, no warnings', () => {
    const tmpDir = makeTmpDir();
    writeFeed(tmpDir, makeValidFeed());
    const result = validateDataFeed(tmpDir);
    expect(result.slug).toBe('datafeed:events');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('missing DataFeed file → error', () => {
    const tmpDir = makeTmpDir();
    const result = validateDataFeed(tmpDir);
    expect(result.errors).toContain('DataFeed file missing at /api/events.json');
  });

  test('missing dateModified → error', () => {
    const tmpDir = makeTmpDir();
    writeFeed(tmpDir, makeValidFeed({ dateModified: '' }));
    const result = validateDataFeed(tmpDir);
    expect(result.errors.some(e => e.includes('dateModified'))).toBe(true);
  });

  test('empty dataFeedElement → warning, not error', () => {
    const tmpDir = makeTmpDir();
    writeFeed(tmpDir, makeValidFeed({ dataFeedElement: [] }));
    const result = validateDataFeed(tmpDir);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain('dataFeedElement is empty');
  });

  test('wrong @type → error', () => {
    const tmpDir = makeTmpDir();
    writeFeed(tmpDir, makeValidFeed({ '@type': 'ItemList' }));
    const result = validateDataFeed(tmpDir);
    expect(result.errors.some(e => e.includes('@type'))).toBe(true);
  });

  test('malformed JSON → error', () => {
    const tmpDir = makeTmpDir();
    const apiDir = join(tmpDir, 'api');
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, 'events.json'), '{ this is not valid json');
    const result = validateDataFeed(tmpDir);
    expect(result.errors.some(e => e.includes('parse error'))).toBe(true);
  });
});

// ── validateVenueSchema: addressRegion canonicalization (Q-B6 lock) ──
//
// Per Strategist Q-B6 lock 2026-05-03: addressRegion on venue pages must
// equal city.region.name from city-geodata.json (e.g. "Attica" for Athens,
// "Catalonia" for Barcelona, "Berlin" for Berlin). Mismatch is ERROR, not
// WARN — the value is config-driven and a divergent value is a structural
// drift, not a data-quality gap.
function makeValidVenueSchema(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    'name': 'Half Note Jazz Club',
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': 'Trivonianou 17',
      'addressLocality': 'Athens',
      'addressRegion': 'Attica',
      'addressCountry': 'GR',
    },
    'geo': { '@type': 'GeoCoordinates', 'latitude': 37.9688, 'longitude': 23.7375 },
    'url': 'https://agentathens.com/venues/half-note/',
    ...overrides,
  };
}

describe('validateVenueSchema — addressRegion canonicalization (Q-B6)', () => {
  test('addressRegion matches city.region.name → no error', () => {
    const html = wrapInHtml(makeValidVenueSchema());
    const result = validateVenueSchema(html, 'half-note', 'Attica', 'info');
    expect(result.errors).toEqual([]);
  });

  test('address block missing → existing "address is missing" ERROR fires; no addressRegion-specific error', () => {
    const schema = makeValidVenueSchema();
    delete (schema as { address?: unknown }).address;
    const html = wrapInHtml(schema);
    const result = validateVenueSchema(html, 'no-address', 'Attica', 'info');
    expect(result.errors.some(e => e.includes('address is missing'))).toBe(true);
    expect(result.errors.some(e => e.includes('addressRegion'))).toBe(false);
  });

  test('addressRegion mismatch ("Neos Kosmos" vs expected "Attica") → ERROR with both values', () => {
    const schema = makeValidVenueSchema();
    (schema.address as Record<string, unknown>).addressRegion = 'Neos Kosmos';
    const html = wrapInHtml(schema);
    const result = validateVenueSchema(html, 'wrong-region', 'Attica', 'info');
    const mismatchError = result.errors.find(e => e.includes('addressRegion'));
    expect(mismatchError).toBeDefined();
    expect(mismatchError).toContain('Neos Kosmos');
    expect(mismatchError).toContain('Attica');
  });

  test('multi-city replicability: expected="Catalonia", venue page emits "Attica" → ERROR fires', () => {
    const html = wrapInHtml(makeValidVenueSchema());
    const result = validateVenueSchema(html, 'wrong-city', 'Catalonia', 'info');
    const mismatchError = result.errors.find(e => e.includes('addressRegion'));
    expect(mismatchError).toBeDefined();
    expect(mismatchError).toContain('Attica');
    expect(mismatchError).toContain('Catalonia');
  });
});

// ── validateVenueSchema: venue sameAs (Q-B1 lock; Q-B5 sameAs-only this cycle) ──
//
// Per Strategist Q-B1 lock 2026-05-03: missing venue sameAs surfaces as INFO
// universally; promotes to WARN when venueSameAs coverage in athens-venues.json
// reaches the ratchet threshold (default 0.5). Severity decided once at build
// start in generate-site.ts and threaded into the validator (B-1 pattern).
describe('validateVenueSchema — venue sameAs (Q-B1 + Q-B5)', () => {
  test('venue with sameAs populated → no sameAs finding at info severity', () => {
    const schema = makeValidVenueSchema({ sameAs: ['https://www.wikidata.org/wiki/Q12345'] });
    const html = wrapInHtml(schema);
    const result = validateVenueSchema(html, 'with-sameas', 'Attica', 'info');
    expect(result.warnings.some(w => w.includes('sameAs'))).toBe(false);
    expect((result.info ?? []).some(i => i.includes('sameAs'))).toBe(false);
  });

  test('venue with sameAs populated → no sameAs finding at warn severity', () => {
    const schema = makeValidVenueSchema({ sameAs: ['https://www.wikidata.org/wiki/Q12345'] });
    const html = wrapInHtml(schema);
    const result = validateVenueSchema(html, 'with-sameas', 'Attica', 'warn');
    expect(result.warnings.some(w => w.includes('sameAs'))).toBe(false);
    expect((result.info ?? []).some(i => i.includes('sameAs'))).toBe(false);
  });

  test('venue without sameAs + severity=info → result.info has sameAs message; result.warnings does not', () => {
    const html = wrapInHtml(makeValidVenueSchema());
    const result = validateVenueSchema(html, 'no-sameas', 'Attica', 'info');
    expect((result.info ?? []).some(i => i.includes('sameAs'))).toBe(true);
    expect(result.warnings.some(w => w.includes('sameAs'))).toBe(false);
  });

  test('venue without sameAs + severity=warn → result.warnings has sameAs message; result.info does not', () => {
    const html = wrapInHtml(makeValidVenueSchema());
    const result = validateVenueSchema(html, 'no-sameas', 'Attica', 'warn');
    expect(result.warnings.some(w => w.includes('sameAs'))).toBe(true);
    expect((result.info ?? []).some(i => i.includes('sameAs'))).toBe(false);
  });
});

// ── printSchemaSummary: INFO surfacing (Sprint 2 Component B-2) ──
//
// INFO findings are surfaced separately from warnings, never conflated.
// Console output gets a dedicated header line + a "Top INFO findings" block
// when info[] is non-empty across the corpus.
describe('printSchemaSummary — INFO surfacing (Q-B1 lock)', () => {
  test('summary output contains INFO header + Top INFO findings when info[] is populated', () => {
    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
    try {
      const summary = {
        total: 2,
        passCount: 2,
        warnCount: 0,
        failCount: 0,
        details: [
          { slug: 'a', errors: [], warnings: [], info: ['venue sameAs missing'] },
          { slug: 'b', errors: [], warnings: [], info: ['venue sameAs missing'] },
        ],
      };
      printSchemaSummary(summary);
    } finally {
      console.log = origLog;
    }
    const joined = captured.join('\n');
    expect(joined).toContain('INFO');
    expect(joined).toContain('venue sameAs missing');
  });

  test('summary output omits INFO line when no info findings exist', () => {
    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { captured.push(args.join(' ')); };
    try {
      const summary = {
        total: 1,
        passCount: 1,
        warnCount: 0,
        failCount: 0,
        details: [
          { slug: 'a', errors: [], warnings: [], info: [] },
        ],
      };
      printSchemaSummary(summary);
    } finally {
      console.log = origLog;
    }
    const joined = captured.join('\n');
    expect(joined).not.toContain('INFO');
  });
});

// ── validateSchemaCompleteness: location.sameAs (Q-B1 + Q-B5 + Q-B7) ──
//
// Per Strategist Q-B7 lock 2026-05-03: DataFeed inherits per-event Place check
// transitively. validateDataFeed is NOT extended. The check fires on event-page
// location block, which is also what the DataFeed wraps.
describe('validateSchemaCompleteness — location.sameAs (Q-B1 + Q-B5 + Q-B7)', () => {
  test('event with location.sameAs → no sameAs finding', () => {
    const schema = makeValidSchema({
      location: {
        '@type': 'MusicVenue',
        'name': 'Half Note',
        'address': { '@type': 'PostalAddress', 'streetAddress': 'X', 'addressLocality': 'Athens', 'addressRegion': 'Attica', 'addressCountry': 'GR' },
        'sameAs': ['https://www.wikidata.org/wiki/Q12345'],
      },
    });
    const result = validateSchemaCompleteness(wrapInHtml(schema), 'with-sameas', 'info');
    expect(result.warnings.some(w => w.includes('location.sameAs'))).toBe(false);
    expect((result.info ?? []).some(i => i.includes('location.sameAs'))).toBe(false);
  });

  test('event without location.sameAs + severity=info → result.info has location.sameAs message; result.warnings does not', () => {
    const result = validateSchemaCompleteness(wrapInHtml(makeValidSchema()), 'no-sameas-info', 'info');
    expect((result.info ?? []).some(i => i.includes('location.sameAs'))).toBe(true);
    expect(result.warnings.some(w => w.includes('location.sameAs'))).toBe(false);
  });

  test('event without location.sameAs + severity=warn → result.warnings has location.sameAs message; result.info does not', () => {
    const result = validateSchemaCompleteness(wrapInHtml(makeValidSchema()), 'no-sameas-warn', 'warn');
    expect(result.warnings.some(w => w.includes('location.sameAs'))).toBe(true);
    expect((result.info ?? []).some(i => i.includes('location.sameAs'))).toBe(false);
  });
});

// ── validateMicrodata test block retired 2026-05-25 ────────────────────
// Microdata stripped from hub-card + EDP surfaces; JSON-LD is authoritative.
// Function and tests deleted together to keep S110 manifest invariant
// (emission removal + validation removal land as one decision).

// ── validateSchemaCompleteness: multi-block extraction (S132' validator-depth fix) ────────────
//
// Before S132' the validator extracted only the first <script type="application/ld+json">
// block per page (htmlContent.match). When a page emitted multiple blocks — e.g. a valid
// Event followed by a broken Event, or a WebSite block before the Event block — the
// validator missed the second block's structural problems and reported PASS while Google
// reported critical issues. The institutional fix: enumerate all blocks, locate the
// Event-typed one(s), validate that, and report "multiple Event JSON-LD blocks present"
// as a structural error.

function wrapMultiBlockHtml(...schemas: Array<Record<string, unknown>>): string {
  const tags = schemas
    .map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join('\n');
  return `<!DOCTYPE html><html><head>${tags}</head><body></body></html>`;
}

describe("validateSchemaCompleteness — multi-block extraction (S132')", () => {
  test('two Event blocks: validator reports the structural multi-Event error', () => {
    const valid = makeValidSchema();
    const broken = makeValidSchema();
    delete (broken as Record<string, unknown>).location;
    const html = wrapMultiBlockHtml(valid, broken);
    const result = validateSchemaCompleteness(html, 'dual-event', 'info');
    expect(result.errors.some(e => e.toLowerCase().includes('multiple') && e.toLowerCase().includes('event'))).toBe(true);
  });

  test('WebSite block first, Event block second: validator locates and validates the Event', () => {
    const website = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Agent Athens', url: 'https://agentathens.com/' };
    const event = makeValidSchema();
    delete (event as Record<string, unknown>).image;
    const html = wrapMultiBlockHtml(website, event);
    const result = validateSchemaCompleteness(html, 'website-then-event', 'info');
    expect(result.errors.some(e => e.includes('WebSite'))).toBe(false);
    expect(result.errors.some(e => e.includes('not a valid Schema.org event type'))).toBe(false);
    expect(result.warnings.some(w => w.toLowerCase().includes('image'))).toBe(true);
  });

  test('multiple non-Event blocks, no Event among them: returns clear "No Event JSON-LD" error and does not cascade WebSite-as-Event errors', () => {
    const website = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'x', url: 'https://x/' };
    const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] };
    const html = wrapMultiBlockHtml(website, breadcrumb);
    const result = validateSchemaCompleteness(html, 'no-event-block', 'info');
    expect(result.errors.some(e => e.toLowerCase().includes('no event json-ld'))).toBe(true);
    expect(result.errors.some(e => e.includes('not a valid Schema.org event type'))).toBe(false);
  });
});

// =====================================================================
// S134 — Offer-presence rule reshape (price_type-conditional + isAccessibleForFree floor)
// =====================================================================

describe('validateSchemaCompleteness — S134 offer-presence rule reshape', () => {
  test('with-ticket pattern (isAccessibleForFree:false) + no offers → PASS (new floor)', () => {
    const schema = makeValidSchema({ isAccessibleForFree: false });
    delete schema['offers'];
    const result = validateSchemaCompleteness(wrapInHtml(schema), 's134-with-ticket-no-offers');
    expect(result.errors.some(e => e.toLowerCase().includes('offers'))).toBe(false);
  });

  test('open pattern (isAccessibleForFree:true) + no offers → PASS', () => {
    const schema = makeValidSchema({ isAccessibleForFree: true });
    delete schema['offers'];
    const result = validateSchemaCompleteness(wrapInHtml(schema), 's134-open-no-offers');
    expect(result.errors.some(e => e.toLowerCase().includes('offers'))).toBe(false);
  });

  test('EventCompleted + no offers → PASS (past-event precedent preserved)', () => {
    const schema = makeValidSchema({
      eventStatus: 'https://schema.org/EventCompleted',
      isAccessibleForFree: false,
    });
    delete schema['offers'];
    const result = validateSchemaCompleteness(wrapInHtml(schema), 's134-completed-no-offers');
    expect(result.errors.some(e => e.toLowerCase().includes('offers'))).toBe(false);
  });

  test('offers present but missing seller → FAIL (Offer-property check; shape-agnostic)', () => {
    const schema = makeValidSchema({
      offers: {
        '@type': 'Offer',
        price: '15',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        // seller intentionally omitted
      },
    });
    const result = validateSchemaCompleteness(wrapInHtml(schema), 's134-no-seller');
    expect(result.errors.some(e => e.toLowerCase().includes('seller'))).toBe(true);
  });

  test('offers present but missing priceCurrency → FAIL (Offer-property check)', () => {
    const schema = makeValidSchema({
      offers: {
        '@type': 'Offer',
        price: '15',
        availability: 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: 'X' },
      },
    });
    const result = validateSchemaCompleteness(wrapInHtml(schema), 's134-no-currency');
    expect(result.errors.some(e => e.toLowerCase().includes('pricecurrency') || e.toLowerCase().includes('price'))).toBe(true);
  });

  test('offers present without offers.url → still PASS (url is INFO-level, not FAIL)', () => {
    const schema = makeValidSchema();
    const offers = schema.offers as Record<string, unknown>;
    delete offers.url;
    const result = validateSchemaCompleteness(wrapInHtml(schema), 's134-no-offers-url');
    // url is INFO-level per existing line 238; no FAIL
    expect(result.errors.some(e => e.includes('offers.url'))).toBe(false);
  });
});

describe('validatePriceTypeVocabulary — Tier 1 vocabulary guard (B-03)', () => {
  test("price_type='tba' → FAIL", () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-tba', price_type: 'tba', source: 'residentadvisor' });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].toLowerCase()).toContain('price_type');
    expect(result.errors[0]).toContain('tba');
  });

  test("price_type='unknown' → FAIL", () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-unknown', price_type: 'unknown' });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('unknown');
  });

  test("price_type='free' (legacy non-canonical) → FAIL", () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-free', price_type: 'free' });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("price_type='paid' (legacy non-canonical) → FAIL", () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-paid', price_type: 'paid' });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("price_type='open' → PASS", () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-open', price_type: 'open' });
    expect(result.errors).toEqual([]);
  });

  test("price_type='with-ticket' → PASS", () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-wt', price_type: 'with-ticket' });
    expect(result.errors).toEqual([]);
  });

  test("price_type='donation' → PASS (dormant-but-wired per S136 / CLAUDE.md)", () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-don', price_type: 'donation' });
    expect(result.errors).toEqual([]);
  });

  test('price_type=null → PASS (unenriched events legitimately have null price_type)', () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-null', price_type: null });
    expect(result.errors).toEqual([]);
  });

  test('price_type=undefined → PASS (same as null — pre-enrichment state)', () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-undef' });
    expect(result.errors).toEqual([]);
  });

  test('error message includes the event id for traceability', () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-abc123', price_type: 'tba' });
    expect(result.errors[0]).toContain('evt-abc123');
  });

  test('result.slug carries the event id', () => {
    const result = validatePriceTypeVocabulary({ id: 'evt-abc123', price_type: 'tba' });
    expect(result.slug).toBe('evt-abc123');
  });
});

// ─── S139 — @graph-aware extraction helpers ────────────────────────

describe('flattenGraph', () => {
  test('returns empty array for empty input', () => {
    expect(flattenGraph([])).toEqual([]);
  });

  test('returns single flat block unchanged', () => {
    const block = { '@context': 'https://schema.org', '@type': 'Event', name: 'X' };
    expect(flattenGraph([block])).toEqual([block]);
  });

  test('yields each @graph member, inheriting envelope @context', () => {
    const envelope = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Event', '@id': '#event', name: 'E' },
        { '@type': 'Organization', '@id': '#org', name: 'O' },
      ],
    };
    const out = flattenGraph([envelope]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ '@context': 'https://schema.org', '@type': 'Event', name: 'E' });
    expect(out[1]).toMatchObject({ '@context': 'https://schema.org', '@type': 'Organization', name: 'O' });
  });

  test('handles mixed flat + envelope blocks', () => {
    const flat = { '@context': 'https://schema.org', '@type': 'DataFeed', name: 'feed' };
    const envelope = {
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'Event', name: 'E' }],
    };
    const out = flattenGraph([flat, envelope]);
    expect(out).toHaveLength(2);
    expect(out[0]['@type']).toBe('DataFeed');
    expect(out[1]['@type']).toBe('Event');
  });

  test('preserves member-level @context if already present', () => {
    const envelope = {
      '@context': 'https://schema.org',
      '@graph': [{ '@context': 'https://other.example/', '@type': 'X' }],
    };
    expect(flattenGraph([envelope])[0]['@context']).toBe('https://other.example/');
  });
});

describe('resolveSamePageReferences', () => {
  test('inlines {@id} reference with resolved entity', () => {
    const entities = [
      { '@id': '#event', '@type': 'Event', name: 'E', location: { '@id': '#venue' } },
      { '@id': '#venue', '@type': 'MusicVenue', name: 'V', address: { streetAddress: 'X' } },
    ];
    const out = resolveSamePageReferences(entities);
    expect(out[0].location).toEqual({ '@type': 'MusicVenue', name: 'V', address: { streetAddress: 'X' } });
    expect(out[1]['@id']).toBe('#venue'); // top-level @id preserved
  });

  test('leaves orphan reference as-is', () => {
    const entities = [{ '@id': '#event', '@type': 'Event', location: { '@id': '#missing' } }];
    expect(resolveSamePageReferences(entities)[0].location).toEqual({ '@id': '#missing' });
  });

  test('resolves nested references inside Offer.seller', () => {
    const entities = [
      { '@id': '#event', '@type': 'Event', offers: { '@type': 'Offer', seller: { '@id': '#seller' } } },
      { '@id': '#seller', '@type': 'Organization', name: 'Viva.gr', url: 'https://viva.gr/' },
    ];
    const out = resolveSamePageReferences(entities);
    expect(out[0].offers.seller).toEqual({ '@type': 'Organization', name: 'Viva.gr', url: 'https://viva.gr/' });
  });

  test('does not infinite-loop on circular references (depth guard)', () => {
    const a: any = { '@id': '#a', '@type': 'X' };
    const b: any = { '@id': '#b', '@type': 'X', ref: { '@id': '#a' } };
    a.ref = { '@id': '#b' };
    expect(() => resolveSamePageReferences([a, b])).not.toThrow();
  });
});

// ─── S141: Orphan-@id-reference + member-ordering checks ─────────────────────

/**
 * Wrap an array of @graph members in a single envelope JSON-LD script.
 * Matches the canonical Sprint-3 envelope shape that S139 emits.
 */
function wrapInGraph(members: Record<string, unknown>[]): string {
  const envelope = { '@context': 'https://schema.org', '@graph': members };
  return `<!DOCTYPE html><html><head>
    <script type="application/ld+json">${JSON.stringify(envelope)}</script>
  </head><body></body></html>`;
}

const TEST_BASE_URL = 'https://agentathens.com';
const TEST_INTERNAL_HOST = 'agentathens.com';

const SITE_ORGANIZATION = {
  '@type': 'Organization',
  '@id': 'https://agentathens.com/#organization',
  name: 'agent-athens',
  url: 'https://agentathens.com',
};

const VENUE_DEFINITION = {
  '@type': 'MusicVenue',
  '@id': 'https://agentathens.com/venues/half-note/#venue',
  name: 'Half Note Jazz Club',
  address: { '@type': 'PostalAddress', streetAddress: 'Trivonianou 17' },
};

const EVENT_DEFINITION = (overrides: Record<string, unknown> = {}) => ({
  '@type': 'MusicEvent',
  '@id': 'https://agentathens.com/events/jazz-night/#event',
  name: 'Jazz Night',
  location: {
    '@type': 'MusicVenue',
    '@id': 'https://agentathens.com/venues/half-note/#venue',
    name: 'Half Note Jazz Club',
    address: { '@type': 'PostalAddress', streetAddress: 'Trivonianou 17' },
  },
  ...overrides,
});

describe('checkOrphanReferences (S141 FAIL rule)', () => {
  describe('positive cases (pass)', () => {
    test('same-page-resolved venue ref → no error', () => {
      const html = wrapInGraph([
        EVENT_DEFINITION(),
        VENUE_DEFINITION,
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'jazz-night', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors).toHaveLength(0);
    });

    test('pure-reference {"@id": X} resolves to same-page definition → no error', () => {
      const html = wrapInGraph([
        {
          '@type': 'MusicEvent',
          '@id': 'https://agentathens.com/events/jazz-night/#event',
          name: 'Jazz Night',
          location: { '@id': 'https://agentathens.com/venues/half-note/#venue' },
        },
        VENUE_DEFINITION,
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'jazz-night', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors).toHaveLength(0);
    });

    test('cross-page canonical ref → no error when target page exists', () => {
      const html = wrapInGraph([
        {
          '@type': 'MusicEvent',
          '@id': 'https://agentathens.com/events/jazz-night/#event',
          name: 'Jazz Night',
          location: { '@id': 'https://agentathens.com/venues/half-note/#venue' },
        },
        SITE_ORGANIZATION,
      ]);
      const canonicalUrls = new Set(['https://agentathens.com/venues/half-note']);
      const result = checkOrphanReferences(html, 'jazz-night', canonicalUrls, TEST_INTERNAL_HOST);
      expect(result.errors).toHaveLength(0);
    });

    test('external ref (Wikidata QID) → no error (out of internal scope)', () => {
      const html = wrapInGraph([
        {
          '@type': 'MusicEvent',
          '@id': 'https://agentathens.com/events/jazz-night/#event',
          name: 'Jazz Night',
          performer: { '@id': 'https://www.wikidata.org/wiki/Q12345' },
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'jazz-night', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors).toHaveLength(0);
    });

    test('out-of-scope fragment (#event, #offer, #website) → no error', () => {
      const html = wrapInGraph([
        {
          '@type': 'MusicEvent',
          '@id': 'https://agentathens.com/events/jazz-night/#event',
          name: 'Jazz Night',
          referencedOffer: { '@id': 'https://agentathens.com/events/jazz-night/#offer' },
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'jazz-night', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('negative controls (FAIL)', () => {
    test('orphan #venue ref (no on-page definition, no emitted page) → FAIL', () => {
      const html = wrapInGraph([
        {
          '@type': 'MusicEvent',
          '@id': 'https://agentathens.com/events/jazz-night/#event',
          name: 'Jazz Night',
          location: { '@id': 'https://agentathens.com/venues/ghost-venue/#venue' },
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'jazz-night', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors.some(e => e.includes('orphan @id reference') && e.includes('ghost-venue'))).toBe(true);
    });

    test('orphan #organization ref (no on-page def, no emitted page) → FAIL', () => {
      const html = wrapInGraph([
        {
          '@type': 'MusicEvent',
          '@id': 'https://agentathens.com/events/jazz-night/#event',
          name: 'Jazz Night',
          offers: {
            '@type': 'Offer',
            price: '15',
            priceCurrency: 'EUR',
            seller: { '@id': 'https://agentathens.com/orgs/ghost-merchant/#organization' },
          },
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'jazz-night', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors.some(e => e.includes('orphan @id reference') && e.includes('ghost-merchant'))).toBe(true);
    });

    test('orphan #organizer ref (forward-protective for S142) → FAIL', () => {
      const html = wrapInGraph([
        {
          '@type': 'MusicEvent',
          '@id': 'https://agentathens.com/events/jazz-night/#event',
          name: 'Jazz Night',
          organizer: { '@id': 'https://agentathens.com/orgs/ghost/#organizer' },
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'jazz-night', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors.some(e => e.includes('orphan @id reference') && e.includes('#organizer'))).toBe(true);
    });

    test('multiple orphans on same page → multiple errors', () => {
      const html = wrapInGraph([
        {
          '@type': 'MusicEvent',
          '@id': 'https://agentathens.com/events/jazz-night/#event',
          name: 'Jazz Night',
          location: { '@id': 'https://agentathens.com/venues/ghost-venue/#venue' },
          performer: { '@id': 'https://agentathens.com/performers/ghost/#performer' },
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'jazz-night', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('edge cases', () => {
    test('page with no JSON-LD → no errors (silent skip)', () => {
      const html = '<!DOCTYPE html><html><head></head><body></body></html>';
      const result = checkOrphanReferences(html, 'empty', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors).toHaveLength(0);
    });

    test('malformed URL in ref → no error (validator is not a URL-format gate)', () => {
      const html = wrapInGraph([
        EVENT_DEFINITION({ location: { '@id': 'not-a-url' } }),
        SITE_ORGANIZATION,
      ]);
      const result = checkOrphanReferences(html, 'malformed', new Set(), TEST_INTERNAL_HOST);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe('checkMemberOrdering (S141 FAIL rule)', () => {
  describe('positive cases (pass) — bookends correct', () => {
    test('event page: first=MusicEvent, last=site Organization → pass', () => {
      const html = wrapInGraph([EVENT_DEFINITION(), VENUE_DEFINITION, SITE_ORGANIZATION]);
      const result = checkMemberOrdering(html, 'jazz-night', 'event', TEST_BASE_URL);
      expect(result.errors).toHaveLength(0);
    });

    test('venue page: first=LocalBusiness, last=site Organization → pass', () => {
      const html = wrapInGraph([
        {
          '@type': 'LocalBusiness',
          '@id': 'https://agentathens.com/venues/half-note/#venue',
          name: 'Half Note',
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkMemberOrdering(html, 'venue:half-note', 'venue', TEST_BASE_URL);
      expect(result.errors).toHaveLength(0);
    });

    test('hub page: first=CollectionPage, last=site Organization → pass', () => {
      const html = wrapInGraph([
        {
          '@type': 'CollectionPage',
          '@id': 'https://agentathens.com/concerts#collectionpage',
          name: 'Concerts',
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkMemberOrdering(html, 'hub:concerts', 'hub', TEST_BASE_URL);
      expect(result.errors).toHaveLength(0);
    });

    test('homepage: first=WebSite, last=site Organization → pass', () => {
      const html = wrapInGraph([
        {
          '@type': 'WebSite',
          '@id': 'https://agentathens.com/#website',
          name: 'agent-athens',
        },
        {
          '@type': 'CollectionPage',
          '@id': 'https://agentathens.com/#collectionpage',
          name: 'Athens events',
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkMemberOrdering(html, 'homepage', 'homepage', TEST_BASE_URL);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('negative controls (FAIL) — shuffled order', () => {
    test('event page with site Organization FIRST → FAIL on last-member check', () => {
      const html = wrapInGraph([SITE_ORGANIZATION, VENUE_DEFINITION, EVENT_DEFINITION()]);
      const result = checkMemberOrdering(html, 'jazz-night', 'event', TEST_BASE_URL);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some(e => e.includes('first member @type') || e.includes('last member @id'))).toBe(true);
    });

    test('venue page with non-LocalBusiness first → FAIL', () => {
      const html = wrapInGraph([
        { '@type': 'Place', name: 'Wrong type' },
        SITE_ORGANIZATION,
      ]);
      const result = checkMemberOrdering(html, 'venue:bad', 'venue', TEST_BASE_URL);
      expect(result.errors.some(e => e.includes('first member @type') && e.includes('LocalBusiness'))).toBe(true);
    });

    test('hub page missing site Organization last → FAIL', () => {
      const html = wrapInGraph([
        {
          '@type': 'CollectionPage',
          '@id': 'https://agentathens.com/concerts#collectionpage',
          name: 'Concerts',
        },
        { '@type': 'FAQPage', mainEntity: [] },
      ]);
      const result = checkMemberOrdering(html, 'hub:concerts', 'hub', TEST_BASE_URL);
      expect(result.errors.some(e => e.includes('last member @id'))).toBe(true);
    });

    test('homepage with WebSite NOT first → FAIL on first-member check', () => {
      const html = wrapInGraph([
        {
          '@type': 'CollectionPage',
          '@id': 'https://agentathens.com/#collectionpage',
          name: 'Athens events',
        },
        {
          '@type': 'WebSite',
          '@id': 'https://agentathens.com/#website',
          name: 'agent-athens',
        },
        SITE_ORGANIZATION,
      ]);
      const result = checkMemberOrdering(html, 'homepage', 'homepage', TEST_BASE_URL);
      expect(result.errors.some(e => e.includes('first member @type') && e.includes('WebSite'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('single-member @graph → skip (no error)', () => {
      const html = wrapInGraph([EVENT_DEFINITION()]);
      const result = checkMemberOrdering(html, 'single', 'event', TEST_BASE_URL);
      expect(result.errors).toHaveLength(0);
    });

    test('page with no JSON-LD → skip (no error)', () => {
      const html = '<!DOCTYPE html><html><head></head><body></body></html>';
      const result = checkMemberOrdering(html, 'empty', 'event', TEST_BASE_URL);
      expect(result.errors).toHaveLength(0);
    });

    test('all event subclasses accepted as first @type (TheaterEvent / Festival)', () => {
      const theaterHtml = wrapInGraph([
        {
          '@type': 'TheaterEvent',
          '@id': 'https://agentathens.com/events/macbeth/#event',
          name: 'Macbeth',
        },
        SITE_ORGANIZATION,
      ]);
      expect(checkMemberOrdering(theaterHtml, 't', 'event', TEST_BASE_URL).errors).toHaveLength(0);

      const festivalHtml = wrapInGraph([
        {
          '@type': 'Festival',
          '@id': 'https://agentathens.com/events/athens-festival/#event',
          name: 'Athens Festival',
        },
        SITE_ORGANIZATION,
      ]);
      expect(checkMemberOrdering(festivalHtml, 'f', 'event', TEST_BASE_URL).errors).toHaveLength(0);
    });
  });
});

// S144 (GEO 2026-05-21): /en/ noindex + cross-locale-canonical regression
// guards. Two rules — universal CROSS_LOCALE_CANONICAL + phase-keyed
// NOINDEX_ON_INDEXABLE_PHASE. Phase predicate reads getLifecyclePhase (single
// source of truth with the emitter).
describe('S144 — locale-canonical + phase-keyed noindex guards', () => {
  describe('isEnLocalePath — path-prefix anchoring', () => {
    test('matches /en/<route> paths', () => {
      expect(isEnLocalePath('/en/events/abc/')).toBe(true);
      expect(isEnLocalePath('/en/concerts/')).toBe(true);
      expect(isEnLocalePath('en/today')).toBe(true);
      expect(isEnLocalePath('https://agentathens.com/en/about/')).toBe(true);
    });
    test('does NOT match slugs containing en literally (no path-prefix)', () => {
      expect(isEnLocalePath('/venues/athens-en-route/')).toBe(false);
      expect(isEnLocalePath('/events/12345-encore-tour/')).toBe(false);
      expect(isEnLocalePath('endings')).toBe(false);
    });
    test('does NOT match bare-root paths', () => {
      expect(isEnLocalePath('/events/abc/')).toBe(false);
      expect(isEnLocalePath('/concerts/')).toBe(false);
      expect(isEnLocalePath('https://agentathens.com/events/abc/')).toBe(false);
    });
  });

  describe('checkCrossLocaleCanonical', () => {
    function wrapWithCanonical(canonical: string): string {
      return `<!DOCTYPE html><html><head><link rel="canonical" href="${canonical}"></head><body></body></html>`;
    }
    test('FAIL: /en/ page canonical → bare-root', () => {
      const html = wrapWithCanonical('https://agentathens.com/events/abc/');
      const result = checkCrossLocaleCanonical(html, 'en/events/abc/');
      expect(result.errors.some(e => e.includes('CROSS_LOCALE_CANONICAL'))).toBe(true);
    });
    test('FAIL: bare-root page canonical → /en/', () => {
      const html = wrapWithCanonical('https://agentathens.com/en/events/abc/');
      const result = checkCrossLocaleCanonical(html, 'events/abc/');
      expect(result.errors.some(e => e.includes('CROSS_LOCALE_CANONICAL'))).toBe(true);
    });
    test('PASS: /en/ page canonical → /en/ self', () => {
      const html = wrapWithCanonical('https://agentathens.com/en/events/abc/');
      const result = checkCrossLocaleCanonical(html, 'en/events/abc/');
      expect(result.errors).toHaveLength(0);
    });
    test('PASS: bare-root page canonical → bare-root self', () => {
      const html = wrapWithCanonical('https://agentathens.com/events/abc/');
      const result = checkCrossLocaleCanonical(html, 'events/abc/');
      expect(result.errors).toHaveLength(0);
    });
    test('PASS: no canonical at all (silently skip)', () => {
      const html = '<!DOCTYPE html><html><head></head><body></body></html>';
      const result = checkCrossLocaleCanonical(html, 'en/events/abc/');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('checkPhaseKeyedNoindex', () => {
    // Today = Athens timezone "now"; the classifier in event-lifecycle.ts reads
    // current date. Tests use dates relative to "today" via offsets.
    function makeEventHtml(startDate: string, endDate: string | undefined, type: string, withNoindex: boolean): string {
      const event: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': type,
        'name': 'Test Event',
        'startDate': startDate,
      };
      if (endDate) event.endDate = endDate;
      const noindexTag = withNoindex ? '<meta name="robots" content="noindex">' : '';
      return `<!DOCTYPE html><html><head>${noindexTag}<script type="application/ld+json">${JSON.stringify(event)}</script></head><body></body></html>`;
    }
    function isoOffset(daysFromToday: number): string {
      const d = new Date();
      d.setDate(d.getDate() + daysFromToday);
      return d.toISOString().substring(0, 10);
    }
    test('FAIL: Active event (future) with noindex', () => {
      const html = makeEventHtml(isoOffset(7) + 'T20:00:00+03:00', undefined, 'MusicEvent', true);
      const result = checkPhaseKeyedNoindex(html, 'en/events/active/');
      expect(result.errors.some(e => e.includes('NOINDEX_ON_INDEXABLE_PHASE'))).toBe(true);
    });
    test('FAIL: Just-passed event (Day 4) with noindex', () => {
      const html = makeEventHtml(isoOffset(-4) + 'T20:00:00+03:00', undefined, 'MusicEvent', true);
      const result = checkPhaseKeyedNoindex(html, 'en/events/just-passed/');
      expect(result.errors.some(e => e.includes('NOINDEX_ON_INDEXABLE_PHASE'))).toBe(true);
      expect(result.errors[0]).toContain('just-passed');
    });
    test('PASS: Cooling event (Day 30) with noindex (lifecycle-correct)', () => {
      const html = makeEventHtml(isoOffset(-30) + 'T20:00:00+03:00', undefined, 'MusicEvent', true);
      const result = checkPhaseKeyedNoindex(html, 'en/events/cooling/');
      expect(result.errors).toHaveLength(0);
    });
    test('PASS: Active event without noindex', () => {
      const html = makeEventHtml(isoOffset(7) + 'T20:00:00+03:00', undefined, 'MusicEvent', false);
      const result = checkPhaseKeyedNoindex(html, 'en/events/active-indexable/');
      expect(result.errors).toHaveLength(0);
    });
    test('PASS: exhibition with future endDate + noindex (still Active, FAIL — guard fires)', () => {
      // Exhibition uses endDate for phase. End in 30 days → active.
      const html = makeEventHtml(isoOffset(-5) + 'T11:00:00+03:00', isoOffset(30), 'ExhibitionEvent', true);
      const result = checkPhaseKeyedNoindex(html, 'en/events/active-exhibition/');
      expect(result.errors.some(e => e.includes('NOINDEX_ON_INDEXABLE_PHASE'))).toBe(true);
    });
    test('PASS: non-Event page (no JSON-LD Event) with noindex (silently skip)', () => {
      const html = '<!DOCTYPE html><html><head><meta name="robots" content="noindex"></head><body></body></html>';
      const result = checkPhaseKeyedNoindex(html, 'en/about/');
      expect(result.errors).toHaveLength(0);
    });
  });
});

// =============================================================================
// S146 — validateVenueIdAndSlug (Layer-2 defense-in-depth)
//
// Per plan §4 dry-run protocol: currently in WARN mode. Negative-control tests
// assert the validator FIRES (push to warnings[]) on synthetic bad input,
// confirming detection works before flipping to errors[]. After full-dist
// dry-run confirms 0 violations in production HTML, the function flips.
// =============================================================================

describe('S146 — validateVenueIdAndSlug', () => {
  test('T17/T16: FIRES on synthetic empty-slug venue @id (/venues//#venue)', () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@id": "https://agentathens.com/venues//#venue"}</script>
    </head><body></body></html>`;
    const result = validateVenueIdAndSlug(html, 'test-page');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('venue-id-empty-slug'))).toBe(true);
  });

  test('T18: passes on healthy single-slash @id (/venues/megaron/#venue)', () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@id": "https://agentathens.com/venues/megaron/#venue"}</script>
    </head><body></body></html>`;
    const result = validateVenueIdAndSlug(html, 'test-page');
    expect(result.errors).toHaveLength(0);
  });

  test('T19a: does NOT false-positive on legitimate venue-{hash} fallback (/venues/venue-a3f1b27c/#venue)', () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@id": "https://agentathens.com/venues/venue-a3f1b27c/#venue"}</script>
    </head><body></body></html>`;
    const result = validateVenueIdAndSlug(html, 'test-page');
    expect(result.errors).toHaveLength(0);
  });

  test('T19b: does NOT false-positive on collision-suffix slug (/venues/megaron-2/#venue)', () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@id": "https://agentathens.com/venues/megaron-2/#venue"}</script>
    </head><body></body></html>`;
    const result = validateVenueIdAndSlug(html, 'test-page');
    expect(result.errors).toHaveLength(0);
  });

  test('regex guard: does NOT false-positive on https:// scheme double-slash', () => {
    // The // after https: must NOT trigger the validator. This was the bug
    // class that made naive regexes match 15k+ legitimate URLs in dry-run.
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@id": "https://agentathens.com/events/abc-foo/#event"}</script>
    </head><body></body></html>`;
    const result = validateVenueIdAndSlug(html, 'test-page');
    expect(result.errors).toHaveLength(0);
  });

  test('catches mid-path double-slash (defensive — not the primary bug class)', () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@id": "https://agentathens.com/venues/foo//bar/#venue"}</script>
    </head><body></body></html>`;
    const result = validateVenueIdAndSlug(html, 'test-page');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('catches multiple distinct violations in one page', () => {
    const html = `<!DOCTYPE html><html><head>
      <script type="application/ld+json">{"@id": "https://agentathens.com/venues//#venue"}</script>
      <script type="application/ld+json">{"@id": "https://agentathens.com/venues//#venue2"}</script>
    </head><body></body></html>`;
    const result = validateVenueIdAndSlug(html, 'test-page');
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});
