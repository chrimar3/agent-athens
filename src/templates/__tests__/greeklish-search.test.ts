/**
 * Round-2 move 8 — accent-insensitive and Greeklish search.
 *
 * "kyttaro" must find Κύτταρο, "mousiki" must find μουσική, and the Greek
 * accent-insensitive path ("κυτταρο" → Κύτταρο) must keep working. The index
 * carries a Latin key (…L) built at generation time from the shared
 * transliterateGreekId helper; the page folds a Latin query with the SAME
 * shipped function string, so build and client cannot drift.
 *
 * Fixtures are synthetic events written through the real generator into a
 * temp dir, and searched with the real Fuse build the page imports.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Fuse from 'fuse.js';
import { generateSearchIndex, greeklishKey } from '../../generators/search-index';
import { normalizeGreek } from '../../utils/normalize-greek';
import {
  greeklishFold,
  GREEKLISH_SEARCH_JS,
  RANK_EVENTS_JS,
  renderSearchScript,
} from '../search-overlay';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

// The page embeds greeklishFold's own source text. Evaluating that text in
// isolation (our module's source, no external input) proves the shipped copy
// is self-contained and behaves like the imported function the build uses.
const GREEKLISH_FOLD_JS = greeklishFold.toString();
const shippedFold: (s: string) => string = new Function(`${GREEKLISH_FOLD_JS}; return greeklishFold;`)();
const { withGreeklish, rankEvents } = new Function(
  `${GREEKLISH_FOLD_JS}; ${GREEKLISH_SEARCH_JS}; ${RANK_EVENTS_JS}; return { withGreeklish: withGreeklish, rankEvents: rankEvents };`,
)() as {
  withGreeklish: (primary: Fuse<any>, latin: Fuse<any>) => { search: (q: string) => Array<{ item: any; score: number; refIndex: number }> };
  rankEvents: (r: any[]) => any[];
};

/** The page's own query normalization (search-overlay.ts `norm`). */
const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const ev = (id: string, title: string, venue: string, offset: number): Event => ({
  ...sampleConcert,
  id,
  title,
  startDate: `${day(offset)}T21:00:00+03:00`,
  endDate: undefined as unknown as string,
  venue: { ...sampleConcert.venue, name: venue, neighborhood: 'Γκάζι' },
});

const EVENTS: Event[] = [
  ev('kyttaro-gig', 'PHANTOM SPELL', 'Κύτταρο', 3),
  ev('mousiki', 'Ηλεκτρονική Μουσική στην Ταράτσα', 'Six D.O.G.S', 4),
  ev('athina', 'Βόλτα στην Αθήνα', 'Πλατεία Συντάγματος', 5),
  ev('athens-en', 'Athens Jazz Night', 'Half Note Jazz Club', 6),
  ev('decoy', 'Techno Marathon', 'Bios', 2),
];

let OUT: string;
let index: any;
let events: ReturnType<typeof withGreeklish>;

function eventSearcher(records: any[]) {
  return withGreeklish(
    new Fuse(records, { keys: [{ name: 'titleN', weight: 2 }, { name: 'venueN', weight: 1 }, { name: 'neighborhoodN', weight: 0.5 }], threshold: 0.3, includeScore: true }),
    new Fuse(records, { keys: [{ name: 'titleL', weight: 2 }, { name: 'venueL', weight: 1 }], threshold: 0.3, includeScore: true }),
  );
}
const ids = (q: string) => rankEvents(events.search(norm(q))).map((r: any) => r.item.id);

beforeAll(() => {
  OUT = mkdtempSync(join(tmpdir(), 'greeklish-search-'));
  generateSearchIndex(EVENTS, OUT);
  index = JSON.parse(readFileSync(join(OUT, 'search-index.json'), 'utf-8'));
  events = eventSearcher(index.events);
});
afterAll(() => rmSync(OUT, { recursive: true, force: true }));

