/**
 * Security loop round 9 — the deadman's weekly check for account-wide CLI
 * logins left on the Mac once the container setup is installed
 * (src/watchdog/cli-logins.ts). Fixture Netlify configs and a stub gh; token
 * values must never come out of the check.
 */
import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CLI_LOGIN_CHECK_INTERVAL_MS, cliLoginWarning, containerSetupInstalled, findCliLogins, netlifyConfigHasToken,
  netlifyConfigPaths, weeklyCliLoginCheck,
} from '../../src/watchdog/cli-logins';

const ROOT = join(import.meta.dir, '..', '..');
const MODULE = join(ROOT, 'src', 'watchdog', 'cli-logins.ts');
const NETLIFY_SECRET = 'nfp_SECRETNETLIFYTOKEN0123456789';
const GH_SECRET = 'gho_SECRETGHTOKEN0123456789';

const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'aa-cli-logins-')); tmpDirs.push(d); return d; };

const savedStateDir = process.env.AA_STATE_DIR;
afterEach(() => {
  if (savedStateDir === undefined) delete process.env.AA_STATE_DIR;
  else process.env.AA_STATE_DIR = savedStateDir;
});

const netlifyConfig = (token: string | null) => JSON.stringify({
  telemetryDisabled: true,
  userId: 'u1',
  users: { u1: { id: 'u1', name: 'Owner', email: 'o@example.com', auth: token === null ? { github: {} } : { token, github: {} } } },
});

/** A stub gh: prints a token on both streams (as `gh auth status --show-token` would), records its args, exits `code` (or sleeps). */
function stubGh(dir: string, behaviour: { code?: number; sleep?: boolean }): string {
  const p = join(dir, 'gh');
  writeFileSync(p, `#!/bin/bash
printf '%s\\n' "$*" >> "${join(dir, 'gh-calls')}"
echo "  - Token: ${GH_SECRET}"
echo "  - Token: ${GH_SECRET}" >&2
${behaviour.sleep ? 'sleep 30' : ''}
exit ${behaviour.code ?? 0}
`);
  chmodSync(p, 0o755);
  return p;
}

describe('Netlify CLI config: token presence only', () => {
  test('a users.<id>.auth.token counts; no token, an empty token or junk does not', () => {
    expect(netlifyConfigHasToken(netlifyConfig(NETLIFY_SECRET))).toBe(true);
    expect(netlifyConfigHasToken(netlifyConfig(null))).toBe(false);
    expect(netlifyConfigHasToken(netlifyConfig('  '))).toBe(false);
    expect(netlifyConfigHasToken('{"users": null}')).toBe(false);
    expect(netlifyConfigHasToken('not json')).toBe(false);
  });

  test('the macOS, XDG, ~/.config and legacy locations are all looked at', () => {
    const paths = netlifyConfigPaths({ home: '/Users/o', env: { XDG_CONFIG_HOME: '/x/cfg' } });
    expect(paths).toEqual([
      '/Users/o/Library/Preferences/netlify/config.json',
      '/x/cfg/netlify/config.json',
      '/Users/o/.config/netlify/config.json',
      '/Users/o/.netlify/config.json',
    ]);
    // A relative XDG_CONFIG_HOME is ignored (the spec requires an absolute path).
    expect(netlifyConfigPaths({ home: '/h', env: { XDG_CONFIG_HOME: 'rel' } })).toContain('/h/.config/netlify/config.json');
  });
});

