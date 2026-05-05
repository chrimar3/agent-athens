/**
 * Build-time Schema.org JSON-LD completeness validator.
 *
 * Parses generated HTML pages, extracts JSON-LD, and reports
 * structural errors (broken schema) vs data-quality warnings
 * (missing descriptions, addresses, coordinates).
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { SCHEMA_TYPE_MAP } from '../enrichment/quality-gates';
import { classifyDateFormat } from '../utils/date-format';
import { getRegionName } from '../utils/schema-geo';

// Valid @type values from our canonical type map
const VALID_SCHEMA_TYPES: Set<string> = new Set(Object.values(SCHEMA_TYPE_MAP));

const PLACEHOLDER_VALUES = ['tba', 'unknown', 'n/a', 'tbd', 'none'];

export interface SchemaValidationResult {
  slug: string;
  errors: string[];
  warnings: string[];
  /**
   * INFO-level signals. Surfaced for awareness; not blocking, not warning.
   * Per Strategist 2026-04-29: `offers.url` is INFO when omitted (legitimate
   * for listing-aggregator and venue-direct-only ticket sources).
   */
  info?: string[];
}

export interface SchemaValidationSummary {
  total: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  details: SchemaValidationResult[];
}

/**
 * Extract JSON-LD from an HTML string. Returns null if not found or unparseable.
 */
function extractJsonLd(html: string): Record<string, any> | null {
  const match = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Check if a value is a non-empty string.
 */
function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if a value looks like a placeholder.
 */
function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return PLACEHOLDER_VALUES.includes(value.trim().toLowerCase());
}

/**
 * Validate a single page's JSON-LD schema completeness.
 *
 * `sameAsSeverity` (Sprint 2 Component B-2, Q-B1 + Q-B5 locks 2026-05-03):
 * decided by orchestrator from venueSameAs ratchet. Default 'info' is a literal
 * for test ergonomics — production paths (validateAllPages → generate-site.ts)
 * always pass explicitly. Validator stays pure (no config reads).
 */
