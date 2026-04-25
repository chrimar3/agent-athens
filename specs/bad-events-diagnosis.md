# Bad Events Diagnosis — 2026-04-24

## Finding A: H Hotels events

- Reported events (from 1a):
  - `58a7ac7af60d7862` — title: `ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 2025-2026`, type: `dj_set`, source: `more.com`, location_status: `verified_athens`
  - `33a6fc4858fb43e5` — title: `ΚΟΛΟΣΣΟΣ H HOTELS COLLECTION - ΚΑΡΔΙΤΣΑ ΙΑΠΩΝΙΚΗ`, type: `dj_set`, source: `more.com`, location_status: `verified_athens`
- Other matches in DB (from 1b): 6 total matches, all in a single source:
  - `more.com`: 6 (titles include `ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ …`, `ΚΟΛΟΣΣΟΣ H HOTELS COLLECTION - ΑΡΗΣ BETS`, `Stoiximan GBL - ΜΑΡΟΥΣΙ CHERY vs ΚΟΛΟΣΣΟ`, `ΚΟΛΟΣΣΟΣ H HOTELS COLLECTION - ΚΑΡΔΙΤΣΑ`)
- Source pattern: `more.com` ticket pages under the `/gr-el/tickets/sports/` URL path (basketball tickets — ΚΟΛΟΣΣΟΣ = Kolossos B.C., "H Hotels" is the club's title sponsor). Not cultural events. Venue on reported rows resolves to `Κλειστό Καλλιθέας` (an indoor sports arena).
- Related promo-like titles from same source (from 1d): 7 promo-like / 566 total from `more.com`; additionally 56 / 566 titles are shorter than 10 characters.

## Finding B: dj_set misclassifications

- Reported event (`7bb8fe15f408c88e`, from 1a):
  - title: `Οι από κάτω`
  - venue: `AUDITORIUM`
  - source: `athinorama.gr`
  - source_url: `https://www.athinorama.gr/theatre/performance/oi_apo_kato-10089949/`
- Other dj_set with non-electronic markers (from 1c): **36 total**
- Grouped by venue:
  - `AUDITORIUM`: 33, samples: `Αλιγάτορες`, `Στρακαστρούκες`, `Οι από κάτω`
  - `Parnassos Literary Society`: 3, samples: `Δύο ρεσιτάλ πιάνου του Nikolai Lugansky`, `Ρεσιτάλ Πιάνου Μαρία Ευστρατιάδη`
- Grouped by source:
  - `athinorama.gr`: 33
  - `ticketservices`: 3

## Raw query outputs

### Step 1a — classify reported events

```
id                type    location_status  title                                             venue              source         url                                                                                        start_date           end_date
----------------  ------  ---------------  ------------------------------------------------  -----------------  -------------  -----------------------------------------------------------------------------------------  -------------------  --------
58a7ac7af60d7862  dj_set  verified_athens  ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 2025-2026    Κλειστό Καλλιθέας  more.com       https://www.more.com/gr-el/tickets/sports/kolossos-h-hotels-eisitiria-agonon-2025-2026/    2026-04-25T18:30:00
33a6fc4858fb43e5  dj_set  verified_athens  ΚΟΛΟΣΣΟΣ H HOTELS COLLECTION - ΚΑΡΔΙΤΣΑ ΙΑΠΩΝΙΚΗ  Κλειστό Καλλιθέας  more.com       https://www.more.com/gr-el/tickets/sports/kolossos-h-hotels-collection-karditsa-iaponiki/  2026-04-25T18:15:00
7bb8fe15f408c88e  dj_set  verified_athens  Οι από κάτω                                       AUDITORIUM         athinorama.gr  https://www.athinorama.gr/theatre/performance/oi_apo_kato-10089949/                        2026-04-24T21:00:00
```

Note: schema column is `venue_name` (not `venue`) and `url` (not `source_url`); there is no `slug` column — Step 1b's `slug LIKE '%h-hotels%'` clause was dropped. All three reported rows have `type=dj_set` and `location_status=verified_athens`; `end_date` is empty for all three.

### Step 1b — H Hotels scope by source

```
source    n  sample_titles
--------  -  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
more.com  6  ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 202 || ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 202 || ΚΟΛΟΣΣΟΣ H HOTELS COLLECTION - ΑΡΗΣ BETS || ΚΟΛΟΣΣΟΣ H HOTELS - ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ 202 || Stoiximan GBL - ΜΑΡΟΥΣΙ CHERY vs ΚΟΛΟΣΣΟ || ΚΟΛΟΣΣΟΣ H HOTELS COLLECTION - ΚΑΡΔΙΤΣΑ
```

### Step 1c — dj_set with non-electronic markers

Total: 36.

Grouped by venue:

```
venue_name                  n   sample_titles
--------------------------  --  ------------------------------------------------------------------------
AUDITORIUM                  33  Αλιγάτορες,Στρακαστρούκες,Οι από κάτω
Parnassos Literary Society  3   Δύο ρεσιτάλ πιάνου του Nikolai Lugansky,Ρεσιτάλ Πιάνου Μαρία Ευστρατιάδη
```

Grouped by source:

```
source          n
--------------  --
athinorama.gr   33
ticketservices  3
```

Row-level sample (abridged — full set is 36 rows sharing 5 distinct (title, url) combinations):

```
id                title                                    venue                       source          url
----------------  ---------------------------------------  --------------------------  --------------  ----------------------------------------------------------------------
c95b3c2066b46192  Αλιγάτορες                               AUDITORIUM                  athinorama.gr   https://www.athinorama.gr/theatre/performance/aligatores-10081818/
…(22 further Αλιγάτορες rows, same URL)
91190424108bfa4c  Οι από κάτω                              AUDITORIUM                  athinorama.gr   https://www.athinorama.gr/theatre/performance/oi_apo_kato-10089949/
7bb8fe15f408c88e  Οι από κάτω                              AUDITORIUM                  athinorama.gr   https://www.athinorama.gr/theatre/performance/oi_apo_kato-10089949/
988686f4a0335e05  Στρακαστρούκες                           AUDITORIUM                  athinorama.gr   https://www.athinorama.gr/theatre/performance/strakastroukes-10079547/
…(7 further Στρακαστρούκες rows, same URL)
2ada537f08ee7037  Δύο ρεσιτάλ πιάνου του Nikolai Lugansky  Parnassos Literary Society  ticketservices  https://www.ticketservices.gr/event/13543/
576dad5fac6e4ad6  Δύο ρεσιτάλ πιάνου του Nikolai Lugansky  Parnassos Literary Society  ticketservices  https://www.ticketservices.gr/event/13543/
5eb0304ea7b10136  Ρεσιτάλ Πιάνου Μαρία Ευστρατιάδη         Parnassos Literary Society  ticketservices  https://www.ticketservices.gr/event/14199/
```

### Step 1d — title quality from `more.com`

```
total  very_short_titles  promo_like
-----  -----------------  ----------
566    56                 7
```
