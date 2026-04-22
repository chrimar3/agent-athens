# Event Type Misclassification — Diagnostic Scope

**Session:** Diagnostic only (no fixes applied)
**Date:** 2026-04-21
**Problem class:** **Class C — Missing event type entirely (escalate to Editorial Director + GEO Strategist)**
**Proposed fix session:** After taxonomy decision — editorial + strategist review of whether to introduce a `talk` / `lecture` type, reclassify `tech`, or pragmatic-route to `other` with a `subtype` hint. Do NOT plan dev session until decision lands.

---

## Step 0: Regression hypothesis

All 103 categorizer tests pass (`bun test src/categorizer/__tests__/ src/validators/__tests__/event-categorizer.test.ts`). **Regression ruled out.** If misclassification is real, it's a coverage gap — not broken code.

---

## Step 4: Brian Cox + science/lecture sweep

Query (upcoming verified events only):
```sql
SELECT id, title, venue_name, type, url FROM events
WHERE location_status IN ('verified_athens','pass_through')
  AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')
  AND (title LIKE '%Brian Cox%' OR title LIKE '%Cox%'
       OR title LIKE '%διάλεξ%' OR title LIKE '%ομιλί%'
       OR title LIKE '%lecture%' OR title LIKE '%talk%' OR title LIKE '%science%'
       OR title LIKE '%επιστήμ%')
ORDER BY start_date;
```

**Result:** 1 row.

| ID                | Title                            | Venue              | Current type | Source     | URL                                                            | Proposed correct type              |
|-------------------|----------------------------------|--------------------|--------------|------------|----------------------------------------------------------------|------------------------------------|
| eff502c25197a121  | Professor BRIAN COX: Emergence   | Christmas Theater  | **theater**  | more.com   | https://www.viva.gr/gr-el/tickets/professor-brian-cox-in-athens/ | *(Editorial decision — see below)* |

**Observations:**
- Event is 2026-09-24 — 5 months out; stays visible a long time.
- Source `more.com` but URL domain `viva.gr` (pre-rebrand legacy; viva now redirects to more.com).
- Venue **Christmas Theater** is in `config/venue-categories.json → mixed_venues` (correctly flagged as not type-lockable — the venue hosts theater, concerts, tribute shows, and now lectures).

**Caveat: search only finds events with matching title keywords.** A science lecture with a marketing title like "An Evening with Dr. X" or "Emergence" alone (without "Brian Cox" in the title) would NOT appear. The true misclassification rate for science/lecture events is unknown from this query — we have one confirmed instance and a likely long tail. Dataset-wide audit would require sampling events at mixed venues or cross-referencing speaker/author databases.

### Other events at Christmas Theater (context for venue programming mix)

| Title                                                    | Start date   | Current type  | Source        |
|----------------------------------------------------------|--------------|---------------|---------------|
| Οι θεοί του Ολύμπου και η γέννηση του κόσμου            | 2026-04-21   | theater       | athinorama.gr |
| MARCOS AYALA TANGO — The Golden Years                    | 2026-04-22   | performance   | more.com      |
| Τα τραγούδια των χρωμάτων                                | 2026-04-27   | concert       | athinorama.gr |
| This is Michael — Michael Jackson tribute show           | 2026-05-15   | theater       | more.com      |
| Professor BRIAN COX: Emergence                           | 2026-09-24   | **theater**   | more.com      |

The venue hosts 5 distinct programming formats; only 2 of the 5 are correctly typed. This reinforces that **mixed venues cannot be solved by venue-locking** — the discriminator must come from title, description, or external metadata.

---

## Step 5: Why the categorizer missed this

The categorizer uses **four passes** in order (`src/categorizer/categorize-event.ts:410–440`):

1. **Venue rules** — `mixed_venues` list in `config/venue-categories.json` explicitly includes `Christmas Theater` → **Pass 1 correctly abstains**.
2. **Keyword rules** — `config/categorization-keywords.json`:
   - `theater` keywords: none match (no `παράσταση`, `θεατρο`, `monologue`, etc. in "Professor BRIAN COX: Emergence").
   - `tech` keywords: `research talk`, `lecture series`, `seminar`, `tech talk`, `conference`, `meetup`, `summit` — **none match "Emergence"** (the word `lecture` on its own is NOT a keyword; only `lecture series`).
   - No dedicated `talk` / `lecture` category exists.
   - → **Pass 2 no match**.