export function validateSchemaCompleteness(
  htmlContent: string,
  eventSlug: string,
  sameAsSeverity: 'info' | 'warn' = 'info',
): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // Extract JSON-LD
  const match = htmlContent.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) {
    return { slug: eventSlug, errors: ['No JSON-LD script tag found'], warnings: [], info: [] };
  }

  let schema: Record<string, any>;
  try {
    schema = JSON.parse(match[1]);
  } catch {
    return { slug: eventSlug, errors: ['Failed to parse JSON-LD'], warnings: [], info: [] };
  }

  // ── Mandatory fields (ERROR if missing) ──────────────────────────

  if (!isNonEmpty(schema['@context']) || schema['@context'] !== 'https://schema.org') {
    errors.push('@context must be "https://schema.org"');
  }

  if (!isNonEmpty(schema['@type'])) {
    errors.push('@type is missing');
  } else if (!VALID_SCHEMA_TYPES.has(schema['@type'])) {
    errors.push(`@type "${schema['@type']}" is not a valid Schema.org event type`);
  }

  if (!isNonEmpty(schema.name)) {
    errors.push('name is missing or empty');
  }

  if (!isNonEmpty(schema.startDate)) {
    errors.push('startDate is missing');
  } else {
    const fmt = classifyDateFormat(schema.startDate);
    if (fmt === 'malformed') {
      errors.push(`startDate is malformed: ${schema.startDate}`);
    } else if (fmt === 'naive-ts') {
      errors.push('startDate is a naive timestamp without timezone offset');
    }
    // date-only (YYYY-MM-DD) and tz-aware are both Schema.org-valid for startDate.
  }

  // Location checks
  const location = schema.location;
  if (!location || !isNonEmpty(location.name)) {
    errors.push('location.name is missing or empty');
  }

  // Q-B1 + Q-B5 lock: location.sameAs surfaces as INFO universally; promotes
  // to WARN when ratchet threshold met (decided by orchestrator). Q-B7: this
  // covers DataFeed transitively — no separate check on the feed itself.
  if (location && typeof location === 'object') {
    const locSameAs = (location as Record<string, unknown>).sameAs;
    const hasLocSameAs = Array.isArray(locSameAs) ? locSameAs.length > 0 : isNonEmpty(locSameAs);
    if (!hasLocSameAs) {
      const msg = 'location.sameAs missing (Wikidata QID, Google Place URL, official URL)';
      if (sameAsSeverity === 'warn') warnings.push(msg);
      else info.push(msg);
    }
  }

  // Conditional offers presence: required UNLESS event is completed.
  // Per Strategist 2026-04-29, EventCompleted events legitimately have no Offer.
  const isCompleted = schema.eventStatus === 'https://schema.org/EventCompleted';
  if (!schema.offers && !isCompleted) {
    errors.push('offers is missing');
  }

  if (typeof schema.isAccessibleForFree !== 'boolean') {
    errors.push('isAccessibleForFree is missing or not boolean');
  }

  if (!isNonEmpty(schema.eventStatus)) {
    errors.push('eventStatus is missing');
  }

  if (!isNonEmpty(schema.eventAttendanceMode)) {
    errors.push('eventAttendanceMode is missing');
  }

  // Offers structural checks (only when offers IS present).
  // Sprint 1 Session 3 — Strategist 2026-04-29 spec.
  if (schema.offers && typeof schema.offers === 'object') {
    const offers = schema.offers;

    // Price format: must be numeric, not contain currency symbols
    if (isNonEmpty(offers.price)) {
      const price = offers.price;
      if (/[€$£¥]/.test(price) || (price !== '' && isNaN(Number(price)))) {
        errors.push(`offers.price must be numeric, got "${price}"`);
      }
    }

    // Empty price string is invalid — should be numeric or omitted entirely
    if (offers.price === '') {
      warnings.push('offers.price is empty (should be numeric or omitted)');
    }

    if (!isNonEmpty(offers.priceCurrency)) {
      errors.push('offers.priceCurrency is missing');
    }

    if (!isNonEmpty(offers.availability)) {
      errors.push('offers.availability is missing');
    }

    // seller: must be Organization-typed object with non-empty name.
    // Accepts dual-type ['Place', 'Organization'] for venue_direct_only (decisions.md 2026-05-02).
    const seller = offers.seller;
    const sellerType = seller && typeof seller === 'object' ? seller['@type'] : undefined;
    const sellerTypeOk = sellerType === 'Organization' ||
      (Array.isArray(sellerType) && sellerType.includes('Organization'));
    const sellerIsValid =
      seller !== null &&
      typeof seller === 'object' &&
      sellerTypeOk &&
      isNonEmpty(seller.name);
    if (!sellerIsValid) {
      errors.push('offers.seller is missing or not an Organization with name');
    }

    // offers.url: INFO-level — surfaced for awareness, not blocking, not warning
    if (!isNonEmpty(offers.url)) {
      info.push('offers.url is omitted (legitimate for non-merchant ticket sources)');
    }
  }

  // ── Data quality checks (WARNING if missing) ─────────────────────

  if (!isNonEmpty(schema.description)) {
    warnings.push('description is empty or missing');
  }

  if (location?.address) {
    if (!isNonEmpty(location.address.streetAddress)) {
      warnings.push('streetAddress is empty');
    }
  }

  if (!location?.geo) {
    warnings.push('location.geo coordinates missing');
  }

  if (!isNonEmpty(schema.image)) {
    warnings.push('image is missing');
  }

  // doorTime is Schema.org optional — only warn if startDate exists but doorTime
  // is suspiciously absent (i.e., the event has a time component suggesting it's
  // a timed event). Exhibitions and events without scraper-provided door times
  // should not be penalized.
  // Note: doorTime omission is now accepted as a valid state.

  // ── Placeholder detection ─────────────────────────────────────────

  const fieldsToCheckForPlaceholders = [
    ['name', schema.name],
    ['description', schema.description],
    ['streetAddress', location?.address?.streetAddress],
  ] as const;

  for (const [field, value] of fieldsToCheckForPlaceholders) {
    if (isPlaceholder(value)) {
      warnings.push(`${field} contains placeholder value "${value}"`);
    }
  }

  return { slug: eventSlug, errors, warnings, info };
}

/**
 * Extract all JSON-LD blocks from an HTML string.
 */
function extractAllJsonLd(html: string): Record<string, any>[] {
  const regex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const results: Record<string, any>[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      results.push(JSON.parse(match[1]));
    } catch {
      // skip unparseable blocks
    }
  }
  return results;
}

/**
 * Validate a hub page's JSON-LD schema (CollectionPage + FAQPage).
 */
