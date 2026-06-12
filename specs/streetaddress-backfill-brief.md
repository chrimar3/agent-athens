# Brief: streetAddress backfill — unfreeze daily deploy

**Status:** Approved, scope-exact (node-trace confirmed S104 / Session 183, 2026-06-09).
**Stream:** Minor — data integrity / freshness.
**Priority:** URGENT. Pure execution, no decision. Independent of the colophon and of the
Stage-1 invariant decision (GEO's, routed separately). Production is frozen at the
2026-06-08 deploy; every day frozen is lost freshness.

## Why

The daily deploy has been halting since 2026-06-08 on the detail-page location hard-stop
(`generate-site.ts:1312`) — the gate working as designed (drift venue → blocked deploy).
The trip is caused by live events at venues whose `address` is empty, so the emitted
`location.address.streetAddress` is `""` (a FAIL-tier mandatory gap per
`schema-validator.ts` 2.2 + `schema-completeness.ts:397`/`:857`).

Emission path (confirmed): `src/utils/schema-graph-builders.ts:63` —
`streetAddress: event.venue.address || findVenueConfig(event.venue.name)?.address || ''`.
Filling the venue's `address` in `config/athens-venues.json` closes the fail. `address` is
a **free-text string**, e.g. `"Vassilissis Sofias Avenue & Kokkali 1, Athens 115 21"`.

## Authoritative scope (native FAIL node-trace — NOT the reporter buckets)

10 native FAIL nodes (`failCount`), all `streetAddress is missing or empty`, collapse to
**5 venues**. The reporter's `hubs.fail` drifted 2↔4 across two reads of the same artifact;
the native node-trace is the only scope authority and held steady at 6 detail + 4 hub.

| Node | type | → venue |
|---|---|---|
| `events/0833f79a--` | detail (MusicEvent) | Δημοτικό Κηποθέατρο Παπάγου |
| `events/962fa184--` | detail (TheaterEvent) | Δημοτικό Κηποθέατρο Παπάγου |
| `events/f9024bdd--` | detail (MusicEvent) | Άλσος |
| `events/d7a0c42d--48-171` | detail (TheaterEvent) | Από Μηχανής Θέατρο |
| `events/e143b038--2` | detail (TheaterEvent) | Θέατρο Μικρό Χορν |
| `events/42519a99--release-athens-2026-30` | detail (MusicEvent) | Πλατεία Νερού |
| `hub:this-weekend` [14] + `hub:en/this-weekend` [14] | hub ItemList | Από Μηχανής Θέατρο (in-set) |
| `hub:theatre` [23] + `hub:en/theatre` [23] | hub ItemList | Από Μηχανής Θέατρο (in-set) |

The 4 hub nodes re-surface detail events already in the set → **no venue expansion**.
Backfilling the 5 venues clears all 10 nodes (the 6 gating detail fails AND the 4 ungated
hub fails).

## The 5 backfill targets

All 5 exist in `config/athens-venues.json` and lack the `address` field. All events upcoming
as of 2026-06-09.

| canonical_name | neighborhood (config, authoritative) | note |
|---|---|---|
| Δημοτικό Κηποθέατρο Παπάγου | Papagou | open-air municipal garden theatre; 2 events |
| Άλσος | Pedion Areos | the open-air stage in Pedion tou Areos — config neighborhood disambiguates which "Άλσος" |
| Από Μηχανής Θέατρο | Metaxourgeio | also the source of all 4 hub-node fails |
| Θέατρο Μικρό Χορν | Central Athens | |
| Πλατεία Νερού | Faliro | |

## Action

Add an `address` string field to each of these 5 entries in `config/athens-venues.json`,
matching the existing free-text format (`"<street + number>, Athens <postcode>"`).

### HARD CONSTRAINT — no fabricated addresses (Tier-1)
All 5 have `website: null`, so there is no one-click source. Each address must be **verified
against 2 authoritative sources** (official venue/municipality page + OpenStreetMap or Google
Maps cross-check). These are well-known venues, so verification is fast — but it must be
*verified*, not asserted from memory. This brief deliberately supplies **no candidate
addresses**: a remembered address that gets rubber-stamped is the fabrication failure mode.
Confirm `Άλσος` is the Pedion Areos venue (config says so) before pulling its address.

## Verify (the whole point)

1. `bun run src/generate-site.ts` — build must now pass the location hard-stop (no
   "event-detail page(s) missing required location" throw) and run to completion.
2. Re-run the validator against `dist/` and read **native `failCount`**: 10 → **0**. If any
   residual remains, a 6th venue surfaced — STOP and report, do not force.
3. Daily deploy resumes (a fresh `deploy-success` lands in `logs/deploy-cadence.log`).

## Scope boundary

ONLY the `address` field on these 5 venue entries. Do **NOT**: touch the other ~231
address-less venues (dormant — no live pageable events, not failing; out of scope); touch the
location hard-stop or any invariant (Stage-1 is GEO's separate decision, authored only after
this verifies clean); touch the colophon (downstream of Stage-1). No `git add -A`. Single
commit, `config/athens-venues.json` only.

## Watch (not this brief's job)

This is the bleed-stop, not the cure. The class is **236/346 venues** with no `address` —
new events landing at any of those will re-freeze the deploy. That recurrence is the case for
Stage-1 (all-class `failCount == 0` invariant) + a broader address-completeness push. Logged
in `decisions.md` S104 sequencing; do not pull it into this brief.
