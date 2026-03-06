/**
 * Card accessibility tests — heading-only link with ::before click target.
 *
 * Target structure:
 *   <article class="event-card">
 *     <h3 class="card-title"><a href="..." class="card-link">Title</a></h3>
 *   </article>
 *
 * NOT the old full-card <a> wrapper.
 */

import { describe, test, expect } from "bun:test";
import { renderEventCard } from "../page";
import { renderEventCardList, renderFeatureCard } from "../card-variants";
import { renderRelatedEventCard } from "../../generators/event-page";
import { sampleConcert, sampleFreeExhibition } from "../../../tests/fixtures/events";

// Match <a followed by space (not <article, <aside, etc.)
const A_TAG_WITH = (cls: string) => new RegExp(`<a\\s[^>]*class="${cls}"`);

describe("Card accessibility — grid card", () => {
  const html = renderEventCard(sampleConcert);

  test("wraps in <article>, not <a>", () => {
    expect(html).toContain("<article");
    expect(html).toContain('class="event-card"');
    expect(html).not.toMatch(A_TAG_WITH("event-card"));
  });

  test("heading contains card-link <a>", () => {
    expect(html).toMatch(/<h3[^>]*class="card-title"[^>]*>\s*<a\s[^>]*class="card-link"/);
  });

  test("card-link has href to event page", () => {
    expect(html).toMatch(/class="card-link"/);
    expect(html).toMatch(/<a\s[^>]*href="\/events\/[^"]+\/"/);
  });

  test("closes with </article>", () => {
    expect(html).toContain("</article>");
  });

  test("preserves data-price on article", () => {
    expect(html).toMatch(/<article[^>]*data-price="/);
  });

  test("preserves schema.org itemscope on article", () => {
    expect(html).toMatch(/<article[^>]*itemscope/);
  });
});

describe("Card accessibility — related card", () => {
  const html = renderRelatedEventCard(sampleConcert);

  test("wraps in <article>, not <a>", () => {
    expect(html).toContain("<article");
    expect(html).toContain('class="event-card"');
    expect(html).not.toMatch(A_TAG_WITH("event-card"));
  });

  test("heading contains card-link <a>", () => {
    expect(html).toMatch(/<h3[^>]*class="card-title"[^>]*>\s*<a\s[^>]*class="card-link"/);
  });
});

describe("Card accessibility — list card", () => {
  const html = renderEventCardList(sampleConcert);

  test("wraps in <article>, not <a>", () => {
    expect(html).toContain("<article");
    expect(html).toContain('class="event-card-list"');
    expect(html).not.toMatch(A_TAG_WITH("event-card-list"));
  });

  test("heading contains card-link <a>", () => {
    expect(html).toMatch(/<h3[^>]*class="card-title"[^>]*>\s*<a\s[^>]*class="card-link"/);
  });
});

describe("Card accessibility — feature card", () => {
  const html = renderFeatureCard(sampleConcert);

  test("wraps in <article>, not <a>", () => {
    expect(html).toContain("<article");
    expect(html).toContain('class="event-card-feature"');
    expect(html).not.toMatch(A_TAG_WITH("event-card-feature"));
  });

  test("heading contains card-link <a>", () => {
    expect(html).toMatch(/<h3[^>]*class="card-title"[^>]*>\s*<a\s[^>]*class="card-link"/);
  });
});

describe("Card accessibility — exhibition card", () => {
  const html = renderEventCard(sampleFreeExhibition);

  test("exhibition card also uses article wrapper", () => {
    expect(html).toContain("<article");
    expect(html).not.toMatch(A_TAG_WITH("event-card"));
  });
});
