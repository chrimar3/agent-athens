# Venue Count Reconciliation — 247 / 46 / 408 Diagnostic

**Date:** 2026-05-04
**Trigger:** Sprint 2 Component B-2 closeout (Session 109) flagged the gap as an open item.
**Method:** Read-only investigation of athens-venues.json + events.db + data/build-completeness.json. Single config edit was scoped as a possible outcome; this diagnostic concluded the choice is Strategist-level, so **no config edit was made — routing as Q-B8.**

---

## Three Numbers (and a fourth)

```bash
jq '.venues | length' config/athens-venues.json
# 408

jq '.place.byVenue | length' data/build-completeness.json
# 247

ls -d dist/venues/*/ | wc -l
# 46

sqlite3 data/events.db "SELECT COUNT(DISTINCT venue_name) FROM events WHERE start_date >= date('now') OR (type='exhibition' AND end_date >= date('now'));"
# 144  (future events + active exhibitions only)
```

| Number | Meaning |
|---|---|
| **408** | Total records in `config/athens-venues.json` (one row per registry entry, with `canonical_name + variations + neighborhood + website? + ticketing? + sameAs?`). Currently the ratchet denominator (`generate-site.ts` `getAllVenues().length`). |
| **247** | Distinct *normalized venue keys* across `pageableEvents` (= upcoming events + past events ≤45-day retention window). Computed via `normalizeVenueKey(event.venue.name)` in `buildCompletenessReport`. This is `place.byVenue.length` in the artifact. |
| **46** | Number of `dist/venues/{slug}/index.html` pages generated. Subset of `byVenue` constrained by `meetsMinimumThreshold()` (`venue-page.ts:48–53`): ≥2 upcoming events OR (address + neighborhood). |
| **144** | (Cross-check) DB venues with strictly future events or active exhibitions. Lower than `byVenue` because byVenue includes 45-day past retention. |

### DB partition breakdown (events.db)

```bash
sqlite3 data/events.db "SELECT (CASE WHEN start_date >= date('now') THEN 'future' WHEN type='exhibition' AND end_date >= date('now') THEN 'active-exhibition' ELSE 'past' END) AS bucket, COUNT(DISTINCT venue_name) AS distinct_venues, COUNT(*) AS event_count FROM events GROUP BY bucket;"
```
```
active-exhibition | 3 distinct | 3 events
future            | 143 distinct | 452 events
past              | 378 distinct | 12085 events
```
- All-time distinct venues in DB: **418**
- Future + active-exhibition distinct: **144** (slight overlap accounts for 143+3 → 144)
- byVenue (247) sits between these, capturing pageableEvents = upcoming + past-active ≤45d

So the gap "247 vs 144" is the 45-day retention window contribution: ~103 venues had recent past events but no upcoming ones. They still get event pages (and so contribute to byVenue) but won't drive future user activity once their retention window closes.

---

## Normalization Sanity (and a real data hygiene finding)

### byVenue first 30 keys (sample)

```
104, 2" πολλαπλοι χωροι, 2ten, 41 street cafe, altera pars, an club,
arch club, arroyo theater, art 63, asteria domus glyfada, astron,
auditorium, aux club, b side athens, b-side, baumstrasse, bios ρομαντσο,
bless me father, bolivar, boo!, botoxe, burger disco club, caja de musica,
calderone art space, cantina social, cartel τεχνοχωρος, christmas theater,
circus entertainment hub, concert #1 baumstrasse, coronet theater
```

Two samples worth flagging:
- `2" πολλαπλοι χωροι` — stray quote + Greek "Multiple Locations" canonicalized. Pure data-entry noise.
- `b side athens` and `b-side` — likely the same venue split by hyphen-handling in `normalizeVenueKey`. Worth a separate diagnostic on the canonicalizer's hyphen rules; not in scope here.

### athens-venues.json: 408 records → 349 distinct canonical_names

```bash
jq '.venues | map(.canonical_name) | length' config/athens-venues.json     # 408
jq '.venues | map(.canonical_name) | unique | length' config/athens-venues.json  # 349
```

