/**
 * Pins the DB tool boundary (see .claude/notes/decisions.md, "DB Tool Boundary").
 *
 * These assertions fail if the permission deny block is removed, the sqlite3
 * grant is re-widened, or the enrichment allowlist reverts to bare Bash — so
 * "the boundary exists" is itself under test, the same self-defending pattern
 * as tests/prod-db-guard.test.ts.
 *
 * SECURITY_PINS_SETTINGS_PATH overrides the settings file under test so the
 * mutation gate can run against a scratchpad copy instead of disarming the
 * live configuration.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const SETTINGS_PATH = process.env.SECURITY_PINS_SETTINGS_PATH ?? join(ROOT, '.claude', 'settings.json');
const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
const allow: string[] = settings.permissions?.allow ?? [];
const deny: string[] = settings.permissions?.deny ?? [];

describe('permission allowlist', () => {
  test('no sqlite3 grant without -readonly', () => {
    expect(allow.filter((r) => r.includes('sqlite3') && !r.includes('-readonly'))).toEqual([]);
  });

  test('read-only sqlite3 grant is present (reads must stay frictionless)', () => {
    expect(allow.some((r) => r.includes('sqlite3') && r.includes('-readonly'))).toBe(true);
  });

  test('no bare find grant (find supports -delete and -exec rm)', () => {
    expect(allow.filter((r) => /^Bash\(find[ (:]/.test(r))).toEqual([]);
  });
});

describe('permission deny block', () => {
  // Deny is the only rule class an additive --allowedTools cannot out-vote.
  // Verified 2026-07-29: --disallowedTools overrode a settings allow rule.
  const REQUIRED_DENY = [
    'Bash(rm:*)',
    'Bash(mv:*)',
    'Bash(dd:*)',
    'Bash(tee:*)',
    'Bash(truncate:*)',
    'Bash(shred:*)',
    'Bash(git clean:*)',
    'Write(./data/**)',
    'Edit(./data/**)',
    'Write(./scripts/hooks/**)',
    'Edit(./scripts/hooks/**)',
    'Write(./.claude/settings.json)',
    'Edit(./.claude/settings.json)',
    'Write(./bunfig.toml)',
    'Edit(./bunfig.toml)',
    'Write(./tests/preload/**)',
    'Edit(./tests/preload/**)',
  ];

  test('every required deny rule is present', () => {
    expect(REQUIRED_DENY.filter((r) => !deny.includes(r))).toEqual([]);
  });
});
