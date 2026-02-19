/**
 * Utilities for processing enriched event descriptions.
 *
 * Separates the narrative content (visible to users) from the
 * Info/practical metadata table (hidden but kept for SEO/crawlers).
 */

export interface StrippedDescription {
  /** Narrative text with the Info table removed */
  narrative: string;
  /** The Info table rendered as hidden HTML for crawlers, or empty string */
  metadataHtml: string;
}

/**
 * Detect and extract the "Info" metadata table from an enriched description.
 *
 * The Info table follows a consistent pattern across all 160+ enriched events:
 *   | Info | Details |
 *   |------|---------|
 *   | **Date** | Saturday, February 28, 2026 |
 *   | **Venue** | Temple Athens, Iakhou 17 |
 *   ...
 *
 * The Aspect/Setting/Vibe/Sound/Door table is narrative and stays visible.
 * Only the Info table (with dates, prices, addresses, metro) gets hidden.
 */
export function stripInfoTable(description: string): StrippedDescription {
  if (!description) {
    return { narrative: '', metadataHtml: '' };
  }

  // Match the Info table block:
  // Starts with "| Info |" header line, followed by separator, followed by data rows
  // Ends when we hit a non-table line (no leading pipe) or end of string
  const infoTableRegex = /\n?\| Info \|[^\n]*\n\|[-| ]+\n(?:\|[^\n]+\n?)*/gi;

  const match = description.match(infoTableRegex);

  if (!match) {
    return { narrative: description, metadataHtml: '' };
  }

  // Remove the Info table from the visible narrative
  const narrative = description.replace(infoTableRegex, '').replace(/\n{3,}/g, '\n\n').trim();

  // Wrap the extracted table in a hidden div for SEO/AI crawlers
  const tableContent = match[0].trim();
  const metadataHtml = `<div class="sr-only" aria-hidden="true" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">${tableContent}</div>`;

  return { narrative, metadataHtml };
}