**59 duplicate canonical_names** in the registry. Dump:
- 3 entries each: **Ακροπόλ**, **Θέατρο Μπέλλος**
- 2 entries each: 56 other venues — Arroyo, Astron, Aux Club, Bolivar, Burger Disco Club, Calderone Art Space, Cantina Social, Daddy's All Day Bar, Don't be a Dick, IT Athens, Olvio, Paraga, Red Jasper Cabaret Theatre, Smut, Studio Κυψέλης, Studio Μαυρομιχάλη, VOX, Wild Poppies, plus 38 Greek-named venues.

Each duplicate could be:
- (i) **Same name, different addresses** — legitimate distinct venues (e.g., a chain with branches). CLAUDE.md tier-1 rule "Same venue name, different cities — Always verify addresses" suggests this is anticipated. These need separate sameAs (different Wikidata entities).
- (ii) **Pure data-entry duplicates** — same venue accidentally listed twice. These should be deduped in athens-venues.json regardless of ratchet decision.

Distinguishing (i) from (ii) requires inspecting each pair's `address`/`neighborhood`. Out of scope for this diagnostic. Flagged as a separate cleanup task.

### Registry-reachability of byVenue keys

Computed via inline Bun script:
```
athens-venues.json records:                        408
Distinct canonical_names:                          349
Distinct normalized keys (canonical + variations): 789

byVenue total entries (active normalized):         247
byVenue keys reachable via registry:               244
byVenue keys NOT reachable via registry:           3
Distinct canonical_names with active events:       251
Records with sameAs populated:                     0
```

Findings:
- **244 of 247 byVenue keys are reachable** via the registry (canonical_name OR a variation normalizes to that key). The other 3 are: `2" πολλαπλοι χωροι`, `venue`, `πολλαπλοι χωροι` — all pure data hygiene noise that no Editorial sameAs work could ever address.
- **251 distinct canonical_names have active events**, slightly higher than 244 byVenue keys that reach the registry. The asymmetry: some byVenue keys map to MULTIPLE canonical_name records (the 59 duplicate canonical_names produce key collisions where the same normalized key reaches 2+ records).
- **789 distinct normalized keys** in the registry (counting canonical + all variations) — much larger than 349 canonical_names because variations multiply the addressable surface. Most variations are language/script variants of the same underlying entity.

### Implications for the canonicalizer

`normalizeVenueKey` (NFD + diacritic strip + lowercase + whitespace collapse) does NOT guarantee 1-to-1 mapping. It collapses what it should (Greek/Latin script variants) and also occasionally collapses what it shouldn't (separate venues sharing a generic name). The current behavior is correct for venue-registry lookup (where false-positive matches still resolve to one record per name); it's NOT optimal for unique-active-venue counting (where collisions undercount).

Not actionable here; flagged for the venue-canonicalizer audit if/when one happens.

---

## Denominator Decision — routing as Q-B8

Strategist Q-B1 lock 2026-05-03 said: "INFO universal + WARN ratchet at 50% venue coverage." The current implementation reads "venue coverage" as `(records with sameAs) / (total records) = X / 408`. Four denominator candidates surfaced from this diagnostic, each with different semantics:

