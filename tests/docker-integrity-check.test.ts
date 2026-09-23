// docker/integrity-check.sh runs on the Mac around every container run. These
// tests drive it against a throwaway git repo: a clean run passes; a planted
// root file, a commit touching code, or a changed .git/config quarantines and
// pauses all jobs.
import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(import.meta.dir, '../docker/integrity-check.sh');
let repo: string;
let state: string;

const sh = (cmd: string[], cwd = repo) => {
  const r = Bun.spawnSync(cmd, { cwd, env: { ...process.env, AA_INTEGRITY_REPO: repo, AA_STATE_DIR: state, HOME: state, AGENTATHENS_NTFY_TOPIC: '' } });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
};
const git = (...args: string[]) => sh(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args]);
const snapshot = () => sh(['bash', SCRIPT, 'snapshot', join(state, 'pre')]);
const verify = () => sh(['bash', SCRIPT, 'verify', join(state, 'pre'), 'freshness']);

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'aa-integ-repo-'));
  state = mkdtempSync(join(tmpdir(), 'aa-integ-state-'));
  git('init', '-q');
  mkdirSync(join(repo, 'scripts'));
  mkdirSync(join(repo, 'data'));
  writeFileSync(join(repo, 'scripts/job.ts'), 'console.log("ok")\n');
  writeFileSync(join(repo, 'data/scoreboard.json'), '{}\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
});

describe('integrity-check.sh', () => {
  test('a run that only commits data passes', () => {
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, 'data/scoreboard.json'), '{"n":1}\n');
    mkdirSync(join(repo, 'dist'));
    git('commit', '-qam', 'chore: daily pipeline update');
    const r = verify();
    expect(r.code).toBe(0);
    expect(existsSync(join(state, 'QUARANTINE'))).toBe(false);
  });

  test('a commit touching code is quarantined and HEAD is reset', () => {
    expect(snapshot().code).toBe(0);
    const before = git('rev-parse', 'HEAD').out.trim();
    writeFileSync(join(repo, 'scripts/job.ts'), 'console.log("planted")\n');
    git('commit', '-qam', 'chore: daily pipeline update');
    git('checkout', '-q', before, '--', 'scripts/job.ts'); // working tree untouched, commit carries it
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('non-data files');
    expect(existsSync(join(state, 'QUARANTINE'))).toBe(true);
    expect(git('rev-parse', 'HEAD').out.trim()).toBe(before);
    expect(git('branch', '--list', 'quarantine/*').out).toContain('quarantine/');
  });

  test('a new file at the repo root is quarantined and moved out', () => {
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, 'CLAUDE.md'), 'planted instructions\n');
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('repo root');
    expect(existsSync(join(repo, 'CLAUDE.md'))).toBe(false);
    expect(readFileSync(join(state, 'QUARANTINE'), 'utf8')).toContain('CLAUDE.md');
  });

  test('pipeline runtime entries at the root are not flagged', () => {
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, '.pipeline-publish-ready'), '{}');
    writeFileSync(join(repo, '.pipeline-freshness.lock'), '7');
    mkdirSync(join(repo, 'temp-descriptions'));
    expect(verify().code).toBe(0);
  });

  test('a changed .git/config is quarantined without running git', () => {
    expect(snapshot().code).toBe(0);
    const cfg = join(repo, '.git/config');
    writeFileSync(cfg, readFileSync(cfg, 'utf8') + '[core]\n\tfsmonitor = touch /tmp/should-not-run\n');
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('.git metadata');
    expect(readFileSync(join(state, 'QUARANTINE'), 'utf8')).toContain('git was not run');
  });

  for (const planted of ['commondir', 'info/attributes', 'objects/info/alternates', 'worktrees/x/gitdir']) {
    test(`a planted .git/${planted} is quarantined`, () => {
      expect(snapshot().code).toBe(0);
      mkdirSync(join(repo, '.git', planted, '..'), { recursive: true });
      writeFileSync(join(repo, '.git', planted), '/tmp/elsewhere\n');
      const r = verify();
      expect(r.code).toBe(1);
      expect(r.out).toContain('.git metadata');
    });
  }

  test('ordinary commit and ref updates in .git are not flagged', () => {
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, 'data/scoreboard.json'), '{"n":2}\n');
    git('commit', '-qam', 'chore: daily pipeline update');
    git('branch', '-f', 'pipeline-data', 'HEAD');
    git('pack-refs', '--all');
    expect(verify().code).toBe(0);
  });

  test('a new git hook is quarantined', () => {
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, '.git/hooks/post-checkout'), '#!/bin/sh\necho planted\n');
    expect(verify().code).toBe(1);
  });
});

describe('docker/aa-run.sh wiring', () => {
  const wrapper = readFileSync(join(import.meta.dir, '../docker/aa-run.sh'), 'utf8');
  test('every container run is wrapped in snapshot + verify', () => {
    expect(wrapper).toMatch(/integrity-check\.sh" snapshot/);
    expect(wrapper).toMatch(/integrity-check\.sh" verify[^\n]*\|\| exit 6/);
  });
  test('a quarantine pauses every job', () => {
    expect(wrapper).toMatch(/QUARANTINE[\s\S]{0,200}exit|QUARANTINE" \]; then[\s\S]{0,300}5/);
  });
});
