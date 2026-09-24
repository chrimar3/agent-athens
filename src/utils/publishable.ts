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
  // residentadvisor returns 23:59 when the promoter gave no start time.
  if (event.source === 'residentadvisor' && event.startDate.slice(10, 16) === 'T23:59') {
    out.startDate = event.startDate.slice(0, 10);
    if (event.timeDoors === '23:59') out.timeDoors = undefined;
  }
  // Doors equal to the start is the start restated, not a door time.
  if (out.timeDoors && out.startDate.slice(11, 16) === out.timeDoors) {
    out.timeDoors = undefined;
  }
  return out;
}

// Enrichment appends machine markers such as <!-- timeliness-expires: … -->.
function stripComments(text: string | undefined): string | undefined {
  return text === undefined ? undefined : text.replace(/[ \t]*<!--[\s\S]*?(?:-->|$)[ \t]*/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
