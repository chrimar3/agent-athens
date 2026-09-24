import { escapeHtml } from '../utils/html-escape';
import { safeHttpUrl, firstSafeImageSrc } from '../utils/safe-url';
import { IMG_FALLBACK_ATTR, renderImageFallbackScript } from '../templates/image-fallback';
import { isSafeSlug, parseSlugHistory, SLUG_PATTERN } from '../validators/persisted-state';
import { displayTitle } from '../utils/display-title';
import { escapeJsonForHtml, decodeJsonLdEntities } from '../utils/html-json';
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
import { getEventTile } from './event-tile';
import { formatGreekDateOnly, formatGreekTime, formatPriceGreek } from '../utils/i18n';
import { formatExhibitionDateRange, isCurrentlyOpen } from '../utils/filters';
import { formatDateOnly, formatPrice } from '../utils/i18n-date';
import { STRINGS, type Locale } from '../i18n/strings';
import { getAthensTimezone, formatSchemaDate, VENUE_TYPE_MAP } from '../enrichment/quality-gates';
import { resolveEventSchemaType } from '../utils/comedy-format';
import { generateEventMetaDescription, cleanForMeta } from '../utils/meta-descriptions';
import { buildFactualSummary } from '../utils/factual-summary';
import { normalizeGreek } from '../utils/normalize-greek';
import { getVenueIdentity } from '../utils/venue-identity';
import { findVenueConfig } from '../quality/location-filter';
import { renderHreflangLinks } from '../utils/hreflang';
import { hostOf } from '../ticketing/validator';
import { displayNeighborhood } from '../utils/neighborhoods';
import { buildContainedInPlace, resolveEventStatus, getCountryCode, getRegionName, getLocalityName, buildSiteOrganizationGraphMember } from '../utils/schema-geo';
import { extractHost } from '../utils/ticket-source-classifier';
import { buildOfferOrOmit } from '../ticketing/offer-builder';
import { classifyEventLifecycle, shouldNoindexEvent, isRunImplyingType, resolveEffectiveEnd, getAthensTodayStr, selectListable } from '../utils/event-lifecycle';
import { validateEventSchema, logValidationSummary, type SchemaValidationResult } from '../utils/schema-validator';
import { schemaText } from '../utils/schema-text';
import { renderSiteNav, renderSiteFooter, renderHamburgerMenu, renderHamburgerScript, renderFaviconLinks, renderFontLinks, renderCssLink } from '../templates/site-chrome';
import { resolveCtaForEvent } from '../ticketing/cta';
import { renderSearchOverlay, renderSearchScript } from '../templates/search-overlay';
import { BADGE_LABELS, LIGHT_TEXT_BADGES, TYPE_ICONS } from '../templates/page';
import { getPerformerSameAs } from '../utils/performer-sameAs';
import { renderActionBarHtml, renderCardSaveButton, saveMetaFor, renderSavedEventsScript, renderSaveButtonScript, renderCardSaveScript, renderShareButtonScript, escapeAttr, CALENDAR_ICON } from '../templates/action-bar';
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
import { slugify, transliterateGreekId } from '../utils/normalize-greek';
export { slugify };

/**
 * slugify with Greek→Latin transliteration fallback; same 60-char cap as
 * slugify, plus a trailing-dash trim (the cap can sever a word mid-token and
 * leave a `-`). ELOT-derived via S146's contract-stable transliterateGreekId.
 * Used ONLY as the empty-fallback below — never unconditionally.
 */
function transliteratedSlugify(text: string): string {
  return transliterateGreekId(text).substring(0, 60).replace(/-+$/, '');
}

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
  // Empty-fallback (visibility 2026-07-19): raw slugify accent-strips then
  // drops all non-Latin chars, so a fully-Greek title/venue yields '' and the
  // URL collapses to a contentless `${idPrefix}--` (576 live URLs). Transliterate
  // ONLY when slugify() is empty — Latin/ASCII slugs short-circuit and stay
  // BYTE-IDENTICAL, so already-good URLs never churn (no new 301s, _redirects
  // stays under Netlify's ~10k ceiling). The idPrefix is untouched, so each
  // changed URL shares its old prefix and generateRedirects emits a clean 301.
  // Reversibility valve: SLUG_TRANSLITERATE=0 disables the fallback, reverting
  // to the pre-migration contentless slug. A rebuild+redeploy with the flag off
  // rolls the 2026-07-21 migration back with no code revert; the slug-history
  // seam then emits forced new→old 301s. Default (unset) = on. See docs/ROLLBACK.md.
  // Off ⇒ empty (reproduces the pre-migration `slugify(x)` result for Greek,
  // i.e. `${idPrefix}--`), NOT the raw text.
  const fallback = process.env.SLUG_TRANSLITERATE === '0'
    ? () => ''
    : transliteratedSlugify;
  const venueSlug = slugify(event.venue.name) || fallback(event.venue.name);
  const titleSlug = slugify(event.title) || fallback(event.title);
  return `${idPrefix}-${venueSlug}-${titleSlug}`;
}

/**
 * Per-event OG card path. og-image.ts renders the card for every imageless
 * pageable event at exactly this path, so both sides must derive it here. Any
 * other slug derivation (e.g. raw slugify without the transliteration fallback)
 * points og:image at a file that is never written.
 */
export function eventOgImagePath(event: Event): string {
  return `/images/og/events/${generateEventSlug(event)}.png`;
}

/** og:image / JSON-LD image: own photo → venue photo → generated per-event card. */
export function resolveEventOgImage(event: Event): string {
  return firstSafeImageSrc(event.imageLocal, event.imageUrl, event.venueImage) || eventOgImagePath(event);
}

