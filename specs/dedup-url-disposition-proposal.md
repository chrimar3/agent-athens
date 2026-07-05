# Dedup URL Disposition Proposal — for GEO Strategist ruling

**Date:** 2026-07-05 · **From:** dedup arc executor · **Decision owner:** GEO Strategist (NOT executor)

## Context

The retroactive dedup pass marked **27 events** as merge losers (`merged_into`
= survivor id, migration 013). Nothing was deleted; nothing reads
`merged_into` at emission time yet, so **all 27 loser pages still build and
serve** — verified against `dist/` post-merge. Each loser is a cross-source
re-listing of an event whose survivor page carries the merged best-of fields.
Audit trail: `dedup_merges` rows dated 2026-07-05 with `loser_snapshot`.

## Loser → survivor mapping

| Loser URL (still live) | Loser listing | Survivor URL |
|---|---|---|
| `/events/2492bc46-bolivar-themba` | Themba (athinorama.gr, 2026-07-02) | `/events/4c1b7f88-bolivar-mayans-with-themba-i-thu-july-2` |
| `/events/3290e524-gustav-athens-` | Θοδωρής Κοτονιάς - Ιφιγένεια Ιωάννου (athinorama.gr, 2026-07-03) | `/events/378ae10c-gustav-athens-` |
| `/events/74a7baa7-bolivar-bolivar-blend-pres-innellea-nick-devon-sioma` | Bolivar & Blend pres. Innellea + Nick Devon + Sioma (residentadvisor, 2026-07-03) | `/events/94f96c58-bolivar-innellea` |
| `/events/93360e45--` | Τα ημερολόγια του Φρεντερίκ Σοπέν (athinorama.gr, 2026-07-04) | `/events/72dfcb31--` |
| `/events/14520e59-island-athens-riviera-jafari-monolink-nick-jojo-magda-kay` | Jafari: Monolink + Nick Jojo + Magda Kay (clubber.gr, 2026-07-05) | `/events/ada150e1-island-athens-riviera-monolink-at-island-athens-riviera` |
| `/events/118fc4cd-island-athens-riviera-monolink` | Monolink (athinorama.gr, 2026-07-05) | `/events/ada150e1-island-athens-riviera-monolink-at-island-athens-riviera` |
| `/events/73823764-island-athens-riviera-monilink-nick-jojo-magda-kay` | MONILINK  ( NICK JOJO ,  MAGDA KAY) | `NO PAGE (hard-stop)` |
| `/events/b8cd839d--helloween` | Helloween (athinorama.gr, 2026-07-10) | `/events/b51062d0--release-athens-2026-helloween-saxon-more` |
| `/events/72992ea1-bolivar-meduza` | Meduza (athinorama.gr, 2026-07-11) | `/events/5a1425bc-bolivar-bolivar-minotaur-minotaur-pres-meduza-dino-mfu` |
| `/events/5bde33b0-island-athens-riviera-am-233-m-233` | Am&#233;m&#233; (athinorama.gr, 2026-07-12) | `/events/4189edbb-island-athens-riviera-jafari-ameme-agent-greg-nastazia` |
| `/events/3c1e1461-bolivar-mayans-nick-warren-steph-powered-by-blend` | Mayans: Nick Warren + Steph // powered by Blend (clubber.gr, 2026-07-16) | `/events/a9261a3b-bolivar-mayans-with-nick-warren-i-thu-july-16` |
| `/events/79f72ed3-bolivar-bolivar-blend-pres-maceo-plex-marcel-dettmann-manolaco` | Bolivar & Blend pres. Maceo Plex + Marcel Dettmann + Manolaco (clubber.gr, 2026-07-18) | `/events/a28aaf8d-bolivar-maceo-plex-i-marcel-dettmann-i-sat-july-18` |
| `/events/e6542569-island-athens-riviera-moojo` | Moojo (athinorama.gr, 2026-07-19) | `/events/709a0007-island-athens-riviera-jafari-moojo-cj-jeff-chris-f` |
| `/events/d5dc5859-bolivar-mayans-red-axes-steph-b2b-rezo-powered-by-minotaur-minotaur` | Mayans: Red Axes + Steph b2b Rezo // powered by Minotaur – Minotaur (clubber.gr, 2026-07-23) | `/events/4b0ebf62-bolivar-mayans-with-red-axes-i-thu-july-23` |
| `/events/3e770fb1-bolivar-bolivar-blend-seds-pres-kas-st-anfisa-letyago-steph` | Bolivar & Blend & Seds pres. KAS:ST + Anfisa Letyago + Steph (clubber.gr, 2026-07-24) | `/events/ed728142-bolivar-kas-st-i-anfisa-letyago-i-fri-july-24` |
| `/events/2a250af6-island-athens-riviera-notre-dame` | NOTRE DAME  (residentadvisor, 2026-07-26) | `NO PAGE (hard-stop)` |
| `/events/7e1ad1a2-bolivar-mayans-max-styler-steph-b2b-rezo-powered-by-minotaur-minotau` | Mayans: Max Styler + Steph b2b Rezo // powered by Minotaur – Minotaur (clubber.gr, 2026-07-30) | `/events/b489d3c6-bolivar-mayans-with-max-styler-i-thu-30-july` |
| `/events/58bccff9-bolivar-bolivar-blend-pres-deborah-de-luca-deborah-de-luca-manolaco-` | Bolivar & Blend pres. Deborah De Luca: Deborah De Luca + Manolaco + Steph (clubber.gr, 2026-07-31) | `/events/35919dfb-bolivar-deborah-de-luca-i-fri-july-31` |
| `/events/11a62152-bolivar-joezi` | Joezi (athinorama.gr, 2026-08-06) | `/events/47d84d92-bolivar-mayans-with-joezi-i-thu-aug-6` |
| `/events/fcbfdd97-bolivar-rivo` | Rivo (athinorama.gr, 2026-08-08) | `NO PAGE (hard-stop)` |
| `/events/060dd4ef-bolivar-bolivar-blend-pres-sama-abdulhadi-manolaco` | Bolivar & Blend pres. Sama' Abdulhadi + Manolaco (clubber.gr, 2026-08-29) | `/events/cfd73316-bolivar-blend-with-sama-abdulhadi` |
| `/events/a48d9ab1-island-athens-riviera-valeron` | VALERON (residentadvisor, 2026-09-04) | `/events/2361031f-island-athens-riviera-valeron-at-island-athens-riviera` |
| `/events/cca99f25--` | Μάρτυρας κατηγορίας (athinorama.gr, 2026-09-30) | `/events/7866dc83--4` |
| `/events/e5442503--` | Άγριος σπόρος (athinorama.gr, 2026-10-01) | `/events/e143b038--2` |
| `/events/c4f54958--` | Ένας υπηρέτης, δύο αφεντικά (athinorama.gr, 2026-10-03) | `/events/09ffe24b--` |
| `/events/331eb3e8--sold` | Θεόφιλος Sold (athinorama.gr, 2026-10-06) | `/events/c534b023--sold` |
| `/events/18799c02--` | Ο πίνακας (athinorama.gr, 2026-10-15) | `/events/b0f5cd44--` |