describe('findCliLogins', () => {
  test('finds a Netlify token under ~/Library/Preferences and a logged-in gh', () => {
    const home = tmp();
    mkdirSync(join(home, 'Library', 'Preferences', 'netlify'), { recursive: true });
    const cfg = join(home, 'Library', 'Preferences', 'netlify', 'config.json');
    writeFileSync(cfg, netlifyConfig(NETLIFY_SECRET));
    const bin = tmp();
    const f = findCliLogins({ home, env: { PATH: '/usr/bin:/bin' }, ghBin: stubGh(bin, { code: 0 }) });
    expect(f).toEqual({ netlifyTokenIn: [cfg], ghLoggedIn: true });
    expect(readFileSync(join(bin, 'gh-calls'), 'utf8').trim()).toBe('auth status --hostname github.com');
  });

  test('finds a token under $XDG_CONFIG_HOME; gh logged out is false; no gh is null', () => {
    const home = tmp();
    const xdg = tmp();
    mkdirSync(join(xdg, 'netlify'), { recursive: true });
    writeFileSync(join(xdg, 'netlify', 'config.json'), netlifyConfig(NETLIFY_SECRET));
    const f = findCliLogins({ home, env: { XDG_CONFIG_HOME: xdg }, ghBin: stubGh(tmp(), { code: 1 }) });
    expect(f).toEqual({ netlifyTokenIn: [join(xdg, 'netlify', 'config.json')], ghLoggedIn: false });
    expect(findCliLogins({ home, env: {}, ghBin: null }).ghLoggedIn).toBeNull();
    expect(findCliLogins({ home, env: {}, ghBin: join(tmp(), 'missing-gh') }).ghLoggedIn).toBeNull();
  });

  test('a logged-out Netlify config, a FIFO or a symlink at the config path are not findings and do not block', () => {
    const home = tmp();
    const dir = join(home, '.config', 'netlify');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), netlifyConfig(null));
    mkdirSync(join(home, '.netlify'), { recursive: true });
    expect(Bun.spawnSync(['mkfifo', join(home, '.netlify', 'config.json')]).exitCode).toBe(0);
    expect(findCliLogins({ home, env: {}, ghBin: null }).netlifyTokenIn).toEqual([]);
  });

  test('a gh that hangs is killed at its timeout (unknown, not logged in)', () => {
    const t0 = Date.now();
    const f = findCliLogins({ home: tmp(), env: {}, ghBin: stubGh(tmp(), { sleep: true }), ghTimeoutMs: 500 });
    expect(f.ghLoggedIn).toBeNull();
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  test('no token value reaches the process output or the warning', () => {
    const home = tmp();
    mkdirSync(join(home, 'Library', 'Preferences', 'netlify'), { recursive: true });
    writeFileSync(join(home, 'Library', 'Preferences', 'netlify', 'config.json'), netlifyConfig(NETLIFY_SECRET));
    const gh = stubGh(tmp(), { code: 0 });
    const code = `import { findCliLogins, cliLoginWarning } from ${JSON.stringify(MODULE)};
const f = findCliLogins({ home: ${JSON.stringify(home)}, env: {}, ghBin: ${JSON.stringify(gh)} });
console.log(JSON.stringify(f)); console.log(JSON.stringify(cliLoginWarning(f)));`;
    const r = Bun.spawnSync([process.execPath, '-e', code], { stdout: 'pipe', stderr: 'pipe' });
    const all = r.stdout.toString() + r.stderr.toString();
    expect(r.exitCode).toBe(0);
    expect(all).toContain('ghLoggedIn":true');
    expect(all).not.toContain(GH_SECRET);
    expect(all).not.toContain(NETLIFY_SECRET);
  });
});

describe('cliLoginWarning', () => {
  test('names each finding and the fix; nothing to warn about is null', () => {
    const w = cliLoginWarning({ netlifyTokenIn: ['/Users/o/Library/Preferences/netlify/config.json'], ghLoggedIn: true })!;
    expect(w.subject).toContain('CLI logins');
    expect(w.body).toContain('/Users/o/Library/Preferences/netlify/config.json holds an auth token (value not read out)');
    expect(w.body).toContain('gh auth status');
    expect(w.body).toContain('`netlify logout` and `gh auth logout`');
    expect(w.body).toContain('scoped tokens');
    expect(w.short).toContain('netlify logout');
    expect(cliLoginWarning({ netlifyTokenIn: [], ghLoggedIn: false })).toBeNull();
    expect(cliLoginWarning({ netlifyTokenIn: [], ghLoggedIn: null })).toBeNull();
    expect(cliLoginWarning({ netlifyTokenIn: [], ghLoggedIn: true })!.body).not.toContain('Netlify CLI config');
  });
});

