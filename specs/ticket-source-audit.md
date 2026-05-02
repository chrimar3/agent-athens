# Ticket source audit — Sprint 1 Session 2

Generated: 2026-04-30
Query scope: upcoming with-ticket events, verified_athens ∪ pass_through, ticket_url not null
Total events in scope: 265
Unique hosts: 12

## Host table (Christos classifies)

| Host | Count | Sample IDs | Class | Notes |
|---|---|---|---|---|
| more.com | 69 | ae70b988, 5be3bc43, 3b21fef0 | `<pending>` | https://www.more.com/gr-el/music/ |
| athinorama.gr | 68 | 754bb410, 34e0eb47, 5ade94cc | `<pending>` | https://www.athinorama.gr/music/gig/39o_diethnes_festibal_kitharas_athinon-10089805/ |
| megaron.gr | 29 | 3e5ea351, 458b9968, 937bbfea | `<pending>` | https://www.megaron.gr/calendar/ |
| ticketservices.gr | 27 | 58f3fcf7, 5033bf3e, 5ff7d3da | `<pending>` | https://www.ticketservices.gr/ |
| halfnote.gr | 20 | 09aded77, 6a8f82a7, bad318c4 | `<pending>` | https://www.halfnote.gr/en/calendar/ |
| ra.co | 18 | 53a80fa9, f1de75be, 004007ca | `<pending>` | https://ra.co/events/2314979 |
| viva.gr | 15 | 9454cac8, a47a1c7c, c6e08f27 | `<pending>` | https://www.viva.gr/gr-el/tickets/music/autechre/ |
| clubber.gr | 12 | ac10b217, 51bb73ca, 231d9833 | `<pending>` | https://www.clubber.gr/events/anne-all-night-long/ |
| onassis.org | 4 | 0573ab33, f92abefd, df0e8b9d | `<pending>` | https://www.onassis.org/el/whats-on/heart |
| tickets.in.gr | 1 | deep-pur | `<pending>` | https://tickets.in.gr/gr-el/tickets/music/deep-purple-live/ |
| productledhub.com | 1 | b8dfa50f | `<pending>` | https://productledhub.com/disrupt-ai-summit/ |
| athensseo.com | 1 | 751e2253 | `<pending>` | https://athensseo.com/ |

**Class column values (fill in):**
- `known_merchant` — has online checkout, sells tickets
- `listing_aggregator` — program/listing pages, no checkout
- `venue_direct_only` — venue site, buy path is mailto/box-office only
- `unclassified` — flag for re-audit

## Coverage

- Top 4 hosts (more.com, athinorama.gr, megaron.gr, ticketservices.gr) cover **193/265 events (73%)**.
- Top 8 hosts cover **258/265 events (97%)**.
- The 4 hosts with count ≤4 (onassis.org=4, tickets.in.gr=1, productledhub.com=1, athensseo.com=1) cover the remaining 7 events. Per Step 0b spec, count ≤2 may be marked `unclassified` without browser check — applies to the bottom 3.

## Round 2 candidates (post-S3 build, 2026-05-02)

Hosts surfaced by the `[offers.url] unclassified ticket source` warn during the S3 clean rebuild. Each represents events whose ticket URL host is not in `config/ticket-source-classification.json`.

| Host | Count | Status | Disposition |
|---|---|---|---|
| `tickets.in.gr` | 1 | Verified REDIRECTOR to more.com (WebFetch 2026-05-02 showed "Powered by more.com" + `__doPostBack` to more.com infrastructure) | Stays `unclassified` per S2 audit decision; Sprint 2 nightly URL resolver will auto-promote to more.com |
| `productledhub.com` | 1 | Tech conference (Disrupt AI Summit) — non-cultural event leaked into scope | Stays `unclassified`. Surface to Editorial Director: scraper-filter scope question, not a classifier issue |
| `athensseo.com` | 1 | Tech meetup — non-cultural event leaked into scope | Stays `unclassified`. Surface to Editorial Director (same as above) |
| `benaki.org` | 1 | **NEW post-S2.** Benaki Museum (major Athens cultural venue). DB ticket_url is `https://www.benaki.org` (homepage, not per-event URL). WebFetch returned 303 + "article not found" — couldn't confirm online checkout in <30 sec budget | **Stays unclassified pending manual verification.** Likely `venue_direct_only` (homepage as ticket_url is the canonical signature). Surface to Christos for closeout decision — Benaki recurs and warrants real classification |

## Decisions deferred to Sprint 1 closeout

1. **Benaki classification** — manual browser check needed. If they have an e-shop, classify `known_merchant`; if box-office only, `venue_direct_only`.
2. **Tech meetup scope leakage** — `productledhub.com` + `athensseo.com` are scraper-filter problems, not classifier problems. Editorial Director call.
3. **`hostToName` capitalization** — Strategist examples ("More.com", "Viva.gr") show first-segment-only capitalization; spec prose said "each dot-segment." Implementation matches examples. Confirm with Strategist; one-line fix if interpretation was wrong.

## Sprint 2 candidate

**`dist/` orphan sweep at build start.** S84 caught it via deleted events; S3 caught it via expired events (clean rebuild required to avoid stale-content errors). Solution per S84 pattern: diff DB pageable-event slugs against `dist/events/*` + `dist/en/events/*` at build start, remove orphans. ~30 min session. Blocks future strict-validator deployments unless deploy CI runs clean rebuild every time.
