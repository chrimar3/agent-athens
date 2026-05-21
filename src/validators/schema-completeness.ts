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
import { BASE_URL } from '../config/site-url';
import { getLifecyclePhase } from '../utils/event-lifecycle';

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

// Canonical Price.type vocabulary per CLAUDE.md Tier 1. 'donation' is dormant
// but wired (i18n labels + branches in offer-builder/resolver/cta/templates);
// remove only after confirming all referencing code is also removed (S136 note).
const ALLOWED_PRICE_TYPES: ReadonlySet<string> = new Set(['open', 'with-ticket', 'donation']);

/**
 * Shared Offer-shape validator (S139-fix Strategist ruling 2026-05-20).
 *
 * Applied to every emitted Offer regardless of surface: event-page detail
 * (Event.offers), hub CollectionPage ListItem (CollectionPage.mainEntity.
 * itemListElement[].item.offers), and any future surface registered in the
 * S110 Coverage Manifest. The "price OR priceSpecification required" rule
 * closes the drift class that produced 15 price-less ListItem Offers in the
 * 2026-05-20 deploy (validator.schema.org rejected them; the build was clean
 * because this rule was missing).
 *
 * `contextPrefix` is prepended to every emitted error/warning so the caller
 * can localize the surface (e.g. "ListItem[3]: " for a specific list index).
 * Pass an empty string for the top-level Event.offers case.
 */
export function validateOfferShape(
  offers: Record<string, any>,
  contextPrefix: string = '',
): { errors: string[]; warnings: string[]; info: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // S139-fix FAIL rule: any emitted Offer must carry a price OR a
  // priceSpecification. Bare Offer (priceCurrency + availability with no
  // price) is malformed per Schema.org and rejected by validator.schema.org.
  // Caller-side: buildOfferOrOmit returns { omit: true } in this state so
  // the Offer never escapes; this rule is the build-time enforcement that
  // catches any future caller that bypasses the canonical builder.
  if (!isNonEmpty(offers.price) && !offers.priceSpecification) {
    errors.push(`${contextPrefix}offers must have price or priceSpecification (got neither)`);
  }

  // Price format: must be numeric, not contain currency symbols.
  if (isNonEmpty(offers.price)) {
    const price = offers.price;
    if (/[€$£¥]/.test(price) || (price !== '' && isNaN(Number(price)))) {
      errors.push(`${contextPrefix}offers.price must be numeric, got "${price}"`);
    }
  }

  // Empty price string is invalid — should be numeric or omitted entirely.
  // (The bare-price rule above already FAILs in this case; keep the warning
  // for explicit feedback when the value is present-but-empty.)
  if (offers.price === '') {
    warnings.push(`${contextPrefix}offers.price is empty (should be numeric or omitted)`);
  }

  if (!isNonEmpty(offers.priceCurrency)) {
    errors.push(`${contextPrefix}offers.priceCurrency is missing`);
  }

  if (!isNonEmpty(offers.availability)) {
    errors.push(`${contextPrefix}offers.availability is missing`);
  }

  // seller: must be Organization-typed object with non-empty name.
  // Accepts dual-type ['Place', 'Organization'] for venue_direct_only
  // (decisions.md 2026-05-02). Same-page @id references are also accepted
  // (Sprint 3 envelope migration moves callers to shape (b)).
  const seller = offers.seller;
  if (seller && typeof seller === 'object' && '@id' in seller && !('@type' in seller)) {
    // Shape (b) — same-page @id reference. Resolved by the validator's
    // resolveSamePageReferences pass; if it didn't resolve to an
    // Organization member, that's a separate coverage problem caught
    // upstream. Treat as valid here.
  } else {
    const sellerType = seller && typeof seller === 'object' ? seller['@type'] : undefined;
    const sellerTypeOk = sellerType === 'Organization' ||
      (Array.isArray(sellerType) && sellerType.includes('Organization'));
    const sellerIsValid =
      seller !== null &&
      typeof seller === 'object' &&
      sellerTypeOk &&
      isNonEmpty(seller.name);
    if (!sellerIsValid) {
      errors.push(`${contextPrefix}offers.seller is missing or not an Organization with name`);
    }
  }

  // offers.url: INFO-level — surfaced for awareness, not blocking.
  if (!isNonEmpty(offers.url)) {
    info.push(`${contextPrefix}offers.url is omitted (legitimate for non-merchant ticket sources)`);
  }

  return { errors, warnings, info };
}

