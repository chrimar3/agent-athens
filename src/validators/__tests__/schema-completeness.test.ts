import { describe, test, expect } from 'bun:test';
import { validateSchemaCompleteness, validateHubSchema, validateAllPages, validateDataFeed, validateVenueSchema, printSchemaSummary, type SchemaValidationResult } from '../schema-completeness';

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
      expect(result.warnings).toHaveLength(0);
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

    test('missing offers → ERROR', () => {
      const schema = makeValidSchema();
      delete schema['offers'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-offers');
      expect(result.errors.some(e => e.includes('offers'))).toBe(true);
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

    test('empty streetAddress → WARNING', () => {
      const schema = makeValidSchema();
      (schema.location as Record<string, any>).address.streetAddress = '';
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-addr');
      expect(result.warnings.some(w => w.includes('streetAddress'))).toBe(true);
    });

    test('missing location.geo → WARNING', () => {
      const schema = makeValidSchema();
      delete (schema.location as Record<string, any>).geo;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-geo');
      expect(result.warnings.some(w => w.includes('geo'))).toBe(true);
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

    test('EventScheduled with NO offers DOES flag offers as missing (regression-guard)', () => {
      const schema = makeValidSchema({ eventStatus: 'https://schema.org/EventScheduled' });
      delete schema.offers;
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'future-event');
      expect(result.errors).toContain('offers is missing');
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
    expect(result.warnings).toHaveLength(0);
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

// ── validateMicrodata: hub-card itemprop scanner (S101a-B) ────────────
//
// Per S101a-A audit: validateSchemaCompleteness only parses JSON-LD. Hub
// cards emit Schema.org as HTML microdata via <span itemprop="..."> +
// <meta itemprop="...">. validateMicrodata closes the parallel surface:
//   1. itemprop="price" content must be numeric (mirror line 172 regex)
//   2. when itemprop="price" present, itemprop="availability" must be too
//   3. cards without microdata price (e.g., card-variants plain text,
//      no-amount events, past events) are silently skipped
import { validateMicrodata } from '../schema-completeness';

function wrapInHubHtml(cardsHtml: string): string {
  return `<!DOCTYPE html><html><head></head><body>
    <main>${cardsHtml}</main>
  </body></html>`;
}

function makeCard(opts: {
  price?: { kind: 'span-symbol' | 'span-numeric' | 'meta-numeric' | 'omit'; value?: string };
  availability?: 'present' | 'omit';
  eventStatus?: 'EventScheduled' | 'EventCompleted';
} = {}): string {
  const { price = { kind: 'meta-numeric', value: '15' }, availability = 'present', eventStatus = 'EventScheduled' } = opts;

  let priceMarkup = '';
  if (price.kind === 'span-symbol') {
    priceMarkup = `<span itemprop="price">€${price.value ?? '15'}</span>`;
  } else if (price.kind === 'span-numeric') {
    priceMarkup = `<span itemprop="price">${price.value ?? '15'}</span>`;
  } else if (price.kind === 'meta-numeric') {
    priceMarkup = `<meta itemprop="price" content="${price.value ?? '15'}">`;
  }

  const availMarkup = availability === 'present'
    ? `<meta itemprop="availability" content="https://schema.org/InStock">`
    : '';

  return `
    <article class="event-card" itemscope itemtype="https://schema.org/MusicEvent">
      <h3 itemprop="name">Sample Event</h3>
      <span itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        ${priceMarkup}
        <meta itemprop="priceCurrency" content="EUR">
        ${availMarkup}
      </span>
      <meta itemprop="eventStatus" content="https://schema.org/${eventStatus}">
    </article>`;
}

describe('validateMicrodata', () => {
  test('Rule 1: <span itemprop="price">€16</span> → error "must be numeric"', () => {
    const html = wrapInHubHtml(makeCard({ price: { kind: 'span-symbol', value: '16' } }));
    const result = validateMicrodata(html);
    expect(result.errors.some(e => e.includes('must be numeric'))).toBe(true);
  });

  test('Rule 1: <span itemprop="price">16</span> (numeric) passes', () => {
    const html = wrapInHubHtml(makeCard({ price: { kind: 'span-numeric', value: '16' } }));
    const result = validateMicrodata(html);
    expect(result.errors.filter(e => e.includes('must be numeric'))).toHaveLength(0);
  });

  test('Rule 1: <meta itemprop="price" content="16"> (canonical post-fix shape) passes', () => {
    const html = wrapInHubHtml(makeCard({ price: { kind: 'meta-numeric', value: '16' } }));
    const result = validateMicrodata(html);
    expect(result.errors.filter(e => e.includes('must be numeric'))).toHaveLength(0);
  });

  test('Card without itemprop="price" (card-variants plain text) is silently skipped', () => {
    const html = wrapInHubHtml(`
      <article class="event-card-list">
        <span class="card-price">€15</span>
      </article>`);
    const result = validateMicrodata(html);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('Hub page with N cards, M containing € symbol → reports M errors', () => {
    const violatingCards = [
      makeCard({ price: { kind: 'span-symbol', value: '10' } }),
      makeCard({ price: { kind: 'span-symbol', value: '20' } }),
      makeCard({ price: { kind: 'span-symbol', value: '30' } }),
    ];
    const cleanCards = [
      makeCard({ price: { kind: 'meta-numeric', value: '40' } }),
      makeCard({ price: { kind: 'meta-numeric', value: '50' } }),
    ];
    const html = wrapInHubHtml([...violatingCards, ...cleanCards].join('\n'));
    const result = validateMicrodata(html);
    expect(result.errors.filter(e => e.includes('must be numeric'))).toHaveLength(3);
  });

  test('Rule 2: itemprop="price" present + itemprop="availability" missing → error', () => {
    const html = wrapInHubHtml(makeCard({
      price: { kind: 'meta-numeric', value: '15' },
      availability: 'omit',
    }));
    const result = validateMicrodata(html);
    expect(result.errors.some(e => e.includes('availability'))).toBe(true);
  });

  test('Rule 2: itemprop="price" + itemprop="availability" both present → passes', () => {
    const html = wrapInHubHtml(makeCard({
      price: { kind: 'meta-numeric', value: '15' },
      availability: 'present',
    }));
    const result = validateMicrodata(html);
    expect(result.errors.filter(e => e.includes('availability'))).toHaveLength(0);
  });

  test('Past event card (EventCompleted) legitimately omits both → no error', () => {
    const html = wrapInHubHtml(makeCard({
      price: { kind: 'omit' },
      availability: 'omit',
      eventStatus: 'EventCompleted',
    }));
    const result = validateMicrodata(html);
    expect(result.errors).toHaveLength(0);
  });
});
