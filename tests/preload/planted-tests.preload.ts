/**
 * Planted-test guard — preload (security loop round 9).
 *
 * WHY: a plain `bun test` discovers every *.test.* / *_test.* / *.spec.* /
 * *_spec.* file under the working directory and runs it on this machine,
 * including files in the folders the container writes (data/, logs/, dist/,
 * tmp/, tmp*\/, temp*\/). bunfig.toml's [test].pathIgnorePatterns keeps those
 * folders out of discovery on bun 1.3.11, but bun 1.3.0 ignores the key
 * silently, so this preload is the version-independent layer: loaded FIRST
 * (before any test file), it walks those folders and exits the process when a
 * test-named file is there. process.exit in a preload stops the run before the
 * first test file loads (verified on bun 1.3.0 and 1.3.11); a throw would not
 * (bun reports the error and runs the files anyway).
 *
 * Symlinked directories are followed (bun's discovery follows them), with a
 * visited set, a depth cap and an entry cap; hitting a cap refuses too.
 */
import { readdirSync, statSync, type Dirent } from 'fs';
import { join, relative, resolve } from 'path';

const ROOT = resolve(import.meta.dir, '../..');
const TEST_NAME = /[._](test|spec)\.[cm]?[jt]sx?$/i;
const WRITABLE = /^(data|logs|dist|tmp.*|temp.*)$/i;
const MAX_ENTRIES = 500_000;
const MAX_DEPTH = 64;

const found: string[] = [];
const visited = new Set<string>();
let seen = 0;
let overflow = '';

function walk(dir: string, depth: number): void {
  if (overflow) return;
  if (depth > MAX_DEPTH) { overflow = `deeper than ${MAX_DEPTH} levels at ${dir}`; return; }
  let key: string;
  try { const st = statSync(dir); key = `${st.dev}:${st.ino}`; } catch { return; }
  if (visited.has(key)) return;
  visited.add(key);
  let entries: Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (++seen > MAX_ENTRIES) { overflow = `more than ${MAX_ENTRIES} entries`; return; }
    const p = join(dir, e.name);
    if (TEST_NAME.test(e.name)) { found.push(p); continue; } // file, link, FIFO: never opened
    if (e.name === 'node_modules') continue;
    if (e.isDirectory()) walk(p, depth + 1);
    else if (e.isSymbolicLink()) {
      try { if (statSync(p).isDirectory()) walk(p, depth + 1); } catch { /* dangling */ }
    }
  }
}

let top: string[] = [];
try { top = readdirSync(ROOT).filter(n => WRITABLE.test(n)); } catch { /* unreadable root: bun cannot discover either */ }
for (const n of top) walk(join(ROOT, n), 0);

const inert = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').slice(0, 200);

if (found.length > 0 || overflow) {
  const lines = [
    overflow
      ? `[planted-tests] REFUSED — could not finish scanning the container-writable folders (${overflow}); bun test would run what it finds there.`
      : '[planted-tests] REFUSED — test files found in container-writable folders (bun test would run them on this machine):',
    ...found.slice(0, 20).map(p => `  ${inert(relative(ROOT, p))}`),
    'Nothing in the project writes test files there: inspect them as a possible compromise, delete them (or the link that leads to them), then run `bun run test` again.',
  ];
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(1);
}
