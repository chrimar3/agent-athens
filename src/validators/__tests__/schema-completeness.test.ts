import { describe, test, expect } from 'bun:test';
import { validateSchemaCompleteness, validateAllPages, type SchemaValidationResult } from '../schema-completeness';

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
    'inLanguage': 'el',
    'url': 'https://agentathens.com/events/abc123-half-note-jazz/',
    'isAccessibleForFree': false,
    'offers': {
      '@type': 'Offer',
      'price': '15',
      'priceCurrency': 'EUR',
      'availability': 'https://schema.org/InStock',
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

    test('missing doorTime → WARNING', () => {
      const schema = makeValidSchema();
      delete schema['doorTime'];
      const result = validateSchemaCompleteness(wrapInHtml(schema), 'no-door');
      expect(result.warnings.some(w => w.includes('doorTime'))).toBe(true);
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

    const summary = validateAllPages(tmpDir);
    expect(summary.total).toBe(3);
    expect(summary.passCount).toBe(1);  // no errors, no warnings
    expect(summary.warnCount).toBe(1);  // warnings only
    expect(summary.failCount).toBe(1);  // has errors
    expect(summary.details).toHaveLength(3);
  });
});
