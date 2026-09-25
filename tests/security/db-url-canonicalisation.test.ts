/**
 * The DB write layer stores url and image_url only as canonical http(s)
 * URLs. A bad URL drops that field; the row itself is still written.
 */
import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eventToRow, rowToEvent, updateEventImage } from '../../src/db/database';
import { sampleConcert } from '../fixtures/events';
import type { Event } from '../../src/types';

const ev = (over: Partial<Event>): Event => ({ ...sampleConcert, ...over } as Event);

describe('eventToRow canonicalises URL columns', () => {
  test('valid URLs are stored in canonical form', () => {
    const row = eventToRow(ev({ url: '  HTTPS://WWW.Viva.gr/tickets/x?a=1&amp;b=2 ', imageUrl: 'https://cdn.example.com/a b.jpg'.replaceAll(' ', '%20') }));
    expect(row.$url).toBe('https://www.viva.gr/tickets/x?a=1&b=2');
    expect(row.$image_url).toBe('https://cdn.example.com/a%20b.jpg');
  });

  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://www.viva.gr/x"onfocus=alert(1)', 'https://u:p@viva.gr/', '/relative/path', 'not a url']) {
    test(`bad URL ${JSON.stringify(bad)} drops the field, keeps the row`, () => {
      const row = eventToRow(ev({ url: bad, imageUrl: bad }));
      expect(row.$url).toBeNull();
      expect(row.$image_url).toBeNull();
      expect(row.$id).toBe(sampleConcert.id);
      expect(row.$title).toBe(sampleConcert.title);
    });
  }
});

describe('updateEventImage canonicalises image_url', () => {
  const db = () => {
    const d = new Database(':memory:');
    d.exec('CREATE TABLE events (id TEXT PRIMARY KEY, image_url TEXT, image_source TEXT, updated_at TEXT)');
    d.prepare("INSERT INTO events (id) VALUES ('e1')").run();
    return d;
  };
  test('hostile image URL is stored as NULL, valid one canonically', () => {
    const d = db();
    expect(updateEventImage('e1', 'javascript:alert(1)', 'backfill', d)).toBe(true);
    expect((d.prepare("SELECT image_url FROM events WHERE id='e1'").get() as any).image_url).toBeNull();
    updateEventImage('e1', 'HTTPS://Img.Example.com/a.jpg', 'backfill', d);
    expect((d.prepare("SELECT image_url FROM events WHERE id='e1'").get() as any).image_url).toBe('https://img.example.com/a.jpg');
  });
});

describe('rowToEvent reads coordinates as finite numbers only', () => {
  test('non-numeric coordinates are dropped', () => {
    const base: any = Object.fromEntries(Object.entries(eventToRow(sampleConcert)).map(([k, v]) => [k.slice(1), v]));
    const plain = { ...base, venue_lat: '37.9"><x', venue_lng: '23.7' };
    expect(rowToEvent(plain).venue.coordinates).toBeUndefined();
    const ok = { ...base, venue_lat: 37.96, venue_lng: 23.74 };
    expect(rowToEvent(ok).venue.coordinates).toEqual({ lat: 37.96, lon: 23.74 });
  });
});
