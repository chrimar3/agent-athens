# D6-pilot Step 0 — Recon gate result (S190)

Date: 2026-06-14 · Arc: GEO/schema geo-ancestry · Brief: S190 D6-pilot (Βεάκειο/Kastella)

## Verdict: GATE FAILED (0c) → geodata write blocked → routed to **D8**

The neighborhood-geodata schema **structurally cannot represent a non-Athens (Piraeus)
ancestry chain**. Per the brief's own failure-handling and the operator's routing decision
(Option 1), **Step 1 (Βεάκειο whitelist) and Step 2 (Kastella geodata) are held as D8** and
routed to GEO as a schema design question. Only **Step 0.5 (Καλλιθέα decoded variation)**
shipped this session.

## 0c — Schema hardcodes the Athens municipality hop (binding finding)

`src/utils/schema-geo.ts:77-92`, `buildContainedInPlace()`:

```ts
const athens = buildPlaceLevel(municipality.name, municipality.qid, municipality.lat, municipality.lng, attica); // line 83 — Q1524, ALWAYS
if (!neighborhood) return athens;
const key = resolveNeighborhoodKey(neighborhood);
if (!key) return athens;                       // line 88 — unknown neighborhood ALSO falls back to Q1524
const data = neighborhoodGeodata[key];
return buildPlaceLevel(data.name, data.qid, data.lat, data.lng, athens); // neighborhood parents to athens
```

- `config/neighborhood-geodata.json` keys store ONLY `{name, qid, lat, lng}` — **no per-key
  ancestry chain**. The municipality hop is computed in code (line 83), identical for every key.
- Emitted chain is always `Neighborhood → Q1524 (Municipality of Athens) → Q758056 (Attica)
  → Q41 (Greece)`.
- Consequence: a Kastella key would emit `Kastella → Q1524 (Athens) → …` — a false
  Piraeus-as-Athens claim (the S172–S180 failure class). And whitelisting Βεάκειο without a
  key falls back to the same `Q1524` chain (line 88) — stranding ≠ clean omission.

## 0b — Attica node QID (single source of truth, for D7 record)

`config/city-geodata.json`: region = **`Q758056`** (Attica), municipality = **`Q1524`**
(Municipality of Athens), country = `Q41` (Greece). The Attica node lives at the **city tier**,
not per-key in neighborhood-geodata.json.

## 0a — Candidate QID confirmation (via `fetchEntity`, live Wikidata; label + P31 only)

| QID | Label(s) | P31 (instance of) | elwiki sitelink | Verdict |
|-----|----------|-------------------|-----------------|---------|
| Q12878825 | Kastélla / Καστέλλα | Q123705 (neighborhood) | Καστέλλα (Πειραιάς) | ✓ Kastella |
| Q12875755 | Piraeus Municipality / Δήμος Πειραιά | Q1349648, Q15284 (municipality) | Δήμος Πειραιά | ✓ Piraeus Municipality |
| Q1784863 | Piraeus Regional Unit / Περιφερειακή Ενότητα Πειραιώς | Q1234255 (regional unit of GR) | Περιφερειακή Ενότητα Πειραιώς | ✓ Piraeus Regional Unit |

**Limitation:** `fetchEntity` (scripts/lib/performer-qid-resolver.ts) exposes label + P31 +
sitelinks but **not P131** — the "located in" ancestry hops (Kastella→Piraeus Municipality,
Piraeus RU→Attica) remain unconfirmed by this helper. There is **no geodata-specific QID
resolver** in the project; only the performer resolver. For D8, P131 needs a direct
`Special:EntityData` fetch or a geodata resolver.

## Corrected brief premises (vs. actual repo)

- Athens hop to avoid is **`Q1524`** (Municipality of Athens), NOT the brief's assumed
  `Q1224979` / `Q5765570` — neither appears anywhere in the codebase.
- Attica node = **`Q758056`**, in `config/city-geodata.json` (not per-key).
- No geodata SPARQL/QID resolver exists (brief assumed one).

## Pre-existing failure-class instance (flag to GEO)

24 venues in `config/athens-venues.json` already carry `neighborhood: "Piraeus"`.
`resolveNeighborhoodKey("Piraeus")` returns null → they already emit the false
`Q1524 (Athens) → Attica → Greece` chain today. The failure class this arc fights is already
present at scale; the D8 schema fix should sweep these too.

## D8 design question (routed to GEO)

To represent Piraeus (or any non-Athens) ancestry honestly, the schema needs **per-key
municipality ancestry** — e.g. an optional `municipalityQid`/parent-chain on each
neighborhood key (or a small parent-resolver), so `buildContainedInPlace` stops hardcoding
`Q1524`. Granularity ruling preserved: the terminal geodata key is **Kastella** (neighborhood
tier), with Piraeus entering only as ancestry. Candidate chain for when D8 lands:
`Kastella (Q12878825) → Piraeus Municipality (Q12875755) → Piraeus Regional Unit (Q1784863)
→ Attica (Q758056) → Greece (Q41)`, centroid 37.93949 / 23.65597.

## Step 0.5 shipped (independent of D6)

`config/athens-venues.json` Καλλιθέα entry: ran the scraper's decode path
(`decodeEventFields`) over the existing variations. Only the `&quot;` form changed
(`he.decode` is a no-op on guillemets and curly/straight quotes), so exactly one decoded
variation was added: `Στάδιο Καλλιθέας "Γρηγόρης Λαμπράκης"`. Live `checkLocation` dry-run:
both current DB rows + the new decoded form → `verified_athens`. (DB stored `unverified` was a
stale snapshot; the live matcher verifies them against the current whitelist.)
