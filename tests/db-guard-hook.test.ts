import { describe, test, expect } from 'bun:test';
import { resolve, join } from 'path';
import { verdict } from '../scripts/hooks/db-guard';

const ROOT = resolve(import.meta.dir, '..');
const HOOK = join(ROOT, 'scripts', 'hooks', 'db-guard.ts');
const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } });
const file = (tool_name: string, file_path: string) => ({ tool_name, tool_input: { file_path } });

describe('db-guard: direct destruction', () => {
  test('sqlite3 DELETE against events.db', () => {
    expect(verdict(bash('sqlite3 data/events.db "DELETE FROM events;"'))).toContain('db-guard');
  });
  test('sqlite3 DROP TABLE', () => {
    expect(verdict(bash("sqlite3 data/events.db 'DROP TABLE events'"))).toContain('db-guard');
  });
  test('sqlite3 without -readonly, even for SELECT', () => {
    expect(verdict(bash('sqlite3 data/events.db "SELECT COUNT(*) FROM events"'))).toContain('db-guard');
  });
  test('rm of the db file', () => {
    expect(verdict(bash('rm -f data/events.db'))).toContain('db-guard');
  });
  test('redirection over the db file', () => {
    expect(verdict(bash('echo corrupted > data/events.db'))).toContain('db-guard');
  });
});

describe('db-guard: bypasses that defeated the first implementation', () => {
  // Each of these returned null (allow) from the draft hook.
  test('chained command after a harmless readonly prefix', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT 1" && rm -f data/events.db'))).toContain('db-guard');
  });
  test('WAL sidecar deletion (DB runs in WAL mode; sidecars hold committed txns)', () => {
    expect(verdict(bash('rm data/events.db-wal'))).toContain('db-guard');
  });
  test('WAL sidecar via the Write tool', () => {
    expect(verdict(file('Write', 'data/events.db-wal'))).toContain('db-guard');
  });
  test('directory-level deletion with no .db substring', () => {
    expect(verdict(bash('rm -rf data'))).toContain('db-guard');
  });
  test('backups directory deletion (S194: DB loss + backup loss is the catastrophe)', () => {
    expect(verdict(bash('rm -rf ~/agent-athens-backups'))).toContain('db-guard');
  });
  test('sqlite3 dot-command shelling out under -readonly', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db ".shell rm data/events.db"'))).toContain('db-guard');
  });
  test('sqlite3 .open re-opens read-write', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db ".open data/events.db"'))).toContain('db-guard');
  });
  test('ATTACH under -readonly', () => {
    expect(verdict(bash(`sqlite3 -readonly data/events.db "ATTACH 'x.db' AS w"`))).toContain('db-guard');
  });
  test('URI filename upgrading the open mode', () => {
    expect(verdict(bash('sqlite3 -readonly "file:data/events.db?mode=rwc" "DELETE FROM events"'))).toContain('db-guard');
  });
  test('find -delete (Bash(find *) was granted until Task 1)', () => {
    expect(verdict(bash(`find . -name '*.db' -delete`))).toContain('db-guard');
  });
  test('git clean removes the gitignored DB and sidecars', () => {
    expect(verdict(bash('git clean -fdx'))).toContain('db-guard');
  });
  test('interpreter eval driving bun:sqlite', () => {
    expect(
      verdict(bash(`bun -e 'new (require("bun:sqlite").Database)("data/events.db").run("DELETE FROM events")'`)),
    ).toContain('db-guard');
  });
  test('tee as an overwrite verb', () => {
    expect(verdict(bash('tee data/events.db < /dev/null'))).toContain('db-guard');
  });
  test('clobber redirect form >|', () => {
    expect(verdict(bash('cat /dev/null >| data/events.db'))).toContain('db-guard');
  });
  test('cp over the db (silent rollback to stale data)', () => {
    expect(verdict(bash('cp old-backup.db data/events.db'))).toContain('db-guard');
  });
});

