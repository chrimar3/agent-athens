/**
 * Quality-loop round 2, adversarial-review fixes: a presumption is never
 * stated as fact, and Greek pages with native Greek prose get Greek meta.
 */
import { describe, test, expect } from 'bun:test';
import { renderEventDetailPage } from '../event-page';
import { buildFactualSummary } from '../../utils/factual-summary';
import { resolveEffectiveEnd } from '../../utils/event-lifecycle';
import { STRINGS } from '../../i18n/strings';
import type { Event } from '../../types';

const DAY = 86400000;
const isoDay = (o: number) => new Date(Date.now() + o * DAY).toISOString().slice(0, 10);

const base: Event = {
  '@context': 'https://schema.org', '@type': 'ExhibitionEvent', id: 'reviewfix0000001',
  title: 'Μαζί, Ορατές', description: '', hasNativeGreek: false,
  startDate: isoDay(-40), type: 'exhibition', genres: [], tags: [],
  venue: { name: 'ΚΠΙΣΝ', address: '', neighborhood: '' }, price: { type: 'open' },
  url: '', source: 'snfcc', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  language: 'el', ticketUrlResolved: null,
};

describe('a presumed end is not stated as fact', () => {
  const presumedPast: Event = { ...base, presumedEndDate: isoDay(-5) };

  test('the passed-event banner does not say the event ended', () => {
    expect(resolveEffectiveEnd(presumedPast)).toEqual({ date: isoDay(-5), presumed: true }); // precondition
    for (const locale of ['el', 'en'] as const) {
      const html = renderEventDetailPage(presumedPast, [], locale);
      expect(html).toContain('event-passed-banner'); // precondition: the page is in its past phase
      expect(html).not.toContain(STRINGS[locale].eventEnded);
      expect(html).toContain(STRINGS[locale].eventNoLaterDates);
    }
  });

  test('a stated end still says the event ended', () => {
    const html = renderEventDetailPage({ ...base, endDate: isoDay(-5) }, [], 'el');
    expect(html).toContain(STRINGS.el.eventEnded);
  });

  test('an exhibition without a stated end has no start date in its summary (a row may be one listed day)', () => {
    const row = { ...base, startDate: '2026-08-29' };
    for (const locale of ['el', 'en'] as const) {
      const s = buildFactualSummary(row, locale);
      expect(s).toContain('Μαζί, Ορατές'); // precondition: a summary was built
      expect(s).not.toMatch(/29|Αυγ|Aug/);
    }
  });
});

describe('Greek pages with native Greek prose', () => {
  test('get a Greek meta description from that prose', () => {
    const greek = 'Μια μεγάλη ελληνική περιγραφή για την έκθεση, αρκετά μεγάλη ώστε να ξεπερνά τους εκατό χαρακτήρες και να γίνει περιγραφή σελίδας.';
    const ev: Event = { ...base, startDate: isoDay(5), hasNativeGreek: true, fullDescriptionGr: greek, fullDescription: 'An English text that database.ts prefers when both exist, long enough to be used by the meta composer as its source text.' };
    const meta = renderEventDetailPage(ev, [], 'el').match(/<meta name="description" content="([^"]*)"/)![1];
    expect(meta).toContain('Μια μεγάλη ελληνική περιγραφή');
    expect(meta).not.toContain('English');
  });
});
