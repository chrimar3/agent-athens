# Agent Athens Design System
## The Implementation Bible

> This is the single source of truth for agent-athens visual design.
> Claude Code references this file when building components.
> Every spec here is a decided decision — not a suggestion.

**Status:** ✅ All major design decisions resolved. **WCAG contrast validated
(Mission 13) — 3 token fixes applied.** Color system complete (including status +
focus tokens). Typography LOCKED (Manrope). Logo specced. Cards specced (including
sold-out state). Detail page specced (including past-event state). Navigation specced.
Filter bar specced. Search overlay specced (Mission 09). Empty states, error states,
404 specced (Mission 10). Focus system + skip nav specced (Mission 11). Pagination
specced (Mission 12). Footer specced. Content page template specced. OG image
templates specced. Mobile patterns specced. Motion system specced (Mission 08).
**Hub page template specced (GEO architecture). Venue page template specced.
Comparison table component specced. FAQ section specced. Freshness signals specced.
Source attribution specced. Price terminology aligned (open/with-ticket).**
**Round 7 GEO: Cornerstone page tier documented (same template, editorial density).
Comparison table updated with Neighborhood column (7 columns). FAQ tiered to 8+
for cornerstones with "Show more" overflow pattern. Competitive landscape audited.**
Ready for implementation.

---

## 1. Color System

### Primary Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0d0d0d` | Page background |
| `--bg-elevated` | `#1a1a1a` | Popovers, search panel, no-image card fallback, bottom bar, seasonal narrative |
| `--bg-surface` | `#242424` | Filter pills, inputs, secondary buttons |
| `--bg-overlay` | `rgba(13,13,13,0.92)` | Modals, drawers |
| `--text-primary` | `#f0f0f0` | Headlines, event titles, primary content |
| `--text-secondary` | `#a0a0a0` | Venue names, supporting text |
| `--text-tertiary` | `#888888` | Dates, timestamps, metadata |
| `--text-muted` | `#444444` | Disabled states, captions |
| `--accent-primary` | `#f5e642` | CTAs, active states, date text, title hover |
| `--accent-secondary` | `#ef2c46` | Category badges |
| `--border-subtle` | `rgba(240,240,240,0.10)` | Section dividers, hairlines |
| `--border-default` | `rgba(240,240,240,0.40)` | Filter pills (default) |
| `--border-active` | `rgba(240,240,240,0.80)` | Filter pills (focus/hover) |
| `--status-error` | `#FF4458` | Error messages, inline errors |
| `--status-error-subtle` | `rgba(255,68,88,0.12)` | Error backgrounds |
| `--status-success` | `#34D399` | Success confirmations |
| `--status-success-subtle` | `rgba(52,211,153,0.12)` | Success backgrounds |
| `--status-warning` | `#FBBF24` | Warnings (reserved, not used in v1) |
| `--focus-ring` | `#58A6FF` | Keyboard focus indicator |
| `--focus-ring-invert` | `#0D1117` | Focus ring on light elements (yellow CTA) |

### Accent Color Usage Rules

