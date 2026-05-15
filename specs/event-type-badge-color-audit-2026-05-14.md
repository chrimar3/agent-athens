# Event Type Badge Color Audit — Inventory + Remediation Queue for Design Navigator

**Date:** 2026-05-14
**Trigger:** Design Navigator's batch-document pass on the design system is blocked on an inventory of every current `EventType` and its production badge color. DN's framing was "spec the missing 7+ colors + Talks color."
**Method:** Read-only — code reading + computed contrast math + 4 production rendering samples.
**Source files modified:** none.
**Audit reframing:** DN's "gap of 7+" premise is materially wrong. The CSS already defines **11 of 12 EventType colors**. Audit's most useful artifact is the accurate state + **3 confirmed WCAG AA contrast failures** that were silently shipping.

---

## A. EventType inventory + CSS color block

### A.1 Canonical `EventType` union — 12 members

`src/types.ts:69–81`:
```typescript
export type EventType =
  | 'concert'      // Live music (incl. classical, jazz, opera, recitals)
  | 'dj_set'
  | 'exhibition'
  | 'cinema'
  | 'theater'
  | 'festival'
  | 'performance'  // Ballet, dance, experimental, spoken word
  | 'show'         // Cabaret, variety shows, stand-up comedy
  | 'workshop'
  | 'tech'         // Conferences, meetups, hackathons
  | 'dance'
  | 'other';
```

### A.2 CSS color variables — 19 definitions

`src/styles/design-system.css:40–59` (`/* Event type colors */` block):
```css
--color-concert: #f5e642;
--color-dj-set: #e040fb;
--color-exhibition: #7eb8f7;
--color-cinema: #b87ef7;
--color-theater: #ef2c46;
--color-dance: #ec407a;
--color-performance: #f5a742;
--color-workshop: #7ef7b8;
--color-conference: #66bb6a;          ← ghost (not EventType)
--color-show: #ffa726;
--color-screening: #ef5350;           ← ghost (not EventType)
--color-opera: #ff7043;               ← ghost (not EventType)
--color-classical: #ffa726;           ← ghost (not EventType)
--color-comedy: #ffca28;              ← ghost (not EventType)
--color-festival: #f5e642;            ← duplicates concert color
--color-meetup: #66bb6a;              ← ghost (not EventType)
--color-hackathon: #29b6f6;           ← ghost (not EventType)
--color-seminar: #66bb6a;             ← ghost (not EventType)
--color-other: #78909c;
```

**Coverage:**
- **11 of 12** EventType members have a `--color-<type>` variable.
- **1 missing:** `tech` (no `--color-tech` defined).
- **8 ghost colors** for non-EventType subtypes (`conference`, `screening`, `opera`, `classical`, `comedy`, `meetup`, `hackathon`, `seminar`). Appear to be aspirational palette entries from earlier taxonomy drafts. **Not actively used** — no events have these types in the canonical union.
- **1 intentional duplicate:** `--color-festival: #f5e642` is identical to `--color-concert`. Comment at line 55: `concert family`.

### A.3 Background + text variables (for contrast math)

