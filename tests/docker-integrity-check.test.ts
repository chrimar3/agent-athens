// docker/integrity-check.sh runs on the Mac around every container run. These
// tests drive it against a throwaway git repo: a clean run passes; a planted
// root file, a commit touching code, or a changed .git/config quarantines and
// pauses all jobs.
import { beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync, mkdirSync, symlinkSync } from 'fs';
import { deflateSync } from 'zlib';
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
    git('branch', '-f', 'some-feature', 'HEAD');
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, 'data/scoreboard.json'), '{"n":2}\n');
    git('commit', '-qam', 'chore: daily pipeline update');
    git('pack-refs', '--all');
    expect(verify().code).toBe(0);
  });

  test('a pipeline-data commit touching code is quarantined, rolled back and not published', () => {
    git('branch', 'pipeline-data', 'HEAD');
    expect(snapshot().code).toBe(0);
    const before = git('rev-parse', 'pipeline-data').out.trim();
    // Build a commit on pipeline-data with plumbing, as the pipeline does.
    writeFileSync(join(repo, 'scripts/job.ts'), 'console.log("planted")\n');
    git('add', 'scripts/job.ts');
    const tree = git('write-tree').out.trim();
    git('checkout', '-q', 'HEAD', '--', 'scripts/job.ts');
    const bad = git('commit-tree', tree, '-p', before, '-m', 'chore: daily pipeline update').out.trim();
    git('update-ref', 'refs/heads/pipeline-data', bad);
    writeFileSync(join(repo, '.pipeline-publish-ready'), '{}');
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('pipeline-data commit');
    expect(git('rev-parse', 'pipeline-data').out.trim()).toBe(before);
    expect(existsSync(join(repo, '.pipeline-publish-ready'))).toBe(false);
    expect(git('branch', '--list', 'quarantine/pipeline-data-*').out).toContain('quarantine/pipeline-data-');
  });

  test('a data-only pipeline-data commit passes', () => {
    git('branch', 'pipeline-data', 'HEAD');
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, 'data/scoreboard.json'), '{"n":3}\n');
    git('add', 'data/scoreboard.json');
    const tree = git('write-tree').out.trim();
    git('reset', '-q'); // the pipeline uses a temporary index; the real one stays untouched
    const ok = git('commit-tree', tree, '-p', git('rev-parse', 'pipeline-data').out.trim(), '-m', 'chore: daily pipeline update').out.trim();
    git('update-ref', 'refs/heads/pipeline-data', ok);
    expect(verify().code).toBe(0);
  });

  test('changes staged for the next commit are quarantined', () => {
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, 'scripts/job.ts'), 'console.log("planted")\n');
    git('add', 'scripts/job.ts');
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('staged');
  });

  test('another branch or the stash moving is quarantined', () => {
    git('branch', 'feature', 'HEAD');
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, 'data/scoreboard.json'), '{"x":1}\n');
    git('add', 'data/scoreboard.json');
    const tree = git('write-tree').out.trim();
    git('reset', '-q');
    const c = git('commit-tree', tree, '-p', 'feature', '-m', 'x').out.trim();
    git('update-ref', 'refs/heads/feature', c);
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('the stash, a note or a replace ref');
  });

  test('a planted replace ref (swaps what git shows for an object) is quarantined', () => {
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, 'scripts/job.ts'), 'console.log("planted")\n');
    const blob = git('hash-object', '-w', 'scripts/job.ts').out.trim();
    git('checkout', '-q', 'HEAD', '--', 'scripts/job.ts');
    const orig = git('rev-parse', 'HEAD:scripts/job.ts').out.trim();
    git('replace', orig, blob);
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('replace ref');
  });

  test('a planted git note is quarantined', () => {
    expect(snapshot().code).toBe(0);
    git('notes', 'add', '-m', 'x', 'HEAD');
    expect(verify().code).toBe(1);
  });

  test('a symlink planted in a writable folder is quarantined', () => {
    expect(snapshot().code).toBe(0);
    mkdirSync(join(repo, 'logs'), { recursive: true });
    symlinkSync('/tmp', join(repo, 'logs/deploy-cadence-ALERT.log'));
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('symlink');
  });

  test('a new git hook is quarantined', () => {
    expect(snapshot().code).toBe(0);
    writeFileSync(join(repo, '.git/hooks/post-checkout'), '#!/bin/sh\necho planted\n');
    expect(verify().code).toBe(1);
  });
});

