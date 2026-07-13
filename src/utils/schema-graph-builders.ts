/**
 * @graph envelope assembly for hub + homepage Schema.org JSON-LD emission.
 *
 * Per S138 + S139 migration spec. Wraps page-canonical entities
 * (CollectionPage / FAQPage / ItemList) with the site-publisher Organization
 * as the LAST member, per Strategist Q2 ordering ruling (2026-05-19).
 *
 *   Hub cornerstone:     CollectionPage → FAQPage (if faqs) → editor-picks (if picks) → Organization
 *   Hub non-cornerstone: CollectionPage → Organization
 *   Homepage:            WebSite → CollectionPage → Organization  (Stage 4)
 *
 * Same-page references use {canonicalUrl}#fragment @id values; the
 * validator-side `resolveSamePageReferences` (Stage 1) dereferences them.
 */

import type { Event, PageMetadata, HubFaq } from '../types';
import type { Locale } from '../i18n/strings';
import type { EditorPick } from '../templates/editor-picks';
import { BASE_URL, pageUrl } from '../config/site-url';
import {
  buildContainedInPlace,
  resolveEventStatus,
  getCountryCode,
  buildSiteOrganizationGraphMember,
  ORG_NAME,
  ORG_DESCRIPTION,
  ORG_LANGUAGES,
} from './schema-geo';
import { VENUE_TYPE_MAP, formatSchemaDate } from '../enrichment/quality-gates';
import { isRunImplyingType } from './event-lifecycle';
import { generateEventSlug } from '../generators/event-page';
import { buildOfferOrOmit } from '../ticketing/offer-builder';
import { getOgImage } from './og-image-fallback';
import { findVenueConfig } from '../quality/location-filter';

// --- Per-event ListItem builder (extracted verbatim from page.ts:459-512) ---

// Phase-2 B (visibility 2026-07-08): a real, locale-appropriate excerpt or
// nothing. The prior fixed stub ("concert event in Athens") carried zero
// information on every ListItem site-wide; omit-beats-boilerplate.
function itemDescriptionOrOmit(event: Event, locale: Locale): string | undefined {
  const source =
    (locale === 'en'
      ? event.fullDescriptionEn || event.description
      : event.fullDescriptionGr || event.description) ||
    event.fullDescription || '';
  const text = source.replace(/\s+/g, ' ').trim();
  if (!text || text === event.title) return undefined;
  return text.length <= 200 ? text : `${text.slice(0, 200).replace(/\s+\S*$/, '')}…`;
}

function buildItemListElements(events: Event[], locale: Locale): Array<Record<string, unknown>> {
  return events.map((event, index) => {
    const eventStatus = resolveEventStatus(event.startDate, event.endDate, event.type);
    const selfCanonicalUrl = `${BASE_URL}/events/${generateEventSlug(event)}/`;

    // F2b (G1): real endDate emitted for any type; single-day proxy only for
    // non-run-implying types; run-implying NULL-end → endDate OMITTED (the old
    // `end ?? start` branch synthesized a false 1-day span on NULL-end
    // exhibitions in hub ListItems — invariant (b) violation). eventStatus
    // omitted when null (past presumption window), never empty.
    const endDate = event.endDate
      ? formatSchemaDate(event.endDate)
      : isRunImplyingType(event.type)
        ? undefined
        : formatSchemaDate(event.startDate);

    const item: Record<string, unknown> = {
      '@type': event['@type'],
      '@id': selfCanonicalUrl,
      name: event.title,
      ...(() => { const d = itemDescriptionOrOmit(event, locale); return d ? { description: d } : {}; })(),
      startDate: formatSchemaDate(event.startDate),
      ...(endDate ? { endDate } : {}),
      ...(eventStatus ? { eventStatus } : {}),
      isAccessibleForFree: event.price.type === 'open' || event.price.type === 'donation',
      location: {
        '@type': VENUE_TYPE_MAP[event['@type']] || 'EventVenue',
        name: event.venue.name,
        address: {
          '@type': 'PostalAddress',
          // Phase-2 B4 (visibility 2026-07-08): config-first, parity with the
          // detail emitter (event-page.ts) — the curated whitelist address is
          // authoritative; scraped rows only fill unlisted venues (malformed
          // scrapes used to win, e.g. ΚΠΙΣΝ). Original 2026-05-27 empty-row
          // fallback case (Cantina Social, Astron, Bolivar, 2ten) still holds.
          streetAddress: findVenueConfig(event.venue.name)?.address || event.venue.address || '',
          addressLocality: 'Athens',
          addressRegion: 'Attica',
          addressCountry: getCountryCode(),
        },
        containedInPlace: buildContainedInPlace(event.venue.neighborhood),
      },
    };

    // S139-fix (Strategist 2026-05-20): route ListItem Offer through the
    // canonical S134-gated buildOfferOrOmit so the two surfaces (event-page
    // detail + this CollectionPage list) cannot drift. The prior inline
    // construction emitted price-less Offers for with-ticket events with no
    // price.amount — validator.schema.org rejected 15 such instances in the
    // ai-tech / today / concerts / this-weekend sample. buildOfferOrOmit
    // returns { omit: true } in that case (offer-builder.ts:171-177);
    // emit/omit decisions for past events + classifier-omit are also
    // subsumed (previously gated separately in this site).
    const offerDecision = buildOfferOrOmit({
      price: event.price,
      ticketUrl: event.ticketUrl,
      ticketUrlResolved: event.ticketUrlResolved,
      venue: event.venue,
      eventStatus: eventStatus ?? undefined,
      selfCanonicalUrl,
    });
    if ('offer' in offerDecision) {
      item.offers = offerDecision.offer;
    }

    // Hub-item image (2026-05-25 strip + image-add): mirror EDP JSON-LD
    // image emission (buildEventSchemaObject:248-252) so hub ItemList items
    // and EDP Event entities cannot drift on image presence. Omit on empty
    // (omit-beats-fabricate): the helper always returns a non-empty path,
    // but the absolute-URL guard keeps the contract explicit.
    const ogImage = getOgImage(event);
    if (ogImage) {
      item.image = ogImage.startsWith('http') ? ogImage : `${BASE_URL}${ogImage}`;
    }

    return {
      '@type': 'ListItem',
      position: index + 1,
      item,
    };
  });
}

