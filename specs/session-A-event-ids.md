# Session A Step 9 — Spot-check event IDs

Captured 2026-04-24 during Step 0 (pre-Pre-A). To be used in Session A Step 9
`bun run scripts/backfill-ticket-urls.ts --dry-run --verbose --event-id=<id>`
after Pre-A completes and the main dry-run produces a per-tier distribution.

## Lah Porella (Ilion Plus)

| id | title | venue | date |
|---|---|---|---|
| `c3c95858f608dc92` | Lah Porella | ΙΛΙΟΝ Plus | 2026-04-23 |

⚠️ **Past event as of 2026-04-24.** Tier 0 `isPastEvent` guard will return
`{status:'unresolved', tier:0}` before any cascade work. Still useful as a
negative test case (confirms the past-event guard fires correctly on an
exhibition-or-not check). For a live Ilion Plus test case, re-query for a
future event at that venue when Session A reaches Step 9.

Expected on individual trace: `status=unresolved, tier=0` (past-event guard).

## IT Athens (preferred: residentadvisor source for Tier 3b cross-ref test)

All 5 future events have `source='residentadvisor'` — ideal for Tier 3b validation.

| id | title | date |
|---|---|---|
| `4e8e40b299105a83` | Goa Generators | 2026-04-24T23:59 |
| `449a0f9757072042` | PULSE TRIBE PRSNTS: ZONA MUTANTE III with Medea | 2026-04-25T23:30 |
| `32281aa1c839aeee` | Underdogs Techno Extra date | 2026-04-30T23:59 |
| `b86b93cce378f895` | Psy Spring Gathering | 2026-05-01T23:59 |
| `c14a4057538fadbf` | Mark Van der Vlugt in Athens 2 May | 2026-05-02T23:59 |

**Primary test case: `4e8e40b299105a83` (Goa Generators, 2026-04-24).**

Expected ideal trace (after D5 adds ra.co / residentadvisor.net to the allowlist):
1. Tier 0 guards pass (future event)
2. Tier 1 hits **if** the RA-scraped event already has an allowlisted `ticket_url`
   (now possible because D5 promotes RA to a resolution source) → `status=direct @ 0.95`
3. Otherwise Tier 3b (Jaccard crossref against pre-loaded RA events) should
   self-match the event and return `status=crossref @ 0.7`
4. Falls through to Tier 3 (platform_search) or Tier 5 (venue_fallback) only
   if both above miss

If the trace shows `venue_fallback` at IT Athens, that's a signal either:
- D5 allowlist not yet applied in validator.ts
- `crossref` Jaccard threshold too strict
- `opts.crossrefEvents` not being passed by the backfill script

Secondary test cases (use if Goa Generators trace is ambiguous): the other four
events above, in date order.

---

## Post-Pre-A additions (2026-04-24, after migration 007)

### Tier 2 search-pattern test case (replaces stale Lah Porella)

Curated venues in `athens-venues.json` with future ticketed events after migration:

| venue | future_count | next_date |
|---|---|---|
| Half Note Jazz Club | 33 | 2026-04-24 |
| Onassis Stegi | 7 | 2026-04-24 |
| Ilion Plus | 0 | — (none post-migration either) |
| Megaron | 0 | — |

**Primary Tier 2 test case: `6d101ed8de24211c`** — Nίκος Ξυδάκης @ Half Note Jazz Club, 2026-04-24, source=athinorama.gr, ticket_url=https://www.athinorama.gr/music/gig/nikos_ksudakis-10089837/.

Why this one over the halfnote-sourced version (`28a5df39b3a575ca`)? The halfnote-sourced row already has `ticket_url=https://www.halfnote.gr/...` — if halfnote.gr is on the ticket host allowlist, Tier 1 would short-circuit and Tier 2 never fires. The athinorama-sourced version has an `athinorama.gr` ticket_url which is explicitly rejected as a self-link (per cascade Tier 1 logic), forcing the cascade to continue through Tier 2.

Expected trace: Tier 0 passes (future) → Tier 1 rejects athinorama self-link → Tier 2 picks up Half Note from venue_registry → if venue has `ticketing.search_pattern`, returns `venue_registry_search @ 0.6`; if `ticketing.url`, returns `venue_registry_direct @ 0.85`.

If the expected trace doesn't fire, first check: does `config/athens-venues.json` actually have Half Note with `ticketing.search_pattern` OR `ticketing.url`? If not, curation gap — this is an A.5 candidate.

### Tier 3b crossref test case (genuine find — stronger than Death Disco path)

**Primary Tier 3b test case: `eacc60d5a4c6cd1c`** — "SoundNow with Fjushа + Nivk Jane + Siasios + Vssls" @ Aux Club, 2026-04-24T23:45, source=clubber.gr, no ticket_url in row.

Matching RA event for Jaccard crossref: `db7591277f7c641e` — "Soundnow w\ FJUSHA @ AUX Club", 2026-04-24T23:59, source=residentadvisor. Same date, same venue, strong title overlap ("SoundNow"/"Soundnow", "Fjushа"/"FJUSHA").

Expected trace: Tier 0 passes → Tier 1 has no allowlisted URL → Tier 2 misses (Aux Club not in venue_registry) → Tier 3b Jaccard matches `db7591277f7c641e` from pre-loaded RA events → returns `crossref @ 0.7` with the RA URL.

If this returns `unresolved` or `venue_fallback` instead: most likely cause is Jaccard threshold too strict, or `opts.crossrefEvents` not being wired into the backfill call. Secondary possibility: the RA URL (`https://ra.co/events/...`) isn't on `getTicketHosts()` after D5's expansion — verify `ra.co` and `residentadvisor.net` are in the allowlist.

Backup Tier 3b candidate: `57614f9bc17228d2` — "422m pres. Hard Wave Events" @ Aux Club, 2026-04-30, source=clubber.gr. Matching RA event `a3b7eb8548af31ac` on 2026-05-02 (different date, same title). Good test of Jaccard-by-title-only when dates don't align.

### Venues with both RA and non-RA future events (full list for broader testing)

| venue | RA | non-RA |
|---|---|---|
| Temple | 3 | 5 |
| Universe | 1 | 6 |
| Aux Club | 4 | 3 |
| ΚΠΙΣΝ | 1 | 3 |
| IT Athens | 2 | 1 |
| ΙΛΙΟΝ Plus | 1 | 1 |
| Bios Ρομάντσο | 1 | 1 |

Post-Pre-A check on Ilion Plus: **1 future event now exists** after migration 007 surfaced rows that were previously filtered out as `price_type='paid'`. Worth re-querying in Session A Step 9 for a specific Ilion Plus ID if Tier 2 needs a second venue test case beyond Half Note.
