# Dedup HOLD — pairs requiring human review (dedup arc, 2026-07-05)

These pairs were classified during the Phase-1 population review
(`specs/dedup-diagnostic.md`) as *probably* the same event but ambiguous
enough that auto-merging risks a false merge. **The matcher deliberately does
not match them** — per the arc's decision rails, whether they merge is a
human call, not the executor's.

## Festival umbrella vs headliner listing (3 pairs, Πλατεία Νερού)

more.com lists the festival day ("RELEASE ATHENS 2026"); athinorama lists the
headliner. Same event-day, but arguably different editorial objects (the
umbrella row carries full-lineup/day info; the headliner row is
artist-specific). Merging loses one of the two framings; policy should decide
umbrella-vs-headliner precedence for ALL festivals, not case-by-case.

- `57b1c849944665ae` "RELEASE ATHENS 2026" (more.com) vs `a5b445da616d001e` "Three Days Grace" (athinorama.gr) — 2026-06-28
- `8618ee2c02c0ffb4` "RELEASE ATHENS 2026" (more.com) vs `2611c6ccfcca1a41` "Moby" (athinorama.gr) — 2026-07-01
- `5b2500c666449647` "RELEASE ATHENS 2026" (more.com) vs `6b2b489d440998f3` "Παύλος Παυλίδης" (athinorama.gr) — 2026-07-05

(IDs re-checked against DB at write time; the 07-10 block's "Release Athens
2026 / Helloween…" ↔ "Helloween" pair DID auto-merge — the detailed day
listing names the artist, so it clears the matcher's bar.)

## Acronym expansion (1 pair, Μέγαρο 2026-07-03)

- `c9ecbc0c…` "KOA - Γκαλά Όπερας" (athinorama.gr) vs `0b42db1e…` "Γκαλά όπερας με την Κρατική Ορχήστρα Αθηνών" (megaron.gr)
- Almost certainly the same gala (KOA = Κρατική Ορχήστρα Αθηνών) but
  bridging it requires an acronym-expansion table — out of scope, and token
  overlap sits at 0.67 < 0.70.

## Paraphrase (1 pair, Λυκαβηττός 2026-07-12)

- `d2ed2914…` "Η ΚΑΣΕΤΑ ΤΟΥ ΜΕΛΩΔΙΑ 99.2 για τον ΓΙΑΝΝΗ ΣΠΑΝΟ" (ticketservices) vs `f9cf7629…` "Αφιέρωμα στον Γιάννη Σπανό" (athinorama.gr)
- Same tribute concert described two ways; only the honoree's name is shared.

## Documented accepted misses (below the significance bar — no HOLD action,
## listed for completeness)

- "Mayans with ANNA I Thu July 9" vs "Anna" (Bolivar 2026-07-09) — 4-char
  artist name sits below the 5-char single-token bar; lowering it is a
  false-merge trap.
- "Mayans with Âme Live I Thu Aug 27" vs "Âme" (Bolivar 2026-08-27) — 3-char
  artist name, same bar.
- "Αλέξανδρος Χριστόπουλος" vs "Full Moon: Alexandros Christopoulos" (Island
  2026-08-28) — Greek vs transliterated Latin; cross-script matching deferred
  (transliterateGreekId could bridge it in a future session).

## Review protocol

For each pair a human confirms → run a manual mark:
`UPDATE events SET merged_into='<survivor>', merged_at=datetime('now') WHERE id='<loser>';`
plus an audit INSERT into `dedup_merges` (see scripts/mark-duplicates.ts for
the exact columns) — or extend the matcher (acronym table, cross-script
fallback) and rerun `bun run scripts/mark-duplicates.ts`.