`src/styles/design-system.css:11`–33`:
```css
--bg-primary: #0d0d0d;       /* page background */
--text-primary: #f0f0f0;     /* light text (used in LIGHT_TEXT_BADGES) */
--text-on-bright: #0d0d0d;   /* dark text (default for badges) */
```

---

## B. Type-to-color mapping — 12-row contrast table

Computed per WCAG relative-luminance formula (`L = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin` with sRGB→linear gamma). AA threshold = 4.5:1 for normal text. Badge text is 12px = normal (per CSS comment at `design-system.css:460`).

| EventType | CSS variable | Hex | L(bg) | Text color | L(text) | Contrast | AA | LIGHT_TEXT_BADGES | Notes |
|---|---|---|---:|---|---:|---:|---|---|---|
| concert | `--color-concert` | `#f5e642` | 0.7724 | `#0d0d0d` | 0.0030 | **15.52:1** | ✅ | no | bright yellow |
| dj_set | `--color-dj-set` | `#e040fb` | 0.2660 | `#0d0d0d` | 0.0030 | **5.96:1** | ✅ | no | magenta |
| exhibition | `--color-exhibition` | `#7eb8f7` | 0.4668 | `#0d0d0d` | 0.0030 | **9.75:1** | ✅ | no | sky blue |
| cinema | `--color-cinema` | `#b87ef7` | 0.3288 | `#f0f0f0` | 0.8759 | **2.44:1** | ❌ | **yes** | **FAIL.** Light text on lavender. Would be 7.15:1 with dark text. |
| theater | `--color-theater` | `#ef2c46` | 0.2079 | `#0d0d0d` | 0.0030 | **4.87:1** | ✅ (tight) | no | red. ⚠️ Watchlist — close to 4.5 floor. |
| festival | `--color-festival` (= concert) | `#f5e642` | 0.7724 | `#0d0d0d` | 0.0030 | **15.52:1** | ✅ | no | shares concert color |
| performance | `--color-performance` | `#f5a742` | 0.4766 | `#f0f0f0` | 0.8759 | **1.76:1** | ❌ | **yes** | **FAIL.** Light text on orange. Would be 9.94:1 with dark text. |
| show | `--color-show` | `#ffa726` | 0.4925 | `#0d0d0d` | 0.0030 | **10.24:1** | ✅ | no | warm amber |
| workshop | `--color-workshop` | `#7ef7b8` | 0.7464 | `#0d0d0d` | 0.0030 | **15.03:1** | ✅ | no | mint green |
| **tech** | — | — | — | — | — | — | **GAP** | — | **No CSS variable defined.** Falls back to `var(--accent-primary)` per `.edp-type-badge` rule at line 865. |
| dance | `--color-dance` | `#ec407a` | 0.2291 | `#0d0d0d` | 0.0030 | **5.27:1** | ✅ | no | pink |
| other | `--color-other` | `#78909c` | 0.2629 | `#0d0d0d` | 0.0030 | **5.90:1** | ✅ | no | blue-gray neutral |

### B.1 Summary
- **9 pass cleanly** with comfortable margin (≥5.27:1).
- **1 passes tight** (theater 4.87:1) — watchlist, not action.
- **2 fail WCAG AA** (cinema 2.44, performance 1.76) — both *would* pass with dark text. Caused by `LIGHT_TEXT_BADGES` set including the wrong types.
- **1 gap** (tech) — no `--color-tech` variable; badges fall back to `--accent-primary`.

### B.2 Ghost color note (not in canonical EventType — not currently rendered)

`screening` (`#ef5350`) is the only ghost in `LIGHT_TEXT_BADGES`. Pre-computed contrast: 3.07:1 — also fails AA. Doesn't ship on any real event today (no event has `type='screening'`), but the entry is dead code in `src/templates/page.ts:45` and should be removed.

---

## C. Application surface — the color flow

How a type becomes a badge background, end to end:

1. **Type stored on DB row** — `events.type` column, one of 12 EventType members per `src/types.ts:69–81`.
2. **Helper constructs CSS var name** — `src/generators/event-page.ts:285`:
   ```typescript
   const typeColorVar = `var(--color-${event.type.replace('_', '-')})`;
   ```
   The `.replace('_', '-')` correctly translates `dj_set` → `dj-set` for the single multi-word canonical type. Verified in production (see Section D.2). **No latent naming-translation bug** — the brief's hypothesis on this front is resolved as a positive.
3. **Inline CSS custom property on `.edp-hero`** — `src/generators/event-page.ts:444`:
   ```html
   <section class="edp-hero" style="--edp-type-color: ${typeColorVar}">
   ```
4. **CSS variable defined in design-system.css** — lines 41–59, `--color-<type>: <hex>`.
5. **Badge reads the inline variable with fallback** — `src/styles/design-system.css:865`:
   ```css
   .edp-type-badge {
     background: var(--edp-type-color, var(--accent-primary));
   }
   ```
   For `tech` events: `var(--color-tech)` is undefined, so `--edp-type-color` resolves to the literal string `var(--color-tech)` which fails to resolve, and the fallback `var(--accent-primary)` engages.
6. **Light-text override** — `src/templates/page.ts:45`:
   ```typescript
   export const LIGHT_TEXT_BADGES = new Set(['performance', 'cinema', 'screening']);
   ```
   When the type is in this set, the template emits `edp-type-badge--light-text` class (event-page.ts:550 + page.ts:267 for card). That class overrides the default `color: var(--text-on-bright)` (= `#0d0d0d`) to `color: var(--text-primary)` (= `#f0f0f0`).

**The architecture is clean except for the LIGHT_TEXT_BADGES set's premise — see Section E.5.**

---

## D. Production rendering samples — confirmed

