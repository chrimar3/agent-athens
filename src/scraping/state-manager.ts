import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import type { ScrapeState, SourceState } from './types';

const STATE_FILE = join(import.meta.dir, '../../data/scrape-state.json');
const STATE_BACKUP = join(import.meta.dir, '../../data/scrape-state.backup.json');

/**
 * Load scrape state from disk
 */
export function loadState(): ScrapeState {
  if (!existsSync(STATE_FILE)) {
    return {
      version: '1.0',
      last_updated: new Date().toISOString(),
      sources: {}
    };
  }

  try {
    const data = readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Failed to load state file, trying backup...');

    if (existsSync(STATE_BACKUP)) {
      try {
        const backupData = readFileSync(STATE_BACKUP, 'utf-8');
        return JSON.parse(backupData);
      } catch (backupError) {
        console.error('❌ Backup also corrupted, starting fresh');
      }
    }

    return {
      version: '1.0',
      last_updated: new Date().toISOString(),
      sources: {}
    };
  }
}

/**
 * Save scrape state to disk (atomic write)
 */
export function saveState(state: ScrapeState): void {
  state.last_updated = new Date().toISOString();

  // Backup existing state
  if (existsSync(STATE_FILE)) {
    const existingData = readFileSync(STATE_FILE, 'utf-8');
    writeFileSync(STATE_BACKUP, existingData, 'utf-8');
  }

  // Write to temp file first (atomic operation)
  const tempFile = `${STATE_FILE}.tmp`;
  writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');

  // Rename temp to actual (atomic on most filesystems)
  renameSync(tempFile, STATE_FILE);
}

/**
 * Get state for a specific source (creates if doesn't exist)
 */
export function getSourceState(state: ScrapeState, sourceId: string): SourceState {
  if (!state.sources[sourceId]) {
    state.sources[sourceId] = {
      last_scraped: null,
      last_success: null,
      last_failure: null,
      scrape_count: 0,
      failure_count: 0,
      events_imported: 0
    };
  }
  return state.sources[sourceId];
}

/**
 * Update source state after scrape attempt
 */
export function updateSourceState(
  state: ScrapeState,
  sourceId: string,
  success: boolean,
  eventsImported: number = 0,
  error?: string
): void {
  const sourceState = getSourceState(state, sourceId);
  const now = new Date().toISOString();

  sourceState.last_scraped = now;
  sourceState.scrape_count++;

  if (success) {
    sourceState.last_success = now;
    sourceState.events_imported += eventsImported;
    delete sourceState.last_error;
  } else {
    sourceState.last_failure = now;
    sourceState.failure_count++;
    if (error) {
      sourceState.last_error = error;
    }
  }
}

/**
 * Check if source should be scraped based on frequency and last_scraped
 */
export function shouldScrape(
  frequency: 'daily' | 'weekly' | 'monthly',
  lastScraped: string | null,
  force: boolean = false
): boolean {
  if (force) return true;
  if (!lastScraped) return true;

  const now = Date.now();
  const last = new Date(lastScraped).getTime();
  const hoursSinceLast = (now - last) / (1000 * 60 * 60);

  if (frequency === 'daily') return hoursSinceLast >= 24;
  if (frequency === 'weekly') return hoursSinceLast >= 168;
  if (frequency === 'monthly') return hoursSinceLast >= 720;

  return true;
}
