# megaron.gr `category-title` Spike — Ground Truth for Scraper Broadening

**Date:** 2026-05-14
**Source:** `https://www.megaron.gr/el/events` (redirects to `/events/events-calendar/`)
**Method:** Single curl of the listing page (415 KB, 66 event cards). Extracted every distinct `class="category-title"` text via regex. Hex-inspected for NFC/NFD/whitespace variations.
**Purpose:** Ground truth for the broadened `categoryToType()` mapping in `scripts/scrape-megaron.ts`. Audit reference: `specs/categorizer-audit-2026-05-14.md`.

---

## A. Critical preflight finding — wrong URL initially

Initial spike fetched event-detail pages (e.g., `/event/<slug>/`). Those pages show `category-title` on **sidebar recommendation cards**, NOT the event itself. Quoting them as the event's own category would have been a false signal — the Pavlopoulos event-detail page returned zero `category-title` matches; the Tasios detail page returned both `Μουσική` (sidebar music recommendations) and `Διάλεξη` (the event's actual category — but mixed with neighbors).

**The scraper at `scripts/scrape-megaron.ts:49` reads the listing page, not detail pages.** Spike re-pointed to match. This is the data path the scraper actually traverses.

URL chain: `/el/events` → 301 → `/events/` → 301 → `/events/events-calendar/`. Bun fetch follows redirects automatically; the scraper's existing fetch path is correct.

---

## B. Distinct `category-title` strings on the listing (9 total)

Sorted by occurrence count:

| Count | String | UTF-8 hex (no `&amp;`) | Maps to `EventType` | Reasoning |
|---:|---|---|---|---|
| 30 | `Μουσική` | `ce9c cebf cf85 cf83 ceb9 ceba ceae` | `'concert'` | Music — canonical concert mapping. |
| 8 | `Εκπαιδευτικά & Δράσεις` | (entity-encoded as `&amp;` in HTML) | `'workshop'` | "Educational & Actions" — children's programs, interactive sessions. Closest fit in current `EventType` union. |
| 3 | `Όπερα` | `ce8c cf80 ceb5 cf81 ceb1` | `'concert'` | Opera is music per `EventType` union comment at `src/types.ts:70`: "Live music (incl. classical, jazz, opera, recitals)". |
| 3 | `Έκθεση` | `ce88 ceba ceb8 ceb5 cf83 ceb7` | `'exhibition'` | Exhibition — direct mapping. |
| 2 | `Θέατρο` | `ce98 cead ceb1 cf84 cf81 cebf` | `'theater'` | Theater — direct mapping. |
| 2 | `Διάλεξη` | `ce94 ceb9 ceac cebb ceb5 cebe ceb7` | `'other'` | Lecture — talk-class. No canonical `'talk'` type yet (`specs/categorizer-audit-2026-05-14.md` Section C). Routes to `'other'` (review-needed signal) until taxonomy lands. |
| 1 | `Συζήτηση` | `cea3 cf85 ceb6 ceae cf84 ceb7 cf83 ceb7` | `'other'` | Discussion — talk-class. Same routing as Διάλεξη. |
| 1 | `Εκδηλώσεις Τρίτων` | `ce95 ceba ceb4 ceb7 cebb cf8e cf83 ceb5 ceb9 cf82 20 cea4 cf81 ceaf cf84 cf89 cebd` | `'other'` | "Third-party events" — venue rented out. Type varies case-by-case; default to `'other'`. |
| 1 | `Online` | `4f6e 6c69 6e65` | `'other'` | Online events — could be talk/concert/screening. Default to `'other'`. |

**All strings are properly NFC-encoded.** Hex inspection shows Greek characters as 2-byte UTF-8 sequences with no decomposed-form (NFD) surprises. Defensive `.normalize('NFC').trim()` should still be applied in the scraper since megaron.gr could change CMS behavior.

