# Event ID Stability Audit — Title-Edit Failure Mode

**Date:** 2026-05-15
**Trigger:** S140 (2026-05-14) surfaced during megaron.gr re-scrape: title edit at source → different MD5 hash → INSERT (not UPDATE) → dedup pipeline preserves the older wrong-typed row over the newer correct-typed one. Required 5 manual SQL UPDATEs to recover.
**Method:** Read-only — code reading + DB SELECT + step-by-step trace. Zero source modifications.
**Source files modified by audit:** none (verified via `git status`).
**Companion housekeeping (this session):** `.claude/notes/decisions.md` (routing entry), `docs/known-issues.md` (promote dedup issue to formal 🟡 entry), `.claude/notes/patterns.md` (Pattern A'' wrong-cardinality assumption).

**Headline finding:** The brief framed `generateEventId` as a single function. Reality: **10 implementation sites with THREE distinct contracts** (signature + algorithm + separator). Vector A (`generateEventId` hash on URL) has bigger blast radius than the brief assumed. **Recommendation: Vector C (smart-dedup hybrid)** — fixes S140 case specifically with zero migration burden and leaves Vector A as a Phase-2 if recurrence accumulates.

---

## A. The S140 anchor case

### A.1 What happened

Source: `.claude/notes/mistakes.md` S140 entry (2026-05-14, third sub-item):

> `upsertEvent` keyed on `(title, start_date)`-hashed ID created a duplicate row when megaron.gr's listing title diverged from the DB title. Pavlopoulos in DB: "Μύθοι και αλήθειες…" (id `15e395128b7b285b`). Pavlopoulos on megaron.gr listing: "Τεχνητή Νοημοσύνη και απονομή Δικαιοσύνης – Προκόπης Παυλόπουλος." Same URL, same date, different title → `generateEventId` at scrape-megaron.ts:28-31 hashed `${title}-${startDate}` and produced a different ID. `upsertEvent` performed an INSERT (not UPDATE) for the "new" event. Result: two Pavlopoulos rows scheduled for 2026-05-29, one `concert`, one `other`.

Subsequent dedup at `scripts/remove-duplicates.ts` Pass 1 (URL-based) caught the URL collision but its keep-decision favored the older `concert` row. Net: re-scrape correctly typed the talk; dedup undid the fix.

### A.2 Recovery state

5 manual SQL UPDATEs applied 2026-05-14 (user-approved via AskUserQuestion). Verified stable as of 2026-05-15:

