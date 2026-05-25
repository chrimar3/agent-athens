import type { Event } from '../types';
import { slugify } from './normalize-greek';

/**
 * Get the OG image URL for an event.
 * Fallback chain: event image → venue default → per-event OG → type default → site default.
 *
 * Events without any photo get a branded per-event OG image (title/venue/date)
 * instead of the generic type default. Per-event OG images are generated
 * by generateEventOgImages() in og-image.ts during the build.
 *
 * Returns a path-relative URL (e.g. "/images/og/events/<slug>.png") or an
 * absolute URL (when event.imageUrl points at a remote source). Callers
 * are responsible for BASE_URL-prefixing path-relative values when an
 * absolute URL is required (schema emission, OG meta tags).
 *
 * Slug build is inlined here (NOT calling generateEventSlug) to keep this
 * util free of a circular import with src/generators/event-page.ts, which
 * imports getOgImage from here.
 */
export function getOgImage(event: Event): string {
  if (event.imageLocal) return event.imageLocal;
  if (event.imageUrl) return event.imageUrl;
  if (event.venueImage) return event.venueImage;
  const idPrefix = event.id.substring(0, 8);
  const venueSlug = slugify(event.venue.name);
  const titleSlug = slugify(event.title);
  return `/images/og/events/${idPrefix}-${venueSlug}-${titleSlug}.png`;
}
