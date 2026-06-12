/**
 * Run-end token parser (S-F2a).
 *
 * Extracts a run end-date from description prose of the form
 * "<token> YYYY-MM-DD" (e.g. the 11.6k machine-generated rows the athinorama
 * scraper wrote before the capture fix). Tokens are per-city DATA loaded from
 * config/parsing-tokens.json — never hardcoded here (GEO ruling G5).
 *
 * Consumers: scripts/migrate-eos-end-date.ts (backfill) and any future
 * capture-side parsing. Pure function aside from the module-load config read.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const tokensConfig = JSON.parse(
  readFileSync(join(import.meta.dir, '../../config/parsing-tokens.json'), 'utf-8')
);
const RUN_END_TOKENS: string[] = tokensConfig.runEndTokens?.el ?? [];

const MIN_RESIDUE_CHARS = 10;

export interface RunEndParse {
  /** Date-only YYYY-MM-DD, validated as a real calendar date. */
  endDate: string;
  /** Description with the token+date segment removed; null when the residue
   *  is under MIN_RESIDUE_CHARS non-whitespace chars (G5: omit, never ""). */
  cleanedDescription: string | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Reject impossible calendar dates (e.g. 2026-02-31) via UTC round-trip. */
function isValidIsoDate(dateStr: string): boolean {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

/**
 * Parse a run-end token out of a description.
 * Returns null (no-op) when: no token, date not ISO YYYY-MM-DD, date invalid,
 * or (when startDate is provided) end < start by date-only comparison.
 */
export function parseRunEndDate(
  description: string | null | undefined,
  startDate?: string | null
): RunEndParse | null {
  if (!description || RUN_END_TOKENS.length === 0) return null;

  const tokenAlt = RUN_END_TOKENS.map(escapeRegExp).join('|');
  // Token must start at the beginning or after whitespace (not inside a word);
  // date must be the full ISO date-only form, ending at a word boundary.
  const re = new RegExp(`(^|\\s)(?:${tokenAlt})\\s+(\\d{4}-\\d{2}-\\d{2})(?!\\d)`, 'u');
  const match = re.exec(description);
  if (!match) return null;

  const endDate = match[2];
  if (!isValidIsoDate(endDate)) return null;

  if (startDate) {
    const startDateOnly = startDate.slice(0, 10);
    if (endDate < startDateOnly) return null;
  }

  // Remove the matched segment, preserving the leading separator's gap.
  const cleaned =
    description.slice(0, match.index) + match[1] + description.slice(match.index + match[0].length);
  const normalized = cleaned.replace(/\s{2,}/g, ' ').trim();

  const nonWhitespace = normalized.replace(/\s/g, '');
  // Punctuation-only residue (e.g. "...") also collapses to null.
  const hasSubstance = nonWhitespace.length >= MIN_RESIDUE_CHARS && /[\p{L}\p{N}]/u.test(nonWhitespace);

  return {
    endDate,
    cleanedDescription: hasSubstance ? normalized : null,
  };
}
