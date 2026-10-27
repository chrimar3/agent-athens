/**
 * Fixtures are SYNTHETIC events run through the site's real DataFeed builder
 * (scripts/make-fixture.ts). "Today" is pinned to Monday 2026-11-02, Athens.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFeed, httpFeedSource, type FeedSource, type Lang } from '../src/feed';
import { handleHttp } from '../src/mcp';
import { looseKey } from '../src/normalize';
import { matchArtists, resolveWindow, searchEvents, getEvent, listVenues, athensToday } from '../src/tools';

const raw = (lang: Lang) => JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', `events.${lang}.json`), 'utf8'));
const snap = { el: parseFeed(raw('el'), 'el'), en: parseFeed(raw('en'), 'en') };
const TODAY = '2026-11-02';
const feed: FeedSource = async (l) => snap[l];
const now = () => new Date('2026-11-02T10:00:00Z');

async function rpc(body: unknown) {
  const res = await handleHttp(new Request('https://mcp.test/mcp', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { feed, now });
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}

describe('normalize', () => {
  test('Greek and Latin spellings share a key', () => {
    expect(looseKey('Αλκίνοος Ιωαννίδης')).toBe(looseKey('Alkinoos Ioannidis'));
    expect(looseKey('The Cure')).toBe(looseKey('cure'));
    expect(looseKey('Nick Cave & The Bad Seeds')).toBe(looseKey('Nick Cave and the Bad Seeds'));
  });
});

describe('dates', () => {
  test('Athens day boundary', () => {
    expect(athensToday(new Date('2026-11-02T22:30:00Z'))).toBe('2026-11-03'); // 00:30 in Athens
  });
  test('this_weekend from Monday is Sat–Sun', () => {
    expect(resolveWindow({ when: 'this_weekend' }, TODAY)).toEqual({ from: '2026-11-07', to: '2026-11-08' });
  });
});

describe('feed parsing', () => {
  test('flattens the DataFeed without inventing fields', () => {
    const e = snap.el.events.find((x) => x.name === 'Rotting Christ')!;
    expect(e.category).toBe('music');
    expect(e.price).toEqual({ access: 'with-ticket', amount: 25, currency: 'EUR' });
    expect(e.ticket_url).toContain('more.com');
    expect(e.performer?.wikidata).toBe('Q938889');
    expect(e.url).toStartWith('https://agentathens.com/events/');
    const expo = snap.el.events.find((x) => x.category === 'exhibition')!;
    expect(expo.price.amount).toBeUndefined(); // the feed omits this Offer, so do we
  });
  test('rejects a document that is not a DataFeed', () => {
    expect(() => parseFeed({ events: [] }, 'el')).toThrow();
  });
});

describe('search_events', () => {
  test('this weekend, music only', () => {
    const r = searchEvents(snap.en, { when: 'this_weekend', category: 'music' }, TODAY);
    expect(r.events.map((e) => e.name)).toEqual(['Rotting Christ', 'Αλκίνοος Ιωαννίδης']);
  });
  test('a running exhibition overlaps a later window', () => {
    const r = searchEvents(snap.en, { date_from: '2026-12-10', date_to: '2026-12-12', category: 'exhibition' }, TODAY);
    expect(r.total).toBe(1);
  });
  test('neighborhood, open_only and max_price', () => {
    expect(searchEvents(snap.en, { neighborhood: 'gazi', category: 'music', when: 'next_7_days' }, TODAY).total).toBe(3);
    expect(searchEvents(snap.en, { open_only: true, when: 'next_7_days' }, TODAY).events.every((e) => e.price.access === 'open')).toBe(true);
    const cheap = searchEvents(snap.en, { max_price: 20, category: 'music', when: 'next_7_days' }, TODAY);
    expect(cheap.events.some((e) => e.name === 'Tinariwen')).toBe(false);
    expect(cheap.events.some((e) => e.name === 'Αλκίνοος Ιωαννίδης')).toBe(true);
  });
  test('free-text query works across scripts', () => {
    expect(searchEvents(snap.el, { query: 'ioannidis' }, TODAY).events[0].name).toBe('Αλκίνοος Ιωαννίδης');
  });
  test('pagination', () => {
    const r = searchEvents(snap.en, { limit: 2 }, TODAY);
    expect(r.events.length).toBe(2);
    expect(r.next_offset).toBe(2);
  });
  test('bad input is a ToolInputError', () => {
    expect(() => searchEvents(snap.en, { date_from: 'tomorrow' }, TODAY)).toThrow('YYYY-MM-DD');
    expect(() => searchEvents(snap.en, { category: 'opera' as any }, TODAY)).toThrow('category');
  });
});

describe('get_event and list_venues', () => {
  test('by id or URL', () => {
    const id = snap.en.events[0].id;
    expect(getEvent(snap.en, { id }).found).toBe(true);
    expect(getEvent(snap.en, { id: `https://agentathens.com/en/events/${id}/` }).found).toBe(true);
    expect(getEvent(snap.en, { id: 'nope' }).found).toBe(false);
  });
  test('venues ranked by upcoming events', () => {
    const r = listVenues(snap.en, {}, TODAY);
    expect(r.venues[0].name).toBe('Gazarte');
    expect(r.venues[0].upcoming_events).toBe(3);
  });
});

describe('match_artists', () => {
  test('Spotify-style Latin name matches a Greek performer', () => {
    const r = matchArtists(snap.el, { artists: ['Alkinoos Ioannidis', 'Radiohead'] }, TODAY);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({ artist: 'Alkinoos Ioannidis', confidence: 'name' });
    expect(r.unmatched).toEqual(['Radiohead']);
  });
  test('Wikidata id wins over name', () => {
    const r = matchArtists(snap.en, { artists: [{ wikidata: 'Q938889' }] }, TODAY);
    expect(r.matches[0].confidence).toBe('wikidata');
    expect(r.matches[0].event.name).toBe('Rotting Christ');
  });
  test('title mention is flagged, and can be turned off', () => {
    const r = matchArtists(snap.en, { artists: ['Dire Straits'] }, TODAY);
    expect(r.matches[0].confidence).toBe('title_mention');
    expect(matchArtists(snap.en, { artists: ['Dire Straits'], include_title_mentions: false }, TODAY).matches).toHaveLength(0);
  });
  test('short names never title-match', () => {
    expect(matchArtists(snap.en, { artists: ['Jam'] }, TODAY).matches).toHaveLength(0);
  });
});

describe('MCP over HTTP', () => {
  test('initialize negotiates the protocol and sends instructions', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.instructions).toContain('match_artists');
  });
  test('notifications get 202', async () => {
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
  });
  test('tools/list exposes four read-only tools', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(body.result.tools.map((t: any) => t.name)).toEqual(['search_events', 'get_event', 'list_venues', 'match_artists']);
    expect(body.result.tools.every((t: any) => t.annotations.readOnlyHint)).toBe(true);
  });
  test('tools/call returns text and structured content', async () => {
    const { body } = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'match_artists', arguments: { artists: ['Tinariwen'], lang: 'el' } } });
    expect(body.result.isError).toBe(false);
    expect(body.result.structuredContent.matches[0].event.name).toBe('Tinariwen');
    expect(JSON.parse(body.result.content[0].text).matches).toHaveLength(1);
  });
  test('bad arguments come back as a tool error, unknown tool as an RPC error', async () => {
    const bad = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_events', arguments: { limit: 500 } } });
    expect(bad.body.result.isError).toBe(true);
    const unknown = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'delete_everything' } });
    expect(unknown.body.error.code).toBe(-32602);
  });
  test('GET /mcp is 405 and oversized bodies are refused', async () => {
    expect((await handleHttp(new Request('https://mcp.test/mcp'), { feed })).status).toBe(405);
    const big = await handleHttp(new Request('https://mcp.test/mcp', { method: 'POST', body: 'x'.repeat(70_000) }), { feed });
    expect(big.status).toBe(413);
  });
});

describe('lang "en" keeps Greek-only events', () => {
  const GREEK_ONLY = 'Ο Βυσσινόκηπος';
  const call = async (name: string, args: object) =>
    (await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } })).body.result;

  test('fixture precondition: the event is in the el feed and missing from the en feed', () => {
    expect(snap.el.events.some((e) => e.name === GREEK_ONLY)).toBe(true);
    expect(snap.en.events.some((e) => e.name === GREEK_ONLY)).toBe(false);
  });
  test('search_events lang en returns it, with its Greek name', async () => {
    const r = await call('search_events', { lang: 'en', category: 'theatre', limit: 50 });
    expect(r.structuredContent.events.map((e: any) => e.name)).toContain(GREEK_ONLY);
    expect(r.structuredContent.total).toBe(searchEvents(snap.el, { category: 'theatre', limit: 50 }, TODAY).total);
  });
  test('an event in both feeds uses the English record', async () => {
    const r = await call('search_events', { lang: 'en', query: 'Tinariwen' });
    expect(r.structuredContent.events[0].description).toContain('English fixture description');
  });
  test('get_event lang en finds it by id', async () => {
    const id = snap.el.events.find((e) => e.name === GREEK_ONLY)!.id;
    expect((await call('get_event', { lang: 'en', id })).structuredContent.found).toBe(true);
  });
});

describe('httpFeedSource', () => {
  test('caches and serves the last good snapshot when a refresh fails', async () => {
    let calls = 0;
    const fake = (async () => {
      calls++;
      if (calls > 1) return new Response('down', { status: 503 });
      return new Response(JSON.stringify(raw('en')));
    }) as unknown as typeof fetch;
    const src = httpFeedSource('https://x', 0, fake);
    const a = await src('en');
    const b = await src('en');
    expect(calls).toBe(2);
    expect(b).toBe(a);
  });
  test('with no prior snapshot the error surfaces', async () => {
    const src = httpFeedSource('https://x', 0, (async () => new Response('down', { status: 503 })) as unknown as typeof fetch);
    await expect(src('en')).rejects.toThrow('503');
  });
});
