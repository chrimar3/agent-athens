/**
 * Reads the public Schema.org DataFeed (/api/events.json, /api/en/events.json)
 * and flattens each entry into the compact record the MCP tools return.
 *
 * The feed is the single source: the server holds no database and invents no
 * fields. Anything the feed omits (no price, no performer) stays absent.
 */
import { looseKey } from './normalize';
// Build-time copy of the site's rule for events with no stated end, so both
// sides presume the same run length (src/utils/event-lifecycle.ts).
import presumption from '../../config/lifecycle-presumption.json';

export type Lang = 'el' | 'en';

export const CATEGORIES = [
  'music', 'theatre', 'exhibition', 'cinema', 'comedy', 'dance',
  'festival', 'performing_arts', 'education', 'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

const CATEGORY_BY_SCHEMA_TYPE: Record<string, Category> = {
  MusicEvent: 'music',
  TheaterEvent: 'theatre',
  ExhibitionEvent: 'exhibition',
  ScreeningEvent: 'cinema',
  ComedyEvent: 'comedy',
  DanceEvent: 'dance',
  Festival: 'festival',
  PerformingArtsEvent: 'performing_arts',
  EducationEvent: 'education',
};

export interface EventRecord {
  id: string;
  name: string;
  category: Category;
  schema_type: string;
  start: string;            // ISO as published (date-only for all-day runs)
  end?: string;             // absent when the feed states no end
  status?: string;          // EventScheduled, EventCancelled, …
  venue: { name: string; address?: string; neighborhood?: string; lat?: number; lon?: number };
  price: { access: 'open' | 'with-ticket'; amount?: number; currency?: string };
  ticket_url?: string;
  ticket_seller?: string;
  url: string;              // the Agent Athens page: always link users here
  image?: string;
  performer?: { name: string; type?: string; wikidata?: string; same_as: string[] };
  description: string;
}

/** Internal: record plus precomputed match keys. */
export interface IndexedEvent extends EventRecord {
  _startDay: string;
  _endDay: string | null;   // stated end, else presumed end (see presumedEnd)
  _haystack: string;        // looseKey of name + venue + performer + description
  _titleKey: string;
  _performerKeys: string[]; // looseKeys of performer name + English Wikipedia title
  _qid?: string;
  _neighborhoodKey?: string;
}

export interface FeedSnapshot {
  lang: Lang;
  dateModified?: string;
  events: IndexedEvent[];
  byId: Map<string, IndexedEvent>;
}

const MUNICIPALITY = 'Municipality of Athens';

function slugFromUrl(url: string): string {
  const m = url.match(/\/events\/([^/]+)\/?$/);
  return m ? m[1] : url;
}

function wikidataQid(sameAs: string[]): string | undefined {
  for (const u of sameAs) {
    const m = u.match(/wikidata\.org\/wiki\/(Q\d+)/);
    if (m) return m[1];
  }
  return undefined;
}

/** "https://en.wikipedia.org/wiki/Catharsis_(Russian_band)" → "Catharsis" */
function enWikiTitle(sameAs: string[]): string | undefined {
  for (const u of sameAs) {
    const m = u.match(/en\.wikipedia\.org\/wiki\/([^?#]+)/);
    if (m) {
      try {
        return decodeURIComponent(m[1]).replace(/_/g, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim();
      } catch { return undefined; }
    }
  }
  return undefined;
}

/** Feed category → the site's EventType key in lifecycle-presumption.json. */
const SITE_TYPE: Partial<Record<Category, string>> = { theatre: 'theater', exhibition: 'exhibition', festival: 'festival' };

/** Last day a run with no stated end is presumed open, or null when the category is not a run. */
function presumedEnd(category: Category, startDay: string): string | null {
  const type = SITE_TYPE[category];
  if (!type || !presumption.runImplyingTypes.includes(type)) return null;
  const days = (presumption.presumed_run_days as Record<string, number>)[type] ?? presumption.presumed_run_days._default;
  const d = new Date(`${startDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return typeof v === 'string' ? [v] : [];
}

function schemaShort(v: unknown): string | undefined {
  return typeof v === 'string' ? v.replace('https://schema.org/', '') : undefined;
}

export function toRecord(raw: any): IndexedEvent | null {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || typeof raw.url !== 'string' || typeof raw.startDate !== 'string') {
    return null;
  }
  const loc = raw.location ?? {};
  const place = loc.containedInPlace;
  const neighborhood = place?.name && place.name !== MUNICIPALITY ? String(place.name) : undefined;
  const offer = Array.isArray(raw.offers) ? raw.offers[0] : raw.offers;
  const amount = offer?.price != null && offer.price !== '' ? Number(offer.price) : undefined;

  const performerRaw = Array.isArray(raw.performer) ? raw.performer[0] : raw.performer;
  const performerSameAs = asArray(performerRaw?.sameAs);
  const performer = performerRaw?.name
    ? {
        name: String(performerRaw.name),
        type: performerRaw['@type'],
        wikidata: wikidataQid(performerSameAs),
        same_as: performerSameAs,
      }
    : undefined;

  const rec: EventRecord = {
    id: slugFromUrl(raw.url),
    name: raw.name,
    category: CATEGORY_BY_SCHEMA_TYPE[raw['@type']] ?? 'other',
    schema_type: raw['@type'],
    start: raw.startDate,
    ...(raw.endDate ? { end: raw.endDate } : {}),
    ...(raw.eventStatus ? { status: schemaShort(raw.eventStatus) } : {}),
    venue: {
      name: String(loc.name ?? ''),
      ...(loc.address?.streetAddress ? { address: loc.address.streetAddress } : {}),
      ...(neighborhood ? { neighborhood } : {}),
      ...(loc.geo ? { lat: loc.geo.latitude, lon: loc.geo.longitude } : {}),
    },
    price: {
      access: raw.isAccessibleForFree ? 'open' : 'with-ticket',
      ...(amount != null && Number.isFinite(amount) && !raw.isAccessibleForFree ? { amount, currency: offer?.priceCurrency } : {}),
    },
    ...(offer?.url ? { ticket_url: offer.url } : {}),
    ...(offer?.seller?.name ? { ticket_seller: offer.seller.name } : {}),
    url: raw.url,
    ...(raw.image ? { image: typeof raw.image === 'string' ? raw.image : raw.image.url } : {}),
    ...(performer ? { performer } : {}),
    description: typeof raw.description === 'string' ? raw.description : '',
  };

  const performerKeys = performer
    ? [performer.name, enWikiTitle(performerSameAs)].filter((x): x is string => !!x).map(looseKey)
    : [];

  return {
    ...rec,
    _startDay: rec.start.slice(0, 10),
    // A stated end wins. No end: a run (theatre, exhibition, festival) lasts
    // the site's presumption window from its start; anything else ends on its
    // start day. The window is applied here too because a stale feed still
    // carries runs the site would already have dropped.
    _endDay: rec.end ? rec.end.slice(0, 10) : presumedEnd(rec.category, rec.start.slice(0, 10)) ?? rec.start.slice(0, 10),
    _haystack: looseKey([rec.name, rec.venue.name, rec.venue.neighborhood ?? '', performer?.name ?? '', rec.description].join(' ')),
    _titleKey: looseKey(rec.name),
    _performerKeys: [...new Set(performerKeys)],
    _qid: performer?.wikidata,
    _neighborhoodKey: neighborhood ? looseKey(neighborhood) : undefined,
  };
}

export function parseFeed(doc: any, lang: Lang): FeedSnapshot {
  if (!doc || doc['@type'] !== 'DataFeed' || !Array.isArray(doc.dataFeedElement)) {
    throw new Error('Not a Schema.org DataFeed (expected @type DataFeed with dataFeedElement[])');
  }
  const events = doc.dataFeedElement.map(toRecord).filter((e: IndexedEvent | null): e is IndexedEvent => e !== null);
  return { lang, dateModified: doc.dateModified, events, byId: new Map(events.map((e: IndexedEvent) => [e.id, e])) };
}

/**
 * The en feed lists only events that have an English description, so on its
 * own it hides every Greek-only event. The English view is the el feed with
 * the en record swapped in wherever one exists for the same id.
 */
export function overlayEnglish(el: FeedSnapshot, en: FeedSnapshot): FeedSnapshot {
  const events = el.events.map((e) => en.byId.get(e.id) ?? e);
  for (const e of en.events) if (!el.byId.has(e.id)) events.push(e);
  // The older of the two timestamps: the view is only as fresh as its stalest part.
  const stamps = [el.dateModified, en.dateModified].filter((x): x is string => !!x).sort();
  return { lang: 'en', dateModified: stamps[0], events, byId: new Map(events.map((e) => [e.id, e])) };
}

export type FeedSource = (lang: Lang) => Promise<FeedSnapshot>;

/**
 * Fetches the live feed with an in-memory cache. On a failed refresh the last
 * good snapshot is served (stale beats empty for a daily-updated calendar).
 */
export function httpFeedSource(origin: string, ttlMs = 10 * 60 * 1000, fetchImpl: typeof fetch = fetch): FeedSource {
  const cache = new Map<Lang, { at: number; snap: FeedSnapshot }>();
  return async (lang) => {
    const hit = cache.get(lang);
    if (hit && Date.now() - hit.at < ttlMs) return hit.snap;
    const url = `${origin}/api/${lang === 'en' ? 'en/' : ''}events.json`;
    try {
      const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      const snap = parseFeed(await res.json(), lang);
      cache.set(lang, { at: Date.now(), snap });
      return snap;
    } catch (err) {
      if (hit) return hit.snap;
      throw err;
    }
  };
}

