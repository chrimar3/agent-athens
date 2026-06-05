/**
 * Pure-function tests for the performer QID resolver (S179).
 * Network paths (derivation/search) are exercised by the audit script runs;
 * these cover the ownership policy, where the correctness traps live.
 */

import { describe, expect, test } from 'bun:test';
import {
  normalizeName,
  ownershipMatch,
  parseWikipediaUrl,
  schemaTypeFromP31,
} from '../performer-qid-resolver';

describe('normalizeName', () => {
  test('strips diacritics across scripts (Greek tonos, Irish fada)', () => {
    expect(normalizeName('Dara Ó Briain')).toBe('dara o briain');
    expect(normalizeName('Ευρυδίκη')).toBe(normalizeName('Ευρυδικη'));
    // accent-position variants of the same name must collide
    expect(normalizeName('Δημήτρης Σγουρός')).toBe(normalizeName('Δημήτρης Σγούρος'));
  });

  test('unifies & / + / "and" spellings', () => {
    expect(normalizeName('Nick Cave & The Bad Seeds')).toBe(normalizeName('Nick Cave and The Bad Seeds'));
    expect(normalizeName('Florence + the Machine')).toBe(normalizeName('Florence and the Machine'));
  });

  test('strips trailing parenthetical disambiguators only', () => {
    expect(normalizeName('Sabaton (band)')).toBe('sabaton');
    expect(normalizeName('Catharsis (Russian band)')).toBe('catharsis');
  });

  test('strips quotes (nickname forms) and punctuation', () => {
    expect(normalizeName('Gabriel "Fluffy" Iglesias')).toBe('gabriel fluffy iglesias');
    expect(normalizeName('Godspeed You! Black Emperor')).toBe('godspeed you black emperor');
  });
});

describe('ownershipMatch', () => {
  test('matches on strict normalized equality', () => {
    expect(ownershipMatch('WAVVES', ['Wavves'])).toBe('Wavves');
    expect(ownershipMatch('Αντώνης Καλογιάννης', ['Antonis Kalogiannis', 'Αντώνης Καλογιάννης']))
      .toBe('Αντώνης Καλογιάννης');
  });

  test('REJECTS containment — the Dimitri Vegas trap', () => {
    // enwiki redirects "Dimitri Vegas" to the duo article; containment would
    // accept the wrong owner. Strict equality must reject it.
    expect(ownershipMatch('Dimitri Vegas', ['Dimitri Vegas & Like Mike'])).toBeNull();
  });

  test('REJECTS unrelated labels (the fabricated-QID class)', () => {
    expect(ownershipMatch('Moby', ['Edward Furlong'])).toBeNull();
    expect(ownershipMatch('Leon of Athens', ['Damis d\'Atenes'])).toBeNull();
  });

  test('accepts parenthetical-disambiguated article titles', () => {
    expect(ownershipMatch('Sabaton', ['Sabaton (band)'])).toBe('Sabaton (band)');
  });
});

describe('parseWikipediaUrl', () => {
  test('parses any language edition and decodes titles', () => {
    expect(parseWikipediaUrl('https://en.wikipedia.org/wiki/Rotting_Christ'))
      .toEqual({ lang: 'en', title: 'Rotting Christ' });
    expect(parseWikipediaUrl('https://el.wikipedia.org/wiki/%CE%97%CF%81%CF%8E_%CE%A3%CE%B1%CE%90%CE%B1'))
      .toEqual({ lang: 'el', title: 'Ηρώ Σαΐα' });
  });

  test('rejects non-Wikipedia URLs', () => {
    expect(parseWikipediaUrl('https://www.wikidata.org/wiki/Q938889')).toBeNull();
    expect(parseWikipediaUrl('https://musicbrainz.org/artist/abc')).toBeNull();
  });
});

describe('schemaTypeFromP31', () => {
  test('group-class instances → MusicGroup, humans → Person', () => {
    expect(schemaTypeFromP31(['Q215380'])).toBe('MusicGroup'); // musical group
    expect(schemaTypeFromP31(['Q5741069'])).toBe('MusicGroup'); // rock band
    expect(schemaTypeFromP31(['Q5'])).toBe('Person');
    expect(schemaTypeFromP31([])).toBe('Person');
  });
});
