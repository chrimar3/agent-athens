# Capsule Drift Audit — 2026-05-18

**Purpose:** Read-only diagnosis to feed Design Navigator's (DN) conditional Path A/B/C ruling on the filter-bar-below-fold problem on hub pages. No source files modified.

**Scope:** `/concerts` and `/today` hub pages, rendered from `dist/concerts.html` and `dist/today.html` (last build before this audit). iPhone SE viewport (375×667) reference for above-fold reasoning.

**TL;DR:**
- Capsule is **at-spec** on content (36 words `/concerts`, 33 words `/today`; spec is 40–60, both slightly under). No nested chrome. **DN's hypothesis (a) — capsule word drift — is FALSE.**
- Capsule is **not** inside `<main>`, **not** inside `.page-container`. It sits at `<body>` level.
- Root cause is a **wrong-anchor regex** in `src/generators/hub-page.ts:400` — `html.replace('</header>', …)` matches the **first** `</header>` in the document, which is `<header class="site-header">`, not the intended `<header class="page-header">`. Capsule + category-nav get spliced between site-header and `<div class="page-container">`, ahead of the page-header (h1).
- This is a **fourth path** DN's A/B/C decision tree does not anticipate. See §5.

---

## 1. Capsule word count + content audit

Extracted from `dist/concerts.html` and `dist/today.html` via tag-stripped word count of the `<section class="hub-answer-capsule">` content.

| Page | Capsule HTML size | Visible word count | Within 40–60 spec? |
|---|---|---|---|
| `/concerts` | 344 chars | **36 words** | Slightly under (-4) |
| `/today` | 338 chars | **33 words** | Slightly under (-7) |

**Locked spec source:** `docs/session-log.md:525` — "Answer capsule (40-60 words)".

**Content source:** `config/hub-pages.json` per-hub `answerCapsule` field (Greek) and `answerCapsuleEn` field (English). Statically authored, not generated at build time. Token substitution (`{{MONTH_YEAR}}`, `{{MONTH}}`) is applied via closure in `renderHubPage()`.

**Capsule snippet — /concerts:**
```html
<section class="hub-answer-capsule">
  <p class="answer-capsule-text">Η Αθήνα φιλοξενεί ζωντανές συναυλίες κάθε βράδυ — jazz στο Μετς, ρεμπέτικα στην Πλάκα, κλασική μουσική στο Μέγαρο, rock και indie σε σκηνές του Γκάζι. Βρείτε ημερομηνίες, τιμές εισιτηρίων και χώρους για κάθε συναυλία.</p>
  <p class="hub-stats">138 εκδηλώσεις</p>
</section>
```

**Capsule snippet — /today:**
```html
<section class="hub-answer-capsule">
  <p class="answer-capsule-text">Σήμερα στην Αθήνα θα βρείτε συναυλίες, εκθέσεις, θεατρικές παραστάσεις και DJ sets σε χώρους από το Κολωνάκι ως το Γκάζι. Ελέγξτε ώρες έναρξης και διαθεσιμότητα εισιτηρίων, πολλές εκδηλώσεις έχουν ελεύθερη είσοδο.</p>
  <p class="hub-stats">3 εκδηλώσεις</p>
</section>
```

**Nested chrome inventory:** `{section: 1, p: 2}` on both pages. No sub-headings, lists, buttons, images, links, or icons. The capsule is structurally minimal.

**Conclusion for §1:** Content is not the bloat source. If the rendered capsule is 595px on iPhone SE as DN observed in Chrome, that figure comes from CSS (padding, line-height, font-size, border, background, margin), not text length. This audit does not measure CSS — Design Navigator should request the computed-style trace separately if Path D (see §5) is selected.

---

## 2. DOM placement audit

**Capsule template emission:** `src/generators/hub-page.ts:393–402`:

```ts
// Part 1: Answer Capsule (inject after </header>)
const capsuleHtml = `<section class="hub-answer-capsule">
  <p class="answer-capsule-text">${answerCapsule}</p>
  <p class="hub-stats">${filteredEvents.length} ${t.hubEventCount}</p>
</section>`;

if (categoryNav) {
  html = html.replace('</header>', `</header>\n${categoryNav}\n${capsuleHtml}`);
} else {
  html = html.replace('</header>', `</header>\n${capsuleHtml}`);
}
```

**Defect:** `String.prototype.replace` with a plain string matches the **first** occurrence. The rendered page contains **two** `<header>` elements:

| Header | Source | Byte position (`/concerts`) | Intent |
|---|---|---|---|
| `<header class="site-header" role="banner">` | `src/templates/site-chrome.ts:12` | open 73719 / close 74474 | Site navigation banner (logo, search, hamburger) |
| `<header class="page-header">` | `src/templates/page.ts:159` | open 80185 / close 80406 | Page title (h1) + last-update timestamp |

