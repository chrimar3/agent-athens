import { afterEach, describe, expect, test, setSystemTime } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runInNewContext } from 'vm';
import { Database } from 'bun:sqlite';
import { load } from 'cheerio';
import { sampleConcert } from './fixtures/events';
import { renderEventDetailPage } from '../src/generators/event-page';
import { renderContentPage } from '../src/templates/content-page';
import { renderEventCard } from '../src/templates/page';
import { renderEventCardList, renderFeatureCard } from '../src/templates/card-variants';
const { default: redirect } = await import('../netlify/functions/' + 'go.ts');
import { renderSavedEventsScript } from '../src/templates/action-bar';
import { generateIcs, buildGCalUrl, parseIsoLocal } from '../src/utils/calendar-times';
import { buildDataFeed, writeDataFeed } from '../src/generators/datafeed';
import { generateSearchIndex } from '../src/generators/search-index';
import { getEnrichmentStats, getDatabaseSummary, getQualityStats, getSchemaValidationStats } from '../scripts/health-check';

const dirs: string[] = [];
function temp() { const dir = mkdtempSync(join(tmpdir(), 'aa-improvements-')); dirs.push(dir); return dir; }
afterEach(() => { setSystemTime(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('untrusted content stays data', () => {
  test('event JSON-LD cannot close its script element', () => {
    const title = 'Music </script><script data-injected>alert(1)</script><!--';
    const html = renderEventDetailPage({ ...sampleConcert, title, startDate: '2099-01-01', endDate: undefined }, []);
    const $ = load(html);
    expect($('script[data-injected]').length).toBe(0);
    const schemas = $('script[type="application/ld+json"]').toArray().map(el => JSON.parse($(el).text()));
    expect(JSON.stringify(schemas)).toContain(title);
  });
  test('content-page caller supplied schema stays inside JSON-LD', () => {
    const schema = { name: '</script><script data-injected>bad()</script>' };
    const $ = load(renderContentPage('test', 'Test', '', { schemaJson: JSON.stringify(schema) }));
    expect($('script[data-injected]').length).toBe(0);
    expect(JSON.parse($('script[type="application/ld+json"]').text())).toEqual(schema);
  });
  test('scraped descriptions cannot introduce executable HTML', () => {
    const description = 'Music <img src=x onerror="bad()"><script data-injected>bad()</script>';
    const event = { ...sampleConcert, startDate: '2099-01-01', endDate: undefined, description, fullDescription: description, fullDescriptionEn: description };
    const $ = load(renderEventDetailPage(event, [], 'en'));
    expect($('.edp-description script, .edp-description img[onerror]').length).toBe(0);
    expect($('.edp-description').text()).toContain(description);
  });
  test('all card variants render event titles as text', () => {
    const title = '<script data-injected>bad()</script> & "Music"';
    const event = { ...sampleConcert, title };
    for (const render of [renderEventCard, renderEventCardList, renderFeatureCard]) {
      const $ = load(render(event));
      expect($('script[data-injected]').length).toBe(0);
      expect($('.card-title').text()).toBe(title);
    }
  });
  for (const destination of ['https://more.com.evil.test/pay', 'https://evilmore.com/pay', 'ftp://more.com/pay', 'https://user:password@more.com/pay']) {
    test(`ticket redirect rejects ${destination}`, async () => {
      const request = new Request('https://agentathens.com/go/event?url=' + encodeURIComponent(destination));
      expect((await redirect(request, {} as any)).status).toBe(403);
    });
  }
  test('legitimate ticket links preserve encoded query values and are never cached', async () => {
    const destination = 'https://www.more.com/tickets?return=%2Fmy%3Fseat%3D1&offer=50%25';
    const response = await redirect(new Request('https://agentathens.com/go/event?url=' + encodeURIComponent(destination)), {});
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(destination);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('saved events survive damaged or unavailable storage', () => {
  function saved(raw: string, blocked = false) {
    let value = raw;
    const window: any = { addEventListener() {} };
    runInNewContext(renderSavedEventsScript().replace(/^<script>|<\/script>$/g, ''), {
      window, localStorage: { getItem: () => value, setItem: (_: string, next: string) => { if (blocked) throw Error('quota'); value = next; } },
      document: { dispatchEvent() {}, addEventListener() {}, querySelectorAll: () => [] },
      CustomEvent: class {},
    });
    return window.__aaSaved;
  }
  test('non-array JSON cannot break every save button', () => {
    expect(saved('null').get()).toEqual([]);
    expect(saved('{}').isSaved('x')).toBe(false);
    expect(saved('[null,42,{"eventId":"bad"}]').get()).toEqual([]);
  });
  test('storage-denied sessions can still toggle a save', () => {
    const api = saved('[]', true);
    api.save({ eventId: 'one', slug: 'music', title: 'Music' });
    expect(api.isSaved('one')).toBe(true);
    api.unsave('one');
    expect(api.count()).toBe(0);
  });
  test('legacy slugs normalize idempotently and invalid records cannot crowd out real saves', () => {
    const api = saved(JSON.stringify([
      { eventId: 'one', slug: '/en/events/music/', title: 'Music' },
      { eventId: 'one', slug: '/events/music/', title: 'Duplicate' },
      { eventId: 'two', slug: '../private', title: 'Invalid' },
    ]));
    expect(api.get().map((e: any) => e.slug)).toEqual(['music']);
    expect(api.get().map((e: any) => e.slug)).toEqual(['music']);
  });
});

describe('calendar files preserve dates and UTF-8', () => {
  test('invalid calendar dates do not leave empty action links on the event page', () => {
    const html = renderEventDetailPage({ ...sampleConcert, startDate: '2099-01-01', endDate: '2098-12-31' }, []);
    expect(load(html)('.cal-disclosure').length).toBe(0);
  });
  test('date-only exhibitions include the closing day without an invented showtime', () => {
    const event = { ...sampleConcert, type: 'exhibition' as const, startDate: '2026-09-01', endDate: '2026-09-30', timePeak: undefined };
    const ics = generateIcs(event, 'https://agentathens.com/events/art/');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260901');
    expect(ics).toContain('DTEND;VALUE=DATE:20261001');
    expect(ics).not.toContain('235900');
  });
  test('every folded line fits 75 octets, including continuation space', () => {
    const ics = generateIcs({ ...sampleConcert, title: 'Αθήνα🎵'.repeat(60) }, 'https://agentathens.com/events/music/');
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, '')).toContain('SUMMARY:' + 'Αθήνα🎵'.repeat(60));
  });
  test('CRLF in text cannot inject a second calendar component', () => {
    const ics = generateIcs({ ...sampleConcert, title: 'Music\r\nBEGIN:VEVENT\rX-FAKE:1' }, 'https://agentathens.com/events/music/');
    expect(ics.split('\r\n').filter(line => line === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(ics.replaceAll('\r\n', '')).not.toContain('\r');
  });
  test('minute precision works; impossible dates are rejected', () => {
    expect(parseIsoLocal('2026-09-18T20:30')?.Mi).toBe(30);
    expect(parseIsoLocal('2026-02-30')).toBeNull();
    expect(parseIsoLocal('2026-09-18T25:00:00')).toBeNull();
  });
  test('Athens time at the DST boundary is independent of the build host', () => {
    const url = new URL(buildGCalUrl({ ...sampleConcert, startDate: '2026-03-29T02:30:00', endDate: undefined, timePeak: undefined }, 'https://agentathens.com/events/music/'));
    expect(url.searchParams.get('dates')?.split('/')[0]).toBe('20260329T003000Z');
  });
});

test('unchanged DataFeed preserves both freshness timestamps and file bytes', () => {
  const path = join(temp(), 'events.json');
  setSystemTime(new Date('2026-09-18T10:00:00Z'));
  writeDataFeed(buildDataFeed([sampleConcert]), path);
  const before = readFileSync(path, 'utf8');
  setSystemTime(new Date('2026-09-18T11:00:00Z'));
  expect(writeDataFeed(buildDataFeed([sampleConcert]), path)).toBe(false);
  expect(readFileSync(path, 'utf8')).toBe(before);
  expect(writeDataFeed(buildDataFeed([{ ...sampleConcert, title: 'Changed' }]), path)).toBe(true);
  const changed = JSON.parse(readFileSync(path, 'utf8'));
  expect(changed.dateModified).toBe(changed.meta.lastUpdate);
  expect(changed.dateModified).toBe('2026-09-18T11:00:00.000Z');
});

test('popular search uses the Athens day and preserves donation pricing', () => {
  setSystemTime(new Date('2026-09-18T22:30:00Z')); // already September 19 in Athens
  const dir = temp();
  generateSearchIndex([
    { ...sampleConcert, id: 'expired', startDate: '2026-09-18', endDate: undefined },
    { ...sampleConcert, id: 'today', title: 'Today', startDate: '2026-09-19', endDate: undefined, price: { type: 'donation' } },
  ], dir);
  const index = JSON.parse(readFileSync(join(dir, 'search-index.json'), 'utf8'));
  expect(index.popular.map((e: any) => e.title)).toEqual(['Today']);
  expect(index.events.find((e: any) => e.id === 'today').price).toBe('donation');
});

test('search only advertises generated venue and English event routes', () => {
  const dir = temp();
  generateSearchIndex([
    { ...sampleConcert, id: 'english', fullDescriptionEn: 'English description' },
    { ...sampleConcert, id: 'greek', fullDescriptionEn: undefined, venue: { name: 'Unknown Single Venue', address: '' } },
  ], dir);
  const index = JSON.parse(readFileSync(join(dir, 'search-index.json'), 'utf8'));
  expect(index.events.find((e: any) => e.id === 'english').hasEnglish).toBe(true);
  expect(index.events.find((e: any) => e.id === 'greek').hasEnglish).toBe(false);
  expect(index.venues.some((v: any) => v.name === 'Unknown Single Venue')).toBe(false);
});

test('health coverage changes at Athens midnight, not UTC midnight', () => {
  setSystemTime(new Date('2026-09-18T22:30:00Z'));
  const db = new Database(':memory:');
  try {
    db.run('CREATE TABLE events (type TEXT, start_date TEXT, end_date TEXT, location_status TEXT, needs_enrichment INTEGER, schema_json TEXT, merged_into TEXT)');
    db.run("INSERT INTO events VALUES ('concert', '2026-09-18', NULL, 'verified_athens', 0, '{}', NULL), ('exhibition', '2026-09-01', '2026-09-19', 'verified_athens', 1, NULL, NULL)");
    expect(getEnrichmentStats(db)).toEqual({ enriched: 0, total: 1 });
  } finally { db.close(); }
});

test('all health sections count running events and exclude merged and hidden records', () => {
  setSystemTime(new Date('2026-09-19T12:00:00Z'));
  const db = new Database(':memory:');
  try {
    db.run('CREATE TABLE events (id TEXT, type TEXT, start_date TEXT, end_date TEXT, location_status TEXT, needs_enrichment INTEGER, schema_json TEXT, merged_into TEXT, source TEXT, price_amount REAL, price_type TEXT, ticket_url TEXT)');
    const insert = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 10, ?, ?)');
    insert.run('art', 'exhibition', '2026-09-01', '2026-09-30', 'verified_athens', '{}', null, 'test', 'with-ticket', 'https://more.com/ticket');
    insert.run('run', 'theater', '2026-09-01', '2026-09-30', 'verified_athens', '{}', null, 'test', 'with-ticket', 'https://more.com/ticket');
    insert.run('merged', 'concert', '2026-09-20', null, 'verified_athens', '{}', 'art', 'test', 'with-ticket', null);
    insert.run('hidden', 'concert', '2026-09-20', null, 'unverified', '{}', null, 'test', 'with-ticket', null);
    expect(getDatabaseSummary(db)).toEqual({ total: 4, visible: 2, hidden: 2, unverified: 1 });
    expect(getEnrichmentStats(db)).toEqual({ total: 2, enriched: 2 });
    expect(getSchemaValidationStats(db)).toEqual({ total: 2, valid: 2 });
    expect(getQualityStats(db)).toEqual([{ source: 'test', total: 2, withPrice: 2, withTicketUrl: 2 }]);
  } finally { db.close(); }
});