/**
 * Detective control paired with normalizePriceType() at the write boundary.
 * Single-call-site normalizers in multi-writer codebases fail silently when
 * a parallel writer is added without adopting the normalizer (S136 → 42-row
 * regression from scripts/scrape-all.ts within 24h of the migration).
 * This rule fails the build if any in-scope event row carries an out-of-
 * vocabulary price_type value, so the next bypass produces a CI failure
 * rather than a silent production violation.
 *
 * `null`/`undefined` are accepted: pre-enrichment rows legitimately carry
 * null price_type before scrapers populate it.
 */
export function validatePriceTypeVocabulary(event: {
  id?: string;
  price_type?: string | null;
  source?: string;
}): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const value = event.price_type;

  if (value !== null && value !== undefined && !ALLOWED_PRICE_TYPES.has(value)) {
    const id = event.id ?? '(unknown id)';
    errors.push(
      `price_type out of vocabulary on event ${id}: "${value}" ` +
      `(allowed: open, with-ticket, donation)`
    );
  }

  return { slug: event.id ?? '', errors, warnings };
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

  // S132' validator-depth fix: enumerate all JSON-LD blocks (not first-match),
  // locate the Event-typed one, validate it. Surfaces dual-Event emission as
  // a structural error so a future regression cannot ship silently with the
  // green emitter masking a broken second emitter.
  //
  // Preserves three pre-fix error paths so existing diagnostics still surface:
  //   - empty page → "No JSON-LD script tag found"
  //   - script tag(s) present but unparseable → "Failed to parse JSON-LD"
  //   - single block with invalid @type → falls through to the per-field
  //     "@type is not a valid Schema.org event type" error
  const rawScriptCount = [...htmlContent.matchAll(/<script\s+type="application\/ld\+json">/g)].length;
  // S139: flatten @graph envelopes into entity-level blocks so flat-path
  // field lookups continue to work post-migration.
  const rawFlatBlocks = flattenGraph(extractAllJsonLd(htmlContent));

  // S143 (Strategist 2026-05-20): Pre-resolution required-inline rule.
  // resolveSamePageReferences() below inlines bare-@id references from same-page
  // nodes (the literal-vs-graph blind spot that let bare-@id Event.location ship
  // and lose GSC Events-rich-result eligibility). For REQUIRED nested Event
  // fields, this rule asserts inline presence on the raw entity — name + address
  // must materialize on Event.location itself, not be merely @id-resolvable. The
  // canonical venue node (separate @graph member, same @id) still carries
  // geo/sameAs/containedInPlace via @id merge for graph consumers; the inline
  // projection only requires the rich-result-required set. Same scope-drift class
  // as S139-fix-1/-2 — pattern is reusable for future required-nested rules.
  const rawEventEntity = rawFlatBlocks.find(b => {
    const t = b?.['@type'];
    return typeof t === 'string' && VALID_SCHEMA_TYPES.has(t);
  });
  if (rawEventEntity && rawEventEntity.location !== undefined && rawEventEntity.location !== null) {
    const loc = rawEventEntity.location;
    const isObj = typeof loc === 'object' && !Array.isArray(loc);
    const hasInlineName = isObj && isNonEmpty(loc.name);
    const hasInlineAddress = isObj && loc.address && typeof loc.address === 'object';
    if (!hasInlineName || !hasInlineAddress) {
      errors.push(
        'LOCATION_NOT_INLINE: Event.location must materialize name + address inline (bare-@id reference is not Google-rich-result-eligible — validator.schema.org resolves @id same-page; GSC parser does not)',
      );
    }
  }

  const blocks = resolveSamePageReferences(rawFlatBlocks);

  if (rawScriptCount === 0) {
    return { slug: eventSlug, errors: ['No JSON-LD script tag found'], warnings: [], info: [] };
  }
  if (blocks.length === 0) {
    return { slug: eventSlug, errors: ['Failed to parse JSON-LD'], warnings: [], info: [] };
  }

  const eventBlocks = blocks.filter(b => {
    const t = b['@type'];
    return typeof t === 'string' && VALID_SCHEMA_TYPES.has(t);
  });

  // Zero Event blocks: two sub-cases.
  //   - exactly one block → fall through and validate it (yields the existing
  //     specific "@type is not a valid Schema.org event type" error path)
  //   - multiple blocks, none Event-typed → emit the new structural error
  if (eventBlocks.length === 0 && blocks.length > 1) {
    return {
      slug: eventSlug,
      errors: [`No Event JSON-LD found on event page (${blocks.length} non-Event block(s) present)`],
      warnings: [],
      info: [],
    };
  }

  if (eventBlocks.length > 1) {
    errors.push(
      `multiple Event JSON-LD blocks present (count: ${eventBlocks.length}) — schema.org expects one Event per page`,
    );
  }

  const schema = eventBlocks[0] ?? blocks[0];

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

  // S134 — Offer-presence rule reshape (2026-05-11 Unclassifiable-Merchant decision):
  // The offers block is OPTIONAL — emission is gated by the classifier (see
  // src/utils/ticket-source-classifier.ts → classifyTicketSource). When omitted,
  // the with-ticket ticketing signal is carried by isAccessibleForFree:false at
  // event level. The validator no longer requires offers presence; it validates
  // Offer-property shape when offers IS present (see Offers structural checks below).
  //
  // Floor: with-ticket-shaped events (isAccessibleForFree:false) without an Offer
  // must still emit isAccessibleForFree explicitly — covered by the next check
  // (isAccessibleForFree must be a boolean). EventCompleted, open, and donation
  // events legitimately have no Offer for distinct reasons; all paths pass.

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
  // Sprint 1 Session 3 — Strategist 2026-04-29 spec; S139-fix Strategist
  // 2026-05-20 extracted the rule body into validateOfferShape() so the
  // ListItem surface in validateHubSchema applies the same checks.
  if (schema.offers && typeof schema.offers === 'object') {
    const offerResult = validateOfferShape(schema.offers, '');
    errors.push(...offerResult.errors);
    warnings.push(...offerResult.warnings);
    info.push(...offerResult.info);
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

  // S143 (Strategist 2026-05-20, GEO-refined): Geo is specced on the canonical
  // venue node (separate @graph member). Under the inline-with-@id
  // Event.location form, resolveSamePageReferences() does NOT inline geo onto
  // Event.location (it inlines only bare-@id refs with exactly one key — see
  // :474). Scope the geo-presence check to the canonical venue node by @id
  // lookup. This keeps the geo-gap WARN signal visible for real venue-data
  // gaps (routed to Component B sameAs/geo backfill) without building merge-
  // resolution into the validator and matches "geo is a venue-entity property."
  // Fall back to location.geo for legacy/fully-inline forms with no @id ref.
  const locationId = (location && typeof location === 'object')
    ? (location as Record<string, unknown>)['@id']
    : undefined;
  const canonicalVenueNode = (typeof locationId === 'string')
    ? rawFlatBlocks.find(b => b?.['@id'] === locationId)
    : null;
  const venueGeo = canonicalVenueNode?.geo ?? location?.geo;
  if (!venueGeo) {
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
 * Flatten any `@graph` envelopes into their individual member entities.
 *
 * Per S138 Section 3.1: the validator's flat-path field lookups
 * (MANDATORY_FIELDS, RECOMMENDED_FIELDS, INFO_FIELDS) continue to work
 * against individual entities post-flattening. Members of an envelope
 * inherit the envelope's `@context` (preserves the per-entity @context
 * contract the validator's @context check expects).
 *
 * For blocks that have no `@graph`, returns them as-is (flat blocks
 * survive the migration unchanged).
 */
/**
 * Resolve same-page `{"@id": X}` references within each entity by inlining
 * the referenced entity's properties (minus its own `@id`).
 *
 * Per S138 Section 2.4: when Event.location is emitted as `{"@id": ...}` and
 * the venue entity is materialized as a separate @graph member with full
 * address/geo data, same-page reference resolution must succeed for the
 * validator's flat-path field lookups (location.name, location.address) to
 * continue working.
 *
 * Orphan references (no matching `@id` in the same page) are left as-is —
 * downstream orphan-reference validation (S141) detects them explicitly.
 */
export function resolveSamePageReferences(entities: Record<string, any>[]): Record<string, any>[] {
  const byId = new Map<string, Record<string, any>>();
  for (const e of entities) {
    if (e && typeof e === 'object' && typeof e['@id'] === 'string') {
      byId.set(e['@id'], e);
    }
  }

  const visit = (node: any, depth: number): any => {
    if (depth > 10) return node; // cycle guard
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(n => visit(n, depth + 1));

    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === '@id') {
      const target = byId.get(node['@id']);
      if (!target) return node; // orphan ref — leave for S141 detection
      const { '@id': _omit, ...rest } = target;
      return visit(rest, depth + 1);
    }

    const out: Record<string, any> = {};
    for (const k of keys) out[k] = visit(node[k], depth + 1);
    return out;
  };

  return entities.map(e => visit(e, 0));
}

export function flattenGraph(blocks: Record<string, any>[]): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (Array.isArray(block['@graph'])) {
      const envelopeContext = block['@context'];
      for (const member of block['@graph']) {
        if (!member || typeof member !== 'object') continue;
        if (envelopeContext != null && member['@context'] == null) {
          out.push({ '@context': envelopeContext, ...member });
        } else {
          out.push(member);
        }
      }
    } else {
      out.push(block);
    }
  }
  return out;
}