// --- CollectionPage member ---
// Returns the CollectionPage object without `@context` (the envelope owns it).
// When `atId` is provided, the member includes `@id`; otherwise it's omitted
// so the flat-block fallback path (category pages) stays byte-identical.

export function buildCollectionPageMember(params: {
  events: Event[];
  metadata: PageMetadata;
  locale: Locale;
  url: string;
  atId?: string;
}): Record<string, any> {
  const { events, metadata, locale, url, atId } = params;
  return {
    '@type': 'CollectionPage',
    ...(atId ? { '@id': atId } : {}),
    name: `${metadata.title} | Cultural Events in Athens`,
    description: `${events.length} cultural events in Athens, Greece`,
    url,
    inLanguage: locale === 'en' ? 'en' : 'el',
    about: {
      '@type': 'Place',
      name: 'Athens',
      address: {
        '@type': 'PostalAddress',
        addressCountry: getCountryCode(),
        addressLocality: 'Athens',
      },
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: events.length,
      itemListElement: buildItemListElements(events, locale),
    },
    datePublished: metadata.lastUpdate,
    dateModified: metadata.lastUpdate,
  };
}

// --- FAQPage member ---
// Returns null when no usable FAQs exist for the locale (English-only FAQs
// filter out Greek-only entries; empty config.faqs returns null too). Caller
// drops the null result from the envelope rather than emitting an empty FAQPage.

export function buildFaqPageMember(params: {
  faqs: HubFaq[];
  locale: Locale;
  hubCanonicalUrl: string;
}): Record<string, any> | null {
  const { faqs, locale, hubCanonicalUrl } = params;
  const localeFaqs = locale === 'en'
    ? faqs.filter(faq => faq.questionEn && faq.answerEn)
    : faqs;
  if (localeFaqs.length === 0) return null;
  return {
    '@type': 'FAQPage',
    '@id': `${hubCanonicalUrl}#faqpage`,
    mainEntity: localeFaqs.map(faq => ({
      '@type': 'Question',
      name: locale === 'en' ? faq.questionEn! : faq.questionEl,
      acceptedAnswer: {
        '@type': 'Answer',
        text: locale === 'en' ? faq.answerEn! : faq.answerEl,
      },
    })),
  };
}

// --- Editor-picks ItemList member ---
// Returns null when no picks (today, until S101b wires picks). Mirrors the
// JSON-LD shape in src/templates/editor-picks.ts:58-65 but without @context.

