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
}

/**
 * Mandatory fields — Google penalizes partial JSON-LD.
 * Dot notation for nested paths (e.g. 'location.name').
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
  'isAccessibleForFree',
  'offers',
  'inLanguage',
];

/**
 * Recommended fields — informational only, not blocking.
 */
const RECOMMENDED_FIELDS = [
  'image',
  'endDate',
  'location.geo',
  'offers.url',
  'performer',
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
  const result: SchemaValidationResult = { url, missing: [], warnings: [] };

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

  for (const field of RECOMMENDED_FIELDS) {
    const value = getNestedValue(schema, field);
    if (value === undefined || value === null || value === '') {
      result.warnings.push(field);
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
