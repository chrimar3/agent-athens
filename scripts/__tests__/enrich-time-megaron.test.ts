/**
 * extractTimeMegaron — reads the clock time for ONE date from a megaron.gr
 * detail page's "ΗΜΕΡΕΣ ΚΑΙ ΩΡΕΣ" block. The listing page states no times, so
 * this is the only honest source; when the row's own date carries no time the
 * answer is null, never a neighbouring night's time.
 *
 * Fixtures are trimmed from real pages fetched 2026-09-22.
 */

import { describe, test, expect } from 'bun:test';
import { extractTimeMegaron } from '../enrich-time';

const SINGLE_DATE = `
<li><div class="flex"><div class="left upprecase">
    ΗΜΕΡΕΣ ΚΑΙ ΩΡΕΣ
</div><div class="right">
  <a href="https://webtics.megaron.gr/el/events/?eventid=3953" target="_blank">
      Δευτέρα 28.9.2026
        -
          19:00
  </a>
</div></div></li>
<li><div class="flex"><div class="left upprecase">
    ΔΙΑΡΚΕΙΑ
</div><div class="right">120’ περίπου</div></div></li>`;

const MULTI_DATE = `
<div class="left upprecase">ΗΜΕΡΕΣ ΚΑΙ ΩΡΕΣ</div>
<div class="right"><div class="tab"><div class="tab__title"><div class="flex"><div class="left">
<h3>5.5.2026 έως 18.12.2026</h3></div><div class="right"><div class="tab-open">[+]</div><div class="tab-close">[-]</div></div></div></div>
<div class="tab__content"><ul>
<li>Τρίτη 5.5.2026 - 18:30</li>
<li>Δευτέρα 1.6.2026 - 10:00</li>
</ul></div></div></div>`;

// A page whose header "Σήμερα στο Μέγαρο" strip shows another event's time —
// text outside the dates block must never be read.
const TIME_OUTSIDE_BLOCK = `
<div class="today-strip">Σήμερα στο Μέγαρο: Άλλη εκδήλωση 28.9.2026 - 21:00</div>
<div class="left upprecase">ΗΜΕΡΕΣ ΚΑΙ ΩΡΕΣ</div>
<div class="right"><h3>28.9.2026 έως 30.9.2026</h3></div>
<div class="left upprecase">ΔΙΑΡΚΕΙΑ</div>`;

describe('extractTimeMegaron', () => {
  test('single-date page: returns the stated time for that date', () => {
    expect(extractTimeMegaron(SINGLE_DATE, '2026-09-28')?.timeDoors).toBe('19:00');
  });

  test('multi-date page: picks the time listed against the row date', () => {
    expect(extractTimeMegaron(MULTI_DATE, '2026-06-01')?.timeDoors).toBe('10:00');
    expect(extractTimeMegaron(MULTI_DATE, '2026-05-05')?.timeDoors).toBe('18:30');
  });

  test('row date absent from the block → null (no borrowing another night)', () => {
    expect(extractTimeMegaron(MULTI_DATE, '2026-07-01')).toBeNull();
  });

  test('a time outside the dates block is ignored', () => {
    expect(TIME_OUTSIDE_BLOCK).toMatch(/28\.9\.2026 - 21:00/); // fixture precondition
    expect(extractTimeMegaron(TIME_OUTSIDE_BLOCK, '2026-09-28')).toBeNull();
  });

  test('day 1 does not match inside day 11', () => {
    const block = '<div>ΗΜΕΡΕΣ ΚΑΙ ΩΡΕΣ</div><div>Πέμπτη 11.6.2026 - 21:00</div>';
    expect(extractTimeMegaron(block, '2026-06-01')).toBeNull();
  });

  test('page without a dates block → null', () => {
    expect(extractTimeMegaron('<html><body>Δευτέρα 28.9.2026 - 19:00</body></html>', '2026-09-28')).toBeNull();
  });

  test('accepts a start_date carrying a clock component', () => {
    expect(extractTimeMegaron(SINGLE_DATE, '2026-09-28T20:30:00')?.timeDoors).toBe('19:00');
  });
});