// ─── S141: Orphan-@id-reference + canonical-page member-ordering ─────────────

/**
 * S141 page-class taxonomy. Maps to the four surfaces that emit a canonical
 * @graph envelope with a known first-entity / site-publisher-last contract.
 */
export type PageClass = 'event' | 'hub' | 'venue' | 'homepage';

/**
 * S134 §3 entity-type scope for the orphan-reference FAIL rule. URL-fragment
 * detected — `#venue` and `#place` both map to Place. Performer and Organizer
 * have no current emitter surface (Organizer arrives in S142); the scope is
 * intentionally forward-protective for those types.
 *
 * Out of S141 scope (silently skipped): `#event`, `#offer`, `#website`,
 * `#collectionpage`, `#faqpage`, `#editor-picks`. Extend this set only after a
 * Strategist decision broadens the rule.
 */
const ORPHAN_SCOPED_FRAGMENTS: ReadonlySet<string> = new Set([
  'venue', 'place', 'performer', 'organization', 'organizer',
]);

/**
 * Recursively collect every pure-reference `{"@id": X}` object — a dict whose
 * only key is `@id`. Objects with `@id` AND other fields are definitions, not
 * references, and are skipped. Matches the convention enforced by
 * `resolveSamePageReferences` (line ~438).
 */
