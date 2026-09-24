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

describe('toPublishable — unknown clock times are not facts', () => {
  const ra = (startDate: string, timeDoors?: string): Event => ({ ...sampleConcert, source: 'residentadvisor', startDate, timeDoors });

  test('the residentadvisor 23:59 placeholder becomes a date-only event', () => {
    const input = ra('2026-10-24T23:59:00', '23:59');
    expect(input.startDate).toContain('T23:59'); // precondition: the fixture carries the sentinel
    const ev = toPublishable(input);
    expect(ev.startDate).toBe('2026-10-24');
    expect(ev.timeDoors).toBeUndefined();
  });

  test('a real residentadvisor start time is kept', () => {
    expect(toPublishable(ra('2026-10-24T23:00:00', '23:00')).startDate).toBe('2026-10-24T23:00:00');
  });

  test('23:59 from another source is not treated as a placeholder', () => {
    const ev = toPublishable({ ...sampleConcert, source: 'more.com', startDate: '2026-12-31T23:59:00' });
    expect(ev.startDate).toBe('2026-12-31T23:59:00');
  });

  test('a door time equal to the start time is dropped as redundant', () => {
    const input: Event = { ...sampleConcert, startDate: '2026-10-08T20:30:00', timeDoors: '20:30' };
    expect(input.startDate.slice(11, 16)).toBe(input.timeDoors!); // precondition
    expect(toPublishable(input).timeDoors).toBeUndefined();
  });

  test('a door time before the start is kept', () => {
    expect(toPublishable({ ...sampleConcert, startDate: '2026-10-08T21:30:00', timeDoors: '20:30' }).timeDoors).toBe('20:30');
  });

  test('on a date-only event the door time is the only known time and is kept', () => {
    expect(toPublishable({ ...sampleConcert, startDate: '2026-10-08', timeDoors: '20:30' }).timeDoors).toBe('20:30');
  });
});