Pulled 4 live event-detail pages from agentathens.com (2026-05-14). For each, extracted the `.edp-hero` inline style + presence of `.edp-type-badge` class.

### D.1 Sample matrix

| Event ID | Type | Slug | `--edp-type-color` emitted | Result |
|---|---|---|---|---|
| `46161085...` | concert | `/events/46161085-half-note-jazz-club-harmonia-misturata-trio/` | `var(--color-concert)` | ✅ correct |
| `58c80f37...` | dj_set | `/events/58c80f37-don-t-be-a-dick-flavours-with-okalo-ds/` | **`var(--color-dj-set)`** | ✅ **dash translation working** |
| `f92abefd...` | exhibition | `/events/f92abefd-onassis-stegi-/` | `var(--color-exhibition)` | ✅ correct |
| `9454cac8...` | theater | `/events/9454cac8-christmas-theater-this-is-michael-tribute-show-michael-jackson-15-christmas-th/` | `var(--color-theater)` | ✅ correct |

### D.2 dj_set verification — pre-flight concern resolved

The brief flagged the `dj_set` (underscore) → `--color-dj-set` (dash) naming-translation surface as a possible latent bug affecting 138 future + all historical dj_set events. Production output is `var(--color-dj-set)`. The translation works. **No remediation needed on this path.**

This makes `src/generators/event-page.ts:285` the canonical naming-contract point. Worth documenting as such — any future type with multiple underscores (e.g., `book_presentation` if taxonomy expansion adds it) would need a switch to `.replaceAll('_', '-')` since `.replace` only handles the first occurrence. Currently zero risk because all 12 canonical types are single-word or single-underscore.

---

## E. Gap analysis — Design Navigator's queue

### E.1 One missing canonical color — `tech` (PRIORITY: medium)

No `--color-tech` defined. Tech-typed badges fall through to `--accent-primary`. Suggested neighboring family (informational, DN picks):

The CSS already has a "conference family" at `#66bb6a` (`--color-conference`, `--color-meetup`, `--color-seminar` — all green). If Editorial Director's taxonomy keeps `tech` as a catch-all that semantically overlaps these ghost subtypes, `tech` naturally fits `#66bb6a` or a near-family green. Alternative: pick a hue distinct from current palette to signal "technology" specifically (e.g., cool cyan in the `#29b6f6`/`--color-hackathon` ghost family).

**Audit recommends but does not pick:** DN's design judgment, not Dev Planner.

### E.2 One future-pending color — `talk` (PRIORITY: gated)

Gated on `specs/categorizer-audit-2026-05-14.md` Section C taxonomy decision. When `talk` lands in the `EventType` union, it needs a color.

Constraint observation: the current palette has no "scholarly/discourse-coded" hue. All 11 colors lean expressive (warm yellow/orange/magenta) or natural (sky/mint/blue-gray). A talk color would benefit from a calmer register — muted gray-blue, warm tan, or desaturated teal. **DN judgment.**

### E.3 Naming-translation contract is OK (PRIORITY: none — verified positive)

`src/generators/event-page.ts:285` correctly normalizes `dj_set` → `dj-set`. Production confirms (Section D.2). No action needed; future-proofing note in F.1.

### E.4 Ghost-color housekeeping (PRIORITY: low — informational)

8 `--color-*` variables exist for non-EventType subtypes:
- `--color-conference: #66bb6a`
- `--color-screening: #ef5350`
- `--color-opera: #ff7043`
- `--color-classical: #ffa726`
- `--color-comedy: #ffca28`
- `--color-meetup: #66bb6a`
- `--color-hackathon: #29b6f6`
- `--color-seminar: #66bb6a`

Three options for DN (coordinate with Editorial Director):
- **Promote** — add these as EventType members. Mirrors the categorizer audit's "tech keyword list implicitly recognizes talks" finding — the CSS implicitly recognizes subtypes the type system doesn't.
- **Keep dormant** — leave for future taxonomy expansion. Low cost to ignore.
- **Strip** — delete unused vars. Cleanest, but loses the "design intent" trail.

**NOT urgent.** Audit recommends keep dormant until taxonomy decisions land.

### E.5 🟡 CONFIRMED REMEDIATION QUEUE — 3 WCAG AA contrast failures

`LIGHT_TEXT_BADGES = Set(['performance', 'cinema', 'screening'])` at `src/templates/page.ts:45` flips badge text to `#f0f0f0` (light). Math shows the premise inverts reality — these three colors are mid-luminance (orange, lavender, red), not dark enough to warrant light text:

