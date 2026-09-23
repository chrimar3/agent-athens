import { describe, test, expect } from 'bun:test';
import { displayTitle } from '../display-title';

// Real titles live on 2026-09-22. Display-only: the stored title, JSON-LD name
// and dedup keys keep the source string.
describe('displayTitle — strips scraper noise', () => {
  test('embedded date and trailing venue: "$ULEE LIVE ΑΘΗΝΑ // 25.09.2026 // ΑΡΧΙΤΕΚΤΟΝΙΚΗ"', () => {
    expect(displayTitle('$ULEE LIVE ΑΘΗΝΑ // 25.09.2026 // ΑΡΧΙΤΕΚΤΟΝΙΚΗ', 'Αρχιτεκτονική')).toBe('$ULEE LIVE ΑΘΗΝΑ');
  });

  test('long-form Greek date and "@ venue" tail', () => {
    expect(displayTitle(
      'LORD BISHOP ROCKS – για πρώτη φορά στην Ελλάδα – 26 Σεπτεμβρίου @ Holywood, Άθήνα…+ DISILLUSIVE PLAY & NO NAME DOGS',
      'HolyWood Stage',
    )).toBe('LORD BISHOP ROCKS – για πρώτη φορά στην Ελλάδα + DISILLUSIVE PLAY & NO NAME DOGS');
  });

  test('two apostrophes used as an opening quote', () => {
    expect(displayTitle(`''ΤΑ ΚΑΛΥΤΕΡΑ ΜΑΣ ΧΡΟΝΙΑ" ΛΑΚΗΣ ΤΖΟΡΝΤΑΝΕΛΛΙ`, 'Δημοτικό Κηποθέατρο Παπάγου'))
      .toBe('"ΤΑ ΚΑΛΥΤΕΡΑ ΜΑΣ ΧΡΟΝΙΑ" ΛΑΚΗΣ ΤΖΟΡΝΤΑΝΕΛΛΙ');
  });

  test('trailing segment that is the venue\'s leading word (entity-encoded source title)', () => {
    expect(displayTitle('MOOSE &quot;WELCOME TO K&quot; LIVE ΑΘΗΝΑ // 27.10.2026 // GAGARIN', 'Gagarin 205'))
      .toBe('MOOSE "WELCOME TO K" LIVE ΑΘΗΝΑ');
  });

  test('a weekday in front of a removed long-form date goes with it', () => {
    expect(displayTitle('Ο Βασιλιάς Λιρ Παρασκευή 15 Μαϊου Christmas Theater', 'Christmas Theater'))
      .toBe('Ο Βασιλιάς Λιρ Christmas Theater');
  });

  test('double-encoded source titles decode fully (real rows, 2026-09-23)', () => {
    expect(displayTitle('Sayings and Cracks &amp;#8211; Tribute to Gy&amp;#246;rgy Kurt&amp;#225;g', 'Μέγαρο Μουσικής Αθηνών'))
      .toBe('Sayings and Cracks – Tribute to György Kurtág');
  });

  test('trailing city segment', () => {
    expect(displayTitle('Μίλτος Πασχαλίδης - Αθήνα', 'Δημοτικό Θέατρο Λυκαβηττού')).toBe('Μίλτος Πασχαλίδης');
  });
});

describe('displayTitle — leaves real titles alone', () => {
  test.each([
    ['Ty Segall', 'Floyd'],
    ['Emergence World Tour 2026 - Professor Brian Cox', 'Christmas Theater'],   // year is part of the name
    ['Θέατρο του Νέου Κόσμου 26-27', 'Θέατρο του Νέου Κόσμου'],               // season, not a date
    ['1984 - George Orwell', 'Δίπυλον'],
    ['Αφιέρωμα στον Μίκη Θεοδωράκη - Τραγουδά ο Θοδωρής Φέρρης', 'Δημοτικό Θέατρο Λυκαβηττού'],
    ['Athens Jazz @ 30', 'Half Note'],                                        // "@" not followed by the venue
    ['Ορφέας - Ορ', 'Ορ Κλαμπ'],                                              // 2-char tail is too short to count as the venue
  ])('%s', (title, venue) => {
    expect(displayTitle(title, venue)).toBe(title);
  });

  test('never returns an empty string', () => {
    expect(displayTitle('25.09.2026', 'X')).toBe('25.09.2026');
    expect(displayTitle('Floyd', 'Floyd')).toBe('Floyd');
  });
});
