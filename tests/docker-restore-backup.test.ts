// docker/restore-backup.sh: a good backup replaces data/events.db and keeps the
// previous file; a corrupt or empty backup changes nothing.
import { beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs';
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

const run = (...args: string[]) => {
  const r = Bun.spawnSync(['bash', SCRIPT, ...args], {
    env: { ...process.env, AA_RESTORE_REPO: repo, AA_BACKUPS_DIR: backups, AA_STATE_DIR: state, AA_RESTORE_CHECK: checker },
  });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aa-restore-'));
  repo = join(root, 'repo');
  backups = join(root, 'backups');
  state = join(root, 'state');
  mkdirSync(join(repo, 'data'), { recursive: true });
  mkdirSync(backups);
  writeFileSync(join(repo, 'data/events.db'), 'live-db-bytes');
  // Stand-in for the container check: same query, run locally.
  checker = join(root, 'check.sh');
  writeFileSync(checker, '#!/bin/bash\nsqlite3 -readonly "$1" "PRAGMA integrity_check; SELECT COUNT(*) FROM events;"\n');
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

  test('an empty events table is refused', () => {
    const tmp = join(root, 'empty.sqlite');
    makeDb(tmp, 0);
    writeFileSync(join(backups, 'events-2026-09-03-0800.db.gz'), gzipSync(readFileSync(tmp)));
    const r = run();
    expect(r.code).toBe(1);
    expect(readFileSync(join(repo, 'data/events.db'), 'utf8')).toBe('live-db-bytes');
  });
});