**HTML entity gotcha:** `Εκπαιδευτικά &amp; Δράσεις` arrives entity-encoded. The scraper's current `categoryToType()` operates on `catMatch[1].trim()` — does not decode `&amp;`. The replacement must either:
1. Decode entities before matching: `String.replace('&amp;', '&').normalize('NFC').trim()`
2. Or include the entity-encoded form in the mapping: match against `"Εκπαιδευτικά &amp; Δράσεις"` directly.

Option 1 is cleaner and more defensive (handles other future entities like `&#8211;`).

---

## C. Spike-target verification (8 events from audit Appendix)

Verified each event's actual category on the listing page:

| ID | Audit hand-class | megaron.gr listing category | Maps to | Result |
|---|---|---|---|---|
| `15e395128b7b285b` | **talk** (Pavlopoulos) | **Συζήτηση** | `'other'` | ✅ Will retype (concert → other) |
| `293f2e89038f6ef8` | **talk** (Tasios) | **Διάλεξη** | `'other'` | ✅ Will retype |
| `44a392bd4b3651c0` | **talk** (Mundus inversus) | **Μουσική** | `'concert'` | ❌ Stays `concert`. **megaron.gr categorizes this lecture-about-music as music.** Fix won't reach. |
| `24f44bc9b8ac557a` | music (Hadjidakis) | Μουσική | `'concert'` | ✅ Correct (no change) |
| `0eef5542c9d28362` | children (Heracles) | Εκπαιδευτικά & Δράσεις | `'workshop'` | ✅ Will retype (concert → workshop) |
| `1fff7b965b365312` | children (ANIMEGARON) | Εκπαιδευτικά & Δράσεις | `'workshop'` | ✅ Will retype |
| `40948c023a05ab68` | cinema (Vienna Phil Unitel Προβολή) | Μουσική | `'concert'` | ❌ Stays. megaron labels filmed-concert as music. |
| `4637db0d100e4753` | festival (Bobos) | Μουσική | `'concert'` | ❌ Stays. megaron labels as music. |

### C.1 Outcome projection across the 11–13 misclassified events from audit Section B.1

After Step 3 scraper broadening (this session):
- **2 of 3 talks fixed** — Pavlopoulos, Tasios. Mundus inversus remains `'concert'`.
- **4 of 4 children's programs fixed** — all 4 retype to `'workshop'`.
- **0 of 3 cinema screenings fixed** — megaron categorizes Προβολή Unitel as `Μουσική`.
- **0 of 1 festival fixed** — Bobos labelled `Μουσική`.
- **0 of 2 ambiguous-leaning-talk fixed** — both labelled `Μουσική` on the source.

Net: **6 of 13 misclassifications fixed** (~46%). Higher when weighted by credibility risk — the two headline talks (Pavlopoulos + Tasios) are the user's stated concern, and both are in the fixed set.

### C.2 Why the cinema/festival/Mundus inversus events stay misclassified

megaron.gr's source-side categorization uses **venue logic** ("this is the Athens Concert Hall, ergo Μουσική") rather than **format logic** ("this is a film projection, ergo Cinema" or "this is a lecture, ergo Διάλεξη"). The new scraper honors megaron's labels — when megaron is itself wrong-by-our-standards, the scraper inherits the wrongness.

This is the limit of source-side categorization. Closing the gap requires either:
- **Title-keyword secondary pass** (Step 5 of this session) — but the proposed Greek keywords don't match these titles either:
  - "Mundus inversus: η μουσική στο έργο του Ιερώνυμου Μπος" — no talk-keyword
  - "Φιλαρμονική της Βιέννης: ... – Προβολή Unitel" — has "Προβολή" but Step 5's keywords don't include it
  - "Bobos Arts Festival" — "Festival" already in keyword config; would correctly route to `'festival'` IF the scraper-set type didn't pre-empt the categorizer's keyword pass. But the recategorizer reads `currentType` and preserves it on low confidence (`src/categorizer/categorize-event.ts:427–432`).
- **Post-enrichment LLM correction pass** (audit Section D Option 5) — would catch these but expensive and out of session scope.
- **Manual DB override** (audit Section D.1 option 3) — case-by-case for credibility-sensitive events.