export function buildEditorPicksItemList(params: {
  picks: EditorPick[];
  hubCanonicalUrl: string;
}): Record<string, any> | null {
  const { picks, hubCanonicalUrl } = params;
  if (picks.length === 0) return null;
  return {
    '@type': 'ItemList',
    '@id': `${hubCanonicalUrl}#editor-picks`,
    itemListOrder: 'https://schema.org/ItemListOrderManual',
    numberOfItems: picks.length,
    itemListElement: picks
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map(p => ({
        '@type': 'ListItem',
        position: p.rank,
        item: { '@id': p.eventCanonicalUrl },
      })),
  };
}

// --- WebSite member (homepage) ---
// Reuses ORG_NAME / ORG_DESCRIPTION / ORG_LANGUAGES from schema-geo so the
// homepage WebSite, the page Organization, and the canonical ORGANIZATION_SCHEMA
// const cannot drift apart. publisher.@id cross-references the Organization
// member in the same envelope; resolveSamePageReferences (validator-side, Stage 1)
// dereferences it. potentialAction omitted: no server-side search query
// endpoint exists (search-overlay.ts fetches a static /search-index.json;
// SearchAction needs a real query URL — verified absent).

export function buildHomepageWebSiteMember(): Record<string, any> {
  return {
    '@type': 'WebSite',
    '@id': `${BASE_URL}/#website`,
    name: ORG_NAME,
    url: BASE_URL,
    description: ORG_DESCRIPTION,
    inLanguage: [...ORG_LANGUAGES],
    publisher: { '@id': `${BASE_URL}/#organization` },
  };
}

// --- Hub envelope ---

export function buildHubGraph(params: {
  metadata: PageMetadata;
  locale: Locale;
  events: Event[];
  faqs: HubFaq[];
  editorPicks: EditorPick[];
  isCornerstone: boolean;
  hubCanonicalUrl: string;
}): { '@context': string; '@graph': Record<string, any>[] } {
  const { metadata, locale, events, faqs, editorPicks, isCornerstone, hubCanonicalUrl } = params;
  const graph: Record<string, any>[] = [
    buildCollectionPageMember({
      events,
      metadata,
      locale,
      url: hubCanonicalUrl,
      atId: `${hubCanonicalUrl}#collectionpage`,
    }),
  ];
  if (isCornerstone) {
    const faqMember = buildFaqPageMember({ faqs, locale, hubCanonicalUrl });
    if (faqMember) graph.push(faqMember);
    const picksMember = buildEditorPicksItemList({ picks: editorPicks, hubCanonicalUrl });
    if (picksMember) graph.push(picksMember);
  }
  graph.push(buildBreadcrumbListMember({ locale, pageName: metadata.title, pageUrl: hubCanonicalUrl }));
  graph.push(buildSiteOrganizationGraphMember());
  return { '@context': 'https://schema.org', '@graph': graph };
}

// --- BreadcrumbList member ---
// Phase-2 B (visibility 2026-07-08): rubric-expected breadcrumb trail
// (Home → page) for hub + venue pages. Page-scoped, so ordered before the
// site-publisher Organization member per the Q2 ordering ruling.

export function buildBreadcrumbListMember(params: {
  locale: Locale;
  pageName: string;
  pageUrl: string;
  middle?: { name: string; url: string };
}): Record<string, any> {
  const { locale, pageName, pageUrl, middle } = params;
  const homeUrl = locale === 'en' ? `${BASE_URL}/en/today/` : `${BASE_URL}/`;
  const trail = [
    { '@type': 'ListItem', position: 1, name: locale === 'en' ? 'Home' : 'Αρχική', item: homeUrl },
    ...(middle ? [{ '@type': 'ListItem', position: 2, name: middle.name, item: middle.url }] : []),
    { '@type': 'ListItem', position: middle ? 3 : 2, name: pageName, item: pageUrl },
  ];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: trail,
  };
}

// --- Homepage envelope ---
// WebSite FIRST (page-canonical entity), CollectionPage SECOND, Organization
// LAST (site-publisher singleton). Same canonical-to-root posture as hubs:
// CollectionPage @id is the canonical site root + #collectionpage fragment.

export function buildHomepageGraph(params: {
  metadata: PageMetadata;
  locale: Locale;
  events: Event[];
}): { '@context': string; '@graph': Record<string, any>[] } {
  const { metadata, locale, events } = params;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildHomepageWebSiteMember(),
      buildCollectionPageMember({
        events,
        metadata,
        locale,
        url: pageUrl(metadata.url),
        atId: `${BASE_URL}/#collectionpage`,
      }),
      buildSiteOrganizationGraphMember(),
    ],
  };
}
