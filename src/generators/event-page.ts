/**
 * Individual Event Page Generator
 *
 * Generates individual event detail pages at /events/[slug]/
 * with full Schema.org markup, OG tags, and internal linking.
 *
 * Slug format: [event-id-prefix]-[venue-slug]-[title-slug]
 * The event ID prefix ensures URL stability when titles change.
 */

import { mkdirSync, existsSync, readFileSync } from 'fs';
import he from 'he';
import { writeFileIfChangedSync, writeHtmlIfChangedSync } from '../utils/write-if-changed';
import { join } from 'path';
import type { Event } from '../types';
import { generatePracticalBlock } from './practical-block';
import { formatGreekDateOnly, formatGreekTime, formatPriceGreek } from '../utils/i18n';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { formatDateOnly, formatPrice } from '../utils/i18n-date';
import { STRINGS, type Locale } from '../i18n/strings';
import { getAthensTimezone, formatSchemaDate, SCHEMA_TYPE_MAP, VENUE_TYPE_MAP } from '../enrichment/quality-gates';
import { stripInfoTable } from '../utils/description-utils';
import { generateEventMetaDescription } from '../utils/meta-descriptions';
import { normalizeGreek } from '../utils/normalize-greek';
import { getVenueIdentity } from '../utils/venue-identity';
import { findVenueConfig } from '../quality/location-filter';
import { displayNeighborhood } from '../utils/neighborhoods';
import { buildContainedInPlace, resolveEventStatus, getCountryCode, getRegionName, getLocalityName, buildSiteOrganizationGraphMember } from '../utils/schema-geo';
import { extractHost } from '../utils/ticket-source-classifier';
import { buildOfferOrOmit } from '../ticketing/offer-builder';
import { classifyEventLifecycle, shouldNoindexEvent } from '../utils/event-lifecycle';
import { validateEventSchema, logValidationSummary, type SchemaValidationResult } from '../utils/schema-validator';
import { getOgImage } from '../utils/og-image-fallback';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks, renderCssLink } from '../templates/site-chrome';
import { resolveCtaForEvent } from '../ticketing/cta';
import { renderSearchOverlay, renderSearchScript } from '../templates/search-overlay';
import { BADGE_LABELS, LIGHT_TEXT_BADGES, TYPE_ICONS } from '../templates/page';
import { getPerformerSameAs } from '../utils/performer-sameAs';
import { renderActionBarHtml, renderCardSaveButton, renderSavedEventsScript, renderSaveButtonScript, renderCardSaveScript, renderShareButtonScript, escapeAttr, CALENDAR_ICON } from '../templates/action-bar';
import { renderCornerstoneLinksHtml } from '../utils/cornerstone-links';

const DIST_DIR = join(import.meta.dir, '../../dist');
import { BASE_URL } from '../config/site-url';
import { generateIcs, buildGCalUrl, buildOutlookUrl } from '../utils/calendar-times';
import { renderAnalytics } from '../config/analytics';

// Load IndexNow config for Bing WMT verification
const indexNowConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/indexnow.json'), 'utf-8')
);
const bingVerification: string = indexNowConfig.bing_wmt_verification || '';

// Load source attribution display names
const sourceAttributionMap: Record<string, string> = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/source-attribution.json'), 'utf-8')
);

// Default OG images by event type
const DEFAULT_OG_IMAGES: Record<string, string> = {
  concert: '/images/og/concert-default.png',
  dj_set: '/images/og/dj-set-default.png',
  classical: '/images/og/classical-default.png',
  opera: '/images/og/opera-default.png',
  theater: '/images/og/theater-default.png',
  dance: '/images/og/dance-default.png',
  comedy: '/images/og/comedy-default.png',
  exhibition: '/images/og/exhibition-default.png',
  screening: '/images/og/screening-default.png',
  cinema: '/images/og/cinema-default.png',
  workshop: '/images/og/workshop-default.png',
  show: '/images/og/show-default.png',
  festival: '/images/og/festival-default.png',
  performance: '/images/og/performance-default.png',
  conference: '/images/og/conference-default.png',
  meetup: '/images/og/agentathens-default.png',
  hackathon: '/images/og/agentathens-default.png',
  seminar: '/images/og/agentathens-default.png',
  default: '/images/og/agentathens-default.png'
};

// Type translations — now sourced from i18n/strings.ts
// Kept as module-level aliases for backward compat (other modules may import)
const TYPE_TRANSLATIONS = STRINGS.el.typeLabels;
const TYPE_DISCOVERY_LABELS = STRINGS.el.typeDiscoveryLabels;

// Type to category slug mapping for internal links
const TYPE_TO_CATEGORY: Record<string, string> = {
  concert: 'concerts',
  dj_set: 'clubs',
  theater: 'theatre',
  exhibition: 'exhibitions',
  screening: 'screenings',
  cinema: 'cinema',
  workshop: 'workshops',
  show: 'comedy',
  festival: 'concerts',
  performance: 'performances',
  tech: 'tech',
  other: ''
};

/**
 * Slugify — moved to src/utils/normalize-greek.ts during S146 to break a
 * venue-identity ↔ event-page circular import. Re-exported here for back-compat
 * with callers (venue-page.ts, search-index.ts) that already import from this
 * module. Internal uses below also resolve to the same binding.
 */
import { slugify } from '../utils/normalize-greek';
export { slugify };

