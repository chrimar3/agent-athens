# Editorial Decisions Log

Authored by the Editorial Director; entries pasted as-filed. Scope: naming,
taxonomy, and content rulings that bind enrichment + config + emission.

---

## ED-2026-06-05-a — Kerameikos cultural-venue reconciliation

Cultural venues in the Kerameikos/Gazi corridor anchor to **Gazi**, not
Kerameikos (reaffirms the 2026-03-02 rule). Kerameikos as a neighborhood key
remains valid for residential/archaeological context (Wikidata Q630974 — the
entity combines the ancient cemetery and the neighborhood; no separate
modern-quarter item exists). Applied: Θέατρο Βασιλάκου → Gazi (NOT Kerameikos,
despite the venue's Profiti Daniil & Plataion address sitting on the
Kerameikos side). Scope-widening: this rule covers ALL cultural venues in the
corridor going forward, not case-by-case.

## ED-2026-06-05-b — "Psyri" is the canonical Latin spelling

Canonical: **Psyri** (single r), per Wikidata Q2984834 (English label "Psyri",
neighborhood in Athens, Attica, Greece) — the entity our Place nodes cite via
sameAs. "Psyrri"/"Psiri" remain accepted INPUT variants in
`neighborhood_aliases` (never emitted). The entity-lock (`entity-locking.json`
"Ψυρρή" mapping) updated to match. Note for the record: Wikidata's label for
Exarchia is "Exarcheia", yet our canonical stays "Exarchia" (geodata key,
dominant local transliteration) — canonical choice is editorial; the QID
grounding (Q531602) is what binds the entity, and "Exarcheia" is tolerated as
an input variant.
