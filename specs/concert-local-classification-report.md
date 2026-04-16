# Concert Local Overshoot Classification Report

**Date:** 2026-04-15 (Session 85b)
**Scope:** 124 `concert_local` + 34 `theater_contemporary` EN_OVER_MATRIX_MAX entries
**Status:** Diagnostic only — no fixes applied

---

## Summary

| Bucket | Count | % of 124 |
|--------|-------|----------|
| Truly local (needs rewrite) | ~109 | 88% |
| Misclassified due to venue matching bugs | ~7 | 6% |
| Trim zone (10-33% over, minor edits) | 2 | 2% |
| Misclassified (institutional/major events at local venues) | ~6 | 5% |

**Key finding:** Reclassification reduces overshoots by only ~3 out of 217 total (1%). The problem is mathematical — moving a 500-word description from concert_local (max 120) to concert_major (max 200) still leaves it 150% over. **Batch rewrites are the primary fix path.**

---

## Overshoot Magnitude Distribution

| Range | Count | Visual |
|-------|-------|--------|
| 10-25% over | 0 | |
| 26-50% over | 9 | ████ |
| 51-100% over | 1 | █ |
| 101-200% over | 9 | ████ |
| 201-300% over | 62 | ████████████████████████████ |
| 301%+ over | 43 | ███████████████████ |

**85% of overshoots are 200%+ over** (3-4x the target). Average: 430 words against a 120-word max.

---

## Classification Bugs Found

### Bug 1: Case-sensitive venue matching

`classifyEvent()` uses `venue.includes(v)` which is case-sensitive. Two venue name patterns fail:

| DB venue_name | Expected match | Classification | Events |
|---------------|---------------|----------------|--------|
| `ΣΤΑΥΡΟΣ ΤΟΥ ΝΟΤΟΥ` | `Σταυρός του Νότου` in MAJOR list | Falls through to `concert_local` | 2 |

**Fix:** Use case-insensitive matching in `classifyEvent()`:
```typescript
const venueUpper = venue.toUpperCase();
if (MAJOR_CONCERT_VENUES.some(v => venueUpper.includes(v.toUpperCase()))) ...
```

### Bug 2: English venue name not in PREMIUM_VENUES

| DB venue_name | Should match | Classification | Events |
|---------------|-------------|----------------|--------|
| `Onassis Stegi` | `Στέγη Ιδρύματος Ωνάση` | Falls through to `theater_contemporary` | 5 |

**Fix:** Add `"Onassis Stegi"` and `"Onassis Ready"` to PREMIUM_VENUES.

### Bug 3: `dj_set` hardcoded to `concert_local`

```typescript
if (type === 'dj_set') return 'concert_local'; // Line 102 — no venue/price check
```

56 dj_set events are classified as `concert_local` unconditionally, even when at major/premium venues or with high prices. 15 of these are at venues (Bolivar, Bios Ρομάντσο, Universe, Cozmo, Astron) that would merit `concert_major`.

**Fix:** Apply the same venue/price check that `concert` gets:
```typescript
if (type === 'dj_set') {
  if (MAJOR_CONCERT_VENUES.some(v => venue.includes(v))) return 'concert_major';
  if (event.price_amount && event.price_amount >= 25) return 'concert_major';
  return 'concert_local';
}
```

---

## Venue Analysis

### Venues currently missing from MAJOR_CONCERT_VENUES

Venues with 3+ overshoots OR institutional significance:

| Venue | Overshoot count | Avg words | Rationale |
|-------|----------------|-----------|-----------|
| Πλατεία Νερού | 8 | 406 | Release Athens outdoor venue, international acts |
| Κύτταρο | 4 | 451 | Legendary Athens rock venue since 1971 |
| Piraeus Club Academy | 3 | 402 | Mid-size concert hall |
| Floyd | 5 (via other query) | 409 | Mid-size rock/metal venue |
| Ολύμπια (Δημοτικό Μουσικό Θέατρο) | 3 | 280 | Municipal theater, major classical events |
| Δημοτικό Θέατρο Λυκαβηττού | 2 | 439 | Lycabettus amphitheater |
| AN Club | 2 | 416 | Established rock/metal venue |
| Christmas Theater | 4 (theater) | — | Large capacity theater |
| Θέατρο Παλλάς | 1 | 403 | Major Athens theater |
| Ωδείο Αθηνών | 3 (mixed) | 528 | Athens Conservatory — classical music hub |

