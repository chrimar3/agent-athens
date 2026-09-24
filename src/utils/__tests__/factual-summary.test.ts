/**
 * Quality-loop round 2, move 4 — factual summary for pages with no description.
 *
 * Synthetic fixtures only. The summary may state ONLY stored structured
 * fields; each missing field must drop its clause, never be guessed.
 */
import { describe, test, expect } from 'bun:test';
import { buildFactualSummary } from '../factual-summary';
import type { Event } from '../../types';

const concert: Event = {
  '@context': 'https://schema.org',
  '@type': 'MusicEvent',
  id: 'factualsummary0001',
  title: 'Synthetic Quartet',
  description: '',
  hasNativeGreek: false,
  startDate: '2026-11-17T21:30:00', // a Tuesday
  type: 'concert',
  genres: [],
  tags: [],
  venue: { name: 'Fixture Hall', address: '', neighborhood: 'Mets' },
  price: { type: 'with-ticket', amount: 18, currency: 'EUR' },
  url: '',
  source: 'fixture',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  language: 'el',
  ticketUrlResolved: null,
};

const exhibition: Event = {
  ...concert,
  id: 'factualsummary0002',
  title: 'Synthetic Prints',
  type: 'exhibition',
  startDate: '2026-11-17',
  endDate: '2027-01-03',
  price: { type: 'open' },
};

describe('fixture preconditions', () => {
  test('fixtures carry every field the summary may use', () => {
    expect(concert.startDate).toContain('T21:30');
    expect(concert.venue.neighborhood).toBe('Mets');
    expect(concert.description).toBe('');
    expect(concert.fullDescription).toBeUndefined();
    expect(exhibition.endDate).toBeTruthy();
  });
});

describe('buildFactualSummary — complete fields', () => {
  test('Greek concert', () => {
    expect(buildFactualSummary(concert, 'el')).toBe(
      'Συναυλία «Synthetic Quartet» στον χώρο Fixture Hall (Μετς), Τρίτη 17 Νοεμβρίου στις 21:30. Είσοδος με εισιτήριο.',
    );
  });

  test('English concert', () => {
    expect(buildFactualSummary(concert, 'en')).toBe(
      'Concert “Synthetic Quartet” at Fixture Hall (Mets) on Tuesday 17 November 2026 at 21:30. Ticketed entry.',
    );
  });

  test('exhibition states its run from stored start and end dates', () => {
    expect(buildFactualSummary(exhibition, 'el')).toBe(
      'Έκθεση «Synthetic Prints» στον χώρο Fixture Hall (Μετς). Διάρκεια: Τρίτη 17 Νοεμβρίου έως Κυριακή 3 Ιανουαρίου. Ελεύθερη είσοδος.',
    );
    expect(buildFactualSummary(exhibition, 'en')).toBe(
      'Exhibition “Synthetic Prints” at Fixture Hall (Mets). Runs Tuesday 17 November 2026 to Sunday 3 January 2027. Open entry.',
    );
  });

  test('donation price category', () => {
    const e = { ...concert, price: { type: 'donation' as const } };
    expect(buildFactualSummary(e, 'el')).toEndWith('Είσοδος με ελεύθερη συνεισφορά.');
    expect(buildFactualSummary(e, 'en')).toEndWith('Entry by donation.');
  });
});

