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
import { BASE_URL } from '../config/site-url';
import {
  buildContainedInPlace,
  resolveEventStatus,
  availabilityForEventStatus,
  getCountryCode,
  getCurrencyCode,
  buildSiteOrganizationGraphMember,
} from './schema-geo';
import { VENUE_TYPE_MAP, formatSchemaDate } from '../enrichment/quality-gates';
import { generateEventSlug } from '../generators/event-page';
import { classifyTicketSource } from './ticket-source-classifier';

// --- Per-event ListItem builder (extracted verbatim from page.ts:459-512) ---

function buildItemListElements(events: Event[]): Array<Record<string, unknown>> {
  return events.map((event, index) => {
    const eventStatus = resolveEventStatus(event.startDate, event.endDate, event.type);
    const availability = availabilityForEventStatus(eventStatus);

    const item: Record<string, unknown> = {
      '@type': event['@type'],
      '@id': `${BASE_URL}/events/${generateEventSlug(event)}/`,
      name: event.title,
      description: `${event.type} event in Athens`,
      startDate: formatSchemaDate(event.startDate),
      endDate: event.type === 'exhibition' && event.endDate
        ? formatSchemaDate(event.endDate)
        : formatSchemaDate(event.endDate ?? event.startDate),
      eventStatus,
      isAccessibleForFree: event.price.type === 'open' || event.price.type === 'donation',
      location: {
        '@type': VENUE_TYPE_MAP[event['@type']] || 'EventVenue',
        name: event.venue.name,
        address: {
          '@type': 'PostalAddress',
          streetAddress: event.venue.address || '',
          addressLocality: 'Athens',
          addressRegion: 'Attica',
          addressCountry: getCountryCode(),
        },
        containedInPlace: buildContainedInPlace(event.venue.neighborhood),
      },
    };

    const classifierOmits = event.price.type === 'with-ticket'
      && 'omit_offer' in classifyTicketSource(event);
    if (availability.kind === 'emit' && !classifierOmits) {
      item.offers = {
        '@type': 'Offer',
        ...((event.price.type === 'open' || event.price.type === 'donation')
          ? { price: '0' }
          : (event.price.amount ? { price: event.price.amount.toString() } : {})),
        priceCurrency: event.price.currency || getCurrencyCode(),
        availability: availability.value,
      };
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
      itemListElement: buildItemListElements(events),
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
  graph.push(buildSiteOrganizationGraphMember());
  return { '@context': 'https://schema.org', '@graph': graph };
}
