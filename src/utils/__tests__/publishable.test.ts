import { describe, test, expect } from 'bun:test';
import { toPublishable } from '../publishable';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

// Build-time view of an event: what the site may state as fact. Applied to
// the build population only — rowToEvent stays faithful because scripts
// round-trip its output through upsertEvent.
const ticketed = (priceSource: string | undefined): Event => ({
  ...sampleConcert, priceSource, price: { type: 'with-ticket', amount: 25, currency: 'EUR', range: '€25–€40' },
});

describe('toPublishable — defaults are not facts', () => {
  test('a venue-default amount and range are dropped; the event stays ticketed', () => {
    const ev = toPublishable(ticketed('venue_default'));
    expect(ev.price.type).toBe('with-ticket');
    expect(ev.price.amount ?? null).toBeNull();
    expect(ev.price.range ?? null).toBeNull();
  });

  test('a directly scraped amount is kept', () => {
    expect(toPublishable(ticketed('direct')).price.amount).toBe(25);
  });

  test('legacy rows without price_source keep their amount', () => {
    expect(toPublishable(ticketed(undefined)).price.amount).toBe(25);
  });

  test('the input event is not mutated', () => {
    const ev = ticketed('venue_default');
    toPublishable(ev);
    expect(ev.price.amount).toBe(25);
  });
});

describe('toPublishable — enrichment markers never reach renderers', () => {
  const text = 'A real description.\n\n<!-- timeliness-expires: 2026-11-01 -->';

  test('HTML comments are stripped from every description field', () => {
    const ev = toPublishable({ ...sampleConcert, description: text, fullDescription: text, fullDescriptionEn: text, fullDescriptionGr: text });
    for (const v of [ev.description, ev.fullDescription, ev.fullDescriptionEn, ev.fullDescriptionGr]) {
      expect(v).not.toContain('<!--');
      expect(v).toContain('A real description.');
    }
  });

  test('a marker between paragraphs does not merge them', () => {
    const ev = toPublishable({ ...sampleConcert, fullDescription: 'First.\n\n<!-- x -->\n\nSecond.' });
    expect(ev.fullDescription).toMatch(/First\.\n\n+Second\./);
  });

  test('an unclosed marker is stripped to the end of the text', () => {
    const ev = toPublishable({ ...sampleConcert, fullDescription: 'Hello.\n\n<!-- timeliness-expires: 2026-10-01' });
    expect(ev.fullDescription).toBe('Hello.');
  });

  test('absent fields stay absent', () => {
    const ev = toPublishable({ ...sampleConcert, fullDescriptionGr: undefined });
    expect(ev.fullDescriptionGr).toBeUndefined();
  });
});
