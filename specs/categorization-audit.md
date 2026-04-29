# Categorization Audit — Session 95

**Date:** 2026-04-28
**Method:** Read-only DB queries + manual classification of 30-row random sample.
**Active filter:** `location_status IN ('verified_athens','pass_through') AND COALESCE(CASE WHEN type='exhibition' THEN end_date ELSE NULL END, start_date) >= date('now')`
**Baseline:** 483 events across 14 sources (post-S100 DB).
**Source files NOT modified.**

---

## 1. Type distribution

| type        | n   | % of 483 |
|-------------|----:|---------:|
| concert     | 309 |    63.9% |
| dj_set      | 106 |    21.9% |
| theater     |  35 |     7.2% |
| festival    |  10 |     2.1% |
| exhibition  |   7 |     1.4% |
| performance |   6 |     1.2% |
| workshop    |   4 |     0.8% |
| show        |   4 |     0.8% |
| tech        |   2 |     0.4% |

`show` (4) and `performance` (6) are very low-cardinality categories; they fire on rare keyword paths and are structurally fragile.

## 2. Source × type matrix

| source            | type        |   n |
|-------------------|-------------|----:|
| athinorama.gr     | concert     | 176 |
| athinorama.gr     | theater     |  14 |
| athinorama.gr     | festival    |   5 |
| athinorama.gr     | dj_set      |   4 |
| athinorama.gr     | show        |   3 |
| athinorama.gr     | performance |   2 |
| benaki            | exhibition  |   1 |
| clubber.gr        | dj_set      |  13 |
| eventbrite        | festival    |   1 |
| greeksin.ai       | tech        |   1 |
| halfnote          | concert     |  19 |
| manual            | tech        |   1 |
| manual            | concert     |   1 |
| megaron.gr        | concert     |  27 |
| megaron.gr        | theater     |   3 |
| more.com          | concert     |  49 |
| more.com          | theater     |  17 |
| more.com          | festival    |   4 |
| more.com          | dj_set      |   2 |
| more.com          | show        |   1 |
| more.com          | performance |   1 |
| onassis           | exhibition  |   4 |
| onassis           | performance |   1 |
| productledhub.com | workshop    |   1 |
| residentadvisor   | dj_set      |  87 |
| residentadvisor   | concert     |   6 |
| snfcc             | workshop    |   3 |
| snfcc             | performance |   2 |
| snfcc             | exhibition  |   2 |
| ticketservices    | concert     |  31 |
| ticketservices    | theater     |   1 |

Observations:
- `residentadvisor` shows 6 `concert` rows. RA is electronic-music focused; these are likely live electronic acts at concert venues (e.g., row 50 `Colographs + Bhukura live at ΙΛΙΟΝ+`) — plausible, not necessarily wrong, but worth an explicit RA-concert spot-check at fix time.
- `athinorama.gr` has 4 `dj_set` entries despite being a general music aggregator. Worth checking whether these genuinely match clubber.gr/RA or are misrouted.
- `more.com` appears across 6 distinct types (the most polymorphic source) — keyword/URL passes carry the load here.
- `benaki` source has 1 exhibition that ONLY exists in this audit because of the COALESCE active filter (start_date in the past, end_date in the future).

## 3. Manual classification of 30 events

Sample rows 1–30 from `/tmp/categorization-sample.tsv`. `assigned_type` is what's in the DB; `actual_type` is my judgment.

