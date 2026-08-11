import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseCometogetherListing, cometogetherId } from '../scripts/scrape-cometogether';

const ROOT = resolve(import.meta.dir, '..');
const FIXTURE = readFileSync(join(ROOT, 'tests', 'fixtures', 'cometogether-listing.html'), 'utf8');
// Fixture captured 2026-08-11 from https://cometogether.live/el (server-rendered
// Next.js listing). refDate matches the capture date so year inference is stable.
const REF = new Date('2026-08-11T12:00:00Z');

describe('fixture preconditions (fail loudly on site redesign, never go vacuous)', () => {
  test('fixture contains /el/event/ links', () => {
    expect((FIXTURE.match(/\/el\/event\/\d+\//g) ?? []).length).toBeGreaterThan(5);
  });

  test('fixture contains the known Aretsou card with Greek date and price', () => {
    expect(FIXTURE).toContain('/el/event/6125/');
    expect(FIXTURE).toContain('Σαβ, 29 Αυγ');
    expect(FIXTURE).toContain('από €8');
    expect(FIXTURE).toContain('Ακτή Αρετσού');
  });
});

describe('parseCometogetherListing', () => {
  const events = parseCometogetherListing(FIXTURE, REF);

  test('extracts a healthy number of events', () => {
    expect(events.length).toBeGreaterThan(5);
  });

  test('every event has the required shape', () => {
    for (const e of events) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.url).toMatch(/^https:\/\/cometogether\.live\/el\/event\/\d+\//);
      expect(e.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.source).toBe('cometogether');
      expect(e.id).toMatch(/^[a-f0-9]{16}$/);
    }
  });

  test('the Aretsou card parses fully (date, price, venue)', () => {
    const e = events.find((x) => x.url.includes('/event/6125/'));
    expect(e).toBeDefined();
    expect(e!.start_date).toBe('2026-08-29'); // Σαβ, 29 Αυγ from an Aug refDate
    expect(e!.price_type).toBe('with-ticket');
    expect(e!.price_amount).toBe(8);
    expect(e!.venue_name).toBe('Ακτή Αρετσού'); // Thessaloniki — the location filter rejects it downstream, BY DESIGN
  });

  test('ids are stable across parses (production identity from the numeric event id)', () => {
    const again = parseCometogetherListing(FIXTURE, REF);
    const a = events.find((x) => x.url.includes('/event/6125/'))!;
    const b = again.find((x) => x.url.includes('/event/6125/'))!;
    expect(a.id).toBe(b.id);
  });

  test('id derives from the event id alone — date drift does not mint new rows (the athinorama lesson)', () => {
    expect(cometogetherId('6125')).toBe(cometogetherId('6125'));
    expect(cometogetherId('6125')).not.toBe(cometogetherId('6126'));
  });
});
