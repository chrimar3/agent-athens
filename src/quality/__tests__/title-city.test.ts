import { describe, test, expect } from 'bun:test';
import { titleNamesCity } from '../location-filter';

// Build-time hold-back for titles that place an event in another city
// ("WANG LIVE ΛΑΡΙΣΑ", "… TOUR στη Λιβαδειά") after the location filter
// accepted it on a wrongly matched Athens venue. Nominative city names only:
// the genitive names an origin ("Κρατική Ορχήστρα Θεσσαλονίκης" plays Athens).
const cities = ['Λάρισα', 'Θεσσαλονίκη', 'Λιβαδειά'];

describe('titleNamesCity', () => {
  test('matches regardless of case and accents', () => {
    expect(titleNamesCity('WANG LIVE ΛΑΡΙΣΑ // 20.11.2026 // CIRCUS', cities)).toBe('Λάρισα');
    expect(titleNamesCity('ΡΙΜΑ για ΧΡΗΜΑ ΙΙΙ TOUR στη Λιβαδεια', cities)).toBe('Λιβαδειά');
    expect(titleNamesCity('Συναυλία στη Λάρισα', cities)).toBe('Λάρισα');
  });

  test('the genitive (an origin, not a place) does not match', () => {
    expect(titleNamesCity('Κρατική Ορχήστρα Θεσσαλονίκης', cities)).toBeNull();
    expect(titleNamesCity('ΚΡΑΤΙΚΗ ΟΡΧΗΣΤΡΑ ΘΕΣΣΑΛΟΝΙΚΗΣ', cities)).toBeNull();
  });

  test('a city name inside a longer word does not match', () => {
    expect(titleNamesCity('Λαρισαίοι μουσικοί', cities)).toBeNull();
  });

  test('titles naming no city pass', () => {
    expect(titleNamesCity('Συναυλία στο Κύτταρο', cities)).toBeNull();
  });
});
