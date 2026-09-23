import { describe, test, expect, afterEach } from 'bun:test';
import {
  getPullQuotes,
  getFeaturedVignette,
  getSectionEditorial,
  _setEditorialContentForTests,
} from '../editorial-content';

// Behaviour tests use synthetic content: the real config/editorial-content.json
// holds only "[PLACEHOLDER] …" seed copy, which earlier tests pinned as
// expected output — and which judges then found live on six hubs.
const content = {
  pullQuotes: [
    { textEl: 'Η Αθήνα ζει τη νύχτα.', textEn: 'Athens lives at night.', hubs: ['concerts'], season: null },
    { textEl: '[PLACEHOLDER] ελληνικό', textEn: '[PLACEHOLDER] english', hubs: ['concerts'], season: null },
  ],
  featuredEvents: {
    EVT_ALWAYS: { vignetteEl: 'Μια βραδιά που αξίζει.', vignetteEn: 'A night worth remembering.' },
    EVT_WINDOW: { vignetteEl: 'Παράθυρο.', vignetteEn: 'Window.', validFrom: '2026-05-22', validUntil: '2026-05-28', rank: 1 },
    EVT_SEED: { vignetteEl: '[PLACEHOLDER — replace with editorial]', vignetteEn: '[PLACEHOLDER — replace with editorial]' },
  },
  sectionEditorials: {
    concerts: { textEl: 'Από το ρεμπέτικο στο jazz.', textEn: 'From rebetiko to jazz.' },
    theatre: { textEl: '[PLACEHOLDER] θέατρο', textEn: '[PLACEHOLDER] theatre' },
  },
};

afterEach(() => _setEditorialContentForTests(null));

describe('getPullQuotes', () => {
  test('matching hub returns its real quotes in the requested locale', () => {
    _setEditorialContentForTests(content);
    expect(getPullQuotes('concerts', 'el')).toEqual(['Η Αθήνα ζει τη νύχτα.']);
    expect(getPullQuotes('concerts', 'en')).toEqual(['Athens lives at night.']);
  });

  test('non-matching hub returns empty array', () => {
    _setEditorialContentForTests(content);
    expect(getPullQuotes('nonexistent', 'el')).toEqual([]);
  });
});

describe('getFeaturedVignette', () => {
  test('known event returns the locale text', () => {
    _setEditorialContentForTests(content);
    expect(getFeaturedVignette('EVT_ALWAYS', 'el')).toBe('Μια βραδιά που αξίζει.');
    expect(getFeaturedVignette('EVT_ALWAYS', 'en')).toBe('A night worth remembering.');
  });

  test('unknown event returns null', () => {
    _setEditorialContentForTests(content);
    expect(getFeaturedVignette('nope', 'el')).toBeNull();
  });

  test('entries without a window ignore currentDate', () => {
    _setEditorialContentForTests(content);
    expect(getFeaturedVignette('EVT_ALWAYS', 'el', '2099-01-01')).not.toBeNull();
  });

  test('date window is inclusive at both ends and excludes outside dates', () => {
    _setEditorialContentForTests(content);
    expect(getFeaturedVignette('EVT_WINDOW', 'el', '2026-05-21')).toBeNull();
    expect(getFeaturedVignette('EVT_WINDOW', 'el', '2026-05-22')).toBe('Παράθυρο.');
    expect(getFeaturedVignette('EVT_WINDOW', 'el', '2026-05-28')).toBe('Παράθυρο.');
    expect(getFeaturedVignette('EVT_WINDOW', 'el', '2026-05-29')).toBeNull();
  });
});

describe('getSectionEditorial', () => {
  test('known hub returns the locale text', () => {
    _setEditorialContentForTests(content);
    expect(getSectionEditorial('concerts', 'el')).toBe('Από το ρεμπέτικο στο jazz.');
    expect(getSectionEditorial('concerts', 'en')).toBe('From rebetiko to jazz.');
  });

  test('unknown hub returns null', () => {
    _setEditorialContentForTests(content);
    expect(getSectionEditorial('nonexistent', 'en')).toBeNull();
  });
});

describe('placeholder seed copy is never published', () => {
  test('synthetic placeholders are filtered from every getter', () => {
    _setEditorialContentForTests(content);
    expect(getPullQuotes('concerts', 'en').some(t => t.includes('PLACEHOLDER'))).toBe(false);
    expect(getFeaturedVignette('EVT_SEED', 'el')).toBeNull();
    expect(getSectionEditorial('theatre', 'el')).toBeNull();
  });

  test('the real config yields no placeholder text through any getter', () => {
    const real = require('../../../config/editorial-content.json');
    const all = JSON.stringify(real);
    expect(all).toContain('[PLACEHOLDER'); // precondition: the seed copy is still there
    const hubs = new Set<string>([...real.pullQuotes.flatMap((q: any) => q.hubs), ...Object.keys(real.sectionEditorials)]);
    for (const locale of ['el', 'en'] as const) {
      for (const hub of hubs) {
        for (const t of getPullQuotes(hub, locale)) expect(t).not.toContain('PLACEHOLDER');
        expect(getSectionEditorial(hub, locale) ?? '').not.toContain('PLACEHOLDER');
      }
      for (const id of Object.keys(real.featuredEvents)) {
        expect(getFeaturedVignette(id, locale, real.featuredEvents[id].validFrom) ?? '').not.toContain('PLACEHOLDER');
      }
    }
  });
});
