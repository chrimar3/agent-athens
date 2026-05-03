/**
 * Schema.org geographic hierarchy helpers
 *
 * Builds containedInPlace chains for events and venues,
 * resolves eventStatus based on date, and exports the
 * Organization schema for the homepage.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { NEIGHBORHOOD_GREEK } from './neighborhoods';
import { BASE_URL } from '../config/site-url';

// Load geodata configs
const neighborhoodGeodata: Record<string, { name: string; qid: string; lat: number; lng: number }> =
  JSON.parse(readFileSync(join(import.meta.dir, '../../config/neighborhood-geodata.json'), 'utf-8'));

interface CityGeoBlock {
  name: string;
  qid: string;
  lat: number;
  lng: number;
}

interface CityGeoData {
  municipality: CityGeoBlock;
  region: CityGeoBlock;
  country: CityGeoBlock & { code: string; currency: string };
}

const cityGeodata: CityGeoData =
  JSON.parse(readFileSync(join(import.meta.dir, '../../config/city-geodata.json'), 'utf-8'));

// Build reverse Greek→English lookup from NEIGHBORHOOD_GREEK
const greekToEnglish = new Map<string, string>();
for (const [english, greek] of Object.entries(NEIGHBORHOOD_GREEK)) {
  greekToEnglish.set(greek, english);
}

/**
 * Resolve a neighborhood value (English or Greek) to the English key
 * used in neighborhood-geodata.json.
 */
function resolveNeighborhoodKey(input: string): string | null {
  // Direct match in geodata
  if (neighborhoodGeodata[input]) return input;
  // Greek value → English key
  const english = greekToEnglish.get(input);
  if (english && neighborhoodGeodata[english]) return english;
  return null;
}

function buildPlaceLevel(name: string, qid: string, lat: number, lng: number, containedIn?: object): object {
  const place: Record<string, any> = {
    '@type': 'Place',
    'name': name,
    'sameAs': `https://www.wikidata.org/wiki/${qid}`,
    'geo': {
      '@type': 'GeoCoordinates',
      'latitude': lat,
      'longitude': lng
    }
  };
  if (containedIn) {
    place.containedInPlace = containedIn;
  }
  return place;
}

/**
 * Build a nested containedInPlace chain.
 *
 * With neighborhood: Neighborhood → Municipality of Athens → Attica → Greece
 * Without:           Municipality of Athens → Attica → Greece
 */
export function buildContainedInPlace(neighborhood?: string | null): object {
  const { region, country, municipality } = cityGeodata;

  // Build chain bottom-up: Greece → Attica → Municipality → (Neighborhood)
  const greece = buildPlaceLevel(country.name, country.qid, country.lat, country.lng);
  const attica = buildPlaceLevel(region.name, region.qid, region.lat, region.lng, greece);
  const athens = buildPlaceLevel(municipality.name, municipality.qid, municipality.lat, municipality.lng, attica);

  if (!neighborhood) return athens;

  const key = resolveNeighborhoodKey(neighborhood);
  if (!key) return athens;

  const data = neighborhoodGeodata[key];
  return buildPlaceLevel(data.name, data.qid, data.lat, data.lng, athens);
}

/**
 * Resolve eventStatus based on whether the event is past or future.
 *
 * Tier 1 rule: exhibitions use endDate, everything else uses startDate.
 * Comparison is date-only (YYYY-MM-DD) in Europe/Athens timezone.
 */
export function resolveEventStatus(startDate: string, endDate?: string | null, type?: string): string {
  // Determine which date to compare
  const isExhibition = type === 'exhibition';
  const relevantDate = (isExhibition && endDate) ? endDate : startDate;

  // Extract YYYY-MM-DD from the date string
  const dateOnly = relevantDate.substring(0, 10);

  // Get today in Athens timezone (date-only comparison)
  const now = new Date();
  // Manual Athens offset: EET = +02:00, EEST = +03:00
  // DST in Europe: last Sunday of March to last Sunday of October
  const year = now.getUTCFullYear();
  const marchLast = new Date(Date.UTC(year, 2, 31));
  const marchSunday = 31 - marchLast.getUTCDay();
  const octLast = new Date(Date.UTC(year, 9, 31));
  const octSunday = 31 - octLast.getUTCDay();

  const dstStart = Date.UTC(year, 2, marchSunday, 1); // March last Sunday 01:00 UTC
  const dstEnd = Date.UTC(year, 9, octSunday, 1);     // October last Sunday 01:00 UTC
  const nowMs = now.getTime();

  const offsetHours = (nowMs >= dstStart && nowMs < dstEnd) ? 3 : 2;
  const athensNow = new Date(nowMs + offsetHours * 3600 * 1000);
  const todayStr = athensNow.toISOString().substring(0, 10);

  if (dateOnly >= todayStr) {
    return 'https://schema.org/EventScheduled';
  }
  return 'https://schema.org/EventCompleted';
}

/**
 * Availability decision for `offers.availability` based on `eventStatus`.
 * Per 2026-04-29 Strategist spec:
 *   EventScheduled / EventPostponed / EventRescheduled → InStock
 *   EventCancelled → Discontinued
 *   EventCompleted → omit the entire offers block (past events have no offer)
 *   default → InStock (defensive — prefer presence to absence)
 */
export type AvailabilityResult =
  | { kind: 'emit'; value: 'https://schema.org/InStock' | 'https://schema.org/Discontinued' }
  | { kind: 'omit_offer' };

export function availabilityForEventStatus(eventStatus: string): AvailabilityResult {
  switch (eventStatus) {
    case 'https://schema.org/EventScheduled':
    case 'https://schema.org/EventPostponed':
    case 'https://schema.org/EventRescheduled':
      return { kind: 'emit', value: 'https://schema.org/InStock' };
    case 'https://schema.org/EventCancelled':
      return { kind: 'emit', value: 'https://schema.org/Discontinued' };
    case 'https://schema.org/EventCompleted':
      return { kind: 'omit_offer' };
    default:
      return { kind: 'emit', value: 'https://schema.org/InStock' };
  }
}

/**
 * ISO-3166 country code for the configured city's country (e.g. "GR").
 * Single source of truth for `addressCountry` in JSON-LD address blocks.
 */
export function getCountryCode(): string {
  return cityGeodata.country.code;
}

/**
 * ISO-4217 currency code for the configured city's country (e.g. "EUR").
 * Single source of truth for `priceCurrency` in JSON-LD offers blocks.
 */
export function getCurrencyCode(): string {
  return cityGeodata.country.currency;
}

/**
 * Administrative region name for the configured city (e.g. "Attica" for Athens,
 * "Catalonia" for Barcelona, "Berlin" for Berlin). Single source of truth for
 * `addressRegion` in JSON-LD address blocks. Q-B6 lock 2026-05-03.
 */
export function getRegionName(): string {
  return cityGeodata.region.name;
}

/**
 * Organization schema for the homepage JSON-LD block.
 */
export const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  'name': 'agent-athens',
  'url': BASE_URL,
  'description': 'AI-curated cultural events calendar for Athens, Greece. Daily updated listings for concerts, exhibitions, theater, and more.',
  'areaServed': {
    '@type': 'Place',
    'name': 'Athens',
    'sameAs': 'https://www.wikidata.org/wiki/Q1524'
  },
  'knowsLanguage': ['el', 'en']
};