| Candidate | Value | Editorial unit | Includes | Excludes | "100% coverage" means |
|---|---|---|---|---|---|
| **(a) 408 records** (current) | 408 | per-record | All registry records (incl. 59 dup names + 161 inactive) | DB-only venues (10) | All 408 records have sameAs (incl. dup canonicals each get separate sameAs) |
| **(b) 247 byVenue keys** | 247 | per-normalized-active-key | All active venues (incl. 3 noise keys) | Inactive registry records | Impossible to reach (3 noise keys can't have sameAs) |
| **(c) 244 reachable byVenue** | 244 | per-normalized-active-reachable-key | Active venues addressable via registry | Inactive records, noise keys | All visible-to-users venues have sameAs |
| **(d) 251 active canonical_names** | 251 | per-canonical-name-active | Active venues at canonical_name level (one Editorial unit per duplicate) | Inactive canonical_names | All active canonical_names have sameAs (duplicates count once) |

### Cohesion arguments

- **(a) 408 (current):** Aligns with how Editorial actually works (open athens-venues.json, edit a record). But threshold at 50% means populating sameAs for 161 inactive venues (no user-visible benefit) before ratchet trips. Wasted effort relative to user impact.
- **(b) 247:** Aligns with the visible artifact (`byVenue` is what stakeholders see). But threshold can never be reached because 3 noise keys block 100%. Could pre-filter noise but that hides a real data quality signal.
- **(c) 244:** The "user-aligned, addressable, achievable" choice. Threshold at 50% means populating ~122 venues, all of which users currently see. Trade-off: requires a build-time computation of registry-reachable active set (small change to ratchet block in `generate-site.ts`). 100% IS achievable.
- **(d) 251:** Aligns with Editorial unit (one canonical_name = one decision). But duplicate canonical_names introduce ambiguity — does "Akropol×3" count as 1 or 3 toward coverage? If 1, Editorial gets credit for adding sameAs to one of the three (but the artifact's per-record sameAs status would still show 2/3 missing). If 3, this is just (a) renamed.

### Why this is Q-B8 (not a unilateral choice)

- The choice changes WHEN the ratchet trips by ~40% (244 vs 408 for the same Editorial work).
- The choice signals what "venue coverage" MEANS to stakeholders reading the artifact (registry hygiene? user-facing identity coverage? Editorial-task progress?).
- The choice interacts with downstream Tier-N work — if Strategist plans a Tier 1 sub-allowlist, the denominator should align (e.g., "Tier 1 coverage" = `(Tier 1 with sameAs) / (Tier 1 size)`).
- The 59 duplicate canonical_names + 3 noise keys are a separate data hygiene question that overlaps but doesn't reduce to the denominator question. Strategist may want to answer both together.

### Recommendation (deferred to Strategist)

If Strategist picks one of (a/b/c/d) without introducing Tier-N machinery, **(c) 244** is the most defensible:
- Aligns with what users see (active venues = byVenue domain).
- 100% is reachable (excludes the 3 unaddressable noise keys).
- Denominator is dynamic — recomputes per build as the events corpus evolves.
- Implementation cost is small (~10 lines in `generate-site.ts` ratchet block; new helper `getActiveReachableVenueKeys()` could land in `venue-registry.ts`).

If Strategist wants to introduce Tier-N (e.g., Tier 1 = curated allowlist of ~10–20 high-priority venues), the ratchet schema needs extension:
```json
{
  "warnAt": 0.5,
  "denominator": "tier_1_active" | "active_reachable" | "all_records"
}
```
This is the (c) path-of-evolution, with denominator selectable per ratchet rule.

---

## What this diagnostic is NOT

- Not a venue-registry cleanup (59 duplicate canonical_names need investigation case-by-case to distinguish (i) legitimate distinct venues vs (ii) data-entry duplicates).
- Not a canonicalizer audit (`b side athens` vs `b-side` likely-same; out of scope).
- Not a 45-day retention-window review (drives ~103 of byVenue's 247; its size affects denominator weight).
- Not a Tier-N system design (Strategist territory).

Each of these is a separate followup diagnostic if/when prioritized.

---

## Hand-off to Strategist (Q-B8 candidate)

**Question:** What is the canonical denominator for `place.ratchet.venueSameAs.coverage` in `data/build-completeness.json`?

**Options on the table** (with values + cohesion arguments above):
- (a) 408 = total registry records (current — but includes 161 inactive + 59 duplicate canonical_names)
- (b) 247 = byVenue distinct keys (matches artifact — but 100% unreachable due to 3 noise keys)
- (c) 244 = byVenue reachable via registry (Recommended fallback — user-aligned, achievable, matches Editorial-addressable surface)
- (d) 251 = active canonical_names (per-canonical-name unit — but duplicate-canonical handling unclear)
- (e) Tier-N curated allowlist — requires `denominator` field in ratchet schema

**Bonus question (orthogonal):** Should the 59 duplicate canonical_names in athens-venues.json be deduped or kept (with case-by-case verification of "same name different city" legitimacy)?

**Evidence file:** this spec.

**Effect of NOT answering:** ratchet stays at coverage=0/408 with currentSeverity="info" until Editorial Tier 1 brief lands sameAs values. At ≥204 records with sameAs (50% of 408), severity flips to WARN. Acceptable as default behavior — no urgency to answer Q-B8 unless Strategist wants ratchet semantics changed before that threshold approaches.

---

## Done when

- [x] Three sections (Three Numbers, Normalization Sanity, Denominator Decision) populated.
- [x] No config edit applied (Q-B8 routed instead).
- [x] Spec file at `specs/venue-count-reconciliation.md`.