## ⚠ Two survivors have NO page (decision needed before any redirect option)

`2c9b53c9` "Notre Dame - JAFARI" and `04a9b313` "Rivo I Sat Aug 8" (both
residentadvisor) won survivor selection on data richness but are excluded
from emission by A0 hard-stop concerns (`entity-resolution-uncertain`,
`ticket-merchant-unverified`). Their losers (`2a250af6` NOTRE DAME,
`fcbfdd97` Rivo — both emitting fine) would 301/410 into nothing.
Sub-options: (a) re-point survivorship to the emitting row for these two
groups (single UPDATE each, audit-logged), (b) clear the concerns if RA
merchant verification lands, (c) exclude these two groups from any redirect
wave. Executor recommendation: (a) — the survivor of record should be a page
that exists.

## Disposition options for the 27 loser URLs

**Option 1 — 410 via the existing Ruling-2 lifecycle machinery.**
Treat merge losers like lifecycle-expired events: emit the 410 tombstone the
lifecycle system already produces. + Consistent with existing GEO policy,
kills crawl of thin duplicate pages fastest, no new mechanism. − Loses any
link equity the loser URL accrued; users landing from stale aggregator links
get a dead-end instead of the event.

**Option 2 — 301 to survivor.**
Netlify `_redirects` entries (loser path → survivor path), loser page removed
from emission. + Preserves link equity and user intent (they wanted THIS
event); cleanest long-term semantics ("this listing moved"). − Requires the
pageless-survivor fix above first; adds a redirects-generation step keyed on
`merged_into` (small: one generator reading the column); redirect map grows
with every merge wave.

**Option 3 — leave live + noindex + canonical to survivor.**
Keep emitting loser pages, add `<meta name="robots" content="noindex">` and
`rel=canonical` → survivor URL. + Zero user-facing breakage, gradual
de-indexing, easily reversible (it's the marking's emission-side mirror).
− Keeps paying build cost for duplicate pages; canonical-to-different-title
pages are a weak signal AI crawlers sometimes ignore; the duplicate content
the arc exists to kill stays technically live.

**Executor's note (not a decision):** Option 2 matches how the site already
treats identity ("one event, one URL") and the 27-entry scale is trivial for
`_redirects`. Option 1 is strictly simpler if link equity on 8-char-hash URLs
is judged worthless. Either way, resolve the two pageless survivors first.

## Follow-ups queued behind this ruling

- Wire chosen disposition into `src/generate-site.ts` emission (losers are
  currently emitted because nothing reads `merged_into`).
- Swap `scripts/merge-duplicates.ts --execute` (still DELETE-based, ran this
  morning) for `scripts/mark-duplicates.ts --execute` in
  `daily-automated.sh` — out of this arc's rails, needs its own session.
- Enrichment pipeline still sees losers as `needs_enrichment=1` stubs —
  exclude `merged_into IS NOT NULL` from enrichment selection to stop
  spending enrichment budget on tombstones (enrichment scripts untouchable
  this arc).
- HOLD pairs in `specs/dedup-hold.md` await human review.
