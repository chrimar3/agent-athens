/**
 * Security loop round 4 — host jobs never write through a planted symlink.
 *
 * Pipeline containers can write the repo's logs/ and data/ folders. A host job
 * (deadman, enrichment check, phase3 weekly, digest) that appends to a file
 * there would follow a symlink a compromised run planted and write into any
 * file the owner can write. These jobs now keep their own output under the
 * host-only state dir (${AA_STATE_DIR:-~/.config/agentathens-docker}/logs) and
 * refuse a symlink even there.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import { appendFileNoFollow, hostLogDir, writeFileNoFollow } from '../../src/watchdog/host-files';

const ROOT = join(import.meta.dir, '..', '..');
const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p: string) => { const d = mkdtempSync(join(tmpdir(), p)); tmpDirs.push(d); return d; };

/** A file standing in for something in $HOME the attacker wants to clobber. */
function victim(dir: string): string {
  const v = join(dir, 'victim.txt');
  writeFileSync(v, 'ORIGINAL\n');
  return v;
}

describe('appendFileNoFollow', () => {
  test('appends, writing the header once, with mode 600', () => {
    const d = tmp('aa-nofollow-');
    const f = join(d, 'sub', 'x.csv');
    appendFileNoFollow(f, 'a\n', 'h\n');
    appendFileNoFollow(f, 'b\n', 'h\n');
    expect(readFileSync(f, 'utf-8')).toBe('h\na\nb\n');
    expect(statSync(f).mode & 0o777).toBe(0o600);
  });

  test('refuses a symlink — the target is untouched', () => {
    const d = tmp('aa-nofollow-');
    const v = victim(d);
    const link = join(d, 'x.csv');
    symlinkSync(v, link);
    expect(() => appendFileNoFollow(link, 'PWNED\n')).toThrow();
    expect(readFileSync(v, 'utf-8')).toBe('ORIGINAL\n');
  });
});

describe('writeFileNoFollow (weekly digest output)', () => {
  test('replaces the content of a regular file', () => {
    const d = tmp('aa-nofollow-');
    const f = join(d, 'x.md');
    writeFileNoFollow(f, 'long first version\n');
    writeFileNoFollow(f, 'v2\n');
    expect(readFileSync(f, 'utf-8')).toBe('v2\n');
  });

  test('refuses a symlink — the target is untouched', () => {
    const d = tmp('aa-nofollow-');
    const v = victim(d);
    const link = join(d, 'x.md');
    symlinkSync(v, link);
    expect(() => writeFileNoFollow(link, 'PWNED\n')).toThrow();
    expect(readFileSync(v, 'utf-8')).toBe('ORIGINAL\n');
  });

  test('scripts/weekly-digest.ts writes its digest through it', () => {
    const src = readFileSync(join(ROOT, 'scripts/weekly-digest.ts'), 'utf-8');
    expect(src).toContain('writeFileNoFollow(outPath, md)');
    expect(src).not.toMatch(/\bwriteFileSync\(/);
  });
});

describe('deadman heartbeat', () => {
  test('lives in the host-only state dir and refuses a planted symlink', async () => {
    const state = tmp('aa-deadman-state-');
    const prev = process.env.AA_STATE_DIR;
    process.env.AA_STATE_DIR = state;
    try {
      const { heartbeatPath, writeHeartbeat } = await import('../../scripts/deadman-watchdog');
      expect(hostLogDir()).toBe(join(state, 'logs'));
      expect(heartbeatPath()).toBe(join(state, 'logs', 'deadman-heartbeat.csv'));
      const row = { timestamp: 't', status: 'OK', deploy_age_h: 1, enrich_age_h: 1, pipeline_ok: true, email: 'n/a', reasons: 'r' };
      writeHeartbeat(row);
      expect(readFileSync(heartbeatPath(), 'utf-8')).toStartWith('timestamp,status,');

      rmSync(heartbeatPath());
      const v = victim(state);
      symlinkSync(v, heartbeatPath());
      expect(() => writeHeartbeat(row)).toThrow();
      expect(readFileSync(v, 'utf-8')).toBe('ORIGINAL\n');
    } finally {
      if (prev === undefined) delete process.env.AA_STATE_DIR;
      else process.env.AA_STATE_DIR = prev;
    }
  });

  test('main() survives a refused heartbeat write: reports it and exits non-zero', () => {
    const src = readFileSync(join(ROOT, 'scripts/deadman-watchdog.ts'), 'utf-8');
    expect(src).toContain('HEARTBEAT NOT WRITTEN');
    expect(src).toContain('process.exit(result.status === "OK" && heartbeatOk ? 0 : 1)');
    expect(src).not.toMatch(/join\(ROOT, "logs", "deadman-heartbeat\.csv"\)/);
  });
});

describe('daily-enrichment-check.sh', () => {
  const hasSqliteCli = Bun.spawnSync(['bash', '-c', 'command -v sqlite3']).exitCode === 0;
  function project() {
    const dir = tmp('aa-enrich-check-sym-');
    for (const d of ['scripts', 'data', 'logs', 'bin', 'home', 'state']) mkdirSync(join(dir, d));
    copyFileSync(join(ROOT, 'scripts/daily-enrichment-check.sh'), join(dir, 'scripts/daily-enrichment-check.sh'));
    const db = new Database(join(dir, 'data/events.db'));
    db.run(`CREATE TABLE events (id TEXT, title TEXT, start_date TEXT, venue_name TEXT, type TEXT, location_status TEXT, needs_enrichment INTEGER)`);
    db.close();
    writeFileSync(join(dir, 'bin/osascript'), '#!/bin/bash\nexit 0\n');
    chmodSync(join(dir, 'bin/osascript'), 0o755);
    return dir;
  }
  const run = (dir: string) => {
    const r = Bun.spawnSync(['bash', join(dir, 'scripts/daily-enrichment-check.sh')], {
      cwd: dir,
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, HOME: join(dir, 'home'), AA_STATE_DIR: join(dir, 'state') },
    });
    return { code: r.exitCode, err: new TextDecoder().decode(r.stderr) };
  };

  test.skipIf(!hasSqliteCli)('a symlink at the repo logs/ path is never written (the log moved to the state dir)', () => {
    const dir = project();
    const v = victim(dir);
    symlinkSync(v, join(dir, 'logs/enrichment-check.log'));
    expect(run(dir).code).toBe(0);
    expect(readFileSync(v, 'utf-8')).toBe('ORIGINAL\n');
    expect(readFileSync(join(dir, 'state/logs/enrichment-check.log'), 'utf-8')).toContain('Starting enrichment check');
  });

  test('a symlink at its own log path is refused — exit 1, target untouched', () => {
    const dir = project();
    const v = victim(dir);
    mkdirSync(join(dir, 'state/logs'));
    symlinkSync(v, join(dir, 'state/logs/enrichment-check.log'));
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
    expect(r.err).toContain('is a symlink');
    expect(readFileSync(v, 'utf-8')).toBe('ORIGINAL\n');
  });

  test('every count read from the database is checked to be an integer, and the database is opened read-only (source check)', () => {
    const src = readFileSync(join(ROOT, 'scripts/daily-enrichment-check.sh'), 'utf-8');
    for (const v of ['UNENRICHED', 'TOTAL_VISIBLE', 'ENRICHED', 'AUTO_ENRICHED_TODAY', 'HAS_ENRICHMENT_LOG']) {
      expect(src).toContain(`require_count ${v} "$${v}"`);
    }
    expect(src).not.toMatch(/sqlite3 (?!-readonly)/);
  });
});

