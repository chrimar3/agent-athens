# S172 — streetAddress Backfill: Diagnostic Record & Checkpoints

**Date:** 2026-06-05 (diagnostic run 2026-06-04 evening)
**Brief premise:** ~311 missing-streetAddress schema fails; classify A (venue absent from config) / B (present, address empty) / C (address present but not threaded).

## Classification result: 40/40 Class B

Every failing venue is **present** in `config/athens-venues.json` (exact canonical-name match via `findVenueConfig`) with an **empty/missing `address` field**. Zero Class A, zero Class C. Step 2b (cascade-mirror code fix) is dead — pure data session.

Method note: the brief's jq paths were phantom (`build-completeness.json` holds no per-event `.fails`; totals live at `.events.totals`). Classification reproduced from dist JSON-LD (`"streetAddress": ""` scan) + live `findVenueConfig` import.

### Failing venues by page count (GR pages, 269 total + 41 EN mirrors = 310)

| Pages | Venue | Class |
|---|---|---|
| 22 | ΚΠΙΣΝ | B |
| 18 | Μικρός Κεραμεικός | B |
| 11 | Studio Κυψέλης | B |
| 11 | 104 | B |
| 10 | Αλκμήνη | B |
| 10 | Άνεσις | B |
| 9 | Δημοτικό Θέατρο Πειραιά | B |
| 9 | Θέατρο Καλλιρρόης | B |
| 8 | Λοσάντζελε | B |
| 7 | Θέατρο Ψυρρή | B |
| 6 | Θέατρο Άβατον, Ροές, ARCH Club | B |
| 5 | Άττις, Θέατρο Τζένη Καρέζη, Αργώ, Επί Κολωνώ, Gazarte, Πορεία at Victoria, HOOD art space, Αλίκη, Σκηνή Μπέκετ | B |
| 4 | Τεχνόπολη, Νέος Ακάδημος, Theatre Of The No, Studio Μαυρομιχάλη, Σπίτι Art Bar, Οίκος Ερμηνείας Ελευθερία, Θέατρο Μεταξουργείο | B |
| 3 | Θέατρο ΕΛΕΡ, Θέατρο Μαβίλη, Δημοτικό Θέατρο Λυκαβηττού, Χώρα, Σταθμός Θέατρο | B |
| 2 | Θέατρο του Νέου Κόσμου, Εθνικό Θέατρο, Παραμυθίας, Cartel Τεχνοχώρος, opbo studio, Τεχνοχώρος Εργοτάξιον | B |

All 269 GR pages are within the 45-day `pageableEvents` regeneration window (`src/generate-site.ts:222-224`) → config backfill clears 100% on rebuild; zero stale-dist residual.

## New defect found: the location hard-stop is toothless

`src/generate-site.ts` final line is `main().catch(console.error)` — the 2.1′ "Build halted" throw is caught, logged, and the process **exits 0**. The production wrapper (`scripts/daily-automated.sh:440`) checks the exit code correctly but never sees a failure: the 2026-06-04 pipeline log shows `error: Build halted: 311 …` at line 4913 followed by `Site generation completed` and deploy `state=ready`.

**Consequences:**
- There is **no dual-build-path divergence** on this issue. Both paths fail identically (310 dev vs 311 prod = DB drift between runs); both exit 0. The "divergence" that burned S166 and the 2026-06-04 audits was this exit-code bug masquerading as divergent cascades.
- Production has deployed through the hard-stop since 2.1′ shipped.

**Fix (this session, gated):** `main().catch((e) => { console.error(e); process.exit(1); })` — committed separately, **only if** post-build residual reads 0 via `jq '.events.totals.fail' data/build-completeness.json`. If any venue is conservative-skipped → residual > 0 → exit fix is checkpointed here instead (shipping it with a residual would block the next daily deploy).

## Address verification log

**62 addresses added** (config: 37 → 99 venues with address):

**Wave 1 — the 40 classified venues** (4 parallel web-research agents; per-venue source URLs in `/tmp/s172-addresses-batch{1..4}.json`, summarized):
- 36 web-verified high/medium confidence from venue's own site or authoritative listing (athinorama.gr, viva, official municipal/foundation pages). Representative: ΚΠΙΣΝ → Leoforos Andrea Syngrou 364, Kallithea 176 74; Εθνικό Θέατρο → Agiou Konstantinou 22-24, Athens 104 37 (main building per n-t.gr); Τεχνόπολη → Pireos 100, Athens 118 54; Gazarte → Voutadon 32-34 (gazarte.gr).
- 2 initially agent-skipped, then **DB-resolved**: HOOD art space → Polykleitou 21, Athens 105 52 and Τεχνοχώρος Εργοτάξιον → Diogenous 1, Agios Dimitrios 172 37 — both confirmed by `venue_address` agreement across two independent scraped sources (athinorama.gr + more.com) on rows for events at those exact venues. DB-as-verifier ties the address to the venue actually hosting our events.
- Δημοτικό Θέατρο Λυκαβηττού → "Lofos Lykavittou (Lycabettus Hill), Athens 114 71" — open-air hill venue, no street number exists; medium confidence, canonical form per cultureisathens.gr.

