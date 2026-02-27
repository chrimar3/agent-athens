# Enrichment Brief — Batch 3

You are writing premium event descriptions for Agent Athens, an AI-curated cultural events calendar for Athens, Greece.

## Rules

1. **8-section structure**: Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer
2. **Voice**: Second person ("you"), present tense, sensory-first. Transport before inform.
3. **Word count**: 400-600 words of pure narrative per event
4. **Details table**: 4 rows — Setting, Vibe, Sound, Door (or Format/Access for tech events)
5. **Filter section**: Always include "If you [don't want X]... But if you [want Y]..."
6. **Show don't tell**: No lazy adjectives (amazing, incredible, fantastic, wonderful, stunning, vibrant)
7. **Tribe**: Describe crowd by character/behavior, not demographics
8. **Logistics**: Metro station, walking distance, ticket prices, practical tips
9. **Closer**: One tight sentence — scarcity, uniqueness, or urgency
10. **CRITICAL: Do not fabricate information.** If you can't find a fact, omit it.
11. **Terminology**: Use "open" not "free". Latin transliteration for Greek names in prose.
12. **Description only**: No tags, no "Last verified", no info tables beyond Aspect/Details.
13. **VENUE OPENINGS**: If you write sensory details about a venue's physical space (smells, decor, lighting, food/drink), you MUST have found these through WebSearch or venue intel provided. Do not invent plausible atmosphere. If no venue details are available, open with the event's sound, the performer's first action, or the audience's energy instead.
14. **CREDENTIALS**: If you cannot verify a specific release, album, label, or credential through web search, do not include it. State what you can confirm. A missing detail is always better than a wrong one. If web search returns nothing on an artist, say so in batch-review.md and use a venue-forward approach.
15. **OPENING DIVERSITY**: Do not default to sound-first openings. After writing all descriptions in this batch, re-read your openings consecutively. If more than 2 of 5 use the same entry strategy (sound-first, space-first, action-first), rewrite one using a different approach. Options: visual detail, physical action, temporal framing, contrast/tension, a question the space poses.
16. **CLOSER DIVERSITY**: Do not reuse the word "combination" or the phrase "will not reassemble/recur" across multiple closers in the same batch. Each closer must find its own structural fact or framing.

## Exemplars (read for structural guidance)

- `exemplars/theater-cherry-orchard.md` — Historical depth, accessibility info
- `exemplars/concert-three-times-three.md` — Format explanation, cross-community appeal
- `exemplars/classical-magic-ticket.md` — Audience-specific framing, practical pricing

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 10 confirmed mistakes to avoid.

---

## Events to Enrich

### ΕΚΕΙΝΟΣ & ΕΚΕΙΝΟΣ
- **ID**: 9583f7ca5f306a2b
- **Type**: theater
- **Venue**: Αργώ
- **Price**: paid
- **Date**: 2026-02-26
- **URL**: https://www.more.com/gr-el/tickets/theater/ekeinos-ekeinos/
- **Source**: more.com
- **Venue intel**: Not in database. WebSearch "Αργώ Athens" for context.

### Στέλιος Κοτίδης &amp; Γιώργος Χουβαρδάς
- **ID**: b921cecb62005587
- **Type**: concert
- **Venue**: Σταυρός του Νότου
- **Price**: paid
- **Date**: 2026-02-26
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/music/gig/stelios_kotidis_kai_giorgos_xoubardas-10087824/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Σταυρός του Νότου Athens" for context.
- **artist intel**: Γιώργος Κουμεντάκης — Greek composer born in Rethymno, 1959. Composed music for 2004 Athens Olympic ceremonies. Works span symphonic, chamber, theater, dance, opera, and installation. Eros Demon (1991) for counter-tenor and two pianos on Sappho's poetry is a key work.

### Irini Karaoglou
- **ID**: 1ae8fc4ec471d76f
- **Type**: dj_set
- **Venue**: Cantina Social
- **Price**: door
- **Date**: 2026-02-26T21:00:00
- **Time**: 21:00
- **URL**: https://www.clubber.gr/events/irini-karaoglou-3/
- **Source**: clubber.gr
- **Venue intel**: Not in database. WebSearch "Cantina Social Athens" for context.

### Η βασίλισσα των πάντων
- **ID**: fc9d2311e71031ac
- **Type**: classical
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: paid
- **Date**: 2026-02-26T12:30:00
- **Time**: 12:30
- **URL**: https://www.athinorama.gr/theatre/performance/i_basilissa_ton_panton-10070185/
- **Source**: athinorama.gr
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

### Ballet du Grand Théâtre de Genève + Eastman – Ihsane του Sidi Larbi Cherkaoui
- **ID**: 202f5af00be76332
- **Type**: dance
- **Venue**: Μέγαρο Μουσικής Αθηνών
- **Price**: with-ticket
- **Date**: 2026-03-17T20:30:00+03:00
- **URL**: https://www.megaron.gr/event/ballet-du-grand-theatre-de-geneve-eastman-2/
- **Source**: megaron.gr
- **Venue intel**: Not in database. WebSearch "Μέγαρο Μουσικής Αθηνών Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to file:
   ```bash
   bun run scripts/write-description.ts <event-id> "<description text>"
   ```
3. **Gate check**: Validate quality:
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/<event-id>.md --tier=premium --event-id=<event-id>
   ```
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> Tag1 Tag2 Tag3...
   ```

After all events, create `temp-descriptions/batch-3-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 9583f7ca5f306a2b | ΕΚΕΙΝΟΣ & ΕΚΕΙΝΟΣ | /100 | | |
| b921cecb62005587 | Στέλιος Κοτίδης &amp; Γιώργος Χουβαρδάς | /100 | | |
| 1ae8fc4ec471d76f | Irini Karaoglou | /100 | | |
| fc9d2311e71031ac | Η βασίλισσα των πάντων | /100 | | |
| 202f5af00be76332 | Ballet du Grand Théâtre de Genève + Eastman – Ihsane του Sidi Larbi Cherkaoui | /100 | | |