function collectPureRefs(node: any, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const it of node) collectPureRefs(it, out);
    return;
  }
  const keys = Object.keys(node);
  if (keys.length === 1 && keys[0] === '@id' && typeof node['@id'] === 'string') {
    out.push(node['@id']);
    return;
  }
  for (const v of Object.values(node)) collectPureRefs(v, out);
}

/**
 * Collect every `@id` defined on this page — any object with `@id` plus at
 * least one other key. Walks the full tree (definitions can appear nested
 * inside another entity, not only as top-level @graph members).
 */
function collectDefinedIds(flattened: Record<string, any>[]): Set<string> {
  const out = new Set<string>();
  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const it of node) visit(it); return; }
    const keys = Object.keys(node);
    if (typeof node['@id'] === 'string' && keys.length > 1) {
      out.add(node['@id']);
    }
    for (const v of Object.values(node)) visit(v);
  };
  for (const e of flattened) visit(e);
  return out;
}

/**
 * S141 — Orphan-@id-reference FAIL rule.
 *
 * Asserts every internal pure-reference `{"@id": X}` in a page's JSON-LD
 * resolves to either (a) a same-page entity definition or (b) the canonical
 * URL of another emitted dist/ page. External refs (Wikidata QIDs etc.) are
 * silently allowed.
 *
 * Per S134 §3, the FAIL scope is the four entity types Place / Performer /
 * Organization / Organizer, detected by URL-fragment matching (see
 * ORPHAN_SCOPED_FRAGMENTS). Refs outside that scope (`#event`, `#offer`, …)
 * are silently skipped — they belong to a future rule, not this one.
 *
 * Designed to be called from validateAllPages after the global canonical URL
 * set has been collected (Pass 1). Validator stays pure — accepts the set as
 * a parameter, never reads dist/ itself.
 *
 * S141 Step 0c diagnostic confirmed 0 true orphans across the 5,126-page
 * baseline corpus → severity is FAIL (errors[]) without ratchet wrapping.
 */
export function checkOrphanReferences(
  html: string,
  pageSlug: string,
  canonicalUrls: ReadonlySet<string>,
  internalHost: string,
): SchemaValidationResult {
  const flat = flattenGraph(extractAllJsonLd(html));
  const defined = collectDefinedIds(flat);
  const refs: string[] = [];
  for (const e of flat) collectPureRefs(e, refs);

  const errors: string[] = [];
  for (const ref of refs) {
    if (defined.has(ref)) continue; // same-page resolved

    let host: string;
    try { host = new URL(ref).host; }
    catch { continue; } // malformed URL — silent skip (validator is not a URL-format gate)

    if (host !== internalHost) continue; // external — out of scope (Wikidata, schema.org enums)

    // Cross-page canonical: strip fragment, normalize trailing slash, check
    // against the Pass-1 set. Whitelisting this category is forward-protective
    // for S142+ (cross-page Organizer/Performer refs are valid by URL deref).
    const base = ref.split('#')[0].replace(/\/$/, '');
    if (canonicalUrls.has(base)) continue;

    // In-scope filter: only Place/Performer/Organization/Organizer fragments
    // FAIL the build per S134 §3. Other fragments are silently skipped.
    const fragment = ref.includes('#') ? ref.split('#').pop()! : '';
    if (!ORPHAN_SCOPED_FRAGMENTS.has(fragment)) continue;

    errors.push(
      `orphan @id reference: "${ref}" resolves to no same-page entity and no emitted page`,
    );
  }
  return { slug: pageSlug, errors, warnings: [], info: [] };
}