export function validateHubSchema(htmlContent: string, hubSlug: string): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const blocks = extractAllJsonLd(htmlContent);
  if (blocks.length === 0) {
    return { slug: `hub:${hubSlug}`, errors: ['No JSON-LD script tag found'], warnings: [] };
  }

  const collectionPage = blocks.find(b => b['@type'] === 'CollectionPage');
  const faqPage = blocks.find(b => b['@type'] === 'FAQPage');

  // ── CollectionPage validation ──
  if (!collectionPage) {
    errors.push('CollectionPage JSON-LD block missing');
  } else {
    if (collectionPage['@context'] !== 'https://schema.org') {
      errors.push('CollectionPage: @context must be "https://schema.org"');
    }
    if (!isNonEmpty(collectionPage.name)) {
      errors.push('CollectionPage: name is missing');
    }
    if (!collectionPage.mainEntity) {
      errors.push('CollectionPage: mainEntity (ItemList) is missing');
    } else if (collectionPage.mainEntity['@type'] !== 'ItemList') {
      errors.push(`CollectionPage: mainEntity @type is "${collectionPage.mainEntity['@type']}", expected ItemList`);
    } else if (!Array.isArray(collectionPage.mainEntity.itemListElement) || collectionPage.mainEntity.itemListElement.length === 0) {
      warnings.push('CollectionPage: itemListElement is empty');
    }
    if (!isNonEmpty(collectionPage.inLanguage)) {
      warnings.push('CollectionPage: inLanguage is missing');
    }
  }

  // ── FAQPage validation ──
  if (!faqPage) {
    warnings.push('FAQPage JSON-LD block missing');
  } else {
    if (faqPage['@context'] !== 'https://schema.org') {
      errors.push('FAQPage: @context must be "https://schema.org"');
    }
    if (!Array.isArray(faqPage.mainEntity) || faqPage.mainEntity.length === 0) {
      errors.push('FAQPage: mainEntity (Question array) is missing or empty');
    } else {
      for (let i = 0; i < faqPage.mainEntity.length; i++) {
        const q = faqPage.mainEntity[i];
        if (q['@type'] !== 'Question') {
          errors.push(`FAQPage: mainEntity[${i}] @type is "${q['@type']}", expected Question`);
        }
        if (!isNonEmpty(q.name)) {
          errors.push(`FAQPage: mainEntity[${i}].name (question text) is missing`);
        }
        if (!q.acceptedAnswer || q.acceptedAnswer['@type'] !== 'Answer') {
          errors.push(`FAQPage: mainEntity[${i}].acceptedAnswer is missing or wrong type`);
        } else if (!isNonEmpty(q.acceptedAnswer.text)) {
          errors.push(`FAQPage: mainEntity[${i}].acceptedAnswer.text is missing`);
        }
      }
    }
  }

  return { slug: `hub:${hubSlug}`, errors, warnings };
}

/**
 * Validate a venue page's JSON-LD schema (LocalBusiness).
 *
 * `expectedAddressRegion` is the canonical city.region.name from city-geodata.json
 * (e.g. "Attica" for Athens). Q-B6 lock 2026-05-03: a present-but-mismatched
 * addressRegion is structural drift, not a data-quality gap → ERROR.
 * Missing addressRegion is silent here (the existing `address is missing` ERROR
 * already covers the missing-address-block case).
 *
 * `sameAsSeverity` is decided once at build start by generate-site.ts based on
 * the venueSameAs ratchet (config/completeness-ratchets.json). 'info' below
 * threshold; 'warn' at-or-above. Validator is pure — receives the decision,
 * doesn't read config (B-1 pattern lock). Q-B1 + Q-B5 locks 2026-05-03.
 */
export function validateVenueSchema(
  htmlContent: string,
  venueSlug: string,
  expectedAddressRegion: string,
  sameAsSeverity: 'info' | 'warn',
): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const match = htmlContent.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return { slug: `venue:${venueSlug}`, errors: [], warnings: [], info: [] };

  let schema: Record<string, any>;
  try {
    schema = JSON.parse(match[1]);
  } catch {
    return { slug: `venue:${venueSlug}`, errors: ['Failed to parse JSON-LD'], warnings: [], info: [] };
  }

  // Mandatory for LocalBusiness
  if (schema['@type'] !== 'LocalBusiness') errors.push(`@type is "${schema['@type']}", expected LocalBusiness`);
  if (!isNonEmpty(schema.name)) errors.push('name is missing');
  if (!schema.address) errors.push('address is missing');

  // Q-B6 lock: addressRegion must equal city.region.name when present.
  const got = schema.address?.addressRegion;
  if (typeof got === 'string' && got !== expectedAddressRegion) {
    errors.push(`addressRegion mismatch: got "${got}", expected "${expectedAddressRegion}" per city-geodata.json`);
  }

  // Q-B1 + Q-B5 lock: venue sameAs (Wikidata QID, Google Place URL, official URL)
  // surfaces as INFO universally; promotes to WARN when ratchet threshold met.
  const sameAs = schema.sameAs;
  const hasSameAs = Array.isArray(sameAs) ? sameAs.length > 0 : isNonEmpty(sameAs);
  if (!hasSameAs) {
    const msg = 'venue sameAs missing (Wikidata QID, Google Place URL, official URL)';
    if (sameAsSeverity === 'warn') warnings.push(msg);
    else info.push(msg);
  }

  // Recommended
  if (!schema.geo) warnings.push('geo coordinates missing');
  if (!isNonEmpty(schema.url)) warnings.push('url is missing');

  return { slug: `venue:${venueSlug}`, errors, warnings, info };
}

