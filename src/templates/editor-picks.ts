/**
 * Editor's Picks template partial — S101a infrastructure.
 *
 * Standalone in S101a. Integration into hub-page.ts (Part 1.5 on cornerstones)
 * and homepage selection logic land in S101b. The component is callable but has
 * no production callers in this session by design.
 *
 * Renders:
 *   - <section class="editor-picks"> wrapper
 *   - <h2 class="section-label"> with the windowLabel
 *   - <ol class="picks-list"> with one <li class="pick"> per pick
 *   - Per-pick <p class="pick-rationale"> + event-card slot placeholder
 *   - JSON-LD ItemList with itemListOrder=Manual, numberOfItems, position per pick
 *
 * Event card rendering is deferred to S101b — this template emits a slot comment
 * (`<!-- event-card slot: <eventId> -->`) that the integration step replaces with
 * actual card markup using the existing card rendering logic.
 */

export interface EditorPick {
  /** Event id matching events.id and the key in editorial-content.json#featuredEvents */
  eventId: string;
  /** Already-locale-resolved vignette/rationale text */
  vignette: string;
  /** 1-based pick rank within the window (drives JSON-LD ListItem.position) */
  rank: number;
  /** Canonical absolute URL for the event detail page (no trailing slash policy follows site convention) */
  eventCanonicalUrl: string;
}

export interface EditorPicksProps {
  picks: EditorPick[];
  /** Already-locale-resolved intro paragraph */
  intro: string;
  locale: 'el' | 'en';
  /** Already-locale-resolved label, e.g. "May 22-28" or "Επιλογές 22-28 Μαΐου" */
  windowLabel: string;
  /** Absolute URL of the hosting page — used as JSON-LD ItemList @id base */
  pageUrl: string;
}

/**
 * Render the editor-picks section as an HTML string with embedded JSON-LD.
 * Caller is responsible for splicing the returned string into the template.
 */
export function renderEditorPicks(props: EditorPicksProps): string {
  const { picks, intro, locale, windowLabel, pageUrl } = props;

  const itemListElements = picks
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map(p => ({
      '@type': 'ListItem',
      position: p.rank,
      item: { '@id': p.eventCanonicalUrl },
    }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${pageUrl}#editor-picks`,
    itemListOrder: 'https://schema.org/ItemListOrderManual',
    numberOfItems: picks.length,
    itemListElement: itemListElements,
  };

  const picksHtml = picks
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map(pick => `      <li class="pick">
        <!-- event-card slot: ${pick.eventId} -->
        <p class="pick-rationale">${pick.vignette}</p>
      </li>`)
    .join('\n');

  return `<section class="editor-picks">
  <h2 class="section-label">${windowLabel}</h2>
  <p class="picks-intro">${intro}</p>
  <ol class="picks-list">
${picksHtml}
  </ol>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</section>`;
}