/**
 * S141 — Canonical-page @graph member-ordering FAIL rule.
 *
 * Enforces bookends only — middle reorders are stylistic and intentionally
 * unchecked. Per page class:
 *
 *   - First member `@type`:
 *       event     → any of VALID_SCHEMA_TYPES (event subclass set)
 *       venue     → 'LocalBusiness'
 *       hub       → 'CollectionPage'
 *       homepage  → 'WebSite'
 *
 *   - Last member `@id` (all classes): `${BASE_URL}/#organization`
 *
 * Pages with fewer than 2 @graph members are skipped — the existing per-page
 * validators handle their structural validation; ordering is undefined on a
 * single member.
 */
export function checkMemberOrdering(
  html: string,
  pageSlug: string,
  pageClass: PageClass,
  baseUrl: string,
): SchemaValidationResult {
  const flat = flattenGraph(extractAllJsonLd(html));
  if (flat.length < 2) return { slug: pageSlug, errors: [], warnings: [], info: [] };

  const errors: string[] = [];
  const first = flat[0];
  const last = flat[flat.length - 1];
  const firstType = first?.['@type'];

  let expectedFirstDesc: string;
  let firstOk: boolean;
  switch (pageClass) {
    case 'event':
      expectedFirstDesc = 'an event subclass (Concert/MusicEvent/TheaterEvent/…)';
      firstOk = typeof firstType === 'string' && VALID_SCHEMA_TYPES.has(firstType);
      break;
    case 'venue':
      expectedFirstDesc = 'LocalBusiness';
      firstOk = firstType === 'LocalBusiness';
      break;
    case 'hub':
      expectedFirstDesc = 'CollectionPage';
      firstOk = firstType === 'CollectionPage';
      break;
    case 'homepage':
      expectedFirstDesc = 'WebSite';
      firstOk = firstType === 'WebSite';
      break;
  }

  if (!firstOk) {
    errors.push(
      `@graph member order: first member @type is "${firstType}", expected ${expectedFirstDesc} for ${pageClass} page`,
    );
  }

  const expectedLastId = `${baseUrl.replace(/\/$/, '')}/#organization`;
  if (last?.['@id'] !== expectedLastId) {
    errors.push(
      `@graph member order: last member @id is "${last?.['@id']}", expected "${expectedLastId}" (site-publisher Organization must be last)`,
    );
  }

  return { slug: pageSlug, errors, warnings: [], info: [] };
}

/**
 * Pass-1 helper for validateAllPages: walks dist/ once and extracts every
 * page's canonical URL from the `<link rel="canonical">` tag. Fast regex
 * scan (no JSON-LD parsing). The resulting set is the cross-page-valid
 * whitelist consumed by checkOrphanReferences.
 *
 * Returned URLs have trailing slashes stripped so cross-page refs match
 * regardless of trailing-slash style (Event canonical URLs end in `/`,
 * hub canonicals do not — normalize both into the same shape).
 */
function collectCanonicalUrls(distDir: string): Set<string> {
  const out = new Set<string>();
  const canonicalRegex = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i;

  const walk = (dir: string): void => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name.endsWith('.html')) {
        try {
          const html = readFileSync(p, 'utf-8');
          const m = html.match(canonicalRegex);
          if (m) out.add(m[1].replace(/\/$/, ''));
        } catch { /* unreadable — skip */ }
      }
    }
  };
  if (existsSync(distDir)) walk(distDir);
  return out;
}

/**
 * Merge a child SchemaValidationResult's findings into a parent result.
 * Used by validateAllPages to fold the S141 orphan + ordering checks into
 * the per-page validator's existing result.
 */
function mergeIntoResult(into: SchemaValidationResult, ...rest: SchemaValidationResult[]): void {
  for (const r of rest) {
    into.errors.push(...r.errors);
    into.warnings.push(...r.warnings);
    if (r.info && r.info.length > 0) {
      if (!into.info) into.info = [];
      into.info.push(...r.info);
    }
  }
}

// ─── End S141 ────────────────────────────────────────────────────────────────

/**
 * Validate a hub page's JSON-LD schema (CollectionPage + FAQPage).
 */
