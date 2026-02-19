/**
 * Pipeline State Management
 *
 * Tracks the state of daily pipeline execution.
 * Persists to JSON file for resilience across restarts.
 *
 * @see specs/001-data-pipeline/tasks.md (Task 6.2)
 * @see src/orchestration/__tests__/pipeline-state.test.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

// ============================================================================
// Types
// ============================================================================

export type PhaseName = 'ingest' | 'parse' | 'quality' | 'enrich' | 'generate' | 'deploy';
export type PhaseStatusValue = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface PhaseStatus {
  status: PhaseStatusValue;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  // Phase-specific counts
  eventsIngested?: number;
  eventsParsed?: number;
  eventsRejected?: number;
  eventsVerified?: number;
  eventsUnverified?: number;
  eventsEnriched?: number;
  pagesGenerated?: number;
}

export interface PipelineState {
  date: string; // YYYY-MM-DD
  phases: Partial<Record<PhaseName, PhaseStatus>>;
  lastUpdated: string;
}

export interface PhaseMetrics {
  eventsIngested?: number;
  eventsParsed?: number;
  eventsRejected?: number;
  eventsVerified?: number;
  eventsUnverified?: number;
  eventsEnriched?: number;
  pagesGenerated?: number;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_STATE_FILE = 'data/state/pipeline-state.json';

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get current pipeline state
 *
 * Creates new state file if it doesn't exist.
 * Returns default state if file is corrupted.
 *
 * @param stateFile - Path to state file (default: data/state/pipeline-state.json)
 * @returns Current pipeline state
 */
export function getPipelineState(stateFile: string = DEFAULT_STATE_FILE): PipelineState {
  // Ensure directory exists
  const dir = dirname(stateFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Try to load existing state
  if (existsSync(stateFile)) {
    try {
      const content = readFileSync(stateFile, 'utf-8');
      const state = JSON.parse(content) as Partial<PipelineState>;

      // Validate and normalize
      return normalizeState(state);
    } catch {
      // Corrupted file, create new state
      console.warn(`Pipeline state file corrupted, creating new: ${stateFile}`);
    }
  }

  // Create new state
  const newState = createDefaultState();
  saveState(stateFile, newState);
  return newState;
}

/**
 * Update phase status
 *
 * @param stateFile - Path to state file
 * @param phase - Phase name
 * @param status - New status
 * @param metrics - Optional metrics to include
 */
export function updatePhaseStatus(
  stateFile: string,
  phase: PhaseName,
  status: PhaseStatusValue,
  metrics: PhaseMetrics = {}
): void {
  const state = getPipelineState(stateFile);
  const now = new Date().toISOString();

  // Get or create phase status
  const phaseStatus: PhaseStatus = state.phases[phase] || { status: 'pending' };

  // Update status
  phaseStatus.status = status;

  // Add timestamps
  if (status === 'running' && !phaseStatus.startedAt) {
    phaseStatus.startedAt = now;
  }
  if (status === 'completed' || status === 'failed') {
    phaseStatus.completedAt = now;
  }

  // Merge metrics
  Object.assign(phaseStatus, metrics);

  // Save
  state.phases[phase] = phaseStatus;
  state.lastUpdated = now;
  saveState(stateFile, state);
}

/**
 * Record phase completion with metrics
 *
 * Convenience function that sets status to 'completed' and records metrics.
 *
 * @param stateFile - Path to state file
 * @param phase - Phase name
 * @param metrics - Metrics to record
 */
export function recordPhaseCompletion(
  stateFile: string,
  phase: PhaseName,
  metrics: PhaseMetrics = {}
): void {
  updatePhaseStatus(stateFile, phase, 'completed', metrics);
}

/**
 * Check if state should be reset for new day
 *
 * @param stateFile - Path to state file
 * @returns true if state is from previous day
 */
export function shouldResetForNewDay(stateFile: string): boolean {
  if (!existsSync(stateFile)) {
    return false;
  }

  try {
    const content = readFileSync(stateFile, 'utf-8');
    const state = JSON.parse(content) as Partial<PipelineState>;
    const today = getTodayDate();

    return state.date !== today;
  } catch {
    return true; // Reset if corrupted
  }
}

/**
 * Reset pipeline state for new day
 *
 * @param stateFile - Path to state file
 */
export function resetPipelineState(stateFile: string): void {
  const newState = createDefaultState();
  saveState(stateFile, newState);
}

/**
 * Get summary of pipeline execution
 *
 * @param stateFile - Path to state file
 * @returns Summary object
 */
export function getPipelineSummary(stateFile: string = DEFAULT_STATE_FILE): {
  date: string;
  completedPhases: string[];
  pendingPhases: string[];
  failedPhases: string[];
  totalEventsIngested: number;
  totalEventsVerified: number;
  totalEventsRejected: number;
} {
  const state = getPipelineState(stateFile);

  const allPhases: PhaseName[] = ['ingest', 'parse', 'quality', 'enrich', 'generate', 'deploy'];

  const completedPhases = allPhases.filter(p => state.phases[p]?.status === 'completed');
  const pendingPhases = allPhases.filter(p => !state.phases[p] || state.phases[p]?.status === 'pending');
  const failedPhases = allPhases.filter(p => state.phases[p]?.status === 'failed');

  return {
    date: state.date,
    completedPhases,
    pendingPhases,
    failedPhases,
    totalEventsIngested: state.phases.ingest?.eventsIngested || 0,
    totalEventsVerified: state.phases.quality?.eventsVerified || 0,
    totalEventsRejected: state.phases.quality?.eventsRejected || 0,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format (Europe/Athens timezone)
 */
function getTodayDate(): string {
  const now = new Date();
  // Use Athens timezone
  const athensDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
  return athensDate.toISOString().split('T')[0];
}

/**
 * Create default state for new day
 */
function createDefaultState(): PipelineState {
  return {
    date: getTodayDate(),
    phases: {},
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Normalize state object (fill in missing fields)
 */
function normalizeState(state: Partial<PipelineState>): PipelineState {
  return {
    date: state.date || getTodayDate(),
    phases: state.phases || {},
    lastUpdated: state.lastUpdated || new Date().toISOString(),
  };
}

/**
 * Save state to file
 */
function saveState(stateFile: string, state: PipelineState): void {
  const dir = dirname(stateFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}
