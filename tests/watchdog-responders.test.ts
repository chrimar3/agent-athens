import { describe, test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { planResponse, executeActions, type ResponderState } from '../src/watchdog/responders';
import type { DeadmanResult } from '../src/watchdog/classifier';

const HOUR = 3_600_000;
const now = 1_700_000_000_000;
const fresh: ResponderState = { lastActionMs: {} };
const result = (status: string, reasons: string[] = []): DeadmanResult =>
  ({ status, reasons }) as DeadmanResult;

describe('planResponse', () => {
  test('STALE_DEPLOY plans a redeploy', () => {
    const a = planResponse(result('STALE_DEPLOY'), fresh, now);
    expect(a.map((x) => x.kind)).toContain('REDEPLOY');
  });

  test('STALE_ENRICH plans an auth check, never a redeploy', () => {
    const a = planResponse(result('STALE_ENRICH'), fresh, now);
    expect(a.map((x) => x.kind)).toContain('AUTH_CHECK');
    expect(a.map((x) => x.kind)).not.toContain('REDEPLOY');
  });

  test('SOURCE_DEAD plans quarantine proposals per source named in reasons', () => {
    const a = planResponse(
      result('SOURCE_DEAD', ['source: clubber returned 0 events / failed for ≥3 consecutive runs (SOURCE_DEAD)']),
      fresh,
      now,
    );
    const q = a.find((x) => x.kind === 'QUARANTINE_SOURCE');
    expect(q?.target).toBe('clubber');
  });

  test('DB_MISSING plans NO automated action (restore is human-only) but a queue entry', () => {
    const a = planResponse(result('DB_MISSING'), fresh, now);
    expect(a.map((x) => x.kind)).not.toContain('REDEPLOY');
    expect(a.map((x) => x.kind)).toContain('QUEUE_ENTRY');
  });

  test('cooldown: same action within 12h is suppressed', () => {
    const state: ResponderState = { lastActionMs: { REDEPLOY: now - 2 * HOUR } };
    expect(planResponse(result('STALE_DEPLOY'), state, now)).toEqual([]);
  });

  test('cooldown expired (>12h) → action planned again', () => {
    const state: ResponderState = { lastActionMs: { REDEPLOY: now - 13 * HOUR } };
    expect(planResponse(result('STALE_DEPLOY'), state, now).length).toBeGreaterThan(0);
  });

  test('OK plans nothing', () => {
    expect(planResponse(result('OK'), fresh, now)).toEqual([]);
  });
});

describe('executeActions', () => {
  // Stub project dir: config/ + a redeploy stub that exits 0 — the REAL
  // redeploy.sh must never run from tests (it would hit deploy-gate + netlify).
  function stubProject(): { dir: string; statePath: string } {
    const dir = mkdtempSync(join(tmpdir(), 'aa-resp-'));
    mkdirSync(join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'redeploy.sh'), '#!/bin/bash\nexit 0\n');
    chmodSync(join(dir, 'scripts', 'redeploy.sh'), 0o755);
    return { dir, statePath: join(dir, 'responder-state.json') };
  }

  test('dry-run: nothing executes, outcomes say planned', async () => {
    const { dir, statePath } = stubProject();
    const out = await executeActions(
      [{ kind: 'QUARANTINE_SOURCE', target: 'clubber', summary: 's' }],
      { dryRun: true, statePath, projectDir: dir },
    );
    expect(out[0].ran).toBe(false);
    expect(out[0].ok).toBeNull();
    expect(existsSync(join(dir, 'config', 'quarantined-sources.json'))).toBe(false);
  });

  test('QUARANTINE_SOURCE writes the registry entry and records cooldown state', async () => {
    const { dir, statePath } = stubProject();
    const out = await executeActions(
      [{ kind: 'QUARANTINE_SOURCE', target: 'clubber', summary: 's' }],
      { dryRun: false, statePath, projectDir: dir },
    );
    expect(out[0].ok).toBe(true);
    const q = JSON.parse(readFileSync(join(dir, 'config', 'quarantined-sources.json'), 'utf8'));
    expect(q.sources.clubber.reason).toContain('SOURCE_DEAD');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(state.lastActionMs.QUARANTINE_SOURCE).toBeGreaterThan(0);
  });

  test('REDEPLOY runs the project redeploy script (stub) and reports ok', async () => {
    const { dir, statePath } = stubProject();
    const out = await executeActions([{ kind: 'REDEPLOY', summary: 's' }], {
      dryRun: false,
      statePath,
      projectDir: dir,
    });
    expect(out[0].ran).toBe(true);
    expect(out[0].ok).toBe(true);
  });

  test('a throwing action degrades to a failed outcome, never throws (fault isolation)', async () => {
    const { statePath } = stubProject();
    // nonexistent projectDir → spawn fails inside try/catch
    const out = await executeActions([{ kind: 'REDEPLOY', summary: 's' }], {
      dryRun: false,
      statePath,
      projectDir: '/nonexistent-project-dir',
    });
    expect(out[0].ok).toBe(false);
    expect(out[0].detail.length).toBeGreaterThan(0);
  });
});
