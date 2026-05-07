// Unit tests for the S110f gate-rules loader.
import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadGateRules,
  loadOverrides,
  isHardStopConcern,
  isOverridden,
  getUnknownConcernTypes,
  _clearCachesForTesting,
  type GateRulesData,
  type OverrideEntry,
} from '../load-gate-rules';

const FIXTURE_DIR = tmpdir();
const fixturePaths: string[] = [];

function writeFixture(name: string, content: string): string {
  const path = join(FIXTURE_DIR, `s110f-${name}-${process.pid}-${Date.now()}.yml`);
  writeFileSync(path, content, 'utf-8');
  fixturePaths.push(path);
  return path;
}

afterAll(() => {
  for (const p of fixturePaths) {
    if (existsSync(p)) unlinkSync(p);
  }
});

beforeEach(() => {
  _clearCachesForTesting();
});

describe('loadGateRules — production file', () => {
  test('loads the real config/enrichment-gate-rules.yml without error', () => {
    const data = loadGateRules();
    expect(data.version).toBe(1);
    expect(data.hardstop_enabled).toBe(true);
    expect(data.rules.length).toBeGreaterThan(0);
    expect(data.rules.every(r => r.tier === 'A0' || r.tier === 'B')).toBe(true);
  });
});

describe('isHardStopConcern', () => {
  test('returns true for tier A0 concern when hardstop_enabled', () => {
    const rules: GateRulesData = {
      version: 1,
      hardstop_enabled: true,
      rules: [{ concern_type: 'venue-mismatch-or-unknown', tier: 'A0', rationale: '' }],
      sourceFile: 'test',
    };
    expect(isHardStopConcern('venue-mismatch-or-unknown', rules)).toBe(true);
  });

  test('returns false for tier B concern (soft flag)', () => {
    const rules: GateRulesData = {
      version: 1,
      hardstop_enabled: true,
      rules: [{ concern_type: 'word-count-overshoot', tier: 'B', rationale: '' }],
      sourceFile: 'test',
    };
    expect(isHardStopConcern('word-count-overshoot', rules)).toBe(false);
  });

  test('returns false for unknown concern_type (does not block)', () => {
    const rules: GateRulesData = {
      version: 1,
      hardstop_enabled: true,
      rules: [{ concern_type: 'venue-mismatch-or-unknown', tier: 'A0', rationale: '' }],
      sourceFile: 'test',
    };
    expect(isHardStopConcern('totally-made-up-concern', rules)).toBe(false);
  });

  test('kill switch disabled: returns false even for tier A0', () => {
    const rules: GateRulesData = {
      version: 1,
      hardstop_enabled: false,
      rules: [
        { concern_type: 'venue-mismatch-or-unknown', tier: 'A0', rationale: '' },
        { concern_type: 'date-conflict-or-unparseable', tier: 'A0', rationale: '' },
      ],
      sourceFile: 'test',
    };
    expect(isHardStopConcern('venue-mismatch-or-unknown', rules)).toBe(false);
    expect(isHardStopConcern('date-conflict-or-unparseable', rules)).toBe(false);
  });
});

describe('isOverridden', () => {
  test('matches per (event_id, concern_type) tuple — same event, listed concern bypasses', () => {
    const overrides: OverrideEntry[] = [
      {
        event_id: 'evt1',
        concern_types: ['venue-mismatch-or-unknown'],
        reason: 'transliteration false-positive',
        approved_by: 'tester',
        approved_at: '2026-05-06',
      },
    ];
    expect(isOverridden('evt1', 'venue-mismatch-or-unknown', overrides)).toBe(true);
  });

  test('matches per tuple — same event, different concern still hard-stops', () => {
    const overrides: OverrideEntry[] = [
      {
        event_id: 'evt1',
        concern_types: ['venue-mismatch-or-unknown'],
        reason: 'transliteration false-positive',
        approved_by: 'tester',
        approved_at: '2026-05-06',
      },
    ];
    expect(isOverridden('evt1', 'date-conflict-or-unparseable', overrides)).toBe(false);
  });

  test('empty overrides list returns false (default state)', () => {
    expect(isOverridden('evt1', 'venue-mismatch-or-unknown', [])).toBe(false);
  });

  test('different event_id does not match', () => {
    const overrides: OverrideEntry[] = [
      {
        event_id: 'evt1',
        concern_types: ['venue-mismatch-or-unknown'],
        reason: '',
        approved_by: 't',
        approved_at: '2026-05-06',
      },
    ];
    expect(isOverridden('evt2', 'venue-mismatch-or-unknown', overrides)).toBe(false);
  });
});