The injection grabs the **first** `</header>` (site-header's, at 74474), not the page-header's. Comment at `hub-page.ts:392` says "inject after `</header>`" without disambiguating — the intent reads as page-header, but the regex behavior is site-header.

**Parent chain at capsule position** (computed by walking structural open/close events of `main|body|section|div|article|header|nav|aside`):

```
/concerts: <body class="has-filter-bar">       ← only ancestor
/today:    <body class="has-filter-bar">       ← only ancestor
```

**Landmark status:**
- Inside `<main>`? **No** — capsule appears at byte 76232 on `/concerts`; `<main id="main-content">` opens at byte 84594, **after** the capsule.
- Inside `.page-container`? **No** — `<div class="page-container">` opens at byte 80152 on `/concerts`, **after** the capsule.
- Inside any landmark? **No** — direct child of `<body>`.

**Actual DOM order on `/concerts`** (event_type hub with categoryNav):

```
<body class="has-filter-bar">
  <header class="site-header">…</header>
  [hamburger/search hidden chrome]
  <nav class="category-nav">…</nav>            ← injected, body-level
  <section class="hub-answer-capsule">…</section> ← injected, body-level
  <div class="page-container">
    <header class="page-header"><h1>Συναυλίες στην Αθήνα</h1>…</header>
    <div class="filter-bar">…</div>
    <main id="main-content">…</main>
  </div>
  <footer>…</footer>
</body>
```

**On `/today`** (date hub, no categoryNav): identical to above minus the `<nav class="category-nav">` line. Capsule still body-level, still before `.page-container`.

**Note on `session-log.md:1776`** ("Hub capsule: ✅ Outside `<main>` by design, consistent with homepage"): that entry is **not contradicted by this audit**, but it documents a prior accepted state rather than the spec. Whether the capsule *should* be outside `<main>` is a design call to be made alongside the regex fix; this audit only reports current behavior. The body-level placement (above `.page-container` and above the page-header `<h1>`) is almost certainly **not** what "outside `<main>` by design" intended — that phrasing fits the homepage pattern where the capsule is the first child of `<main>` (see `src/templates/homepage.ts:56`) and the hub-page intent reads as "after the page H1, before the comparison table." The regex bug puts it somewhere neither file's author asked for.

---

## 3. Chrome stack table

Observed heights from DN's iPhone SE Chrome DevTools diagnostic, paired with this audit's provenance findings.

| Order | Element | Rendered height (Chrome obs) | In locked spec? | Source file |
|---|---|---|---|---|
| 1 | `<header class="site-header">` | 56px | Yes (base template) | `src/templates/site-chrome.ts:12` |
| 2 | `<nav class="category-nav">` *(event_type hubs only)* | 70px | **Not** in the 5-part hub spec; lives in category-page template, reused for hubs | `src/templates/category-page.ts:88–112` (`renderCategoryNav`) |
| 3 | `<section class="hub-answer-capsule">` | 595px observed | Yes for content (40–60w); CSS budget not stated in any spec file found | `src/generators/hub-page.ts:393–396` |
| 4 | `<header class="page-header">` (h1 + last-update) | 154px | Yes (base template, every page has it) | `src/templates/page.ts:159–170` |
| 5 | `.filter-bar` (filter pills row) | — (target zone) | Yes (base template via `filterBarHTML`) | `src/templates/page.ts:172`; rendered by filter-bar generator |
| **Total chrome above filter bar** | | **~875px** | | |
| Filter bar top from doc top (observed) | | ~940–1106px | | |
| iPhone SE viewport height | | 667px | | |

**Above-fold math:** Filter bar starts ~1.4–1.7× viewport heights below the top. Visible above the fold on iPhone SE: only the upper portion of the capsule (56 + 70 = 126px of site-header + category-nav, then ~541px of capsule before the fold). Page-header and filter-bar are both fully below the fold.

**Note on DN's narrative sequence:** DN's brief implies the page-header sits above the capsule, contributing chrome from the top. **It does not.** Per the audit, page-header sits *below* the capsule, between capsule and filter-bar. The 875px sum is unchanged by sequence, but the *visual* path from fold to filter-bar is: [fold cuts through capsule] → rest of capsule → page-header (h1 + timestamp) → filter-bar. Any visual reorder strategy needs to start from this corrected sequence.

---

## 4. Provenance of `nav.category-nav` and `header.page-header`

**`<nav class="category-nav">`**
- **Defined in:** `src/templates/category-page.ts:88–112` (`renderCategoryNav`)
- **Emitted by:** `src/generators/hub-page.ts:554–562` for hubs whose filter type is `event_type` or `event_types` (e.g., `/concerts`, `/theatre`, `/exhibitions`). Date hubs (e.g., `/today`, `/this-weekend`) do **not** receive it.
- **Injection point:** `hub-page.ts:400` — between `</header>` (the wrong one — see §2) and the capsule.
- **In locked 5-part hub spec?** No. The 5-part hub spec per `docs/session-log.md:525` and `docs/known-issues.md:574` is: (1) answer capsule, (2) comparison table, (3) event blocks, (4) FAQ accordion, (5) seasonal narrative. The category-nav is a cross-cutting navigation addition borrowed from `/category-page` templates. Its insertion into hubs is functional but **not specced**, so it counts as drift relative to the 5-part hub spec.
- **Drift flag:** Mild. Removing or restructuring it should be evaluated alongside the GEO Strategist's view on whether category-nav contributes useful internal linking on hubs.

**`<header class="page-header">`**
- **Defined in:** `src/templates/page.ts:159–170`
- **Emitted by:** every page rendered through `renderPage` — i.e., homepage, hubs, category pages, EDPs. Contains H1 + a "Τελευταία ενημέρωση" timestamp.
- **In locked 5-part hub spec?** No — it predates the hub spec; it's part of the **base page template**. It's locked at the page level, not at the hub level. The 5-part hub spec is layered on top of (and inside) the base template.
- **Drift flag:** None at the template level. But its content (154px of h1 + timestamp) may be candidate for compaction during the filter-bar fix; that's a separate design conversation.

---

## 5. Conclusion — which DN Path applies?

DN's decision tree as briefed:
- **Path A:** Capsule has drifted to 200–400 words → fix the drift.
- **Path B:** Capsule at spec, bloated CSS → apply CSS visual reorder.
- **Path C:** GEO blocks Path B → use compact-capsule pattern.

**Audit finding:** Capsule content is at-spec (36 words / 33 words, slightly under 40–60). Capsule rendered height of 595px must come from CSS, but that's only part of the picture — the **dominant defect is structural**, not visual: the capsule is injected at the wrong DOM position by a fragile regex.

**Recommended Path D — Anchor Fix (Structural):**
The capsule (and category-nav, where present) should be injected after `<header class="page-header">` (or directly into `<main>`), not after `<header class="site-header">`. The current regex `html.replace('</header>', …)` is property-anchored on tag name and lacks discriminating context — a textbook Pattern R violation. Two fix shapes worth weighing:

1. **Re-anchor the regex** to a structural marker the page-header guarantees (e.g., on the H1 outer element, or on the `<main>` open tag) — least invasive but still fragile.
2. **Compose the markup directly in `page.ts`** by threading `capsuleHtml` and `categoryNavHtml` through `renderPage` as `preMainContentHtml`, eliminating the post-render string replace entirely. This is what the homepage already does (`src/templates/homepage.ts:56` — capsule is emitted inline as first child of `<main>`), so the pattern exists in-codebase.

If Path D is chosen, Path B/C still apply *secondarily* — fixing the anchor moves the capsule below the page-header (reducing the visual "above the fold" damage), but the 595px CSS height question persists. Sequence:
1. **First:** fix the anchor so DOM is correct.
2. **Then:** re-measure on iPhone SE — the rendered capsule may still be 595px, in which case Path B (CSS reorder) or Path C (compact-capsule) applies on top.

If GEO Strategist insists the capsule must remain above the page-header (an arguable but unusual position), then Path D collapses to Path B/C and the regex bug is reframed as intentional. This audit cannot rule that in or out; it only surfaces that the current placement is the *output of a bug*, not a deliberate decision.

---

## 6. Recommended next-session inputs

What Dev Planner needs to thread into the filter-bar execution session:

1. **Confirmation of Path** (A/B/C/D) from Design Navigator, after seeing this audit. The audit recommends Path D as the dominant fix with Path B layered on top, but DN owns that call.
2. **GEO Strategist sign-off** on whether the answer capsule may move below the page-header (h1). Default reading is yes — the H1 already states the topic ("Συναυλίες στην Αθήνα") and the capsule expands on it; placing capsule below H1 is the more conventional pattern (homepage already does this).
3. **CSS audit of `.hub-answer-capsule`** — explicitly request padding / margin / font-size / line-height / border-left / background spec, since this audit confirmed content is not the bloat source. Likely lives in the hub-specific stylesheet (see `docs/session-log.md:534`).
4. **Decision on category-nav** — keep on hubs (and where), restructure, or remove. This audit flagged it as out-of-spec drift but not as defective.
5. **Decision on regex-vs-compose fix shape** — anchor-rewriting is faster, compose-via-`renderPage` is cleaner. Recommend compose path to align with homepage pattern and remove the implicit ordering dependency.
6. **Test surface** — if the fix lands, the existing `src/generators/__tests__/hub-page.test.ts:99-103` assertion (`expect(html).toContain('class="hub-answer-capsule"')`) is satisfied by *any* injection point. A regression test should assert capsule placement *relative to* page-header (e.g., position of `.hub-answer-capsule` > position of `<header class="page-header">` in the rendered HTML). This would have caught the current defect.

---

**Audit boundary respected:** No source files modified. Only this spec file written (`specs/capsule-drift-audit-2026-05-18.md`). Step 4 ⚠ "DO NOT IMPLEMENT YET" honored — findings handed back to Christos for Design Navigator + GEO Strategist routing.
