# Agent Athens Design System — Diagnostic Report

**Generated:** 2026-02-28
**Source:** `src/styles/design-system.css` (1,856 lines, 46 KB built)
**Scope:** Read-only audit of CSS implementation, template usage, accessibility, and build output

---

## 1. CSS Custom Properties (Design Tokens)

### Token Inventory

| Category | Token prefix | Count | Notes |
|----------|-------------|-------|-------|
| Background | `--bg-*` | 4 | `primary`, `surface`, `elevated`, `overlay` |
| Text | `--text-*` | 4 | `primary`, `secondary`, `tertiary`, `muted` |
| Accent | `--accent-*` | 2 | `primary` (#5ba4e6), `hover` (#7db8ef) |
| Border | `--border-*` | 3 | `subtle`, `default`, `active` |
| Event type | `--color-*` | 18 | Full palette: concert → other |
| Typography | `--type-*` | 8 | hero, h1, h2, h3, body, body-lg, small, caption |
| Font | `--font-*` | 3 | primary, weight-regular, weight-bold |
| Spacing | `--space-*` | 6 | xs (4px) → 2xl (64px) |
| Motion | `--t-*` | 5 | instant (100ms) → slow (800ms) |
| Easing | `--ease-*` | 2 | out, in-out |
| Safe area | `--safe-*` | 4 | top, bottom, left, right |

**Total: 59 custom properties defined in `:root`.**

### Token Adoption vs Hardcoded Values

| Pattern | Count | % of total |
|---------|-------|-----------|
| `var(--bg-*)` references | 37 | — |
| `var(--text-*)` references | 59 | — |
| `var(--border-*)` references | 22 | — |
| `var(--color-*)` references | 7 | — |
| `var(--space-*)` references | 6 | Low |
| Hardcoded hex values | ~82 | — |
| `font-size` with `px` | 61 | 80% |
| `font-size` with `var(--type-*)` | 15 | 20% |

### Findings

- **Spacing tokens are underused.** Only 6 occurrences of `var(--space-*)` across 1,856 lines, despite ~147 padding/margin/gap declarations. Most spacing uses hardcoded px values (e.g., `padding: 12px 0`, `gap: 8px`, `margin-bottom: 24px`).
- **Font-size tokens are underused.** 61 hardcoded px font-sizes vs 15 token-based. Token usage is concentrated in the EDP (event detail page) section; browse-page cards, badges, header, footer, search overlay, and filter bar all use raw px.
- **Color tokens well-adopted** for bg/text/border. Semantic tokens (`--bg-surface`, `--text-secondary`) used consistently across components.
- **Hardcoded hex values** (82 total) are mostly in:
  - Per-type gradient backgrounds (e.g., `#2a2400`, `#1a1800`) — 3 sets duplicated across `.card-image-wrapper`, `.hero-card-image-wrapper`, and `.hero-pick-image`
  - Badge text colors (`#1a1a1a`, `#f0f0f0`) — not tokenized
  - Enriched badge purple (`#7c3aed`) — one-off

---

## 2. Typography

### Font Loading Strategy

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&subset=greek,latin&display=swap');
```

- **Font:** Manrope (Google Fonts)
- **Weights:** 400 (regular), 700 (bold) — only two used
- **Subsets:** Greek + Latin (correct for bilingual site)
- **Loading:** `display=swap` prevents FOIT
- **Strategy:** `@import` at top of CSS — blocks render until font CSS is fetched

### Type Scale

| Token | Value | Used in |
|-------|-------|---------|
| `--type-hero` | 2.5rem (40px) | Not referenced in CSS |
| `--type-h1` | 2rem (32px) | Not referenced in CSS |
| `--type-h2` | 1.5rem (24px) | `.hero-heading` |
| `--type-h3` | 1.3rem (20.8px) | `.edp-related h3`, `.hero-heading` (mobile) |
| `--type-body` | 1rem (16px) | EDP components |
| `--type-body-lg` | 1.1rem (17.6px) | EDP meta, description |
| `--type-small` | 0.9rem (14.4px) | EDP breadcrumb, source, venue details |
| `--type-caption` | 0.75rem (12px) | Not referenced in CSS |

### Findings

- **`--type-hero` and `--type-h1` are defined but never used** in the stylesheet.
- **`--type-caption` is defined but never used** in the stylesheet.
- The EDP section uses tokens well (`var(--type-body-lg)`, `var(--type-small)`), but browse-page components bypass tokens entirely, using raw px values like `font-size: 20px`, `font-size: 14px`, `font-size: 11px`.
- The content page headings use raw px (`40px`, `28px`, `20px`) rather than the token scale.
- **Responsive typography:** EDP title scales from 56px → 44px → 36px via breakpoints. Content page h1 scales 40px → 32px. No `clamp()` or fluid typography used.

---

## 3. Surfaces & Color System

### Surface Hierarchy

| Layer | Token | Value | Usage |
|-------|-------|-------|-------|
| Base | `--bg-primary` | `#111114` | Body, page background |
| Surface | `--bg-surface` | `#1a1a1e` | Cards, footer callout, venue section |
| Elevated | `--bg-elevated` | `#24242a` | Mobile menu, search overlay, filter panels, footer |
| Overlay | `--bg-overlay` | `rgba(0,0,0,0.7)` | Backdrops (search, mobile menu, filter panels) |

### Dark Mode

- **Dark-only implementation** — no light mode, no `prefers-color-scheme` media query.
- All background tokens are dark values; inverting to light would require redefining all tokens.

### Event Type Color System

18 event type colors defined as tokens. Each type also gets:
1. A color dot on filter tiles
2. A badge background color (via inline `style="background: var(--color-...)"`)
3. A gradient background for card image placeholders (hardcoded hex, not derived from tokens)
4. EDP hero gradient tint (via `--edp-type-color` CSS variable set inline)

### Findings

- **Gradient backgrounds duplicated 3x** — identical per-type gradients appear for `.card-image-wrapper`, `.hero-card-image-wrapper`, and `.hero-pick-image`. That's ~39 rules that could be consolidated.
- Badge colors are applied via inline styles in templates (`style="background: ${colorVar}"`), not CSS classes — this is a deliberate dynamic pattern but prevents CSS-only theming.

---

## 4. Spacing System

### Defined Tokens

| Token | Value |
|-------|-------|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 40px |
| `--space-2xl` | 64px |

### Actual Usage

Only **6 occurrences** of `var(--space-*)` in the entire 1,856-line stylesheet:
- `.date-group` gap: `var(--space-lg)`
- `.hero-section` margin/padding: `var(--space-lg)`
- `.hero-header` margin: `var(--space-md)`
- `.hero-grid` gap: `var(--space-lg)`

### Hardcoded Spacing Audit (sample)

| Value | Count (approx.) | Maps to token? |
|-------|-----------------|----------------|
| `4px` | ~8 | `--space-xs` |
| `8px` | ~18 | `--space-sm` |
| `10px` | ~6 | No token |
| `12px` | ~15 | No token (between sm and md) |
| `16px` | ~25 | `--space-md` |
| `20px` | ~10 | No token |
| `24px` | ~12 | `--space-lg` |
| `32px` | ~8 | No token |
| `40px` | ~8 | `--space-xl` |
| `48px` | ~3 | No token |
| `64px` | ~2 | `--space-2xl` |

### Findings

- **Spacing tokens exist but are almost entirely unused.** The vast majority of the ~147 padding/margin/gap declarations use raw px values.
- Values like `10px`, `12px`, `15px`, `20px`, `32px`, and `48px` are used frequently but have no corresponding tokens.
- The spacing scale jumps from 8→16→24→40→64, leaving common intermediate values (12, 20, 32, 48) untokenized.

---

## 5. Grid System

### Layout Patterns

| Component | Grid | Breakpoints |
|-----------|------|------------|
| `.card-grid` | `repeat(3, 1fr)` | 1024px: 2col, 767px: 1col |
| `.date-group` | `repeat(3, 1fr)` | 1024px: 2col, 767px: 1col |
| `.hero-grid` | `2fr 1fr` | 1024px: 1col |
| `.footer-grid` | `2fr 1fr 1fr` | 767px: 1col |
| `.filter-type-grid` | `repeat(3, 1fr)` | 767px: 2col |
| `.edp-related .card-grid` | `repeat(2, 1fr)` | 767px: 1col |

### Container Widths

| Component | Max-width |
|-----------|-----------|
| `.page-container` | 1320px |
| `.site-header-inner` | 1320px |
| `.site-footer-inner` | 1320px |
| `.edp-hero-inner` | 1320px |
| `.edp-content` | 800px |
| `.content-page-body` | 800px |
| `.venue-page-content` | 800px |
| `.search-overlay-panel` | 600px |

### Breakpoints

Two breakpoints used throughout:
- **1024px** — tablet (reduce columns)
- **767px** — mobile (single column, reduced padding/fonts)

### Findings

- **Consistent container widths.** 1320px for full-width, 800px for content-width, 600px for overlays.
- No CSS container queries used.
- No `--breakpoint-*` tokens — breakpoints are hardcoded in each `@media` rule.
- `.page-container` max-width is defined but referenced in `page.ts` inline styles, not in the CSS file.

---

## 6. Component Inventory

### Components Styled in `design-system.css`

| Component | Lines | Prefixed? |
|-----------|-------|-----------|
| Event card (`.event-card`, `.card-*`) | ~150 | Yes |
| Event card list (`.event-card-list`) | ~45 | Yes |
| Feature card (`.event-card-feature`) | ~55 | Yes |
| Site header (`.site-header*`) | ~80 | Yes |
| Mobile menu (`.mobile-*`) | ~55 | Yes |
| Site footer (`.site-footer*`, `.footer-*`) | ~75 | Yes |
| EDP / Event detail (`.edp-*`) | ~270 | Yes |
| Filter bar (`.filter-*`) | ~300 | Yes |
| Search overlay (`.search-*`) | ~200 | Yes |
| Hero section (`.hero-*`) | ~170 | Yes |
| Content page (`.content-page-*`) | ~55 | Yes |
| Date group (`.date-group*`) | ~45 | Yes |
| View transitions | ~10 | N/A |
| Image lazy-load fade | ~15 | N/A |

### Components Styled Inline (in templates)

| Template | Inline `<style>` | Purpose |
|----------|-----------------|---------|
| `page.ts` | Yes (~7 rules) | `.page-header`, `.summary`, `.last-update`, `.related-pages` |
| `venue-page.ts` | Yes (~20 rules) | `.venue-*`, `.breadcrumb`, `.open-now-badge`, `.venue-map` |
| Venue index | Yes (~10 rules) | `.venue-index-*`, `.venue-list`, `.event-count`, `.neighborhood` |

### Findings

- **Venue pages have a parallel styling system** — they define their own component styles inline rather than in the design system CSS.
- `page.ts` also embeds inline styles for page headers. These are not in the design system but could collide with design tokens.
- All design system components use flat, BEM-ish class naming (no nesting, no modules). Naming is consistent within each component.

---

## 7. Motion & Animation

### Motion Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--t-instant` | 100ms | Color transitions (hover states) |
| `--t-fast` | 200ms | View transitions, hamburger, search, filter panels |
| `--t-normal` | 300ms | Lazy-load image fade, mobile bar slide, filter sheet |
| `--t-deliberate` | 500ms | Defined, never used |
| `--t-slow` | 800ms | Defined, never used |

### Animations Defined

| Name | Duration | Used by |
|------|----------|---------|
| `vt-fade-out` | `--t-fast` | View Transitions API |
| `vt-fade-in` | `--t-fast` | View Transitions API |
| `fadeIn` | `--t-fast` | Mobile overlay |
| `filterPanelIn` | `--t-fast` | Filter dropdown |
| `sheetSlideUp` | `--t-normal` | Mobile filter sheet |
| `skeleton-pulse` | 1.5s | Search skeleton loader |

### Easing

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-out` | `cubic-bezier(0.0, 0.0, 0.2, 1)` | Most transitions |
| `--ease-in-out` | `cubic-bezier(0.4, 0.0, 0.2, 1)` | Defined, never used in `transition` |

### Reduced Motion

Two `prefers-reduced-motion: reduce` blocks:
1. **Global** (line 136): Sets all `animation-duration` and `transition-duration` to `0.01ms !important`
2. **Search-specific** (line 1839): Explicitly disables animations on search overlay components

### Findings

- **`--t-deliberate` (500ms) and `--t-slow` (800ms) are defined but never used.**
- **`--ease-in-out` is defined but never referenced** in any `transition` property.
- `skeleton-pulse` animation uses hardcoded `1.5s` instead of a motion token.
- The global `prefers-reduced-motion` block (line 136) already covers all elements — the search-specific block (line 1839) is **redundant**.
- **View Transitions API:** `@view-transition { navigation: auto; }` is used with `<meta name="view-transition" content="same-origin">` in all templates — provides page-to-page cross-fade.
- Feature card image has a hardcoded `150ms` transition not using any token.

---

## 8. Accent Color

### Primary Accent

- **Value:** `#5ba4e6` (soft blue)
- **Hover:** `#7db8ef` (lighter blue)
- Used for: links, active borders, filter pill active state, CTA buttons (on EDP, overridden by type color), search focus outline, accent borders

### Event Type as Dynamic Accent

On event detail pages, the accent color is dynamically overridden:
```html
<section class="edp-hero" style="--edp-type-color: var(--color-concert)">
```
This sets the hero gradient, type badge, CTA button, and date highlight to the event's type color.

### Findings

- **Only 2 accent tones** (primary + hover). No `--accent-subtle`, `--accent-muted`, or opacity variants.
- Badge/CTA text color (`#1a1a1a` for dark-on-bright, `#f0f0f0` for light-on-dark) is hardcoded, not tokenized.
- The `.edp-cta:hover` rule hardcodes `color: #1a1a1a` which overrides the `--light-text` variant on hover — potential bug for dark-background type colors. (The `--light-text:hover` rule does exist and corrects this.)

---

## 9. Accessibility

### ARIA Patterns Audit

| Component | ARIA attributes | Notes |
|-----------|----------------|-------|
| Search overlay | `role="dialog"`, `aria-modal="true"`, `aria-label`, `aria-hidden` | Correct modal pattern |
| Hamburger button | `aria-label="Menu"`, `aria-expanded` | Correctly toggled by JS |
| Mobile menu | `aria-hidden` (toggled) | Correct |
| Mobile overlay | `aria-hidden` (toggled) | Correct |
| Search button | `aria-label="Αναζήτηση"` | Greek label |
| Close buttons | `aria-label="Close menu"`, `aria-label="Κλείσιμο"` | Mixed languages |
| Live region | `role="status"`, `aria-live="polite"`, `aria-atomic="true"` | Search result count announcements |
| EDP connections nav | `aria-label="Σχετικές σελίδες"` | Landmark navigation |

**Total ARIA attributes across templates:** 44

### Focus Management

- **Focus visible:** 3 rules for `:focus-visible` (event card, list card, feature card) — accent-colored outline
- **Focus trap:** Search overlay implements keyboard focus trap (Tab wrapping)
- **Focus restore:** Search overlay saves and restores `document.activeElement` on close
- **Keyboard navigation:** Arrow keys, Enter, Escape all handled in search overlay

### Screen Reader Support

- `.sr-only` class defined for visually-hidden live region
- Card images use `alt=""` (decorative) — correct since card is wrapped in `<a>` with title
- Placeholder icons use `aria-hidden="true"`

### Color Contrast (estimated)

| Pair | Foreground | Background | Estimated ratio |
|------|-----------|------------|----------------|
| Primary text on primary bg | `#f0f0f0` on `#111114` | ~16:1 |
| Secondary text on primary bg | `#b4b4af` on `#111114` | ~9:1 |
| Tertiary text on primary bg | `#707070` on `#111114` | ~4.5:1 |
| Muted text on primary bg | `#505050` on `#111114` | ~2.5:1 |
| Accent on primary bg | `#5ba4e6` on `#111114` | ~6.5:1 |

### Findings

- **No `forced-colors` or `high-contrast` media query support.** Windows High Contrast Mode users get no adaptations.
- **`--text-muted` (#505050) fails WCAG AA** contrast ratio (~2.5:1 vs required 4.5:1) on `--bg-primary`. Used for footer copyright — low-priority content but technically non-compliant.
- **Mixed language ARIA labels** — hamburger uses English ("Menu", "Close menu"), search uses Greek ("Αναζήτηση", "Κλείσιμο"). Should be consistently Greek since `<html lang="el">`.
- **No skip-to-content link** — keyboard users must tab through all nav items to reach main content.
- `prefers-reduced-motion` is well-implemented globally.

---

## 10. Bilingual Support

### Language Strategy

| Layer | Language | Implementation |
|-------|----------|---------------|
| `<html lang>` | `el` (Greek) | All pages |
| UI text (nav, buttons) | Greek | Hardcoded in templates |
| Event titles/descriptions | Greek | From data |
| URL slugs | Transliterated Latin | Via `normalizeGreek()` |
| Schema.org JSON-LD | English | Intentional for AI agents |
| Meta keywords | Bilingual | Greek + English comma-separated |
| `hreflang` alternates | `el`, `en`, `x-default` | Declared but `/en/` pages not generated |

### Findings

- **`hreflang="en"` and `hreflang="x-default"` point to `/en/...` URLs that don't exist** in the build output. These are aspirational but currently return 404.
- Greek text is hardcoded in templates (not i18n framework) — switching to English would require rewriting all template strings.
- **`aria-label="Menu"` is English** on the hamburger button, inconsistent with the Greek UI language.
- Google Fonts loads `subset=greek,latin` correctly for bilingual rendering.

---

## 11. Image Pipeline

### Image Statistics

| Category | Count | Format |
|----------|-------|--------|
| Event images | 1,152 | WebP |
| OG images | 16 | PNG |
| Venue images | 1 | WebP |
| Favicon (SVG) | 1 | SVG |
| Favicon (PNG) | 1 | PNG (32x32) |
| Apple touch icon | 1 | PNG |
| **Total** | 1,169 (+3 favicons) | — |

### Image Loading Strategy

```html
<img loading="lazy" decoding="async" referrerpolicy="no-referrer"
     onerror="this.style.display='none';this.nextElementSibling.style.display=''">
```

- **Lazy loading:** Native `loading="lazy"` on all card/event images
- **Decoding:** `decoding="async"` to avoid main-thread blocking
- **Referrer policy:** `no-referrer` for external image sources (privacy + hotlink compatibility)
- **Error handling:** Inline `onerror` hides broken image, shows placeholder icon
- **Fade-in:** JS adds `.will-fade` class on load; `.is-loaded` triggers CSS opacity transition

### Fallback Chain

1. `event.imageLocal` (self-hosted WebP) → preferred
2. `event.imageUrl` (external hotlink) → fallback
3. `event.venueImage` (venue-level image) → secondary fallback
4. Type-colored gradient + emoji icon → final fallback

### Findings

- **No `srcset` or `<picture>` element** — all images served at a single resolution regardless of viewport/DPR.
- **No image dimensions** (`width`/`height` attributes) on card images — causes layout shift (CLS) during load.
- **Venue image coverage is very low** (1 image for 111 venue pages).
- **OG images** are pre-generated PNGs per event type (16 types), not per-event.
- Inline `onerror` handler is a mild XSS surface if image URLs are ever attacker-controlled — currently mitigated since URLs come from curated data.

---

## 12. Build Output

### File Counts

| Type | Count |
|------|-------|
| Total HTML files | 2,386 |
| Event detail pages | 791 |
| Venue pages | 111 |
| Category/filter pages | ~1,484 |
| Static pages | ~4 (about, 404, venue index, etc.) |
| CSS files | 1 |
| JS/MJS files | 1 (fuse.mjs) |
| JSON files | 2+ (search-index, slug-history) |
| Image files | 1,169 |
| Redirects file | 1 |

### File Sizes

| File | Size |
|------|------|
| `design-system.css` | 46 KB (unminified) |
| `search-index.json` | 305 KB |
| `fuse.mjs` | ~24 KB (estimated) |
| Total `dist/` | 150 MB |

### Build Characteristics

- **No CSS minification** — the 46 KB CSS ships as-is with comments and whitespace.
- **No CSS splitting** — single file for all pages (event detail, browse, venue, content, search, filters).
- **No JS bundling** — fuse.mjs is the only external script, loaded on-demand by search overlay.
- **Inline scripts** — hamburger menu, search logic, filter bar logic, and event detail interactions are all inlined in HTML via template functions.
- **No service worker** or offline capability.

### Findings

- **CSS is not minified.** The 46 KB file would compress to ~28-30 KB gzipped (Netlify serves gzip automatically), but minification could save ~15-20% on top.
- **Search index (305 KB) is the largest JS payload** — loaded lazily on first search open. With gzip, this drops to ~40-50 KB.
- **No critical CSS extraction** — the full 46 KB CSS blocks render for all page types, even though most pages only use a fraction of the styles.
- **150 MB dist is large** — dominated by 1,152 WebP event images. The HTML/CSS/JS portion is ~120 MB of HTML files (~50 KB average per page × 2,386 pages).
- **Redirect file** (`_redirects`) exists for slug stability — handles URL changes when event slugs update.

---

## Summary of Key Findings

### Well-Implemented

1. **Color token system** — bg/text/border tokens are defined and consistently used
2. **Event type color palette** — comprehensive 18-color system with tokens
3. **ARIA patterns** — search overlay has proper modal semantics, focus trap, live regions
4. **Reduced motion** — global `prefers-reduced-motion` support
5. **View Transitions API** — modern page-to-page cross-fade
6. **Image error handling** — graceful fallback chain with placeholder system
7. **Schema.org markup** — comprehensive JSON-LD on all page types
8. **Safe area support** — CSS env() for notched devices

### Needs Attention

1. **Spacing tokens almost unused** — 6 token refs vs ~147 hardcoded values
2. **Font-size tokens largely bypassed** — 15 token refs vs 61 hardcoded px values; 3 tokens (`--type-hero`, `--type-h1`, `--type-caption`) never used
3. **Motion tokens partially unused** — `--t-deliberate`, `--t-slow`, `--ease-in-out` never referenced
4. **Per-type gradients duplicated 3×** in CSS (~39 redundant rules)
5. **Venue pages use inline styles** instead of the design system
6. **No image dimensions** on card images (CLS impact)
7. **No srcset/picture** for responsive images
8. **CSS not minified** (46 KB → ~38 KB potential)
9. **`hreflang="en"` URLs don't exist** in build output
10. **Mixed-language ARIA labels** (English "Menu" vs Greek "Αναζήτηση")
11. **`--text-muted` fails WCAG AA** contrast on primary background
12. **No skip-to-content link** for keyboard navigation
13. **No forced-colors/high-contrast** support
14. **Font loaded via @import** (render-blocking) — `<link rel="preload">` would be faster