| id | title | assigned | actual | tag | justification |
|----|-------|----------|--------|-----|---------------|
| 3abe47084bfdff0a | ΒΑΝΔΑΛΟΥΠ ... LIVE | concert | concert | correct | — |
| 0826106913cd7f03 | «Μελωδίες στον χρόνο» | concert | concert | correct | — |
| cdcb0b1da0a18305 | Allochiria | concert | concert | correct | — |
| b51062d01ef11773 | Release Athens 2026 / Helloween, Saxon & more | concert | concert-or-festival | ambiguous / source-hint | URL contains `/festival/release-athens-2026/`; treating as concert is defensible (single-band sub-event) but festival is also valid given the umbrella context. URL pattern weakly contradicts assigned. |
| 9eca4178777d0656 | Rationalistas @ Texnopolis | concert | concert | correct | — |
| 8c1e1c44c935018e | Flamecore | performance | concert-or-performance | ambiguous / keyword | URL `/music/gig/` and venue Temple are concert signals; "performance" pass likely fired on title token. Could be a metal band ("-core" suffix) OR a fire-performance act. Title alone insufficient to disambiguate. |
| c5d4719c912329ac | BLADE RUNNER Live | concert | concert | correct | Film-score-live event; music is the headline. |
| 18077af962e00466 | Techno Underdogs - Free Entrance | dj_set | dj_set | correct | — |
| 8ad40e93de76c87c | Μεγάλη Φυγή & Mira | concert | concert | correct | — |
| 08f57a30942b0592 | Phantomimes | concert | concert | correct | — |
| 639ce6622e840e4f | Ανδρέας Πολυζωγόπουλος Trio | concert | concert | correct | — |
| 7394f2aed99c0424 | Το στέρεο βήμα της Αντιγόνης | theater | theater | correct | — |
| 46a0d604ff8ba0ee | Συναυλία σπουδαστών... ΚΟΑ | concert | concert | correct | Title literally starts with "Συναυλία" (concert). |
| 191a40b0fe23da8f | VALERON | dj_set | dj_set | correct | — |
| 1dc9b2718e2de08b | Vaginahood | show | show-or-theater | ambiguous / source-hint | URL `/theatre/performance/` contradicts `show`; may be a one-woman comedy show (legitimately `show`) or a theatrical performance. Source-hint pass would suggest theater; keyword pass produced show. |
| d1b3dcc816ce1036 | Mind Against I Fri May 8 | dj_set | dj_set | correct | — |
| f54f464696e6d552 | Lou | concert | concert | correct | — |
| 148ac1a560467e5c | RELEASE ATHENS 2026 X SNF NOSTOS | concert | festival | wrong / keyword | "Release Athens" is a known multi-day festival brand and the title is the umbrella event (not a sub-event). Venue `Πολλαπλοί Χώροι` confirms multi-venue. Categorizer missed because "festival"/"φεστιβάλ" not in title; "Release Athens" not whitelisted. |
| 70cb7a8a0f2223af | «Το Κτίσμα» | concert | concert | correct | URL pass `/music/gig/` likely fired. |
| 21187f9355e68d21 | JOHN LEGEND - Live at Acropolis | concert | concert | correct | — |
| 6e9dc4ac01ea744e | Mayans with Mita Gami I Magit Cacoon I Thu June 4 | dj_set | dj_set | correct | — |
| dfd6e2e6679ac4bb | Παύλος Καρποδίνης | concert | concert | correct | — |
| 8cc0e9d56418714e | 12ος Πίθηκος | concert | concert | correct | — |
| 40c5a41d2c7b8290 | SOLACE PRE PARTY | dj_set | dj_set | correct | Source RA + "PRE PARTY" → dj_set. (Note: same venue Universe is also `concert` for athinorama listings — consistent with `mixed_venues` design.) |
| 9f1343f46945b67c | Τρισεύγενη | show | concert | wrong / keyword | "Trisefgeni" is a 1936 Greek opera by Kalomiris. Venue `Μέγαρο Μουσικής` and URL `/theatre/performance/` are both wrong-fits for `show`; opera is conventionally `concert` in this taxonomy. The `show` keyword pass fired ahead of the opera-/concert-resolving logic. |
| 665995ddf26a5ceb | Δημήτρης Κόψης | concert | concert | correct | — |
| c26050fb7ea81ab5 | Γιάννης Παπαγεωργίου | concert | concert | correct | — |
| 44a392bd4b3651c0 | Mundus inversus... | concert | concert | correct | — |
| 82f681a2facd06c7 | Βασιλική Μιχαλοπούλου | concert | concert | correct | — |
| 43517582c1e59771 | Stavros Lantsias Octet | concert | concert | correct | — |

### Tally

| outcome   | count | pct  |
|-----------|------:|-----:|
| correct   |    25 | 83% |
| ambiguous |     3 | 10% |
| wrong     |     2 |  7% |

### Failure-class distribution (5 non-correct rows)

| failure-class  | count | rows                       |
|----------------|------:|----------------------------|
| keyword        |     3 | #6 (Flamecore), #18 (Release Athens umbrella), #25 (Trisefgeni opera) |
| source-hint    |     2 | #4 (Release Athens sub-event), #15 (Vaginahood) |
| venue-lock     |     0 | — |
| no-signal      |     0 | — |
| new-class      |     0 | — |

## 4. Hypothesis

**Dominant failure class: `keyword` (3/5 = 60%).**

Two sub-patterns inside `keyword`:
1. **Festival-umbrella miss**: events titled with a known festival brand (`Release Athens`) but lacking the literal word "festival"/"φεστιβάλ" fall through to `concert`. Categorizer relies on the title-keyword whitelist; festival brands aren't listed.
2. **Low-cardinality category fragility**: `show` and `performance` (4 and 6 events DB-wide) fire on rare keyword paths. When they do fire, they often misclassify edge cases (Trisefgeni opera → `show`; possibly Flamecore → `performance`). Their priority position in `categorization-keywords.json` should be reviewed.

**Concentration vs. spread**: failures are concentrated in **aggregator sources** (`athinorama.gr` 2/13, `more.com` 2/5 in this sample). Single-purpose sources (`residentadvisor`, `clubber.gr`, `halfnote`, `megaron.gr`, `ticketservices`) had zero failures in the sample — their venue-lock + source-hint passes carry the load and don't depend on keywords. Aggregators are where keywords + URL patterns must do the work, and that's where they break.

Sample size caveat: 30 events is small. The wrong-class confidence interval is wide. The pattern (aggregators > single-purpose) is consistent with the categorizer's design and worth investigating with a larger sample at fix time.

## 5. Recommendations for fix planning (deferred)

Numbers cited above; recommendations belong in `diagnostic-summary.md`. This file documents only the measurement.