export function validateHubSchema(htmlContent: string, hubSlug: string): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // S139: flatten @graph envelopes so CollectionPage / FAQPage members surface
  // for the per-type filter below. Note: @graph envelopes do NOT unwrap nested
  // entities like ListItem.item.offers — those are walked explicitly below by
  // the ListItem-offer scan (S139-fix Strategist 2026-05-20).
  const blocks = resolveSamePageReferences(flattenGraph(extractAllJsonLd(htmlContent)));
  if (blocks.length === 0) {
    return { slug: `hub:${hubSlug}`, errors: ['No JSON-LD script tag found'], warnings: [], info: [] };
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

    // S139-fix (Strategist 2026-05-20) — ListItem Offer-shape coupling.
    // Walk CollectionPage.mainEntity.itemListElement[].item.offers and apply
    // the canonical validateOfferShape rule. The "price OR priceSpecification
    // required" rule closes the drift class that produced 15 price-less
    // ListItem Offers in the 2026-05-20 deploy. S110 Coverage Manifest must
    // register this surface so future emitters cannot bypass.
    const items = collectionPage.mainEntity && Array.isArray(collectionPage.mainEntity.itemListElement)
      ? collectionPage.mainEntity.itemListElement
      : [];
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      const event = li && typeof li === 'object' ? li.item : undefined;
      const offers = event && typeof event === 'object' ? event.offers : undefined;
      if (offers && typeof offers === 'object') {
        const result = validateOfferShape(offers, `CollectionPage.itemListElement[${i}].item.`);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
        // Suppress per-ListItem offers.url INFO noise (we'd emit 30+ per page).
        // The aggregate signal is captured by the event-page validator already.
      }
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

  return { slug: `hub:${hubSlug}`, errors, warnings, info };
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

  // S132' validator-depth fix (parallel to validateSchemaCompleteness): scan
  // all JSON-LD blocks, locate the LocalBusiness one, validate it. Silent skip
  // remains for pages with no JSON-LD at all (existing behavior — venue page
  // without JSON-LD is not currently an error).
  // S139: flatten @graph envelopes so LocalBusiness members surface.
  const blocks = resolveSamePageReferences(flattenGraph(extractAllJsonLd(htmlContent)));
  if (blocks.length === 0) return { slug: `venue:${venueSlug}`, errors: [], warnings: [], info: [] };

  const localBusinessBlocks = blocks.filter(b => b['@type'] === 'LocalBusiness');
  if (localBusinessBlocks.length > 1) {
    errors.push(
      `multiple LocalBusiness JSON-LD blocks present (count: ${localBusinessBlocks.length}) — schema.org expects one LocalBusiness per venue page`,
    );
  }
  const schema = localBusinessBlocks[0] ?? blocks[0];

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

// ─── S144: locale-canonical + phase-keyed noindex guards ────────────────────

/**
 * Detect /en/ locale from a path or URL by anchoring on the `/en/` path-prefix
 * segment (NOT bare substring match — that would false-positive on slugs
 * containing `en` literally, e.g. a venue slug `en-route` or similar).
 *
 * Matches:
 *   /en/events/x/, /en/concerts/, /en/today, https://agentathens.com/en/about/
 *
 * Does NOT match:
 *   /events/athens-en-route/ (no /en/ path-prefix; `-en-` is dash-prefixed)
 *   /venues/something/ (no `/en/`)
 */
export function isEnLocalePath(urlOrPath: string): boolean {
  if (!urlOrPath) return false;
  return /(?:^|\/)en\//.test(urlOrPath);
}

/**
 * S144 Rule 1 — CROSS_LOCALE_CANONICAL (universal, all phases, both locales).
 *
 * Asserts that a page's `<link rel="canonical">` URL has the same locale prefix
 * as the page itself. Catches the regression where /en/ pages canonicalized to
 * bare-root (cross-locale violation that excluded /en/ from GSC eligibility),
 * AND the reverse (bare-root canonicalizing to /en/).
 *
 * Per GEO Strategist ruling 2026-05-21.
 */
export function checkCrossLocaleCanonical(htmlContent: string, pagePath: string): SchemaValidationResult {
  const errors: string[] = [];
  const canonicalMatch = htmlContent.match(/<link rel="canonical" href="([^"]+)"/);
  if (!canonicalMatch) return { slug: pagePath, errors, warnings: [], info: [] };
  const canonical = canonicalMatch[1];
  const pageIsEn = isEnLocalePath(pagePath);
  const canonicalIsEn = isEnLocalePath(canonical);
  if (pageIsEn !== canonicalIsEn) {
    errors.push(
      `CROSS_LOCALE_CANONICAL: page locale (${pageIsEn ? 'en' : 'el'}) does not match canonical (${canonicalIsEn ? 'en' : 'el'}) — page: ${pagePath}, canonical: ${canonical}`,
    );
  }
  return { slug: pagePath, errors, warnings: [], info: [] };
}

