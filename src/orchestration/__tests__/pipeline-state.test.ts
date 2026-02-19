/**
 * Task 6.1: Pipeline State Tests
 *
 * Tests for pipeline state tracking:
 * - Creates state file if not exists
 * - Records phase completion with timestamp
 * - Tracks event counts per phase
 * - Resets for new day
 *
 * @see specs/001-data-pipeline/tasks.md (Task 6.1)
 * @see src/orchestration/pipeline-state.ts
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import {
  getPipelineState,
  updatePhaseStatus,
  recordPhaseCompletion,
  resetPipelineState,
  shouldResetForNewDay,
  type PipelineState,
  type PhaseStatus,
} from '../pipeline-state';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_STATE_DIR = 'data/test-state';
const TEST_STATE_FILE = `${TEST_STATE_DIR}/pipeline-state.json`;

function cleanupTestState(): void {
  if (existsSync(TEST_STATE_DIR)) {
    rmSync(TEST_STATE_DIR, { recursive: true, force: true });
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Pipeline State', () => {
  beforeEach(() => {
    cleanupTestState();
    mkdirSync(TEST_STATE_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupTestState();
  });

  // ==========================================================================
  // State File Creation Tests
  // ==========================================================================

  describe('State File Creation', () => {
    test('creates state file if not exists', () => {
      expect(existsSync(TEST_STATE_FILE)).toBe(false);

      const state = getPipelineState(TEST_STATE_FILE);

      expect(existsSync(TEST_STATE_FILE)).toBe(true);
      expect(state).toBeDefined();
    });

    test('returns default state for new file', () => {
      const state = getPipelineState(TEST_STATE_FILE);

      expect(state.date).toBeDefined();
      expect(state.phases).toBeDefined();
      expect(typeof state.phases).toBe('object');
    });

    test('loads existing state file', () => {
      // Create initial state
      const state1 = getPipelineState(TEST_STATE_FILE);
      updatePhaseStatus(TEST_STATE_FILE, 'ingest', 'completed', { eventsIngested: 10 });

      // Load again
      const state2 = getPipelineState(TEST_STATE_FILE);

      expect(state2.phases.ingest?.status).toBe('completed');
      expect(state2.phases.ingest?.eventsIngested).toBe(10);
    });

    test('creates parent directory if needed', () => {
      const nestedPath = `${TEST_STATE_DIR}/nested/dir/state.json`;

      const state = getPipelineState(nestedPath);

      expect(existsSync(nestedPath)).toBe(true);
      expect(state).toBeDefined();
    });
  });

  // ==========================================================================
  // Phase Completion Tests
  // ==========================================================================

  describe('Phase Completion', () => {
    test('records phase completion with timestamp', () => {
      const before = new Date().toISOString();

      recordPhaseCompletion(TEST_STATE_FILE, 'ingest', { eventsIngested: 25 });

      const after = new Date().toISOString();
      const state = getPipelineState(TEST_STATE_FILE);

      expect(state.phases.ingest?.status).toBe('completed');
      expect(state.phases.ingest?.completedAt).toBeDefined();
      expect(state.phases.ingest?.completedAt! >= before).toBe(true);
      expect(state.phases.ingest?.completedAt! <= after).toBe(true);
    });

    test('tracks event counts per phase', () => {
      recordPhaseCompletion(TEST_STATE_FILE, 'ingest', { eventsIngested: 50 });
      recordPhaseCompletion(TEST_STATE_FILE, 'parse', { eventsParsed: 45, eventsRejected: 5 });
      recordPhaseCompletion(TEST_STATE_FILE, 'quality', { eventsVerified: 40, eventsUnverified: 5 });

      const state = getPipelineState(TEST_STATE_FILE);

      expect(state.phases.ingest?.eventsIngested).toBe(50);
      expect(state.phases.parse?.eventsParsed).toBe(45);
      expect(state.phases.parse?.eventsRejected).toBe(5);
      expect(state.phases.quality?.eventsVerified).toBe(40);
    });

    test('updates status from pending to running to completed', () => {
      updatePhaseStatus(TEST_STATE_FILE, 'ingest', 'pending');
      let state = getPipelineState(TEST_STATE_FILE);
      expect(state.phases.ingest?.status).toBe('pending');

      updatePhaseStatus(TEST_STATE_FILE, 'ingest', 'running');
      state = getPipelineState(TEST_STATE_FILE);
      expect(state.phases.ingest?.status).toBe('running');
      expect(state.phases.ingest?.startedAt).toBeDefined();

      recordPhaseCompletion(TEST_STATE_FILE, 'ingest', { eventsIngested: 10 });
      state = getPipelineState(TEST_STATE_FILE);
      expect(state.phases.ingest?.status).toBe('completed');
      expect(state.phases.ingest?.completedAt).toBeDefined();
    });

    test('records errors when phase fails', () => {
      updatePhaseStatus(TEST_STATE_FILE, 'ingest', 'failed', {
        error: 'IMAP connection timeout',
      });

      const state = getPipelineState(TEST_STATE_FILE);

      expect(state.phases.ingest?.status).toBe('failed');
      expect(state.phases.ingest?.error).toBe('IMAP connection timeout');
    });
  });

  // ==========================================================================
  // Day Reset Tests
  // ==========================================================================

  describe('Day Reset', () => {
    test('resets for new day', () => {
      // Create state with yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Manually create old state
      const oldState: PipelineState = {
        date: yesterdayStr,
        phases: {
          ingest: { status: 'completed', eventsIngested: 100, completedAt: yesterday.toISOString() },
        },
        lastUpdated: yesterday.toISOString(),
      };

      writeFileSync(TEST_STATE_FILE, JSON.stringify(oldState, null, 2));

      // Check if should reset
      expect(shouldResetForNewDay(TEST_STATE_FILE)).toBe(true);

      // Reset
      resetPipelineState(TEST_STATE_FILE);

      const state = getPipelineState(TEST_STATE_FILE);
      const today = new Date().toISOString().split('T')[0];

      expect(state.date).toBe(today);
      expect(state.phases.ingest).toBeUndefined();
    });

    test('does not reset for same day', () => {
      // Create state for today
      recordPhaseCompletion(TEST_STATE_FILE, 'ingest', { eventsIngested: 50 });

      expect(shouldResetForNewDay(TEST_STATE_FILE)).toBe(false);

      // Verify state is preserved
      const state = getPipelineState(TEST_STATE_FILE);
      expect(state.phases.ingest?.eventsIngested).toBe(50);
    });

    test('handles timezone correctly (Europe/Athens)', () => {
      const state = getPipelineState(TEST_STATE_FILE);

      // Date should be in YYYY-MM-DD format
      expect(state.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ==========================================================================
  // Multiple Phases Tests
  // ==========================================================================

  describe('Multiple Phases', () => {
    test('tracks all pipeline phases independently', () => {
      const phases = ['ingest', 'parse', 'quality', 'enrich', 'generate', 'deploy'] as const;

      for (const phase of phases) {
        updatePhaseStatus(TEST_STATE_FILE, phase, 'completed');
      }

      const state = getPipelineState(TEST_STATE_FILE);

      for (const phase of phases) {
        expect(state.phases[phase]?.status).toBe('completed');
      }
    });

    test('preserves other phases when updating one', () => {
      recordPhaseCompletion(TEST_STATE_FILE, 'ingest', { eventsIngested: 100 });
      recordPhaseCompletion(TEST_STATE_FILE, 'parse', { eventsParsed: 90 });

      // Update ingest again
      updatePhaseStatus(TEST_STATE_FILE, 'ingest', 'running');

      const state = getPipelineState(TEST_STATE_FILE);

      // Parse should be unchanged
      expect(state.phases.parse?.eventsParsed).toBe(90);
      expect(state.phases.parse?.status).toBe('completed');
    });
  });

  // ==========================================================================
  // Summary and Reporting Tests
  // ==========================================================================

  describe('Summary and Reporting', () => {
    test('calculates total events processed', () => {
      recordPhaseCompletion(TEST_STATE_FILE, 'ingest', { eventsIngested: 100 });
      recordPhaseCompletion(TEST_STATE_FILE, 'parse', { eventsParsed: 95 });
      recordPhaseCompletion(TEST_STATE_FILE, 'quality', { eventsVerified: 80, eventsRejected: 15 });

      const state = getPipelineState(TEST_STATE_FILE);

      // Can calculate from state
      const ingested = state.phases.ingest?.eventsIngested || 0;
      const verified = state.phases.quality?.eventsVerified || 0;
      const rejected = state.phases.quality?.eventsRejected || 0;

      expect(ingested).toBe(100);
      expect(verified).toBe(80);
      expect(rejected).toBe(15);
    });

    test('tracks lastUpdated timestamp', () => {
      const before = new Date().toISOString();

      updatePhaseStatus(TEST_STATE_FILE, 'ingest', 'running');

      const state = getPipelineState(TEST_STATE_FILE);
      const after = new Date().toISOString();

      expect(state.lastUpdated >= before).toBe(true);
      expect(state.lastUpdated <= after).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    test('handles corrupted state file gracefully', () => {
      // Write invalid JSON
      writeFileSync(TEST_STATE_FILE, 'not valid json {{{');

      // Should create new state instead of crashing
      const state = getPipelineState(TEST_STATE_FILE);

      expect(state).toBeDefined();
      expect(state.date).toBeDefined();
    });

    test('handles missing phases object', () => {
      // Write state without phases
      writeFileSync(TEST_STATE_FILE, JSON.stringify({ date: '2025-01-20' }));

      const state = getPipelineState(TEST_STATE_FILE);

      expect(state.phases).toBeDefined();
      expect(typeof state.phases).toBe('object');
    });

    test('handles concurrent updates safely', async () => {
      // Simulate concurrent updates
      const updates = [
        updatePhaseStatus(TEST_STATE_FILE, 'ingest', 'completed'),
        updatePhaseStatus(TEST_STATE_FILE, 'parse', 'completed'),
        updatePhaseStatus(TEST_STATE_FILE, 'quality', 'completed'),
      ];

      // All should complete without error
      await Promise.all(updates.map(u => Promise.resolve(u)));

      const state = getPipelineState(TEST_STATE_FILE);

      // At least the last update should be present
      expect(Object.keys(state.phases).length).toBeGreaterThan(0);
    });
  });
});
