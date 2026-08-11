import { describe, test, expect } from 'bun:test';
import { evaluateGate } from '../scripts/phase1-exit-gate';

const deployLog = (dates: string[]) => dates.map((d) => `${d}T08:30:00Z deploy-success`).join('\n');
const week = ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'];

describe('phase1 exit gate', () => {
  test('7 green days → PASS', () => {
    const r = evaluateGate({ deployLog: deployLog(week), enrichDays: week, pushedThrough: '2026-08-18', today: '2026-08-19' });
    expect(r.pass).toBe(true);
    expect(r.days).toHaveLength(7);
  });

  test('one missing deploy day → FAIL (consecutive means consecutive)', () => {
    const r = evaluateGate({
      deployLog: deployLog(week.filter((d) => d !== '2026-08-15')),
      enrichDays: week,
      pushedThrough: '2026-08-18',
      today: '2026-08-19',
    });
    expect(r.pass).toBe(false);
  });

  test('enrichment zero on one day → FAIL', () => {
    const r = evaluateGate({ deployLog: deployLog(week), enrichDays: week.slice(1), pushedThrough: '2026-08-18', today: '2026-08-19' });
    expect(r.pass).toBe(false);
  });

  test('stale origin/main → FAIL', () => {
    const r = evaluateGate({ deployLog: deployLog(week), enrichDays: week, pushedThrough: '2026-08-10', today: '2026-08-19' });
    expect(r.pass).toBe(false);
  });
});