| ID | Type | Title (truncated) |
|---|---|---|
| `15e395128b7b285b` | other | Μύθοι και αλήθειες στην εποχή της Τεχνητής Νοημοσύνης – … (Pavlopoulos) |
| `293f2e89038f6ef8` | other | Αρχαία ελληνική μυθολογία και τεχνολογία (Tasios) |
| `0eef5542c9d28362` | workshop | Οι άθλοι του Ηρακλή (Heracles children's program) |
| `1fff7b965b365312` | workshop | ANIMEGARON 2026 |
| `50cff6521af2164e` | workshop | «Ταξίδι στο Κέντρο της Μουσικής» |
| `2fd4654651dac647` | other | Βουτιές στην τέχνη |

The 5 manual UPDATEs are the audit's anchor: they are the cost of the failure mode, paid once. The audit's job is to ensure the recurrence rate stays at 0.

---

## B. ID generation contract — dispersion across 10 sites and 3 clusters

The brief assumed `generateEventId` was a single function. It is **not**. Verbatim source from each site:

### B.1 Cluster 1 — `email-ingestion` (sha256, 3-param, dash separator, no .trim())

`src/ingest/email-ingestion.ts:313`:
```typescript
export function generateEventId(title: string, date: string, venue: string): string {
  const hash = createHash('sha256');
  hash.update(`${title.toLowerCase()}-${date}-${venue.toLowerCase()}`);
  return hash.digest('hex').substring(0, 16);
}
```

This is the only site that:
- Uses sha256 (others use md5 or crypto-prefixed sha256)
- Skips `.trim()` on title and venue
- Uses dash separator with 3 params
- Is `export`ed for reuse

### B.2 Cluster 2 — `scrape-all` family (md5, 3-param, pipe separator, .trim())

5 sites with identical bodies:

`scripts/scrape-all.ts:83`, `scripts/scrape-ai-tech.ts:81`, `scripts/scrape-snfcc.ts:114`, `scripts/fix-malformed-data.ts:22`:
```typescript
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}
```

`scripts/_archive/import-events-from-parsed.ts:31` (archived but same shape, different hash):
```typescript
function generateEventId(title: string, date: string, venue: string): string {
  const normalized = `${title.toLowerCase().trim()}|${date}|${venue.toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}
```

(Archived path uses sha256 via `crypto.` prefix instead of imported `createHash`.)

### B.3 Cluster 3 — venue-less scrapers (md5, **2-param**, dash separator, .trim()) ← **S140 hit**

3 sites with identical bodies — and **this is the cluster that produced the S140 failure**:

`scripts/scrape-megaron.ts:28`, `scripts/scrape-benaki.ts:51`, `scripts/scrape-onassis.ts:41`:
```typescript
function generateEventId(title: string, startDate: string): string {
  const normalized = `${title.toLowerCase().trim()}-${startDate}`;
  return createHash('md5').update(normalized).digest('hex').substring(0, 16);
}
```

**No venue parameter.** Two events at *different* venues with the *same title and date* would collide to the same ID. Currently latent — none of these scrapers produce same-title-same-date events at multiple venues — but is a sibling fragility worth flagging.

### B.4 Cluster summary

| Cluster | Sites | Signature | Algorithm | Separator | Trim |
|---|---|---|---|---|---|
| 1 | email-ingestion | `(title, date, venue)` | sha256 | `-` (dash) | NO |
| 2 | scrape-all + 4 sibs | `(title, date, venue)` | md5 (sha256 in archive) | `\|` (pipe) | YES |
| 3 | megaron + benaki + onassis | `(title, startDate)` | md5 | `-` (dash) | YES |
| 4 (test) | normalize-dedup.test.ts | `(title, date, venue)` | sha256 | mirrors Cluster 1 | — |

**The 3-cluster dispersion means the contract is conceptually singular but physically replicated. Title edits hit any cluster; venue collisions hit only Cluster 3.** Vector A (Section E.1) requires updating all clusters together to be coherent — partial migration would leave unstable IDs in some scrapers and stable in others.

---

## C. ID consumer inventory (12 categories surfaced)

| # | Category | File:line | How id is used | Severity if id changes |
|---:|---|---|---|---|
| 1 | URL slug | `src/generators/event-page.ts:111` | `event.id.substring(0, 8)` becomes the first segment of the event URL slug | 🔴 SEO/citation: every URL changes prefix |
| 2 | Schema.org `@id` | `src/templates/page.ts:461` | `${BASE_URL}/events/${generateEventSlug(event)}/` — derives from URL via slug | 🔴 AI engines may de-cite previously-cited URLs |
| 3 | Sitemap entries | `src/sitemap/generate-sitemaps.ts:73-74` | `${BASE_URL}/events/${slug}/` (Greek), `${BASE_URL}/en/events/${slug}/` (English mirror) | 🔴 Mass URL changes trigger crawl-discovery storm |
| 4 | Image filename | `src/images/optimize-image.ts:31` | `/images/events/${eventId}.webp` (full ID, not prefix) | 🟡 Image files orphan unless rename/migration ships |
| 5 | localStorage save-event | `src/templates/action-bar.ts` (renderCardSaveButton + IIFE migration pattern) | Saved events keyed by `data-event-id`; localStorage stores the id | 🟡 Saved events orphan on user devices unless migration IIFE ships (S139 precedent) |
| 6 | Calendar `data-event-id` | `src/generators/event-page.ts:464` | `data-event-id="${event.id}"` on the EDP calendar button | 🟢 Re-rendered on next page load |
| 7 | DB primary key | `src/db/database.ts:77, 208, 261` | `events.id` PRIMARY KEY; `WHERE id = ?` for lookup | 🔴 Foreign-key cascade if FKs reference id (see #8, #9) |
| 8 | Override config FK | `src/utils/load-gate-rules.ts:133, 140, 180` | `event_id` field in override JSON; matches against current event ids | 🟡 Existing overrides become orphan if id changes |
| 9 | Enrichment queue FK | `src/enrichment/priority-queue-manager.ts:290, 302, 370, 389, 391, 395, 453` | `enrichment_queue.event_id` references `events.id` | 🟡 Queue entries orphan; would re-queue on next sync |
| 10 | Quality gate logs | `src/enrichment/quality-gates.ts:221, 1169` | Log entries keyed by `event.id`; analytics over time | 🟢 Old logs preserve old IDs, new logs use new — analytics question |
| 11 | Search index | `src/generators/search-index.ts:82` | `id: event.id` field in search-index JSON | 🟢 Regenerated on every build |
| 12 | Related-events / cross-references | `src/generators/event-page.ts:641, 653` | `slugMap.set(event.id, slug)`; `.filter(e => e.id !== event.id)` for related-events exclusion | 🟢 Regenerated on build |

### C.1 External dependency surface (cannot inventory from code)

- **Inbound backlinks** from external sites referencing agentathens.com event URLs. Visibility unknown — no tracking system identified.
- **Already-indexed Google/AI-engine citations** of event URLs.
- **User devices with cached saved-events** in localStorage (mitigated by IIFE migration if shipped).

These external surfaces multiply the cost of Vector A and are why a migration window with 301 redirects is required if Vector A is chosen.

---

## D. Dedup keep-decision logic — and the S140 trace

### D.1 Three dedup code paths exist, with different policies

| Path | File | Trigger | Keep-decision mechanism |
|---|---|---|---|
| remove-duplicates Pass 1 | `scripts/remove-duplicates.ts:262` | URL collision | SQL `ROW_NUMBER() OVER (PARTITION BY url ORDER BY ...)` |
| remove-duplicates Pass 7 | `scripts/remove-duplicates.ts:842` | Smart title match | JS `.sort((a,b) => …)` |
| merge-duplicates | `scripts/merge-duplicates.ts:125-172` | Pair processing | `scoreRichness()` from `src/quality/richness-scorer.ts`; tie-break by **newer `updated_at`** |
| duplicate-detector | `src/quality/duplicate-detector.ts:61-88` | Build-time detection | Canonical map keyed on event.id — **no winner-selection logic, just collision detection** |

**Important: `merge-duplicates.ts` already implements "prefer newer on tie" via updated_at.** Vector C's recommendation is conceptually consistent with this existing policy — it just applies the principle at a different code path (Pass 1 of remove-duplicates) and under a more specific trigger (URL collision + ID divergence indicating title edit).

### D.2 Pass 1 SQL keep-decision (the S140 path)

`scripts/remove-duplicates.ts:285-303` (verbatim — note the ORDER BY tiebreakers):

```sql
SELECT id,
  ROW_NUMBER() OVER (
    PARTITION BY url
    ORDER BY
      CASE source
        WHEN 'more.com' THEN 1
        WHEN 'viva.gr' THEN 2
        WHEN 'gazarte.gr' THEN 3
        ELSE 4
      END,
      LENGTH(title) DESC,
      LENGTH(COALESCE(description, '')) DESC,
      id
  ) as rn
FROM events
WHERE …
```

Tiebreaker order: source priority → **title length** → description length → id (stable last resort).

### D.3 Pass 7 smart-match keep-decision

`scripts/remove-duplicates.ts:842-870` (verbatim, the JS sort comparator):

```typescript
const sorted = group.events.sort((a, b) => {
  // Source priority
  const sourcePriority: Record<string, number> = {
    'more.com': 1,
    'viva.gr': 2,
    'gazarte.gr': 3,
  };
  const aPriority = sourcePriority[a.source] || 4;
  const bPriority = sourcePriority[b.source] || 4;
  if (aPriority !== bPriority) return aPriority - bPriority;

  // Description length (longer is better)
  if (a.desc_len !== b.desc_len) return b.desc_len - a.desc_len;

  // Title length (longer is more descriptive)
  return b.title.length - a.title.length;
});
```

Tiebreaker order: source priority → **description length** → title length.

**Sibling inconsistency surfaced:** Pass 1 prioritizes title-length THEN description-length; Pass 7 prioritizes description-length THEN title-length. The two passes could disagree on the same pair of rows in edge cases. Worth harmonizing as part of Vector C's implementation (Section H notes this).

### D.4 The S140 step-by-step

For Pavlopoulos `15e395128b7b285b` (old) and `b6ed04f8500023b9` (new, post re-scrape):

1. **Re-scrape** (`scripts/scrape-megaron.ts` post-Step-3-of-S140): listing-page title was `"Τεχνητή Νοημοσύνη και απονομή Δικαιοσύνης – Προκόπης Παυλόπουλος"`. `generateEventId` at `scripts/scrape-megaron.ts:28` (Cluster 3) hashed → ID `b6ed04f8500023b9`. INSERT (not UPDATE) because hash mismatch with existing row.
2. **DB state post-scrape:** two rows scheduled `2026-05-29T20:30:00`, both `source='megaron.gr'`, both `url='https://www.megaron.gr/event/mythoi-kai-alitheies-stin-...'`, types `concert` and `other`.
3. **`scripts/remove-duplicates.ts` Pass 1 fires** (line 262). SQL groups by URL → finds the duplicate.
4. **Keep-decision** (line 285-303 quoted above):
   - source priority: both `megaron.gr` not in {more.com, viva.gr, gazarte.gr} → both default 4. Tie.
   - **title length**: old row title `"Μύθοι και αλήθειες στην εποχή της Τεχνητής Νοημοσύνης – Τεχνητή Νοημοσύνη και απονομή της Δικαιοσύνης"` (~95 chars); new row title `"Τεχνητή Νοημοσύνη και απονομή Δικαιοσύνης – Προκόπης Παυλόπουλος"` (~63 chars). **Old wins on title length.** Tiebreaker resolves here; description length never reached.
   - (description length and id-as-stable-sort never consulted.)
5. **DELETE issued for new row** (`b6ed04f8500023b9`); old row kept.
6. **Net:** Pavlopoulos type stays `'concert'`. Re-scrape's correct typing is undone.

### D.5 What Vector C would change

Add a conditional rule before the existing tiebreaker chain: **when two rows in a Pass-1 URL collision have different `id`s (= title edit between scrapes), prefer the most-recently-scraped row by `scraped_at` timestamp.** Apply consistently to Pass 7's smart-match and (if reachable) `merge-duplicates.ts`.

For S140:
- Pass 1 sees ID divergence (`15e39512…` vs `b6ed04f8…`) on URL collision.
- New rule fires: prefer row with newer `scraped_at`. New row wins.
- Pavlopoulos retypes correctly automatically.

---

## E. Three fix vectors compared

### E.1 Vector A — `generateEventId` hashes on `url + start_date` instead of `title + start_date`

**Files modified (10 sites + tests):**
- All 10 generateEventId implementations (Section B clusters 1, 2, 3)
- Test fixture at `src/utils/__tests__/normalize-dedup.test.ts:45`
- Plus migration tooling

**Migration burden:**
- Every existing event row gets a new ID. **441 future events + ~12,000 historical** all change.
- URL alias table (`old_id_prefix → new_id_prefix`) keyed on first-8-char prefix.
- 301 redirects from old slugs to new slugs for ~6-12 months retention.
- Sitemap: 12K+ URL changes simultaneously triggers crawl-discovery storm. Coordinated with IndexNow + sitemap segmentation could mitigate but adds complexity.
- localStorage migration IIFE on first visit (read old id, lookup new id, rewrite). Pattern precedent: S139 IIFE at `src/templates/action-bar.ts` (idempotent migrations on every page load).
- Image files (~12K `*.webp` files): rename OR keep an old_id→new_id image-path mapping table.
- Schema.org `@id` continuity break — AI engines may de-cite previously-cited URLs. **Citation-killer-class risk.**

**Sibling-issue resolution:**
- Also fixes the Cluster 3 venue-collision fragility (URL is a unique identifier).
- Also unifies the 3-cluster dispersion: a centralized URL-based hash function would replace all 10 sites.

**Estimated effort:** Multi-session — 1 session for ID-generation switch + tests; 1 session for migration tooling (alias table + redirects + IIFE + image mapping); 1 session for staged rollout + monitoring. Total ~3 sessions, ~3 days. High-risk window during rollout.

### E.2 Vector B — `--prefer-newest` flag on `scripts/remove-duplicates.ts`

**Files modified:** 1 — `scripts/remove-duplicates.ts`. Add a flag (env var or CLI arg) flipping the tiebreaker to prefer the most-recently-scraped row.

**Migration burden:** Zero. Existing IDs stay stable; URLs, `@id`, sitemap, localStorage, image files all unchanged.

**Edge case:** A fresh empty row from a glitchy partial scrape would win over an older richer row. Mitigation: gate `--prefer-newest` on description-non-empty, OR add a confidence threshold.

**Sibling-issue resolution:** Doesn't address venue-collision fragility (Cluster 3 still title-based).

**Estimated effort:** 1 session, ~1-2 hours.

### E.3 Vector C — Smart dedup hybrid (RECOMMENDED)

**Files modified:** ~2 — `scripts/remove-duplicates.ts` + sympathy update to `scripts/merge-duplicates.ts` for consistency.

**New decision rule:** When two rows in a Pass-1 URL collision have different `id`s (= title divergence), prefer the row with newer `scraped_at` timestamp. Apply consistently across Pass 1, Pass 7, and merge-duplicates.

**Migration burden:** Zero (same as Vector B).

**Edge case handling:** Conditional on title-divergence — won't flip cases where two rows share title (where the older-richer rule is correct). Targeted at the S140 shape specifically.

**Sibling-issue resolution:** Doesn't address Cluster 3 venue-collision fragility (still title-based hash).

**Estimated effort:** 1 session, ~3-4 hours including test fixture + Pass 1/Pass 7 tiebreaker harmonization (Section D.3 inconsistency).

---

## F. Recommendation — Vector C, with Phase-2 escape valve

### F.1 Why Vector C

- **Solves S140 specifically** without touching the destabilizing-large-blast-radius ID-generation path.
- **Vector A's migration burden is high-risk** for a recurrence pattern that's happened *once*. Over-engineering at current evidence.
- **Vector B is too blunt** — would also flip cases where the older row IS correct (e.g., a typo correction in source that shouldn't discard real enrichment work). Vector C's title-divergence conditional is the precise discriminator.
- **Conceptually consistent with `merge-duplicates.ts`'s existing "prefer newer on tie" policy** — applies the same principle at remove-duplicates' code path.

### F.2 Phase 2 framing

Vector A remains the right *long-term* answer if title-edit recurrences accumulate (multiple sources doing this multiple times over months) OR if other ID-stability fragilities surface (cross-source URL drift, scraper bugs that re-write IDs, content-management migrations at sources that bulk-rename events). Document Vector A as the Phase-2 path, gated on observed recurrence rate.

**Concrete Phase-2 trigger:** if dedup pipeline catches ≥3 title-edit URL collisions in a 30-day window after Vector C ships, escalate to Vector A planning. This is the audit's recommended monitoring threshold.

### F.3 The Cluster 3 sibling fragility

Cluster 3 scrapers (megaron, benaki, onassis) using 2-param `(title, startDate)` are vulnerable to **two** failure modes: title-edit (S140) AND venue-collision (latent). Vector C addresses title-edit at the dedup layer; venue-collision remains latent.

**Recommend a separate small follow-up session:** bring the 3 venue-less scrapers into line with the 3-param convention. 3 file changes, no migration (changing the hash retroactively is itself Vector A in miniature — rejected for the same blast-radius reason). Better mitigation is to **add a venue-collision detection check at ingest** that flags duplicate IDs before INSERT. Cheap, defensive, doesn't require rewriting the hash. Out of scope for this audit; flagged as a follow-up.

---

## G. Open questions surfaced

1. **Should agentathens.com URLs encode something other than id-prefix for human-readability?** Current slug includes id-prefix + venue + title. The id-prefix is mostly opaque to users but is the canonical join key. Replacing with a UUID-style identifier would lose URL stability if title or venue changes; keeping the id-prefix is the current contract. Worth a future review when URL conventions are revisited.

2. **Are external backlinks tracked anywhere?** No tracking system identified in Phase 1. If Vector A is ever attempted, breakage to inbound links is invisible — search-engine reverse-index queries (`site:agentathens.com` for the old URL pattern over time) would be the only visibility. Worth flagging as a pre-Vector-A blocker: get backlink visibility before any URL-changing change.

3. **Image file linkage — automatic via id naming convention, or stored separately?** Phase 1 found `imageLocal?: string` documented as `/images/events/{id}.webp` at `src/types.ts:60` — convention-based. ID change orphans the file. A separate image-path table indexed by id would decouple storage from id, simplifying future Vector A. Defer.

4. **Should the override gate config (`load-gate-rules.ts`) reference events by URL instead of id**, given the migration question? Same logic — if Vector A ever ships, URL-keyed overrides would be more stable. Defer.

5. **Pass 1 vs Pass 7 tiebreaker order inconsistency** (Section D.3). Pass 1 is title-then-desc; Pass 7 is desc-then-title. Vector C's implementation should harmonize — pick one order and apply to both passes. Suggested: Pass 7's order (desc-then-title) since description length is a stronger quality signal than title length. Title can grow with marketing copy bloat; description correlates with enrichment effort.

---

## H. Fix-session sketch — Vector C implementation

> **Fix session — smart-dedup for title-edit + URL-match case** (~3-4 hours)
>
> 1. **Add a regression-test fixture named after S140 specifically** — e.g., `tests/fixtures/dedup-s140-title-edit.ts` (or `scripts/__tests__/dedup-s140-title-edit.test.ts` per the project's existing test layout). The fixture name itself carries institutional memory back to the original incident; when this recurs in 6 months and someone runs the test suite, the fixture name points to S140 in `mistakes.md` without requiring archaeology. The fixture reconstructs S140: two rows with same URL + same `start_date` + different titles + different `generateEventId` outputs (Pavlopoulos title-edit between scrapes). Assertion: after dedup, the row with newer `scraped_at` survives.
>
> 2. **Modify `scripts/remove-duplicates.ts:285-303` Pass 1 SQL** — prepend a tiebreaker `CASE WHEN <ID-divergence-detected> THEN scraped_at_desc ELSE 0 END` ahead of the existing source-priority tiebreaker. Or, restructure the keep-decision into a CTE that first detects title-divergence + URL match and short-circuits to "prefer newer scraped_at" before falling through to existing logic. Choose the cleaner of the two at implementation time.
>
> 3. **Modify `scripts/remove-duplicates.ts:842-870` Pass 7 smart-match** — apply the same conditional rule. While in there, harmonize the existing tiebreaker order with Pass 1 (Section D.3 inconsistency) — recommend desc-then-title for both since description length is a stronger quality signal than title length.
>
> 4. **Apply consistent rule to `scripts/merge-duplicates.ts:125-172`** — its existing "newer updated_at on tie" is conceptually adjacent; verify the new title-divergence rule plays nicely with `scoreRichness()`-based primary scoring. Likely no change needed in merge-duplicates itself if the policies don't conflict.
>
> 5. **Run dedup pipeline against current DB** with `--dry-run`; verify no unintended flips (the change is conditional on ID-divergence within URL-collision groups, so only re-scraped renamed-source events should be affected). Spot-check no events from the 5 manually-recovered S140 anchor list flip back.
>
> 6. **Document in `decisions.md`** that Vector C shipped (the routing entry from this session's housekeeping becomes the citation point); flip `docs/known-issues.md` "Dedup keep-decision favors older row even when newer row has correct type" entry from 🟡 Open → 🟢 Resolved with reference to the test fixture.

**Estimated effort:** 3-4 hours single session. Single-file primary change, sympathy update for harmonization, regression test, dry-run verification. No migration, no deploy coordination, no external dependencies.

---

## I. Bounded scope reminder

Files this audit modified: **0 source / 0 config / 0 templates / 0 scripts / 0 schema migrations.**

This audit produces a spec and routing decision. Implementation is the next session's work. Vector A's multi-session migration is explicitly NOT proposed for now — Phase-2 only.

---

*End of audit.*
