import { describe, test, expect } from 'bun:test';
import { renderQueue, type QueueInputs } from '../scripts/decisions-queue';

// The queue is COMPUTED and SELF-CLEARING: an entry exists only while its
// predicate holds. Both directions are pinned — an entry that appears when it
// should, and the SAME item vanishing once the underlying thing is fixed —
// because a queue that can't clear itself becomes a stale to-do list nobody
// trusts (the '20 new unverified venues' alert repeated for weeks, S222).
const base: QueueInputs = {
  addressProposals: [],
  configuredVenues: new Set<string>(),
  quarantined: {},
  upcomingConcerns: [],
  operatorOneTimers: [],
};

describe('renderQueue self-clearing', () => {
  test('addressless proposal renders an entry with the proposed address', () => {
    const md = renderQueue({
      ...base,
      addressProposals: [
        { venue: 'HOOD art space', proposedAddress: 'Polykleitou 21, Athens', geocodeConfidence: 'high', locationType: 'ROOFTOP', since: '2026-08-11' },
      ],
    });
    expect(md).toContain('HOOD art space');
    expect(md).toContain('Polykleitou 21');
  });

  test('the SAME venue with a config address renders nothing (self-clearing)', () => {
    const md = renderQueue({
      ...base,
      addressProposals: [
        { venue: 'HOOD art space', proposedAddress: 'Polykleitou 21, Athens', geocodeConfidence: 'high', locationType: 'ROOFTOP', since: '2026-08-11' },
      ],
      configuredVenues: new Set(['HOOD art space']),
    });
    expect(md).not.toContain('HOOD art space');
  });

  test('quarantined source renders with since-date and un-quarantine instruction', () => {
    const md = renderQueue({
      ...base,
      quarantined: { clubber: { since: '2026-08-11', reason: 'captcha wall' } },
    });
    expect(md).toContain('clubber');
    expect(md).toContain('2026-08-11');
    expect(md).toContain('quarantined-sources.json');
  });

  test('upcoming venue-mismatch concern renders with event id', () => {
    const md = renderQueue({
      ...base,
      upcomingConcerns: [{ event_id: 'ev-123', concern_type: 'venue-mismatch-or-unknown', concern_text: 'DB says Kypseli, venue is Drapetsona' }],
    });
    expect(md).toContain('ev-123');
    expect(md).toContain('Drapetsona');
  });

  test('empty inputs render a well-formed "Nothing pending" document (never a missing file)', () => {
    const md = renderQueue(base);
    expect(md).toContain('COMPUTED by scripts/decisions-queue.ts');
    expect(md).toContain('Nothing pending');
  });

  test('validator date proposals render with proposed date and count in total', () => {
    const md = renderQueue({
      ...base,
      dateProposals: [
        { event_id: 'ev-roll', title: 'Παλιό έργο', current_start: '2027-07-09', proposed_date: '2026-09-02', concern: 'correct to 2026-09-02' },
      ],
    });
    expect(md).toContain('ev-roll');
    expect(md).toContain('2026-09-02');
    expect(md).toContain('**Pending: 1**');
  });

  test('operator one-timers render until marked done in the registry', () => {
    const md = renderQueue({
      ...base,
      operatorOneTimers: [{ id: 'github-app', summary: 'Install the Claude GitHub App (PHASE3.md §5 step 1)', done: false }],
    });
    expect(md).toContain('GitHub App');
    const cleared = renderQueue({
      ...base,
      operatorOneTimers: [{ id: 'github-app', summary: 'Install the Claude GitHub App (PHASE3.md §5 step 1)', done: true }],
    });
    expect(cleared).not.toContain('GitHub App');
  });
});
