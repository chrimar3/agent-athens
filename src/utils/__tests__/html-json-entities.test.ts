import { describe, test, expect } from 'bun:test';
import { decodeJsonLdEntities, escapeJsonForHtml } from '../html-json';

// Round-1 build gate: 25 hub/overflow/venue pages still carried entity-encoded
// names (pre-S154 rows) in JSON-LD, which AI answers quote verbatim.
describe('decodeJsonLdEntities', () => {
  test('decodes entities in every string value, at any depth', () => {
    const json = JSON.stringify({ name: 'PLAY &amp; NO NAME', itemListElement: [{ item: { name: '&#171;Κάρμεν&#187;', location: { name: 'Θέατρο &quot;Χώρα&quot;' } } }] });
    const out = JSON.parse(decodeJsonLdEntities(json));
    expect(out.name).toBe('PLAY & NO NAME');
    expect(out.itemListElement[0].item.name).toBe('«Κάρμεν»');
    expect(out.itemListElement[0].item.location.name).toBe('Θέατρο "Χώρα"'); // a decoded quote stays valid JSON
  });

  test('double-encoded values decode fully (real venue-page row, 2026-09-23)', () => {
    const json = JSON.stringify({ name: 'Sayings and Cracks &amp;#8211; Tribute to Gy&amp;#246;rgy' });
    expect(JSON.parse(decodeJsonLdEntities(json)).name).toBe('Sayings and Cracks – Tribute to György');
  });

  test('JSON with nothing to decode is returned byte-for-byte (no churn)', () => {
    const json = JSON.stringify({ name: 'Ty Segall', url: 'https://x/?a=1&b=2' }, null, 2);
    expect(decodeJsonLdEntities(json)).toBe(json);
  });

  test('URL query strings survive: no legacy semicolon-less entity decoding', () => {
    // The block contains a real entity, so decoding runs over every string.
    const json = JSON.stringify({ name: 'A &amp; B', url: 'https://x.gr/?a=1&region=gr&copy=2&not=3' });
    expect(JSON.parse(decodeJsonLdEntities(json)).url).toBe('https://x.gr/?a=1&region=gr&copy=2&not=3');
  });

  test('composes with the HTML-boundary escape', () => {
    const html = escapeJsonForHtml(decodeJsonLdEntities('{"name":"A &amp; B"}'));
    expect(html).toBe('{"name":"A \\u0026 B"}');
  });
});
