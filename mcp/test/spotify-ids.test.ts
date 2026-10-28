/**
 * M2.1: the pure parts of scripts/fetch-spotify-ids.ts, on synthetic input.
 * No network: the SPARQL response below is hand-written test data.
 */
import { describe, expect, test } from 'bun:test';
import { batches, buildIdFile, qidsFromConfig, sparqlFor } from '../scripts/fetch-spotify-ids';

const config = {
  _meta: { description: 'Q999 in prose must not count' },
  performers: {
    A: { type: 'MusicGroup', sameAs: ['https://www.wikidata.org/wiki/Q938889', 'https://en.wikipedia.org/wiki/Q1'] },
    B: { type: 'Person', sameAs: ['https://www.wikidata.org/wiki/Q1380313'] },
    C: { type: 'Person', sameAs: ['https://www.wikidata.org/wiki/Q938889'] },
    D: { type: 'Person', sameAs: ['https://musicbrainz.org/artist/x'] },
    E: null, // the real config caches failed lookups as null
  },
};

describe('fetch-spotify-ids', () => {
  test('QIDs come only from wikidata.org sameAs links, deduplicated and in numeric order', () => {
    expect(qidsFromConfig(config)).toEqual(['Q938889', 'Q1380313']);
  });
  test('batches hold at most 200 QIDs', () => {
    const qids = Array.from({ length: 401 }, (_, i) => `Q${i + 1}`);
    expect(batches(qids).map((b) => b.length)).toEqual([200, 200, 1]);
  });
  test('the query asks P1902 for exactly the given items', () => {
    const q = sparqlFor(['Q1', 'Q22']);
    expect(q).toContain('VALUES ?item { wd:Q1 wd:Q22 }');
    expect(q).toContain('wdt:P1902');
  });
  test('the file keeps every Spotify ID Wikidata gives, and nothing else', () => {
    const bindings = [
      { item: { value: 'http://www.wikidata.org/entity/Q938889' }, spotify: { value: 'FixtureSpotifyId000001' } },
      { item: { value: 'http://www.wikidata.org/entity/Q938889' }, spotify: { value: 'FixtureSpotifyId000002' } },
      { item: { value: 'http://www.wikidata.org/entity/Q1380313' }, spotify: { value: 'FixtureSpotifyId000003' } },
    ];
    const f = buildIdFile(bindings, { query: 'Q', retrieved_at: '2026-10-27T00:00:00Z', qids_queried: 2 });
    expect(f.byQid).toEqual({
      Q1380313: { spotify: ['FixtureSpotifyId000003'] },
      Q938889: { spotify: ['FixtureSpotifyId000001', 'FixtureSpotifyId000002'] },
    });
    expect(f._meta.count).toBe(2);
    expect(f._meta.source).toContain('query.wikidata.org');
  });
  test('values that are not Spotify artist IDs are refused', () => {
    const bad = [{ item: { value: 'http://www.wikidata.org/entity/Q1' }, spotify: { value: 'not an id' } }];
    expect(() => buildIdFile(bad, { query: 'Q', retrieved_at: 'x', qids_queried: 1 })).toThrow('Spotify artist ID');
  });
});