describe('fixture preconditions', () => {
  test('Greek titles/venues carry accents; the decoy matches none of the queries', () => {
    expect(EVENTS.find(e => e.id === 'kyttaro-gig')!.venue.name).toBe('Κύτταρο');
    expect(/ύ/.test('Κύτταρο') && /ή/.test('Μουσική')).toBe(true);
    expect(index.events.length).toBe(EVENTS.length);
  });
});

describe('greeklishFold', () => {
  test('transliterated Greek and typed Greeklish meet on one key', () => {
    expect(greeklishKey('Κύτταρο')).toBe(greeklishFold('kyttaro'));
    expect(greeklishKey('Κύτταρο')).toBe(greeklishFold('kittaro'));
    expect(greeklishKey('μουσική')).toBe(greeklishFold('mousiki'));
    expect(greeklishKey('μουσική')).toBe(greeklishFold('musiki'));
    expect(greeklishKey('Αθήνα')).toBe(greeklishFold('athina'));
    expect(greeklishKey('Ντόρα Μπακογιάννη')).toBe(greeklishFold('Dora Bakogianni'));
  });

  test('the shipped source text folds exactly like the build-side function', () => {
    for (const q of ['kyttaro', 'Mousiki', 'Ntora Mpakogianni', 'Clubs & Ηλεκτρονική', 'khoros ksenia philippos oi ai w']) {
      expect(shippedFold(q)).toBe(greeklishFold(q));
    }
  });

  test('is idempotent and strips punctuation to single spaces', () => {
    const once = greeklishFold('Clubs & Ηλεκτρονική — «Live»');
    expect(greeklishFold(once)).toBe(once);
    expect(once).not.toMatch(/\s{2}|^\s|\s$/);
  });
});

describe('search index Latin keys', () => {
  test('Greek text gets a Latin key; Latin-only text does not (index size)', () => {
    const byId = Object.fromEntries(index.events.map((e: any) => [e.id, e]));
    expect(byId['kyttaro-gig'].venueL).toBe(greeklishKey('Κύτταρο'));
    expect(byId['mousiki'].titleL).toBe(greeklishKey('Ηλεκτρονική Μουσική στην Ταράτσα'));
    expect(byId['kyttaro-gig'].titleL).toBeUndefined();
    expect(byId['athens-en'].titleL).toBeUndefined();
    expect(byId['athens-en'].venueL).toBeUndefined();
  });

  test('categories with Greek titles get a Latin key', () => {
    const greekCats = index.categories.filter((c: any) => /[\u0370-\u03ff]/.test(c.title));
    expect(greekCats.length).toBeGreaterThan(0); // precondition: live config still has Greek titles
    for (const c of greekCats) expect(c.titleL).toBe(greeklishKey(c.title));
  });
});

