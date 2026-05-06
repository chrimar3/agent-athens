# Sprint 2 Retrospective

**Trigger date:** 2026-05-06 (ratchet `venueSameAs.populated: 0 → 3`, fired in Session 116)

**Status:** READY — substantively closed. Retrospective writeup pending.

## Closeout summary

- All B-2d collision holds resolved (6 → 0): 5 mechanical merges via
  address-record-wins (Cantina Social, Smut, Wild Poppies, Burger Disco
  Club, IT Athens) + 1 Editorial-resolved merge with enrichment (Αγγέλων
  Βήμα). Registry: 353 → 347.
- Tier 1 venue Wikidata QID sameAs landed for 3 flagship venues (Megaron
  Mousikis Q582203, Onassis Stegi Q43064509, Benaki Πολιτισμού Q816669).
  Pireos 138 deferred (no distinct Wikidata entity exists; defer to a
  Wikidata-entry-creation workstream).
- S2 taxonomy hygiene shipped (entity-tag filter at 4 DB tag-write sites,
  TAG_TAXONOMY.neighborhood removed at root cause, 362 corpus rows
  cleaned via backfill).
- S101a-microdata fully closed (S113 audit + S115 emitter-side fix); the
  separate S101a-picks infrastructure also shipped (Session 114).
- Production deploy live at https://agentathens.com.

## Open items at retrospective decision points

### Benaki Koumpari canonical_name

The registry currently reads `"Μουσείο Μπενάκη Ελληνικού Πολιτισμού"`
(Syntagma) — the public-facing brand for the Koumpari building's
permanent collection. The Editorial brief used
`"Μουσείο Μπενάκη — Κεντρικό (Κουμπάρη)"` as preferred display.

Both names refer to the same physical Koumpari building per Wikipedia,
Lonely Planet, This Is Athens.

**Decision (Session 116, Sprint 2 closeout):** keep current
canonical_name per closeout discipline. Cosmetic rename was rejected
because it breaks Commit 1's additive-only boundary AND Commit 3's
Editorial-resolved-via-external-verification scope.

**Retro question:** should canonical_names favor brand-as-displayed
(current) or building-as-physical-location (Editorial preference)?
Affects Tier 2 sameAs scoping if the convention generalizes.

### Cross-stream `git add -A` contamination (recurrence)

Session 116 hit the same antipattern documented in S111 mistakes.md:
a concurrent commit on `main` (`ae0f0d5f1` "S2: taxonomy hygiene")
swept up Tier 1 sameAs additions that were staged but not yet committed
in this session. Net result: my Commit 1 was pre-shipped inside the
hygiene commit; the hygiene commit's message claimed to add
neighborhood_aliases but actually didn't (that work landed in the
stash, not the file).

**Detection:** caught at Step 4 of the closeout when `git diff --cached
--stat` showed 16 files staged after a single-path `git add`.

**Mitigation applied this session:** Accepted the bundling rather than
unwinding via `git reset --soft` (commit was already pushed by the time
detection happened — destructive op no longer safe). Continued with
B-2d Commits 2 + 3 cleanly. Sprint 2 still closed substantively.

**Retro question:** should the daily pipeline / concurrent-work tooling
add a guard that fails when staging would include another active
session's modified files? Mechanical detection: any `git add -A` that
would stage files modified within the last N minutes by another
process. See S111 mistakes.md and Session 116 mistakes.md for the
recurrence pattern.

### Orphan stash@{0} (carries neighborhood_aliases)

Stash created during Session 116 to isolate pre-existing working-tree
modifications before the bundling-detection. After the bundle commit,
the stash now contains:

- 3 Tier 1 sameAs additions (now duplicate of HEAD — stash pop will
  conflict on these hunks)
- The intended `neighborhood_aliases` block + `Ampelokipoi`/`Athens
  Riviera` array additions (NOT in HEAD despite `ae0f0d5f1`'s commit
  message claiming so)

**Recommended next-session action:** apply only the bottom hunks of
stash@{0} to recover the missing neighborhood_aliases work. Manual
patch surgery (`git checkout stash@{0} -- config/athens-venues.json`
+ targeted Edit), or accept-ours strategy on `git stash pop` for the
sameAs hunks.

## Sprint 2 retrospective writeup (TODO)

Authored in a follow-up session. Should cover:
- Validator coverage scope (S113 finding: validator scope < emission
  scope)
- Diagnostic-vs-system metric divergence (B-2c, B-2d anchors)
- Address-record-wins mechanical resolution rule (B-2d holds anchor)
- Wikidata building-entity vs institution-entity convention (Onassis
  anchor)
- Cross-stream commit contamination recurrence (S111 + Session 116
  anchors)
