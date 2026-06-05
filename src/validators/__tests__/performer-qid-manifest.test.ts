/**
 * Performer QID manifest gate (S179) — the paired validator that makes the
 * fabricated-QID corruption class unable to recur: a QID present in
 * config/performer-sameAs.json without a resolver-written verification
 * record must FAIL the build.
 */

import { describe, expect, test } from 'bun:test';
import {
  validatePerformerQidManifest,
  validatePerformerQidConfig,
} from '../performer-qid-manifest';

const WD = (q: string) => `https://www.wikidata.org/wiki/${q}`;
const WP = (t: string) => `https://en.wikipedia.org/wiki/${t}`;

function cacheWith(performers: Record<string, any>) {
  return { performers };
}

describe('validatePerformerQidManifest', () => {
  test('verified pageprops record passes', () => {
    const report = validatePerformerQidManifest(
      cacheWith({
        'Rotting Christ': { type: 'MusicGroup', sameAs: [WD('Q938889'), WP('Rotting_Christ')] },
      }),
      {
        verified: {
          'Rotting Christ': {
            qid: 'Q938889',
            method: 'wikipedia-pageprops',
            anchor: WP('Rotting_Christ'),
          },
        },
      },
    );
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(1);
  });

  test('QID without a manifest record FAILs (the hand-edit / LLM-fabrication vector)', () => {
    const report = validatePerformerQidManifest(
      cacheWith({ Moby: { type: 'Person', sameAs: [WD('Q309631')] } }),
      { verified: {} },
    );
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toContain('Moby');
    expect(report.failures[0]).toContain('no verification record');
  });

  test('cache QID differing from verified QID FAILs (cache edited after verification)', () => {
    const report = validatePerformerQidManifest(
      cacheWith({ Moby: { type: 'Person', sameAs: [WD('Q309631'), WP('Moby')] } }),
      {
        verified: {
          Moby: { qid: 'Q14045', method: 'wikipedia-pageprops', anchor: WP('Moby') },
        },
      },
    );
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toContain('Q309631');
    expect(report.failures[0]).toContain('Q14045');
  });

  test('pageprops record whose anchor is missing from sameAs FAILs (QID verified against a different article)', () => {
    const report = validatePerformerQidManifest(
      cacheWith({ Sabaton: { type: 'MusicGroup', sameAs: [WD('Q740159')] } }),
      {
        verified: {
          Sabaton: { qid: 'Q740159', method: 'wikipedia-pageprops', anchor: WP('Sabaton_(band)') },
        },
      },
    );
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toContain('anchor');
  });

  test('anchor comparison is percent-encoding-insensitive (Greek/diacritic titles)', () => {
    const report = validatePerformerQidManifest(
      cacheWith({
        'Ηρώ Σαΐα': {
          type: 'Person',
          sameAs: [WD('Q38119205'), 'https://el.wikipedia.org/wiki/%CE%97%CF%81%CF%8E_%CE%A3%CE%B1%CE%90%CE%B1'],
        },
      }),
      {
        verified: {
          'Ηρώ Σαΐα': {
            qid: 'Q38119205',
            method: 'wikipedia-pageprops',
            anchor: 'https://el.wikipedia.org/wiki/Ηρώ_ΣαΐΑ'.replace('ΣαΐΑ', 'Σαΐα'),
          },
        },
      },
    );
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(1);
  });

  test('wikidata-label record requires matchCount === 1 (uniqueness is the guard)', () => {
    const manifestOk = {
      verified: {
        'Ορέστης Ντάντος': {
          qid: 'Q131375146',
          method: 'wikidata-label',
          anchor: 'label:Ορέστης Ντάντος',
          matchCount: 1,
        },
      },
    };
    const cache = cacheWith({
      'Ορέστης Ντάντος': { type: 'Person', sameAs: [WD('Q131375146')] },
    });
    expect(validatePerformerQidManifest(cache, manifestOk).failures).toEqual([]);

    const manifestBad = JSON.parse(JSON.stringify(manifestOk));
    manifestBad.verified['Ορέστης Ντάντος'].matchCount = 2;
    expect(validatePerformerQidManifest(cache, manifestBad).failures).toHaveLength(1);

    delete manifestBad.verified['Ορέστης Ντάντος'].matchCount;
    expect(validatePerformerQidManifest(cache, manifestBad).failures).toHaveLength(1);
  });

  test('unknown verification method FAILs', () => {
    const report = validatePerformerQidManifest(
      cacheWith({ X: { type: 'Person', sameAs: [WD('Q1')] } }),
      { verified: { X: { qid: 'Q1', method: 'llm-vibes', anchor: 'label:X' } } },
    );
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toContain('llm-vibes');
  });

  test('multiple wikidata URIs in one entry FAIL', () => {
    const report = validatePerformerQidManifest(
      cacheWith({ X: { type: 'Person', sameAs: [WD('Q1'), WD('Q2')] } }),
      { verified: {} },
    );
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toContain('2 wikidata URIs');
  });

  test('null entries and QID-less entries are skipped, stale manifest records warn only', () => {
    const report = validatePerformerQidManifest(
      cacheWith({
        'Not Found Artist': null,
        'MusicBrainz Only': { type: 'Person', sameAs: ['https://musicbrainz.org/artist/abc'] },
      }),
      {
        verified: {
          'Removed Artist': { qid: 'Q9', method: 'wikipedia-pageprops', anchor: WP('Removed') },
        },
      },
    );
    expect(report.failures).toEqual([]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('Removed Artist');
  });
});

describe('shipped config', () => {
  test('performer-sameAs.json + performer-qid-verification.json pass the gate (paired files in the repo are consistent)', () => {
    const report = validatePerformerQidConfig();
    expect(report.failures).toEqual([]);
    expect(report.passed).toBeGreaterThanOrEqual(50);
  });
});
