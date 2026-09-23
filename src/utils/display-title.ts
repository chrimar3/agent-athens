/**
 * Visible title for cards and headings. Scrapers pass through source titles
 * padded with dates, venue names and city tags ("… // 25.09.2026 //
 * ΑΡΧΙΤΕΚΤΟΝΙΚΗ") that the card already shows in its own fields. Display
 * only — the stored title, JSON-LD `name` and dedup keys keep the source
 * string. Conservative: when in doubt the title is returned unchanged.
 */

import he from 'he';

const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[…"'«»]/g, '').trim();

const CITY = new Set(['αθηνα', 'athens', 'athina']);

const MONTHS = [
  'ιανουαριου', 'φεβρουαριου', 'μαρτιου', 'απριλιου', 'μαιου', 'ιουνιου',
  'ιουλιου', 'αυγουστου', 'σεπτεμβριου', 'οκτωβριου', 'νοεμβριου', 'δεκεμβριου',
];

// Accent-insensitive pattern for an unaccented Greek word.
const ACCENTS: Record<string, string> = { α: '[αά]', ε: '[εέ]', η: '[ηή]', ι: '[ιίϊΐ]', ο: '[οό]', υ: '[υύϋΰ]', ω: '[ωώ]' };
const loose = (word: string): string => [...word].map(ch => ACCENTS[ch] ?? ch).join('');

const NUMERIC_DATE = /\b\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2})\b/g;
const WEEKDAYS = ['δευτερα', 'τριτη', 'τεταρτη', 'πεμπτη', 'παρασκευη', 'σαββατο', 'κυριακη'];
const LONG_DATE = new RegExp(
  `(?:(?<![\\p{L}])(?:${WEEKDAYS.map(loose).join('|')}),?\\s+)?(?<![\\p{L}\\d])\\d{1,2}\\s+(?:${MONTHS.map(loose).join('|')})(?![\\p{L}])`,
  'giu',
);
const SEP = String.raw`(?:\/\/|\||–|—|-)`;

// Some pre-S154 rows are double-encoded ("&amp;#8211;"); decode to a fixed point.
export function decodeFully(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = he.decode(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

export function displayTitle(title: string, venueName = ''): string {
  let t = decodeFully(title).replace(/''/g, '"');

  t = t.replace(NUMERIC_DATE, '').replace(LONG_DATE, '');

  // "@ <this venue>, <city>…" up to the next lineup "+"/"|".
  const venueWord = fold(venueName).split(/\s+/).find(w => w.length >= 4);
  if (venueWord) {
    t = t.replace(/\s*@\s*([^+|]*)/, (m, place: string) => (fold(place).startsWith(venueWord) ? ' ' : m));
  }

  // Separators left dangling by the removals above.
  t = t.replace(new RegExp(String.raw`(\s${SEP}\s)(?:\s*${SEP}\s)+`, 'g'), '$1');
  t = t.replace(new RegExp(String.raw`\s*${SEP}\s*(?=\+|$)`, 'g'), ' ');
  t = t.replace(new RegExp(String.raw`^\s*${SEP}\s*`), '');

  // A trailing segment that only repeats the venue (or its leading word:
  // "// GAGARIN" at Gagarin 205) or the city.
  const venue = fold(venueName);
  for (let i = 0; i < 2; i++) {
    const m = t.match(new RegExp(String.raw`\s${SEP}\s([^/|–—]+)$`));
    if (!m) break;
    const seg = fold(m[1]);
    const isVenue = seg === venue || (seg.length >= 4 && venue.startsWith(seg + ' '));
    if (!isVenue && !CITY.has(seg)) break;
    t = t.slice(0, m.index);
  }

  t = t.replace(/\s{2,}/g, ' ').trim();
  return t.length >= 2 ? t : title;
}
