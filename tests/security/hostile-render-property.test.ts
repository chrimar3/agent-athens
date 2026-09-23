/**
 * Property: whatever strings the scrapers or the enrichment session put in an
 * event, rendered output carries no event-handler attributes, no non-http(s)
 * link/image schemes and no injected elements. Each case sets every URL and
 * string field of an event to one hostile payload and renders every
 * event-bearing surface.
 */
import { describe, expect, test } from 'bun:test';
import { load } from 'cheerio';
import { sampleConcert, sampleFreeExhibition } from '../fixtures/events';
import { renderEventDetailPage, renderRelatedEventCard } from '../../src/generators/event-page';
import { generatePracticalBlock } from '../../src/generators/practical-block';
import { renderComparisonRow, renderEventBlock } from '../../src/generators/hub-page';
import { renderEventCard } from '../../src/templates/page';
import { renderEventCardList, renderFeatureCard, renderFeaturedEventCard, renderHeroSection } from '../../src/templates/card-variants';
import { IMG_FALLBACK_ONERROR } from '../../src/templates/image-fallback';
import { scanHtmlForArtifacts } from '../../src/validators/published-artifacts';
import type { Event } from '../../src/types';

const PAYLOADS = [
  'javascript:alert(1)',
  ' JaVaScRiPt:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'https://www.viva.gr/x"autofocus/onfocus=alert(1)//',
  "https://www.viva.gr/x'onmouseover='alert(1)",
  'https://www.viva.gr/x"><img src=x onerror=alert(1)><x-pwn>',
  "/images/x.webp')\"><x-pwn></x-pwn><div x='",
  '//evil.example/x.png',
  '"><x-pwn></x-pwn><script data-pwn>alert(1)</script>',
  '</script><script data-pwn>alert(1)</script>',
  "' onclick='alert(1)",
  '&quot; onclick=&quot;alert(1)',
  'https://www.viva.gr/\nx',
];

function hostileEvent(base: Event, p: string, i: number): Event {
  return {
    ...base,
    id: `hostile-${i}`,
    title: `Title ${p}`,
    description: `Desc ${p}. Second ${p}. Third.`,
    fullDescription: `Full ${p}. Second ${p}. Third ${p}.`,
    fullDescriptionEn: `Full EN ${p}. Second ${p}. Third ${p}.`,
    fullDescriptionGr: `Πλήρες ${p}. Δεύτερο ${p}.`,
    startDate: '2099-01-01T21:00:00+02:00',
    endDate: base.type === 'exhibition' ? '2099-03-01' : undefined,
    url: p,
    ticketUrl: p,
    ticketUrlStatus: 'direct',
    imageUrl: p,
    imageLocal: p,
    venueImage: p,
    source: p,
    genres: [p],
    tags: [p],
    venue: {
      ...base.venue,
      name: `Venue ${p}`,
      address: p,
      neighborhood: p,
      website: p,
      coordinates: { lat: p as unknown as number, lon: p as unknown as number },
    },
    price: { ...base.price, range: p },
  } as Event;
}

// After parsing, an attribute value is what the browser follows. An
// apostrophe inside a double-quoted, escaped attribute is inert, so only
// whitespace, double quotes, angle brackets and backticks are refused.
const SAFE_URL = /^(https?:\/\/[^\s"<>`]+|\/(?!\/)[^\s"<>`]*|#[^\s"<>`]*|mailto:[^\s"<>`]+|tel:[^\s"<>`]+|)$/;
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'xlink:href'];

function assertSafe(html: string, where: string): void {
  const $ = load(html);
  expect({ where, injected: $('x-pwn, script[data-pwn], [autofocus]').length }).toEqual({ where, injected: 0 });
  $('*').each((_, el) => {
    const attrs = (el as any).attribs as Record<string, string>;
    for (const [name, value] of Object.entries(attrs)) {
      if (name.startsWith('on')) {
        expect({ where, tag: (el as any).name, name, value }).toEqual({ where, tag: 'img', name: 'onerror', value: IMG_FALLBACK_ONERROR });
      }
      if (URL_ATTRS.includes(name)) {
        expect({ where, name, value, safe: SAFE_URL.test(value.trim()) }).toEqual({ where, name, value, safe: true });
      }
      if (name === 'style') expect({ where, style: /javascript:|expression\(/i.test(value) }).toEqual({ where, style: false });
    }
  });
  // The published-output gate must agree that the rendered surface is clean.
  expect({ where, gate: scanHtmlForArtifacts(html).filter(i => /unsafe|handler|script/i.test(i)) }).toEqual({ where, gate: [] });
}

describe('hostile values in every event field render as inert data', () => {
  PAYLOADS.forEach((p, i) => {
    test(`payload #${i}: ${JSON.stringify(p).slice(0, 40)}`, () => {
      for (const base of [sampleConcert, sampleFreeExhibition]) {
        const e = hostileEvent(base, p, i);
        const related = [hostileEvent(base, p, i + 100)];
        assertSafe(renderEventDetailPage(e, related, 'el'), 'event-page el');
        assertSafe(renderEventDetailPage(e, related, 'en'), 'event-page en');
        assertSafe(renderRelatedEventCard(e, 'en'), 'related card');
        assertSafe(generatePracticalBlock(e, { address: p, neighborhood: p, metroStation: p }, 'en'), 'practical block');
        assertSafe(renderEventCard(e, 'en'), 'event card');
        assertSafe(renderEventCardList(e, 'en'), 'card list');
        assertSafe(renderFeatureCard(e, 'en'), 'feature card');
        assertSafe(renderFeaturedEventCard(e, 'Editorial vignette.', 'yellow', 'en'), 'featured card');
        assertSafe(renderHeroSection([e, hostileEvent(base, p, i + 200), hostileEvent(base, p, i + 300)], 'today', 'en'), 'hero');
        assertSafe(`<table>${renderComparisonRow(e, 'en', true)}</table>`, 'hub row');
        assertSafe(renderEventBlock(e, 'en'), 'hub block en');
        assertSafe(renderEventBlock(e, 'el'), 'hub block el');
      }
    });
  });
});
