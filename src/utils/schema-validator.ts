/**
 * Schema.org JSON-LD Validator
 *
 * Build-time checker that validates event page JSON-LD against
 * mandatory and recommended field lists. Runs during generate-site.ts
 * to catch schema regressions before deploy.
 */

export interface SchemaValidationResult {
  url: string;
  missing: string[];
  warnings: string[];
  info: string[];
}

/**
 * Mandatory fields — Google penalizes partial JSON-LD.
 * Dot notation for nested paths (e.g. 'location.name').
 *
 * Note: `offers` is checked conditionally below — required for non-completed
 * events only. Per Strategist 2026-04-29, EventCompleted events legitimately
 * have no Offer (the event is over; nothing to sell).
 */
const MANDATORY_FIELDS = [
  '@context',
  '@type',
  'name',
  'description',
  'startDate',
  'eventStatus',
  'eventAttendanceMode',
  'url',
  'location',
  'location.@type',
  'location.name',
  'location.address',
  'location.address.streetAddress', // 2.2: address completeness, not just presence
  'isAccessibleForFree',
  'inLanguage',
];

/**
 * Recommended fields — surface as warnings if missing, but not blocking.
 */
const RECOMMENDED_FIELDS = [
  'image',
  // 'endDate' is NOT a generic recommended field — it is type-conditional.
  // Single-occurrence events are genuinely one day, so a missing endDate is not
  // a defect. Only multi-day types (exhibition, festival) warrant a WARN when
  // endDate is absent — handled explicitly below (1.3b).
  'location.geo',
  'performer',
];

// 1.3b: schema @types that represent genuinely multi-day events. A missing
// endDate on these means the span was lost → visible WARN for backfill.
const MULTI_DAY_SCHEMA_TYPES = new Set(['ExhibitionEvent', 'Festival']);

/**
 * INFO-level fields — surfaced for awareness but not blocking and not warning.
 * Per Strategist 2026-04-29, `offers.url` is an INFO signal: omitted when the
 * ticket source is a listing aggregator or venue-direct-only host (the venue,
 * not the host, is the seller in those cases).
 */
const INFO_FIELDS = [
  'offers.url',
];

/**
 * Resolve a dot-path on an object.
 * e.g. getNestedValue(obj, 'location.name') → obj.location.name
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Validate a JSON-LD string against mandatory and recommended field lists.
 * Returns missing mandatory fields and warnings for missing recommended fields.
 * Gracefully handles invalid JSON.
 */
export function validateEventSchema(jsonLd: string, url: string): SchemaValidationResult {
  const result: SchemaValidationResult = { url, missing: [], warnings: [], info: [] };

  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(jsonLd);
  } catch {
    result.missing.push('INVALID_JSON');
    return result;
  }

  if (typeof schema !== 'object' || schema === null) {
    result.missing.push('INVALID_JSON');
    return result;
  }

  for (const field of MANDATORY_FIELDS) {
    const value = getNestedValue(schema, field);
    if (value === undefined || value === null || value === '') {
      result.missing.push(field);
    }
  }

  // Conditional offers check: required UNLESS event is completed.
  const isCompleted = schema.eventStatus === 'https://schema.org/EventCompleted';
  const offersValue = schema.offers;
  if (!isCompleted && (offersValue === undefined || offersValue === null || offersValue === '')) {
    result.missing.push('offers');
  }

  // Offers structural checks (only when offers is present).
  if (offersValue && typeof offersValue === 'object') {
    const offers = offersValue as Record<string, unknown>;
    const seller = offers.seller;
    const sellerType = seller && typeof seller === 'object'
      ? (seller as Record<string, unknown>)['@type']
      : undefined;
    const sellerTypeOk =
      sellerType === 'Organization' ||
      (Array.isArray(sellerType) && sellerType.includes('Organization'));
    const sellerIsValid =
      seller !== null &&
      typeof seller === 'object' &&
      sellerTypeOk &&
      typeof (seller as Record<string, unknown>).name === 'string' &&
      ((seller as Record<string, unknown>).name as string).trim().length > 0;
    if (!sellerIsValid) {
      result.missing.push('offers.seller');
    }
  }

  for (const field of RECOMMENDED_FIELDS) {
    const value = getNestedValue(schema, field);
    if (value === undefined || value === null || value === '') {
      result.warnings.push(field);
    }
  }

  // 1.3b: type-conditional endDate WARN. Multi-day event types missing an
  // endDate lost their span; single-occurrence types stay silent.
  if (MULTI_DAY_SCHEMA_TYPES.has(schema['@type'] as string)) {
    const endDate = getNestedValue(schema, 'endDate');
    if (endDate === undefined || endDate === null || endDate === '') {
      result.warnings.push('endDate');
    }
  }

  for (const field of INFO_FIELDS) {
    const value = getNestedValue(schema, field);
    if (value === undefined || value === null || value === '') {
      result.info.push(field);
    }
  }

  return result;
}

/**
 * Log a human-readable summary of validation results.
 */
export function logValidationSummary(results: SchemaValidationResult[]): void {
  const totalPages = results.length;
  const pagesWithMandatoryGaps = results.filter(r => r.missing.length > 0);
  const pagesWithWarnings = results.filter(r => r.warnings.length > 0);

  // Aggregate missing recommended fields
  const warningCounts = new Map<string, number>();
  for (const r of results) {
    for (const w of r.warnings) {
      warningCounts.set(w, (warningCounts.get(w) || 0) + 1);
    }
  }

  console.log(`  ✓ Schema validation: ${totalPages} pages checked, ${pagesWithMandatoryGaps.length} mandatory gaps, ${pagesWithWarnings.length} missing recommended fields`);

  if (pagesWithMandatoryGaps.length > 0) {
    // Aggregate mandatory gaps
    const mandatoryCounts = new Map<string, number>();
    for (const r of pagesWithMandatoryGaps) {
      for (const m of r.missing) {
        mandatoryCounts.set(m, (mandatoryCounts.get(m) || 0) + 1);
      }
    }
    for (const [field, count] of mandatoryCounts) {
      console.log(`    ⚠️ ${count} pages missing ${field} (mandatory)`);
    }
  }

  for (const [field, count] of warningCounts) {
    const note = field === 'performer' ? ' (known gap — structured artist data pending)' : '';
    console.log(`    → ${count} pages missing ${field} (recommended)${note}`);
  }
}
