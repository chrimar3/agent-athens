# S140 — Scraper Hygiene Followups

**Session:** S140
**Date:** 2026-05-19
**Scope:** Diagnostic-only. Identifies which scrapers produced unregistered/mis-classified venue names. **No scraper fixes this session** — followup work is queued for a separate hygiene session.

## Source attribution

Roll-up by source (orphan venues = `venue_name` writes without matching `canonical_name` or `variations[]` in `config/athens-venues.json`, current upcoming events only):

| Source | Orphan venues | Orphan events | Hygiene severity |
|---|---|---|---|
| `more.com` | 12 | 21 | 🔴 highest |
| `residentadvisor` | 11 | 21 | 🔴 high |
| `ticketservices` | 8 | 12 | 🔴 high (heavy non-Athens) |
| `athinorama.gr` | 5 | 5 | 🟡 moderate (mostly Athens venues, unverified) |
| `meetup` | 1 | 2 | 🟢 low (TBA placeholder pattern) |
| `clubber.gr` | 1 | 1 | 🟡 venue-name-contains-address bug |

## Bucket B residuals (verified_athens, geocoder-blind)

These two venues are the unrecovered 2 of 41 events. Both require Editorial decisions:

### `WE Πολυχώρος` — from `more.com` (1 event)

**Finding:** Web research surfaces a Thessaloniki venue (Πολυχώρος Πολιτισμού & Αθλητισμού WE, 3ης Σεπτεμβρίου & Γρ. Λαμπράκη, 54636 Θεσσαλονίκη). NOT Athens.

**Why this slipped through location filter:** The CU-BEMS-style location filter rejects venues with literal `Θεσσαλονίκη` in `venue_name`. This venue's name carries no city marker, so the filter passed it and `auto-verify-venues.ts` classified it `verified_athens` based on name alone (which contains the word "Athens"-like Greek pattern via `Πολυχώρος`).

**Recommended Editorial action:** REJECT (location_status → `rejected_non_athens`). Add Thessaloniki variation forms to a Greek-cities blacklist to catch the next instance from `more.com`.

### `TBA - ATHarea` — from `residentadvisor` (1 event)

**Finding:** No web presence for "ATHarea" or "TBA - ATHarea" venue. Likely scraper data quality issue — possibly a parsed-text artifact, possibly a one-off pop-up event.

**Recommended Editorial action:** INVESTIGATE. If no canonical venue is identifiable, treat as scraper hallucination and adjust `residentadvisor` scraper to reject `TBA` prefix entries OR fall back to `problematic` location_status (same handling as the standalone `TBA` placeholder).

## Bucket C set — full source attribution (deferred to follow-up session)

Per the deferred-to-known-issues.md entry, these 35 venues await Editorial REJECT/APPROVE rulings in a separate session. Source attribution captured here for completeness:

### Non-Athens (REJECT candidates)

| Source | Venue | Events | Region |
|---|---|---|---|
| more.com | Θέατρο Βράχων Μελίνα Μερκούρη | 4 | Vyronas (Athens-region but edge case) |
| more.com | Βεάκειο Θέατρο, Πειραιάς | 3 | Piraeus |
| more.com | Θέατρο Γης | 2 | likely Thessaloniki |
| more.com | Μονή Λαζαριστών | 2 | Thessaloniki |
| more.com | Επταπύργιο | 1 | Thessaloniki |
| more.com | Θέατρο ΑΛΣΟΣ | 1 | verification needed |
| ticketservices | Κολλίνες Αρκαδίας | 4 | Arcadia (outside Athens) |
| ticketservices | 'Αλσος Προφήτη Ηλία Νεοχώρι - Τρίπολη | 1 | Tripoli |
| ticketservices | KIPOTHEATRO «NIKOS KAZANTZAKIS» - HERAKLEION | 1 | Heraklion (Crete) |
| ticketservices | ΚΗΠΟΘΕΑΤΡΟ ΑΛΚΑΖΑΡ - ΛΑΡΙΣΑ | 1 | Larisa |
| ticketservices | ΠΑΛΑΙΟ ΦΡΟΥΡΙΟ ΚΕΡΚΥΡΑΣ | 1 | Corfu |
| ticketservices | ΣΚΕΠΑΣΤΗ ΑΓΟΡΑ ΦΑΡΣΑΛΩΝ | 1 | Farsala |

**Pattern:** `ticketservices` aggregates nationwide Greek events. Scraper should filter by city (Αθήνα / Athens) at ingest time. Currently no city-filter gate — all entries pass through and rely on registry/location-filter rejection downstream.

### Likely Athens but unverified (APPROVE candidates)

