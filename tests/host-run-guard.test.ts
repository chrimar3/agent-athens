// The pipeline refuses to run directly on the Mac: daily-automated.sh and
// auto-enrich.sh carry a host-guard block that exits 9 unless the run is in
// the container (AA_CONTAINER=1) or explicitly overridden (AA_ALLOW_HOST_RUN=1).
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

for (const file of ['scripts/daily-automated.sh', 'scripts/auto-enrich.sh']) {
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
  });
}

test('daily-automated.sh checks the guard before re-executing under caffeinate', () => {
  const src = readFileSync(join(ROOT, 'scripts/daily-automated.sh'), 'utf8');
  expect(src.indexOf('# host-guard:begin')).toBeGreaterThan(0);
  expect(src.indexOf('# host-guard:begin')).toBeLessThan(src.indexOf('# caffeinate:begin'));
});