describe('buildFactualSummary — missing fields drop their clause', () => {
  test('no clock time: date only, no "at"', () => {
    const e = { ...concert, startDate: '2026-11-17' };
    expect(e.timeDoors).toBeUndefined();
    expect(buildFactualSummary(e, 'el')).toBe(
      'Συναυλία «Synthetic Quartet» στον χώρο Fixture Hall (Μετς), Τρίτη 17 Νοεμβρίου. Είσοδος με εισιτήριο.',
    );
    expect(buildFactualSummary(e, 'en')).toBe(
      'Concert “Synthetic Quartet” at Fixture Hall (Mets) on Tuesday 17 November 2026. Ticketed entry.',
    );
  });

  test('stored door time on a date-only row is the time the page shows', () => {
    const e = { ...concert, startDate: '2026-11-17', timeDoors: '20:30' };
    expect(buildFactualSummary(e, 'el')).toContain('Τρίτη 17 Νοεμβρίου στις 20:30.');
    expect(buildFactualSummary(e, 'en')).toContain('on Tuesday 17 November 2026 at 20:30.');
  });

  test('no neighbourhood: no parentheses', () => {
    const e = { ...concert, venue: { ...concert.venue, neighborhood: undefined } };
    expect(buildFactualSummary(e, 'el')).toBe(
      'Συναυλία «Synthetic Quartet» στον χώρο Fixture Hall, Τρίτη 17 Νοεμβρίου στις 21:30. Είσοδος με εισιτήριο.',
    );
    expect(buildFactualSummary(e, 'en')).not.toContain('(');
  });

  test('no venue name: no venue clause', () => {
    const e = { ...concert, venue: { name: '  ', address: '' } };
    const el = buildFactualSummary(e, 'el');
    const en = buildFactualSummary(e, 'en');
    expect(el).toBe('Συναυλία «Synthetic Quartet», Τρίτη 17 Νοεμβρίου στις 21:30. Είσοδος με εισιτήριο.');
    expect(en).toBe('Concert “Synthetic Quartet” on Tuesday 17 November 2026 at 21:30. Ticketed entry.');
  });

  test('unparseable date: no date clause, never "NaN"/"undefined"', () => {
    const e = { ...concert, startDate: 'to be announced' };
    for (const locale of ['el', 'en'] as const) {
      const s = buildFactualSummary(e, locale);
      expect(s).not.toMatch(/NaN|undefined|null/);
      expect(s).not.toContain('21:30');
    }
    expect(buildFactualSummary(e, 'en')).toBe('Concert “Synthetic Quartet” at Fixture Hall (Mets). Ticketed entry.');
  });

  test('unknown price category: no price sentence', () => {
    const e = { ...concert, price: { type: undefined as unknown as 'open' } };
    expect(buildFactualSummary(e, 'en')).toBe(
      'Concert “Synthetic Quartet” at Fixture Hall (Mets) on Tuesday 17 November 2026 at 21:30.',
    );
  });

  // Round-2 review: without a stated end the row's date can be one listed day
  // of a longer run, so it is not stated as the start either.
  test('exhibition with no end date states no dates — never "ongoing"', () => {
    const e = { ...exhibition, endDate: undefined };
    const el = buildFactualSummary(e, 'el');
    const en = buildFactualSummary(e, 'en');
    expect(el).not.toMatch(/Νοεμβρίου|έναρξης/);
    expect(en).not.toMatch(/November|Start date/);
    expect(el).not.toMatch(/Συνεχίζεται|έως/);
    expect(en).not.toMatch(/[Oo]ngoing|Runs| to /);
  });

  test('title is not double-quoted when it already carries quotes', () => {
    const e = { ...concert, title: '«Ήδη σε εισαγωγικά»' };
    expect(buildFactualSummary(e, 'el')).toStartWith('Συναυλία «Ήδη σε εισαγωγικά» στον χώρο');
  });

  test('multiple-venues placeholder is stated as such, not as a venue name', () => {
    const e = { ...concert, venue: { name: 'Πολλαπλοί Χώροι', address: '' } };
    expect(buildFactualSummary(e, 'el')).toContain('σε διάφορους χώρους,');
    expect(buildFactualSummary(e, 'en')).toContain('at multiple venues on');
  });
});

describe('buildFactualSummary — terminology and language', () => {
  const variants: Event[] = [
    concert,
    exhibition,
    { ...concert, price: { type: 'open' } },
    { ...concert, price: { type: 'donation' } },
  ];

  test('never says free/paid in either language', () => {
    for (const e of variants) {
      expect(buildFactualSummary(e, 'en')).not.toMatch(/\bfree\b|\bpaid\b/i);
      expect(buildFactualSummary(e, 'el')).not.toMatch(/δωρεάν|\bfree\b|\bpaid\b/i);
    }
  });

  test('Greek summary carries no English connective words; English carries no Greek', () => {
    for (const e of variants) {
      const el = buildFactualSummary(e, 'el').replace(e.title, '').replace(e.venue.name, '');
      const en = buildFactualSummary(e, 'en').replace(e.title, '').replace(e.venue.name, '');
      expect(el).not.toMatch(/[A-Za-z]{2,}/);
      expect(en).not.toMatch(/\p{Script=Greek}/u);
    }
  });

  test('every number in the summary comes from a stored date or time', () => {
    const s = buildFactualSummary(concert, 'en');
    const allowed = new Set(['17', '2026', '21', '30']);
    for (const n of s.match(/\d+/g) ?? []) expect(allowed.has(n)).toBe(true);
    // The stored €18 amount is not a price category and must not appear.
    expect(s).not.toContain('18');
  });
});
