// The pipeline refuses to run directly on the Mac: daily-automated.sh and
// auto-enrich.sh carry a host-guard block that exits 9 unless the run is in
// the container (AA_CONTAINER=1) or explicitly overridden (AA_ALLOW_HOST_RUN=1).
// Security loop round 5: phase3-weekly.sh carries the same block in front of
// its layer-2 claude session (layer 1, the deterministic measurement, still
// runs and commits first).
// Security loop round 6: the override is not honoured when XPC_SERVICE_NAME
// names a com.agentathens.* launchd job — it is for one-off manual runs.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');

function guardBlock(file: string): string {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const m = src.match(/# host-guard:begin[^\n]*\n([\s\S]*?)\n\s*# host-guard:end/);
  if (!m) throw new Error(`host-guard markers missing in ${file}`);
  return m[1];
}

function runGuard(file: string, env: Record<string, string>) {
  const script = `PIPELINE_MODE=freshness\n${guardBlock(file)}\necho PASSED`;
  const r = Bun.spawnSync(['bash', '-c', script], { env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env } });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

for (const file of ['scripts/daily-automated.sh', 'scripts/auto-enrich.sh', 'scripts/phase3-weekly.sh']) {
  describe(`${file} host guard`, () => {
    test('refuses on the Mac with no container marker and no override', () => {
      const r = runGuard(file, {});
      expect(r.code).toBe(9);
      expect(r.err).toContain('REFUSED');
      expect(r.err).toContain('AA_ALLOW_HOST_RUN=1');
      expect(r.out).not.toContain('PASSED');
    });
    test('runs inside the container', () => {
      expect(runGuard(file, { AA_CONTAINER: '1' }).out).toContain('PASSED');
    });
    test('runs on the host only with the explicit override', () => {
      expect(runGuard(file, { AA_ALLOW_HOST_RUN: '1' }).out).toContain('PASSED');
      expect(runGuard(file, { AA_ALLOW_HOST_RUN: 'yes' }).code).toBe(9);
    });
    // Round 6: launchd sets XPC_SERVICE_NAME to the job label. An edited
    // legacy plist that adds AA_ALLOW_HOST_RUN=1 must not skip the container.
    test('the override is ignored in a com.agentathens.* launchd job (one-off manual runs only)', () => {
      for (const label of ['com.agentathens.daily', 'com.agentathens.enrichment-13', 'com.agentathens.phase3-weekly', 'com.agentathens.docker.freshness']) {
        const r = runGuard(file, { AA_ALLOW_HOST_RUN: '1', XPC_SERVICE_NAME: label });
        expect(r.code).toBe(9);
        expect(r.out).not.toContain('PASSED');
        expect(r.err).toContain('REFUSED');
        expect(r.err).toContain('one-off manual runs only');
      }
    });
    test('a terminal session (other XPC_SERVICE_NAME) keeps the override; the container is unaffected by the label', () => {
      expect(runGuard(file, { AA_ALLOW_HOST_RUN: '1', XPC_SERVICE_NAME: 'application.com.apple.Terminal.1234' }).out).toContain('PASSED');
      expect(runGuard(file, { AA_ALLOW_HOST_RUN: '1', XPC_SERVICE_NAME: '0' }).out).toContain('PASSED');
      expect(runGuard(file, { AA_CONTAINER: '1', XPC_SERVICE_NAME: 'com.agentathens.docker.enrichment' }).out).toContain('PASSED');
    });
    test('without the override a launchd job gets the ordinary refusal', () => {
      const r = runGuard(file, { XPC_SERVICE_NAME: 'com.agentathens.daily' });
      expect(r.code).toBe(9);
      expect(r.err).toContain('REFUSED');
    });
  });
}

test('daily-automated.sh checks the guard before re-executing under caffeinate', () => {
  const src = readFileSync(join(ROOT, 'scripts/daily-automated.sh'), 'utf8');
  expect(src.indexOf('# host-guard:begin')).toBeGreaterThan(0);
  expect(src.indexOf('# host-guard:begin')).toBeLessThan(src.indexOf('# caffeinate:begin'));
});

describe('phase3-weekly.sh: the host guard gates layer 2 only', () => {
  const src = readFileSync(join(ROOT, 'scripts/phase3-weekly.sh'), 'utf8');
  const guard = src.indexOf('# host-guard:begin');
  const l1 = src.indexOf('# ---------- layer 1');
  const l2 = src.indexOf('# ---------- layer 2');

  test('sits after layer 1 and inside layer 2, before the guard self-test and before ANY claude call', () => {
    expect(guard).toBeGreaterThan(l1);
    expect(guard).toBeGreaterThan(l2);
    expect(guard).toBeLessThan(src.indexOf('if ! run_guard_selftest; then', l2));
    expect(guard).toBeLessThan(src.indexOf('"$CLAUDE_BIN"', l2));
  });

  test('the --guard-selftest-only mode stays reachable on the host (it runs no claude)', () => {
    expect(src.indexOf('"--guard-selftest-only"')).toBeLessThan(guard);
  });
});
