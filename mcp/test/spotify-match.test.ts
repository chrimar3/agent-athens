/**
 * M2.2: match_artists by Spotify artist ID, resolved through Wikidata QIDs.
 * Fixture feed is synthetic. The synthetic index maps an obviously fake ID;
 * the last tests read real IDs from the committed mcp/data/performer-ids.json.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFeed, type FeedSource } from '../src/feed';
import { handleHttp } from '../src/mcp';
import { matchArtists, spotifyIndex } from '../src/tools';

const el = parseFeed(JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'events.el.json'), 'utf8')), 'el');
const en = parseFeed(JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'events.en.json'), 'utf8')), 'en');
const TODAY = '2026-11-02';
const FAKE = 'FixtureSpotifyId000001';
const fixtureIds = { _fixture: 'SYNTHETIC: one fake ID mapped to Rotting Christ (Q938889)', byQid: { Q938889: { spotify: [FAKE] } } };
const ids = spotifyIndex(fixtureIds);
const idFile = JSON.parse(readFileSync(join(import.meta.dir, '..', 'data', 'performer-ids.json'), 'utf8'));

describe('match_artists by spotify_id', () => {
  test('a known Spotify ID matches through its QID, with confidence spotify_id', () => {
    const r = matchArtists(el, { artists: [{ spotify_id: FAKE }] }, TODAY, ids);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({ artist: FAKE, confidence: 'spotify_id' });
    expect(r.matches[0].event.name).toBe('Rotting Christ');
  });
  test('the ID wins over a spelling that would not match', () => {
    const r = matchArtists(el, { artists: [{ name: 'R. Christ (live)', spotify_id: FAKE }] }, TODAY, ids);
    expect(r.matches.map((m) => m.confidence)).toEqual(['spotify_id']);
  });
  test('an ID the index does not know falls back to the name', () => {
    const r = matchArtists(el, { artists: [{ name: 'Alkinoos Ioannidis', spotify_id: 'FixtureSpotifyId999999' }] }, TODAY, ids);
    expect(r.matches.map((m) => m.confidence)).toEqual(['name']);
  });
  test('an unknown ID with no name is unmatched', () => {
    expect(matchArtists(el, { artists: [{ spotify_id: 'FixtureSpotifyId999999' }] }, TODAY, ids).unmatched).toEqual(['FixtureSpotifyId999999']);
  });
  test('all four confidence levels, ranked spotify_id > wikidata > name > title_mention', () => {
    const r = matchArtists(en, {
      artists: ['Dire Straits', 'Tinariwen', { wikidata: 'Q1380313' }, { spotify_id: FAKE }],
    }, TODAY, ids);
    expect(r.matches.map((m) => m.confidence)).toEqual(['spotify_id', 'wikidata', 'name', 'title_mention']);
  });
  test('a malformed Spotify ID is an input error', () => {
    expect(() => matchArtists(el, { artists: [{ spotify_id: 'spotify:artist:x' }] }, TODAY, ids)).toThrow('spotify_id');
  });
});

describe('the committed Wikidata file', () => {
  test('is well formed and its count is computed', () => {
    const entries = Object.entries(idFile.byQid) as [string, { spotify: string[] }][];
    expect(entries.length).toBeGreaterThan(0);
    expect(idFile._meta.count).toBe(entries.length);
    for (const [qid, v] of entries) {
      expect(qid).toMatch(/^Q\d+$/);
      for (const s of v.spotify) expect(s).toMatch(/^[0-9A-Za-z]{22}$/);
    }
  });
  test('the server uses it by default: a real Spotify ID finds the fixture event over HTTP', async () => {
    const real = idFile.byQid.Q938889?.spotify?.[0];
    expect(real).toBeDefined(); // precondition: Wikidata gave Rotting Christ (Q938889) a Spotify ID
    const feed: FeedSource = async (l) => (l === 'el' ? el : en);
    const res = await handleHttp(new Request('https://mcp.test/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'match_artists', arguments: { artists: [{ spotify_id: real }], lang: 'el' } } }),
    }), { feed, now: () => new Date('2026-11-02T10:00:00Z') });
    const out = (await res.json()).result.structuredContent;
    expect(out.matches[0]).toMatchObject({ confidence: 'spotify_id' });
    expect(out.matches[0].event.name).toBe('Rotting Christ');
  });
  test('tools/list advertises spotify_id', async () => {
    const res = await handleHttp(new Request('https://mcp.test/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) }), { feed: async () => el });
    const tool = (await res.json()).result.tools.find((t: any) => t.name === 'match_artists');
    expect(JSON.stringify(tool.inputSchema)).toContain('spotify_id');
  });
});
