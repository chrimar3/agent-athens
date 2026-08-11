/** Source quarantine registry (Phase 2A, spec §5.1 SOURCE_DEAD responder).
 *
 *  A quarantined source is skipped by scrape-all (no scrape, no scrape_stats
 *  row — a fake success row would poison deadSourcesSignal history) and
 *  excluded from deadman SOURCE_DEAD alerts (ends repeat alert spam; the
 *  weekly digest lists quarantined sources instead). Written by the
 *  QUARANTINE_SOURCE responder action or by hand; un-quarantining is a
 *  human decision surfaced in the decisions queue.
 *
 *  Fail-safe by design: a missing or malformed registry means NOTHING is
 *  quarantined — a broken config file must never silently stop scraping.
 */
import { readFileSync } from 'fs';

export interface QuarantineRegistry {
  sources: Record<string, { since: string; reason: string }>;
}

export function loadQuarantine(path: string): QuarantineRegistry {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as QuarantineRegistry;
    if (parsed && typeof parsed === 'object' && parsed.sources && typeof parsed.sources === 'object') {
      return parsed;
    }
    return { sources: {} };
  } catch {
    return { sources: {} };
  }
}

export function filterQuarantined<T extends string>(ids: T[], q: QuarantineRegistry): T[] {
  return ids.filter((id) => !(id in q.sources));
}
