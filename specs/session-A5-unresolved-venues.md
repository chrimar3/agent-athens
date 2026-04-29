# Session A.5 — Unresolved Venues (diagnostic for planner)

**Source:** Session A dry-run, 2026-04-28 (`specs/session-A-backfill-dryrun-verbose.log`).
**Dry-run scope:** 473 future ticketed events (verified_athens or pass_through).
**Cascade outcome:** 122 unresolved (cascade fallthrough, no tier hit).
**This file:** the venue distribution behind those 122, sorted by frequency.

## Top finding

**The curation gap is not "venues missing from `athens-venues.json`." It's
"venue records with no `ticketing` config, no `website`, and no
`venue_to_platform` mapping."** All 15 top-frequency unresolved venues already
have entries in `athens-venues.json` — they're just under-populated.

This shifts what Session A.5 needs to do:
- ❌ NOT: add new venue records
- ✅ YES: fill `ticketing.url` / `ticketing.search_pattern` / `website` on existing records,
  and/or add `venue_to_platform` mappings in `config/ticketing-mapping.json`

Top 15 venues account for **71 of 122 unresolved events (58.2%)**. Curating
these 15 records — adding ticketing config + website where applicable — should
push real-URL coverage from 64.5% → above 80%.

## Top 15 unresolved venues

| # | Venue | Count | In athens-venues.json | In venue_to_platform | Has website | Ticketing config | Sample event_url |
|---|---|---|---|---|---|---|---|
| 1 | Σταυρός του Νότου | 11 | ✅ | ❌ | ❌ | — | athinorama.gr/.../xatzigfragketa-10058545/ |
| 2 | Ωδείο Αθηνών | 6 | ✅ | ❌ | ❌ | — | athinorama.gr/.../jamie_duffy-10089870/ |
| 3 | Theatre Of The No | 6 | ✅ | ❌ | ❌ | — | athinorama.gr/.../yiannis_kassetas-10052166/ |
| 4 | ARCH Club | 6 | ✅ | ❌ | ❌ | — | athinorama.gr/.../zorz_pilali-10024445/ |
| 5 | Κέντρο Ελέγχου Τηλεοράσεων | 5 | ✅ | ❌ | ❌ | — | athinorama.gr/.../laura_agnusdei_kai_free.../ |
| 6 | Εθνική Λυρική Σκηνή | 5 | ✅ | ❌ | ❌ | — | athinorama.gr/.../karmen-10063595/ |
| 7 | Παρνασσός | 4 | ✅ | ❌ | ❌ | — | athinorama.gr/.../candlelight_ennio_morric.../ |
| 8 | ΠΛΥΦΑ | 4 | ✅ | ❌ | ❌ | — | athinorama.gr/.../sister_-10089886/ |
| 9 | Ολύμπια - Δημοτικό Μουσικό Θέατρο «Μαρία Κάλλας» | 4 | ✅ | ❌ | ❌ | — | athinorama.gr/.../loukis_laras-10089198/ |
| 10 | Universe | 4 | ✅ | ❌ | ❌ | — | athinorama.gr/.../jokertwo_face-10088160/ |
| 11 | Caja de Música | 4 | ✅ | ❌ | ❌ | — | athinorama.gr/.../katerina_ntinou-10050361/ |
| 12 | Σπίτι Art Bar | 3 | ✅ | ❌ | ❌ | — | athinorama.gr/.../live_experimental_electr.../ |
| 13 | Γυάλινο Μουσικό Θέατρο | 3 | ✅ | ❌ | ❌ | — | athinorama.gr/.../soul_madness-10089861/ |
| 14 | Αγγλικανική Εκκλησία Αγίου Παύλου | 3 | ✅ | ❌ | ❌ | — | athinorama.gr/.../lou_-10089956/ |
| 15 | Underflow | 3 | ✅ | ❌ | ❌ | — | athinorama.gr/.../joanna_mattrey-10089214/ |

**Top 15 total unresolved: 71 / 122 (58.2%)**
**Estimated coverage uplift if all 15 curated: 64.5% → ~80%+** (depends on per-venue field accuracy).

## Why every sample URL is athinorama.gr

