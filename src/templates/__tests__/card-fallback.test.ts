/**
 * S161 — Imageless tile integration into card renderers (renames in spirit
 * from "Tier 1 fallback markup", which retired with .card-image--fallback).
 *
 * When an event has no imageLocal/imageUrl/venueImage, the card emits:
 *   <div class="card-image-wrapper" data-type="{type}">
 *     <svg>...inline tile...</svg>
 *     <span class="card-badge ...">...</span>
 *     ...optional badges + save button
 *   </div>
 * The body anchor (<h3><a href={detailUrl}>{event.title}</a></h3>) is unchanged
 * and remains the GEO floor.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { renderEventCard } from '../page';
import { renderEventCardList } from '../card-variants';
import { precomputeEventTiles, clearEventTileCache } from '../../generators/event-tile';
import { sampleConcert } from '../../../tests/fixtures/events';
import type { Event } from '../../types';

// Precompute tiles for fixtures used in these tests — renderers look up the
// SVG synchronously from the module-level cache populated by this call.
beforeAll(async () => {
  clearEventTileCache();
  await precomputeEventTiles([sampleConcert]);
});

describe('S161 imageless tile — grid card', () => {
  test('imageless event emits the new tile wrapper with an inline SVG', () => {
    const html = renderEventCard(sampleConcert);
    expect(html).toContain('class="card-image-wrapper" data-type="concert"');
    expect(html).toContain('<svg');
    // The retired class must NOT reappear.
    expect(html).not.toContain('card-image--fallback');
    expect(html).not.toContain('card-image__fallback-text');
  });

  test('body anchor with the full untruncated title is preserved (GEO floor)', () => {
    const html = renderEventCard(sampleConcert);
    expect(html).toMatch(
      new RegExp(`<a href="[^"]+" class="card-link">${escapeRegex(sampleConcert.title)}</a>`),
    );
  });

  test('event with imageUrl renders <img class="card-image">, no inline tile SVG', () => {
    const eventWithImage: Event = {
      ...sampleConcert,
      imageUrl: 'https://example.com/concert.jpg',
    };
    const html = renderEventCard(eventWithImage);
    expect(html).toMatch(/<img\s[^>]*class="card-image"/);
    // The tile SVG is distinct from icon SVGs by its 200×267 viewport.
    expect(html).not.toMatch(/<svg\s[^>]*width="200"\s+height="267"/);
  });
});

describe('S161 imageless tile — list-row card', () => {
  test('list-row imageless uses list-image-wrapper with inline SVG', () => {
    const html = renderEventCardList(sampleConcert);
    expect(html).toContain('class="list-image-wrapper" data-type="concert"');
    expect(html).toContain('<svg');
    expect(html).not.toContain('card-image--fallback');
  });
});

describe('S161 imageless tile — Greek long title', () => {
  test('long Greek title renders without throwing; title appears in body anchor unchanged', async () => {
    const longGreekTitle = 'Δημήτρης Κόψης παρουσιάζει νέα μουσική ζωντανά στο EXA Ψυρρή';
    const longGreekEvent: Event = { ...sampleConcert, title: longGreekTitle };
    // Tile must be precomputed for this event id too (sampleConcert's id is reused
    // because we spread it). Precompute again with the long-title variant.
    await precomputeEventTiles([longGreekEvent]);
    expect(() => renderEventCard(longGreekEvent)).not.toThrow();
    const html = renderEventCard(longGreekEvent);
    // Tile may have truncated the SVG copy, but the body anchor carries the full title.
    expect(html).toContain(`>${longGreekTitle}</a>`);
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