describe('getUnknownConcernTypes', () => {
  test('returns concern_types emitted by agent that are not in rules YAML', () => {
    const rules: GateRulesData = {
      version: 1,
      hardstop_enabled: true,
      rules: [
        { concern_type: 'venue-mismatch-or-unknown', tier: 'A0', rationale: '' },
        { concern_type: 'word-count-overshoot', tier: 'B', rationale: '' },
      ],
      sourceFile: 'test',
    };
    const emitted = ['venue-mismatch-or-unknown', 'word-count-overshoot', 'made-up-1', 'made-up-2'];
    const unknown = getUnknownConcernTypes(emitted, rules);
    expect(unknown.sort()).toEqual(['made-up-1', 'made-up-2']);
  });

  test('deduplicates repeated unknown types', () => {
    const rules: GateRulesData = {
      version: 1,
      hardstop_enabled: true,
      rules: [],
      sourceFile: 'test',
    };
    expect(getUnknownConcernTypes(['x', 'x', 'y', 'x'], rules).sort()).toEqual(['x', 'y']);
  });

  test('returns empty array when all emitted types are known', () => {
    const rules: GateRulesData = {
      version: 1,
      hardstop_enabled: true,
      rules: [{ concern_type: 'a', tier: 'A0', rationale: '' }],
      sourceFile: 'test',
    };
    expect(getUnknownConcernTypes(['a', 'a'], rules)).toEqual([]);
  });
});

describe('loadGateRules — failure modes', () => {
  test('missing file: returns empty rules + hardstop_enabled=false (does not silently filter)', () => {
    const data = loadGateRules('/nonexistent/path/to/rules.yml');
    expect(data.rules).toEqual([]);
    expect(data.hardstop_enabled).toBe(false);
    expect(data.sourceFile).toBe('fallback');
  });

  test('malformed YAML: same fallback', () => {
    const path = writeFixture('malformed-rules', 'this: is: not: valid: yaml: ::');
    const data = loadGateRules(path);
    expect(data.hardstop_enabled).toBe(false);
  });

  test('rule with unknown tier is downgraded to B (does not crash loader)', () => {
    const path = writeFixture(
      'unknown-tier',
      `version: 1
rules:
  - concern_type: weird-rule
    tier: Z9
    rationale: malformed
hardstop_enabled: true
`,
    );
    const data = loadGateRules(path);
    expect(data.rules.length).toBe(1);
    expect(data.rules[0].tier).toBe('B');
    expect(isHardStopConcern('weird-rule', data)).toBe(false);
  });
});

describe('loadOverrides — production file + edge cases', () => {
  test('loads the real config/enrichment-overrides.yml as empty array (default state)', () => {
    const overrides = loadOverrides();
    expect(Array.isArray(overrides)).toBe(true);
    expect(overrides.length).toBe(0);
  });

  test('parses a populated overrides fixture', () => {
    const path = writeFixture(
      'populated-overrides',
      `version: 1
overrides:
  - event_id: evt-abc
    concern_types: [venue-mismatch-or-unknown, neighborhood-mismatch]
    reason: Verified by hand on 2026-05-06
    approved_by: tester
    approved_at: 2026-05-06
`,
    );
    const overrides = loadOverrides(path);
    expect(overrides.length).toBe(1);
    expect(overrides[0].event_id).toBe('evt-abc');
    expect(overrides[0].concern_types).toEqual(['venue-mismatch-or-unknown', 'neighborhood-mismatch']);
  });

  test('missing overrides file: returns empty array', () => {
    const overrides = loadOverrides('/nonexistent/path/to/overrides.yml');
    expect(overrides).toEqual([]);
  });
});

describe('caching', () => {
  test('rules cache is path-keyed: different paths yield independent results', () => {
    const pathA = writeFixture(
      'cache-a',
      `version: 1
rules:
  - concern_type: a-rule
    tier: A0
    rationale: ""
hardstop_enabled: true
`,
    );
    const pathB = writeFixture(
      'cache-b',
      `version: 1
rules:
  - concern_type: b-rule
    tier: B
    rationale: ""
hardstop_enabled: true
`,
    );
    const a = loadGateRules(pathA);
    const b = loadGateRules(pathB);
    expect(a.rules[0].concern_type).toBe('a-rule');
    expect(b.rules[0].concern_type).toBe('b-rule');
  });

  test('repeated load of same path returns cached object (identity check)', () => {
    const path = writeFixture(
      'cache-same',
      `version: 1
rules: []
hardstop_enabled: true
`,
    );
    const first = loadGateRules(path);
    const second = loadGateRules(path);
    expect(first).toBe(second);
  });
});