describe('Greeklish and accent-insensitive queries', () => {
  test('"kyttaro" (and "kittaro") find the Κύτταρο event first', () => {
    expect(ids('kyttaro')[0]).toBe('kyttaro-gig');
    expect(ids('kittaro')[0]).toBe('kyttaro-gig');
  });

  test('"mousiki" finds the μουσική event first', () => {
    expect(ids('mousiki')[0]).toBe('mousiki');
  });

  test('"κυτταρο" without accent still finds Κύτταρο (existing Greek path)', () => {
    expect(ids('κυτταρο')[0]).toBe('kyttaro-gig');
  });

  test('"athina" finds Αθήνα; "athens" still finds the English title', () => {
    expect(ids('athina')[0]).toBe('athina');
    expect(ids('athens')[0]).toBe('athens-en');
  });

  test('a Greeklish query does not match unrelated events', () => {
    expect(ids('kyttaro')).not.toContain('decoy');
    expect(ids('mousiki')).not.toContain('decoy');
  });

  test('an English query returns exactly what the Greek-only searcher returned', () => {
    const plain = new Fuse(index.events, { keys: [{ name: 'titleN', weight: 2 }, { name: 'venueN', weight: 1 }, { name: 'neighborhoodN', weight: 0.5 }], threshold: 0.3, includeScore: true });
    const before = rankEvents(plain.search('techno')).map((r: any) => r.item.id);
    expect(before).toEqual(['decoy']); // precondition
    expect(ids('techno')).toEqual(before);
  });

  test('a query containing Greek letters is searched exactly as before (no Latin widening)', () => {
    const plain = new Fuse<any>(index.events, { keys: [{ name: 'titleN', weight: 2 }, { name: 'venueN', weight: 1 }, { name: 'neighborhoodN', weight: 0.5 }], threshold: 0.3, includeScore: true });
    const q = norm('mousiki Αθήνα');
    // Precondition: the folded query WOULD match a record through the Latin keys.
    const latin = new Fuse<any>(index.events, { keys: [{ name: 'titleL', weight: 2 }, { name: 'venueL', weight: 1 }], threshold: 0.3, includeScore: true });
    expect(latin.search(greeklishFold(q)).map(r => r.item.id)).toContain('mousiki');
    expect(events.search(q).map(r => r.item.id)).toEqual(plain.search(q).map(r => r.item.id));
  });

  test('a record matched on both paths appears once, with the better score', () => {
    const recs = [{ id: 'both', titleN: normalizeGreek('Jazz Σπίτι στην Αθήνα'), titleL: greeklishKey('Jazz Σπίτι στην Αθήνα') }];
    const opts = (name: string) => ({ keys: [{ name, weight: 2 }], threshold: 0.3, includeScore: true });
    const primary = new Fuse(recs, opts('titleN'));
    const latin = new Fuse(recs, opts('titleL'));
    const q = 'jazzz'; // typo: weak on the N key, exact once folded
    const [p] = primary.search(q);
    const [l] = latin.search(greeklishFold(q));
    // Precondition: both paths match, with different scores.
    expect(p && l).toBeTruthy();
    expect(p.score).not.toBe(l.score);
    const merged = withGreeklish(primary, latin).search(q);
    expect(merged.length).toBe(1);
    expect(merged[0].score).toBe(Math.min(p.score!, l.score!));
  });

  test('venue and category searchers use the same Latin path', () => {
    const venues = [{ name: 'Κύτταρο', nameN: 'κυτταρο', nameL: greeklishKey('Κύτταρο'), slug: 'kyttaro' }, { name: 'Bios', nameN: 'bios', slug: 'bios' }];
    const v = withGreeklish(
      new Fuse(venues, { keys: [{ name: 'nameN', weight: 2 }], threshold: 0.3, includeScore: true }),
      new Fuse(venues, { keys: [{ name: 'nameL', weight: 2 }], threshold: 0.3, includeScore: true }),
    );
    expect(v.search('kyttaro').map(r => r.item.slug)).toEqual(['kyttaro']);
    const c = withGreeklish(
      new Fuse(index.categories, { keys: [{ name: 'titleN', weight: 1.5 }], threshold: 0.3, includeScore: true }),
      new Fuse(index.categories, { keys: [{ name: 'titleL', weight: 1.5 }], threshold: 0.3, includeScore: true }),
    );
    expect(c.search('mousiki').length).toBeGreaterThan(0);
  });
});

describe('the shipped script', () => {
  test('embeds the fold and the merge, and wires Latin keys for all three groups', () => {
    const script = renderSearchScript('el');
    expect(script).toContain(GREEKLISH_FOLD_JS);
    expect(script).toContain(GREEKLISH_SEARCH_JS);
    for (const key of ["'titleL'", "'venueL'", "'nameL'"]) expect(script).toContain(key);
    // Round-1 ranking call site is unchanged.
    expect(script).toContain('var eventResults = rankEvents(fuseEvents.search(q));');
  });
});
