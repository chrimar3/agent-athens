# Session Summary — 31 March 2026

## What We Did

### 1. English-Only Enrichment Policy
- Removed Greek description generation from the pipeline
- **`scripts/generate-enrichment-brief.ts`** — no longer emits Greek word targets or Greek description instructions
- **`scripts/save-batch.ts`** — no longer reads `.gr.md` files, validates Greek, or writes to `full_description_gr`
- Greek validation code and matrix fields kept dormant for future Greek rollout
- Existing Greek descriptions in DB are preserved

### 2. Added `--type` Filter to Brief Generator
- `generate-enrichment-brief.ts` now accepts `--type=theater` (or any event type)
- Bypasses the round-robin diversity algorithm to generate single-type batches
- Usage: `bun run scripts/generate-enrichment-brief.ts --count=10 --type=theater`

### 3. Enriched 10 Theater Events (Batch 4)
- Generated brief and ran enrichment subagent
- All 10 saved with average gate score 85/100
- **Caveat:** 2 of the 10 (Xarchakos, Paspala) were misclassified as theater — they're concerts. Descriptions were written with theater framing. Both flagged for re-enrichment (`needs_enrichment = 1`).

### 4. Discovered Event Type Misclassification Problem
Audited all `theater`-typed events and found **13 misclassified as theater** that are actually concerts, plus 2 edge cases:

| Event | Actual Type | Signal |
|-------|-------------|--------|
| Ergon Ensemble | concert | URL: `/tickets/music/` |
| Ρεμπούτσικα-Δαβαράκης | concert | Famous Greek musicians |
| Ξαρχάκος 5 Λαϊκές Μορφές | concert | Famous Greek composer |
| Πασπαλά "Elly loves jazz" | concert | Jazz vocalist, URL: `/tickets/music/` |
| This is Michael (MJ tribute) | concert | URL: `/tickets/music/` |
| ΠΥΞ ΛΑΞ | concert | Greek rock band, URL: `/tickets/music/` |
| CHRIS ISAAK | concert | URL: `/tickets/music/` |
| GODSMACK | concert | URL: `/tickets/music/` |
| Κονσέρτο ενός παράδοξου κόσμου | concert | URL: `/music/gig/`, title = "Concerto" |
| Nu Balkan | concert | URL: `/music/gig/` |
| Yiannis Kassetas | concert | URL: `/music/gig/` |
| Χρύσπα | concert | URL: `/music/gig/` |
| Ελένη & Σουζάνα Βουγιουκλή | concert | URL: `/music/gig/` |
| Professor Brian Cox | show | Science lecture |
| Ραψωδία Ω / Ιλιάδος Ηχώ | performance | Iliad recital at Megaron |

**All 15 fixed in DB.** Xarchakos & Paspala flagged for re-enrichment.

---

## The Decision: How Should the Categorizer Work?

### Current System (3-pass)

```
Pass 1: Venue Lock (HIGH confidence)
  → If venue is in venue_type_map → return that type immediately
  → e.g., "Θέατρο Παλλάς" → theater (ALWAYS)

Pass 2: Keywords (MEDIUM confidence)
  → Scan title/description for type-indicating words
  → e.g., "συναυλία" → concert, "παράσταση" → theater

Pass 3: Source Hints (MEDIUM confidence)
  → e.g., clubber.gr → dj_set

Fallback: Keep scraper's type, or default to concert
```

### Problem

**Pass 1 is too aggressive.** Venues like Θέατρο Παλλάς, Θέατρο Ολύμπια, and Δημοτικό Θέατρο Λυκαβηττού are locked to `theater`, but they regularly host concerts. Pass 1 returns immediately, so Pass 2 keywords never run.

**URL path signal is completely unused.** The strongest classification signal available — the source website's own categorization — is never checked:
- more.com: `/tickets/music/` vs `/tickets/theater/`
- athinorama: `/music/gig/` vs `/theatre/performance/`
- viva.gr: `/tickets/music/` vs `/tickets/theater/`

### Proposed Fix: 4-pass system

```
Pass 0 (NEW): URL Path (HIGHEST confidence)
  → Parse source URL for explicit category signals
  → e.g., more.com URL contains "/tickets/music/" → concert
  → This is the source's own editorial decision — strongest signal

Pass 1: Venue Lock (HIGH confidence) — BUT with fewer venues
  → Move multi-use "theater" venues to mixed_venues list
  → Only lock venues that truly host ONE type (e.g., Half Note → concert, Astron → dj_set)

Pass 2: Keywords (MEDIUM confidence) — unchanged
Pass 3: Source Hints (MEDIUM confidence) — unchanged
Fallback: unchanged
```

### Venues to Move from `venue_type_map` → `mixed_venues`

These venues host both concerts and theater — they should NOT be venue-locked:

| Venue | Why it's mixed |
|-------|---------------|
| Θέατρο Παλλάς | Xarchakos, Remboutsika concerts |
| Θέατρο Ολύμπια | Ergon Ensemble, Paspala concerts |
| Δημοτικό Θέατρο Λυκαβηττού | PYX LAX, Chris Isaak, Godsmack |
| Δημοτικό Θέατρο Πειραιά | Hosts concerts too |
| Theatre Of The No | Athinorama lists music gigs there |
| Θέατρο ΕΛΕΡ / ΕΛΕΡ | Athinorama lists music there |
| Καφεθέατρο | Athinorama lists music there |

### Questions to Consider

1. **Should URL path always override venue lock?** Or should venue lock still win for single-type venues like Half Note, Astron?
   - Proposed: URL path is Pass 0 (runs first), venue lock is Pass 1 (only for remaining single-type venues)

2. **What about venues we haven't caught yet?** Moving 7 venues to `mixed_venues` fixes the known cases. Should we be more aggressive and move ALL "Θέατρο X" venues to mixed, since any theater venue could host a concert?

3. **Should the URL pass apply to all sources?** Or only sources where we've verified the URL structure is reliable (more.com, athinorama, viva.gr)?

### Files That Would Change

| File | Change |
|------|--------|
| `src/categorizer/categorize-event.ts` | Add `url` to `EventInput`, add `categorizeByUrl()` pass |
| `config/venue-categories.json` | Move 7 venues from `venue_type_map` to `mixed_venues` |
| `config/url-category-patterns.json` (NEW) | URL path → type mapping rules |
| `scripts/scrape-all.ts` | Pass `url` to categorizer at save time |
| `scripts/recategorize-events.ts` | Pass `url` from DB when recategorizing |