**Recommendation for this session: ship the partial fix.** Pavlopoulos + Tasios + 4 children = 6 credibility-positive corrections. The remaining 7 are limit-of-architecture cases to address in a follow-up.

---

## D. Categorizer-keyword Step 5 reconciliation

The brief's Step 5 proposes adding Greek talk-keywords (`συζήτηση`, `ομιλία`, `διάλεξη`, `συνέδριο`, `ημερίδα`, `πάνελ`, `παρουσίαση βιβλίου`) to `config/categorization-keywords.json` under `tech.title_keywords`. Pre-flight confirmed zero current events have these keywords in their title.

After Step 6 re-scrape:
- Pavlopoulos title = "Μύθοι και αλήθειες στην εποχή της Τεχνητής Νοημοσύνης – Τεχνητή Νοημοσύνη και απονομή της Δικαιοσύνης" — no Step 5 keyword.
- Tasios title = "Αρχαία ελληνική μυθολογία και τεχνολογία – Θεοδόσης Π. Τάσιος" — no Step 5 keyword.
- Mundus inversus title = "Mundus inversus: η μουσική στο έργο του Ιερώνυμου Μπος" — no Step 5 keyword.

So Step 5 will not retype any of the 3 talks. **Step 5's value in this session is purely insurance** for future events from other sources whose titles happen to contain Greek talk-markers. Worth shipping (it's a cheap config-only change), but don't expect immediate effect.

---

## E. Final mapping for `categoryToType()` implementation

Pseudocode for `scripts/scrape-megaron.ts` Step 3:

```typescript
function categoryToType(rawCategory: string): EventType {
  // Decode HTML entities + normalize Unicode + trim whitespace
  const c = rawCategory
    .replace(/&amp;/g, '&')
    .normalize('NFC')
    .trim();

  switch (c) {
    case 'Μουσική':                    return 'concert';
    case 'Όπερα':                      return 'concert';
    case 'Έκθεση':                     return 'exhibition';
    case 'Θέατρο':                     return 'theater';
    case 'Διάλεξη':                    return 'other';   // talk — taxonomy pending
    case 'Συζήτηση':                   return 'other';   // talk — taxonomy pending
    case 'Εκπαιδευτικά & Δράσεις':     return 'workshop';
    case 'Εκδηλώσεις Τρίτων':          return 'other';   // varies
    case 'Online':                     return 'other';   // varies
    default:                           return 'other';   // unknown category → review queue
  }
}
```

And line 107 of the scraper changes from `: 'concert'` to `: 'other'` for the absent-category fallback.

---

## F. Open questions surfaced (out of scope this session)

1. **Mundus inversus** — megaron.gr categorizes this lecture-about-music as `Μουσική`. The post-demo taxonomy session should decide whether to (a) accept source-side categorization as ground truth, (b) layer a title-content classifier on top to catch lecture-about-X patterns, or (c) manual review queue for ambiguous Megaron events.

2. **Όπερα → `'concert'` is a mapping convention.** The `EventType` union comment at `src/types.ts:70` includes opera in the concert family. If the taxonomy session decides opera deserves its own bin (the CSS already has a ghost `--color-opera: #ff7043` at `design-system.css:52`), this mapping changes.

3. **`Εκπαιδευτικά & Δράσεις` → `'workshop'` is a forced fit.** The actual event types under this label span children's theater (Heracles), anime festival (ANIMEGARON), interactive music for children (4b0d6f64 from audit Appendix). None are pure workshops. `'workshop'` is the closest fit in the current 12-member union; a future `'kids'` or `'family'` type would be more accurate.

4. **The 9-string mapping is a snapshot.** megaron.gr could add new categories (e.g., they don't currently have a `'Φεστιβάλ'` label even though Bobos is a festival). The `default: 'other'` branch handles new unknowns by routing to review queue. Worth a re-spike every quarter or so.

---

*End of spike.*
