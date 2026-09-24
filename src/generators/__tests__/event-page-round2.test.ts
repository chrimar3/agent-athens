/**
 * Quality-loop round 2 (builder B) — event-page moves 4 and 5, plus the
 * doorTime-equals-start JSON-LD omission requested by the lead.
 *
 * Synthetic fixtures only; each fixture asserts its own precondition so the
 * test fails loudly if the fixture ever stops exercising the rule.
 */
import { describe, test, expect } from 'bun:test';
import { renderEventDetailPage, buildEventSchemaObject } from '../event-page';
import { buildFactualSummary } from '../../utils/factual-summary';
import type { Event } from '../../types';

const DAY = 86400000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const ENGLISH_PROSE =
  'A long English description written by enrichment. It talks about the room, the sound and the crowd, and it is comfortably longer than one hundred characters.';

const bare: Event = {
  '@context': 'https://schema.org',
  '@type': 'MusicEvent',
  id: 'round2fixture0001',
  title: 'Synthetic Quartet',
  description: '',
  hasNativeGreek: false,
  startDate: `${isoDay(12)}T21:30:00`,
  type: 'concert',
  genres: [],
  tags: [],
  venue: { name: 'Fixture Hall', address: '', neighborhood: 'Mets' },
  price: { type: 'with-ticket' },
  url: '',
  source: 'fixture',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  language: 'el',
  ticketUrlResolved: null,
};

const englishOnly: Event = {
  ...bare,
  id: 'round2fixture0002',
  fullDescription: ENGLISH_PROSE,
  fullDescriptionEn: ENGLISH_PROSE,
};

function descriptionSection(html: string): string {
  const m = html.match(/<section class="edp-description[^"]*">([\s\S]*?)<\/section>/);
  if (!m) throw new Error('fixture page has no description section');
  return m[1];
}

