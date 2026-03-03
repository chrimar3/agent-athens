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

// Valid @type values from our canonical type map
const VALID_SCHEMA_TYPES = new Set(Object.values(SCHEMA_TYPE_MAP));

const PLACEHOLDER_VALUES = ['tba', 'unknown', 'n/a', 'tbd', 'none'];

export interface SchemaValidationResult {
  slug: string;
  errors: string[];
  warnings: string[];
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
 */
export function validateSchemaCompleteness(htmlContent: string, eventSlug: string): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract JSON-LD
  const match = htmlContent.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) {
    return { slug: eventSlug, errors: ['No JSON-LD script tag found'], warnings: [] };
  }

  let schema: Record<string, any>;
  try {
    schema = JSON.parse(match[1]);
  } catch {
    return { slug: eventSlug, errors: ['Failed to parse JSON-LD'], warnings: [] };
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
  } else if (!/[+-]\d{2}:\d{2}$|Z$/.test(schema.startDate)) {
    errors.push('startDate missing timezone offset');
  }

  // Location checks
  const location = schema.location;
  if (!location || !isNonEmpty(location.name)) {
    errors.push('location.name is missing or empty');
  }

  if (!schema.offers) {
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

  // Price format: must be numeric, not contain currency symbols
  if (schema.offers && isNonEmpty(schema.offers.price)) {
    const price = schema.offers.price;
    if (/[€$£¥]/.test(price) || (price !== '' && isNaN(Number(price)))) {
      errors.push(`offers.price must be numeric, got "${price}"`);
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

  if (!isNonEmpty(schema.doorTime)) {
    warnings.push('doorTime is missing');
  }

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

  return { slug: eventSlug, errors, warnings };
}

/**
 * Validate all generated event pages in a dist directory.
 */
export function validateAllPages(distDir: string): SchemaValidationSummary {
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
    details.push(validateSchemaCompleteness(html, slug));
  }

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
    console.log('\n📋 Schema validation: no event pages found');
    return;
  }

  const passRate = Math.round((passCount / total) * 100);
  console.log(`\n📋 Schema completeness: ${passCount}/${total} events fully valid (${passRate}%)`);
  console.log(`   ✅ ${passCount} pass  ⚠️  ${warnCount} warnings  ❌ ${failCount} errors`);

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
}
