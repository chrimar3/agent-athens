# Dedup Diagnostic — Population Analysis (Phase 1 of dedup arc)

**Date:** 2026-07-05 · **Session:** autonomous dedup arc · **Status:** complete, gate passed

## Method

Blocked all eligible events — same eligibility as `scripts/merge-duplicates.ts`
(`location_status` visible-or-null, `dedup_protected=0`, upcoming + 7-day lookback,
exhibition end_date COALESCE) — by `(canonicalizeVenue(venue_name), start_date[0:10])`.
Exhibitions (7) excluded from date blocking per end_date semantics. All 66 multi-event
blocks manually reviewed (brief required ≥20).

## Counts

| Metric | Value |
|---|---|
| Eligible events | 545 |
| Blocks | 453 |
| Multi-event blocks | 66 |
| Events in multi-event blocks | 151 |
| Blocks containing true duplicates | ~27 (41% of multi-blocks) |
| True duplicate relations (loser→survivor edges) | ~30 |
| Estimated duplicate rate | ~5.5% of eligible events are redundant listings |

Self-gate (≥5 true duplicates required): **PASSED** — ~30 found.

## Classification of the 66 blocks

**True duplicates (~27 blocks).** Dominant shape: the same club night / concert listed
by 2-4 sources with different title conventions — residentadvisor appends date tails
("Rivo I Sat Aug 8"), clubber.gr prefixes promoters ("Bolivar & Blend pres. …"),
more.com appends the venue ("Valeron at Island Athens Riviera"), athinorama lists the
bare headliner ("Monolink"). The fixture block (Island Athens Riviera 2026-07-05, 4
sources) is the canonical example, incl. the MONILINK edit-distance-1 typo.

**Legitimate co-located events (~36 blocks).** Nightly repertory runs (3 different
plays per night at Λοσάντζελε ×6 dates, Λυκαβηττός ×6, Άλσος ×5), festival lineups
(GNO Percussion Festival at ΚΠΙΣΝ — distinct concerts same day), multi-stage venues
(Σταυρός του Νότου, Gazarte, Ωδείο). These must never merge.

**Ambiguous → HOLD (~5 blocks).** Festival umbrella vs headliner listing
("RELEASE ATHENS 2026" vs "Moby"/"Three Days Grace"/"Παύλος Παυλίδης" at Πλατεία
Νερού ×3 dates); acronym expansion ("KOA - Γκαλά Όπερας" vs "Γκαλά όπερας με την
Κρατική Ορχήστρα Αθηνών"); paraphrase ("Η ΚΑΣΕΤΑ ΤΟΥ ΜΕΛΩΔΙΑ 99.2 για τον ΓΙΑΝΝΗ
ΣΠΑΝΟ" vs "Αφιέρωμα στον Γιάννη Σπανό").

## Why the current 4-layer matcher misses them (Phase 0 findings)

1. **Layer 4 shadowed.** `artist_extraction` (added 2026-07-02 for the Monolink case)
   runs with `--exclude-layers artist_extraction` in `daily-automated.sh` — detected,
   logged, never executed.
2. **Greek accent asymmetry** (largest class, 8 blocks): `extractSignificantTokens`
   strips only *Latin* diacritics; `canonicalizeTitle` folds neither. ALL-CAPS Greek
   (unaccented) vs mixed-case Greek (accented) never matches: "ΘΕΟΦΙΛΟΣ Sold" vs
   "Θεόφιλος Sold", "Ο ΠΙΝΑΚΑΣ" vs "Ο πίνακας", "ΑΓΡΙΟΣ ΣΠΟΡΟΣ 2ος χρόνος" vs
   "Άγριος σπόρος", "ΕΝΑΣ ΥΠΗΡΕΤΗΣ , ΔΥΟ ΑΦΕΝΤΙΚΑ" vs "Ένας υπηρέτης, δύο αφεντικά",
   Σοπέν, Κοτονιάς, Μάρτυρας κατηγορίας. Same class as the S182 location-verification
   accent asymmetry — one shared fold primitive fixes both.
3. **Missing lineup delimiters:** literal `|` (the regex's pipes are alternation),
   `pres./pres`, `with`, residentadvisor's ` I ` separator, spaced dashes. "MONILINK |
   NICK JOJO | MAGDA KAY" yields no segments; "…pres. Meduza + Dino Mfu" hides
   "meduza" inside a compound segment.
4. **Venue-name-in-title:** "Monolink **at Island Athens Riviera**" — containment
   fails the 25% length-ratio floor (8 < 8.25 chars) because the venue suffix pads the
   long title. Same for Valeron.
5. **No edit-distance-1 tolerance:** "monilink" ≠ "monolink" in every layer.
6. **Pairwise, not transitive:** the `matched` set caps a 4-duplicate block at 2
   disjoint pairs per run; the brief's fixture must collapse 4 → 1 group.

## Known limitations (documented, out of scope for this arc)

- **Cross-date duplicates** invisible to (venue, date) blocking — e.g. "Sunset
  Frequencies" snfcc 07-08 vs athinorama 07-09 (date-drift class, mistakes.md:973).
- **Cross-venue duplicates** where config lacks the alias — GNO Percussion Festival
  events listed under both "ΚΠΙΣΝ" (ticketservices, English) and "Εθνική Λυρική
  Σκηνή" (athinorama, Greek): same building, different canonical venues.
- **Cross-script duplicates** — "Αλέξανδρος Χριστόπουλος" vs "Full Moon: Alexandros
  Christopoulos" (Greek vs transliterated Latin). `transliterateGreekId` exists and
  would bridge this; deferred to keep this arc's false-merge risk at zero.
- **Sub-5-char artist names** ("Anna", "Rivo" pre-date-tail-fix, "Âme") sit below the
  matcher's significance bar; loosening it is a false-merge trap. Rivo is recovered
  via date-tail stripping; Anna and Âme documented as accepted misses → HOLD.