`--accent-primary` (#f5e642) appears in exactly these contexts:
- Primary CTA button: background fill, `--bg-primary` text
- Active/selected filter pill: background fill, `--bg-primary` text
- Date text on event cards
- Event title color on card hover (instant flip, 0ms transition)
- Section label left-border rule (2px solid)

Nowhere else. Restraint is the system.

`--accent-secondary` (#ef2c46) appears in exactly these contexts:
- Event category badge: background fill, `#f0f0f0` text
- Nowhere else.

### Event Type Colors

| Event Type | Color | Usage |
|------------|-------|-------|
| Concert / Music | `#f5e642` | Badge bg, `--bg-primary` text |
| Theater | `#ef2c46` | Badge bg, `--bg-primary` text |
| Exhibition | `#7eb8f7` | Badge bg, `--bg-primary` text |
| Cinema | `#b87ef7` | Badge bg, `--bg-primary` text |
| Performance | `#f5a742` | Badge bg, `--bg-primary` text |
| Workshop | `#7ef7b8` | Badge bg, `--bg-primary` text |

Event type colors appear on badge backgrounds only. Never as text colors,
border colors, or in any other context.

### Image Treatment

**Event cards:** No overlay. Raw artwork. Let the event image speak.

**Detail page hero background:** The event's primary image rendered at full
container width, `filter: blur(40px)`, `opacity: 0.35`, `transform: scale(1.1)`
(scale prevents blur-edge artifacts at container boundaries), `position: absolute`
behind the detail page header. Content sits above in `--bg-elevated` zones.
Load as a separate element — can use the same `src` as the hero image but must
be positioned below all content z-layers.

**Missing image fallback:** `--bg-elevated` (#1a1a1a) background + centered
category icon at `rgba(240,240,240,0.08)`, `48px` size (40px on mobile).
Aspect ratio preserved (same as image cards). Icon from event type icon set —
communicates intentionality. Not a broken void — a branded placeholder.
Implemented as CSS `background-color` on the image wrapper div, not on the
`<img>` element.

**Optional editorial (featured card sets):** `mix-blend-mode: hue` overlay
at `#88a7ff` for visual coherence on curated image sets. Not systematic —
applied only when editorial intent requires it.

---

## 2. Typography

### Font Stack

**Status:** ✅ LOCKED — Manrope confirmed 2026-02-24

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&subset=greek,latin&display=swap');

:root {
  --font-primary: 'Manrope', system-ui, -apple-system, sans-serif;
  --font-weight-regular: 400;
  --font-weight-bold: 700;
}
```

| Role | Font | Weight | Fallback | Greek Support |
|------|------|--------|----------|---------------|
| Headings (hero, h1, h2, h3) | Manrope | 700 | system-ui, sans-serif | ✅ Native |
| Body, metadata, UI, badges | Manrope | 400 | system-ui, sans-serif | ✅ Native |
| Mono/Data | Not used in v1 | — | — | — |

**Strategy:** Single-family, two-weight system. Manrope Bold (700) for all
display and heading use. Manrope Regular (400) for body, metadata, UI labels.
No intermediate weights. The weight contrast is the entire typographic system.

**Performance:** Load two static weights (400 + 700) via Google Fonts CDN.
`display=swap` ensures text is visible immediately with system fallback, then
swaps to Manrope once loaded. Variable font option available (`wght@400..700`)
for smaller payload if build tooling supports it. Total: ~45KB both weights
with latin + greek subsets.

**Dark-mode font rendering (mandatory):**

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

Subpixel antialiasing causes light text on dark backgrounds to appear
significantly heavier on macOS (Überstrahlung/blooming artifact). This
2-line fix is essential for any dark-theme product. Applied globally —
no per-component overrides needed.

### Type Scale

| Token | Desktop | Mobile | Weight | Line-height | Usage |
|-------|---------|--------|--------|-------------|-------|
| `--text-hero` | 64px | 40px | 700 | 1.05 | Feature event title, page hero |
| `--text-h1` | 40px | 32px | 700 | 1.1 | Section headings, detail page title |
| `--text-h2` | 28px | 24px | 700 | 1.15 | Subsection heads, featured card title |
| `--text-h3` | 20px | 18px | 700 | 1.2 | Grid card title |
| `--text-body` | 16px | 16px | 400 | 1.55 | Descriptions, detail copy |
| `--text-small` | 14px | 13px | 400 | 1.4 | Venue, date metadata on cards |
| `--text-caption` | 11px | 11px | 400 | 1.0 | Badges, category labels |
| `--text-ui` | 12px | 12px | 400 | 1.0 | Filter labels, timestamps, counts |

**Greek note:** Card title line-height 1.2 minimum is non-negotiable. Greek
tonos and dialytika project above cap-height and need vertical clearance.
Pure 1.1 leading on Greek card titles causes diacritics to collide with
descenders on the line above.

### Letter-spacing Rules

| Context | Tracking | Rationale |
|---------|----------|-----------|
| Display / hero (hero, h1) | `–0.5px` | Tighten the mass at large sizes |
| Mid-scale headings (h2, h3) | `0` | Natural letterform spacing |
| All-caps labels and badges | `+0.8px` to `+1.5px` | Readable all-caps requires open tracking |
| Primary CTA (uppercase) | `+1.92px` | DICE BUY NOW precedent — the one emphatic moment |
| Body, metadata, UI | `0` | Optimize for legibility, not style |

**Rule:** Positive tracking is a white-background pattern (Onassis). On dark
backgrounds with near-white text it creates airiness that undermines Bold/Urban
density. Zero tracking is the dark-theme default.

### Line Heights & Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--leading-tight` | 1.05 | Hero display text |
| `--leading-snug` | 1.1–1.15 | Section headings |
| `--leading-card` | 1.2 | Card titles (Greek diacritic clearance) |
| `--leading-normal` | 1.55 | Body copy |
| `--leading-square` | 1.0 | Badges, labels, tight UI elements |

---

## 3. Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | Inline gaps, icon padding |
| `--space-sm` | `8px` | Card internal padding (tight) |
| `--space-md` | `16px` | Card internal padding, between related elements |
| `--space-lg` | `32px` | Between card grid elements, section padding |
| `--space-xl` | `64px` | Page-level section spacing |
| `--space-2xl` | `96px` | Major section breaks |

---

## 4. Grid & Layout

### Breakpoints

| Name | Width | Columns | Margin | Gutter |
|------|-------|---------|--------|--------|
| Mobile | < 768px | 1 | 16px | 16px |
| Tablet | 768–1024px | 2 | 24px | 24px |
| Desktop | 1024–1440px | 3 | 40px | 32px |
| Wide | > 1440px | 3 (max-width constrained) | auto | 32px |

### Page Max Width

`1320px` — content container max-width. Centered with auto margins above
1440px viewport. Grid cards compute to ~408px at desktop within this container.

### Card Grid Columns

Grid cards: 3 columns desktop / 2 columns tablet / 1 column mobile.
List rows: always 1 column, full container width.
Feature card: always 1 column, full container width.

### Stacking Context Isolation

Components with internal z-index layering must use `isolation: isolate` to
prevent z-index values from leaking outside their component boundary.

```css
.event-card,
.filter-bar,
.search-overlay,
.bottom-sheet,
.modal,
.detail-header {
  isolation: isolate;
}
```

This creates a local stacking context per component. A `z-index: 2` inside
a card stays inside that card — it cannot collide with z-index values in
sibling components or page-level layers.

---

## 5. Components

### Logo

```
Status: Specced — implementation ready
Type: Text wordmark, no icon/mark
Rendering: Plain HTML, no SVG asset needed
```

**Primary wordmark:**

```css
.logo {
  font-family: var(--font-primary);  /* Manrope */
  font-weight: 700;
  font-size: 18px;
  color: var(--text-primary);
  letter-spacing: -0.2px;
  text-transform: lowercase;
  text-decoration: none;
  white-space: nowrap;
}
```

Text: `"agent athens"` (or `"agent [city]"` for other cities). The word "agent" is the brand constant; the city name is the variable. Rendered as a single `<a>` element linking to homepage.

**Bilingual:** Logo does NOT translate. Always Latin characters, always "agent athens" regardless of active language. The city selector component handles bilingual city names separately.

**Favicon:**

```
Letterform: "a" from Manrope Bold
Sizes: 16×16, 32×32, 180×180 (apple-touch-icon)
Colors: --accent-primary (#f5e642) letter on --bg-primary (#0d0d0d)
Border-radius: 4px (32×32), 20% (apple-touch-icon)
Format: PNG (universal compatibility) + SVG for modern browsers
```

**Usage:** Nav bar (left group), footer (column 1), OG images (wordmark element).

---

### Event Card — Grid Variant

```
Status: Specced — implementation ready
Image ratio: 3:4 (padding-top: 133.33% on wrapper)
Corner radius: 8px on image wrapper
Card container: no border, no radius, no background
```

**Measurements:**
- Image wrapper: `position: relative; padding-top: 133.33%; overflow: hidden; border-radius: 8px`
- Image: `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover`
- Card body (below image): `padding: 12px 0 0 0` (no left/right padding — flush with grid)
- Category badge: `position: absolute; bottom: 8px; left: 8px` on image wrapper

**Typography inside card:**
- Category badge: `--text-caption` (11px/400/lh1.0) / uppercase / `+1.2px` tracking / event type background color
- Event title: `--text-h3` (20px/700/lh1.2) / `--text-primary`
- Date: `--text-small` (14px/400) / `--accent-primary` (#f5e642)
- Venue + neighborhood: `--text-small` (14px/400) / `--text-secondary`
- Price: `--text-small` (14px/400) / `--text-tertiary` / right-aligned or inline after venue

**States:**
- Default: as above
- Hover: title color → `--accent-primary`, instant (0ms). No image scale, no overlay.
- Focus (keyboard): `outline: 2px solid var(--focus-ring); outline-offset: -2px` on card link
- Loading: skeleton — `--bg-surface` (#242424) rectangle at 3:4 ratio + 3 text line skeletons below

**Missing image:** `--bg-elevated` (#1a1a1a) + category icon centered at `rgba(240,240,240,0.08)` / 32px

**Text truncation:**
- Event title: 2-line max, `overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical`
- Greek note: Title field must accommodate strings up to 35% longer than English equivalents. Two-line clamp is the safety valve.

---

### Event Card — List Row Variant

```
Status: Specced — implementation ready
Image ratio: 16:9 (padding-top: 56.25%)
Image width: 200px fixed (desktop), 120px (mobile)
Layout: image left + content right, flexbox
```

**Measurements:**
- Row: `display: flex; gap: 16px; padding: 16px 0; border-top: 1px solid rgba(240,240,240,0.10)`
- Image wrapper: `width: 200px; flex-shrink: 0; position: relative; padding-top: calc(200px * 0.5625)` — use explicit height instead: `width: 200px; height: 112px`
- Content column: `flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px`

**Typography inside list row:**
- Category badge: same as grid card badge
- Event title: `--text-h3` (20px/700/lh1.2) / `--text-primary`
- Date: `--text-small` (14px/400) / `--accent-primary`
- Venue + neighborhood: `--text-small` (14px/400) / `--text-secondary`
- Price: `--text-small` (14px/400) / `--text-tertiary`

**States:** Same hover rule — title color → `--accent-primary`, 0ms.

---

### Event Card — Feature Variant

```
Status: Specced — implementation ready
Image ratio: 16:9 (full container width)
One per section maximum
```

**Measurements:**
- Feature container: full grid container width
- Image wrapper: `position: relative; padding-top: 56.25%; overflow: hidden; border-radius: 8px`
- Image: `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover`
- Hover image: `transform: scale(1.02); transition: transform var(--t-base) var(--ease-out)` — the one card with image scale
- Content below image: `padding: 16px 0 0 0`

**Typography:**
- Category badge: same spec as grid card
- Title: `--text-h2` (28px/700/lh1.15) / `--text-primary`
- Date: `--text-body` (16px/400) / `--accent-primary`
- Venue: `--text-body` (16px/400) / `--text-secondary`
- Description excerpt (optional, 2 lines max): `--text-body` (16px/400) / `--text-secondary`

---

### Filter Bar

```
Status: Specced — implementation ready
```

**Filter Bar Container:**

```css
.filter-bar {
  position: sticky;
  top: 64px; /* desktop nav height */
  z-index: 99;
  height: 56px; /* desktop */
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 40px;
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto; /* mobile horizontal scroll */
}

@media (max-width: 767px) {
  .filter-bar {
    top: calc(56px + env(safe-area-inset-top, 0px));
    height: 52px;
    padding: 0 16px;
  }
}
```

**Filter Pill States:**

*Default:* `transparent` bg / `1px solid --border-default` / `12px/400 --text-secondary` / chevron icon right / `padding: 8px 16px` / `border-radius: 20px` / `white-space: nowrap`

*Hover:* `--border-active` border / `--text-primary` text / instant (0ms)

*Open (panel visible):* `--bg-surface` bg / `--border-active` border / `--text-primary` / chevron rotated 180°

*Active (filter applied, closed):* `--accent-primary` bg / no border / `--bg-primary` text / `12px/700` / × dismiss icon replaces chevron / Hover: bg → `#e0d23a`

*Mobile pill min-height:* 44px / `padding: 10px 16px`

**All pill transitions: 0ms (instant)**

**Filter Pills (left to right):**

1. **Ημερομηνία / Date**
2. **Τύπος / Type**
3. **Περιοχή / Area**
4. **Τιμή / Price**
5. **Ταξινόμηση / Sort**
6. **Καθαρισμός / Clear all** — text link, `--text-ui` (12px/400) / `--text-tertiary`, hover: `--text-primary` underline, visible only when ≥1 filter active, `gap: 16px` from last pill

**Result Count:**

Desktop: right-aligned in filter bar. `12px/400 --text-tertiary`. "42 events" / "42 εκδηλώσεις". Live update on filter change.

Mobile: hidden in bar, shown inside panel footer CTA ("Show 42 results").

**Desktop Filter Panel:**

```css
.filter-panel {
  position: absolute;
  top: 100%; /* below filter bar */
  /* left: aligned to trigger pill left edge */
  min-width: 280px;
  max-width: 360px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-elevated); /* #1a1a1a */
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  padding: 16px;
  z-index: 98;
}
```

Entrance: `opacity 0→1, translateY(-4px→0), var(--t-fast) var(--ease-out)` (120ms). Exit: `opacity 1→0, var(--t-micro) var(--ease-out)` (80ms).

Backdrop (click-to-dismiss): `position: fixed; inset: 0; background: transparent; z-index: 97`.

Panel footer (sticky at bottom): `border-top: 1px solid --border-subtle; padding-top: 12px; flexbox space-between`. Left: "Reset" / "Επαναφορά" (`--text-secondary, 12px/400`). Right: "Show N results" / "Εμφάνιση N" mini CTA (`--accent-primary bg, --bg-primary text, 12px/700/uppercase, padding: 8px 16px, border-radius: 16px`).

**Mobile Bottom Sheet:**

```css
.bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 70vh;
  background: var(--bg-elevated); /* #1a1a1a */
  border-radius: 16px 16px 0 0;
  padding: 16px 16px 24px 16px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  z-index: 110;
}

.bottom-sheet-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay); /* rgba(13,13,13,0.92) */
  z-index: 109;
}
```

Handle bar: `width: 40px; height: 4px; background: --bg-surface; border-radius: 2px; centered; margin-bottom: 16px`.

Entrance: `translateY(100%→0), var(--t-deliberate) var(--ease-out-hard)` (500ms). Exit: `translateY(0→100%), var(--t-base) var(--ease-out)` (150ms). Backdrop: `opacity var(--t-moderate) var(--ease-out)` (200ms).

Footer: same as desktop panel footer. "Show N results" button full-width on mobile. `position: sticky` at bottom of sheet.

**Date Panel Content:**

Quick selectors: flexbox wrap, gap 8px. Same pill styling but smaller: `padding: 6px 14px, border-radius: 16px`. Labels: Σήμερα/Today, Αύριο/Tomorrow, Σ/Κ/Weekend, Εβδομάδα/This Week. Active: `--accent-primary bg, --bg-primary text`.

Calendar: month grid, 7 columns. Month header: `14px/700 --text-primary` + ← → arrows. Day headers: `11px/400 --text-tertiary uppercase` — Δ Τ Τ Π Π Σ Κ / M T W T F S S. Week starts Monday.

Day cells: `36×36px` touch target (44×44px on mobile via expanded grid cell). Today: text in `--accent-primary`. Selected: `--accent-primary` fill, `--bg-primary` text, `border-radius: 50%`. Range middle: `--accent-primary` at 15% opacity fill. Past dates: `--text-muted`, not interactive. Hover: `--bg-surface` fill, `border-radius: 50%`.

Divider between quick selectors and calendar: `1px solid --border-subtle, margin: 12px 0`.

**Event Type Panel Content:**

Tile grid: CSS grid, 2 columns, gap 8px. Tile: `--bg-surface bg, 1px solid --border-subtle, border-radius: 8px, padding: 10px 14px, flexbox align-center gap 8px`. Color dot: 8px circle, event type color. Label: `12px/400 --text-secondary`. Count: `12px/400 --text-tertiary`, right-aligned. Hover: `--border-default` border, `--text-primary` text. Selected: event type color at 15% opacity bg, 1px solid event type color at 40% opacity, label `--text-primary/700`.

Types: 🎵 Μουσική/Music `#f5e642` · 🎭 Θέατρο/Theater `#ef2c46` · 🖼️ Έκθεση/Exhibition `#7eb8f7` · 🎬 Σινεμά/Cinema `#b87ef7` · 🎪 Παράσταση/Performance `#f5a742` · 🔧 Εργαστήριο/Workshop `#7ef7b8`.

**Neighborhood Panel Content:**

Vertical stack, gap 4px. Row: `padding: 10px 14px, border-radius: 8px, flexbox space-between`. Left: name `14px/400 --text-secondary`. Right: count `12px/400 --text-tertiary`. Hover: `--bg-surface bg, --text-primary`. Selected: `--bg-surface bg, left border 2px solid --accent-primary, name --text-primary/700, checkmark --accent-primary 14px`. Multi-select.

**Price Panel Content:**

Radio-style single select. Vertical stack, gap 4px. Row: `padding: 10px 14px, border-radius: 8px, flexbox align-center gap 10px`. Radio circle: `18px, border 2px solid --border-default`. Selected: `--accent-primary` inner fill (10px), border `--accent-primary`. Label: `14px/400 --text-secondary`. Selected label: `--text-primary`. Count: `12px/400 --text-tertiary`, right-aligned.

Options: Ελεύθερη είσοδος/Open entry · Έως €15/Under €15 · Έως €30/Under €30 · Οποιαδήποτε τιμή/Any Price.

**Sort Panel Content:**

Same radio structure as Price. Options: Ημερομηνία/Date (default) · Δημοφιλία/Popularity · Τιμή/Price (low to high).

### Navigation

```
Status: Specced — implementation ready
```

**Nav Bar:**

```css
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 64px; /* desktop */
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 40px;
  padding-top: env(safe-area-inset-top, 0px);
}

@media (max-width: 767px) {
  .site-header {
    height: 56px;
    padding: 0 16px;
    padding-top: env(safe-area-inset-top, 0px);
  }
}
```

Inner layout: `max-width: 1320px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; height: 100%`.

**Left group** (gap: 16px): Logo (`"agent athens"` text, `18px/700 --text-primary`, `letter-spacing: -0.2px`, lowercase, plain HTML — no SVG asset) + City selector (flag emoji + city name `14px/400 --text-secondary` + chevron `12px`; hover: `--text-primary`, instant).

**Right group** (gap: 12px desktop, 8px mobile): Search icon (`20px, --text-secondary`, 44×44px tap target, hover: `--text-primary`) + Language toggle + CTA (desktop only).

**Mobile right group:** Search icon + Language toggle + Hamburger (44×44px).

**Language Toggle:**

Active language: `--text-primary` + 2px `--accent-primary` underline. Inactive: `--text-tertiary`. Style: `11px/400/uppercase/+0.8px tracking`. Always visible — not buried in settings.

**Hamburger Menu (≤767px):**

Trigger: 44×44px button, rightmost in nav. Icon: three lines, 20px wide, 2px stroke, `--text-secondary`. Active: `--text-primary`.

```css
.hamburger-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--bg-overlay); /* rgba(13,13,13,0.92) */
  backdrop-filter: blur(8px);
}

.menu-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 100%;
  max-width: 320px;
  height: 100vh;
  height: 100dvh;
  background: var(--bg-elevated); /* #1a1a1a */
  padding: 24px 16px;
  padding-top: calc(24px + env(safe-area-inset-top, 0px));
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  z-index: 201;
  overflow-y: auto;
}
```

Overlay entrance: `opacity 0→1, var(--t-moderate) var(--ease-out)` (200ms). Exit: `opacity 1→0, var(--t-base) var(--ease-out)` (150ms).
Panel entrance: `translateX(100%→0), 250ms var(--ease-out)`. Exit: `translateX(0→100%), 200ms var(--ease-out)`.

Close button: `position: absolute; top: 16px; right: 16px; 44×44px; × icon 20px --text-secondary`.

Menu rows: `height: 56px; padding: 0 16px; border-bottom: 1px solid var(--border-subtle); 16px/400 --text-primary`. Active page: `text → --accent-primary, left border 2px --accent-primary`.

Menu items (v1): Browse Events / Εκδηλώσεις · Language toggle · About / Σχετικά.

Body scroll locked when menu is open (`document.body overflow: hidden`).

### Event Detail Header

```
Status: Specced — implementation ready
Layout: Single column, max-width 800px centered within page container
Background: Blurred event artwork (all breakpoints)
```

**Structure:**
```
.detail-page
  └── .detail-header (full page-container width, position: relative, overflow: hidden)
  │     └── .detail-header-bg (blurred artwork, position: absolute, z-index: 0)
  │     └── .detail-header-content (max-width: 800px, centered, z-index: 1)
  │           ├── category badge
  │           ├── event title (hero)
  │           ├── date + time
  │           ├── venue + neighborhood
  │           ├── price
  │           └── CTA button
  └── .detail-content (max-width: 800px, centered)
  │     ├── .detail-section: Event Image
  │     ├── .detail-section: Description
  │     ├── .detail-section: Lineup (conditional)
  │     ├── .detail-section: Details (conditional)
  │     ├── .detail-section: Venue
  │     └── .detail-section: Source Attribution
  └── .detail-related (full page-container width)
  │     └── Related Events (standard card grid)
  └── .detail-bottom-bar (mobile only, fixed)
```

**Header measurements:**
- `.detail-header`: `position: relative; overflow: hidden; padding: 64px 0 48px` (desktop) / `40px 0 32px` (mobile)
- `.detail-header-bg`: `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(40px); opacity: 0.35; transform: scale(1.1); z-index: 0`
- `.detail-header-content`: `position: relative; z-index: 1; max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; padding: 0 40px` (desktop) / `0 16px` (mobile)

**Typography within header:**
- Category badge: `--text-caption` (11px/400/lh1.0) / uppercase / `+1.2px` tracking / event type bg color
- Title: `--text-hero` (64px/700/lh1.05/tracking –0.5px desktop, 40px mobile) / `--text-primary` / **no line clamp** — full title always visible
- Date + time: `--text-h2` (28px/700/lh1.15 desktop, 24px mobile) / `--accent-primary`
- Venue + neighborhood: `--text-body` (16px/400/lh1.55) / `--text-secondary` / venue name underlined as link
- Price: `--text-body` (16px/400) / `--text-primary`
- CTA: Primary CTA Button (pill, `--accent-primary` bg, `--bg-primary` text, 700 uppercase, +1.92px tracking, `padding: 12px 24px`, `border-radius: 20px`). Label: "Get Tickets →" / "Κλείστε Θέση →". `target="_blank" rel="noopener"`.

**Content zone measurements:**
- `.detail-content`: `max-width: 800px; margin: 0 auto; padding: 0 40px` (desktop) / `0 16px` (mobile)
- `.detail-section`: `margin-top: 64px` (desktop) / `32px` (mobile)
- `.detail-section-label`: `--text-ui` (12px/400/uppercase/+1.2px) / `--text-tertiary` / `margin-bottom: 16px`

**Section specs:**

*Event Image:*
- Image wrapper: `padding-top: 56.25%; border-radius: 8px; overflow: hidden; position: relative`
- Image: `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover`
- No overlay. Raw artwork.

*Description:*
- Body: `--text-body` (16px/400/lh1.55) / `--text-primary`
- Truncated at 4 lines: `-webkit-line-clamp: 4`
- "Read more" / "Περισσότερα": `--text-small` (14px/400) / `--accent-primary` / `cursor: pointer` / `margin-top: 8px`
- Expanded: no clamp, full text inline

*Lineup:*
- Section label: "LINEUP" / "ΣΥΜΜΕΤΕΧΟΝΤΕΣ"
- Each name: `--text-h3` (20px/700/lh1.2) / `--text-primary`
- Stacked vertically, `gap: 12px`
- Section omitted entirely if no lineup data

*Details:*
- Key-value pairs, vertical stack
- Label: `--text-ui` (12px/400/uppercase/+1.2px) / `--text-tertiary`
- Value: `--text-small` (14px/400) / `--text-primary`
- Gap between pairs: `16px`
- Section omitted if no structured data

*Venue:*
- Venue name: `--text-h2` (28px/700/lh1.15) / `--text-primary`
- Address: `--text-small` (14px/400) / `--text-secondary`
- Neighborhood: `--text-small` (14px/400) / `--text-secondary` — inline after address, separated by " · "
- "Open in Maps →": `--text-small` (14px/400) / `--accent-primary` / underline on hover / external link new tab
- No map embed in v1

*Source Attribution:*
- "Found on [Source Name]": `--text-ui` (12px/400) / `--text-tertiary`
- Source name as link: `--accent-primary` on hover

*Related Events:*
- Section heading: `--text-h2` (28px/700) / `--text-primary` — "More in [Neighborhood]" or "More [Category]"
- Full page-container width (breaks out of 800px content column)
- Standard card grid: 3 columns desktop / 2 tablet / horizontal scroll mobile
- Uses Grid Card component (already specced)

**Mobile bottom bar (≤768px only):**
- `.detail-bottom-bar`: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 100; background: var(--bg-elevated); border-top: 1px solid var(--border-subtle); border-radius: 12px 12px 0 0; box-shadow: 0 -4px 24px rgba(0,0,0,0.4); padding: 12px 16px; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); display: flex; align-items: center; justify-content: space-between`
- Event title summary: `--text-small` (14px/400) / `--text-primary` / single-line truncate
- Price + venue: `--text-caption` (11px/400) / `--text-tertiary` / format: "€15 · Venue Name"
- CTA button: Primary CTA, `min-height: 44px`, `padding: 10px 20px` / `flex-shrink: 0`
- Body `padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px))` when bar is visible

**States:**
- Default: as above
- CTA hover: background darkens to `#e0d23a` (instant, 0ms)
- Venue link hover: underline appears
- "Read more" hover: underline
- Loading: skeleton — blurred bg placeholder (`--bg-surface`), text line skeletons in header zone

### Map View

```
Status: Deferred to v2
v1 approach: Neighborhood filter (§5 Filter Bar) + "Open in Maps →" external links (§5 Event Detail)
v2 candidate: Mobile toggle map view with dark-themed tiles, neighborhood-level
              density pins, and Airbnb-style bottom peek-strip card carousel
Rationale: Zero event platforms (DICE, RA, Timeout) implement browse-level maps.
           Geographic discovery handled through neighborhood filter dimension.
```

### Date/Time Selector

```
Status: Specced — implementation ready
```

Quick selectors: pill row (flexbox wrap, gap 8px). Labels: Σήμερα/Today, Αύριο/Tomorrow, Σ/Κ/Weekend, Εβδομάδα/This Week. Same pill styling as filter pills but smaller: `padding: 6px 14px`, `border-radius: 16px`. Active: `--accent-primary` bg, `--bg-primary` text.

Calendar: month grid, 7 columns, `36px × 36px` day cells (44×44px touch target on mobile via expanded grid cell). Week starts Monday. Month header: `14px/700 --text-primary` + ← → navigation arrows. Day headers: `11px/400 --text-tertiary uppercase` — Δ Τ Τ Π Π Σ Κ / M T W T F S S.

Today: text in `--accent-primary`, no fill. Selected: `--accent-primary` fill, `--bg-primary` text, `border-radius: 50%`. Range start/end: same as selected. Range middle: `--accent-primary` at 15% opacity fill, `--text-primary` text. Past dates: `--text-muted` (#444444), not interactive. Hover (future dates): `--bg-surface` fill, `border-radius: 50%`.

Date range selection: tap start date, tap end date. Both shown as solid circles, days between at 15% opacity.

### Featured Carousel (Mobile)

```
Status: Specced — implementation ready
Breakpoint: ≤767px only (desktop uses Feature Card component)
```

**Container:** `overflow-x: auto; -webkit-overflow-scrolling: touch; scroll-snap-type: x mandatory; display: flex; gap: 12px; padding: 0 16px`.

**Card:** `width: 200px; flex-shrink: 0; scroll-snap-align: start`.

**Card image:** `200×150px; border-radius: 8px; overflow: hidden; object-fit: cover`.

**Card body:** `padding: 8px 0 0 0`.
- Title: `--text-small` (14px/700) / `--text-primary` / 1-line clamp
- Date: `--text-ui` (12px/400) / `--accent-primary`
- Venue: `--text-ui` (12px/400) / `--text-secondary` / 1-line clamp

No scroll indicators (dots, arrows). Visual edge clipping of the next card signals scrollability.

### Date Group Header

```
Status: Specced — implementation ready
```

Sticky header for date-grouped event lists on browse page.

```css
.date-group-header {
  position: sticky;
  top: calc(64px + 56px); /* nav + filter bar, desktop */
  z-index: 98;
  background: var(--bg-primary);
  padding: 16px 40px 8px 40px;
  border-bottom: 1px solid var(--border-subtle);
}

@media (max-width: 767px) {
  .date-group-header {
    top: calc(56px + 52px + env(safe-area-inset-top, 0px));
    padding: 16px 16px 8px 16px;
  }
}
```

Date text: `--text-h3` (20px/700 desktop, 18px/700 mobile) / `--text-primary`. Day of week inline, `--text-secondary`. Format: "Σάββατο, 22 Φεβρουαρίου" / "Saturday, 22 February". Abbreviated mobile: "Σάβ, 22 Φεβ" / "Sat, 22 Feb".

Event count (optional, right-aligned): `--text-ui` (12px/400) / `--text-tertiary` — "8 events" / "8 εκδηλώσεις".

### Primary CTA Button

```
Status: Specced — implementation ready
```

**Spec:**
- Background: `--accent-primary` (#f5e642)
- Text: `--bg-primary` (#0d0d0d)
- Text style: `--text-caption` (11px) or `--text-ui` (12px) / weight 700 / uppercase / `+1.92px` tracking
- Border-radius: `20px` (pill shape)
- Padding: `12px 24px` (standard) / `10px 20px` (compact, e.g., mobile bottom bar)
- Hover: background darkens to `#e0d23a` — instant (0ms)
- Focus: `outline: 2px solid var(--focus-ring-invert); outline-offset: 2px`
- Full-width variant (mobile detail page header): `width: 100%; text-align: center`
- External link variant: includes trailing arrow "→" in label, `target="_blank" rel="noopener"`

---

### Site Footer

```
Status: Specced — implementation ready
```

**Structure:**

```
.site-footer
  └── .footer-inner (max-width: 1320px, centered)
        ├── .footer-grid (3 columns desktop, stack mobile)
        │     ├── Column 1: Brand
        │     │     ├── Logo wordmark ("agent athens", 18px/700, see Logo component)
        │     │     └── Tagline (14px/400 --text-tertiary)
        │     ├── Column 2: Εξερεύνηση / Explore
        │     │     ├── Εκδηλώσεις / Events → /events/
        │     │     ├── Χώροι / Venues → /venues/ (v2)
        │     │     └── Χάρτης / Map → /map/ (v2)
        │     └── Column 3: Σχετικά / About
        │           ├── Σχετικά / About → /about/
        │           ├── Μεθοδολογία / Editorial → /editorial/
        │           └── Διορθώσεις / Corrections → /corrections/
        └── .footer-bottom (full width, divider above)
              ├── © 2026 agent athens (left)
              └── Language toggle (right, same component as nav)
```

**Container:**

```css
.site-footer {
  background: var(--bg-elevated);  /* #1a1a1a */
  border-top: 1px solid var(--border-subtle);
  padding: 48px 40px 24px;
  margin-top: 96px;
}

@media (max-width: 767px) {
  .site-footer {
    padding: 32px 16px 20px;
    margin-top: 64px;
  }
}

.footer-inner {
  max-width: 1320px;
  margin: 0 auto;
}
```

**Grid:**

```css
.footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 40px;
}

@media (max-width: 767px) {
  .footer-grid {
    grid-template-columns: 1fr;
    gap: 32px;
  }
}
```

**Typography:**

| Element | Spec |
|---------|------|
| Column headers | `--text-ui` (12px/400/uppercase/+1.2px) / `--text-tertiary` / `margin-bottom: 16px` |
| Footer links | `--text-small` (14px/400/lh1.4) / `--text-secondary` / `margin-bottom: 8px` between links |
| Brand logo text | Same as Logo component: `18px/700 --text-primary`, `letter-spacing: -0.2px` |
| Tagline | `--text-small` (14px/400) / `--text-tertiary` / `margin-top: 8px` |
| Copyright | `--text-caption` (11px/400) / `--text-muted` (#444444) |

**Link states:**

- Default: `--text-secondary`
- Hover: `--text-primary` / transition: 0ms
- Active page: `--accent-primary`
- No underlines in footer links

**Footer bottom divider:**

```css
.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}
```

**Language toggle:** Same component as nav bar. Reused, not duplicated.

**Bilingual:** Column headers switch with language: "Εξερεύνηση" / "Explore", "Σχετικά" / "About". Tagline: "Ημερήσια ενημέρωση πολιτιστικών εκδηλώσεων" / "Daily-updated cultural events" — Greek is ~60% longer, tagline is auto-width.

**Mobile:** Columns stack. All footer links meet 44px min tap target via line-height + margin. Copyright and language toggle row stays `flex` horizontal.

---

### Static Content Page Template

```
Status: Specced — implementation ready
Used by: /about/, /editorial/, /corrections/
Layout: Single column, max-width 800px centered
Background: Plain --bg-primary (no blurred header, no hero)
```

**Page structure:**

```
.content-page
  └── .site-header (standard nav, sticky)
  └── .content-page-body (max-width: 800px, centered)
  │     ├── h1.content-page-title
  │     ├── body text (paragraphs, headings, lists, links)
  │     └── ...
  └── .site-footer (standard footer)
```

**Container:**

```css
.content-page {
  padding-top: 64px;
  padding-bottom: 96px;
}

@media (max-width: 767px) {
  .content-page {
    padding-top: 40px;
    padding-bottom: 64px;
  }
}

.content-page-body {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 40px;
}

@media (max-width: 767px) {
  .content-page-body {
    padding: 0 16px;
  }
}
```

**Typography inside content pages:**

| Element | Spec |
|---------|------|
| Page title (h1) | `--text-h1` (40px/700/lh1.1 desktop, 32px mobile) / `--text-primary` / `margin-bottom: 32px` |
| Section heading (h2) | `--text-h2` (28px/700/lh1.15 desktop, 24px mobile) / `--text-primary` / `margin-top: 48px` / `margin-bottom: 16px` |
| Sub-heading (h3) | `--text-h3` (20px/700/lh1.2 desktop, 18px mobile) / `--text-primary` / `margin-top: 32px` / `margin-bottom: 12px` |
| Body paragraph | `--text-body` (16px/400/lh1.55) / `--text-primary` / `margin-bottom: 24px` |
| Inline links | `--accent-primary` (#f5e642) / no underline default / underline on hover / transition: 0ms |
| Email addresses | Same as inline links |

**Lists (ordered and unordered):**

```css
.content-page-body ul,
.content-page-body ol {
  padding-left: 24px;
  margin: 16px 0;
}

.content-page-body li {
  font-size: 16px;          /* --text-body */
  font-weight: 400;
  line-height: 1.55;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.content-page-body ul li::marker {
  color: var(--text-tertiary);
}

.content-page-body ol li::marker {
  color: var(--text-primary);
  font-weight: 400;
}
```

**Paragraph spacing note:** 24px between paragraphs (vs typical 16px) supports the longer-form reading these pages require. This is intentionally more generous than event description body text.

**Bilingual:** Greek body at 800px/16px = ~55 chars/line — within optimal range. Greek h1 titles are longer but auto-width handles it. Section headings (h2, h3) auto-width, no truncation.

**Mobile:** Same single column. Padding 40px → 16px. Type scale follows mobile specs. No structural changes.

**Edge cases:**
- Very long h1 (e.g., Greek "Πολιτική Διορθώσεων"): wraps naturally, no issue at 800px
- Page with no h2/h3 (Corrections page is short): template works — just h1 + paragraphs
- External links in body: same `--accent-primary` styling, `target="_blank" rel="noopener"` where appropriate

---

### Hub Page Template

```
Status: Specced — implementation ready
Used by: All 18 hub pages (see taxonomy below)
Layout: Single column, max-width 1320px, 5-part template
Background: --bg-primary
Cornerstone tier: 5 hubs with elevated content (same template)
```

Hub pages are agent-athens's most important page type. They replace thin combinatorial
pages with editorially rich, AI-optimized hubs. Each follows a mandatory 5-part
structure in this exact order (HTML source order is non-negotiable for GEO):

**Page structure:**

```
.hub-page
  └── .site-header (standard nav, sticky)
  └── .hub-content (max-width: 1320px, centered)
  │     ├── .hub-answer-capsule (FIRST in source — extraction target)
  │     ├── .hub-comparison-table
  │     ├── .hub-event-blocks
  │     ├── .hub-faq
  │     └── .hub-seasonal-narrative
  └── .site-footer (standard footer)
```

**Page-level specs (two tiers):**

Standard hubs (13 pages):
- Target word count: 1,500–2,500 editorial + dynamic event listings
- 4–5 FAQ entries
- Editorial-to-listing ratio: 60/40
- Comparison table: optional

Cornerstone hubs (5 pages: `/today`, `/this-week`, `/this-weekend`, monthly roundup, `/open`):
- Target word count: 3,000+ editorial + dynamic event listings
- 8+ FAQ entries (with "Show more" overflow — see FAQ spec)
- 20+ statistics
- Comparison table: mandatory
- Monthly editorial refresh
- Expected to absorb 70–90% of AI citations

Both tiers share the same template. The distinction is content volume, not visual
treatment. No user-facing badges or nav differentiation for cornerstone pages.

**Shared metrics (both tiers):**
- Target proper noun density: ~20%
- A statistic every 150–200 words
- 19+ data points per page

#### Part 1: Answer Capsule

The first content block — both visually and in HTML source order. This is the primary
AI extraction target ("featured snippet" of the page).

```css
.hub-answer-capsule {
  padding: 32px;
  background: var(--bg-elevated); /* #1a1a1a */
  border-left: 3px solid var(--accent-primary); /* #f5e642 */
  border-radius: 0 12px 12px 0;
  margin-bottom: 48px;
}

@media (max-width: 767px) {
  .hub-answer-capsule {
    padding: 24px 16px;
    margin-bottom: 32px;
  }
}
```

**Content:** 40–60 words, directly answering "What are the best [category] events
in Athens?"

**Typography:**
- Text: `--text-body` (16px/400/lh1.55) / `--text-primary`
- No heading inside — the capsule IS the answer
- Event count inline: "**23 live music events** this week in Athens" — count in
  `--text-body` at 700 weight, `--accent-primary` color

**Bilingual:** Greek version will be 15–20% longer. Container is auto-height.
Both versions must feel like a complete, confident answer.

**Freshness signal:** Event count updates with each build. This dynamic number
is the capsule's freshness heartbeat.

#### Part 2: Comparison Table

Must be a real `<table>` element — not a CSS grid or flexbox that looks like a table.
AI engines parse `<table>` as structured data and extract it specially.

```css
.hub-comparison-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 48px;
}

.hub-comparison-table th {
  font-size: 12px; /* --text-ui */
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--text-tertiary);
  text-align: left;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.hub-comparison-table td {
  font-size: 14px; /* --text-small */
  font-weight: 400;
  color: var(--text-primary);
  padding: 16px;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: top;
}

.hub-comparison-table tr:hover td {
  background: var(--bg-elevated); /* #1a1a1a */
}
```

**Columns (7 total):**

| Column | Content | Typography |
|--------|---------|-----------|
| Event Name | Linked to event page | `14px/700 --text-primary`, hover: `--accent-primary` |
| Venue | Venue name, linked to venue page when available | `14px/400 --text-secondary` |
| Neighborhood | Athens neighborhood (entity-locked) | `14px/400 --text-tertiary` |
| Date(s) | Formatted date | `14px/400 --accent-primary` |
| Category | Event type | Badge component (same as card badge) |
| Price | "Open" or "From €XX" | `14px/400 --text-tertiary` |
| Editor's Pick | ★ badge | `--accent-primary`, only when applicable |

**Neighborhood column:** Provides structured location data for "near me" / location
queries. Entity-locked: Greek on Greek pages ("Κουκάκι"), Latin transliteration on
English pages ("Koukaki"). Pages with data tables earn 4.1× more AI citations —
this column maximizes location-query extractability.

**Price column uses project terminology:** "Open" / "From €XX" — never "Free" / "Paid".

**Editor's Pick badge:**
```css
.editor-pick-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-primary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
```
EL: `"★ ΕΠΙΛΟΓΗ"` / EN: `"★ PICK"`

**Responsive (mobile):**

Table scrolls horizontally on mobile. Event Name and Date columns always visible
(pinned left). All 7 columns remain in DOM — no column hiding for GEO compliance.

```css
.hub-comparison-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0 -16px; /* bleed to edges on mobile */
  padding: 0 16px;
}
```

Do NOT hide columns on mobile — all data must remain in DOM for AI extraction.
Shadow indicators on scroll edges: `box-shadow: inset -16px 0 12px -12px rgba(0,0,0,0.4)`.

**Sortable (progressive enhancement):** JS-enhanced column sort. Base HTML contains
all data regardless. Sort indicator: chevron icon, `12px`, `--text-tertiary`, active:
`--text-primary`.

#### Part 3: Event Blocks

Each event within a hub follows a three-part editorial pattern. Designed as visually
distinct cards/sections.

```css
.hub-event-block {
  padding: 32px;
  background: var(--bg-elevated); /* #1a1a1a */
  border-radius: 12px;
  margin-bottom: 24px;
}

@media (max-width: 767px) {
  .hub-event-block {
    padding: 24px 16px;
    margin-bottom: 16px;
  }
}
```

**Internal structure:**

```
.hub-event-block
  ├── .hub-event-header (flexbox: title left, badge + price right)
  │     ├── Event title (h3): --text-h2 (28px/700/lh1.15, 24px mobile) / --text-primary
  │     ├── Category badge (standard badge component)
  │     └── Price: --text-small (14px/400) / --text-tertiary
  ├── .hub-event-meta (below header, 8px gap)
  │     ├── Venue + neighborhood: --text-small (14px/400) / --text-secondary
  │     └── Date(s): --text-small (14px/400) / --accent-primary
  ├── .hub-event-what (16px gap above) — "What is it?"
  │     └── 1–2 factual sentences: --text-body (16px/400/lh1.55) / --text-primary
  ├── .hub-event-why (12px gap above) — "Why it matters"
  │     └── 2–3 cultural context sentences + attributed quote
  │         Quote: --text-body / --text-secondary, italic
  │         Attribution: --text-small (14px/400) / --text-tertiary
  └── .hub-event-tip (12px gap above) — "What to expect"
        └── 1 insider tip: --text-small (14px/400) / --text-secondary
            Tip icon: lightbulb or star, 14px, --accent-primary, inline-start
```

**Section labels (optional, light):**

"What is it?" / "Why it matters" / "What to expect" labels are NOT displayed visually.
They exist as `aria-label` on each subsection for screen readers, and as implicit
structure in the prose. The three-part pattern is editorial, not UI chrome.

**Schema.org:** Each event block includes Event structured data. JSON-LD in `<head>`
references the block's content.

#### Part 4: FAQ Section

Accordion/expandable format for UX. **The answers MUST be in the HTML source on page
load** — not loaded on click via JavaScript. AI engines won't see JS-loaded content.
Gets `FAQPage` schema markup.

```css
.hub-faq {
  margin-top: 64px;
  margin-bottom: 48px;
}

@media (max-width: 767px) {
  .hub-faq {
    margin-top: 40px;
    margin-bottom: 32px;
  }
}

.hub-faq-heading {
  font-size: 28px; /* --text-h2 */
  font-weight: 700;
  line-height: 1.15;
  color: var(--text-primary);
  margin-bottom: 24px;
}

@media (max-width: 767px) {
  .hub-faq-heading {
    font-size: 24px;
  }
}
```

EL: `"Συχνές Ερωτήσεις"` / EN: `"Frequently Asked Questions"`

**FAQ Item:**

```css
.faq-item {
  border-bottom: 1px solid var(--border-subtle);
}

.faq-question {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 20px 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-primary);
  font-size: 16px; /* --text-body */
  font-weight: 700;
  line-height: 1.4;
  color: var(--text-primary);
}

.faq-question:hover {
  color: var(--accent-primary);
  /* instant, 0ms */
}

.faq-chevron {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  margin-left: 16px;
  transition: transform var(--t-fast) var(--ease-out); /* 120ms */
}

.faq-item[open] .faq-chevron {
  transform: rotate(180deg);
}

.faq-answer {
  padding: 0 0 20px 0;
  font-size: 16px; /* --text-body */
  font-weight: 400;
  line-height: 1.55;
  color: var(--text-secondary);
}
```

**HTML pattern (uses `<details>/<summary>` for no-JS operation):**

```html
<details class="faq-item" open> <!-- first item open by default -->
  <summary class="faq-question">
    <span>Question text here?</span>
    <svg class="faq-chevron" aria-hidden="true"><!-- chevron down --></svg>
  </summary>
  <div class="faq-answer">
    <p>Answer text always in DOM regardless of open/closed state.</p>
  </div>
</details>
```

**Critical:** `<details>` content is in the DOM even when collapsed. This satisfies
the GEO requirement. No JS needed for base functionality.

**Per hub (tiered):**
- Standard hubs: 4–5 questions. All visible.
- Cornerstone hubs: 8+ questions. First 5 visible, remaining behind "Show more" trigger.

**Cornerstone FAQ overflow pattern:**

All FAQ items are in the DOM regardless. Items 6+ are hidden with CSS `display: none`
(not removed from DOM — AI crawlers see everything in source HTML).

```css
/* Items 6+ on cornerstone pages */
.faq-item--overflow {
  display: none;
}

/* When "show more" is toggled */
.hub-faq--expanded .faq-item--overflow {
  display: block;
}
```

"Show more" trigger (sits after item 5, before overflow items):

```css
.faq-show-more {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-primary);
  font-size: 14px; /* --text-small */
  font-weight: 400;
  color: var(--text-secondary);
}

.faq-show-more:hover {
  color: var(--accent-primary);
  /* instant, 0ms */
}

/* Hidden when expanded */
.hub-faq--expanded .faq-show-more {
  display: none;
}
```

EL: `"Δείτε περισσότερες ερωτήσεις (3)"` / EN: `"Show more questions (3)"`
Count in parentheses = total items minus 5.

**FAQ answer target length:** 120–180 words per answer (70% more ChatGPT citations
at this length). Questions are editorial, not auto-generated.

**Accessibility:** `<details>/<summary>` provides native keyboard and screen reader
support. No ARIA needed. Focus visible on summary: standard `--focus-ring` system.
"Show more" button also receives focus ring.

**Mobile:** Same component. 44px min tap target on summary via padding. Full-width.
"Show more" trigger: same 44px tap target.

#### Part 5: Seasonal Narrative

200–400 words, updated quarterly. Distinct editorial section with different visual
treatment from event listings.

```css
.hub-seasonal {
  margin-top: 64px;
  padding: 32px;
  background: var(--bg-elevated); /* #1a1a1a */
  border-radius: 12px;
}

@media (max-width: 767px) {
  .hub-seasonal {
    margin-top: 40px;
    padding: 24px 16px;
  }
}

.hub-seasonal-label {
  font-size: 12px; /* --text-ui */
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--text-tertiary);
  margin-bottom: 16px;
}

.hub-seasonal-date {
  font-size: 12px; /* --text-ui */
  font-weight: 400;
  color: var(--text-tertiary);
  margin-top: 24px;
}
```

Section label: `"ΕΠΟΧΙΑΚΟΣ ΟΔΗΓΟΣ"` / `"SEASONAL GUIDE"`

**Typography:**
- Body: `--text-body` (16px/400/lh1.55) / `--text-primary`
- Same rich-text rules as Static Content Page Template (paragraphs, inline links)

**Timestamp:** Separate from page date. Shows when the editorial was last reviewed.
Format: "Ενημερώθηκε: Μάρτιος 2026" / "Updated: March 2026"

---

### Hub Page Taxonomy (18 hubs)

All hubs share the same 5-part template. Only content and specific field emphasis changes.

| Slug | EL Title | EN Title | Design Consideration |
|------|----------|----------|---------------------|
| `/today` | Σήμερα | Today | Prominent "today's date" display. Auto-refreshes daily. |
| `/this-weekend` | Σαββατοκύριακο | This Weekend | Date range display (Fri–Sun). Unique static URL — differentiator. |
| `/this-month` | Αυτόν τον Μήνα | This Month | Calendar-adjacent. Trip-planning intent. |
| `/open` | Ελεύθερη Είσοδος | Open Entry | Filter by `isAccessibleForFree: true`. "Open" label prominent. |
| `/with-ticket` | Με Εισιτήριο | With Ticket | Show price ranges. "From €XX" format. |
| `/kids` | Παιδικά | Kids & Family | Family-friendly treatment. Age range + binary badges. See Kids Badges below. |
| `/exhibitions` | Εκθέσεις | Exhibitions | Longer date ranges. "Running until [date]" format. |
| `/nightlife` | Νυχτερινή Ζωή | Nightlife | Evening-oriented. Doors open / DJ starts time format. |
| `/concerts` | Συναυλίες | Concerts | Standard hub. Music-focused. |
| `/theater` | Θέατρο | Theater | Performing arts focus. |
| `/cinema` | Σινεμά | Cinema | Screening-focused. |
| `/festivals` | Φεστιβάλ | Festivals | Aggregate view. Timeline/schedule visualization. Sub-event drill-down. |
| `/workshops` | Εργαστήρια | Workshops | Participation focus. Capacity/registration info. |
| `/outdoors` | Υπαίθρια | Outdoors | Weather-adjacent. Seasonal. |
| `/greek-music` | Ελληνική Μουσική | Greek Music | Cultural heritage angle. Rebetiko (UNESCO) positioning. |
| `/new` | Πρόσφατες | New Additions | Recently added events. Freshness-first. |
| `/trending` | Δημοφιλή | Trending | Popularity-sorted. Social proof. |
| `/editors-picks` | Επιλογές | Editor's Picks | Curated. Editorial voice strongest. |

#### Hub-Specific: Kids Badges

Kids hub (`/kids`) events display additional binary field badges on event cards
and in the comparison table.

```css
.kids-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--bg-surface); /* #242424 */
  font-size: 11px; /* --text-caption */
  font-weight: 400;
  color: var(--text-secondary);
  white-space: nowrap;
}

.kids-badge svg {
  width: 12px;
  height: 12px;
  color: var(--text-tertiary);
}
```

**Badge types:**
- Age range: `"4–10 ετών"` / `"Ages 4–10"` — icon: person silhouette
- Indoor/Outdoor: `"Εσωτερικός"` / `"Indoor"` or `"Υπαίθριος"` / `"Outdoor"` — icon: house or sun
- Language: `"Ελληνικά"` / `"Greek"` or `"Αγγλικά"` / `"English"` or `"Χωρίς γλώσσα"` / `"Language-free"` — icon: speech bubble
- Stroller access: `"Καρότσι ✓"` / `"Stroller ✓"` — icon: stroller

Badges row: `display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px`.

#### Hub-Specific: Time-Sensitive Hubs

`/today`, `/this-weekend`, `/this-month` hubs display a prominent date context block
at the very top, between nav and answer capsule.

```css
.hub-date-context {
  text-align: center;
  padding: 24px 0 8px;
}

.hub-date-context-label {
  font-size: 12px; /* --text-ui */
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--text-tertiary);
}

.hub-date-context-value {
  font-size: 28px; /* --text-h2 */
  font-weight: 700;
  line-height: 1.15;
  color: var(--text-primary);
  margin-top: 4px;
}

@media (max-width: 767px) {
  .hub-date-context-value {
    font-size: 24px;
  }
}
```

For `/today`: label "ΣΗΜΕΡΑ" / "TODAY", value = full date ("Δευτέρα, 2 Μαρτίου" /
"Monday, 2 March").

For `/this-weekend`: label "ΣΑΒΒΑΤΟΚΥΡΙΑΚΟ" / "THIS WEEKEND", value = range
("1–2 Μαρτίου" / "1–2 March").

---

### Venue Page Template

```
Status: Specced — implementation ready
Phase: v1.5 (20–30 venues phased)
Layout: Single column, max-width 800px centered
Background: --bg-primary
```

**Page structure:**

```
.venue-page
  └── .site-header (standard nav, sticky)
  └── .venue-content (max-width: 800px, centered)
  │     ├── .venue-header
  │     │     ├── Venue name (h1): --text-h1 (40px/700, 32px mobile) / --text-primary
  │     │     ├── Neighborhood: --text-body (16px/400) / --text-secondary
  │     │     └── Address: --text-small (14px/400) / --text-secondary
  │     ├── .venue-photo (optional)
  │     │     └── 16:9 image, border-radius: 8px, same treatment as detail page
  │     ├── .venue-description
  │     │     └── 300–500 words: --text-body (16px/400/lh1.55) / --text-primary
  │     ├── .venue-info (key-value pairs, same layout as detail page Details section)
  │     │     ├── Address
  │     │     ├── Neighborhood (with containedInPlace context)
  │     │     ├── Metro station
  │     │     ├── Accessibility info
  │     │     └── "Open in Maps →" link
  │     ├── .venue-events
  │     │     ├── Section heading: "Επερχόμενες εκδηλώσεις" / "Upcoming Events"
  │     │     └── Standard card grid (3-col / 2-col / 1-col responsive)
  │     └── .venue-attribution
  │           └── Same source attribution pattern
  └── .site-footer (standard footer)
```

**Container:**

```css
.venue-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 40px;
}

@media (max-width: 767px) {
  .venue-content {
    padding: 0 16px;
  }
}
```

**Neighborhood context (containedInPlace):**

Display neighborhood relationship: "Στο Γκάζι, κοντά στο μετρό Κεραμεικός" /
"Located in Gazi, near Kerameikos metro"

```css
.venue-neighborhood-context {
  font-size: 14px; /* --text-small */
  font-weight: 400;
  color: var(--text-secondary);
  margin-top: 8px;
}

.venue-neighborhood-context .metro-icon {
  display: inline;
  width: 14px;
  height: 14px;
  vertical-align: -2px;
  margin-right: 4px;
  color: var(--text-tertiary);
}
```

**Compound value design:** Venues persist even as events change. The upcoming events
section dynamically updates each build. Venue editorial content is stable long-term.

**Bilingual:** Venue names locked (always Greek). Descriptions bilingual. Neighborhood
context in active language.

**Mobile:** Same single-column layout. Padding 40px → 16px.

**Replicability:** ✅ Same template, neighborhood system works with any city (7–13
neighborhoods per city).

---

### Freshness Signals

```
Status: Specced — implementation ready
Applied to: All page types
```

Visible freshness indicators that affect both user trust and AI crawling frequency.

#### Page Timestamp

```css
.page-timestamp {
  font-size: 12px; /* --text-ui */
  font-weight: 400;
  color: var(--text-tertiary);
  margin-bottom: 16px;
}
```

Format: "Ενημερώθηκε: 2 Μαρ 2026" / "Updated: 2 Mar 2026"

**Placement:** Below page title, above main content. Visible without scrolling.
Prominent but not dominant — a trust signal, not a headline.

**Rule:** Single date only. Never show both "Published" and "Last updated".

#### Daily-Updated Badge

```css
.freshness-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  background: rgba(245, 230, 66, 0.08); /* --accent-primary at 8% */
  font-size: 11px; /* --text-caption */
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--accent-primary);
}

.freshness-badge svg { /* pulse dot or refresh icon */
  width: 10px;
  height: 10px;
  color: var(--accent-primary);
}
```

EL: `"ΗΜΕΡΗΣΙΑ ΕΝΗΜΕΡΩΣΗ"` / EN: `"UPDATED DAILY"`

**Placement:** Inline with page title on hub pages. Not on every page — hub pages
and homepage only.

#### Event Count (Hub Pages)

Dynamic count displayed in the answer capsule and/or page title area.

Format: "23 εκδηλώσεις αυτό το Σαββατοκύριακο" / "23 events this weekend"

Count updates with each static build. Uses `--text-body` at 700 weight for the
number, regular weight for surrounding text.

---

### Source Attribution

```
Status: Specced — implementation ready
Applied to: Event detail pages, venue pages
```

```css
.source-attribution {
  font-size: 12px; /* --text-ui */
  font-weight: 400;
  color: var(--text-tertiary);
  padding-top: 24px;
  margin-top: 32px;
  border-top: 1px solid var(--border-subtle);
}

.source-attribution a {
  color: var(--text-tertiary);
  text-decoration: underline;
}

.source-attribution a:hover {
  color: var(--text-secondary);
}
```

**Event detail pages:**
- EL: `"Πληροφορίες εκδήλωσης από [Πηγή]. Πολιτιστικό πλαίσιο από τη συντακτική ομάδα του agent athens."`
- EN: `"Event data from [Source]. Cultural context by agent athens editorial team."`

**Venue pages:**
- EL: `"Πληροφορίες χώρου από τη συντακτική ομάδα του agent athens."`
- EN: `"Venue information by agent athens editorial team."`

Source name is a link to the original source when available. Builds E-E-A-T trust.

---

### Search Overlay

```
Status: Specced — implementation ready (2026-02-27)
Pattern: Centered dialog overlay (desktop), full-screen overlay (mobile)
Trigger: Search icon in nav + ⌘K/Ctrl+K (desktop) + hamburger menu item (mobile)
```

**Overlay Structure — Three layers: backdrop → panel → content.**

```css
.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200; /* same layer as hamburger overlay */
  background: var(--bg-overlay); /* rgba(13,13,13,0.92) */
  backdrop-filter: blur(8px);
}

.search-panel {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 80px);
  max-width: 640px;
  max-height: calc(100dvh - 160px);
  background: var(--bg-elevated); /* #1a1a1a */
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  box-shadow: 0 16px 64px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 201;
}

@media (max-width: 767px) {
  .search-panel {
    top: 0;
    left: 0;
    transform: none;
    width: 100%;
    max-width: 100%;
    max-height: 100dvh;
    height: 100dvh;
    border-radius: 0;
    border: none;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
```

**Rationale for mobile full-screen:** Virtual keyboard consumes ~50% of viewport. A centered dialog with margins would leave ~200px usable result area on iPhone. Full-screen avoids this. Desktop gets the refined floating panel.

**Search Input Area:**

```css
.search-input-area {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
```

- Icon (left): magnifying glass, 20px, `--text-tertiary`, `aria-hidden="true"`
- Input: `font-size: 16px` (iOS zoom prevention), `font-weight: 400`, `color: --text-primary`, `caret-color: --accent-primary`, `height: 48px`, transparent background, no border. Placeholder: "Αναζήτηση εκδηλώσεων..." / "Search events..." in `--text-tertiary`. `autocomplete="off"`, `autocapitalize="off"`, `spellcheck="false"`, `type="search"`
- Clear button (right): visible when input has text. `×` 16px, `--text-tertiary`, hover `--text-secondary`, 44×44px tap target. Fade in at `--t-fast` (120ms). Clears input, returns focus to input.
- Close button: visible on all breakpoints. Desktop: `position: absolute; top: 16px; right: 16px`. Mobile: within input area row, right side. Both: `44×44px`, `×` icon 20px `--text-secondary`.

**⌘K Badge (nav bar, desktop only):**

`padding: 2px 6px`, `border-radius: 4px`, `border: 1px solid var(--border-subtle)`, `font-size: 11px`, `font-weight: 400`, `color: var(--text-muted)` (#444444). Hidden below 768px.

**Results Area:**

```css
.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  -webkit-overflow-scrolling: touch;
}
```

**Result Group — Section Header:**

```css
.search-group-header {
  padding: 12px 20px 8px 20px;
  font-size: 12px; /* --text-ui */
  font-weight: 400;
  line-height: 1.0;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
```

Not focusable. Skipped in keyboard navigation. `role="presentation"`.

**Result Row:**

```css
.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-radius: 8px;
  margin: 0 8px;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
```

Content (text-only, no images): Title `14px/700/lh1.3 --text-primary`. Metadata line `12px/400/lh1.3 --text-secondary` — date + " · " + venue. Optional category badge: `10px/400/uppercase/+1px`, event type bg color, `padding: 2px 6px`, `border-radius: 4px`.

**Result Row States:**

| State | Spec |
|-------|------|
| Default | As above |
| Hover (mouse) | `background: var(--bg-surface)` (#242424), title → `--accent-primary`, instant (0ms) |
| Active (keyboard ↑↓) | `background: var(--bg-surface)` (#242424), title → `--accent-primary` |
| Focus-visible (Tab) | `outline: 2px solid var(--focus-ring); outline-offset: 2px` |

**"See All" Link (per group, >5 results):**

`14px/400`, `--accent-primary`, hover: underline. Arrow: inline SVG `→` 14px, same color, `gap: 6px`. Navigates to browse page with type filter + search query pre-applied. Label: "Όλα τα αποτελέσματα" / "All results". Included in keyboard navigation.

**Empty State (input empty):**

1. If recent searches exist in session: "ΠΡΟΣΦΑΤΑ" / "RECENT" section header (same `--text-ui` style). Max 3 rows. `×` dismiss per item: 16px icon, `--text-tertiary`, hover `--text-secondary`, 44×44px tap target. Tapping row re-executes search.
2. Always: "ΔΗΜΟΦΙΛΗ" / "POPULAR" section header. 3–5 upcoming events from `popular` array in `search-index.json`. Same result row component. Client-side date filter removes past events.

**Recent searches storage:** `sessionStorage` (pragmatic upgrade from original JS-variable-only spec — survives in-tab navigation, dies on tab close). Max 3 queries.

**Loading State:**

3 skeleton rows using `.skeleton` class from design-system.css (`skeleton-sweep` keyframe, 1.4s cycle). Each: `height: 44px`, `margin: 4px 8px`, `border-radius: 8px`. Trigger: after 2+ characters typed, during debounce (200–300ms). Single characters show empty state.

**Note:** Implementation currently uses a separate `skeleton-pulse` keyframe instead of the system `skeleton-sweep`. Should be reconciled to use the system pattern for visual consistency.

**No Results State:**

Centered: `padding: 40px 20px 24px`. Magnifying glass icon 32px `--text-muted`. Message: `14px/400/lh1.4 --text-secondary`. EL: "Δεν βρέθηκαν αποτελέσματα για «{query}»". EN: "No results found for "{query}"". Below: Popular events section as fallback.

**Transitions (dialog pattern, not bottom sheet):**

| Element | In | Out |
|---------|----|-----|
| Backdrop | `opacity` 200ms `--ease-out` | `opacity` 150ms `--ease-out` |
| Panel | `opacity` + `translateY(-8px→0)` 200ms `--ease-out` | `opacity` 150ms `--ease-out` |
| Clear button | `opacity` 120ms `--ease-out` | instant |
| Result hover | instant (0ms) | instant (0ms) |

`prefers-reduced-motion: reduce` → all 0ms.

**Keyboard Navigation:**

| Key | Action |
|-----|--------|
| `⌘K` / `Ctrl+K` | Open overlay (desktop, `pointer: fine` guard) |
| `Esc` | Input has text → clear input. Input empty → close overlay. |
| `↓` / `↑` | Move through result rows (skip section headers) |
| `Enter` | Navigate to active result URL |
| `Tab` | Cycle within focus trap: input → clear → results → close → input |

Focus on open → input. Focus on close → triggering element. Focus trap wraps at boundaries.

**Accessibility:**

```html
<div class="search-panel" role="dialog" aria-modal="true" aria-label="Αναζήτηση">
  <input type="search" aria-controls="search-results" aria-expanded="true">
  <div id="search-results" role="listbox" aria-label="Αποτελέσματα αναζήτησης">
  </div>
  <div class="sr-only" aria-live="polite" id="search-announcer"></div>
</div>
```

Announcer updates: "N αποτελέσματα" / "N results" on every search. All focus-visible: `2px solid var(--focus-ring), offset 2px`.

**Bilingual:** Placeholder, section headers, no-results message, aria-labels all switch with active language. Greek strings are longer but all containers are flexible-width.

**Replicability:** ✅ All labels, index data, and popular events are config-driven.

---

### Empty State: Zero Filter Results

```
Status: Specced — implementation ready
Trigger: Filter combination returns 0 events
```

**Layout:** Centered horizontally within grid area. Vertical position: upper-third
(not dead center). `min-height: 320px` to prevent layout collapse. Filters remain
visible and interactive above.

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 64px 16px;
  min-height: 320px;
  max-width: 400px;
  margin: 0 auto;
}
```

**Content:**

- Icon: Search icon with empty/slash treatment, `48px` (40px mobile), `--text-tertiary`
- Headline: `--text-h3` (20px/700) / `--text-primary` / `margin-top: 16px`
  - EL: `"Δεν βρέθηκαν εκδηλώσεις"`
  - EN: `"No events found"`
- Body: `14px/400/lh1.5` / `--text-secondary` / `max-width: 360px` / `margin-top: 8px`
  - EL: `"Δοκίμασε να αλλάξεις τα φίλτρα ή να αναζητήσεις κάτι διαφορετικό."`
  - EN: `"Try adjusting your filters or searching for something else."`
- CTA: Ghost button / `margin-top: 16px`
  - `border: 1px solid var(--border-default)` / `--text-primary` / `padding: 10px 24px`
  - `border-radius: 20px` (matches filter pill radius)
  - Hover: `--border-active` border, instant
  - EL: `"Καθαρισμός φίλτρων"` / EN: `"Clear filters"`

**Bilingual:** Greek headline (25 chars) vs English (15 chars) — both fit mobile at
20px. Body text uses `max-width` container, wraps gracefully.

**Prevention strategy (RA pattern):** Show result counts on filter options when
possible. Dim zero-count options to prevent this state from appearing. Zero-state
is the fallback, not the primary experience.

---

### Event Card: Sold Out State

```
Status: Specced — implementation ready
```

**Card treatment (browse):**

```css
.card--sold-out .card-image {
  filter: saturate(0.6) brightness(0.85);
}
```

Badge (top-left of image area):
```css
.badge-sold-out {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(8px);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  border-radius: 4px;
  z-index: 2;
}
```

- EL: `"ΕΞΑΝΤΛΗΘΗΚΕ"` / EN: `"SOLD OUT"`
- Card info area unchanged (title, date, venue). Price hidden or replaced with sold-out text.
- Card remains in browse results (not moved to separate section).

**Detail page treatment:**

- Image: full color (no desaturation)
- CTA area changes:
  - Price still shown (transparency)
  - Subtext: EL `"Τα εισιτήρια εξαντλήθηκαν"` / EN `"Tickets are sold out"` — `12px/400 --text-secondary`
  - Primary CTA becomes ghost button: `background: transparent` / `border: 2px solid var(--accent-primary)` / `color: var(--accent-primary)`
    - EL: `"ΛΙΣΤΑ ΑΝΑΜΟΝΗΣ"` / EN: `"JOIN WAIT LIST"`
  - Secondary link below: EL `"Ειδοποίησέ με"` / EN `"Notify me"` — `14px/400 --text-secondary`, hover: `--text-primary`, underline

---

### Event Detail: Past Event State

```
Status: Specced — implementation ready
Approach: Page stays live (SEO value), clear visual treatment
```

**URL stays accessible.** Content preserved. Indexed by search engines. RA proves
past event pages have enormous SEO value — they accumulate backlinks over time.

**Banner (above CTA area):**

```css
.past-event-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-surface); /* #242424 */
  padding: 16px 20px;
  border-radius: 12px;
  margin-bottom: 16px;
}

.past-event-banner svg { /* clock icon */
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.past-event-banner span {
  font-size: 14px;
  font-weight: 400;
  color: var(--text-secondary);
}
```

- EL: `"Αυτή η εκδήλωση έχει ολοκληρωθεί"`
- EN: `"This event has ended"`

**Image:** NOT grayed out (preserves visual appeal for archive/SEO).

**CTA replacement:**
- Primary: `"Δες παρόμοιες εκδηλώσεις"` / `"See similar events"` — standard accent button
- Secondary: `"Περισσότερα σε αυτόν τον χώρο"` / `"More at this venue"` — text link, `--text-secondary`, hover: `--text-primary` underline
- Date shown normally (not crossed out)

**Below description:** "Similar upcoming events" section — horizontal scroll or 2×2 grid
of cards matching same category and/or venue.

**Browse filtering:** Past events filtered from browse by default. Accessible via
direct URL and via search results (with "PAST" badge).

**Past event badge (search results only):**
```css
.badge-past {
  background: var(--bg-surface); /* #242424 */
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 4px;
}
```

- EL: `"ΠΑΡΕΛΘΌΝ"` / EN: `"PAST"`

---

### 404 Page

```
Status: Specced — implementation ready
HTTP Status: actual 404 (not soft 404/200)
Chrome: Full nav + footer
```

**Layout:** Full page chrome. Content centered horizontally and vertically.

```css
.page-404 {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: calc(100dvh - 64px - 200px); /* viewport - nav - footer */
  padding: 40px 16px;
}

.page-404-content {
  max-width: 480px;
}
```

**Content (top to bottom):**

- Illustration: Line-art style (broken ticket stub or spotlight on empty stage), `160×160px` (120px mobile), white strokes `--text-tertiary` at `opacity: 0.6`
- Label: `"404"` — `12px/400/uppercase/+1.2px tracking` / `--text-tertiary` / `margin-top: 24px`
- Headline: `--text-h2` (28px/700, 24px mobile) / `--text-primary` / `margin-top: 8px`
  - EL: `"Η σελίδα δεν βρέθηκε"`
  - EN: `"Page not found"`
- Body: `14px/400/lh1.5` / `--text-secondary` / `margin-top: 8px`
  - EL: `"Η σελίδα που ψάχνεις δεν υπάρχει ή έχει μετακινηθεί."`
  - EN: `"The page you're looking for doesn't exist or has been moved."`
- Primary CTA: Accent button / `margin-top: 24px`
  - `background: var(--accent-primary)` / `color: var(--bg-primary)` / `padding: 12px 32px` / `border-radius: 20px` / `14px/700`
  - EL: `"Εξερεύνηση εκδηλώσεων"` / EN: `"Explore events"`
- Secondary link: `14px/400 --text-secondary` / hover: `--text-primary` underline / `margin-top: 12px`
  - EL: `"Αρχική σελίδα"` / EN: `"Go to homepage"`

**`<title>`:** `"404 — Η σελίδα δεν βρέθηκε | agent athens"` (or EN equivalent)

**Tone:** Neutral with warmth. Not playful (events/culture product isn't a toy), not
overly apologetic. Direct and helpful.

---

### Error States

```
Status: Specced — implementation ready
```

**Inline Error (partial failure — e.g., filter API call fails):**

```css
.error-inline {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--status-error-subtle); /* rgba(255,68,88,0.12) */
  border-left: 3px solid var(--status-error); /* #FF4458 */
  border-radius: 0 12px 12px 0;
  margin-bottom: 16px;
}
```

- Icon: Warning triangle, `20px`, `--status-error`
- Text: `14px/400 --text-secondary`
  - EL: `"Κάτι πήγε στραβά. Δοκίμασε ξανά."`
  - EN: `"Something went wrong. Try again."`
- Retry CTA (inline): Ghost button, `13px/400`, `padding: 6px 16px`, `border: 1px solid var(--border-default)`, `border-radius: 16px`
  - EL: `"Επανάληψη"` / EN: `"Retry"`
  - Shows loading spinner on click, auto-dismisses on success

**Behavior:** Previous content preserved (not cleared). Error appears at top of
results area above existing cards.

**Full Page Error (complete load failure):**

Same centered layout as 404. Same illustration style (different subject: disconnected
plug or signal bars). Same spacing and typography.

- Headline EL: `"Ωχ, κάτι πήγε στραβά"` / EN: `"Oops, something went wrong"`
- Body EL: `"Δεν μπορέσαμε να φορτώσουμε τη σελίδα. Δοκίμασε να ανανεώσεις."` / EN: `"We couldn't load this page. Try refreshing."`
- CTA EL: `"Ανανέωση σελίδας"` / EN: `"Refresh page"` — accent button, triggers `location.reload()`

**Offline (static site edge cases):**

- Search unavailable: inline message `"Αναζήτηση μη διαθέσιμη εκτός σύνδεσης"` / `"Search unavailable offline"` in search overlay body
- External links (tickets, maps): browser handles natively, no special treatment
- Uncached images: fall back to Missing Image state (category icon placeholder)

---

### Pagination Bar

> **⚠️ SUPERSEDED (2026-07-05).** Pagination was never implemented and is retired.
> The shipped model is navigation-based static pages: homepage 24-event truncation,
> hub 30-cap with per-hub /all/ overflow (noindex,follow), and pre-generated filter
> pages. See design-decisions.md 2026-07-05 retroactive supersession entry (covers
> the full five-entry 2026-02-28 pagination set). Section retained for historical
> reference only — do not implement.

```
Status: Specced — implementation ready
Pattern: Static pagination pages (SSG) + Load More progressive enhancement
Items per page: 12
URL: /events/page/2/ (path-based, no /page/1/)
Canonical: ALL pages → /events/ (page 1)
```

**Layout:** Centered below event grid. Bottom placement only (no top pagination).

```css
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0 0;
  margin-top: 16px;
}
```

**Page number buttons:**

```css
.pagination-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 1px solid var(--border-default); /* rgba(240,240,240,0.40) */
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-primary);
  font-size: 14px;
  font-weight: 400;
  text-decoration: none;
  cursor: pointer;
}

.pagination-item:hover {
  border-color: var(--border-active); /* rgba(240,240,240,0.80) */
  color: var(--text-primary);
  /* transition: instant (0ms) — consistent with filter pill hover */
}

.pagination-item--current {
  background: var(--accent-primary); /* #f5e642 */
  border-color: var(--accent-primary);
  color: var(--bg-primary); /* #0d0d0d */
  font-weight: 700;
  cursor: default;
  pointer-events: none;
}
```

**Prev/Next arrows:**

```css
.pagination-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.pagination-arrow:hover {
  border-color: var(--border-active);
  color: var(--text-primary);
}

.pagination-arrow--disabled {
  opacity: 0.3;
  pointer-events: none;
}

.pagination-arrow svg {
  width: 16px;
  height: 16px;
}
```

- Previous: hidden on page 1
- Next: hidden on last page

**Ellipsis:**

```css
.pagination-ellipsis {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 14px;
  pointer-events: none;
}
```

**Truncation pattern (Smashing Magazine model):**

```
Page 1 of 9:  [1]  2  3  ...  9   >
Page 2 of 9:  <  1  [2]  3  4  ...  9   >
Page 5 of 9:  <  1  ...  4  [5]  6  ...  9   >
Page 8 of 9:  <  1  ...  7  [8]  9  >
Page 9 of 9:  <  1  ...  7  8  [9]
```

Rule: Always show first page, last page, and ±1 around current. Ellipsis where
gaps exist. Minimum 3 pages visible (no ellipsis needed for ≤5 total pages).

**Accessibility:**

```html
<nav aria-label="Σελιδοποίηση" class="pagination">
  <a href="/events/" class="pagination-arrow" aria-label="Προηγούμενη σελίδα">
    <svg aria-hidden="true"><!-- chevron left --></svg>
  </a>
  <a href="/events/" class="pagination-item">1</a>
  <span class="pagination-ellipsis" aria-hidden="true">...</span>
  <a href="/events/page/4/" class="pagination-item">4</a>
  <span class="pagination-item pagination-item--current" aria-current="page">5</span>
  <a href="/events/page/6/" class="pagination-item">6</a>
  <span class="pagination-ellipsis" aria-hidden="true">...</span>
  <a href="/events/page/9/" class="pagination-item">9</a>
  <a href="/events/page/6/" class="pagination-arrow" aria-label="Επόμενη σελίδα">
    <svg aria-hidden="true"><!-- chevron right --></svg>
  </a>
</nav>
```

Current page: `aria-current="page"`, rendered as `<span>` not `<a>`.
`aria-label` on nav: `"Σελιδοποίηση"` / `"Pagination"`.

**Load More button (page 1 progressive enhancement):**

```css
.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 240px;
  margin: 32px auto 0;
  padding: 12px 32px;
  border: 1px solid var(--border-default);
  border-radius: 20px;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-primary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.load-more:hover {
  border-color: var(--border-active);
}
```

- EL: `"Περισσότερες εκδηλώσεις"` / EN: `"More events"`
- Loading state: text replaced with skeleton pulse animation (same system pattern)
- Visible only on page 1 with JS enabled. Falls back to pagination links.
- Fetches from `/api/events/2.json`, appends cards to grid
- After last batch: button hides, pagination bar appears at final position

**Visibility rules:**
- Default (no filters, HTML): pagination bar visible, load-more hidden
- With JS on page 1: load-more visible, pagination bar hidden until all loaded
- With active filters (client-side): neither visible if ≤12 filtered results;
  load-more for >12 filtered results
- No JS fallback: pagination links only (standard HTML navigation)

**Mobile:** Same pagination bar. 44px touch targets already meet minimum. On very
narrow screens (≤375px), reduce gap to 4px. If still overflows, hide ellipsis
pages (show only: prev, current±1, next).

**Bilingual:** `aria-label` values switch with active language. Page numbers are
universal.

**Replicability:** ✅ Same component, data-driven page count per city.

---

## 6. Interaction & Motion

### Motion Tokens

```css
:root {
  /* Durations */
  --t-instant:    0ms;       /* card hover, button hover, filter pill state */
  --t-micro:      80ms;      /* filter panel close, fast exits */
  --t-fast:       120ms;     /* filter panel open desktop */
  --t-base:       150ms;     /* feature card scale, nav link color, bottom sheet close */
  --t-moderate:   200ms;     /* bottom sheet backdrop, hamburger overlay, VTA page transition */
  --t-slow:       300ms;     /* image lazy fade-in, scroll reveal (if used) */
  --t-deliberate: 500ms;     /* bottom sheet slide, skeleton loading cycle */

  /* Easings */
  --ease-out:      cubic-bezier(0.25, 0.46, 0.45, 0.94);   /* Linear's ease-out-quad — default for all UI */
  --ease-out-hard: cubic-bezier(0.215, 0.61, 0.355, 1);    /* Linear's ease-out-cubic — emphasis moments */
  --ease-in-out:   cubic-bezier(0.455, 0.03, 0.515, 0.955); /* symmetric transitions */
}

/* Accessibility: respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration:        0.01ms !important;
    animation-iteration-count: 1      !important;
    transition-duration:       0.01ms !important;
  }
}
```

**Default easing:** `--ease-out` for all UI interactions. This is the "don't think
about it" default. `--ease-out-hard` reserved for emphasis moments (bottom sheet
slide-in, scroll reveals).

**Source:** Token values derived from Linear.app's CSS token system (Mission 08),
calibrated to match agent-athens existing specs. Linear uses `--speed-quickTransition:
0.1s` and `--ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94)`.

### Transitions

| Element | Property | Token | Duration | Easing |
|---------|----------|-------|----------|--------|
| Card hover (grid/list) | `color` | `--t-instant` | 0ms | — |
| Card hover (feature only) | `transform` (scale) | `--t-base` | 150ms | `--ease-out` |
| Button hover | `background-color` | `--t-instant` | 0ms | — |
| Filter pill hover | `background-color`, `color` | `--t-instant` | 0ms | — |
| Filter pill state change | `background`, `color`, `border` | `--t-instant` | 0ms | — |
| Filter panel open (desktop) | `opacity`, `translateY` | `--t-fast` | 120ms | `--ease-out` |
| Filter panel close (desktop) | `opacity` | `--t-micro` | 80ms | `--ease-out` |
| Bottom sheet open (mobile) | `translateY` | `--t-deliberate` | 500ms | `--ease-out-hard` |
| Bottom sheet close (mobile) | `translateY` | `--t-base` | 150ms | `--ease-out` |
| Bottom sheet backdrop | `opacity` | `--t-moderate` | 200ms | `--ease-out` |
| Hamburger overlay | `opacity` | `--t-moderate` / `--t-base` | 200ms in / 150ms out | `--ease-out` |
| Hamburger panel | `translateX` | — | 250ms in / 200ms out | `--ease-out` |
| Nav link hover | `color` | `--t-instant` | 0ms | — |
| Page transition (VTA) | `opacity` | `--t-moderate` | 200ms | `--ease-out` |
| Image lazy load | `opacity` | `--t-slow` | 300ms | `--ease-out` |
| Skeleton shimmer | `background-position` | — | 1.4s cycle | `ease` |
| Dialog open | `opacity`, `transform` | `--t-moderate` | 200ms | `--ease-out` |
| Overlay backdrop | `opacity` | `--t-moderate` | 200ms | `--ease-out` |
| Search overlay open | `opacity`, `translateY` | `--t-moderate` | 200ms | `--ease-out` |
| Search overlay close | `opacity` | `--t-base` | 150ms | `--ease-out` |
| Search clear button | `opacity` | `--t-fast` | 120ms | `--ease-out` |
| Search result hover | `background`, `color` | `--t-instant` | 0ms | — |

**Principle:** Motion is for feedback and orientation, not decoration. Nothing
animates on scroll-into-view. High-density browse interfaces use instant hover
states. Transitions are reserved for user-initiated state changes: open/close,
page navigation, image decode. This is the convergent practice of DICE, RA,
Linear, and Apple (Mission 08).

### Page Transitions (View Transitions API)

```html
<!-- In <head> of every page -->
<meta name="view-transition" content="same-origin">
```

```css
::view-transition-old(root) {
  animation: var(--t-moderate) var(--ease-out) both vta-fade-out;
}
::view-transition-new(root) {
  animation: var(--t-moderate) var(--ease-out) both vta-fade-in;
}

@keyframes vta-fade-out { to   { opacity: 0; } }
@keyframes vta-fade-in  { from { opacity: 0; } }
```

Browser support: Chrome 111+, Edge 111+, Safari 18.2+. Firefox behind flag.
Fallback: instant page load (no JS needed — pure progressive enhancement).
Both DICE and Linear use VTA; RA and Apple do not.

### Skeleton Loading (CSS-only)

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 25%,    /* #1a1a1a */
    var(--bg-surface) 50%,     /* #242424 */
    var(--bg-elevated) 75%     /* #1a1a1a */
  );
  background-size: 400% 100%;
  animation: skeleton-sweep 1.4s ease infinite;
  border-radius: 4px;
}

@keyframes skeleton-sweep {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: var(--bg-elevated);
  }
}
```

Use for: image placeholder areas on event cards before lazy-loaded images decode.
Derived from Linear.app's `skeleton_loading` keyframe pattern (Mission 08).

### Image Lazy Load

```html
<img src="..." loading="lazy" decoding="async" class="lazy-img" alt="...">
```

```css
.lazy-img {
  opacity: 0;
  transition: opacity var(--t-slow) var(--ease-out);
}
.lazy-img.is-loaded {
  opacity: 1;
}
```

```javascript
// ~5 lines — fires on decode
document.querySelectorAll('.lazy-img').forEach(img => {
  if (img.complete) { img.classList.add('is-loaded'); return; }
  img.addEventListener('load', () => img.classList.add('is-loaded'));
});
```

All event images use `loading="lazy"` + `decoding="async"`. The `.skeleton` class
on the image wrapper provides visual feedback until decode completes.

### Modal / Dialog Patterns

```css
/* Overlay backdrop — shared by bottom sheet and dialog */
.overlay-backdrop {
  background: var(--bg-overlay);  /* rgba(13,13,13,0.92) */
  opacity: 0;
  transition: opacity var(--t-moderate) var(--ease-out);
}
.overlay-backdrop.is-open { opacity: 1; }

/* Bottom sheet (mobile filters) */
.bottom-sheet {
  transform: translateY(100%);
  transition: transform var(--t-deliberate) var(--ease-out-hard);
}
.bottom-sheet.is-open { transform: translateY(0); }

/* Centered dialog (future use) */
.dialog {
  opacity: 0;
  transform: scale(0.97);
  transition:
    opacity   var(--t-moderate) var(--ease-out),
    transform var(--t-moderate) var(--ease-out);
}
.dialog.is-open {
  opacity: 1;
  transform: scale(1);
}
```

### Scroll Reveal (Landing/Marketing Pages Only)

**Not used on browse or detail pages.** No reference site (DICE, RA, Linear, Apple)
uses scroll-triggered reveals on functional listing pages. Reserved for future
marketing/landing content if needed.

```html
<div data-reveal>Content appears on scroll</div>
```

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(12px);
  transition:
    opacity   var(--t-slow) var(--ease-out-hard),
    transform var(--t-slow) var(--ease-out-hard);
}
[data-reveal].is-visible {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  [data-reveal] { transition: none; opacity: 1; transform: none; }
}
```

```javascript
// ~12 lines — IntersectionObserver, fires once per element
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('is-visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
```

### What Agent-Athens Does NOT Animate

Explicit exclusion list (convergent finding across DICE, RA, Linear, Apple):

- Card grid items entering viewport on scroll
- Section headings or date group headers on scroll
- Body text or descriptions appearing
- Filter result count changes
- Numerical value transitions
- Sticky bar appearance (renders instantly)
- Any element whose only trigger is scroll position

### Scroll Behaviors

| Element | Behavior |
|---------|----------|
| Header (nav) | Sticky, `top: 0`, with safe area inset, full height, no compression |
| Filter bar | Sticky, below nav, `top: 64px` desktop / `top: 56px + safe-top` mobile, `z-index: 99` |
| Date group headers | Sticky, below filter bar, `z-index: 98` |
| Mobile detail bottom bar | Fixed, `bottom: 0`, with safe area inset, rounded top corners |
| Hamburger menu | Fixed overlay, scroll-locked body |
| Mobile nav | Same sticky behavior as desktop |

---

### Focus System

```
Status: Specced — implementation ready (Mission 11)
Strategy: :focus-visible with global rule (Linear pattern)
Ring color: #58A6FF (dedicated token, not accent reuse)
```

**Tokens:**

```css
:root {
  --focus-ring:        #58A6FF;    /* 7.42:1 vs #121212, exceeds AAA */
  --focus-ring-width:  2px;
  --focus-ring-offset: 2px;
  --focus-ring-invert: #0D1117;    /* dark ring for light elements */
}
```

**Global rule (covers all focusable elements):**

```css
:focus:not(:focus-visible) {
  outline: none;
}

:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--focus-ring-offset);
}
```

**Component-specific overrides:**

```css
/* Yellow CTA buttons — invert ring (blue invisible gap on yellow bg) */
.btn-primary:focus-visible {
  outline-color: var(--focus-ring-invert);
}

/* Filter pills — box-shadow respects border-radius */
.filter-pill:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--focus-ring-width) var(--focus-ring);
}

/* Event cards (whole-card link) — inset to stay within boundary */
.card-link:focus-visible {
  outline-offset: -2px;
}

/* Input fields — offset 0 to hug the border */
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline-offset: 0;
}

/* Dialogs/overlays — container has no ring, focus trapped inside */
[role="dialog"]:focus-visible {
  outline: none;
}
```

**Skip navigation:**

```html
<!-- First child of <body>, before nav -->
<a href="#main-content" class="skip-link">
  Μετάβαση στο περιεχόμενο / Skip to content
</a>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 16px;
  z-index: 9999;
  padding: 12px 24px;
  background: var(--focus-ring); /* #58A6FF */
  color: var(--focus-ring-invert); /* #0D1117 */
  font-family: var(--font-primary);
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  border-radius: 0 0 8px 8px;
  white-space: nowrap;
}

.skip-link:focus {
  top: 0;
}
```

Visible only on first Tab keypress. Jumps to `<main id="main-content">`.
Bilingual label in single link (both languages always visible).

**Focus management in overlays (search, bottom sheets, hamburger):**

- On open: focus moves to first interactive element inside
- Tab wraps within overlay boundaries (focus trap)
- Esc closes overlay
- On close: focus returns to the element that triggered the overlay
- Implementation: `focus-trap` library (custom implementation error-prone)

Already specified per-component in Search Overlay (Mission 09) and Filter Bottom
Sheet (Mission 05). This section formalizes the global pattern.

**Contrast validation:**

| Element | Focus Ring Color | Background | Ratio | Pass |
|---------|-----------------|------------|:-----:|:----:|
| Nav links | `#58A6FF` | `#0d0d0d` | 7.42:1 | AAA ✅ |
| Card links | `#58A6FF` | `#1a1a1a` | 6.60:1 | AA ✅ |
| Filter pills | `#58A6FF` | `#242424` | 5.84:1 | AA ✅ |
| Yellow CTA | `#0D1117` (invert) | `#f5e642` | 14.52:1 | AAA ✅ |
| Search input | `#58A6FF` | transparent/`#0d0d0d` | 7.42:1 | AAA ✅ |
| Pagination | `#58A6FF` | `#0d0d0d` | 7.42:1 | AAA ✅ |

All combinations pass WCAG AA minimum (3:1 for UI components). Most exceed AAA.

---

## 7. Image Treatment

| Context | Aspect Ratio | Treatment |
|---------|-------------|-----------|
| Grid card thumbnail | 3:4 | Raw, `object-fit: cover`, no overlay |
| Grid card thumbnail (mobile) | 3:4 | Same + `max-height: 280px` constraint |
| List row thumbnail | 16:9 | Raw, `object-fit: cover`, no overlay |
| Feature card | 16:9 | Raw, `object-fit: cover`, scale 1.02 on hover |
| Featured carousel card (mobile) | ~4:3 | `200×150px`, `object-fit: cover`, `border-radius: 8px` |
| Detail hero | 16:9 | Raw image + separate blurred bg layer |
| Detail bg layer | Full bleed | `blur(40px)`, `opacity: 0.35`, `scale(1.1)` |
| OG image | 1200×630 | See OG Image Templates below |

### Fallback Strategy

Missing event image → `--bg-elevated` (#1a1a1a) background on image wrapper +
centered SVG category icon at `rgba(240,240,240,0.08)` / 32×32px. Implemented
as CSS `background-color` on the image wrapper div, not on the `<img>` element.

### OG Image Templates

```
Status: Specced — implementation ready
Generated at build time (static site — no runtime generation)
Format: PNG, 1200×630px
```

**Meta tags (all pages):**

```html
<meta property="og:image" content="https://[domain]/og/[slug].png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://[domain]/og/[slug].png">
```

**Template 1: Event Detail Page (dynamic)**

Split composition — survives arbitrary artwork ratios (portrait, square, landscape).

```
Canvas: 1200×630, background --bg-primary (#0d0d0d)

Left zone (630×630):
  Event artwork, object-fit: cover, fills full height
  Right edge: 40px gradient fade to --bg-primary (smooth blend)

Right zone (570×630, padding: 48px 40px):
  Top: Category badge
    Text: event type, uppercase
    Font: Manrope 400, 11px, +1.2px tracking
    Background: event type color, border-radius: 4px
    Padding: 4px 8px

  Middle (vertically centered in remaining space):
    Event title
      Font: Manrope 700, 32px, line-height 1.15
      Color: --text-primary (#f0f0f0)
      Max: 3 lines, truncate with "…"

    Date + time (16px gap below title)
      Font: Manrope 700, 18px
      Color: --accent-primary (#f5e642)
      Format: "Σάβ, 22 Φεβ · 21:00" / "Sat, 22 Feb · 21:00"

    Venue + neighborhood (8px gap below date)
      Font: Manrope 400, 16px
      Color: --text-secondary (#a0a0a0)

  Bottom-right (absolute, 40px from bottom and right):
    "agent athens" wordmark
    Font: Manrope 700, 14px, letter-spacing: -0.2px
    Color: --text-tertiary (#888888)
```

**Fallback (event without artwork):** Full-width centered layout. Same text hierarchy as right zone but centered horizontally on canvas. Category icon at `rgba(240,240,240,0.06)` / 120px behind text as watermark. Wordmark bottom-center.

**Template 2: Browse / Hub Pages (semi-dynamic)**

```
Canvas: 1200×630, background --bg-primary (#0d0d0d)

Center (vertically and horizontally):
  "agent athens" wordmark
    Font: Manrope 700, 48px, letter-spacing: -0.5px
    Color: --text-primary (#f0f0f0)

  Page tagline (20px gap below wordmark)
    Font: Manrope 400, 20px
    Color: --text-secondary (#a0a0a0)
    Examples:
      Homepage: "Daily-updated cultural events in Athens"
      Music hub: "Live music events in Athens — updated daily"
      Theater hub: "Theater & performing arts in Athens"

Bottom-right (40px from edges):
  URL: "agentathens.com" (or domain)
  Font: Manrope 400, 12px
  Color: --text-tertiary (#888888)
```

**Template 3: Static Pages (branded default)**

Same layout as Template 2. Tagline: "Daily-updated cultural events in Athens". Used for /about/, /editorial/, /corrections/, and any page without specific content.

**Bilingual:** Event metadata renders in the page's active language. Wordmark stays in Latin ("agent athens") on all OG images regardless of language.

**Replicability:** ✅ Templates are system-level. City name, tagline, and event data are config variables.

---

## 8. Bilingual Rules

### Text Length Accommodation

- Greek text typically runs 15–20% longer than English for equivalent content
- Card title: always 2-line clamp with ellipsis — Greek strings will use both lines more frequently than English
- All fixed-width containers must be tested with longest realistic Greek string
- Filter pill labels: Greek category names run longer — pill width must be content-driven (auto width), not fixed
- CTA buttons: Greek label "Κλείστε Θέση" is 33% longer than "Get Tickets" — button width must accommodate

### Font Rendering

- Manrope renders Greek natively — Greek subset included in Google Fonts load
- Key characters verified: tonos (΄) placement at display sizes, letterforms
  α ε ο ι υ η ω at both display and small sizes, uppercase forms
  Α Ε Ο Ι Υ Η Ω Μ Ν Θ
- All-caps labels: no tonos in uppercase Modern Greek — no diacritic rendering issues

### Language Toggle

Active language: `--text-primary` + 2px `--accent-primary` underline. Inactive: `--text-tertiary`. Style: `11px/400/uppercase/+0.8px tracking`. Labels: "EL" / "EN" — always visible in nav bar, not buried in settings. Both labels legible in either language context.

Bilingual city name: displays in active language ("Αθήνα" / "Athens"). Switches on toggle.

### Entity Locking

Some Greek terms remain in Greek even on English-language pages. These are culturally
specific terms that lose meaning in translation:

**Always locked (Greek on all pages):**
- Venue names (always original Greek: "Στέγη Ιδρύματος Ωνάση")
- Neighborhood names used as proper nouns
- Music genre terms: ρεμπέτικο (rebetiko), λαϊκά (laïka), μπουζούκι (bouzouki)
- Cultural venue types: ταβέρνα (taverna), ουζερί (ouzeri)

**Design implication:** Don't assume all text on English pages is English. Mixed-script
strings must render correctly in card metadata, hub event blocks, and venue sections.
Manrope handles this natively (Greek + Latin in same family).

### Price Terminology (System-Wide)

| Display (EL) | Display (EN) | Internal Value | Schema.org | Never Use |
|-------------|-------------|----------------|------------|-----------|
| Ελεύθερη είσοδος | Open entry | `open` | `isAccessibleForFree: true` | ~~Δωρεάν~~ / ~~Free~~ |
| Με εισιτήριο | With ticket | `with-ticket` | `isAccessibleForFree: false` | ~~Επί πληρωμή~~ / ~~Paid~~ |
| Από €XX | From €XX | `with-ticket` + `offers.price` | `offers.price` | — |

This terminology appears in: URLs, Schema.org JSON-LD, filter chips, comparison
table columns, event cards, meta descriptions, hub answer capsules, and all
editorial content. The entire system uses this convention — zero exceptions.

---

## 8b. HTML Source Order & GEO Constraints

### Why Source Order Matters

AI engines (GPTBot, ClaudeBot, PerplexityBot) process content top-to-bottom in HTML
source order. **They do NOT execute JavaScript.** Only Googlebot renders JS. This
means:

- All event data must be in the static HTML at page load
- Content position in the source directly affects AI citation probability
- 44.2% of all AI citations come from the first 30% of page content
- Interactive features (filtering, sorting, accordions) can enhance UX but the base
  content must be in the DOM on initial render

**Test for any template change:** View page source (Ctrl+U) — if the event data
isn't there, AI engines can't see it.

### Content Priority in Source Order

For every page template, HTML source order follows this priority:

1. **Answer capsule / key facts** — most citable content first
2. **Structured data (tables, key-value pairs)** — AI engines extract these specially
3. **Editorial prose** — cultural context and insider tips
4. **Navigation / related content** — least important for citation

### What AI Engines Extract Best

| Format | Citation Impact | Notes |
|--------|----------------|-------|
| Tables (`<table>`) | Highly extractable | Must be real HTML tables, not CSS grid |
| FAQ Q&A pairs | Best-performing GEO format | Answers must be in DOM, not loaded on click |
| Statistics/data points | +30–40% citation visibility | One statistic every 150–200 words |
| Proper nouns | ~20% density in cited text | Venues, artists, neighborhoods |
| First 30% of content | 44.2% of citations | Put best content here |

### What to Avoid in Templates

- Long navigation menus before main content — pushes citable content down
- Hero images without accompanying text — AI engines can't read images
- Tabs that hide content — if content is in a tab not visible on load, AI engines skip it
- Infinite scroll for event listings — all items must be in HTML source
- Client-side-only rendering of event data, FAQ answers, or comparison tables

### Single Timestamp Rule

Show ONE date on each page (either "Published" or "Last updated" — not both).
Showing both causes a documented 22% CTR drop.

The timestamp must reflect actual content changes (powered by content-hash system).
Don't update timestamps when only dynamic event counts change.

---

## 9. Mobile-Specific Rules

### Viewport

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

### Safe Area

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}
```

Applied to: `.site-header` (padding-top), `.detail-bottom-bar` (padding-bottom), `.menu-panel` (padding top+bottom), `.bottom-sheet` (padding-bottom), `.filter-bar` (top offset).

### Tap Targets

Every interactive element: minimum 44×44px on touch devices. Where the visual element is smaller (e.g., 20px icon), the tappable area extends via padding, `min-height`, or transparent hit-area expansion.

```css
@media (pointer: coarse) {
  button,
  [role="button"],
  a:not(.card-link),
  input[type="checkbox"],
  input[type="radio"],
  select {
    min-height: 44px;
    min-width: 44px;
  }
}
```

### Input Font Size

All text inputs and textareas: `font-size: 16px` minimum. Prevents iOS Safari automatic zoom on input focus. Not a design choice — a platform requirement.

### Dynamic Viewport Height

Full-screen overlay elements use `100dvh` with `100vh` fallback:

```css
.hamburger-overlay,
.bottom-sheet-backdrop,
.menu-panel {
  height: 100vh;  /* fallback */
  height: 100dvh; /* modern browsers */
}
```

### Combined Sticky Stack (Mobile)

| Element | Height | z-index |
|---------|--------|---------|
| Nav bar | 56px + safe-top | 100 |
| Filter bar | 52px | 99 |
| Date group header | ~44px | 98 |
| **Total** | **~152px + safe-top** | — |

Monitor for user feedback. If 152px feels heavy, date group header can become non-sticky on mobile.

### Mobile Card Image Constraint

```css
@media (max-width: 767px) {
  .card-image-wrapper {
    aspect-ratio: 3 / 4;
    max-height: 280px;
    overflow: hidden;
  }
}
```

Desktop/tablet: no constraint — 3:4 unconstrained.

---

*This document grows. Every design decision adds specificity.
The goal: Claude Code reads this and builds exactly what we envision.*
