/**
 * COPIED_SCRIPT_ALLOWLIST pins the script files the build copies into dist/.
 * Recomputed here from their sources, so a dependency update fails with the
 * new hash (review the upstream diff before replacing it), and the build's
 * copy list and the allowlist cannot drift apart.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { COPIED_SCRIPT_ALLOWLIST } from '../../src/validators/inline-script-allowlist';

const REPO = join(import.meta.dir, '../..');

describe('copied-script allowlist', () => {
  test('every entry matches its source file', () => {
    const actual = COPIED_SCRIPT_ALLOWLIST.map(e => ({
      path: e.path,
      sha256: createHash('sha256').update(readFileSync(join(REPO, e.source.split(' ')[0]))).digest('hex'),
    }));
    expect(actual).toEqual(COPIED_SCRIPT_ALLOWLIST.map(e => ({ path: e.path, sha256: e.sha256 })));
  });

  test('the build copies exactly the listed script files', () => {
    const build = readFileSync(join(REPO, 'src/generate-site.ts'), 'utf-8');
    const copiedScripts = [...build.matchAll(/join\(DIST_DIR,\s*'([^']+\.(?:m?js|cjs))'\)/g)].map(m => m[1]).sort();
    expect(copiedScripts).toEqual(COPIED_SCRIPT_ALLOWLIST.map(e => e.path).sort());
  });
});