### Venues confirmed truly local (keep as concert_local)

| Venue | Overshoot count | Avg words | Nature |
|-------|----------------|-----------|--------|
| Cantina Social | 9 | 510 | Small bar |
| SMUT Athens | 4 | 403 | Small club |
| Astron | 4 | 527 | Underground club |
| Oddity | 3 | 443 | Small club |
| Skull Bar | 3 | 457 | Small bar |
| El Chapo | 2 | 514 | Small bar |
| 2ten | 2 | 419 | Small club |
| Myrtillo Cafe | 2 | 420 | Cafe |

### Borderline venues (judgment call)

| Venue | Overshoot count | Avg words | Notes |
|-------|----------------|-----------|-------|
| Parnassos Literary Society | 5 | 462 | Classical recitals — mid-tier but with institutional character |
| Bios Ρομάντσο | 5 | 448 | Established cultural space — larger than a club |
| Μουσείο Γουλανδρή | 3 | 418 | Museum with concert series |
| Bolivar | 3 | 446 | Beach club — seasonal, big events but casual |
| Universe | 3 | 408 | Club — some big electronic events |
| Ίδρυμα Μιχάλης Κακογιάννης | 3 | 413 | Cultural foundation |

---

## Institutional/National Names in concert_local

11 events with institutional markers but classified as concert_local:

| Title | Venue | Words | Likely correct tier |
|-------|-------|-------|-------------------|
| Εθνική Συμφωνική Ορχήστρα ΕΡΤ | Ολύμπια | 593 | concert_major (if venue added to MAJOR) |
| ΠΑΣΧΑΛΗΣ ΤΟΝΙΟΣ «ΑΞΙΟΣ ΛΟΓΟΣ» 83 χρόνια μετά | Parnassos | 577 | concert_major (if venue added) |
| ΣΩΚΡΑΤΗΣ ΣΙΝΟΠΟΥΛΟΣ QUARTET «Metamodal» | Concert #1 Baumstrasse | 571 | concert_local (small venue) |
| REVOLT 13 YEARS ANNIVERSARY with DMX Krew | TBA - ATHarea | 599 | concert_local (underground event) |
| Ρεσιτάλ Φλάουτου | Ωδείο Αθηνών | 559 | concert_major (if Ωδείο added to MAJOR) |
| GRAVE DIGGER 30 Years Anniversary | Gagarin 205 | 453 | concert_major (already matches Gagarin) |
| Jazz στο Μουσείο: Kontrafouris Quartet | Μουσείο Γουλανδρή | 462 | concert_major (if museum added) |
| Joep Beving LIMINAL Tour 2026 | Parnassos | 392 | concert_major (€27, threshold €25) |
| Δύο ρεσιτάλ πιάνου Nikolai Lugansky | Parnassos | 437 | concert_major (if venue added) |
| FM 40 Years of "Indiscreet" | Κύτταρο | 429 | concert_major (if Κύτταρο added to MAJOR) |
| Purple Night 10 YEAR ANNIVERSARY | SMUT Athens | 400 | concert_local (small club) |

---

## Theater Contemporary Overshoots (34 total)

### Classification issues found

| Issue | Events | Fix |
|-------|--------|-----|
| "Onassis Stegi" not matching PREMIUM_VENUES | 1 ("By Heart", 595w) | Add English name to PREMIUM list |
| Misclassified type (concerts/DJs typed as theater) | ~5 | Upstream categorizer issue |
| Theater at 0 `theater_ancient` classifications | All | ANCIENT_INDICATORS only match playwright names in title; Romeo & Juliet in Greek won't match "Shakespeare" |

### Magnitude distribution

| Range | Count |
|-------|-------|
| 10-50% over | 3 |
| 51-100% over | 5 |
| 101-200% over | 22 |
| 200%+ over | 4 |