function meta(html: string, attr: 'name' | 'property', key: string): string {
  const m = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`));
  if (!m) throw new Error(`no <meta ${attr}="${key}">`);
  return m[1];
}

describe('fixture preconditions', () => {
  test('bare fixture has no description of any kind', () => {
    expect(bare.description).toBe('');
    expect(bare.fullDescription).toBeUndefined();
    expect(bare.fullDescriptionEn).toBeUndefined();
    expect(bare.fullDescriptionGr).toBeUndefined();
  });
  test('englishOnly fixture has English prose and no Greek prose', () => {
    expect(englishOnly.fullDescriptionEn!.length).toBeGreaterThan(100);
    expect(englishOnly.fullDescriptionGr).toBeUndefined();
    expect(englishOnly.hasNativeGreek).toBe(false);
    expect(ENGLISH_PROSE).not.toMatch(/\p{Script=Greek}/u);
  });
});

// ── Move 4: factual summary where the description would be ──

describe('move 4 — pages with no description render a marked factual summary', () => {
  for (const locale of ['el', 'en'] as const) {
    test(`${locale}: summary text sits in the description section, marked as a summary`, () => {
      const section = descriptionSection(renderEventDetailPage(bare, [], locale));
      const summary = buildFactualSummary(bare, locale);
      expect(section).toContain('class="edp-fact-summary"');
      expect(section).toContain(locale === 'el' ? 'Σύνοψη από τα στοιχεία της καταχώρισης' : 'Summary from the listing details');
      expect(summary).not.toMatch(/[&<>"']/); // precondition: escaping leaves this text unchanged
      expect(section).toContain(summary);
      expect(section).not.toMatch(/<p>\s*<\/p>/);
      expect(section).not.toContain('AI-enriched content');
    });
  }

  test('summary text is escaped at emission', () => {
    const hostile = { ...bare, title: 'Quartet <script>alert(1)</script>' };
    const section = descriptionSection(renderEventDetailPage(hostile, [], 'el'));
    expect(section).not.toContain('<script>');
    expect(section).toContain('&lt;script&gt;');
  });

  test('a stored short description still renders as before — no summary', () => {
    const withShort = { ...bare, description: 'Short scraped blurb from the source.' };
    const section = descriptionSection(renderEventDetailPage(withShort, [], 'el'));
    expect(section).toContain('Short scraped blurb from the source.');
    expect(section).not.toContain('edp-fact-summary');
  });

  test('a full description renders as before — no summary', () => {
    const section = descriptionSection(renderEventDetailPage(englishOnly, [], 'en'));
    expect(section).toContain('A long English description');
    expect(section).not.toContain('edp-fact-summary');
  });
});

// ── Move 5: meta description language follows the page ──

describe('move 5 — meta description in the page language', () => {
  test('Greek page with English-only description gets the Greek summary as meta, og and twitter description', () => {
    const html = renderEventDetailPage(englishOnly, [], 'el');
    const expected = buildFactualSummary(englishOnly, 'el');
    expect(expected).toMatch(/\p{Script=Greek}/u);
    for (const [attr, key] of [['name', 'description'], ['property', 'og:description'], ['name', 'twitter:description']] as const) {
      const content = meta(html, attr, key);
      expect(content).toBe(expected);
      expect(content).not.toContain('A long English description');
      expect(content).not.toMatch(/Updated daily|Cultural events in/);
    }
  });

  test('Greek page with no description at all also gets the Greek summary', () => {
    const html = renderEventDetailPage(bare, [], 'el');
    expect(meta(html, 'name', 'description')).toBe(buildFactualSummary(bare, 'el'));
  });

  test('English page keeps an English meta description', () => {
    const html = renderEventDetailPage(englishOnly, [], 'en');
    const content = meta(html, 'name', 'description');
    expect(content).toContain('A long English description');
    expect(content).not.toMatch(/\p{Script=Greek}/u);
  });

  test('Greek meta description is capped for the SERP and cut on a word boundary', () => {
    const longTitle = { ...englishOnly, title: 'Μια πολύ μεγάλη συναυλία με τίτλο που δεν τελειώνει ποτέ και συνεχίζει να απαριθμεί ονόματα καλλιτεχνών ένα προς ένα χωρίς σταματημό' };
    expect(buildFactualSummary(longTitle, 'el').length).toBeGreaterThan(160);
    const content = meta(renderEventDetailPage(longTitle, [], 'el'), 'name', 'description');
    expect(content.length).toBeLessThanOrEqual(160);
    expect(content).toEndWith('…');
    expect(content).not.toMatch(/\s…$/);
  });

  test('native Greek description is not replaced by the summary', () => {
    const greekProse = 'Μια μεγάλη ελληνική περιγραφή για τη βραδιά, την αίθουσα και τον ήχο, αρκετά μεγάλη ώστε να ξεπερνά τους εκατό χαρακτήρες άνετα.';
    const native = { ...englishOnly, fullDescriptionGr: greekProse, hasNativeGreek: true };
    expect(greekProse.length).toBeGreaterThan(100);
    const content = meta(renderEventDetailPage(native, [], 'el'), 'name', 'description');
    expect(content).not.toBe(buildFactualSummary(native, 'el'));
  });
});

// ── Lead request: doorTime equal to the emitted startDate is omitted ──

describe('JSON-LD doorTime', () => {
  test('date-only start + stored door time: doorTime would equal startDate, so it is omitted', () => {
    const e = { ...bare, startDate: isoDay(12), timeDoors: '20:30' };
    const schema = buildEventSchemaObject(e, 'el');
    expect(schema.startDate).toContain('T20:30'); // precondition: door time became the start
    expect(schema.doorTime).toBeUndefined();
  });

  test('a door time different from the start is kept', () => {
    const e = { ...bare, startDate: `${isoDay(12)}T21:30:00`, timeDoors: '20:30' };
    const schema = buildEventSchemaObject(e, 'el');
    expect(schema.startDate).toContain('T21:30');
    expect(schema.doorTime).toContain('T20:30');
  });
});
