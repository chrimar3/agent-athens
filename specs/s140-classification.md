# S140 — Venue Address/Geo Backfill Classification

**Session:** S140
**Date:** 2026-05-19
**Snapshot baseline:** brief said 54 venues / 101 events; actual at execution time: 53 venues / 96 events (within brief's ±5 drift tolerance — no re-baseline needed).

## Top-line finding

**The bucket-to-location_status correlation is perfect:**

| Bucket | Definition | Venues | Events | Location status |
|---|---|---|---|---|
| **A** — registry-DB drift | `in_reg≥1 AND reg_has_addr≥1 AND events_have_addr < total` | **0** | 0 | n/a |
| **B** — registry exists, no address | `in_reg≥1 AND reg_has_addr=0` | **18** | **41** | 100% `verified_athens` |
| **C** — not in registry | `in_reg=0` | **35** | **60** | 100% `unverified` (34) or `problematic` (1, "TBA") |
| **D** — geo-only gap | `in_reg≥1 AND reg_has_addr≥1 AND events_have_addr = total AND events_have_geo < total` | **0** | 0 | n/a |
| **Sum** | | **53** | **101** | |

**Implication for S140's stated goal (Google Rich Results recovery):**

Only verified_athens events emit JSON-LD to dist HTML (per Location Filter, CLAUDE.md). Therefore only Bucket B events are actually causing GSC "Missing field location" errors. Bucket C events are filtered out at site-generation time — they never reach Google's crawler, so they're not in GSC's error queue.

**The real GSC-recovery scope is Bucket B: 18 venues / 41 events.**

## Bucket B detail (verified_athens, in registry, no address in config) — the GSC scope

Sorted by event count desc:

| Venue | Events | Events have_addr | Events have_geo | Notes |
|---|---|---|---|---|
| Μέγαρο Μουσικής Αθηνών | 10 | 8 | 0 | 8/10 events have address from some prior partial backfill; config missing it; ALL missing geo |
| B side Athens | 4 | 0 | 0 | |
| Bios Ρομάντσο | 4 | 0 | 0 | |
| Bolivar | 4 | 0 | 0 | |
| Half Note Jazz Club | 2 | 0 | 0 | |
| IT Athens | 2 | 0 | 0 | |
| Island Athens Riviera | 2 | 0 | 0 | |
| SMUT Athens | 2 | 0 | 0 | |
| Temple | 2 | 0 | 0 | |
| 2ten | 1 | 0 | 0 | |
| Burger Disco Club | 1 | 0 | 0 | |
| Cantina Social | 1 | 0 | 0 | |
| Couleur Locale | 1 | 0 | 0 | |
| Death Disco | 1 | 0 | 0 | |
| Gazi View | 1 | 0 | 0 | |
| TBA - ATHarea | 1 | 0 | 0 | TBA-style placeholder venue at ATHarea — flag in scraper-hygiene |
| WE Πολυχώρος | 1 | 0 | 0 | |
| ΠΛΥΦΑ | 1 | 0 | 0 | |

**Total: 18 venues / 41 events.** All registered in `config/athens-venues.json` without an `address` field. All 41 events emit JSON-LD with empty `location.address.streetAddress` → GSC ERROR.

## Bucket C detail (not in registry; not currently GSC-affecting) — separate problem class

35 venues / 60 events. Subdivided into three sub-classes by domain knowledge:

### C-1: Genuinely non-Athens (should be rejected, not backfilled)

| Venue | Events | Likely location |
|---|---|---|
| ΚΗΠΟΘΕΑΤΡΟ ΑΛΚΑΖΑΡ - ΛΑΡΙΣΑ | 1 | Larisa |
| ΠΑΛΑΙΟ ΦΡΟΥΡΙΟ ΚΕΡΚΥΡΑΣ | 1 | Corfu |
| ΣΚΕΠΑΣΤΗ ΑΓΟΡΑ ΦΑΡΣΑΛΩΝ | 1 | Farsala |
| KIPOTHEATRO «NIKOS KAZANTZAKIS» - HERAKLEION | 1 | Heraklion (Crete) |
| 'Αλσος Προφήτη Ηλία Νεοχώρι - Τρίπολη | 1 | Tripoli |
| Κολλίνες Αρκαδίας | 4 | Arcadia |
| Μονή Λαζαριστών | 2 | Thessaloniki |
| Επταπύργιο | 1 | Thessaloniki |
| Θέατρο Γης | 2 | likely Thessaloniki |
| Θέατρο ΑΛΣΟΣ | 1 | needs verification (could be Athens) |

**Sub-total: ~10 venues / 15 events** — should be moved to `rejected_non_athens` via location-filter or `auto-verify-venues.ts` REJECT action.

### C-2: Likely Athens but unverified (verification candidates)

| Venue | Events | Notes |
|---|---|---|
| Manko Athens | 6 | Real Athens venue (Pireos area) |
| Ace Hotel & Swim Club Athens | 3 | Real Athens hotel |
| Aura Rooftop | 1 | Athens |
| Booze Cooperative | 1 | Athens (cultural space) |
| Dark Sun Club | 1 | Athens |
| Moxy Athens City | 1 | Real Athens hotel |
| Okupa Kitchen & Listening Bar | 1 | Athens |
| ARK | 1 | possibly Athens |
| Aθηνά Live | 1 | possibly Athens |
| REVMA | 1 | possibly Athens |
| Δημ. Στάδιο Καλλιθέας 'Γρηγόρης Λαμπράκης' | 1 | Kallithea (Athens) |
| Tae Kwon Do, Mad VΜΑ | 1 | scrape artifact, needs cleanup |
| Θέατρο Δόρας Στράτου | 2 | Athens (Filopappou Hill) |

**Sub-total: ~13 venues / 21 events** — candidates for `auto-verify-venues.ts` APPROVE action + new registry entry.

### C-3: Duplicate canonical pairs/triplets (not in registry but multiple forms in DB)

These are the Bucket-A-equivalent for venues that aren't yet registered — orphan canonical pairs where the scraper wrote different forms of the same physical venue.

| Form set | Events |
|---|---|
| **Vrachon Theater + VRACHON THEATRE - MELINA MERKOURI + Θέατρο Βράχων Μελίνα Μερκούρη** (3 forms, same venue — Theatro Vrachon Melina Mercouri in Vyronas) | 1+2+4 = 7 |
| **Κατράκειο Θέατρο + Κατράκειο Θέατρο Νίκαιας** (2 forms — Katrakeio Theatre Nikaia) | 2+1 = 3 |
| **ΙΩΝΙΚΟ ΚΕΝΤΡΟ - Πλάκα + Ιωνικό Κέντρο** (2 forms — Ionian Centre, Plaka) | 1+1 = 2 |
| **TBA + TBA - Bagion + TBA - ATHarea** (3 forms — "TBA" placeholder pattern from scrapers) | 5+1+1 = 7; ATHarea is in Bucket B subset |
| **Θέατρο Πέτρας, Ρωμυλίας 1, Πετρούπολη, Αθήνα, 13231, Greece** | 1 | Address-as-name scraper bug |
| **Bios Ρομάντσο** | 4 | (in Bucket B, listed here for cross-reference of B-side scraper hygiene) |

**Sub-total: ~12 venues / ~20 events** — need duplicate-canonical normalization + Bucket B-style registry registration.

### C-4: Edge cases

| Venue | Events | Edge |
|---|---|---|
| Petra Theater | 2 | English form of Θέατρο Πέτρας; possible duplicate of C-3 entry |
| Βεάκειο Θέατρο, Πειραιάς | 3 | Piraeus venue (separate municipality); Athens-area but special-case |

## Sanity gates

- ✅ Bucket totals sum to 53 venues / 101 events (matches brief's expected range)
- ⚠️ **Bucket D not just "smallest" — it's empty.** Combined with empty Bucket A: the current S140 inventory has no "easy" cases. Every gap is either config-level (Bucket B) or registry-membership (Bucket C).
- ⚠️ **Bucket C > 30 → known-issues.md flag triggered** per brief's sanity gate. 35 venues writing non-registry venue_name reflects significant scraper hygiene gap.

## Inventory drift from brief

Brief authored with 54 venues / 101 events. Execution snapshot: 53 venues / 96 events. Drift of -1 venue / -5 events. Within brief's ±5 tolerance. Possible causes:
- Events expired between brief authoring and execution
- Daily geocoder pipeline (Phase 3j) backfilled some venues since brief authored

## Decision required (Phase 3 STOP gate)

The brief's "4-bucket distribution" assumed all buckets would have venues. Reality shows:
- Bucket A & D are empty
- Bucket B = entire GSC-recovery scope (18 venues / 41 events)
- Bucket C = entire registry-growth scope (35 venues / 60 events), NOT GSC-affecting

**Three viable scopes:**

1. **Narrow to GSC recovery (recommended):** Execute Bucket B only. 18 venues / 41 events. Achieves the brief's stated goal ("Recover events from rich-results blocked state"). Bucket C deferred to a separate session with Editorial input.

2. **Brief scope with Bucket C subdivided:** Execute Bucket B + a triaged subset of Bucket C (C-3 duplicates normalization + obvious C-1 rejections). Skip C-2 verification candidates (Editorial-gated).

3. **Full brief scope:** Execute B + C entirely. Adds 35 new canonicals to registry without Editorial verification. Risks adding non-Athens venues (Larisa, Corfu, etc.) to the Athens registry, which would require manual cleanup later.

Recommendation: Option 1. Bucket C handling belongs in a separate session because:
- It's a different problem class (registry growth, not address backfill)
- 12 venues need Editorial REJECT decisions (non-Athens cases)
- 13 venues need Editorial APPROVE decisions (verification candidates)
- 10 venues need duplicate-canonical normalization (analogous to Bucket A but on unregistered names)
- None of them block GSC recovery
