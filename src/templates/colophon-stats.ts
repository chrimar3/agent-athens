/**
 * Colophon engine stats — shared emitter + build-stats singleton (S103).
 *
 * Build-time facts surfaced in the colophon on BOTH surfaces (per-page dialog +
 * /en/colophon/ mirror) from ONE emitter, so the figures can never drift between
 * surfaces. SSR'd into HTML source (the mirror exists to be crawled — a
 * structured key-value citation asset, GEO priority #2).
 *
 * Threading: the dialog rides every page via site-chrome.ts → renderSiteNav,
 * which has 22 call sites — threading a stats arg through all of them is the
 * Guard-6 shotgun-surgery trap. Instead generate-site.ts computes the stats ONCE
 * at build start and calls setColophonStats(); renderColophonContent() reads the
 * singleton. Precedent: BUILD_STAMP in site-chrome.ts (computed once at module
 * load). renderColophonStats itself stays a PURE function for testability.
 *
 * Stat set: this session ships FOUR (events, venues, sources, last-rebuilt). The
 * schema-validity figure is HELD — /proof publicly states "100% pass — 0
 * structural errors", while the strict pass rate is 87% (2,685/3,079; 394 pages
 * carry non-blocking warnings). Shipping 87% here would contradict /proof on the
 * same metric (citation poison). Routed to Editorial+GEO for a single reconciled
 * framing; the emitter is N-agnostic so the 5th stat lands without layout change.
 *
 * Cross-surface lock: `events` is the ONLY figure also on /proof, which sources
 * it from pageableEvents.length. generate-site.ts MUST feed the same value here.
 */

export interface ColophonStats {
  events: number;
  venues: number;
  sources: number;
  /** Pre-formatted single date (e.g. "5 June 2026") — NOT a precise timestamp. */
  lastBuildDate: string;
}

// ---------------------------------------------------------------------------
// Build-stats singleton (set once in generate-site.ts before page generation)
// ---------------------------------------------------------------------------

let current: ColophonStats | null = null;

export function setColophonStats(stats: ColophonStats | null): void {
  current = stats;
}

export function getColophonStats(): ColophonStats | null {
  return current;
}

// ---------------------------------------------------------------------------
// Pure emitter
// ---------------------------------------------------------------------------

/**
 * Emit the colophon stats as a semantic <dl>. Each label/figure pair is wrapped
 * in a <div> (valid HTML5 inside <dl>) so the grid (repeat(auto-fit, …)) can
 * place each pair as one cell. Returns '' when stats are unset so pages rendered
 * before setColophonStats() (or in tests) degrade cleanly to no block.
 */
export function renderColophonStats(stats: ColophonStats | null): string {
  if (!stats) return '';

  const rows: Array<[label: string, figure: string]> = [
    ['Events live', stats.events.toLocaleString('en-US')],
    ['Venues', stats.venues.toLocaleString('en-US')],
    ['Sources', stats.sources.toLocaleString('en-US')],
    ['Last rebuilt', stats.lastBuildDate],
  ];

  const cells = rows
    .map(
      ([label, figure]) =>
        `    <div class="colophon-stat">
      <dt class="colophon-stat-label">${label}</dt>
      <dd class="colophon-stat-figure">${figure}</dd>
    </div>`,
    )
    .join('\n');

  return `<dl class="colophon-stats">
${cells}
</dl>`;
}
