import type { Event } from '../types';

/**
 * The build's view of an event: only what the site may state as fact.
 * Applied to the build population, never inside rowToEvent — scripts
 * round-trip rowToEvent output through upsertEvent, so policy there would
 * rewrite stored data.
 */
export function toPublishable(event: Event): Event {
  const out: Event = {
    ...event,
    description: stripComments(event.description) ?? '',
    fullDescription: stripComments(event.fullDescription),
    fullDescriptionEn: stripComments(event.fullDescriptionEn),
    fullDescriptionGr: stripComments(event.fullDescriptionGr),
  };
  // A venue-wide default (e.g. €25 on every megaron.gr row) is not this
  // event's price: keep "ticketed", drop the number.
  if (event.priceSource === 'venue_default') {
    out.price = { ...event.price, amount: undefined, range: undefined };
  }
  return out;
}

// Enrichment appends machine markers such as <!-- timeliness-expires: … -->.
function stripComments(text: string | undefined): string | undefined {
  return text === undefined ? undefined : text.replace(/[ \t]*<!--[\s\S]*?(?:-->|$)[ \t]*/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