/**
 * Generate a stable slug for an event
 * Format: [id-prefix]-[venue-slug]-[title-slug]
 *
 * S146 / GEO ruling 2026-05-22: INTENTIONAL DIVERGENCE.
 *
 * This function uses raw `slugify(venue.name)` for backwards compatibility —
 * event URLs like `4fe49f93--burger-project-volume-4` are LIVE indexed-
 * eligible URLs (~280 Megaron events alone). Changing this slug rewrites
 * every Greek-venue event URL, which is a separate "axis 3" live-URL
 * migration outside S146's scope (additive-only).
 *
 * All other venue-identity sites (@id, organizer, venue page route, HTML
 * hrefs, search-index venue records) use getVenueIdentity() which returns
 * curated config.slug, latin slugify, Greek transliteration, or a hash
 * fallback — see src/utils/venue-identity.ts and plans/s146-venue-purring-fox.md §3.
 *
 * DO NOT "unify" these two slug computations without a live-URL migration
 * plan. The `--` (double dash) in event URLs for Greek venues is COSMETIC;
 * the empty `@id` segment was IDENTITY-BREAKING. S146 fixed identity,
 * deferred cosmetics.
 */
export function generateEventSlug(event: Event): string {
  const idPrefix = event.id.substring(0, 8);
  const venueSlug = slugify(event.venue.name);
  const titleSlug = slugify(event.title);
  return `${idPrefix}-${venueSlug}-${titleSlug}`;
}

/**
 * Build the Schema.org JSON-LD object for an individual event.
 *
 * Returns the hydrated object form so consumers can either serialize
 * (see `generateEventSchema`) or embed directly (e.g. DataFeed wraps
 * these as `dataFeedElement[]` entries — see `src/generators/datafeed.ts`).
 */
