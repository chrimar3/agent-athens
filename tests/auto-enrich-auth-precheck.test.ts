import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const SCRIPT = join(ROOT, 'scripts', 'auto-enrich.sh');

// Precondition pin: this fixture exists because the Aug 2026 outage proved the
// failure path unreachable under `set -e` — five days of logs ended at
// "Running auth pre-check..." with zero evidence. If the script drops
// --auth-check-only or the || guard, these tests must fail loudly, not go vacuous.
function makeStubClaude(dir: string, behavior: 'ok' | 'not-logged-in'): string {
  const bin = join(dir, 'claude');
  const body =
    behavior === 'ok'
      ? '#!/bin/bash\nif [[ "$1" == "--version" ]]; then echo "stub 0.0.1"; exit 0; fi\necho \'{"result":"ok"}\'\nexit 0\n'
      : '#!/bin/bash\nif [[ "$1" == "--version" ]]; then echo "stub 0.0.1"; exit 0; fi\necho \'{"result":"Not logged in"}\'\necho "Not logged in" >&2\nexit 1\n';
  writeFileSync(bin, body);
  chmodSync(bin, 0o755);
  return bin;
}

function runAuthCheck(stubBehavior: 'ok' | 'not-logged-in') {
  const dir = mkdtempSync(join(tmpdir(), 'aa-auth-'));
  const stub = makeStubClaude(dir, stubBehavior);
  // LOG_DIR_OVERRIDE keeps stub output out of the production logs/ dir —
  // canary-2 (2026-08-11) caught this test writing fake "NOT LOGGED IN"
  // lines into the live log mid-run and clobbering the file deadman reads.
  const logDir = join(dir, 'logs');
  const r = Bun.spawnSync(['bash', SCRIPT, '--auth-check-only'], {
    cwd: ROOT,
    env: { ...process.env, CLAUDE_BIN_OVERRIDE: stub, LOG_DIR_OVERRIDE: logDir },
  });
  return { r, logDir };
}

describe('auto-enrich --auth-check-only', () => {
  test('script advertises the mode (precondition)', () => {
    expect(readFileSync(SCRIPT, 'utf8')).toContain('--auth-check-only');
  });

  test('healthy CLI → exit 0', () => {
    expect(runAuthCheck('ok').r.exitCode).toBe(0);
  });

  test('failing CLI → exit 1 WITH the failure logged (the Aug 6-10 silent-death regression)', () => {
    const { r, logDir } = runAuthCheck('not-logged-in');
    expect(r.exitCode).toBe(1);
    // Read from the ISOLATED log dir — if the LOG_DIR_OVERRIDE seam is ever
    // dropped, this read ENOENTs and the test fails (isolation is pinned).
    const log = readFileSync(join(logDir, 'auth-precheck-last.log'), 'utf8');
    expect(log).toContain('exit=1'); // the line set -e used to make unreachable
    expect(log).toContain('Not logged in'); // the evidence that was never captured
  });
});
