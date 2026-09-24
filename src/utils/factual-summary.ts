/**
 * Factual summary for event pages that have no description.
 *
 * Built ONLY from stored structured fields: type, title, start date/time,
 * venue name + neighbourhood, price category, and an exhibition's run dates.
 * A missing or unreadable field drops its clause — nothing is inferred, and
 * no placeholder stands in for it. Phrasing lives in STRINGS so the Greek
 * page reads Greek and the /en/ page reads English. Plain text: callers
 * escape at their emission boundary.
 */
import type { Event } from '../types';
import { STRINGS, type Locale } from '../i18n/strings';
import { displayTitle } from './display-title';
import { displayNeighborhood } from './neighborhoods';
import { normalizeGreek } from './normalize-greek';
import { formatDateOnly } from './i18n-date';
import { formatGreekTime } from './i18n';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const CLOCK = /^\d{2}:\d{2}/;
const OPENING_QUOTES = /^[«"“'‘]/;

const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');

function readableDate(value: string | undefined, locale: Locale): string {
  return value && ISO_DATE.test(value) ? formatDateOnly(value, locale) : '';
}

/** Same clock the page's date line shows: the start's own time, else the stored door time. */
function clockTime(event: Event): string {
  const own = formatGreekTime(event.startDate);
  if (own) return own;
  return event.timeDoors && CLOCK.test(event.timeDoors) ? event.timeDoors.slice(0, 5) : '';
}

export function buildFactualSummary(event: Event, locale: Locale): string {
  const t = STRINGS[locale];
  const typeLabel = t.typeLabels[event.type] || t.typeLabels.other;
  const title = displayTitle(event.title, event.venue?.name).trim();
  const [open, close] = t.summaryQuote;
  const quoted = OPENING_QUOTES.test(title) ? title : `${open}${title}${close}`;

  const venueName = (event.venue?.name || '').trim();
  let venueClause = '';
  if (normalizeGreek(venueName).includes('πολλαπλοι χωροι')) {
    venueClause = t.summaryMultipleVenues;
  } else if (venueName) {
    const hood = (event.venue.neighborhood || '').trim();
    const shownHood = hood ? (locale === 'el' ? displayNeighborhood(hood) : hood) : '';
    venueClause = fill(t.summaryAtVenue, { venue: venueName }) + (shownHood ? ` (${shownHood})` : '');
  }

  const sentences: string[] = [];
  const start = readableDate(event.startDate, locale);
  if (event.type === 'exhibition') {
    sentences.push(`${typeLabel} ${quoted}${venueClause}.`);
    const end = readableDate(event.endDate, locale);
    // Without a stated end the row's date may be one listed day of a longer
    // run (snfcc lists some shows day by day), not the opening: omit it.
    if (start && end) sentences.push(fill(t.summaryRuns, { start, end }));
  } else {
    const time = start ? clockTime(event) : '';
    const dateClause = start
      ? fill(t.summaryOnDate, { date: start }) + (time ? fill(t.summaryAtTime, { time }) : '')
      : '';
    sentences.push(`${typeLabel} ${quoted}${venueClause}${dateClause}.`);
  }

  const price = t.summaryPrice[event.price?.type as keyof typeof t.summaryPrice];
  if (price) sentences.push(price);
  return sentences.join(' ');
}
