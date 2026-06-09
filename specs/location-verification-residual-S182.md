# S182 — Location-Verification Residual + Method-1 Refutation

**Session:** S182 (stream label; NOT session-log #182) · **Type:** Implementation attempt → **refuted at Step 0** · **Date:** 2026-06-09
**Source premises:** `specs/enrichment-throughput-forensic-S181.md`
**Boundary honored:** read-only except this spec + notes appends. **No config change, no DB mutation, no verifier run, no test written** — because Step 0 found the target set empty (see headline). No per-venue Athens determination made.

> **Headline:** Method 1 (promote the *mechanical* subset — venues whose decoded/normalized `venue_name` matches an **already-whitelisted** entry, failing only on string form) has an **empty target set: 0 of 201 events / 0 of 105 venues**. None of the 201 unverified-upcoming venues match any existing `athens-venues.json` entry, even after `he.decode` + normalization. They are stranded because the venue is **absent from the whitelist entirely**, not because its string is malformed. Adding these venues is a venue-Athens **curation** decision (Editorial / Method 2) ± blacklist (Method 3) — outside this session's mechanical scope. **Routed to STOP per spike-before-batch + don't-implement-yet.**

---

## 1. Step 0 routing result (config-vs-code)

**Match mechanics** (`src/quality/location-filter.ts`):
- `findVenueConfig` (`:151`) matches `venue_name` against each venue's `canonical_name` **and** `variations[]` using `normalize()` = `.toLowerCase().trim()` only — **no entity decode, no accent fold** — plus length-guarded substring + 40%-overlap.
- The variant mechanism (`variations[]`) already exists and is read by the matcher; CLAUDE.md Tier-1 prescribes adding entity forms there. So *if* a mechanical subset existed, the fix would be the authorized config path.
- **Guard 6 (match sites):** the only automated promotion path is `filter-athens-only.ts → checkLocation → findVenueConfig`. Manual curation tools (`review-venues.ts:94`, `batch-venue-review.ts:216`, `auto-verify-venues.ts`) also read `variations[]`. A config `variations` addition is consumed by all — single shared source, no per-site normalizer.

**The split (computed with the REAL matcher + REAL `he.decode`, read-only):**

| class | venues | events |
|---|--:|--:|
| MECHANICAL (decoded form matches an existing whitelist entry) | **0** | **0** |
| RESIDUAL (no whitelist match even after decode/normalize) | **105** | **201** |

Harness validated: `findVenueConfig('Μέγαρο Μουσικής Αθηνών')` and its variation `'Μέγαρο Μουσικής'` both resolve correctly; the 201 all resolve to `null` (raw and decoded). Direct config grep confirms Herodion / Δόρα Στράτου / Θέατρο Βράχων / Πειραιώς 260 / Βεάκειο / Θέατρο Πέτρας are **absent** from `athens-venues.json` under any string. No canonical entry absorbs >1 distinct raw venue (no collapse risk — moot, since 0 matches).

**Why the brief's premise was mistaken:** `findVenueConfig` *already* does normalized substring matching, so a venue sitting in `unverified` means *nothing* in the whitelist matches it even loosely. The brief's own cited examples are all residual: neither `Κατράκειο` nor `Κατράκειο Θέατρο` is whitelisted; the `Θέατρο Βράχων` pair shares no whitelisted base. The messy entity/variant strings (real, noted in S181) are not the blocker — even a pristine `Θέατρο «Δόρα Στράτου»` matches nothing.

---

## 2. Two mechanical DEFECTS surfaced (code-path → planner decision, NOT fixed here)

Per Step-0 routing: a fix requiring **new normalization code** is an architecture decision (decisions.md-class), not this session's. Both are reported with proposed shape; neither implemented.

**D1 — `normalize()` is accent-blind → other-city ALL-CAPS venues escape the blacklist.**
`Ηράκλειο` IS in `rejected-locations.json`, yet `ΘΕΑΤΡΟ ΤΕΧΝΟΠΟΛΙΣ - ΗΡΑΚΛΕΙΟ` is `unverified`, not `rejected_non_athens`. Cause: `normalize('ΗΡΑΚΛΕΙΟ')='ηρακλειο'` (no accent) ≠ blacklist `normalize('Ηράκλειο')='ηράκλειο'` (accented). The `containsAny` blacklist scan never fires. **≥9 venues / 14 events** demonstrably escape this way (floor — Latin "HERAKLEION", "Παγκρήτιο", "ΜΥΤΙΛΗΝΗΣ", "ΒΟΛΟΥ", "ΠΡΕΒΕΖΑΣ", "ΛΕΥΚΑΔΑΣ", "ΑΡΓΟΥΣ" are also non-Athens but not in the 24-city token list or not accent-matched). Proposed shape: accent-fold inside `normalize()` (`NFD` → strip `̀-ͯ` → `NFC`) so both whitelist and blacklist fold consistently. **Caveat:** this is shared by every match site (Guard 6) — moving it is a one-knob-many-consumers change, and it only *rejects* other-city noise; it promotes zero Athens events.

**D2 — stale entity rows not cleared by decode-at-scrape.**
`decodeEventFields` (`he.decode`) runs at `src/db/database.ts` upsert since S154, and its header deprecates whitelist entity-variations as an "obsolete workaround." Yet **5 venues / 16 events** still carry raw entities (`Θέατρο &#171;Δόρα Στράτου&#187;` etc.) — pre-S154 rows or not re-scraped since. They self-heal only on re-scrape. Do NOT re-introduce entity variations to the whitelist (against the decode-at-scrape direction). Durable answer is upstream (re-scrape / one-time decode migration) — flagged 🟡, not chased.

---

## 3. Residual hand-off → Editorial (NO Athens judgment made)

All **201 events / 105 venues** are residual. The reframed answer to S181's open question — *stranded backlog vs correctly-excluded noise* — is **substantially BOTH, skewed toward other-city noise**: a large fraction are touring venues in Crete / Thessaloniki / Larisa / Patras / Volos / Preveza / Lefkada / Argos / Rethymno / Corfu, sitting in `unverified` (not `rejected`) because of D1. The genuinely-Athens stranded venues (Herodion, Δόρα Στράτου, Θέατρο Βράχων, Ζάππειο, Πεδίον του Άρεως, Βοτανικός Κήπος Διομήδους, Ρωμαϊκή Αγορά, Δημοτική Αγορά Κυψέλης) are a **minority**. Editorial decides whitelist / blacklist / leave per venue.

Objective pre-triage signals (overlapping tags, not a partition):
- **A) Carries a rejected-city/region token (accent-folded):** 9 venues / 14 events → likely blacklist (Method 3). *Floor, not exhaustive.*
- **B) Undecoded HTML entities:** 5 venues / 16 events → if whitelisted, use the DECODED canonical (see D2).
- **C) Internal duplicate clusters (same venue, ≥2 spellings):** 8 clusters → consolidate into one canonical + `variations[]` when whitelisting.