These events are scraped from `athinorama.gr` — an editorial / cultural-listings
site, not a ticket vendor. The resolver's Tier 1 explicitly rejects athinorama
self-links (`validator.ts: if (host === 'athinorama.gr') return null;`) because
`generateMissingUrls()` historically copied athinorama listing URLs into
`ticket_url`, polluting the column with non-purchase pages. With the self-link
rejected and no other tier configured for these venues, the cascade falls through.

What `event.url` (athinorama listing) DOES contain:
- Show description, date, venue
- A button reading "Αγορά εισιτηρίων" (Buy tickets) that links externally to the
  venue's preferred ticket platform (more.com, ticketservices.gr, viva.gr, or
  the venue's own site)

This means **Tier 1b (HTTP detail-page extraction) would solve a lot of these
events** — fetch the athinorama listing, regex-match outbound ticket-platform
links, return the extracted URL @ 0.9. The Tier 1b scaffolding is already in
place (`tier1b_detailPage` + `SOURCES_WITH_OUTBOUND_LINKS`) but `athinorama.gr`
is intentionally excluded from that allowlist (per the resolver comment:
"2026-04-24 investigation confirmed its detail pages contain no more.com / viva
/ ticketservices outbound links").

⚠️ **That conclusion may be stale.** The 2026-04-24 investigation note may
predate the current state of athinorama event pages — and 11 of the 15 top
venues are music-only listings where the outbound-link presence has historically
varied. Worth a 2-event spot-check before Session A.5 commits to the
"curate athens-venues.json" path.

## Non-venue / catch-all check

Reviewed all 25 venues in the unresolved tail (top 15 + 10 with count 2):
**none are catch-alls / aggregators / festival containers.** All are real
Athens cultural venues with addresses and physical locations.

The closest edge cases worth flagging:
- "Universe" — short ambiguous name, but per athens-venues.json it's a real club.
- "Αγγλικανική Εκκλησία Αγίου Παύλου" (Anglican Church of St Paul) — primarily a
  religious building, occasional concert venue. Curation should set
  `website` (church has one) but `ticketing` may legitimately be empty
  (no ticketing platform — concerts are usually door-pay or
  one-off platforms).
- "Theatre Of The No" — real space but very small, may not have ticketing infrastructure.

None warrant special "non-venue" handling.

## Recommended next-session sequencing (NOT executing here)

1. **Decide the curation strategy first.** Two paths, may combine:
   - **Path A — Static curation**: fill `ticketing.url` / `search_pattern` /
     `website` on each top-15 record manually. Predictable, but requires
     per-venue research (which platform sells their tickets?).
   - **Path B — Re-enable Tier 1b for athinorama**: if athinorama detail pages
     DO carry outbound ticket links today (the 2026-04-24 conclusion may be
     stale), this would resolve all 71 events automatically without manual
     curation. Cost: ~71 HTTP fetches at backfill time. Verify with a small
     spot-check first.
2. **If Path A**: 15 venues × ~5 minutes per venue research = ~75 minutes for
   the planner or a research agent. Most likely platforms are more.com,
   viva.gr, ticketservices.gr.
3. **If Path B**: 1 spot-check + 1 line code change (add `'athinorama.gr'` to
   `SOURCES_WITH_OUTBOUND_LINKS`) + port the regex from
   `scripts/extract-ticket-urls.ts`. Path B has the better leverage if the
   premise holds.
4. **Probably both**: even with Tier 1b enabled, static curation for the
   top-5 (32 events) is worth doing — those are major venues (Σταυρός του
   Νότου, Ωδείο Αθηνών, Εθνική Λυρική Σκηνή, ΠΛΥΦΑ) that warrant Tier 2
   trust regardless of athinorama HTTP behavior.

## Bottom-25 venues (count 2-3, for completeness)

These bring the count to 51 venues × 1-3 events = 51 of the remaining 51
unresolved (every venue with count=1 was unique). Most are even smaller spots
(home studios, one-off spaces, churches, clubs in transition). Curating top-15
captures the bulk; bottom-25 is a long tail not worth manual effort unless
Path B (Tier 1b re-enable) handles them automatically.

```
3   Route 06
3   Jazzet Cafe
2   Ον Off Studio
2   Καφεθέατρο
2   Αίθουσα Διδασκαλίας Μεγάρου Μουσικής
2   Piraeus Club Academy
2   MÉTRON Stage
2   HolyWood Stage
2   EXA
1   (40+ unique venues with single events)
```