// .git/objects: a run with a writable .git could replace an existing object's
// bytes; a later `git stash` or checkout on the Mac would then write the
// planted content into a tracked file. Objects are immutable, so any change
// to an existing object file, and any new object that does not hash to its
// name, is quarantined — without running git reset on the suspect store.
describe('integrity-check.sh object store', () => {
  const objPath = (oid: string) => join(repo, '.git/objects', oid.slice(0, 2), oid.slice(2));
  const blobOf = (rev: string) => git('rev-parse', rev).out.trim();
  const packFiles = (ext: string) =>
    readdirSync(join(repo, '.git/objects/pack')).filter((f) => f.endsWith(ext)).map((f) => join(repo, '.git/objects/pack', f));
  const flipByte = (file: string, at: number) => {
    const b = readFileSync(file);
    b[at] ^= 0xff;
    chmodSync(file, 0o644);
    writeFileSync(file, b); // same inode, same size
  };
  const packEverything = () => git('repack', '-a', '-d', '-q', '-n');

  test('overwriting an existing loose object in place (same size, mtime restored) is quarantined', () => {
    const oid = blobOf('HEAD:scripts/job.ts');
    const file = objPath(oid);
    const { mtime, atime } = statSync(file);
    expect(snapshot().code).toBe(0);
    flipByte(file, readFileSync(file).length - 3);
    utimesSync(file, atime, mtime); // hide the write from mtime; ctime still moves
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`git object ${oid}`);
    expect(r.out).toContain('does not match its name');
    expect(readFileSync(join(state, 'QUARANTINE'), 'utf8')).toContain(oid);
  });

  test("replacing an existing loose object with another object's bytes is quarantined", () => {
    const victim = objPath(blobOf('HEAD:scripts/job.ts'));
    const other = objPath(blobOf('HEAD:data/scoreboard.json'));
    expect(snapshot().code).toBe(0);
    chmodSync(victim, 0o644);
    writeFileSync(victim, readFileSync(other));
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/rewritten|does not match its name/);
    expect(r.out).toContain('git fsck --full');
  });

  test('deleting an existing loose object is quarantined', () => {
    const oid = blobOf('HEAD:scripts/job.ts');
    expect(snapshot().code).toBe(0);
    unlinkSync(objPath(oid));
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('deleted');
    expect(r.out).toContain(oid.slice(2));
  });

  test('a planted new loose object whose content does not match its name is quarantined', () => {
    expect(snapshot().code).toBe(0);
    const fake = 'ab' + 'c'.repeat(38);
    mkdirSync(join(repo, '.git/objects/ab'), { recursive: true });
    writeFileSync(objPath(fake), deflateSync(Buffer.from('blob 20\0console.log("evil")\n\0')));
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`git object ${fake}`);
    expect(r.out).toContain('does not match its name');
  });

  test('a symlink planted in .git/objects is quarantined', () => {
    expect(snapshot().code).toBe(0);
    mkdirSync(join(repo, '.git/objects/cd'), { recursive: true });
    symlinkSync('/tmp', join(repo, '.git/objects/cd', 'e'.repeat(38)));
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('non-regular');
  });

  test('git gc during the run is quarantined', () => {
    expect(snapshot().code).toBe(0);
    git('gc', '-q');
    expect(verify().code).toBe(1);
    expect(existsSync(join(state, 'QUARANTINE'))).toBe(true);
  });

  test('a repack of existing packs is flagged as a repack', () => {
    packEverything();
    writeFileSync(join(repo, 'data/scoreboard.json'), '{"n":9}\n');
    git('commit', '-qam', 'chore: daily pipeline update');
    expect(snapshot().code).toBe(0);
    packEverything();
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('repacked');
  });

  test('a pack git merely touched (freshened) passes; one modified in place is quarantined', () => {
    packEverything();
    const [pack] = packFiles('.pack');
    expect(snapshot().code).toBe(0);
    const now = new Date();
    utimesSync(pack, now, now);
    expect(verify().code).toBe(0);

    expect(snapshot().code).toBe(0);
    flipByte(pack, 40);
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('was modified during the run');
  });

  test('a changed .idx is quarantined', () => {
    packEverything();
    const [idx] = packFiles('.idx');
    expect(snapshot().code).toBe(0);
    flipByte(idx, 20);
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('rewritten');
  });

  test('a fetched pack passes; a corrupted new pack is quarantined', () => {
    const other = mkdtempSync(join(tmpdir(), 'aa-integ-other-'));
    sh(['git', 'clone', '-q', repo, other]);
    writeFileSync(join(other, 'data/scoreboard.json'), '{"fetched":1}\n');
    sh(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'upstream data'], other);

    expect(snapshot().code).toBe(0);
    git('-c', 'fetch.unpackLimit=1', 'fetch', '-q', other, 'HEAD');
    expect(packFiles('.pack').length).toBe(1);
    const ok = verify();
    expect(ok.out).toContain('PASS');
    expect(ok.code).toBe(0);

    writeFileSync(join(other, 'data/scoreboard.json'), '{"fetched":2}\n');
    sh(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'upstream data 2'], other);
    const before = new Set(packFiles('.pack'));
    expect(snapshot().code).toBe(0);
    git('-c', 'fetch.unpackLimit=1', 'fetch', '-q', other, 'HEAD');
    const fresh = packFiles('.pack').find((p) => !before.has(p))!;
    flipByte(fresh, 30);
    const r = verify();
    expect(r.code).toBe(1);
    expect(r.out).toContain('verify-pack');
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