3. **URL path rules** — `config/url-category-patterns.json` only defines:
   - `/music/gig/` → concert
   - `/tickets/theater/` → theater (high conf)
   - `/tickets/music/` → concert (medium conf)
   - Brian Cox URL is `viva.gr/gr-el/tickets/professor-brian-cox-in-athens/` — **no `/tickets/theater/` or `/tickets/music/` segment** (viva.gr's URLs are flat, no category path). → **Pass 3 no match**.
4. **Source hints** — `config/venue-categories.json → source_type_hints` only has `clubber.gr → dj_set` and `residentadvisor → dj_set`. `more.com` has no source hint (and wouldn't be right if it did; more.com is multi-genre). → **Pass 4 no match**.
5. **Fallback** — `categorize-event.ts:431–440`: use `event.currentType` if not `'other'`, else default to `'concert'`. Brian Cox already had `currentType='theater'` (inherited from some earlier pipeline — possibly the archived `import-more-events.ts` or a historical ingest that inferred `theater` from venue name substring match). → Categorizer **preserves `theater` with `low` confidence and reason "kept current type"**.

**Where did the initial `theater` come from?**
The current `scripts/scrape-all.ts → scrapeMore()` only crawls `/music/`, `/theatre/`, `/sports/` listings on more.com. Brian Cox's URL (`/viva.gr/.../professor-brian-cox-in-athens/`) doesn't match the crawl regex, so the event did **not** come through the current more.com scraper. Likely origin paths:
- Archived pipeline (`scripts/_archive/import-more-events.ts` / `parse_tier1_sites.py`) — these wrote events before the current pipeline existed; any rows they created persist via the ON CONFLICT UPDATE which doesn't overwrite `type`.
- Cross-referencing: `scripts/crossref-ticket-urls.ts` copies ticket_url from more.com-source events to athinorama ones, but the reverse path (athinorama → more.com typing) isn't obvious from the code. Worth a deeper look in the fix session.
- Manual import / legacy CSV.

**Schema-level context:** The TS `EventType` has 12 values (`concert, dj_set, exhibition, cinema, theater, festival, performance, show, workshop, tech, dance, other`). The DB type column is TEXT without a CHECK constraint — whatever the app writes is stored. Current `tech`-typed rows are all IT/industry events (AI meetup, Devoxx, SEO conference, Greeks in AI). **There is no "talk / lecture / science communication" type**, and `tech` has de-facto industry semantics that would be diluted if Brian Cox went there.

---

## Problem classification

### Four classes (from plan):
- **Class A — Regression in Session 71:** ❌ Ruled out. Tests pass.
- **Class B — Missing URL pattern in `url-category-patterns.json`:** ❌ Partial. Adding `/tickets/theater/professor-*` would be a hack; the real URL doesn't carry a reliable category signal, especially on viva.gr. Won't generalize.
- **Class C — Missing event type entirely:** ✅ **PRIMARY**. No type in `EventType` enum fits a celebrity-scientist lecture tour. `tech` has wrong semantics (IT industry); `performance` is for ballet/dance/experimental; `show` is comedy/cabaret/variety; `theater` is dramatic productions. This is a **taxonomy gap**, not a code bug.
- **Class D — Keyword gap in categorizer:** ⚠️ Secondary. Even with the right type added, we need title/description keywords like `Professor`, `PhD`, `Dr\\.? `, `lecture` (bare), `διάλεξη`, `ομιλία`, `emergence` as theme words. But keywords only matter AFTER a target type exists.

### Recommendation
**Escalate to Editorial Director + GEO Strategist.** The decision required is taxonomic:

1. **Option A:** Introduce a new `talk` type (EventType + schema + hub page + filter UI + Schema.org mapping `EducationEvent` or `PublicLecture`). Clean semantics, but touches hub taxonomy, SEO (new hub page or URL structure), and all filter/facet surfaces.
2. **Option B:** Expand `tech` to `talks_and_tech` with a `subtype` field (`industry | science | humanities | debate`). Lower taxonomic churn, but dilutes existing `tech` SEO signals.
3. **Option C:** Route to `other` pragmatically, add a new `topic` field for filtering. Zero taxonomy churn, but events become less discoverable and `other` becomes a dumping ground.

Hub page impact (GEO Strategist input needed): if we create a `/talks/` or `/lectures/` hub, what's the content plan? Is there enough Athens lecture volume to justify a hub (Megaron lectures, Benaki series, philosophical societies, etc.)?

Only **after** this decision lands should a dev fix session be scheduled. The dev work itself is small (new enum value, keyword list, URL patterns, hub page) — the hard part is the editorial/strategic choice.

---

## Proposed fix session

1. **Step 1 — Editorial Director + GEO Strategist meeting:** decide between Options A / B / C above. Estimate Athens-wide lecture/talk event volume (spot-check megaron.gr, snfcc, Benaki, Onassis, Eugenides Foundation) to inform the hub-page question. Output: a written taxonomy decision doc.
2. **Step 2 — Dev session (only after Step 1):** implement the chosen option. For Option A: add `talk` to `EventType`, expand `categorization-keywords.json`, add URL patterns for common talk venues/slugs, update `recategorize-events.ts` and run a retroactive sweep with audit. Include a test case for Brian Cox in `src/categorizer/__tests__/categorize-event.test.ts`.
3. **Step 3 — Retroactive sweep:** after enum/config changes, re-run categorizer over existing events at mixed venues (Christmas Theater, Megaron, SNFCC) and surface any type changes for spot-check.
