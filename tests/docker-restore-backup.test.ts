// docker/restore-backup.sh: a good backup replaces data/events.db and keeps the
// previous file; a corrupt or empty backup changes nothing.
import { beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';

const SCRIPT = join(import.meta.dir, '../docker/restore-backup.sh');
let root: string;
let repo: string;
let backups: string;
let state: string;
let checker: string;

function makeDb(path: string, rows: number) {
  const db = new Database(path, { create: true });
  db.run('CREATE TABLE events (id TEXT)');
  for (let i = 0; i < rows; i++) db.run('INSERT INTO events VALUES (?)', [`e${i}`]);
  db.close();
}

let current = '0';
const run = (...args: string[]) => {
  const r = Bun.spawnSync(['bash', SCRIPT, ...args], {
    env: { ...process.env, AA_RESTORE_REPO: repo, AA_BACKUPS_DIR: backups, AA_STATE_DIR: state, AA_RESTORE_CHECK: checker, AA_TEST_CURRENT: current },
  });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
};

beforeEach(() => {
  current = '0';
  root = mkdtempSync(join(tmpdir(), 'aa-restore-'));
  repo = join(root, 'repo');
  backups = join(root, 'backups');
  state = join(root, 'state');
  mkdirSync(join(repo, 'data'), { recursive: true });
  mkdirSync(backups);
  writeFileSync(join(repo, 'data/events.db'), 'live-db-bytes');
  // Stand-in for the container check: same query, run locally.
  checker = join(root, 'check.sh');
  writeFileSync(checker, '#!/bin/bash\nsqlite3 -readonly "$1" "PRAGMA integrity_check; SELECT COUNT(*) FROM events;"\necho "CURRENT=${AA_TEST_CURRENT:-0}"\n');
  chmodSync(checker, 0o755);
});

describe('restore-backup.sh', () => {
  test('restores a good backup and keeps the replaced database', () => {
    const tmp = join(root, 'good.sqlite');
    makeDb(tmp, 3);
    writeFileSync(join(backups, 'events-2026-09-01-0800.db.gz'), gzipSync(readFileSync(tmp)));
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toContain('3 events');
    expect(readFileSync(join(repo, 'data/events.db'))).toEqual(readFileSync(tmp));
    const kept = readdirSync(join(state, 'replaced'));
    expect(kept.length).toBe(1);
    expect(readFileSync(join(state, 'replaced', kept[0]), 'utf8')).toBe('live-db-bytes');
  });

  test('a corrupt backup changes nothing', () => {
    writeFileSync(join(backups, 'events-2026-09-02-0800.db.gz'), gzipSync(Buffer.from('not a database')));
    const r = run();
    expect(r.code).toBe(1);
    expect(readFileSync(join(repo, 'data/events.db'), 'utf8')).toBe('live-db-bytes');
    expect(existsSync(join(repo, 'data/events.db.restore-candidate'))).toBe(false);
  });

  test('a backup whose bytes no longer match SHA256SUMS is refused', () => {
    const tmp = join(root, 'good.sqlite');
    makeDb(tmp, 3);
    const name = 'events-2026-09-04-0800.db.gz';
    writeFileSync(join(backups, name), gzipSync(readFileSync(tmp)));
    writeFileSync(join(backups, 'SHA256SUMS'), `${'0'.repeat(64)}  ${name}\n`);
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('SHA-256');
    expect(readFileSync(join(repo, 'data/events.db'), 'utf8')).toBe('live-db-bytes');
  });

  test('a backup with far fewer events than the live database needs --force', () => {
    const tmp = join(root, 'small.sqlite');
    makeDb(tmp, 3);
    writeFileSync(join(backups, 'events-2026-09-05-0800.db.gz'), gzipSync(readFileSync(tmp)));
    current = '100';
    const refused = run();
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('under 70%');
    expect(readFileSync(join(repo, 'data/events.db'), 'utf8')).toBe('live-db-bytes');
    expect(run('--force').code).toBe(0);
  });

  test('an empty events table is refused', () => {
    const tmp = join(root, 'empty.sqlite');
    makeDb(tmp, 0);
    writeFileSync(join(backups, 'events-2026-09-03-0800.db.gz'), gzipSync(readFileSync(tmp)));
    const r = run();
    expect(r.code).toBe(1);
    expect(readFileSync(join(repo, 'data/events.db'), 'utf8')).toBe('live-db-bytes');
  });
});

// data/ is written by containers: a symlink planted where the restore writes
// (the candidate, its -wal, the live database) would redirect the Mac's write
// anywhere in the home folder. And a quarantine pauses restores too.
describe('restore-backup.sh refuses planted paths and quarantines', () => {
  const goodBackup = (name = 'events-2026-09-06-0800.db.gz') => {
    const tmp = join(root, 'good.sqlite');
    makeDb(tmp, 3);
    writeFileSync(join(backups, name), gzipSync(readFileSync(tmp)));
    return tmp;
  };
  const outside = () => join(root, 'outside-target');

  for (const rel of ['events.db.restore-candidate', 'events.db.restore-candidate-wal', 'events.db.restore-candidate-shm', 'events.db', 'events.db-wal', 'events.db-shm']) {
    test(`a symlink at data/${rel} is refused and nothing is written through it`, () => {
      goodBackup();
      writeFileSync(join(backups, 'events-2026-09-06-0800.db-wal.gz'), gzipSync(Buffer.from('wal bytes')));
      writeFileSync(outside(), 'precious\n');
      const p = join(repo, 'data', rel);
      if (rel === 'events.db') unlinkSync(p);
      symlinkSync(outside(), p);
      const r = run();
      expect(r.code).toBe(2);
      expect(r.out).toContain('is a symlink or not a regular file');
      expect(readFileSync(outside(), 'utf8')).toBe('precious\n');
      expect(lstatSync(p).isSymbolicLink()).toBe(true);
      expect(existsSync(join(state, 'replaced'))).toBe(false);
    });
  }

  test('a symlink to a folder at the candidate path is refused (mv would move into it)', () => {
    goodBackup();
    mkdirSync(join(root, 'elsewhere'));
    symlinkSync(join(root, 'elsewhere'), join(repo, 'data/events.db.restore-candidate'));
    expect(run().code).toBe(2);
    expect(readdirSync(join(root, 'elsewhere'))).toEqual([]);
  });

  test.skipIf(process.platform === 'win32')('a FIFO at the candidate path is refused', () => {
    goodBackup();
    expect(Bun.spawnSync(['mkfifo', join(repo, 'data/events.db.restore-candidate')]).exitCode).toBe(0);
    const r = run();
    expect(r.code).toBe(2);
    expect(r.out).toContain('not a regular file');
  });

  test('data/ itself being a symlink is refused', () => {
    goodBackup();
    const real = join(root, 'real-data');
    renameSync(join(repo, 'data'), real);
    symlinkSync(real, join(repo, 'data'));
    const r = run();
    expect(r.code).toBe(2);
    expect(r.out).toContain('is not a plain folder');
    expect(readdirSync(real).sort()).toEqual(['events.db']);
  });

  test('stale regular candidates are replaced, and no temporary file is left behind', () => {
    const tmp = goodBackup();
    writeFileSync(join(repo, 'data/events.db.restore-candidate'), 'stale');
    writeFileSync(join(repo, 'data/events.db.restore-candidate-wal'), 'stale wal');
    writeFileSync(join(repo, 'data/events.db.restore-candidate-shm'), 'stale shm');
    const r = run();
    expect(r.code).toBe(0);
    expect(readFileSync(join(repo, 'data/events.db'))).toEqual(readFileSync(tmp));
    expect(readdirSync(join(repo, 'data')).sort()).toEqual(['events.db']);
  });

  test('refuses while the pipeline is quarantined, printing the quarantine; --force-under-quarantine goes ahead', () => {
    const tmp = goodBackup();
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, 'QUARANTINE'), 'Quarantined at 20260924-0800 after job "freshness": planted file\n');
    const refused = run();
    expect(refused.code).toBe(2);
    expect(refused.out).toContain('refusing to restore while');
    expect(refused.out).toContain('planted file');
    expect(refused.out).toContain('--force-under-quarantine');
    expect(readFileSync(join(repo, 'data/events.db'), 'utf8')).toBe('live-db-bytes');
    expect(existsSync(join(repo, 'data/events.db.restore-candidate'))).toBe(false);

    const forced = run('--force-under-quarantine');
    expect(forced.code).toBe(0);
    expect(forced.out).toContain('planted file');
    expect(readFileSync(join(repo, 'data/events.db'))).toEqual(readFileSync(tmp));
    expect(existsSync(join(state, 'QUARANTINE'))).toBe(true); // stays in place
  });

  test('without a check command, a forced restore asks aa-run.sh for its one shell under the quarantine', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    expect(script).toMatch(/\[ "\$FORCE_QUARANTINE" = "yes" \] && qenv=1\n\s+out="\$\(AA_RESTORE_UNDER_QUARANTINE="\$qenv" bash "\$HERE\/aa-run\.sh" shell -c/);
    const wrapper = readFileSync(join(import.meta.dir, '../docker/aa-run.sh'), 'utf8');
    expect(wrapper).toContain('if [ "$JOB" != "shell" ] || [ "${AA_RESTORE_UNDER_QUARANTINE:-}" != "1" ]; then');
  });

  test('an unknown option is refused', () => {
    goodBackup();
    expect(run('--frce').code).toBe(2);
    expect(readFileSync(join(repo, 'data/events.db'), 'utf8')).toBe('live-db-bytes');
  });
});
