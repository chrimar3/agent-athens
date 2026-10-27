/**
 * ListingLoads — the "errors propagate" contract for sources that read
 * several listing pages (input-pipeline audit B1). A source whose every
 * listing page failed is a failed scrape (scrape_stats success=0 with the
 * cause), never an empty success; a partial failure stays best-effort.
 */

import { describe, test, expect } from 'bun:test';
import { ListingLoads, loadListing } from '../src/utils/listing-loads';

describe('ListingLoads', () => {
  test('every attempted listing failed → throws, naming the source, the count and the last cause', () => {
    const l = new ListingLoads('snfcc');
    l.failed('https://www.snfcc.org/event-category/moysiki/', new Error('net::ERR_BLOCKED_BY_CLIENT'));
    l.failed('https://www.snfcc.org/ekdiloseis/', new Error('could not resolve www.snfcc.org: getaddrinfo ESERVFAIL'));
    expect(() => l.assertAnyLoaded()).toThrow(/^snfcc: all 2 listing page\(s\) failed to load; last: https:\/\/www\.snfcc\.org\/ekdiloseis\/ — could not resolve www\.snfcc\.org: getaddrinfo ESERVFAIL/);
  });

  test('the message tells the retrier what to check', () => {
    const l = new ListingLoads('halfnote');
    l.failed('https://www.halfnote.gr/events/?ical=1', 'HTTP 503');
    expect(() => l.assertAnyLoaded()).toThrow(/docker\/aa-run\.sh doctor/);
  });

  test('one success among failures → no throw (partial failure is best-effort)', () => {
    const l = new ListingLoads('more');
    l.failed('https://www.more.com/gr-el/tickets/music/', 'HTTP 503');
    l.ok();
    expect(() => l.assertAnyLoaded()).not.toThrow();
    expect(l.failures).toHaveLength(1);
  });

  test('nothing attempted → no throw (the caller decides what an empty run means)', () => {
    expect(() => new ListingLoads('x').assertAnyLoaded()).not.toThrow();
  });
});

describe('loadListing — one navigation, judged by its HTTP status (review finding S235)', () => {
  const page = (answer: { status: number } | null | Error) => ({
    goto: async () => {
      if (answer instanceof Error) throw answer;
      return answer && { status: () => answer.status, ok: () => answer.status >= 200 && answer.status < 300 };
    },
  });

  test('a 2xx page counts as loaded', async () => {
    const l = new ListingLoads('snfcc');
    expect(await loadListing(page({ status: 200 }) as any, 'https://x/a', l)).toBe(true);
    expect(() => l.assertAnyLoaded()).not.toThrow();
  });

  test('a 403 challenge page or a 503 is a failed load, not a quiet day', async () => {
    const l = new ListingLoads('snfcc');
    expect(await loadListing(page({ status: 403 }) as any, 'https://x/a', l)).toBe(false);
    expect(await loadListing(page({ status: 503 }) as any, 'https://x/b', l)).toBe(false);
    expect(() => l.assertAnyLoaded()).toThrow(/HTTP 503/);
  });

  test('a blocked navigation (guard refusal) is a failed load carrying the error', async () => {
    const l = new ListingLoads('onassis');
    expect(await loadListing(page(new Error('net::ERR_BLOCKED_BY_CLIENT')) as any, 'https://x/a', l)).toBe(false);
    expect(() => l.assertAnyLoaded()).toThrow(/ERR_BLOCKED_BY_CLIENT/);
  });

  test('no response at all (same-document navigation) is a failed load', async () => {
    const l = new ListingLoads('benaki');
    expect(await loadListing(page(null) as any, 'https://x/a', l)).toBe(false);
  });
});

// The browser scrapers cannot run under `bun test` (Chrome): pin that every
// listing navigation goes through loadListing and that the run asserts, with
// comments stripped so a commented-out call does not count. That the throw is
// not swallowed by an outer catch was verified end to end with a DNS-failure
// preload (S235); it is not pinned here.
describe('browser scrapers wire loadListing', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const code = (f: string) => (readFileSync(join(import.meta.dir, '..', 'scripts', f), 'utf-8') as string)
    .split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
  for (const f of ['scrape-snfcc.ts', 'scrape-onassis.ts', 'scrape-benaki.ts']) {
    test(`${f}: listing navigations use loadListing, and the run asserts one loaded`, () => {
      const src = code(f);
      expect(src).toMatch(/new ListingLoads\((SOURCE_ID|'snfcc')\)/);
      expect(src).toMatch(/await loadListing\(page, /);
      expect(src).toMatch(/^\s*loads\.assertAnyLoaded\(\);/m);
      // listing pages are not navigated around the helper (pagination page 2 may still use page.goto)
      const listingGotos = (src.match(/page\.goto\((url|'https:\/\/www\.snfcc\.org\/ekdiloseis\/')/g) ?? []).length;
      expect(listingGotos).toBe(0);
    });
  }
});

// Tier-1 "never fabricate" (S164; audit B5): from 2026-02-10 benaki reported
// exactly 4 events on 238 runs because, when its page yielded nothing, it
// pushed four hard-coded exhibitions. A constant fabricated yield defeats
// every yield monitor. An empty parse must return [] and say so.
describe('scrape-benaki never injects placeholder exhibitions', () => {
  const src: string = require('fs').readFileSync(require('path').join(import.meta.dir, '..', 'scripts', 'scrape-benaki.ts'), 'utf-8');
  test('no hard-coded exhibition titles or "known exhibitions" fallback', () => {
    for (const marker of ['known exhibitions', 'Grand Tour', 'N.I.M.A.', 'Ακριθάκης', 'Συλλογή ΜΙΕΤ']) {
      expect({ marker, present: src.includes(marker) }).toEqual({ marker, present: false });
    }
  });
});
