/**
 * Tests for scripts/scrape-megaron.ts categoryToType()
 *
 * Grounded in megaron.gr listing-page spike: specs/megaron-category-titles-spike.md
 * Audit: specs/categorizer-audit-2026-05-14.md
 *
 * The 9 distinct category-title strings observed on /events/events-calendar/ map to
 * canonical EventType members. Talk-class categories (Διάλεξη, Συζήτηση) route to
 * 'other' as a taxonomy-pending stopgap until 'talk' lands.
 */

import { describe, test, expect } from 'bun:test';
import { categoryToType, parseMegaronListing, toDbEvent } from '../scrape-megaron';

describe('categoryToType — spike-derived mapping', () => {
  test('Μουσική → concert', () => {
    expect(categoryToType('Μουσική')).toBe('concert');
  });

  test('Όπερα → concert (per EventType union comment: opera is music)', () => {
    expect(categoryToType('Όπερα')).toBe('concert');
  });

  test('Έκθεση → exhibition', () => {
    expect(categoryToType('Έκθεση')).toBe('exhibition');
  });

  test('Θέατρο → theater', () => {
    expect(categoryToType('Θέατρο')).toBe('theater');
  });

  test('Διάλεξη → other (talk-class, taxonomy pending)', () => {
    expect(categoryToType('Διάλεξη')).toBe('other');
  });

  test('Συζήτηση → other (talk-class)', () => {
    expect(categoryToType('Συζήτηση')).toBe('other');
  });

  test('Εκπαιδευτικά & Δράσεις → workshop', () => {
    expect(categoryToType('Εκπαιδευτικά & Δράσεις')).toBe('workshop');
  });

  test('Εκδηλώσεις Τρίτων → other (third-party events, type varies)', () => {
    expect(categoryToType('Εκδηλώσεις Τρίτων')).toBe('other');
  });

  test('Online → other', () => {
    expect(categoryToType('Online')).toBe('other');
  });
});

describe('categoryToType — HTML entity decoding', () => {
  test('Εκπαιδευτικά &amp; Δράσεις (entity-encoded) → workshop', () => {
    expect(categoryToType('Εκπαιδευτικά &amp; Δράσεις')).toBe('workshop');
  });
});

describe('categoryToType — defensive normalization', () => {
  test('leading/trailing whitespace is trimmed', () => {
    expect(categoryToType('  Μουσική  ')).toBe('concert');
    expect(categoryToType('\tΔιάλεξη\n')).toBe('other');
  });

  test('NFC normalization applied (input arrives NFD-decomposed)', () => {
    // Decomposed form: 'Δ' + COMBINING ACUTE ACCENT (U+0301) on 'ι' would still match Διάλεξη after NFC
    const nfdInput = 'Διάλεξη'.normalize('NFD');
    expect(categoryToType(nfdInput)).toBe('other');
  });
});

describe('categoryToType — unknown / empty fallback', () => {
  test('unknown category → other (default)', () => {
    expect(categoryToType('Some New Category')).toBe('other');
  });

  test('empty string → other', () => {
    expect(categoryToType('')).toBe('other');
  });

  test('whitespace-only → other', () => {
    expect(categoryToType('   ')).toBe('other');
  });
});

// Trimmed from a real /el/events card (2026-09-22). The listing carries no
// clock time — megaron.gr states it only on the detail page.
const LISTING_CARD = `<li><div class="tease tease--event-calendar" data-presale="2099-09-21" data-sort="" data-date="28 09 2099,">
<div class="flex"><div class="right"><div class="flex">
<div class="col-1"> <a href="https://www.megaron.gr/event/12o-diethnes-festival-poiisis-athinon/"> <h2 class="">12ο Διεθνές Φεστιβάλ Ποίησης Αθηνών</h2> </a> </div>
<div class="col-2"><div class="category-tag"><a href="/events/events-calendar/?katigoria=sunedrio"><div class="category-title" style="color:#b12fce">Συνέδριο</div></a></div></div>
</div></div></div></div></li>`;

describe('listing → DB event: no invented clock time', () => {
  test('fixture precondition: the card parses and has no HH:MM anywhere', () => {
    expect(parseMegaronListing(LISTING_CARD)).toHaveLength(1);
    expect(LISTING_CARD).not.toMatch(/\b[0-2]?\d:[0-5]\d\b/);
  });

  test('a card without a stated time yields a date-only startDate', () => {
    const [scraped] = parseMegaronListing(LISTING_CARD);
    expect(toDbEvent(scraped).startDate).toBe('2099-09-28');
  });
});
