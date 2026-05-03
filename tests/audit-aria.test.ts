/**
 * Sprint 2 Component C — audit-aria.ts unit tests.
 *
 * Covers the pure classification + aggregation logic. The Pa11y subprocess
 * + filesystem discovery layer is verified end-to-end at Step 5 (full
 * audit run against dist/), not unit-tested.
 */

import { describe, it, expect } from 'bun:test';
import {
  classify,
  emptyGroup,
  tallyAggregate,
  type Pa11yIssue,
} from '../scripts/audit-aria';

function mkIssue(type: 'error' | 'warning' | 'notice'): Pa11yIssue {
  return {
    code: 'WCAG2AA.fake',
    type,
    typeCode: type === 'error' ? 1 : type === 'warning' ? 2 : 3,
    message: 'fake',
    context: '<div></div>',
    selector: 'div',
    runner: 'htmlcs',
    runnerExtras: {},
  };
}

describe('classify', () => {
  it('returns pass for empty issues array', () => {
    expect(classify([])).toBe('pass');
  });

  it('returns fail when any issue is error', () => {
    expect(
      classify([mkIssue('warning'), mkIssue('error'), mkIssue('notice')]),
    ).toBe('fail');
  });

  it('returns warn for warnings only', () => {
    expect(classify([mkIssue('warning'), mkIssue('warning')])).toBe('warn');
  });

  it('returns warn for notices only', () => {
    expect(classify([mkIssue('notice')])).toBe('warn');
  });

  it('returns warn for mix of warning + notice (no errors)', () => {
    expect(classify([mkIssue('warning'), mkIssue('notice')])).toBe('warn');
  });
});

describe('emptyGroup', () => {
  it('returns zeroed PageGroupReport', () => {
    expect(emptyGroup()).toEqual({ total: 0, pass: 0, warn: 0, fail: 0 });
  });
});

describe('tallyAggregate', () => {
  it('increments total + verdict bucket for pass/warn/fail', () => {
    const g = emptyGroup();
    tallyAggregate(g, 'pass');
    tallyAggregate(g, 'warn');
    tallyAggregate(g, 'fail');
    tallyAggregate(g, 'pass');
    expect(g).toEqual({ total: 4, pass: 2, warn: 1, fail: 1 });
  });

  it('skips audit_error — does not increment any counter', () => {
    const g = emptyGroup();
    tallyAggregate(g, 'pass');
    tallyAggregate(g, 'audit_error');
    tallyAggregate(g, 'audit_error');
    expect(g).toEqual({ total: 1, pass: 1, warn: 0, fail: 0 });
  });
});

describe('per-template aggregation scenario', () => {
  it('10 hub pages all pass, 5 event pages mixed → correct per-template totals', () => {
    const hubAgg = emptyGroup();
    const eventAgg = emptyGroup();

    for (let i = 0; i < 10; i++) tallyAggregate(hubAgg, 'pass');

    tallyAggregate(eventAgg, 'pass');
    tallyAggregate(eventAgg, 'pass');
    tallyAggregate(eventAgg, 'pass');
    tallyAggregate(eventAgg, 'warn');
    tallyAggregate(eventAgg, 'warn');

    expect(hubAgg).toEqual({ total: 10, pass: 10, warn: 0, fail: 0 });
    expect(eventAgg).toEqual({ total: 5, pass: 3, warn: 2, fail: 0 });
  });

  it('audit_error pages do not pollute aggregate counts', () => {
    const agg = emptyGroup();
    tallyAggregate(agg, 'pass');
    tallyAggregate(agg, 'pass');
    tallyAggregate(agg, 'audit_error');
    tallyAggregate(agg, 'warn');
    tallyAggregate(agg, 'audit_error');
    expect(agg).toEqual({ total: 3, pass: 2, warn: 1, fail: 0 });
  });
});
