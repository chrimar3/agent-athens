# Mobile Scroll / Touch Jitter Diagnosis — Homepage, iOS WebKit

**Date:** 2026-05-14
**Mode:** Read-only inspection. No source files modified.
**Inputs inspected:** `dist/index.html`, `dist/styles/design-system.css`, `src/templates/page.ts`, `src/templates/homepage.ts`, `src/templates/card-variants.ts`
**Status:** Diagnosis only — DO NOT IMPLEMENT yet. Awaiting review.

---

## 1. Confirmed reproduction surface

- **Platform:** iOS WebKit (Safari + WKWebView consumers, e.g. in-app browsers).
- **Page:** Homepage (`dist/index.html`).
- **Symptom class:** Horizontal scroll / touch jitter — page "resists" the user. Vertical swipes feel diagonal; horizontal swipes inside the editor-picks region rubber-band into body motion.
- **Viewport conditions:** ≤1024px width activates the picks carousel; the most acute symptoms expected at iPhone widths (375px–430px).
- **Inline style audit:** `dist/index.html` contains **zero** inline `width`/`margin`/`padding` style attributes — no per-element offenders. Cause is in the stylesheet.

---

## 2. Ranked candidate list (highest likelihood first)

### #1 — Hero picks carousel rubber-bands into the body (HIGH confidence)
- **Selector:** `.hero-picks` at `@media (max-width: 1024px)`
- **File:line:** `dist/styles/design-system.css:2078-2086`
- **Rendered by:** `src/templates/card-variants.ts:194` inside `.hero-grid` → `.hero-section` → `.page-container`
- **Rule:**
  ```css
  .hero-picks {
    flex-direction: row;
    overflow-x: auto;
    gap: 16px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding-bottom: 4px;
  }
  ```
  with `.hero-card--pick { min-width: 160px; flex-shrink: 0; }` — scroll content is guaranteed to exceed viewport.
- **Why it could overflow / jitter:**
  - `overflow-x: auto` + `-webkit-overflow-scrolling: touch` creates a momentum-scrolling region.
  - **No `overscroll-behavior-x: contain`** anywhere in the CSS (confirmed via grep — Step 4 returned only safe-area and `-webkit-overflow-scrolling` matches). When the carousel reaches its end, the rubber-band bounce **propagates to the body** on iOS WebKit. This is the textbook touch-jitter source.
  - **No `touch-action` rule anywhere.** Diagonal swipes are ambiguous — WebKit's gesture-arbitration picks an axis, but the user feels the moment of arbitration as jitter / "resistance."
  - This region sits at the top of the homepage, dominating the first 100vh of mobile interaction.
- **Low-risk fix shape:**
  ```css
  .hero-picks {
    overscroll-behavior-x: contain;
    touch-action: pan-x;
  }
  ```
  Two declarations on a single selector. Scoped — does not touch shared tokens. Mobile-only context (already inside `@media (max-width: 1024px)`).

### #2 — No global `html`/`body { overflow-x }` guard (HIGH confidence, contributing factor)
- **Selector:** absent — gap, not bug
- **File:line:** would belong near `dist/styles/design-system.css:173` (the `body` rule)
- **Evidence:** grep for `^(html|body|\*)` found only `body { font-family, line-height, background-color, color, font-smoothing }` at 173 and `body.scroll-locked-menu { overflow: hidden }` at 196. **No `html { overflow-x: hidden }` or `body { overflow-x: clip }`.**
- **Why it matters:** This is the standard belt-and-suspenders backstop. Without it, **any** single offender (current or future) immediately produces document-level horizontal scroll. Even after fixing #1, this remains a latent foot-gun.
- **Low-risk fix shape:**
  ```css
  html, body { overflow-x: clip; }
  ```
  `clip` is preferred over `hidden` because `hidden` makes the element a scroll container (breaks `position: sticky` ancestor chains — and `.site-header` at line 584 uses `position: sticky`). `overflow-x: clip` is supported on iOS Safari 16+; `overflow-x: hidden` is the fallback but would need verification that no sticky chain breaks.
- **Cross-page impact:** Affects every page. Worth coordinating with #1 — fixing #1 only treats the symptom; #2 prevents recurrence.

### #3 — Mobile menu drawer pushed off-screen via transform (LOWER confidence)
- **Selector:** `.mobile-menu`
- **File:line:** `dist/styles/design-system.css:690-700`
- **Rule:** `position: fixed; top: 0; right: 0; width: 100%; max-width: 320px; transform: translateX(100%);` when closed.
- **Why it could overflow:** On a 375px viewport, this resolves to a 320px-wide fixed element whose bounding box extends from `viewport_right` to `viewport_right + 320px`. `position: fixed` *should* exclude it from document scrollWidth, but historical iOS WebKit bugs (Safari 14.x–15.x) have leaked transformed fixed elements into scrollWidth. Newer WebKit largely fixed this; resurfacing on specific builds is possible.
- **Low-risk fix shape:** Subsumed by #2 — once `html, body { overflow-x: clip }` lands, any residual leak from this is clipped at the document edge. **No standalone change needed if #2 lands.**