describe('db-guard: self-protection (the critical bypass)', () => {
  // Rewrite a sanctioned script, then invoke it legitimately.
  test('Write to a sanctioned enrichment script', () => {
    expect(verdict(file('Write', 'scripts/write-description.ts'))).toContain('db-guard');
  });
  test('Edit of the hook itself', () => {
    expect(verdict(file('Edit', 'scripts/hooks/db-guard.ts'))).toContain('db-guard');
  });
  test('Write to the settings file that wires the hook', () => {
    expect(verdict(file('Write', '.claude/settings.json'))).toContain('db-guard');
  });
  test('Write to the bunfig preload wiring', () => {
    expect(verdict(file('Write', 'bunfig.toml'))).toContain('db-guard');
  });
  test('MultiEdit is inspected too (matcher catches it; verdict must not ignore it)', () => {
    expect(
      verdict({ tool_name: 'MultiEdit', tool_input: { edits: [{ file_path: 'data/events.db' }] } }),
    ).toContain('db-guard');
  });
  test('NotebookEdit path field is inspected', () => {
    expect(verdict({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'data/events.db' } })).toContain('db-guard');
  });
});

describe('db-guard: legitimate work must not be blocked', () => {
  test('readonly SELECT', () => {
    expect(verdict(bash('sqlite3 -readonly data/events.db "SELECT COUNT(*) FROM events"'))).toBeNull();
  });
  test('double-dash --readonly spelling', () => {
    expect(verdict(bash('sqlite3 --readonly data/events.db "SELECT 1"'))).toBeNull();
  });
  test('the four sanctioned enrichment commands', () => {
    const sanctioned = [
      'bun run scripts/write-description.ts ev-1 --batch-dir=temp-descriptions/batch-1 "text"',
      'bun run scripts/auto-gate-check.ts temp-descriptions/batch-1/ev-1.md --tier=standard --event-id=ev-1',
      'bun run scripts/write-tags.ts ev-1 --batch-dir=temp-descriptions/batch-1 Music LiveMusic',
      'bun run scripts/save-batch.ts --manifest=temp-briefs/batch-1.manifest.json --session=batch-1 --batch=1 --clean',
    ];
    for (const c of sanctioned) expect(verdict(bash(c))).toBeNull();
  });
  test('concerns.jsonl write in the batch dir', () => {
    expect(verdict(file('Write', 'temp-descriptions/batch-1/concerns.jsonl'))).toBeNull();
  });
  test('ordinary shell and source edits', () => {
    expect(verdict(bash('ls -la temp-descriptions'))).toBeNull();
    expect(verdict(file('Edit', 'src/generate-site.ts'))).toBeNull();
    expect(verdict(file('Edit', '.claude/notes/mistakes.md'))).toBeNull();
  });
  test('non-file tools are ignored', () => {
    expect(verdict({ tool_name: 'WebSearch', tool_input: { query: 'venue events.db' } })).toBeNull();
  });
});

describe('db-guard: process contract', () => {
  const run = (payload: unknown, env?: Record<string, string>) =>
    Bun.spawnSync(['bun', 'run', HOOK], {
      stdin: new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload)),
      env: { ...process.env, ...env },
    });

  test('exit 2 and a stderr reason when blocking', () => {
    const r = run({ tool_name: 'Bash', tool_input: { command: 'sqlite3 data/events.db "DELETE FROM events"' } });
    expect(r.exitCode).toBe(2);
    expect(new TextDecoder().decode(r.stderr)).toContain('db-guard');
  });

  test('exit 0 when allowing', () => {
    expect(run({ tool_name: 'Bash', tool_input: { command: 'ls -la' } }).exitCode).toBe(0);
  });

  test('unparseable stdin fails closed', () => {
    expect(run('this is not json').exitCode).toBe(2);
  });

  test('missing tool_input fails closed rather than throwing', () => {
    expect(run({ tool_name: 'Bash' }).exitCode).toBe(2);
  });
});