describe('weeklyCliLoginCheck — only with the container setup installed, at most once a week', () => {
  function setup(opts: { wrapper?: boolean; env?: boolean } = {}) {
    const project = tmp();
    const state = tmp();
    process.env.AA_STATE_DIR = state;
    if (opts.wrapper !== false) { mkdirSync(join(project, 'docker'), { recursive: true }); writeFileSync(join(project, 'docker', 'aa-run.sh'), '#!/bin/bash\n'); }
    if (opts.env !== false) writeFileSync(join(state, 'docker.env'), 'X=1\n');
    const home = tmp();
    mkdirSync(join(home, 'Library', 'Preferences', 'netlify'), { recursive: true });
    writeFileSync(join(home, 'Library', 'Preferences', 'netlify', 'config.json'), netlifyConfig(NETLIFY_SECRET));
    const bin = tmp();
    return { project, state, home, bin, deps: { home, env: {}, ghBin: stubGh(bin, { code: 0 }) } };
  }
  const NOW = Date.parse('2026-09-24T06:00:00Z');

  test('not installed (no wrapper, or no docker.env): no check, no gh call, no state', () => {
    for (const o of [{ wrapper: false }, { env: false }]) {
      const s = setup(o);
      expect(containerSetupInstalled(s.project)).toBe(false);
      expect(weeklyCliLoginCheck(s.project, NOW, s.deps)).toBeNull();
      expect(existsSync(join(s.bin, 'gh-calls'))).toBe(false);
      expect(existsSync(join(s.state, 'cli-login-check.json'))).toBe(false);
    }
  });

  test('installed: warns, records the check (counts only), then stays quiet for 7 days', () => {
    const s = setup();
    const first = weeklyCliLoginCheck(s.project, NOW, s.deps)!;
    expect(first.warning).not.toBeNull();
    expect(first.findings.ghLoggedIn).toBe(true);
    const state = readFileSync(join(s.state, 'cli-login-check.json'), 'utf8');
    expect(JSON.parse(state)).toMatchObject({ last_check_ms: NOW, netlify_token_files: 1, gh_logged_in: true });
    expect(state).not.toContain(NETLIFY_SECRET);
    expect(weeklyCliLoginCheck(s.project, NOW + 3_600_000, s.deps)).toBeNull();
    expect(weeklyCliLoginCheck(s.project, NOW + CLI_LOGIN_CHECK_INTERVAL_MS - 1, s.deps)).toBeNull();
    expect(readFileSync(join(s.bin, 'gh-calls'), 'utf8').trim().split('\n')).toHaveLength(1);
    const again = weeklyCliLoginCheck(s.project, NOW + CLI_LOGIN_CHECK_INTERVAL_MS, s.deps)!;
    expect(again.warning).not.toBeNull();
  });

  test('installed and logged out everywhere: checked, recorded, no warning', () => {
    const s = setup();
    rmSync(join(s.home, 'Library'), { recursive: true });
    const r = weeklyCliLoginCheck(s.project, NOW, { home: s.home, env: {}, ghBin: stubGh(tmp(), { code: 1 }) })!;
    expect(r.warning).toBeNull();
    expect(existsSync(join(s.state, 'cli-login-check.json'))).toBe(true);
  });

  test('a corrupt or future-dated state file makes the check due; a symlinked one is refused on write', () => {
    const s = setup();
    writeFileSync(join(s.state, 'cli-login-check.json'), 'garbage');
    expect(weeklyCliLoginCheck(s.project, NOW, s.deps)).not.toBeNull();
    writeFileSync(join(s.state, 'cli-login-check.json'), JSON.stringify({ last_check_ms: NOW + 10 * CLI_LOGIN_CHECK_INTERVAL_MS }));
    expect(weeklyCliLoginCheck(s.project, NOW, s.deps)).not.toBeNull();
    const t = tmp();
    rmSync(join(s.state, 'cli-login-check.json'));
    symlinkSync(join(t, 'target.json'), join(s.state, 'cli-login-check.json'));
    expect(() => weeklyCliLoginCheck(s.project, NOW, s.deps)).toThrow();
    expect(existsSync(join(t, 'target.json'))).toBe(false);
  });
});

describe('the deadman runs it after the heartbeat and delivers through notification and email', () => {
  test('wiring pin', () => {
    const src = readFileSync(join(ROOT, 'scripts', 'deadman-watchdog.ts'), 'utf8');
    const at = src.indexOf('weeklyCliLoginCheck(ROOT, nowMs)');
    expect(at).toBeGreaterThan(src.indexOf('writeHeartbeat({'));
    expect(at).toBeLessThan(src.lastIndexOf('process.exit(result.status === "OK" && heartbeatOk ? 0 : 1);'));
    const block = src.slice(at, at + 800);
    expect(block).toContain('fireNotification(');
    expect(block).toContain('sendEmail(cfg.email, cli.warning.subject, cli.warning.body)');
  });
});
