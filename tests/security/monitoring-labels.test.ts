/**
 * Security loop round 5 — the deadman watches the container jobs too.
 *
 * config/monitoring.json pipeline_health_labels is the list of launchd labels
 * whose last exit status the deadman checks (scripts/deadman-watchdog.ts,
 * launchdHealth: a label that is not loaded is skipped, so listing both the
 * legacy host jobs and the com.agentathens.docker.* jobs is safe before, during
 * and after the migration). Without the docker labels a failing container job
 * would never turn the deadman red.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..', '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'monitoring.json'), 'utf-8')) as { pipeline_health_labels: string[] };
const labels = cfg.pipeline_health_labels;

const DOCKER_JOBS = ['visibility', 'freshness', 'enrichment', 'enrichment-13', 'enrichment-16', 'enrichment-19', 'verify-live', 'verify-live-0', 'verify-live-6', 'verify-live-18', 'image-refresh'];

describe('config/monitoring.json pipeline_health_labels', () => {
  test('lists every container job label', () => {
    for (const j of DOCKER_JOBS) expect(labels).toContain(`com.agentathens.docker.${j}`);
  });

  test('keeps the legacy host labels alongside them (the migration is not finished)', () => {
    expect(labels).toContain('com.agentathens.daily');
    expect(labels).toContain('com.agentathens.auto-enrich');
  });

  test('every entry is a plain com.agentathens label, listed once', () => {
    for (const l of labels) expect(l).toMatch(/^com\.agentathens\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('the deadman reads this list (the wiring the labels depend on)', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'deadman-watchdog.ts'), 'utf-8');
    expect(src).toContain('launchdHealth.isHealthy(cfg.pipeline_health_labels)');
  });
});
