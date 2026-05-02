import { describe, test, expect } from 'bun:test';
import {
  loadBannedPhrases,
  checkAbsoluteMatch,
  compileContextualRegex,
} from '../src/utils/load-banned-phrases';

describe('banned-phrases loader', () => {
  const data = loadBannedPhrases();

  test('schema parses with expected counts', () => {
    expect(data.absolute.length).toBe(169);
    expect(data.contextual.length).toBe(9);
  });

  test('all EL contextual entries are regex', () => {
    const elContextual = data.contextual.filter((e) => e.language === 'el');
    expect(elContextual.length).toBe(3);
    expect(elContextual.every((e) => e.isRegex)).toBe(true);
  });

  test('all contextual regex entries compile', () => {
    const regexEntries = data.contextual.filter((e) => e.isRegex);
    for (const entry of regexEntries) {
      expect(() => compileContextualRegex(entry)).not.toThrow();
    }
  });

  test('EN absolute "amazing" matches in known-bad sentence', () => {
    const enAbsolute = data.absolute.filter((e) => e.language === 'en');
    const matches = checkAbsoluteMatch('What an amazing show last night', enAbsolute);
    expect(matches).toContain('amazing');
  });

  test('EN absolute does not match clean sentence', () => {
    const enAbsolute = data.absolute.filter((e) => e.language === 'en');
    const matches = checkAbsoluteMatch('The trio performed at Half Note Wednesday', enAbsolute);
    expect(matches.length).toBe(0);
  });

  test('EL contextual ζωντανός regex matches all key inflections', () => {
    const zontanos = data.contextual.find(
      (e) => e.language === 'el' && e.phrase.includes('ζωντανός'),
    );
    expect(zontanos).toBeDefined();
    const regex = compileContextualRegex(zontanos!);
    expect(regex.test('ζωντανή ατμόσφαιρα')).toBe(true);
    expect(regex.test('ζωντανού μουσικού')).toBe(true);
    expect(regex.test('ζωντανές βραδιές')).toBe(true);
    expect(regex.test('ζωντανά παιχνίδια')).toBe(true);
  });

  test('EN contextual "live" carries judge-prompt context', () => {
    const live = data.contextual.find((e) => e.language === 'en' && e.phrase === 'live');
    expect(live).toBeDefined();
    expect(live!.bannedWhen.length).toBeGreaterThan(20);
    expect(live!.allowedWhen.length).toBeGreaterThan(20);
  });

  test('EL absolute "καταπληκτικός" matches all key inflections', () => {
    const elAbsolute = data.absolute.filter((e) => e.language === 'el');
    expect(checkAbsoluteMatch('Είδαμε καταπληκτικό συναυλία', elAbsolute)).toContain(
      'καταπληκτικό',
    );
    expect(checkAbsoluteMatch('Είναι καταπληκτική παράσταση', elAbsolute)).toContain(
      'καταπληκτική',
    );
    expect(checkAbsoluteMatch('Καταπληκτικός ηθοποιός', elAbsolute)).toContain('καταπληκτικός');
  });
});
