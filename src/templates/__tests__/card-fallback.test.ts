/**
 * Tier 1 image fallback markup tests (S124).
 *
 * When an event has no imageLocal/imageUrl/venueImage, the card emits:
 *   <div class="card-image card-image--fallback" data-event-type="{type}">
 *     <span class="card-image__fallback-text" aria-hidden="true">{title}</span>
 *   </div>
 *
 * When an image source is present, the existing <img class="card-image"> markup
 * is preserved unchanged.
 */

import { describe, test, expect } from "bun:test";
import { renderEventCard } from "../page";
import { renderEventCardList } from "../card-variants";
import { sampleConcert } from "../../../tests/fixtures/events";
import type { Event } from "../../types";

describe("Tier 1 image fallback — grid card", () => {
  test("imageless event renders fallback div with class and data-event-type", () => {
    const html = renderEventCard(sampleConcert);
    expect(html).toContain('class="card-image card-image--fallback"');
    expect(html).toContain('data-event-type="concert"');
  });

  test("fallback contains aria-hidden text span with the event title", () => {
    const html = renderEventCard(sampleConcert);
    expect(html).toContain(
      `<span class="card-image__fallback-text" aria-hidden="true">${sampleConcert.title}</span>`
    );
  });

  test("event with imageUrl renders <img>, no fallback div", () => {
    const eventWithImage: Event = {
      ...sampleConcert,
      imageUrl: "https://example.com/concert.jpg",
    };
    const html = renderEventCard(eventWithImage);
    expect(html).not.toContain("card-image--fallback");
    expect(html).toMatch(/<img\s[^>]*class="card-image"/);
  });
});

describe("Tier 1 image fallback — list-row card", () => {
  test("list-row imageless gets card-image--list modifier on same div", () => {
    const html = renderEventCardList(sampleConcert);
    expect(html).toContain("card-image--fallback");
    expect(html).toContain("card-image--list");
  });
});

describe("Tier 1 image fallback — Greek long title", () => {
  test("60-char Greek title renders verbatim inside fallback text span", () => {
    const longGreekTitle = "Δημήτρης Κόψης παρουσιάζει νέα μουσική ζωντανά στο EXA Ψυρρή";
    const longGreekEvent: Event = {
      ...sampleConcert,
      title: longGreekTitle,
    };
    expect(() => renderEventCard(longGreekEvent)).not.toThrow();
    const html = renderEventCard(longGreekEvent);
    expect(html).toContain(
      `<span class="card-image__fallback-text" aria-hidden="true">${longGreekTitle}</span>`
    );
  });
});