Theater overshoots are less extreme than concert_local (65% are 101-200% over vs 85% at 200%+ for concerts). The theater_contemporary max is 180 words — most descriptions are 300-500 words.

### Venue spread

No single venue dominates — 28 unique venues across 34 overshoots. Christmas Theater (4) and ROES THEATER (3) have the most. The spread suggests the issue is systemic (all theater descriptions were written long) rather than venue-driven.

---

## Type Classification Errors (upstream)

Several events typed as `theater`/`performance` are actually concerts or DJ events:

| Title | Venue | Current Type | Likely Correct Type |
|-------|-------|-------------|-------------------|
| Rejuv pres. Solace pre-party: DBBD + Amor Satyr | Universe | performance | dj_set |
| DJ KOCO aka SHIMOKITA | Gazarte | performance | dj_set |
| ΓΙΑΝΝΗΣ ΧΑΡΟΥΛΗΣ | Σταυρός του Νότου | performance | concert |
| Flamecore | Temple | performance | concert |
| Jazz standards | Σκηνή BRECHT | performance | concert |

These are categorizer issues, not enrichment matrix issues.

---

## Recommendations

### 1. Fix venue matching bugs (low effort, correctness)

- Make `classifyEvent()` case-insensitive for venue matching
- Add `"Onassis Stegi"`, `"Onassis Ready"` to PREMIUM_VENUES
- Fix dj_set to check venue/price before defaulting to concert_local
- **Impact: ~7 events correctly reclassified, ~3 fewer overshoots**

### 2. Expand MAJOR_CONCERT_VENUES (medium effort, moderate impact)

Add: Πλατεία Νερού, Κύτταρο, Floyd, Piraeus Club Academy, Ολύμπια, AN Club, Ωδείο Αθηνών, Δημοτικό Θέατρο Λυκαβηττού

- **Impact: ~25 events move to concert_major, but descriptions still overshoot (150% instead of 300%)**
- Net overshoot reduction: ~0 (concert_major max is 200, descriptions average 430 words)

### 3. Whether artist-level signals are needed in classifyEvent()

**Not recommended at this time.** The 11 institutional-name events are interesting but:
- Most would be fixed by venue additions (Parnassos, Ωδείο, Ολύμπια)
- Artist-level classification adds complexity and maintenance burden
- The descriptions still need rewrites regardless of classification

### 4. Estimated post-reclassification overshoot count

| Stage | EN_OVER_MATRIX_MAX |
|-------|-------------------|
| Current | 217 |
| After venue matching fixes | ~214 |
| After MAJOR_CONCERT_VENUES expansion | ~214 |
| After batch rewrites to matrix targets | 0 |

**Reclassification is worth doing for correctness, but does not reduce the rewrite workload.**

### 5. Rewrite batch strategy

- **124 concert_local** descriptions need rewrites to 80-120 words
- **34 theater_contemporary** descriptions need rewrites to 120-180 words
- **~20 other categories** (concert_major, default, etc.) need rewrites to their respective targets
- Total: ~178 descriptions need rewrites
- Recommended batch size: 10-15 per enrichment session
- Estimated sessions: 12-18

### 6. Priority order

1. **First:** Fix the 3 venue matching bugs in `classifyEvent()` (one session, <30 min)
2. **Second:** Run batch rewrites for concert_local overshoots, starting with the worst offenders (300%+ over, 43 events)
3. **Third:** Theater_contemporary rewrites
4. **Last:** Expand MAJOR_CONCERT_VENUES (can be done alongside rewrites)

---

## Source Distribution (concert_local overshoots)

| Source | Count |
|--------|-------|
| athinorama.gr | 33 |
| more.com | 29 |
| residentadvisor | 27 |
| clubber.gr | 18 |
| ticketservices | 17 |

Overshoots are evenly distributed across sources — no single scraper is responsible.

---

## Data Files

- `/tmp/concert-local-overshoots.json` — full metadata for all 124 concert_local overshoots
- This report: `specs/concert-local-classification-report.md`
