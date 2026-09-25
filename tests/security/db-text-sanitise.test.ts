/**
 * Defence in depth at the DB write boundary: scraped display text (title,
 * venue name, price range) is stored without '<' and '>', and a type value
 * that is not a slug reads back as 'other'. Output escaping stays the primary
 * defence (tests/security/hostile-site-crawl.test.ts); this pins the second
 * layer for every write seam — upsertEvent/updateEvent via eventToRow, and the
 * three scraper batch INSERTs that bind stripMarkupChars directly.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { eventToRow, rowToEvent, safeEventTypeSlug, stripMarkupChars, upsertEvent } from '../../src/db/database';
import { createTestDB } from '../helpers/db-helpers';
import { sampleConcert } from '../fixtures/events';
import type { Event } from '../../src/types';

const ROOT = join(import.meta.dir, '../..');

describe('stripMarkupChars', () => {
  test('removes angle brackets and keeps every other character', () => {
    expect(stripMarkupChars('Jazz <script>x()</script> & "Friends" · €10–€20')).toBe('Jazz scriptx()/script & "Friends" · €10–€20');
    expect(stripMarkupChars('«Κάρολος Κουν»')).toBe('«Κάρολος Κουν»');
  });
  test('passes null and undefined through', () => {
    expect(stripMarkupChars(null)).toBeNull();
    expect(stripMarkupChars(undefined)).toBeUndefined();
  });
});

describe('eventToRow strips markup from title, venue name and price range', () => {
  const hostile: Event = {
    ...sampleConcert,
    title: 'Night <img src=x onerror=alert(1)>',
    venue: { ...sampleConcert.venue, name: 'Club "<b>X</b>"' },
    price: { ...sampleConcert.price, range: '€10 <iframe src=//evil>' },
  };
  test('row values carry no < or >', () => {
    const row = eventToRow(hostile);
    expect(row.$title).toBe('Night img src=x onerror=alert(1)');
    expect(row.$venue_name).toBe('Club "bX/b"');
    expect(row.$price_range).toBe('€10 iframe src=//evil');
  });
  test('entity-encoded markup is decoded by upsertEvent and then stripped', () => {
    const db = createTestDB();
    const ev: Event = { ...sampleConcert, id: 'enc-1', title: 'Jazz &lt;script&gt;x()&lt;/script&gt;', venue: { ...sampleConcert.venue, name: 'Gazarte' } };
    expect(upsertEvent(ev, db).success).toBe(true);
    const row = db.prepare('SELECT title FROM events WHERE id = ?').get('enc-1') as { title: string };
    expect(row.title).toBe('Jazz scriptx()/script');
    db.close();
  });
  test('a clean event is unchanged', () => {
    const row = eventToRow(sampleConcert);
    expect([row.$title, row.$venue_name, row.$price_range]).toEqual([sampleConcert.title, sampleConcert.venue.name, sampleConcert.price.range]);
  });
});

describe('type reads back as a slug', () => {
  test('non-slug types become other; slugs pass', () => {
    expect(safeEventTypeSlug('concert')).toBe('concert');
    expect(safeEventTypeSlug('dj_set')).toBe('dj_set');
    expect(safeEventTypeSlug('concert" onfocus="x')).toBe('other');
    expect(safeEventTypeSlug('<x>')).toBe('other');
    expect(safeEventTypeSlug(null)).toBe('other');
  });
  test('rowToEvent applies it', () => {
    const row = { ...Object.fromEntries(Object.entries(eventToRow(sampleConcert)).map(([k, v]) => [k.slice(1), v])), type: 'concert"><x>' };
    expect(rowToEvent(row).type).toBe('other');
  });
});

describe('scraper batch INSERTs bind the stripped values', () => {
  for (const [file, fields] of [
    ['scripts/scrape-all.ts', ['title', 'venue_name', 'price_range']],
    ['scripts/scrape-snfcc.ts', ['title', 'venue_name', 'price_range']],
    ['scripts/scrape-ai-tech.ts', ['title', 'venue_name']],
  ] as const) {
    test(file, () => {
      const src = readFileSync(join(ROOT, file), 'utf-8');
      for (const f of fields) expect({ f, bound: new RegExp(`\\$${f}: stripMarkupChars\\(e\\.`).test(src) }).toEqual({ f, bound: true });
    });
  }
});