### Full residual list (sorted by event count)

`city-token` = matches a `rejected-locations.json` entry (accent-folded); `entity` = carries undecoded HTML entities; `#N` = internal-duplicate cluster id.

| events | venue_name | city-token | entity | dup |
|--:|---|---|:-:|:-:|
| 9 | Πειραιώς 260 |  |  | #1 |
| 9 | Ηρώδειο |  |  |  |
| 8 | Θέατρο Βράχων Μελίνα Μερκούρη |  |  |  |
| 7 | Θέατρο &#171;Δόρα Στράτου&#187; |  | Y |  |
| 6 | Λαμπέτη - Ταράτσα |  |  | #4 |
| 6 | Θέατρο Βράχων &#171;Μελίνα Μερκούρη&#187; |  | Y | #5 |
| 5 | ΘΕΑΤΡΟ ΤΕΧΝΟΠΟΛΙΣ - ΗΡΑΚΛΕΙΟ | Ηράκλειο |  |  |
| 5 | ΔΗΜΟΤΙΚΟ ΚΗΠΟΘΕΑΤΡΟ ΠΑΠΑΓΟΥ |  |  |  |
| 5 | Βεάκειο |  |  | #2 |
| 5 | Manko Athens |  |  |  |
| 4 | Κατράκειο Θέατρο |  |  | #3 |
| 4 | Κατράκειο |  |  | #3 |
| 4 | Θέατρο Πέτρας |  |  |  |
| 4 | Βεάκειο Θέατρο, Πειραιάς |  |  | #2 |
| 4 | Cultural Space «Ergostasio» - Samothraki |  |  |  |
| 3 | ΦΡΟΥΡΙΟ ΦΟΡΤΕΤΖΑ - ΡΕΘΥΜΝΟ |  |  |  |
| 3 | Παραλία Φαναρίου Ροδόπης |  |  |  |
| 3 | Θέατρο Γης |  |  |  |
| 3 | Βοτανικός Κήπος Διομήδους |  |  |  |
| 3 | Αμφιθέατρο Ζαππείου |  |  |  |
| 3 | Vrachon Theater |  |  |  |
| 2 | Μονή Λαζαριστών |  |  |  |
| 2 | Κέντρο Πολιτισμού του ΙΜΕ Ελληνικός Κόσμος - Αίθριο |  |  |  |
| 2 | Θέατρο Λαμπέτη - Ταράτσα |  |  | #4 |
| 2 | Θέατρο Δόρας Στράτου |  |  |  |
| 2 | Θέατρο ΔΕΛΦΙΝΑΡΙΟ |  |  |  |
| 2 | ΕΛ.ΜΕ.ΠΑ. (πρώην ΤΕΙ) - ΗΡΑΚΛΕΙΟ | Ηράκλειο |  |  |
| 2 | VRACHON THEATRE - MELINA MERKOURI |  |  |  |
| 2 | VEAKEIO THEATER - PIRAEUS |  |  | #6 |
| 2 | ProjectR |  |  |  |
| 2 | Panormix |  |  |  |
| 2 | Moxy Athens City |  |  |  |
| 2 | KIPOTHEATRO «NIKOS KAZANTZAKIS» - HERAKLEION |  |  |  |
| 2 | City Garden Festival |  |  |  |
| 2 | Ace Hotel & Swim Club Athens |  |  |  |
| 1 | Χώρος Τέχνης Ιδιόμελο |  |  |  |
| 1 | Στάδιο Καλλιθέας &quot;Γρηγόρης Λαμπράκης&quot; |  | Y |  |
| 1 | ΣΚΕΠΑΣΤΗ ΑΓΟΡΑ ΦΑΡΣΑΛΩΝ |  |  |  |
| 1 | Ρωμαϊκή Αγορά |  |  |  |
| 1 | Πολιτιστικό και Αθλητικό Πάρκο Νέας Μάκρης |  |  |  |
| 1 | Πειραιώς 260 - Χώρος Δ΄ |  |  | #1 |
| 1 | Πεδίον του Άρεως |  |  |  |
| 1 | Παλαιό Πανεπιστήμιο |  |  |  |
| 1 | Παγκρήτιο Στάδιο |  |  |  |
| 1 | ΠΑΡΑΛΙΑ EOT (ΠΛΗΣΙΟΝ CAMPING) - ΑΛΕΞΑΝΔΡΟΥΠΟΛΗ | Αλεξανδρούπολη |  |  |
| 1 | ΠΑΛΑΙΟ ΦΡΟΥΡΙΟ ΚΕΡΚΥΡΑΣ | Κέρκυρα |  |  |
| 1 | Μικρό Παλαιό Χρηματιστήριο Αθηνών |  |  |  |
| 1 | Κορύβαντες |  |  |  |
| 1 | Κλακάζ |  |  |  |
| 1 | Κατασκήνωση Παραμυθιάς - Δήμος Σουλίου |  |  |  |
| 1 | Κέντρο Βυζαντινών Τεχνών Ρεθύμνου |  |  |  |
| 1 | ΚΗΠΟΘΕΑΤΡΟ ΜΑΝΟΣ ΧΑΤΖΙΔΑΚΙΣ - ΗΡΑΚΛΕΙΟ | Ηράκλειο |  |  |
| 1 | ΚΗΠΟΘΕΑΤΡΟ ΑΛΚΑΖΑΡ - ΛΑΡΙΣΑ | Λάρισα |  |  |
| 1 | ΚΑΤΡΑΚΕΙΟ ΘΕΑΤΡΟ ΝΙΚΑΙΑΣ |  |  | #3 |
| 1 | Ιωνικό Κέντρο |  |  |  |
| 1 | Θερινό Θέατρο Σκιών Παναγιώτη Χατζηαναγνώστου |  |  |  |
| 1 | Θέατρο Οδού Κυκλάδων &#171;Λευτέρης Βογιατζής&#187; |  | Y |  |
| 1 | Θέατρο Δάσους |  |  |  |
| 1 | Θέατρο Ανατολικής Τάφρου |  |  |  |
| 1 | Θέατρο ΑΛΣΟΣ |  |  |  |
| 1 | Θέατρο 2510 |  |  |  |
| 1 | ΘΕΡΙΝΟ ΔΗΜΟΤΙΚΟ ΘΕΑΤΡΟ ΒΟΛΟΥ |  |  |  |
| 1 | ΘΕΑΤΡΟ ΚΑΣΤΡΟΥ ΜΥΤΙΛΗΝΗΣ |  |  |  |
| 1 | Ευριπίδειο Θέατρο Ρεματιάς |  |  |  |
| 1 | Επταπύργιο |  |  |  |
| 1 | Εκστάν |  |  |  |
| 1 | Δημοτικό Κηποθέατρο Αγρινίου |  |  |  |
| 1 | Δημοτική Αγορά Κυψέλης |  |  |  |
| 1 | Δημ. Στάδιο Καλλιθέας ‘’Γρηγόρης Λαμπράκης'' |  |  |  |
| 1 | ΔΗΜΟΤΙΚΟ ΣΤΑΔΙΟ ΠΡΕΒΕΖΑΣ |  |  |  |
| 1 | ΔΗΜΟΤΙΚΟ ΣΤΑΔΙΟ ΛΕΥΚΑΔΑΣ |  |  |  |
| 1 | ΔΗΜΟΤΙΚΟ ΓΗΠΕΔΟ - ΛΕΩΝΙΔΙΟ ΑΡΚΑΔΙΑΣ |  |  |  |
| 1 | ΔΗΜΟΤΙΚΟ ΑΘΛΗΤΙΚΟ ΚΕΝΤΡΟ ΤΡΙΠΟΛΗΣ | Τρίπολη |  |  |
| 1 | Γερμανική Ευαγγελική Εκκλησία Αθηνών |  |  |  |
| 1 | Βράχων &#171;Μελίνα Μερκούρη&#187; |  | Y | #5 |
| 1 | Βασιλικό Θέατρο |  |  |  |
| 1 | Βάρκιζα |  |  |  |
| 1 | Αμφιθέατρο Θαν.Βέγγος |  |  |  |
| 1 | Αλεξάνδρα |  |  |  |
| 1 | Αλέα |  |  |  |
| 1 | Αθηνά Live |  |  | #7 |
| 1 | Αθηνά |  |  | #7 |
| 1 | Αίθριο Στοά Culture |  |  |  |
| 1 | Αίγλη 3D Digital |  |  |  |
| 1 | ΑΡΧΑΙΟ ΘΕΑΤΡΟ ΑΡΓΟΥΣ |  |  |  |
| 1 | ΑΚΟΝΤΙΣΜΑ |  |  |  |
| 1 | ΑΙΘΡΙΟ ΚΕΝΤΡΟ ΠΟΛΙΤΙΣΜΟΥ ΕΛΛΗΝΙΚΟΣ ΚΟΣΜΟΣ |  |  |  |
| 1 | VEAKEIO THEATER - PIRAEUS\|ΑΝΟΙΧΤΟ ΘΕΑΤΡΟ ΚΑΛΑΜΑΤΑΣ | Καλαμάτα |  | #6 |
| 1 | Treno sto Rouf - Rouf Railway Station |  |  |  |
| 1 | Terra Vibe Park |  |  | #8 |
| 1 | Tae Kwon Do, Mad VΜΑ |  |  |  |
| 1 | Skyfall Athens Bar -Restaurant |  |  |  |
| 1 | ROYAL THEATER - ΠΑΤΡΑ\|VEAKEIO THEATER - PIRAEUS\|… (5-venue pipe concat) | Θεσσαλονίκη |  | #6 |
| 1 | REVMA |  |  |  |
| 1 | Plex |  |  |  |
| 1 | Petra Theater |  |  |  |
| 1 | Meleagris Farm |  |  |  |
| 1 | MARATHON VILLAGE |  |  |  |
| 1 | Lost Roots_Wine bar |  |  |  |
| 1 | Helmos Festival |  |  |  |
| 1 | Grande Bounty |  |  |  |
| 1 | Bad Tooth |  |  |  |
| 1 | Aura Rooftop |  |  |  |
| 1 | ARK |  |  | #8 |
| 1 | ANIMA CLUB - ΑΝΑΒΥΣΣΟΣ |  |  |  |

*(Raw evidence: `temp-research/s182-unverified-venues.tsv`, `s182-split-analysis.ts`, `s182-residual-segment.ts` — gitignored scratch.)*

---

## 4. What this session did / did not change
- **Changed:** nothing in `config/`, `src/`, `scripts/`, `data/events.db`. No test added. No verifier run.
- **Wrote:** this spec + appends to `.claude/notes/{mistakes,patterns,decisions}.md`.
- **Open for planner:** (i) D1 accent-fold normalizer — code-path, also a Method-3 hygiene win; (ii) D2 stale-entity re-decode — upstream; (iii) the Editorial whitelist/blacklist pass over the 105 (Method 2/3). Session-log entry NOT added (the "S182" stream label collides with session-log #182 already used for an unrelated brief — numbering is the planner's call).