describe('phase3-weekly.sh', () => {
  const SCRIPT = join(ROOT, 'scripts/phase3-weekly.sh');
  function run(state: string) {
    const hookDir = tmp('aa-phase3-hook-');
    const hook = join(hookDir, 'hook.ts');
    writeFileSync(hook, 'process.exit(0);\n'); // self-test fails; only the log location matters here
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      AA_STATE_DIR: state,
      DB_GUARD_HOOK_OVERRIDE: hook,
      PHASE3_WT_OVERRIDE: tmp('aa-phase3-wt-'),
    };
    delete env.PHASE3_LOG_DIR_OVERRIDE;
    const r = Bun.spawnSync(['bash', SCRIPT, '--guard-selftest-only'], { cwd: ROOT, env });
    return { code: r.exitCode, err: new TextDecoder().decode(r.stderr) };
  }

  test('without the test seam, its log goes to ${AA_STATE_DIR}/logs', () => {
    const state = tmp('aa-phase3-state-');
    run(state);
    expect(readFileSync(join(state, 'logs/phase3-weekly.log'), 'utf-8')).toContain('phase3-weekly start');
  });

  test('a symlink at its log path is refused — exit 1, target untouched', () => {
    const state = tmp('aa-phase3-state-');
    mkdirSync(join(state, 'logs'));
    const v = victim(state);
    symlinkSync(v, join(state, 'logs/phase3-weekly.log'));
    const r = run(state);
    expect(r.code).toBe(1);
    expect(r.err).toContain('REFUSED');
    expect(readFileSync(v, 'utf-8')).toBe('ORIGINAL\n');
  });

  test('never copies a symlinked data/events.db into the session worktree', () => {
    const src = readFileSync(SCRIPT, 'utf-8');
    const guard = src.indexOf('if [ -L "$MAIN_REPO/data/events.db" ]');
    const copy = src.indexOf('cp "$MAIN_REPO/data/events.db"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(copy);
    expect(src).not.toContain('LOG_DIR="${PHASE3_LOG_DIR_OVERRIDE:-$MAIN_REPO/logs}"');
  });
});

describe('launchd plists of the host-resident jobs', () => {
  const HOST_JOBS = [
    'com.agentathens.digest.plist',
    'com.agentathens.enrichment-check.plist',
    'com.agentathens.phase3-weekly.plist',
    'config/launchd/com.agentathens.deadman.plist',
    // Round 5: the deploy-cadence check runs on the host too.
    'com.agentathens.check-deploy-cadence.plist',
  ];
  for (const f of HOST_JOBS) {
    test(`${f}: output goes to the host-only state dir, never the repo logs/`, () => {
      const xml = readFileSync(join(ROOT, f), 'utf-8');
      expect(xml).not.toContain('<key>StandardOutPath</key>');
      expect(xml).not.toContain('<key>StandardErrorPath</key>');
      expect(xml).not.toMatch(/&gt;&gt;\s*logs\/|>>\s*logs\//);
      expect(xml).toContain('d="${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/logs"; mkdir -p "$d" &amp;&amp; exec &gt;&gt;"$d/');
    });
  }
});