**Wave 2 — drift continuation (operator-approved "clean-24 only")**: rebuild after Wave 1 revealed 33 NEW failing venues from ~1 day of scrape drift (all Class B, all with DB `venue_address` values). 22 had clean, well-formed addresses (street + number + postal, athinorama/more.com agreement) → applied verbatim from DB. 11 had mangled/truncated/conflicting DB values → skipped (below).

### Skips (11 venues, ≈14 failing pages — the documented residual)

| Venue | DB value | Problem |
|---|---|---|
| Εν Αθήναις | "Εν Αθήναις, 19" | venue name leaked into address, street missing |
| Κιβωτός | "New Ark, 18" | translated name + bare number |
| ΦΙΑΤ | "Falirou 97" vs "Syngrou 114" | two conflicting addresses across sources |
| Εκάτη | "Εκάτη, Θεσσαλονίκης" | name + bare street, no number (Thessalonikis St?) |
| Σύγχρονο Θέατρο | "Σύγχρονο Θέατρο, 45" | name + bare number |
| Θέατρο Κνωσός | "Θέατρο Κνωσός, Κνωσού" | name + street, no number |
| Στοά | "Στοά, Περίπατος Ακρόπολης" | likely event-location (Acropolis walk), not the Zografou theater — venue mismatch risk |
| Θέατρο Τέχνης | "Θέατρο Τέχνης \"Κάρολος Κουν\", 14" | which stage? (Plaka/Frynichou vs Pesmazoglou) — ambiguous |
| Γερμανική Εκκλησία Αθηνών | "Ευαγγελική Γερμανική Εκκλησία, 66" | name + bare number |
| ΘΕΑΤΡΟ RADAR | "Πλατεία Αγίου Ιωάννου και, Pitheou 93" | mangled order, no postal |
| Θέατρο Βασιλάκου | "Θέατρο Κατερίνα Βασιλάκου, 3" | name + bare number |

These need a small web-research round (one agent batch) — all are findable; conservative-skip applied per wrong>empty.

### Wrong config neighborhood anchors discovered (Editorial flag, NOT changed this session)

| Venue | Config says | Verified |
|---|---|---|
| Λοσάντζελε | Exarchia | Neos Kosmos/Koukaki (Koryzi 4-6, 117 43) |
| HOOD art space | Metaxourgeio | Psyrri (Polykleitou 21, 105 52) |
| Τεχνοχώρος Εργοτάξιον | Gazi | Agios Dimitrios (Diogenous 1, 172 37) |
| Theatre Of The No | Psyrri | Metaxourgeio/Plateia Vathis (Konstantinou Paleologou 3, 104 38) |

## Outcome

- Fails: **311 → 14** (totals at HEAD's morning build already reflected Wave 1 via working tree: 311→53; Wave 2 → 14). `warn` 28→381 is the **unmasking effect** — pages leaving the fail bucket surface their warn-severity findings; not a regression.
- **Exit-code fix CHECKPOINTED, not shipped** — the gate read `jq '.events.totals.fail'` = 14 ≠ 0. Shipping `process.exit(1)` now would block the next daily deploy on the residual. Re-gate after the 11-venue research round reaches 0.
- **Drift-rate finding (for Planner):** one day of scraping introduced 33 new address-less-at-event-level venues. Once the exit fix ships, each such venue blocks the daily deploy. The **scrape-time missing-address guard** is therefore a prerequisite-or-companion for arming the hard-stop — recommend it as its own brief rather than riding Pattern G.
- **Process note:** the 06-05 05:24 production build picked up this session's *uncommitted* config backfill from the working tree (chore commit `9c342a257` shows fail=53). Working-tree state feeds production builds — uncommitted WIP is live the next morning.
- **Test verification:** full suite **2,668 pass / 1 skip / 0 fail** (2,669 tests; baseline 2,661 + 3 new S172 tests + collaborator additions). Mid-session, full-suite runs showed 25–33 transient failures (`SQLiteError: database is locked` / `disk I/O error` in `review-venues` + `pipeline-state` test *setup*) while the 22:03–22:17 enrichment pipeline was writing — the suites passed in isolation throughout, and three consecutive clean full runs followed pipeline completion. Lesson: a fail-count spike whose errors are lock/IO in setup, during pipeline activity, is contention — bisect against *time* (re-run after pipeline idle) before bisecting against content.

## Checkpoints / out of scope

1. **269-venue no-address tail** — config has 346 venues, only 37 had addresses pre-session. The 269 without addresses and without active pages cause no fails today but will re-fail when a future event books them. → Editorial-assisted pass, or see #2.
2. **Scrape-time missing-address guard** (Planner flag, 2026-06-04): the durable fix for this fail class is rejecting/flagging address-less venues at ingest, not backfill. Post-session summary to Planner should propose whether it's its own brief or rides Pattern G.
3. Tier-lag fix (338 mislabeled stubs) — rides the throughput forensic session.
4. Empty-slug `dist/events/*--` orphans — separate 🔴 (SWEEP_ORPHANS), untouched here.