| Source | Venue | Events | Notes |
|---|---|---|---|
| residentadvisor | Manko Athens | 6 | Real Athens venue (Pireos area), needs verification |
| residentadvisor | Ace Hotel & Swim Club Athens | 3 | Real Athens hotel |
| residentadvisor | Petra Theater | 2 | English form of Θέατρο Πέτρας (Petroupoli) |
| residentadvisor | Aura Rooftop | 1 | Athens |
| residentadvisor | Booze Cooperative | 1 | Athens cultural space |
| residentadvisor | Dark Sun Club | 1 | Athens |
| residentadvisor | Okupa Kitchen & Listening Bar | 1 | Athens |
| residentadvisor | Vrachon Theater | 1 | Variation of Θέατρο Βράχων |
| athinorama.gr | ARK | 1 | possibly Athens |
| athinorama.gr | Moxy Athens City | 1 | Real Athens hotel |
| athinorama.gr | REVMA | 1 | possibly Athens |
| athinorama.gr | Αθηνά Live | 1 | possibly Athens |
| athinorama.gr | Ιωνικό Κέντρο | 1 | likely Plaka (Ionian Centre) |

### Duplicate canonical pairs (need Bucket-A-equivalent merge)

| Form set | Sources | Events |
|---|---|---|
| Vrachon Theater (RA) + VRACHON THEATRE - MELINA MERKOURI (ticketservices) + Θέατρο Βράχων Μελίνα Μερκούρη (more.com) | mixed | 7 |
| Κατράκειο Θέατρο (more.com) + Κατράκειο Θέατρο Νίκαιας (more.com) | more.com | 3 |
| ΙΩΝΙΚΟ ΚΕΝΤΡΟ - Πλάκα (ticketservices) + Ιωνικό Κέντρο (athinorama.gr) | mixed | 2 |
| TBA (meetup + RA) + TBA - Bagion (RA) + TBA - ATHarea (RA) | meetup + RA | 7 |
| Θέατρο Πέτρας, Ρωμυλίας 1, Πετρούπολη, Αθήνα, 13231, Greece (clubber.gr) | clubber.gr | 1 |

**Pattern: `clubber.gr` venue-name-contains-full-address bug.** Scraper writes the full address string into `venue_name`. Fix: parse address fields separately at scrape time; populate `venue_address` directly.

### Other

| Source | Venue | Events |
|---|---|---|
| more.com | WE Πολυχώρος | 1 (Bucket B residual — moved up) |
| more.com | Tae Kwon Do, Mad VΜΑ | 1 (scrape artifact, looks like merged event title + venue) |
| more.com | Δημ. Στάδιο Καλλιθέας 'Γρηγόρης Λαμπράκης' | 1 (Kallithea Athens, real venue) |
| residentadvisor | TBA - ATHarea | 1 (Bucket B residual — moved up) |
| residentadvisor | Θέατρο Δόρας Στράτου | 2 (Athens, Filopappou Hill) — actually likely Athens, mis-bucketed |
| residentadvisor | Κατράκειο Θέατρο | 2 (Nikaia, Athens-region) |

## Structural mitigations (post-S140 scope — for future hygiene session)

In priority order:

1. **Registry-lookup-then-write gate at scrape time.** Currently scrapers write `venue_name` freely. Add a pre-write check: if `venue_name` doesn't match any canonical or variation in `config/athens-venues.json`, set `location_status='unverified'` immediately AND surface to operator. Prevents the silent-orphan-write pattern that produced this S140 cleanup.
2. **City-filter gate at scrape time for `ticketservices`.** It's a nationwide Greek aggregator; filter to Athens/Attica only at ingest.
3. **`clubber.gr` address-in-name parser fix.** Detect "VenueName, Street X, ..., Greece" pattern at scrape time; split into venue_name + venue_address.
4. **TBA-prefix rejection (`residentadvisor`, `meetup`).** Pattern: when `venue_name` starts with "TBA" or "tba", treat as `problematic` immediately. Currently bypasses this gate.
5. **Greek-cities blacklist** for the location filter. Beyond "Θεσσαλονίκη", catch venues with: Πειραιάς (Piraeus), Λάρισα (Larisa), Κέρκυρα (Corfu), Ηράκλειο (Heraklion), Τρίπολη (Tripoli), Φάρσαλα (Farsala), Καλλιθέα (Kallithea — note: Kallithea is in Athens metro, edge case), Μονή Λαζαριστών (Thessaloniki).

## Connects to

- `specs/s140-classification.md` — bucket distribution that produced this attribution
- `docs/known-issues.md` — Bucket C deferral entry (filed at S140 specs commit)
- Memory: `agent_athens_data_extraction_paths.md` — scraper canonical locations
- Memory: `auto-enrich-pipeline-fixes.md` — prior pipeline hygiene precedents