function buildEventSchemaObject(event: Event, locale: Locale = 'el'): Record<string, any> {
  const schemaType = SCHEMA_TYPE_MAP[event.type] || 'Event';
  const eventSlug = generateEventSlug(event);

  // formatSchemaDate handles all inputs: date-only passthrough (no midnight
  // timestamp for all-day exhibitions), naive-ts + DST-aware offset, tz-aware
  // passthrough, malformed throws.
  const startDate = formatSchemaDate(event.startDate, event.timeDoors || event.timePeak || undefined);

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    'name': event.title,
    'description': locale === 'en'
      ? (event.fullDescriptionEn || event.description || event.title)
      : (event.fullDescriptionGr || event.fullDescription || event.description || event.title),
    'startDate': startDate,
    'eventStatus': resolveEventStatus(event.startDate, event.endDate, event.type),
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    'inLanguage': locale === 'en' ? 'en' : 'el',
    'url': `${BASE_URL}${locale === 'en' ? '/en' : ''}/events/${eventSlug}/`,
    'location': {
      '@type': VENUE_TYPE_MAP[schemaType] || 'EventVenue',
      'name': event.venue.name,
      'address': {
        '@type': 'PostalAddress',
        // 2.2: fall back to the whitelisted config address when the scraped DB
        // venue_address is empty — closes GSC "missing address in location" for
        // verified venues whose row carries no address (Bolivar, Cantina, etc.).
        'streetAddress': event.venue.address || findVenueConfig(event.venue.name)?.address || '',
        // S145: locality now config-driven via getLocalityName() (was hardcoded 'Athens').
        // Single source of truth shared with microdata block below (Constitution Rule 6).
        'addressLocality': getLocalityName(),
        'addressRegion': getRegionName(),
        'addressCountry': getCountryCode()
      },
      'containedInPlace': buildContainedInPlace(event.venue.neighborhood),
      ...(event.venue.sameAs && event.venue.sameAs.length > 0 ? { sameAs: event.venue.sameAs } : {})
    }
  };

  // Add end date for exhibitions. Passes through date-only to emit all-day
  // Schema.org endDate (matches startDate passthrough).
  if (event.endDate) {
    schema.endDate = formatSchemaDate(event.endDate);
  }

  // 1.3b: endDate=startDate proxy is honest only for genuinely single-day
  // events. Multi-day types (exhibition, festival) without a real end_date are
  // NOT one-day — emitting the proxy would assert a false 1-day span. Leave
  // endDate absent for those (honest absence); the validator surfaces a
  // type-conditional WARN. Single-occurrence types keep the proxy (correct).
  const MULTI_DAY_TYPES = new Set(['exhibition', 'festival']);
  if (!schema.endDate && !MULTI_DAY_TYPES.has(event.type)) {
    schema.endDate = startDate;
  }

  // Add door time if available
  if (event.timeDoors) {
    schema.doorTime = formatSchemaDate(event.startDate.split('T')[0], event.timeDoors);
  }

  // Add coordinates if available
  if (event.venue.coordinates) {
    schema.location.geo = {
      '@type': 'GeoCoordinates',
      'latitude': event.venue.coordinates.lat,
      'longitude': event.venue.coordinates.lon
    };
  }

  // S134 — single emission gate: classifier-gated Offer (with-ticket) +
  // venue-seller Offer (open/donation) + EventCompleted omission, all routed
  // through buildOfferOrOmit. Unclassifiable-merchant URLs trigger Offer
  // omission per the 2026-05-11 Strategist decision; isAccessibleForFree
  // continues to carry the with-ticket signal independently of Offer presence.
  schema.isAccessibleForFree = event.price.type === 'open' || event.price.type === 'donation';

  const offerDecision = buildOfferOrOmit({
    price: event.price,
    ticketUrl: event.ticketUrl,
    ticketUrlResolved: event.ticketUrlResolved,
    venue: { name: event.venue.name, website: event.venue.website },
    eventStatus: schema.eventStatus,
    selfCanonicalUrl: `${BASE_URL}/events/${eventSlug}/`,
  });

  if ('offer' in offerDecision) {
    schema.offers = offerDecision.offer;
  }
  // omit → no schema.offers; isAccessibleForFree:false (already set above) carries the with-ticket signal.

  // Add image if available
  const ogImage = getOgImage(event);
  if (ogImage) {
    schema.image = ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`;
  }

  // Add performer sameAs if available (concerts, dj_sets, festivals, performances, shows, dance)
  const performer = getPerformerSameAs(event.title, event.type);
  if (performer) {
    schema.performer = performer;
  }

  return schema;
}

/**
 * Build the `@graph` envelope for an event detail page (S139 stage 1).
 *
 * Per S138 Section 2.3 + Strategist Q2/Q4/Q5 rulings (2026-05-19):
 *   Member 1 (FIRST):  Event entity, `@id` = `${eventCanonicalUrl}#event`
 *   Member 2:          Place/MusicVenue venue entity, `@id` = `${venueCanonicalUrl}#venue`
 *                      (emitted only when venue has a canonical page; gated by
 *                      `event.venue.address` — same gate as `venue-page.ts`)
 *   Member 3:          (Offer stays nested inline on Event.offers — anonymous,
 *                      event-scoped; no @id, so cross-reference is meaningless)
 *   Member 4:          Seller `Organization`, `@id` = `https://{host}/#organization`
 *                      (emitted only when Offer.seller has a parseable URL host)
 *   Member 5:          organizer — bare-@id reference to the canonical venue node
 *                      (member 2), emitted on the Event entity (not as a separate
 *                      @graph member). Conditional on `event.venue.sameAs` being
 *                      non-empty (Component-B venues); legitimate absence
 *                      otherwise. Bare-@id is acceptable here because organizer
 *                      is OPTIONAL per Schema.org (S142, Strategist 2026-05-22).
 *   Member 6 (LAST):   Site-publisher `Organization`,
 *                      `@id` = `${BASE_URL}/#organization`
 *
 * Event.location becomes a `{"@id": ...}` reference to member 2 when the
 * venue is materialized as a separate graph member; otherwise stays inline
 * (Section 2.4 same-page-materialization rule). containedInPlace chain
 * stays nested inline within the venue entity per Section 2.1.
 *
 * `buildEventSchemaObject` (used by DataFeed + validator) is preserved
 * unchanged — its contract is the flat Event entity. This wrapper composes
 * the @graph envelope around that entity for HTML emission only.
 */
function buildEventGraphEnvelope(event: Event, locale: Locale = 'el', pagedVenueSlugs?: Set<string>): Record<string, any> {
  const eventSlug = generateEventSlug(event);
  const eventCanonicalUrl = `${BASE_URL}/events/${eventSlug}/`;

  // Shallow-copy the flat Event entity so we can replace @context with @id
  // without mutating buildEventSchemaObject's return value (DataFeed reads it
  // via a separate call, so cross-call safety is intact regardless; this is
  // just defensive against future intra-call reuse).
  const flatEvent = buildEventSchemaObject(event, locale);
  const eventEntity: Record<string, any> = { ...flatEvent };
  delete eventEntity['@context'];
  eventEntity['@id'] = `${eventCanonicalUrl}#event`;

  const graph: Record<string, any>[] = [eventEntity];

  // Q4 ruling: venue @id derives from dist/venues/{slug}/ path. Gate is
  // `event.venue.address` — same gate venue-page.ts uses for schema emission.
  // When the gate passes, materialize venue as a separate graph member with
  // duplicated address/geo/containedInPlace (Section 2.4 same-page rule) and
  // replace Event.location with an @id reference.
  if (event.venue.address) {
    // S146: venue identity slug routes through getVenueIdentity (single source
    // of truth) — config.slug → latin slugify → Greek transliteration → hash
    // fallback. Always non-empty by construction; the empty-@id collision
    // class is mathematically impossible at this point.
    const venueSlug = getVenueIdentity(event.venue).slug;
    const venueId = `${BASE_URL}/venues/${venueSlug}/#venue`;
    // S146 page-existence gate. url field is OPTIONAL per Schema.org — when
    // the venue has no page (transliterated-only Greek venues, hash-fallback
    // degenerates), omit url rather than emit a dangling link. pagedVenueSlugs
    // undefined → permissive default (test convenience). Production orchestrator
    // ALWAYS threads the set; validator (§4) catches any forgotten wiring.
    const hasPage = pagedVenueSlugs ? pagedVenueSlugs.has(venueSlug) : true;
    const inlineLocation = eventEntity.location;

    const venueEntity: Record<string, any> = {
      '@type': inlineLocation['@type'],
      '@id': venueId,
      'name': inlineLocation.name,
      'address': inlineLocation.address,
      'containedInPlace': inlineLocation.containedInPlace,
    };
    if (hasPage) venueEntity.url = `${BASE_URL}/venues/${venueSlug}/`;
    if (inlineLocation.geo) venueEntity.geo = inlineLocation.geo;
    if (inlineLocation.sameAs) venueEntity.sameAs = inlineLocation.sameAs;

    // S143 (Strategist 2026-05-20): Event.location materializes inline-with-@id —
    // inline name + address (rich-result-required set), retain @id; geo/sameAs/
    // containedInPlace/url stay on the canonical venue node and reach graph
    // consumers via @id merge. validator.schema.org resolves @id same-page; GSC's
    // rich-result parser does not, so required-inline satisfies both gates. Inline
    // address reuses inlineLocation.address (single source — byte-identical to the
    // canonical node's address at :296, avoiding ambiguous-merge risk).
    eventEntity.location = {
      '@type': inlineLocation['@type'],
      '@id': venueId,
      'name': inlineLocation.name,
      'address': inlineLocation.address,
    };
    graph.push(venueEntity);

    // S142: organizer as bare-@id field reference to the canonical venue node
    // (member 2 — already pushed). Component-B-gated: emit only when the venue
    // has identity refs (sameAs populated); legitimate absence on latent venues.
    // Bare-@id is intentional — organizer is OPTIONAL per Schema.org, so an
    // unresolved @id would be cosmetic, not eligibility-breaking (opposite side
    // of the inline-required line that Event.location sits on per S143). The
    // referenced #venue fragment is already in @graph above, so S141's orphan
    // rule (ORPHAN_SCOPED_FRAGMENTS includes 'organizer') passes by construction.
    //
    // S146: the slug-non-empty guard added by S142 is now mathematically
    // satisfied by getVenueIdentity (hash fallback ensures non-empty by
    // construction). Kept as defensive belt-and-braces. Organizer remains a
    // bare-@id reference (NOT a navigable href) — valid against identity-only
    // nodes (transliterated Greek venues), since Component-B's sameAs/identity
    // moat thesis attaches to the venue node regardless of page existence.
    // DO NOT gate this on pagedVenueSlugs — bare-@id references are valid
    // even when no page exists for the referenced @id (S142 comment block
    // above explains the inline-required vs optional-bare-@id distinction).
    if (venueSlug && event.venue.sameAs && event.venue.sameAs.length > 0) {
      eventEntity.organizer = { '@id': venueId };
    }
  }

  // Q5 ruling: seller @id = `https://{host}/#organization` where host comes
  // from the seller URL produced by classifyTicketSource (reuse of S134
  // classifier output, no parallel registry). When seller has no URL
  // (venue_direct seller whose venue lacks a website), leave inline anonymous.
  if (eventEntity.offers && eventEntity.offers.seller) {
    const seller = eventEntity.offers.seller;
    const sellerHost = extractHost(seller.url);
    if (sellerHost) {
      const sellerOrgId = `https://${sellerHost}/#organization`;
      const sellerEntity: Record<string, any> = {
        '@type': 'Organization',
        '@id': sellerOrgId,
        'name': seller.name,
        'url': seller.url,
      };
      // Replace inline seller with @id reference (shallow-copy offers to avoid
      // mutating the OfferDecision return).
      eventEntity.offers = { ...eventEntity.offers, seller: { '@id': sellerOrgId } };
      graph.push(sellerEntity);
    }
  }

  // Member 6 (LAST): site-publisher Organization. Singleton per page; identity
  // fixed at `${BASE_URL}/#organization` so cross-page resolution converges.
  graph.push(buildSiteOrganizationGraphMember());

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

/**
 * Generate Schema.org JSON-LD string for an individual event page HTML.
 *
 * S139 stage 1: returns the @graph envelope, not the flat Event entity.
 * For consumers that need the flat Event entity (DataFeed at
 * `src/generators/datafeed.ts`, schema-validator at `src/utils/schema-validator.ts`),
 * call `buildEventSchemaObject` directly.
 */
function generateEventSchema(event: Event, locale: Locale = 'el', pagedVenueSlugs?: Set<string>): string {
  return JSON.stringify(buildEventGraphEnvelope(event, locale, pagedVenueSlugs), null, 2);
}

/**
 * Render the event detail HTML template (Phase 3 redesign)
 *
 * Structure: full-bleed hero with type-colored gradient, 800px content column,
 * card-grid related events, mobile sticky CTA bar.
 */
export function renderEventDetailPage(event: Event, relatedEvents: Event[], locale: Locale = 'el', pagedVenueSlugs?: Set<string>): string {
  const t = STRINGS[locale];
  const slug = generateEventSlug(event);
  // S144 (GEO 2026-05-21): canonical is locale-aware self.
  // /en/ pages canonicalize to /en/events/{slug}/; bare-root pages to /events/{slug}/.
  // Previously bare-root-only canonical was a cross-locale violation that excluded
  // /en/ from GSC eligibility. Locale prefix should source from city config when
  // Constitution Rule 6 city-agnostic refactor lands (Sprint 3/4); inline literal
  // here is the cleanup path.
  const localePrefix = locale === 'en' ? '/en' : '';
  const canonicalUrl = `${BASE_URL}${localePrefix}/events/${slug}/`;
  const ogImage = getOgImage(event);
  const schemaJson = generateEventSchema(event, locale, pagedVenueSlugs);
  const practicalBlock = generatePracticalBlock(event, null, locale);
  const schemaType = SCHEMA_TYPE_MAP[event.type] || 'Event';

  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  // Lifecycle: past events get banner + hidden CTAs (isPast).
  // S144: noindex now phase-keyed (cooling/archive only) — NOT tied to isPast.
  // Just-passed (Day 1-14) events are still indexable per GEO 45-Day Lifecycle.
  const lifecycle = classifyEventLifecycle(event);
  const isPast = lifecycle !== 'upcoming';
  const shouldNoindex = shouldNoindexEvent(event);

  // Date display — locale-aware
  const timeStr = event.startDate.includes('T')
    ? formatGreekTime(event.startDate)
    : (event.timeDoors || '');
  const exhibitionLocale = locale === 'en' ? 'en-US' : 'el-GR';
  const dateDisplay = isExhibition
    ? formatExhibitionDateRange(event, exhibitionLocale)
    : `${formatDateOnly(event.startDate, locale)}${timeStr ? ` ${t.atTime} ${timeStr}` : ''}`;

  // Type styling
  const typeLabel = t.typeLabels[event.type] || event.type;
  const categorySlug = TYPE_TO_CATEGORY[event.type] || '';
  const typeColorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type);

  // Price display
  const priceDisplay = formatPrice(event, locale);

  // Description content — locale-aware selection
  // English pages use fullDescriptionEn, Greek pages use fullDescriptionGr (fallback to fullDescription)
  const descriptionSource = locale === 'en'
    ? event.fullDescriptionEn
    : (event.fullDescriptionGr || event.fullDescription);
  const hasFullDescription = descriptionSource && descriptionSource.length > 100;
  // Detect English fallback on Greek pages: Greek page, no native Greek column, English exists
  const isEnglishFallback = locale === 'el' && !event.hasNativeGreek && Boolean(event.fullDescriptionEn);
  let descriptionHtml: string;
  let hiddenMetadataHtml = '';
  if (hasFullDescription) {
    const { narrative, metadataHtml } = stripInfoTable(String(descriptionSource));
    const fallbackLabel = isEnglishFallback ? '<p class="edp-lang-notice">Περιγραφή στα Αγγλικά</p>\n' : '';
    descriptionHtml = fallbackLabel + narrative.split('\n\n').map(para => `<p>${para.trim()}</p>`).join('\n');
    hiddenMetadataHtml = metadataHtml;
  } else {
    descriptionHtml = `<p>${event.description}</p>`;
  }

  // Read-more for long descriptions
  const descriptionText = hasFullDescription ? String(descriptionSource) : event.description;
  const needsReadMore = descriptionText.length > 400;

  // S146: venue identity routes through getVenueIdentity. HTML hrefs gated on
  // pagedVenueSlugs — emit anchor only when the venue page actually exists,
  // else drop the "More events at X" navLink entry (filter(Boolean) below
  // already strips empty strings).
  const venueSlug = getVenueIdentity(event.venue).slug;
  const venueHasPage = pagedVenueSlugs ? pagedVenueSlugs.has(venueSlug) : true;

  const navLinks = [
    categorySlug ? `<a href="/${categorySlug}/">${t.typeDiscoveryLabels[event.type] || typeLabel}</a>` : '',
    venueHasPage ? `<a href="/venues/${venueSlug}/">${t.moreEventsAt} ${event.venue.name}</a>` : ''
  ].filter(Boolean);

  // CTA — resolved via tiered cascade (see src/ticketing/cta.ts)
  const cta = resolveCtaForEvent(event, t);
  const ctaLinkable = !isPast && cta.kind !== 'none' && cta.href;
  const ctaHtml = ctaLinkable
    ? `<a href="${cta.href}" class="edp-cta edp-cta-hero" rel="noopener" target="_blank">${cta.label}</a>`
    : '';

  // Inline CTA for body content (GEO source order: after description, before venue)
  const inlineCtaHtml = isPast
    ? ''
    : ctaLinkable
      ? `<div class="edp-inline-cta"><a href="${cta.href}" class="edp-cta" rel="noopener" target="_blank">${cta.label}</a></div>`
      : cta.kind === 'door'
        ? `<div class="edp-inline-cta"><span class="edp-door-only">${cta.label}</span></div>`
        : event.price.type === 'open'
          ? `<div class="edp-inline-cta"><span class="edp-open-entry">${t.openEntry}</span></div>`
          : '';

  // Venue section — Google Maps link
  const mapsUrl = event.venue.coordinates
    ? `https://www.google.com/maps?q=${event.venue.coordinates.lat},${event.venue.coordinates.lon}`
    : `https://www.google.com/maps/search/${encodeURIComponent(event.venue.name + ' Athens')}`;

  // Source attribution — use display name from mapping, fall back to raw ID
  const sourceDisplayName = sourceAttributionMap[event.source] || event.source;
  const sourceHtml = event.url
    ? `<div class="edp-source">${t.source}: <a href="${event.url}" rel="noopener" target="_blank">${sourceDisplayName}</a></div>`
    : `<div class="edp-source">${t.source}: ${sourceDisplayName}</div>`;

  // Related events as cards
  const relatedHtml = relatedEvents.length > 0
    ? `
      <section class="edp-related">
        <h2>${t.upcomingEventsAt} ${event.venue.name}</h2>
        <div class="card-grid">
          ${relatedEvents.map(e => renderRelatedEventCard(e, locale)).join('\n')}
        </div>
      </section>`
    : '';

  // Mobile sticky CTA bar — only render when we have a linkable CTA
  const mobileLabel = cta.kind === 'tickets' ? t.ticketsShort : cta.label;
  const mobileBarHtml = ctaLinkable
    ? `<div class="edp-mobile-bar">
    <div class="edp-mobile-bar-inner">
      <div class="edp-mobile-bar-info">
        <div class="edp-mobile-bar-title">${event.title}</div>
        <div class="edp-mobile-bar-price">${priceDisplay}</div>
      </div>
      <a href="${cta.href}" class="edp-cta" rel="noopener" target="_blank">${mobileLabel}</a>
    </div>
  </div>`
    : '';

  // S144 (GEO 2026-05-21): hreflang DROPPED until Greek launches as a real product.
  // GEO ruling: hreflang trigger is published + indexable + quality-gated, not
  // "Greek bytes exist." Dormant-Greek bare-root pages don't qualify; emitting
  // alternates to a noindex Greek alternate builds an inconsistent cluster
  // (Google may down-rank /en/ from associating with a noindex alternate).
  // Re-emit per decisions.md 2026-05-21 when Greek-as-product ships.
  const hreflangHtml = '';

  // 1.5a: meta/title attributes carry event-derived free text that can contain raw
  // double-quotes (which truncate the HTML attribute at the first ") and, on
  // pre-S154 DB rows, undecoded entities. Normalize via he.decode (idempotent
  // on already-decoded text) then escapeAttr so emission is uniformly correct
  // regardless of the row's encoding state. Composer stays plain-text.
  const metaDescription = escapeAttr(he.decode(generateEventMetaDescription(event)));
  const safeMetaTitle = escapeAttr(he.decode(event.title));
  const safeVenueName = escapeAttr(he.decode(event.venue.name));

  return `<!DOCTYPE html>
<html lang="${t.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="view-transition" content="same-origin">
  ${renderFaviconLinks()}
  ${renderFontLinks()}
  ${renderCssLink()}

  <title>${safeMetaTitle} | ${safeVenueName} | agent-athens</title>
  <meta name="description" content="${metaDescription}">
  ${shouldNoindex ? '<meta name="robots" content="noindex">' : ''}

  <!-- Canonical URL (single source of truth, locale-aware self per S144) -->
  <link rel="canonical" href="${canonicalUrl}">
  ${hreflangHtml}

  <!-- Open Graph -->
  <meta property="og:title" content="${safeMetaTitle}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="event">
  <meta property="og:image" content="${ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="${t.ogLocale}">
  <meta property="og:site_name" content="agent-athens">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeMetaTitle}">
  <meta name="twitter:description" content="${metaDescription}">
  <meta name="twitter:image" content="${ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`}">

  <!-- GEO: Location metadata -->
  <meta name="geo.region" content="GR-I">
  <meta name="geo.placename" content="Athens">
  ${bingVerification ? `<meta name="msvalidate.01" content="${bingVerification}">` : ''}

  <!-- Freshness signals -->
  <meta name="date" content="${new Date().toISOString().split('T')[0]}">

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  ${schemaJson}
  </script>
${renderAnalytics()}
</head>
<body>
  ${renderSiteNav(locale)}
  ${renderHamburgerMenu(locale)}
  ${renderSearchOverlay()}

  <main>
  <article id="main-content" tabindex="-1"${isPast ? ' data-past="true"' : ''}>
    <section class="edp-hero" style="--edp-type-color: ${typeColorVar}">
      <div class="edp-hero-bg" style="background-image: url('${ogImage.startsWith('http') ? ogImage : ogImage}')"></div>
      <div class="edp-hero-inner">
        <nav class="edp-breadcrumb">
          <a href="/">agent-athens</a>
          ${categorySlug ? ` › <a href="/${categorySlug}/">${typeLabel}</a>` : ''}
          › ${event.venue.name}
        </nav>
        <span class="edp-type-badge${lightText ? ' edp-type-badge--light-text' : ''}">${typeLabel}</span>
        ${exhibitionIsOpen ? `<span class="edp-open-badge">${t.currentlyOpen}</span>` : ''}
        <header>
          <h1 class="edp-title">${event.title}</h1>
          <div class="edp-meta">
            <span class="edp-meta-date"><time datetime="${event.startDate}">${dateDisplay}</time></span>
            · ${venueHasPage ? `<a href="/venues/${venueSlug}/">${event.venue.name}</a>` : event.venue.name}
            · ${priceDisplay}
          </div>
          ${ctaHtml}
          ${(() => {
            const actionBar = renderActionBarHtml(event.id, slug, event.title, canonicalUrl, locale);
            const gcalUrl = buildGCalUrl(event, canonicalUrl);
            const outlookUrl = buildOutlookUrl(event, canonicalUrl);
            const icsHref = `/events/${slug}/event.ics`;
            const calendarDisclosure = `<details class="cal-disclosure">
            <summary class="cal-disclosure__summary edp-calendar-btn" aria-label="${t.addToCalendar}">
              ${CALENDAR_ICON}
              <span class="edp-calendar-label">${t.addToCalendar}</span>
            </summary>
            <div class="cal-disclosure__panel" role="group" aria-label="${t.addToCalendar}">
              <a class="cal-disclosure__option" href="${escapeAttr(gcalUrl)}" target="_blank" rel="noopener">${t.calendarGoogle}</a>
              <a class="cal-disclosure__option" href="${icsHref}" download>${t.calendarAppleIcs}</a>
              <a class="cal-disclosure__option" href="${escapeAttr(outlookUrl)}" target="_blank" rel="noopener">${t.calendarOutlook}</a>
            </div>
          </details>`;
            return actionBar.replace('</div>', `${calendarDisclosure}</div>`);
          })()}
        </header>
      </div>
    </section>

    ${isPast ? `<div class="event-passed-banner" role="status">
      <p>${t.eventEnded}</p>
    </div>` : ''}

    <div class="edp-content">
      ${practicalBlock}

      <section class="edp-description${needsReadMore ? ' is-collapsed' : ''}">
        ${descriptionHtml}
        ${hasFullDescription ? '<div class="edp-enriched-badge">AI-enriched content</div>' : ''}
      </section>
      ${needsReadMore ? `<button class="edp-read-more" type="button" data-more="${t.readMore}" data-less="${t.readLess}">${t.readMore}</button>` : ''}
      ${hiddenMetadataHtml}

      ${inlineCtaHtml}

      <section class="edp-venue-section">
        <h2>${event.venue.name}</h2>
        ${event.venue.address
          ? `<div class="edp-venue-address">${event.venue.address}</div>`
          : ''}
        ${event.venue.neighborhood ? `<div class="edp-venue-neighborhood">${displayNeighborhood(event.venue.neighborhood)}</div>` : ''}
        <a href="${mapsUrl}" class="edp-venue-maps" rel="noopener" target="_blank">${t.openMap}</a>
      </section>

      ${sourceHtml}

      <nav class="edp-connections" aria-label="${locale === 'en' ? 'Related pages' : 'Σχετικές σελίδες'}">
        <h2>${t.exploreMore}</h2>
        ${navLinks.join('\n        ')}
        ${renderCornerstoneLinksHtml(locale)}
      </nav>

      ${relatedHtml}
    </div>
  </article>
  </main>

  ${mobileBarHtml}

  ${renderSiteFooter(locale)}
  ${renderHamburgerScript()}
  ${renderSearchScript()}
  ${renderEventDetailScript()}
  ${renderSavedEventsScript()}
  ${renderSaveButtonScript()}
  ${renderCardSaveScript()}
  ${renderShareButtonScript()}
</body>
</html>`;
}

/**
 * Render a related event as a visual card (reuses browse-page card markup)
 */
export function renderRelatedEventCard(event: Event, locale: Locale = 'el'): string {
  const t = STRINGS[locale];
  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  let dateStr: string;
  if (isExhibition) {
    const exhibitionLocale = locale === 'en' ? 'en-US' : 'el-GR';
    dateStr = formatExhibitionDateRange(event, exhibitionLocale);
    if (exhibitionIsOpen) dateStr += ` · ${t.exhibitionOpenRelated}`;
  } else {
    dateStr = formatDateOnly(event.startDate, locale);
    const timeStr = event.startDate.includes('T') ? formatGreekTime(event.startDate) : '';
    if (timeStr && timeStr !== '00:00') dateStr += ` ${t.atTime} ${timeStr}`;
  }

  const priceText = formatPrice(event, locale);

  const slug = generateEventSlug(event);
  const href = `/events/${slug}/`;
  const badgeLabel = BADGE_LABELS[event.type] || BADGE_LABELS.other;
  const colorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type) ? ' card-badge--light-text' : '';
  const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;
  const venueText = event.venue.neighborhood
    ? `${event.venue.name} · ${displayNeighborhood(event.venue.neighborhood)}`
    : event.venue.name;

  const imgSrc = event.imageLocal || event.imageUrl || event.venueImage;

  return `
  <article class="event-card">
    ${imgSrc
      ? `<div class="card-image-wrapper" data-type="${event.type}">
      <img class="card-image" src="${imgSrc}" alt="${event.title}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display=''">
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? `<span class="card-badge-open">${t.currentlyOpenShort}</span>` : ''}
      ${renderCardSaveButton(event.id, slug, event.title)}
    </div>`
      : `<div class="card-image card-image--fallback" data-event-type="${event.type}">
      <span class="card-image__fallback-text" aria-hidden="true">${event.title}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? `<span class="card-badge-open">${t.currentlyOpenShort}</span>` : ''}
      ${renderCardSaveButton(event.id, slug, event.title)}
    </div>`}
    <div class="card-body">
      <h3 class="card-title"><a href="${href}" class="card-link">${event.title}</a></h3>
      <span class="card-date"><time datetime="${event.startDate}">${dateStr}</time></span>
      <span class="card-venue">${venueText}</span>
      <span class="card-price">${priceText}</span>
    </div>
  </article>`;
}

/**
 * Inline script for read-more toggle and mobile bar IntersectionObserver
 */
export function renderEventDetailScript(): string {
  return `<script>
(function() {
  var desc = document.querySelector('.edp-description.is-collapsed');
  var btn = document.querySelector('.edp-read-more');
  if (desc && btn) {
    btn.addEventListener('click', function() {
      var collapsed = desc.classList.toggle('is-collapsed');
      btn.textContent = collapsed ? (btn.dataset.more || 'Read more ▾') : (btn.dataset.less || 'Read less ▴');
    });
  }

  var heroCta = document.querySelector('.edp-cta-hero');
  var bar = document.querySelector('.edp-mobile-bar');
  if (heroCta && bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        bar.classList.toggle('is-visible', !e.isIntersecting);
      });
    }, { threshold: 0 }).observe(heroCta);
  }
})();
</script>`;
}

/**
 * Select the "upcoming at this venue" related-events list for an event page.
 * Max 6 events at the same venue, excluding the current event, soonest first.
 *
 * Note: callers pass pageableEvents (upcoming + past-active ≤45d retention),
 * so this list must filter to upcoming only — the block is titled
 * "Επόμενες εκδηλώσεις" and must never show past events.
 */
export function selectRelatedEvents(venueEvents: Event[], currentEventId: string): Event[] {
  return venueEvents
    .filter(e => e.id !== currentEventId)
    .filter(e => classifyEventLifecycle(e) === 'upcoming')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 6);
}

/**
 * Generate all individual event pages
 * Returns list of generated URLs for sitemap
 */
export async function generateEventPages(events: Event[], pagedVenueSlugs?: Set<string>): Promise<{
  urls: string[];
  slugMap: Map<string, string>;  // eventId -> current slug
  pastEventUrls: Set<string>;    // URLs of past-active events (for sitemap priority)
}> {
  const eventsDir = join(DIST_DIR, 'events');
  if (!existsSync(eventsDir)) {
    mkdirSync(eventsDir, { recursive: true });
  }

  const urls: string[] = [];
  const slugMap = new Map<string, string>();
  const pastEventUrls = new Set<string>();

  // Group events by venue for related events lookup
  const eventsByVenue = new Map<string, Event[]>();
  for (const event of events) {
    const venueEvents = eventsByVenue.get(event.venue.name) || [];
    venueEvents.push(event);
    eventsByVenue.set(event.venue.name, venueEvents);
  }

  const schemaValidationResults: SchemaValidationResult[] = [];

  for (const event of events) {
    const slug = generateEventSlug(event);
    slugMap.set(event.id, slug);

    // Track past-active events for sitemap priority override
    const lifecycle = classifyEventLifecycle(event);
    // Per-URL parity: event pages are dist/events/SLUG/index.html (directory),
    // served at /events/SLUG/ — sitemap declared form must match.
    const urlPath = `events/${slug}/`;
    if (lifecycle !== 'upcoming') {
      pastEventUrls.add(urlPath);
    }

    // Get related events at same venue (max 6, excluding current)
    const venueEvents = eventsByVenue.get(event.venue.name) || [];
    const relatedEvents = selectRelatedEvents(venueEvents, event.id);

    // Generate page HTML
    const html = renderEventDetailPage(event, relatedEvents, 'el', pagedVenueSlugs);

    // Validate schema JSON-LD against the flat Event entity. validateEventSchema
    // operates on flat dot-paths (location.name, etc.); the @graph envelope used
    // in HTML emission isn't validator-shaped until Stage 5 lands flattenGraph.
    // Until then, validate the canonical Event entity directly.
    const flatSchemaJson = JSON.stringify(buildEventSchemaObject(event), null, 2);
    schemaValidationResults.push(validateEventSchema(flatSchemaJson, urlPath));

    // Create directory and write file
    const pageDir = join(eventsDir, slug);
    if (!existsSync(pageDir)) {
      mkdirSync(pageDir, { recursive: true });
    }
    writeHtmlIfChangedSync(join(pageDir, 'index.html'), html);
    writeFileIfChangedSync(join(pageDir, 'event.ics'), generateIcs(event, `${BASE_URL}/events/${slug}/`));

    urls.push(urlPath);
  }

  const pastCount = pastEventUrls.size;
  console.log(`  ✓ Generated ${urls.length} event pages (${pastCount} past-active with banner)`);
  logValidationSummary(schemaValidationResults);
  return { urls, slugMap, pastEventUrls };
}

/**
 * Load previous slug map for redirect generation
 */
export function loadSlugHistory(): Map<string, string[]> {
  const historyPath = join(DIST_DIR, '.slug-history.json');
  if (!existsSync(historyPath)) {
    return new Map();
  }

  try {
    const data = JSON.parse(readFileSync(historyPath, 'utf-8'));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

/**
 * Save slug map for future redirect generation
 */
export function saveSlugHistory(
  currentSlugs: Map<string, string>,
  previousHistory: Map<string, string[]>
): void {
  const historyPath = join(DIST_DIR, '.slug-history.json');

  // Merge current slugs into history
  const newHistory: Record<string, string[]> = {};

  for (const [eventId, currentSlug] of currentSlugs) {
    const previous = previousHistory.get(eventId) || [];
    // Keep only unique slugs, most recent first
    const allSlugs = [currentSlug, ...previous.filter(s => s !== currentSlug)];
    // Keep max 3 historical slugs (90 days worth)
    newHistory[eventId] = allSlugs.slice(0, 3);
  }

  writeFileIfChangedSync(historyPath, JSON.stringify(newHistory, null, 2));
}

/**
 * Generate redirect rules for changed slugs
 */
export function generateRedirects(
  currentSlugs: Map<string, string>,
  previousHistory: Map<string, string[]>
): string[] {
  const redirects: string[] = [];

  for (const [eventId, currentSlug] of currentSlugs) {
    const previousSlugs = previousHistory.get(eventId) || [];
    for (const oldSlug of previousSlugs) {
      if (oldSlug !== currentSlug) {
        // Generate 301 redirect
        redirects.push(`/events/${oldSlug}/* /events/${currentSlug}/:splat 301`);
      }
    }
  }

  return redirects;
}

// Exports for other modules
export { getAthensTimezone, generateEventSchema, buildEventSchemaObject, buildEventGraphEnvelope };