### #4 — Universal selector missing `min-width: 0` (LATENT, not currently triggering)
- **Selector:** `*, *::before, *::after`
- **File:line:** `dist/styles/design-system.css:165`
- **Rule:** Sets `box-sizing`, `margin: 0`, `padding: 0` — does NOT set `min-width: 0`.
- **Why it matters:** Flex/grid children default to `min-width: auto`, meaning they refuse to shrink below their intrinsic content width. A single overlong unbreakable string (e.g. a long Greek venue name with no spaces, or a long URL inside a footer link) inside a flex/grid child will blow the row out horizontally. The current homepage doesn't appear to be triggering this, but it's the most common silent overflow source as content grows.
- **Existing partial coverage:** `min-width: 0` IS set explicitly on `.hub-card-body` (2515), `.card-body` (1130), `.search-result-text` (2279), several filter panels (1554, 1607, 1642, 1841, 2048). The presence of these targeted overrides confirms the team has hit this class of bug before and patched site-by-site.
- **Low-risk fix shape:** Adding `min-width: 0` to the universal selector is **medium-risk**, not low — it can change layout for any flex/grid item that was previously relying on intrinsic-min-content sizing as a sizing input. Recommend deferring unless evidence emerges that the current jitter is content-dependent. NOT a candidate for this fix cycle.

### #5 — Safe-area-inset-left/right defined but unused (MINOR, landscape only)
- **Selector:** `:root` variables `--safe-left`, `--safe-right`
- **File:line:** `dist/styles/design-system.css:109-110` — defined; never referenced (grep confirmed).
- **Why it matters:** On notched iPhones in landscape orientation, content under the notch is unprotected. `.page-container` uses fixed `padding: 0 16px` at mobile, not `padding: 0 max(16px, var(--safe-left)) 0 max(16px, var(--safe-right))`. Could cause horizontal-jitter perception in landscape only.
- **Not the primary culprit** for portrait-orientation reproductions. Document but defer.

---

## 3. Quick-win candidates (≤5-line fixes, no design impact)

- **QW-A:** Add `overscroll-behavior-x: contain; touch-action: pan-x;` to `.hero-picks` (`design-system.css:2078`). 2 lines, mobile-only scope.
- **QW-B:** Add `html, body { overflow-x: clip; }` near the body rule (`design-system.css:173`). 1 line. Use `clip` not `hidden` to preserve `.site-header` sticky positioning (line 585). Verify on iOS 15 if `clip` support matters for the install base; otherwise pair with `overflow-x: hidden` fallback.

Both QW-A and QW-B together = 3 lines of CSS.

---

## 4. Risk candidates (touch shared tokens or could regress other pages)

- **RC-1:** Adding `min-width: 0` to the universal selector — would affect every flex/grid child site-wide. Probably-positive in aggregate but warrants page-by-page visual diff. Defer.
- **RC-2:** Wiring `--safe-left`/`--safe-right` into `.page-container` — needs visual diff in landscape on notched device. Defer.
- **RC-3:** Using `overflow-x: hidden` (instead of `clip`) on `html, body` — would break `.site-header { position: sticky }` because `overflow: hidden` ancestors disable sticky in descendants. If `clip` support is insufficient, must validate sticky behavior or move the header out of the affected scroll context.

---

## 5. Recommended next-session scope

**Order of operations (1 fix per cycle, verify on device between):**

1. **First:** Apply QW-A only (`.hero-picks` `overscroll-behavior-x: contain; touch-action: pan-x`). Smallest scope, highest-confidence fix for the reported jitter. Verify on iOS WebKit at 375px, 414px, 430px portrait. If symptom gone → done.
2. **Second (only if #1 insufficient):** Apply QW-B (`html, body { overflow-x: clip }`). Verify that `.site-header` still sticks correctly on scroll. Verify on iOS 16+; check fallback for iOS 15 if still supported.
3. **Defer:** RC-1, RC-2, RC-3 — only revisit if step 2 still leaves residual symptoms, or if a separate content-overflow case emerges (e.g. an event with a long unbreakable Greek string blowing a card out).

**Verification protocol after each fix:**
- Real device test on iPhone Safari (not just responsive-design mode in desktop Safari — rubber-band physics differ).
- Test: vertical swipe on `.hero-picks` region (should scroll page vertically, not jitter).
- Test: horizontal swipe on `.hero-picks` (should scroll carousel, then resist at end without body bouncing).
- Test: diagonal swipe (should resolve cleanly to one axis without ambiguous moment).

---

## Notes for institutional memory (post-fix only)

- **`docs/known-issues.md`:** No prior entry for horizontal scroll / mobile touch jitter (grep confirmed — only unrelated "Overflow pages as noindex" entry at line 716). Add a 🟡 entry once a fix lands and is verified on-device.
- **`.claude/notes/`:** The script referenced `.claude/notes/known-issues.md` but only `decisions.md`, `mistakes.md`, `patterns.md` exist there. Known-issues lives at `docs/known-issues.md`.
- Per CLAUDE.md institutional-memory rules: do not update `mistakes.md` / `patterns.md` / `decisions.md` until a fix lands and is verified.

---

## Inspection log (steps taken)

- Step 0: Confirmed `dist/index.html` + `dist/styles/design-system.css` present. Working tree had only unrelated data/spec changes.
- Step 1: Enumerated overflow/viewport rules — **no `html`/`body { overflow-x }`** found; **no `100vw`** widths anywhere; multiple targeted `min-width: 0` patches indicate prior pain.
- Step 2: Zero inline width/margin/padding styles on the homepage. 106 unique class attributes captured.
- Step 3: Cross-referenced both the script's class list and the *actually-present* classes. Several script-list classes (`hub-nav`, `hub-capsule`, `edp-hero`, `mobile-bottom-bar`) returned no CSS — they aren't homepage classes. The script's class list looks stale relative to the current homepage; updating that list for future diagnostic runs would be useful.
- Step 4: `overscroll-behavior` — **0 hits**. `touch-action` — **0 hits**. Three `-webkit-overflow-scrolling: touch` containers found: `.filter-bar` (1382, not on homepage), `.hero-picks` (2082, homepage), `.table-scroll-wrapper` (2547, not on homepage).
- Step 5: This document.
- Step 6: No prior overflow/scroll entry in `docs/known-issues.md`.