/** Pair selected prose with its known language; a page locale is not a translation. */
function schemaDescription(event: Event, locale: Locale): { description: string; inLanguage?: string } {
  // Keep the same enrichment precedence as the visible page. fullDescriptionGr
  // can contain legacy English prose, so only hasNativeGreek establishes Greek.
  const description = locale === 'en'
    ? event.fullDescriptionEn || event.description || event.title
    : event.fullDescriptionGr || event.fullDescription || event.description || event.title;
  // Event.language is derived from enrichment availability in database.ts;
  // it does not establish the language of raw or legacy source prose.
  let inLanguage: Locale | undefined;
  if (locale === 'el' && event.hasNativeGreek && event.fullDescriptionGr) {
    inLanguage = 'el';
  } else if (event.fullDescriptionEn && description === event.fullDescriptionEn) {
    inLanguage = 'en';
  }
  return { description: descriptionPlainText(schemaText(description)), ...(inLanguage ? { inLanguage } : {}) };
}

/** Source attribution accepts HTTP(S) URLs without credentials or control characters. */
function sourceListingUrl(value?: string): string | undefined {
  return safeHttpUrl(value) ?? undefined;
}

/**
 * Build the Schema.org JSON-LD object for an individual event.
 *
 * Returns the hydrated object form so consumers can either serialize
 * (see `generateEventSchema`) or embed directly (e.g. DataFeed wraps
 * these as `dataFeedElement[]` entries — see `src/generators/datafeed.ts`).
 */