/**
 * S144 Rule 2 — NOINDEX_ON_INDEXABLE_PHASE (phase-keyed, Event-bearing pages).
 *
 * Reads the page's Event JSON-LD (startDate/endDate) and computes lifecycle
 * phase via the SAME `getLifecyclePhase` function the emitter uses (single
 * source of truth — no parallel phase classifier in the validator). If phase
 * is Active or Just-passed AND HTML emits noindex → FAIL.
 *
 * Cooling-phase noindex is lifecycle-correct (per GEO 45-Day Lifecycle ruling)
 * and skipped by this guard. Archive pages aren't generated at all.
 *
 * Per GEO Strategist ruling 2026-05-21.
 */
export function checkPhaseKeyedNoindex(htmlContent: string, pagePath: string): SchemaValidationResult {
  const errors: string[] = [];
  const empty: SchemaValidationResult = { slug: pagePath, errors, warnings: [], info: [] };
  const robotsMatch = htmlContent.match(/<meta name="robots" content="([^"]*)"/);
  if (!robotsMatch || !robotsMatch[1].includes('noindex')) return empty;

  // Extract Event entity from JSON-LD (may be inside @graph envelope).
  const jsonLdBlocks = extractAllJsonLd(htmlContent);
  const entities = flattenGraph(jsonLdBlocks);
  const eventEntity = entities.find(e => {
    const t = e?.['@type'];
    return typeof t === 'string' && VALID_SCHEMA_TYPES.has(t);
  });
  if (!eventEntity) return empty; // not an Event-bearing page

  const startDate = typeof eventEntity.startDate === 'string' ? eventEntity.startDate : '';
  const endDateRaw = eventEntity.endDate;
  const endDate = typeof endDateRaw === 'string' ? endDateRaw : undefined;
  const typeStr = typeof eventEntity['@type'] === 'string' ? eventEntity['@type'] : undefined;
  const eventType = typeStr === 'ExhibitionEvent' ? 'exhibition' : typeStr;

  if (!startDate) return empty;

  const phase = getLifecyclePhase({ startDate, endDate, type: eventType });
  if (phase === 'active' || phase === 'just-passed') {
    errors.push(
      `NOINDEX_ON_INDEXABLE_PHASE: page emits noindex but lifecycle phase is "${phase}" — must be index + self-canonical per GEO 45-Day Lifecycle ruling 2026-05-21 (page: ${pagePath})`,
    );
  }
  return { slug: pagePath, errors, warnings: [], info: [] };
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

  // S145 (GEO 2026-05-22): Event-detail microdata MUST emit itemprop="location".
  // GSC's Rich Results parser counts JSON-LD + microdata as separate items; an
  // event-detail page's microdata (article#main-content with Event itemtype)
  // missing location triggers "Missing field location" on Active + Just-passed
  // events. Rule scoped to article#main-content (the event-detail surface) so
  // hub-card microdata articles stay out of scope. Past events (EventCompleted)
  // are skipped — they're not rich-result-eligible anyway. Pre-extracted via a
  // separate regex (the main per-card loop below only sees the <article>'s
  // INNER HTML, which doesn't carry the id="main-content" attribute).
  const eventDetailArticleRegex = /<article\b([^>]*?id="main-content"[^>]*?itemtype="https:\/\/schema\.org\/[A-Za-z]*Event"[^>]*)>([\s\S]*?)<\/article>/g;
  for (const m of html.matchAll(eventDetailArticleRegex)) {
    const inner = m[2];
    if (/itemprop="eventStatus"\s+content="https:\/\/schema\.org\/EventCompleted"/.test(inner)) continue;
    // Require nested itemprop="location" AND a nested itemprop="address"
    // inside it. The location block must carry the rich-result-required set
    // (parity with JSON-LD inline-with-@id per S143).
    const hasLocationItemprop = /itemprop="location"\s+itemscope/.test(inner);
    const hasAddressItemprop = /itemprop="address"\s+itemscope/.test(inner);
    if (!hasLocationItemprop || !hasAddressItemprop) {
      errors.push(`EVENT_MICRODATA_MISSING_LOCATION: event-detail article#main-content must emit nested itemprop="location" with nested itemprop="address" (parity with JSON-LD inline-with-@id per GEO 2026-05-22)`);
    }
  }

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

  // S141 Pass 1 — fast regex-only scan of every dist/ HTML page to collect
  // canonical URLs. This is the cross-page-valid set used by
  // checkOrphanReferences to whitelist internal refs that dereference to
  // another emitted page. Done once per build; subsequent per-page validation
  // (Pass 2) reuses the set.
  const canonicalUrls = collectCanonicalUrls(distDir);
  const internalHost = new URL(BASE_URL).host;

  const slugDirs = readdirSync(eventsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const details: SchemaValidationResult[] = [];

  for (const slug of slugDirs) {
    const htmlPath = join(eventsDir, slug, 'index.html');
    if (!existsSync(htmlPath)) continue;

    const html = readFileSync(htmlPath, 'utf-8');
    const eventResult = validateSchemaCompleteness(html, slug, sameAsSeverity);
    mergeIntoResult(eventResult,
      checkOrphanReferences(html, slug, canonicalUrls, internalHost),
      checkMemberOrdering(html, slug, 'event', BASE_URL),
      checkCrossLocaleCanonical(html, `events/${slug}/`),
      checkPhaseKeyedNoindex(html, `events/${slug}/`),
    );
    // S145: extend event-detail surface with microdata coverage (was hub-only).
    // The EVENT_MICRODATA_MISSING_LOCATION rule fires on article#main-content
    // with Event itemtype missing nested location+address microdata.
    const microResult = validateMicrodata(html);
    eventResult.errors.push(...microResult.errors);
    eventResult.warnings.push(...microResult.warnings);
    details.push(eventResult);
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
      const enResult = validateSchemaCompleteness(html, `en/${slug}`, sameAsSeverity);
      mergeIntoResult(enResult,
        checkOrphanReferences(html, `en/${slug}`, canonicalUrls, internalHost),
        checkMemberOrdering(html, `en/${slug}`, 'event', BASE_URL),
        checkCrossLocaleCanonical(html, `en/events/${slug}/`),
        checkPhaseKeyedNoindex(html, `en/events/${slug}/`),
      );
      // S145: same event-detail microdata coverage on the /en/ surface.
      const enMicroResult = validateMicrodata(html);
      enResult.errors.push(...enMicroResult.errors);
      enResult.warnings.push(...enMicroResult.warnings);
      details.push(enResult);
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
    mergeIntoResult(hubResult,
      checkOrphanReferences(html, `hub:${slug}`, canonicalUrls, internalHost),
      checkMemberOrdering(html, `hub:${slug}`, 'hub', BASE_URL),
      checkCrossLocaleCanonical(html, `${slug}.html`),
    );
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
      mergeIntoResult(hubResult,
        checkOrphanReferences(html, `hub:en/${slug}`, canonicalUrls, internalHost),
        checkMemberOrdering(html, `hub:en/${slug}`, 'hub', BASE_URL),
        checkCrossLocaleCanonical(html, `en/${slug}/`),
      );
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
      const venueResult = validateVenueSchema(html, slug, expectedRegion, sameAsSeverity);
      mergeIntoResult(venueResult,
        checkOrphanReferences(html, `venue:${slug}`, canonicalUrls, internalHost),
        checkMemberOrdering(html, `venue:${slug}`, 'venue', BASE_URL),
        checkCrossLocaleCanonical(html, `venues/${slug}/`),
      );
      details.push(venueResult);
    }
  }

  // S141: Homepage scan (dist/index.html). No existing per-page validator —
  // homepage emission is currently a single envelope (WebSite → CollectionPage
  // → site Organization). The S141 ordering rule enforces that bookend.
  const homepagePath = join(distDir, 'index.html');
  if (existsSync(homepagePath)) {
    const html = readFileSync(homepagePath, 'utf-8');
    const homeResult: SchemaValidationResult = { slug: 'homepage', errors: [], warnings: [], info: [] };
    mergeIntoResult(homeResult,
      checkOrphanReferences(html, 'homepage', canonicalUrls, internalHost),
      checkMemberOrdering(html, 'homepage', 'homepage', BASE_URL),
    );
    details.push(homeResult);
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

  // venueSameAs ratchet status — surfaces ratchet population on every build.
  // Per Sprint 2 retrospective trigger gate (Strategist 2026-05-04 operational
  // form). Generic by design; future sprints' ratchets can add their own
  // surfacing alongside. Silent skip if build-completeness.json hasn't been
  // written yet (initial build) or the path has moved.
  try {
    const buildCompleteness = JSON.parse(
      readFileSync(join(import.meta.dir, '../../data/build-completeness.json'), 'utf-8')
    );
    const ratchet = buildCompleteness.place?.ratchet?.venueSameAs;
    if (ratchet?.populated >= 1) {
      console.log(`\n🎯 venueSameAs ratchet active: ${ratchet.populated}/${ratchet.total} populated (severity=${ratchet.currentSeverity})`);
    }
  } catch {
    // build-completeness.json not yet written, or path moved — silent skip
  }
}