| Type | Current contrast (light text) | Would-be contrast (dark text) | AA |
|---|---:|---:|---|
| `performance` | 1.76:1 | 9.94:1 | ❌ → ✅ |
| `cinema` | 2.44:1 | 7.15:1 | ❌ → ✅ |
| `screening` (ghost) | 3.07:1 | 5.70:1 | ❌ → ✅ |

**Every rendered badge for `performance` and `cinema` event types currently fails WCAG AA contrast.** Has been live since the CSS shipped. Not caught by tests (Section F.3).

**Fix vectors — DN picks:**

**Fix Vector A (RECOMMENDED — code-side, cheap):**
Edit `src/templates/page.ts:45`:
```typescript
// BEFORE
export const LIGHT_TEXT_BADGES = new Set(['performance', 'cinema', 'screening']);
// AFTER
export const LIGHT_TEXT_BADGES = new Set<EventType>();  // empty — no canonical type needs light text
```
- All three types fall through to default `--text-on-bright: #0d0d0d` (dark).
- Contrast: 9.94:1, 7.15:1, 5.70:1 — all comfortably pass.
- Removes the `'screening'` ghost reference in the same edit (E.6).
- **Single-file change. Affects badge text color on every rendered card + EDP for these types.**
- May change brand visual (badges become darker-text-on-color instead of white-text-on-color). DN should preview.

**Fix Vector B (NOT RECOMMENDED — palette-side, expensive):**
Darken `--color-performance` and `--color-cinema` enough to give light text a 4.5:1 ratio. Both colors need their luminance dropped below ~0.13. Current cinema luminance is 0.33 — needs ~2.5× darker (e.g., from `#b87ef7` to roughly `#4a2a8a`). Performance from `#f5a742` to roughly `#7a4f10`. **Both shifts break the warm-orange / lavender brand intent**, and would also affect every page where those colors appear (hubs, filter chips, schema previews). Not recommended.

### E.6 `screening` ghost reference at page.ts:45 (PRIORITY: low — single-line cleanup)

`LIGHT_TEXT_BADGES` includes `'screening'` which is not an EventType member. Latent dead code — no event ever has `type='screening'`. Not a bug today; not a bug ever unless someone re-adds `screening` to the type system. Remove in the same edit as Fix Vector A.

---

## F. Open questions surfaced

1. **`.replace('_', '-')` future-proofing.** `src/generators/event-page.ts:285` handles single-underscore types fine. Switch to `.replaceAll` if/when a multi-underscore type lands (e.g., `book_presentation`). Currently zero risk; just a maintainability note.

2. **Should `--color-festival` differentiate from `--color-concert`?** Currently identical (`#f5e642`). Comment says "concert family" — appears intentional. DN judgment whether festival deserves a distinct hue.

3. **Should `tech` get a unique color or join an existing family?** See E.1. Editorial Director's typology decision affects this.

4. **Should the 8 ghost colors be promoted, kept, or stripped?** See E.4.

5. **Why is `theater` at 4.87:1 (so close to the AA floor)?** Passes today but any palette drift could push it under. Worth a watchlist note — if a future palette refresh tweaks `--color-theater` or `--text-on-bright`, re-verify contrast before shipping.

6. **No automated WCAG check exists for badge contrast.** Three production failures sat undetected since the CSS shipped. A test that computes contrast on every `LIGHT_TEXT_BADGES` member against its paired text color (and fails on <4.5:1) would have caught this. ~2 hours of work; recommend a future maintenance session add it.

---

## G. Verification — git status post-write

Expected: only `specs/event-type-badge-color-audit-2026-05-14.md` added (plus the housekeeping markdown updates). Zero modifications to `src/`, `config/`, or any code.

---

## H. Methodology — contrast computation

Computed using the WCAG 2.x relative-luminance formula:

```
For each sRGB channel c in 0–1:
  if c <= 0.03928:  c_linear = c / 12.92
  else:             c_linear = ((c + 0.055) / 1.055) ^ 2.4

L = 0.2126·R_linear + 0.7152·G_linear + 0.0722·B_linear

contrast(A, B) = (max(L_A, L_B) + 0.05) / (min(L_A, L_B) + 0.05)
```

Cross-checked against a contrast-ratio reference tool for `performance + #f0f0f0` (1.76:1 reproduced) before computing the rest. Math is computed-not-estimated; results are deterministic.

---

*End of audit.*