function buildEventSchemaObject(event: Event, locale: Locale = 'el'): Record<string, any> {
  const schemaType = resolveEventSchemaType(event); // S175: comedy-format derivation above EventType→@type
  const eventSlug = generateEventSlug(event);

  // formatSchemaDate handles all inputs: date-only passthrough (no midnight
  // timestamp for all-day exhibitions), naive-ts + DST-aware offset, tz-aware
  // passthrough, malformed throws.
  const startDate = formatSchemaDate(event.startDate, event.timeDoors || event.timePeak || undefined);

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    'name': schemaText(event.title),
    ...schemaDescription(event, locale),
    'startDate': startDate,
    'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
    '@id': `${BASE_URL}${locale === 'en' ? '/en' : ''}/events/${eventSlug}/#event`,
    'url': `${BASE_URL}${locale === 'en' ? '/en' : ''}/events/${eventSlug}/`,
    'location': {
      '@type': VENUE_TYPE_MAP[schemaType] || 'EventVenue',
      'name': schemaText(event.venue.name),
      'address': {
        '@type': 'PostalAddress',
        // Phase-2 B4 (visibility 2026-07-08): whitelist config is now the
        // AUTHORITATIVE address; the scraped row only fills unlisted venues.
        // The prior scraped-first order let malformed scrapes win over the
        // curated address (live: ΚΠΙΣΝ shipped "Κέντρο Πολιτισμού Ίδρυμα
        // Σταύρος Νιάρχος, 364" while config held the correct Syngrou 364).
        // Still closes the original GSC empty-address case (Bolivar, Cantina).
        'streetAddress': findVenueConfig(event.venue.name)?.address || event.venue.address || '',
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

  // F2b (G1): eventStatus from real dates or in-window presumption; null past
  // the presumption window → the property is OMITTED entirely (never empty,
  // never EventCompleted from presumption).
  const eventStatus = resolveEventStatus(event.startDate, event.endDate, event.type);
  if (eventStatus) {
    schema.eventStatus = eventStatus;
  }

  // Add end date when real. Passes through date-only to emit all-day
  // Schema.org endDate (matches startDate passthrough).
  if (event.endDate) {
    schema.endDate = formatSchemaDate(event.endDate);
  }

  // 1.3b generalized by F2b: endDate=startDate proxy is honest only for
  // genuinely single-day events. Run-implying types (exhibition, theater,
  // festival — config/lifecycle-presumption.json) without a real end_date are
  // NOT one-day — the proxy would assert a false 1-day span. Honest absence
  // instead. Single-occurrence types keep the proxy (correct).
  if (!schema.endDate && !isRunImplyingType(event.type)) {
    schema.endDate = startDate;
  }

  // G1 invariant (b), structural form: a synthesized endDate on a NULL-end
  // run-implying row must be impossible by construction. The HTML-level
  // validator cannot see DB-null, so the guard lives at emission. Throwing
  // here fails the build — which is the point.
  if (!event.endDate && isRunImplyingType(event.type) && schema.endDate) {
    throw new Error(
      `G1 invariant: synthesized endDate for NULL-end run-implying event ${event.id} (${event.type}) — emission bug`
    );
  }

  // Add door time if available. A date-only row's door time already became
  // startDate above; repeating it as doorTime would claim a separate opening.
  if (event.timeDoors) {
    const doorTime = formatSchemaDate(event.startDate.split('T')[0], event.timeDoors);
    if (doorTime !== startDate) schema.doorTime = doorTime;
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
    ticketUrl: safeHttpUrl(event.ticketUrl) ?? undefined,
    ticketUrlResolved: event.ticketUrlResolved,
    source: event.source,
    venue: { name: event.venue.name, website: safeHttpUrl(event.venue.website) ?? undefined },
    eventStatus: schema.eventStatus,
    selfCanonicalUrl: schema.url,
  });

  if ('offer' in offerDecision) {
    schema.offers = offerDecision.offer;
  }
  // omit → no schema.offers; isAccessibleForFree:false (already set above) carries the with-ticket signal.

  // Add image if available
  const ogImage = resolveEventOgImage(event);
  if (ogImage) {
    schema.image = ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`;
  }

  // Add performer sameAs if available (concerts, dj_sets, festivals,
  // performances, shows, dance — and derived ComedyEvent rows, S175: their
  // EventType stays theater/other, so eligibility keys on schemaType).
  const performer = getPerformerSameAs(event.title, event.type, schemaType);
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
  // Shallow-copy the flat Event entity so we can remove its local @context
  // without mutating buildEventSchemaObject's return value (DataFeed reads it
  // via a separate call, so cross-call safety is intact regardless; this is
  // just defensive against future intra-call reuse).
  const flatEvent = buildEventSchemaObject(event, locale);
  const eventCanonicalUrl = flatEvent.url as string;
  const eventEntity: Record<string, any> = { ...flatEvent };
  delete eventEntity['@context'];

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

  // The page is the published work; provenance belongs here, not on the Event.
  const sourceUrl = sourceListingUrl(event.url);
  graph.push({
    '@type': 'WebPage',
    '@id': eventCanonicalUrl + '#webpage',
    url: eventCanonicalUrl,
    name: schemaText(event.title),
    inLanguage: locale,
    mainEntity: { '@id': eventEntity['@id'] },
    publisher: { '@id': BASE_URL + '/#organization' },
    ...(sourceUrl ? { isBasedOn: sourceUrl } : {}),
  });

  // LAST: site-publisher Organization. Singleton per page; identity
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
function generateEventSchema(
  event: Event,
  locale: Locale = 'el',
  pagedVenueSlugs?: Set<string>,
  opts: { omitEventNode?: boolean } = {}
): string {
  const envelope = buildEventGraphEnvelope(event, locale, pagedVenueSlugs);
  if (opts.omitEventNode && Array.isArray(envelope['@graph'])) {
    // GEO Ruling 2 §3 — cooling-phase (noindexed) pages drop the Event entity so
    // an ended event never presents as a rankable live Event while suppressed,
    // but PRESERVE non-Event nodes (venue Place, seller/publisher Organization) —
    // the page is never left schema-silent. The Event node is the sole @graph
    // member whose @id ends '#event' (venue=#venue, orgs=#organization).
    envelope['@graph'] = envelope['@graph'].filter(
      (node: Record<string, any>) =>
        !(typeof node['@id'] === 'string' && (node['@id'] as string).endsWith('#event'))
    ).map((node: Record<string, any>) => {
      if (node['@type'] !== 'WebPage') return node;
      const { mainEntity, ...page } = node;
      return page;
    });
  }
  return JSON.stringify(envelope, null, 2);
}

// ── Description rendering ──
// Enriched descriptions carry markdown key/value tables ("| Aspect | Details |").
// They render as semantic tables (header row <th scope="col">, first cell of
// each body row <th scope="row">) with every cell escaped — nothing is dropped
// and no source markup reaches the page. "| Info |" tables duplicate the
// practical block and stay in the crawler-only hidden block, as before.

type DescriptionBlock =
  | { kind: 'prose'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] };

// GFM: outer pipes are optional; a separator row needs at least one pipe so a
// bare "---" rule under a line that happens to contain "|" is not a table.
const TABLE_ROW = /\|/;
const TABLE_SEPARATOR = /^(?=.*\|)\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map(cell => cell.replace(/\*\*(.+?)\*\*/g, '$1').trim());
}

function parseDescriptionBlocks(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const chunk of text.split('\n\n')) {
    const lines = chunk.split('\n');
    let prose: string[] = [];
    const flushProse = () => {
      const joined = prose.join('\n').trim();
      if (joined) blocks.push({ kind: 'prose', text: joined });
      prose = [];
    };
    let i = 0;
    while (i < lines.length) {
      if (TABLE_ROW.test(lines[i]) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
        flushProse();
        const header = tableCells(lines[i]);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(tableCells(lines[i++]));
        blocks.push({ kind: 'table', header, rows });
      } else {
        prose.push(lines[i++]);
      }
    }
    flushProse();
  }
  return blocks;
}

function renderDescriptionTable(block: Extract<DescriptionBlock, { kind: 'table' }>, langAttr: string): string {
  const width = Math.max(block.header.length, ...block.rows.map(r => r.length));
  const pad = (cells: string[]) => [...cells, ...Array(width - cells.length).fill('')];
  const thead = block.header.some(Boolean)
    ? `<thead><tr>${pad(block.header).map(c => `<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr></thead>`
    : '';
  const tbody = block.rows.map(row => {
    const [first, ...rest] = pad(row);
    return `<tr><th scope="row">${escapeHtml(first)}</th>${rest.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
  }).join('');
  return `<table${langAttr} class="edp-description-table">${thead}<tbody>${tbody}</tbody></table>`;
}

/**
 * Description for structured data: table blocks become "Key: value" lines
 * (JSON-LD is plain text). Text without a table is returned unchanged.
 */
export function descriptionPlainText(text: string): string {
  const blocks = parseDescriptionBlocks(text);
  if (!blocks.some(b => b.kind === 'table')) return text;
  return blocks.map(b => b.kind === 'prose'
    ? b.text
    : b.rows.map(([first, ...rest]) => {
        const value = rest.filter(Boolean).join(' · ');
        return value ? `${first}: ${value}` : first;
      }).join('\n')
  ).join('\n\n');
}

const HIDDEN_METADATA_STYLE = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

/**
 * Dominant script of a prose string: Greek letters vs Latin letters. The page
 * locale says nothing about the prose (fullDescriptionGr can hold legacy
 * English, raw source descriptions can be Greek on /en/ pages), so WCAG 3.1.2
 * language-of-parts keys on the text itself.
 */
function proseLanguage(text: string): Locale | undefined {
  const greek = (text.match(/[Ͱ-Ͽἀ-῿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (greek + latin === 0) return undefined;
  return greek >= latin ? 'el' : 'en';
}

function langOverride(text: string, pageLocale: Locale): string {
  const lang = proseLanguage(text);
  return lang && lang !== pageLocale ? ` lang="${lang}"` : '';
}

export function renderDescriptionHtml(text: string, pageLocale: Locale): { visibleHtml: string; hiddenHtml: string } {
  const langAttr = langOverride(text, pageLocale);
  const visible: string[] = [];
  const hidden: string[] = [];
  for (const block of parseDescriptionBlocks(text)) {
    if (block.kind === 'prose') {
      visible.push(`<p${langAttr}>${escapeHtml(block.text)}</p>`);
    } else if ((block.header[0] || '').toLowerCase() === 'info') {
      hidden.push(renderDescriptionTable(block, ''));
    } else {
      visible.push(renderDescriptionTable(block, langAttr));
    }
  }
  const hiddenHtml = hidden.length
    ? `<div class="sr-only" aria-hidden="true" style="${HIDDEN_METADATA_STYLE}">${hidden.join('')}</div>`
    : '';
  return { visibleHtml: visible.join('\n'), hiddenHtml };
}

/**
 * Multi-venue placeholder ("Πολλαπλοί Χώροι" and casing/accent variants) is a
 * pseudo-venue, not a place: its slug collides with a real venue's page and
 * Maps cannot resolve it. English surfaces gloss it; nothing links or maps it.
 */
function isMultiVenuePlaceholder(event: Event): boolean {
  return normalizeGreek(event.venue.name).includes('πολλαπλοι χωροι');
}

const META_TEXT_LIMIT = 155;

/** SERP-length cut on a word boundary, marked with an ellipsis. */
function capMetaText(text: string): string {
  if (text.length <= META_TEXT_LIMIT) return text;
  const cut = text.slice(0, META_TEXT_LIMIT - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,.;:·—-]+$/, '');
  return `${atWord}…`;
}

function localizedVenueName(event: Event, locale: Locale): string {
  return locale === 'en' && isMultiVenuePlaceholder(event) ? 'Multiple venues' : event.venue.name;
}

/**
 * Render the event detail HTML template (Phase 3 redesign)
 *
 * Structure: full-bleed hero with type-colored gradient, 800px content column,
 * card-grid related events, mobile sticky CTA bar.
 */
export function renderEventDetailPage(event: Event, relatedEvents: Event[], locale: Locale = 'el', pagedVenueSlugs?: Set<string>, englishHubSlugs?: ReadonlySet<string>): string {
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
  const ogImage = resolveEventOgImage(event);
  const practicalBlock = generatePracticalBlock(event, null, locale);
  const schemaType = resolveEventSchemaType(event); // S175: comedy-format derivation above EventType→@type

  const isExhibition = event.type === 'exhibition';
  const exhibitionIsOpen = isExhibition && isCurrentlyOpen(event);

  // Lifecycle: past events get banner + hidden CTAs (isPast).
  // S144: noindex now phase-keyed (cooling/archive only) — NOT tied to isPast.
  // Just-passed (Day 1-14) events are still indexable per GEO 45-Day Lifecycle.
  const lifecycle = classifyEventLifecycle(event);
  const isPast = lifecycle !== 'upcoming';
  const shouldNoindex = shouldNoindexEvent(event);

  // GEO Ruling 2 §3 — cooling pages (noindex) drop the Event JSON-LD node but
  // keep non-Event nodes. Computed after shouldNoindex so the flag threads in.
  const schemaJson = generateEventSchema(event, locale, pagedVenueSlugs, { omitEventNode: shouldNoindex });

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
  const categoryHref = `${locale === 'en' && englishHubSlugs?.has(categorySlug) ? '/en' : ''}/${categorySlug}/`;
  const homeHref = locale === 'en' && englishHubSlugs?.has('today') ? '/en/today/' : '/';
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
    const rendered = renderDescriptionHtml(String(descriptionSource), locale);
    const fallbackLabel = isEnglishFallback ? '<p class="edp-lang-notice">Περιγραφή στα Αγγλικά</p>\n' : '';
    descriptionHtml = fallbackLabel + rendered.visibleHtml;
    hiddenMetadataHtml = rendered.hiddenHtml;
  } else if (event.description.trim()) {
    descriptionHtml = `<p${langOverride(event.description, locale)}>${escapeHtml(event.description)}</p>`;
  } else {
    // No prose at all: state the stored facts, labelled so it never reads as editorial.
    descriptionHtml = `<div class="edp-fact-summary"><p class="edp-lang-notice">${t.summaryLabel}</p><p>${escapeHtml(buildFactualSummary(event, locale))}</p></div>`;
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

  const isPlaceholderVenue = isMultiVenuePlaceholder(event);
  const venueDisplayName = localizedVenueName(event, locale);
  const venueLinkable = venueHasPage && !isPlaceholderVenue;

  const navLinks = [
    categorySlug ? `<a href="${categoryHref}">${t.typeDiscoveryLabels[event.type] || typeLabel}</a>` : '',
    venueLinkable ? `<a href="/venues/${venueSlug}/">${t.moreEventsAt} ${escapeHtml(venueDisplayName)}</a>` : ''
  ].filter(Boolean);

  // CTA — resolved via tiered cascade (see src/ticketing/cta.ts)
  const cta = resolveCtaForEvent(event, t);
  // CTA hrefs are scraped/AI data: canonical http(s) only, then attribute-escaped.
  const ctaHref = safeHttpUrl(cta.href);
  const ctaLinkable = !isPast && cta.kind !== 'none' && ctaHref;
  const ctaHtml = ctaLinkable
    ? `<a href="${escapeAttr(ctaHref)}" class="edp-cta edp-cta-hero" rel="noopener" target="_blank">${cta.label}</a>`
    : '';

  // Inline CTA for body content (GEO source order: after description, before venue)
  const inlineCtaHtml = isPast
    ? ''
    : ctaLinkable
      ? `<div class="edp-inline-cta"><a href="${escapeAttr(ctaHref)}" class="edp-cta" rel="noopener" target="_blank">${cta.label}</a></div>`
      : cta.kind === 'door'
        ? `<div class="edp-inline-cta"><span class="edp-door-only">${cta.label}</span></div>`
        : event.price.type === 'open'
          ? `<div class="edp-inline-cta"><span class="edp-open-entry">${t.openEntry}</span></div>`
          : '';

  // Venue section — Google Maps link
  const mapLat = Number(event.venue.coordinates?.lat);
  const mapLon = Number(event.venue.coordinates?.lon);
  const mapsUrl = event.venue.coordinates && Number.isFinite(mapLat) && Number.isFinite(mapLon)
    ? `https://www.google.com/maps?q=${mapLat},${mapLon}`
    : `https://www.google.com/maps/search/${encodeURIComponent(event.venue.name + ' Athens')}`;

  // Source attribution — when a URL exists, label with its actual host so the
  // link text never contradicts the destination (cross-listed events carry a
  // source id whose merchant differs from the URL host); mapped display name
  // only for URL-less attributions.
  const sourceUrl = sourceListingUrl(event.url);
  const sourceDisplayName = (sourceUrl && hostOf(sourceUrl)) || sourceAttributionMap[event.source] || event.source;
  const sourceHtml = sourceUrl
    ? `<div class="edp-source">${t.source}: <a href="${escapeAttr(sourceUrl)}" rel="noopener" target="_blank">${escapeHtml(sourceDisplayName)}</a></div>`
    : `<div class="edp-source">${t.source}: ${escapeHtml(sourceDisplayName)}</div>`;

  // Related events as cards
  const relatedHtml = relatedEvents.length > 0
    ? `
      <section class="edp-related">
        <h2>${t.upcomingEventsAt} ${escapeHtml(venueDisplayName)}</h2>
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
        <div class="edp-mobile-bar-title">${escapeHtml(displayTitle(event.title, event.venue?.name))}</div>
        <div class="edp-mobile-bar-price">${escapeHtml(priceDisplay)}</div>
      </div>
      <a href="${escapeAttr(ctaHref)}" class="edp-cta" rel="noopener" target="_blank">${mobileLabel}</a>
    </div>
  </div>`
    : '';

  // S144 (GEO 2026-05-21): hreflang DROPPED until Greek launches as a real product.
  // GEO ruling: hreflang trigger is published + indexable + quality-gated, not
  // "Greek bytes exist." Dormant-Greek bare-root pages don't qualify; emitting
  // alternates to a noindex Greek alternate builds an inconsistent cluster
  // (Google may down-rank /en/ from associating with a noindex alternate).
  // S176: routed through the single gated emitter — reactivates with the
  // HREFLANG_GATE_OPEN flip, together with every other surface.
  const hreflangHtml = renderHreflangLinks({
    el: `${BASE_URL}/events/${slug}`,
    en: `${BASE_URL}/en/events/${slug}/`,
    xDefault: `${BASE_URL}/en/events/${slug}/`,
  });

  // 1.5a: meta/title attributes carry event-derived free text that can contain raw
  // double-quotes (which truncate the HTML attribute at the first ") and, on
  // pre-S154 DB rows, undecoded entities. Normalize via he.decode (idempotent
  // on already-decoded text) then escapeAttr so emission is uniformly correct
  // regardless of the row's encoding state. Composer stays plain-text.
  // The composer is English-only (and reads fullDescription, which prefers
  // English when both exist): Greek pages take their native Greek prose, else
  // the Greek factual summary.
  const nativeGreek = event.hasNativeGreek && event.fullDescriptionGr ? cleanForMeta(event.fullDescriptionGr) : '';
  const metaSource = locale === 'el'
    ? capMetaText(nativeGreek || buildFactualSummary(event, 'el'))
    : generateEventMetaDescription(event);
  const metaDescription = escapeAttr(he.decode(metaSource));
  const safeMetaTitle = escapeAttr(displayTitle(event.title, event.venue.name));
  // Title/meta carry the glossed venue on /en/ (JSON-LD keeps the DB name —
  // structured data stays the data-layer truth).
  const safeVenueName = escapeAttr(he.decode(venueDisplayName));

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
  <meta property="og:image" content="${escapeAttr(ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="${t.ogLocale}">
  <meta property="og:site_name" content="agent-athens">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeMetaTitle}">
  <meta name="twitter:description" content="${metaDescription}">
  <meta name="twitter:image" content="${escapeAttr(ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`)}">

  <!-- GEO: Location metadata -->
  <meta name="geo.region" content="GR-I">
  <meta name="geo.placename" content="Athens">
  ${bingVerification ? `<meta name="msvalidate.01" content="${bingVerification}">` : ''}

  ${locale === 'en' ? '<link rel="alternate" type="application/ld+json" href="/api/en/events.json">' : ''}

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  ${escapeJsonForHtml(decodeJsonLdEntities(schemaJson))}
  </script>
${renderAnalytics()}
${renderImageFallbackScript()}
</head>
<body>
  ${renderSiteNav(locale)}
  ${renderHamburgerMenu(locale)}
  ${renderSearchOverlay(locale)}

  <main>
  <article id="main-content" tabindex="-1"${isPast ? ' data-past="true"' : ''}>
    <section class="edp-hero" style="--edp-type-color: ${typeColorVar}">
      <div class="edp-hero-bg" style="background-image: url('${escapeAttr(ogImage)}')"></div>
      <div class="edp-hero-inner">
        <nav class="edp-breadcrumb">
          <a href="${homeHref}">agent-athens</a>
          ${categorySlug ? ` › <a href="${categoryHref}">${typeLabel}</a>` : ''}
          › ${escapeHtml(venueDisplayName)}
        </nav>
        <span class="edp-type-badge${lightText ? ' edp-type-badge--light-text' : ''}">${typeLabel}</span>
        ${exhibitionIsOpen ? `<span class="edp-open-badge">${t.currentlyOpen}</span>` : ''}
        <header>
          <h1 class="edp-title">${escapeHtml(displayTitle(event.title, event.venue?.name))}</h1>
          <div class="edp-meta">
            <span class="edp-meta-date"><time datetime="${event.startDate}">${dateDisplay}</time></span>
            <span class="edp-meta-item">${venueLinkable ? `<a href="/venues/${venueSlug}/">${escapeHtml(venueDisplayName)}</a>` : escapeHtml(venueDisplayName)}</span>
            <span class="edp-meta-item">${escapeHtml(priceDisplay)}</span>
          </div>
          ${ctaHtml}
          ${(() => {
            const actionBar = renderActionBarHtml(event.id, slug, event.title, canonicalUrl, locale, saveMetaFor(event));
            const gcalUrl = buildGCalUrl(event, canonicalUrl);
            const outlookUrl = buildOutlookUrl(event, canonicalUrl);
            if (!gcalUrl || !outlookUrl) return actionBar;
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
            return actionBar.replace('</div>', () => `${calendarDisclosure}</div>`);
          })()}
        </header>
      </div>
    </section>

    ${isPast ? `<div class="event-passed-banner" role="status">
      <p>${resolveEffectiveEnd(event).presumed ? t.eventNoLaterDates : t.eventEnded}</p>
    </div>` : ''}

    <div class="edp-content">
      ${practicalBlock}

      <section class="edp-description${needsReadMore ? ' is-collapsed' : ''}">
        ${descriptionHtml}
        ${hasFullDescription ? `<div class="edp-enriched-badge"${locale === 'en' ? '' : ' lang="en"'}>AI-enriched content</div>` : ''}
      </section>
      ${needsReadMore ? `<button class="edp-read-more" type="button" data-more="${t.readMore}" data-less="${t.readLess}">${t.readMore}</button>` : ''}
      ${hiddenMetadataHtml}

      ${inlineCtaHtml}

      <section class="edp-venue-section">
        <h2>${escapeHtml(venueDisplayName)}</h2>
        ${event.venue.address
          ? `<div class="edp-venue-address">${escapeHtml(event.venue.address)}</div>`
          : ''}
        ${event.venue.neighborhood ? `<div class="edp-venue-neighborhood">${escapeHtml(displayNeighborhood(event.venue.neighborhood))}</div>` : ''}
        ${isPlaceholderVenue ? '' : `<a href="${escapeAttr(mapsUrl)}" class="edp-venue-maps" rel="noopener" target="_blank">${t.openMap}</a>`}
      </section>

      ${sourceHtml}

      <nav class="edp-connections" aria-label="${locale === 'en' ? 'Related pages' : 'Σχετικές σελίδες'}">
        <h2>${t.exploreMore}</h2>
        ${navLinks.join('\n        ')}
        ${renderCornerstoneLinksHtml(locale, englishHubSlugs)}
      </nav>

      ${relatedHtml}
    </div>
  </article>
  </main>

  ${mobileBarHtml}

  ${renderSiteFooter(locale)}
  ${renderHamburgerScript()}
  ${renderSearchScript(locale)}
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
    // Running multi-date events show their range, not a past start date —
    // a June start under an "upcoming" rail heading read as stale data.
    const todayStr = getAthensTodayStr();
    const startedBeforeToday = event.startDate.substring(0, 10) < todayStr;
    const isRunning = Boolean(event.endDate)
      && startedBeforeToday
      && String(event.endDate).substring(0, 10) >= todayStr;
    if (isRunning) {
      const exhibitionLocale = locale === 'en' ? 'en-US' : 'el-GR';
      dateStr = `${formatExhibitionDateRange(event, exhibitionLocale)} · ${locale === 'en' ? 'Now running' : 'Σε εξέλιξη'}`;
    } else if (startedBeforeToday) {
      // Implied run (no endDate; lifecycle keeps run-implying types visible):
      // "Από <start>" / "Since <start>" is factual; a bare past date+time
      // under an "upcoming" heading read as stale data.
      dateStr = `${locale === 'en' ? 'Since' : 'Από'} ${formatDateOnly(event.startDate, locale)}`;
    } else {
      dateStr = formatDateOnly(event.startDate, locale);
      const timeStr = event.startDate.includes('T') ? formatGreekTime(event.startDate) : '';
      if (timeStr && timeStr !== '00:00') dateStr += ` ${t.atTime} ${timeStr}`;
    }
  }

  const priceText = formatPrice(event, locale);

  const slug = generateEventSlug(event);
  // English pages exist only for events with an English description.
  const href = locale === 'en' && event.fullDescriptionEn ? `/en/events/${slug}/` : `/events/${slug}/`;
  // Badge follows the page locale — a Greek ΦΕΣΤΙΒΑΛ chip beside the hero's
  // English CONCERT chip was a component-consistency ding from every ct judge.
  const badgeLabel = locale === 'en'
    ? (t.typeLabels[event.type] || event.type).toUpperCase()
    : (BADGE_LABELS[event.type] || BADGE_LABELS.other);
  const colorVar = `var(--color-${event.type.replace('_', '-')})`;
  const lightText = LIGHT_TEXT_BADGES.has(event.type) ? ' card-badge--light-text' : '';
  const icon = TYPE_ICONS[event.type] || TYPE_ICONS.other;
  // Neighborhoods are stored in English; displayNeighborhood translates to Greek.
  const neighborhood = event.venue.neighborhood
    ? (locale === 'en' ? event.venue.neighborhood : displayNeighborhood(event.venue.neighborhood))
    : '';
  const venueName = localizedVenueName(event, locale);
  const venueText = neighborhood ? `${venueName} · ${neighborhood}` : venueName;

  const imgSrc = firstSafeImageSrc(event.imageLocal, event.imageUrl, event.venueImage);

  return `
  <article class="event-card">
    ${imgSrc
      ? `<div class="card-image-wrapper" data-type="${event.type}">
      <img class="card-image" src="${escapeAttr(imgSrc)}" alt="${escapeHtml(displayTitle(event.title, event.venue?.name))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${IMG_FALLBACK_ATTR}>
      <span class="card-placeholder-icon" aria-hidden="true" style="display:none">${icon}</span>
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? `<span class="card-badge-open">${t.currentlyOpenShort}</span>` : ''}
      ${renderCardSaveButton(event.id, slug, event.title, Boolean(event.fullDescriptionEn), saveMetaFor(event), locale)}
    </div>`
      : `<div class="card-image-wrapper" data-type="${event.type}">
      ${getEventTile(event.id) ?? ''}
      <span class="card-badge${lightText}" style="background: ${colorVar}">${badgeLabel}</span>
      ${exhibitionIsOpen ? `<span class="card-badge-open">${t.currentlyOpenShort}</span>` : ''}
      ${renderCardSaveButton(event.id, slug, event.title, Boolean(event.fullDescriptionEn), saveMetaFor(event), locale)}
    </div>`}
    <div class="card-body">
      <h3 class="card-title"><a href="${href}" class="card-link">${escapeHtml(displayTitle(event.title, event.venue?.name))}</a></h3>
      <span class="card-date"><time datetime="${event.startDate}">${dateStr}</time></span>
      <span class="card-venue">${escapeHtml(venueText)}</span>
      <span class="card-price">${escapeHtml(priceText)}</span>
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
  // Phase-2 B5 (visibility 2026-07-08): dedupe duplicate DB rows of the same
  // event, which rendered as triplicate rail cards (Barbara Kruger at SNFCC:
  // one canonical run row + daily-scraped date-instance rows sharing the
  // title). Key by folded title; for NON-run-implying types the start date
  // joins the key so a residency (same show title, different nights) is NOT
  // collapsed — an exhibition run at one venue is one card regardless of the
  // date-instance rows. Rail-level fold only: the rows themselves belong to
  // the dedup arc (merged_into) and are NOT touched here. Running exhibitions
  // (past start, future end) legitimately appear — the card carries its own
  // "Σε εξέλιξη" state; that is not a past-listing defect.
  // The rail is a listing: upcoming, one row per merged_into duplicate group
  // (selectListable, same rule as hubs), never the current event's own group.
  const current = venueEvents.find(e => e.id === currentEventId);
  const currentGroup = current?.mergedInto ?? currentEventId;
  const railKey = (e: Event): string => {
    const title = normalizeGreek(e.title.trim().toLowerCase());
    return isRunImplyingType(e.type) ? title : `${title}|${e.startDate.slice(0, 10)}`;
  };
  // Seeded with the current event so its own unmerged same-title rows fold away.
  const seenKeys = new Set<string>(current ? [railKey(current)] : []);
  return selectListable(venueEvents.filter(e => classifyEventLifecycle(e) === 'upcoming'))
    .filter(e => e.id !== currentEventId && e.id !== currentGroup && e.mergedInto !== currentGroup)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .filter(e => {
      const key = railKey(e);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .slice(0, 6);
}

/**
 * Generate all individual event pages
 * Returns list of generated URLs for sitemap
 */
export async function generateEventPages(events: Event[], pagedVenueSlugs?: Set<string>): Promise<{
  urls: string[];                // sitemap-eligible URLs only (noindex pages excluded — F2b/G3)
  slugMap: Map<string, string>;  // eventId -> current slug
  pastEventUrls: Set<string>;    // URLs of past-active events (for sitemap priority)
  pagesWritten: number;          // ALL pages written, incl. noindexed (urls.length undercounts)
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

    // F2b/G3 (closes audit F4): sitemap membership consults the SAME lifecycle
    // predicate that decides the page's noindex meta — one state machine. A
    // cooling/archive (noindexed) page is generated but never advertised;
    // 422 noindex-in-sitemap entries existed because this gate was missing.
    if (!shouldNoindexEvent(event)) {
      urls.push(urlPath);
    }
  }

  const pastCount = pastEventUrls.size;
  const pagesWritten = events.length;
  console.log(`  ✓ Generated ${pagesWritten} event pages (${pastCount} past-active with banner; ${pagesWritten - urls.length} noindexed → sitemap-excluded)`);
  logValidationSummary(schemaValidationResults);
  return { urls, slugMap, pastEventUrls, pagesWritten };
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
    // Read-back state feeds _redirects: keep only ids with slugs matching
    // SLUG_PATTERN (src/validators/persisted-state.ts); report what was dropped.
    const { value, dropped } = parseSlugHistory(JSON.parse(readFileSync(historyPath, 'utf-8')));
    if (dropped > 0) {
      console.warn(`  ⚠️  .slug-history.json: dropped ${dropped} malformed entr${dropped === 1 ? 'y' : 'ies'} (slugs must match ${SLUG_PATTERN})`);
    }
    return value;
  } catch {
    console.warn('  ⚠️  .slug-history.json does not parse; starting a fresh slug history');
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
  let invalid = 0;

  for (const [eventId, currentSlug] of currentSlugs) {
    const previousSlugs = previousHistory.get(eventId) || [];
    for (const oldSlug of previousSlugs) {
      if (oldSlug !== currentSlug) {
        // Emission check: each slug becomes a path token in _redirects, so a
        // value outside SLUG_PATTERN (whitespace, newline, '*', ':') could
        // add a rule. Drop it; loadSlugHistory already filters on load.
        if (!isSafeSlug(oldSlug) || !isSafeSlug(currentSlug)) {
          invalid++;
          continue;
        }
        // Force (301!) so a lingering un-swept dist/events/{oldSlug}/ directory
        // cannot shadow the rule — Netlify serves a matching static file before a
        // NON-forced redirect (the shadowing trap generateArchiveGoneRules defeats
        // with 410! for the same reason). Without the bang, a slug migration emits
        // redirects that never fire because the old dir still serves 200.
        redirects.push(`/events/${oldSlug}/* /events/${currentSlug}/:splat 301!`);
      }
    }
  }

  if (invalid > 0) console.warn(`  ⚠️  generateRedirects: dropped ${invalid} redirect${invalid === 1 ? '' : 's'} with a slug outside ${SLUG_PATTERN}`);
  return redirects;
}

/** Trailing window (days) below which archived event URLs stop emitting a 410
 *  and fall through to a natural 404. Aging past this bound IS the prune —
 *  keeps `_redirects` bounded under Netlify's ~10k ceiling (GEO Ruling 2). */
export const ARCHIVE_410_WINDOW_DAYS = 90;

/**
 * GEO Ruling 2 §2 — explicit 410 for archive-phase (past-expired, >45d) events,
 * BOUNDED to the trailing 45–90d band. Replaces 404-by-omission (the current
 * bug) with an honest, faster de-index signal on the whole >45d surface.
 *
 * Enumeration source: the DB set (`locationFiltered`), keyed on the classifier's
 * own `resolveEffectiveEnd` — NOT raw start_date — so a running exhibition with
 * a future endDate never lands here (locked by lifecycle-presumption.test.ts §1).
 * slugHistory is NOT used: it self-prunes to the pageable set and loses archived
 * events within one build.
 *
 * Bound: past-expired AND effective-end within the last 90 days → 45–90d band
 * (~3k rules, self-sliding). Older → no rule (natural 404).
 *
 * Emission: force-410 (`410!`) so a lingering un-swept `dist/events/{slug}/`
 * directory cannot shadow the rule (Netlify serves a matching static file before
 * a non-forced redirect — the shadowing trap the orphan-sweep note flagged).
 *
 * `preservedUrls`: dormant, city-agnostic backlink allowlist (empty by design).
 * A URL present here is skipped — the seam where the authority play (once it
 * lands real inbound links) would begin to 301-preserve instead of 410. Wire
 * nothing to a paid API.
 *
 * Event pages ONLY. Never emits a hub/combinatorial path.
 */
export function generateArchiveGoneRules(
  events: Event[],
  opts: { preservedUrls?: Set<string> } = {}
): string[] {
  const preserved = opts.preservedUrls ?? new Set<string>();
  const todayMs = new Date(getAthensTodayStr() + 'T00:00:00Z').getTime();
  const rules: string[] = [];
  let invalid = 0;

  for (const event of events) {
    // Lower bound: only past-expired (>45d) events — same classifier the page
    // generator uses, so the two layers can never disagree.
    if (classifyEventLifecycle(event) !== 'past-expired') continue;

    // Upper bound: effective-end within the trailing window. Keyed on
    // resolveEffectiveEnd (endDate-aware) to match the classifier's own arithmetic.
    const effEndMs = new Date(resolveEffectiveEnd(event).date + 'T00:00:00Z').getTime();
    const daysPast = Math.floor((todayMs - effEndMs) / 86_400_000);
    if (daysPast > ARCHIVE_410_WINDOW_DAYS) continue;

    const slug = generateEventSlug(event);
    if (!isSafeSlug(slug)) {
      invalid++;
      continue;
    }
    const url = `/events/${slug}/`;
    if (preserved.has(url)) continue;

    rules.push(`${url} /410.html 410!`);
  }

  if (invalid > 0) console.warn(`  ⚠️  generateArchiveGoneRules: dropped ${invalid} rule${invalid === 1 ? '' : 's'} with a slug outside ${SLUG_PATTERN}`);
  return rules;
}

// Exports for other modules
export { getAthensTimezone, generateEventSchema, buildEventSchemaObject, buildEventGraphEnvelope };
