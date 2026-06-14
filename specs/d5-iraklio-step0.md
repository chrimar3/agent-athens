# D5 Step 0 — Ηράκλειο bare-token + four-suburb coverage (S185, 2026-06-12)

Read-only DB + matcher diagnostic. No config edited before this report.

## (a) Four-suburb coverage (upcoming events, venue_name match)

| Suburb | Events | Venues | Status |
|---|---|---|---|
| Καλλιθέα | 2 | Δημ. Στάδιο Καλλιθέας ''Γρηγόρης Λαμπράκης'' (×1), Στάδιο Καλλιθέας "Γρηγόρης Λαμπράκης" (×1) — same venue, two quote-mark variants | unverified |
| Ηράκλειο (Αττικής) | 0 | — | — |
| Νίκαια | 0 | — | — |
| Νέα Ιωνία | 0 | — | — |

**Non-whitelisted venue list for Editorial:** Στάδιο Καλλιθέας «Γρηγόρης Λαμπράκης» (needs a canonical entry + both quote variants in `config/athens-venues.json`). That is the only live suburb venue. The other three suburbs have no upcoming events — their ambiguous tokens (absent from rejected-locations.json) remain hypothetical, no live landmine.

## (b) Disambiguation feasibility — schema

`PRAGMA table_info(events)` (63 columns): **no postal-code or region column exists.**
Address-bearing fields a matcher could key on:

- `venue_address` TEXT — checked by the blacklist matcher (`location-filter.ts` fieldsToCheck), but **empty (`''`/NULL) on all 8 Ηράκλειο events** (ticketservices doesn't populate it).
- `venue_neighborhood` TEXT, `venue_lat`/`venue_lng` REAL — exist but not blacklist inputs.

**Verdict:** Editorial's postal lever (141xx/142xx) is not real for the live corpus — the rule degrades to disambiguated venue-string entries + region token, exactly the Καφενείο Ο Σωκράτης Αμφισσα pattern.

## (c) Crete-backstop confirmation — PREMISE INVERTED

8 upcoming Crete-Ηράκλειο events, all `unverified` (not rejected), all `venue_address=''`, all source=ticketservices (summer-tour stops — Κότσιρας, Παπακωνσταντίνου, Ρόκκος, Σαμπάνης, Φασούλη, AKRA Festival; Crete identity confirmed via venues + tour context):

| Venue | n | In venues[]? |
|---|---|---|
| ΘΕΑΤΡΟ ΤΕΧΝΟΠΟΛΙΣ - ΗΡΑΚΛΕΙΟ | 5 | NO |
| ΕΛ.ΜΕ.ΠΑ. (πρώην ΤΕΙ) - ΗΡΑΚΛΕΙΟ | 2 | NO |
| ΚΗΠΟΘΕΑΤΡΟ ΜΑΝΟΣ ΧΑΤΖΙΔΑΚΙΣ - ΗΡΑΚΛΕΙΟ | 1 | NO |

Only existing Ηράκλειο venue entry: ΠΟΛΙΤΙΣΤΙΚΟ ΣΥΝΕΔΡΙΑΚΟ ΚΕΝΤΡΟ ΗΡΑΚΛΕΙΟΥ (matches none of the above — venue match is exact-string).

**Key matcher fact (dry-run proven, not inferred):** `normalize()` in `src/quality/location-filter.ts:127` is `toLowerCase().trim()` only — no accent folding. Greek uppercase carries no accents, so `ΗΡΑΚΛΕΙΟ`.toLowerCase() = `ηρακλειο` ≠ `ηράκλειο` = `Ηράκλειο`.toLowerCase(). Therefore:

1. **The bare token has never rejected the actual Crete events** (all-caps venue names + titles). Dry-run of `checkLocation` over all 8 real rows with the token in place → all `unverified`. The Κρήτη region token also can't fire (empty addresses, no Κρήτη in names).
2. **The token DOES reject accented mixed-case nominative "Ηράκλειο"** in any checked field — dry-run hypotheticals "Δημοτικό Θέατρο Ηράκλειο Αττικής", title "Φεστιβάλ στο Ηράκλειο Αττικής", description "Στο Ηράκλειο Αττικής" → all `rejected_non_athens`. That is precisely the form an Ηράκλειο-Αττικής event arrives in. (Genitive "Ηρακλείου" escapes the token — accent sits on ει — which is why the line-195 venue entry had to exist.)
3. **DB-wide blast radius of removal: zero.** No event in the entire DB (any date, any field) contains accented-nominative "Ηράκλειο" or "Heraklion". The token currently rejects nothing.

**Verdict:** the bare token is all landmine, no backstop. Crete-Ηράκλειο events have NO non-bare-token reject path today — and no bare-token path either; they survive as hidden `unverified` rows. Step 1's conditional branch applies: add disambiguated venue-string entries for the 3 active Crete venues (exact DB strings), THEN remove the bare city token. This upgrades Crete coverage from "hidden by accident" to "rejected by rule" while defusing the Attica landmine.
