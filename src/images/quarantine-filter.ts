/**
 * Keep quarantined sources out of the image-download queue.
 *
 * config/quarantined-sources.json is keyed by SCRAPER id ("clubber"), but
 * event rows store the source they were written with ("clubber.gr"). On
 * 2026-09-23 the unfiltered queue sent 106 of 118 downloads to quarantined
 * clubber.gr, whose image URLs answer an HTML captcha wall.
 *
 * The registry is read through the shared fail-safe loader: a missing or
 * malformed file quarantines nothing.
 */
import { join } from 'path';
import { loadQuarantine, type QuarantineRegistry } from '../utils/quarantine';

export const QUARANTINE_PATH = join(import.meta.dir, '../../config/quarantined-sources.json');

/** Stored row sources whose scraper id is not the source with its domain suffix removed. */
const ROW_SOURCE_SCRAPER_ID: Record<string, string> = {
  residentadvisor: 'ra',
};

function scraperIdFor(rowSource: string): string {
  const s = rowSource.trim().toLowerCase();
  return ROW_SOURCE_SCRAPER_ID[s] ?? s.replace(/\.(gr|com|org|net|live|co|ai)$/, '');
}

export function isQuarantinedRowSource(rowSource: string, registry: QuarantineRegistry): boolean {
  const s = rowSource.trim().toLowerCase();
  return s in registry.sources || scraperIdFor(s) in registry.sources;
}

export function excludeQuarantinedRows<T extends { source: string }>(
  rows: T[],
  registry: QuarantineRegistry = loadQuarantine(QUARANTINE_PATH),
): T[] {
  return rows.filter(r => !isQuarantinedRowSource(r.source, registry));
}