/**
 * Validate the Schema.org DataFeed at /api/events.json (Sprint 2 Component A).
 *
 * Mandatory fields per Schema.org DataFeed spec: name, description,
 * dateModified, dataFeedElement. @type must be "DataFeed". Empty
 * dataFeedElement surfaces as a warning, not an error (the build still
 * shipped a feed; consumers can detect emptiness).
 *
 * Slug prefix `datafeed:` mirrors the `hub:` / `venue:` pattern; the
 * Component D reporter routes these into a dedicated `datafeed`
 * aggregate rather than the per-EventType bucket breakdown.
 */
export function validateDataFeed(distDir: string): SchemaValidationResult {
  const dataFeedPath = join(distDir, 'api/events.json');
  const slug = 'datafeed:events';

  if (!existsSync(dataFeedPath)) {
    return { slug, errors: ['DataFeed file missing at /api/events.json'], warnings: [], info: [] };
  }

  let feed: any;
  try {
    feed = JSON.parse(readFileSync(dataFeedPath, 'utf-8'));
  } catch (e) {
    return { slug, errors: [`DataFeed JSON parse error: ${(e as Error).message}`], warnings: [], info: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (feed['@context'] !== 'https://schema.org') errors.push('@context must be "https://schema.org"');
  if (feed['@type'] !== 'DataFeed') errors.push('@type must be "DataFeed"');
  if (!isNonEmpty(feed.name)) errors.push('Missing or empty name');
  if (!isNonEmpty(feed.description)) errors.push('Missing or empty description');
  if (!isNonEmpty(feed.dateModified)) errors.push('Missing or empty dateModified');
  if (!Array.isArray(feed.dataFeedElement)) {
    errors.push('dataFeedElement must be an array');
  } else if (feed.dataFeedElement.length === 0) {
    warnings.push('dataFeedElement is empty');
  }

  return { slug, errors, warnings, info: [] };
}

/**
 * Validate Schema.org microdata in hub-card markup (S101a-B).
 *
 * Per S101a-A audit: validateSchemaCompleteness only parses JSON-LD
 * (script tag at line 86). Hub cards emit Schema.org as HTML microdata
 * via <span itemprop="..."> + <meta itemprop="...">, which the JSON-LD
 * scanner never sees. This function closes that parallel surface for
 * the two FAIL rules Strategist greenlit 2026-04-29:
 *
 *   1. itemprop="price" content must be numeric (mirrors line 172 regex
 *      for JSON-LD offers.price)
 *   2. when itemprop="price" present, itemprop="availability" must be too
 *
 * Past-event cards (eventStatus=EventCompleted) legitimately omit both
 * per availabilityForEventStatus omit_offer branch. Detection: per-card
 * scan for the eventStatus meta within the same <article> block.
 *
 * Cards without itemprop="price" (e.g., card-variants plain text, no-amount
 * events whose Offer block was omitted) are silently skipped — there's
 * nothing to validate.
 */
export function validateMicrodata(html: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract each <article> block — cards are discrete article elements.
  // Non-greedy match handles back-to-back articles without bleeding across.
  const articleRegex = /<article\b[^>]*>([\s\S]*?)<\/article>/g;
  let cardIndex = 0;

  for (const match of html.matchAll(articleRegex)) {
    cardIndex++;
    const card = match[1];

    // Past-event short-circuit: EventCompleted cards legitimately omit
    // price + availability. Skip the entire card from microdata checks.
    if (/itemprop="eventStatus"\s+content="https:\/\/schema\.org\/EventCompleted"/.test(card)) {
      continue;
    }

    // Find itemprop="price" in either <span> or <meta> form.
    const spanPriceMatch = card.match(/<span\s+itemprop="price"[^>]*>([^<]*)<\/span>/);
    const metaPriceMatch = card.match(/<meta\s+itemprop="price"\s+content="([^"]*)"/);

    let priceValue: string | null = null;
    if (spanPriceMatch) priceValue = spanPriceMatch[1].trim();
    else if (metaPriceMatch) priceValue = metaPriceMatch[1].trim();

    // No price microdata at all: card has no Offer to validate. Skip silently.
    if (priceValue === null) continue;

    // Rule 1: numeric only (mirror JSON-LD offers.price rule at line 172).
    if (/[€$£¥]/.test(priceValue) || (priceValue !== '' && isNaN(Number(priceValue)))) {
      errors.push(`Card ${cardIndex}: itemprop="price" must be numeric, got "${priceValue}"`);
    }

    // Rule 2: when price is present, availability must also be present.
    // Schema.org Offer requires both for valid markup.
    const hasAvailability = /itemprop="availability"/.test(card);
    if (!hasAvailability) {
      errors.push(`Card ${cardIndex}: itemprop="price" present but itemprop="availability" missing`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate all generated event pages in a dist directory.
 *
 * `sameAsSeverity` is decided once at build start by generate-site.ts based on
 * the venueSameAs ratchet (config/completeness-ratchets.json) and threaded
 * into per-page validators here. B-1 pattern: orchestrator carries config
 * dependencies; validators stay pure.
 */
export function validateAllPages(distDir: string, sameAsSeverity: 'info' | 'warn'): SchemaValidationSummary {
  const eventsDir = join(distDir, 'events');
  if (!existsSync(eventsDir)) {
    return { total: 0, passCount: 0, warnCount: 0, failCount: 0, details: [] };
  }

  const slugDirs = readdirSync(eventsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const details: SchemaValidationResult[] = [];

  for (const slug of slugDirs) {
    const htmlPath = join(eventsDir, slug, 'index.html');
    if (!existsSync(htmlPath)) continue;

    const html = readFileSync(htmlPath, 'utf-8');
    details.push(validateSchemaCompleteness(html, slug, sameAsSeverity));
  }

  // Also scan English pages (dist/en/events/)
  const enEventsDir = join(distDir, 'en/events');
  if (existsSync(enEventsDir)) {
    const enSlugDirs = readdirSync(enEventsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const slug of enSlugDirs) {
      const htmlPath = join(enEventsDir, slug, 'index.html');
      if (!existsSync(htmlPath)) continue;
      const html = readFileSync(htmlPath, 'utf-8');
      details.push(validateSchemaCompleteness(html, `en/${slug}`, sameAsSeverity));
    }
  }

  // Scan hub pages (dist/*.html for known hub slugs + dist/en/*/index.html)
  const HUB_SLUGS = [
    'today', 'this-weekend', 'this-month', 'concerts', 'theater',
    'nightlife', 'festivals', 'kids', 'exhibitions', 'open',
    'cinema', 'dance', 'classical-music', 'with-ticket', 'comedy', 'greek-music'
  ];
  for (const slug of HUB_SLUGS) {
    const htmlPath = join(distDir, `${slug}.html`);
    if (!existsSync(htmlPath)) continue;
    const html = readFileSync(htmlPath, 'utf-8');
    const hubResult = validateHubSchema(html, slug);
    // S101a-B: also scan microdata on hub cards (parallel emission surface).
    const microResult = validateMicrodata(html);
    hubResult.errors.push(...microResult.errors);
    hubResult.warnings.push(...microResult.warnings);
    details.push(hubResult);
  }
  // English hub pages (dist/en/{slug}/index.html) — only validate known hub slugs
  const enDir = join(distDir, 'en');
  const hubSlugSet = new Set(HUB_SLUGS);
  if (existsSync(enDir)) {
    const enSubdirs = readdirSync(enDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && hubSlugSet.has(d.name))
      .map(d => d.name);
    for (const slug of enSubdirs) {
      const htmlPath = join(enDir, slug, 'index.html');
      if (!existsSync(htmlPath)) continue;
      const html = readFileSync(htmlPath, 'utf-8');
      const hubResult = validateHubSchema(html, `en/${slug}`);
      const microResult = validateMicrodata(html);
      hubResult.errors.push(...microResult.errors);
      hubResult.warnings.push(...microResult.warnings);
      details.push(hubResult);
    }
  }

  // Scan venue pages (dist/venues/)
  const venuesDir = join(distDir, 'venues');
  if (existsSync(venuesDir)) {
    const venueSlugs = readdirSync(venuesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    const expectedRegion = getRegionName();
    for (const slug of venueSlugs) {
      const htmlPath = join(venuesDir, slug, 'index.html');
      if (!existsSync(htmlPath)) continue;
      const html = readFileSync(htmlPath, 'utf-8');
      details.push(validateVenueSchema(html, slug, expectedRegion, sameAsSeverity));
    }
  }

  // Scan Schema.org DataFeed at /api/events.json (Sprint 2 Component A)
  details.push(validateDataFeed(distDir));

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const result of details) {
    if (result.errors.length > 0) {
      failCount++;
    } else if (result.warnings.length > 0) {
      warnCount++;
    } else {
      passCount++;
    }
  }

  return { total: details.length, passCount, warnCount, failCount, details };
}

/**
 * Print a human-readable schema completeness summary to console.
 */
export function printSchemaSummary(summary: SchemaValidationSummary): void {
  const { total, passCount, warnCount, failCount, details } = summary;
  if (total === 0) {
    console.log('\n📋 Schema validation: no pages found');
    return;
  }

  // Count by page type
  const eventCount = details.filter(d =>
    !d.slug.startsWith('hub:') &&
    !d.slug.startsWith('venue:') &&
    !d.slug.startsWith('datafeed:')
  ).length;
  const hubCount = details.filter(d => d.slug.startsWith('hub:')).length;
  const venueCount = details.filter(d => d.slug.startsWith('venue:')).length;
  const datafeedCount = details.filter(d => d.slug.startsWith('datafeed:')).length;

  // Sprint 2 Component B-2: INFO is orthogonal to pass/warn/fail. A page can
  // be PASS and still have INFO findings — INFO does not downgrade pass status.
  const infoCount = details.filter(d => (d.info?.length ?? 0) > 0).length;

  const passRate = Math.round((passCount / total) * 100);
  console.log(`\n📋 Schema completeness: ${passCount}/${total} pages fully valid (${passRate}%)`);
  console.log(
    `   📊 ${eventCount} event + ${hubCount} hub + ${venueCount} venue` +
      (datafeedCount > 0 ? ` + ${datafeedCount} datafeed` : '') +
      ` pages`,
  );
  console.log(`   ✅ ${passCount} pass  ⚠️  ${warnCount} warnings  ❌ ${failCount} errors`);
  if (infoCount > 0) {
    console.log(`   ℹ️  ${infoCount} pages with INFO findings (Sprint 2 Component B-2 — orthogonal to pass/warn/fail)`);
  }

  // Show errors grouped by type
  if (failCount > 0) {
    const errorCounts = new Map<string, number>();
    for (const result of details) {
      for (const err of result.errors) {
        errorCounts.set(err, (errorCounts.get(err) || 0) + 1);
      }
    }
    console.log(`\n   Errors by type:`);
    for (const [msg, count] of [...errorCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${count}× ${msg}`);
    }
  }

  // Show top warnings by frequency
  if (warnCount > 0 || failCount > 0) {
    const warnCounts = new Map<string, number>();
    for (const result of details) {
      for (const warn of result.warnings) {
        warnCounts.set(warn, (warnCounts.get(warn) || 0) + 1);
      }
    }
    if (warnCounts.size > 0) {
      console.log(`\n   Top data gaps:`);
      for (const [msg, count] of [...warnCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        const pct = Math.round((count / total) * 100);
        console.log(`     ${count}/${total} (${pct}%) ${msg}`);
      }
    }
  }

  // Sprint 2 Component B-2: top INFO findings — separate block, never conflated
  // with WARN. Surfaces the most common INFO messages so consumers can see what
  // INFO is currently signaling (most often: missing venue/location.sameAs).
  if (infoCount > 0) {
    const infoCounts = new Map<string, number>();
    for (const result of details) {
      for (const i of result.info ?? []) {
        infoCounts.set(i, (infoCounts.get(i) || 0) + 1);
      }
    }
    if (infoCounts.size > 0) {
      console.log(`\n   Top INFO findings:`);
      for (const [msg, count] of [...infoCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        const pct = Math.round((count / total) * 100);
        console.log(`     ${count}/${total} (${pct}%) ${msg}`);
      }
    }
  }
}
