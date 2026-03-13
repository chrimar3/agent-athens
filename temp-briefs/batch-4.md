# Enrichment Brief — Batch 4

## VERIFICATION CHECKLIST
- This is Batch 4
- Event IDs: bd49d7ed9e645e6d, 4aa7763c16cfa1aa, 4591e772da622177
- Write descriptions to: temp-descriptions/batch-4/
- BEFORE writing any file, verify the event ID appears in this list
- ⚠️ DO NOT omit --batch-dir= from write commands. Files without --batch-dir go to a shared directory and contaminate other batches.

You are writing premium event descriptions for Agent Athens, an AI-curated cultural events calendar for Athens, Greece.

## Rules

1. **8-section structure**: Sensory opening → Credentials → Tribe → Details table → Experience → Filter → Logistics → Closer
2. **Voice**: Second person ("you"), present tense, sensory-first. Transport before inform.
3. **Word count**: Per-event target shown below each event (NOT always 400-600). Follow the target range — these are hard constraints, not suggestions.
4. **Details table**: 4 rows — Setting, Vibe, Sound, Door (or Format/Access for tech events)
5. **Filter section**: Always include "If you [don't want X]... But if you [want Y]..."
6. **Show don't tell**: No lazy adjectives — legendary, immersive, iconic, captivating, mesmerizing, breathtaking, enchanting, amazing, incredible, fantastic, wonderful, stunning, vibrant, extraordinary, exceptional, world-class, phenomenal, remarkable
7. **No speculation**: Never write "likely", "perhaps", "probably", "promises to", "the show will". State only verified facts. If you don't know something, omit it — don't guess.
8. **Tribe**: Describe crowd by character/behavior, not demographics
9. **Logistics**: Say "accessible by metro" or "X-minute walk from [station name]". Do NOT include metro LINE NUMBERS or LINE COLORS — these change and have a 20% historical error rate. Ticket prices, practical tips.
10. **Closer**: One tight sentence — scarcity, uniqueness, or urgency
11. **CRITICAL: Do not fabricate information.** If you can't find a fact, omit it.
12. **Terminology**: Use "open" not "free". Latin transliteration for Greek names in prose.
13. **Description only**: No tags, no "Last verified", no info tables beyond Aspect/Details.
14. **VENUE OPENINGS**: If you write sensory details about a venue's physical space (smells, decor, lighting, food/drink), you MUST have found these through WebSearch or venue intel provided. Do not invent plausible atmosphere. If no venue details are available, open with the event's sound, the performer's first action, or the audience's energy instead.
15. **CREDENTIALS**: If you cannot verify a specific release, album, label, or credential through web search, do not include it. State what you can confirm. A missing detail is always better than a wrong one. If web search returns nothing on an artist, say so in batch-review.md and use a venue-forward approach.
16. **OPENING DIVERSITY**: Do not default to sound-first openings. After writing all descriptions in this batch, re-read your openings consecutively. If more than 2 of 5 use the same entry strategy (sound-first, space-first, action-first), rewrite one using a different approach. Options: visual detail, physical action, temporal framing, contrast/tension, a question the space poses.
17. **CLOSER DIVERSITY**: Do not reuse the word "combination" or the phrase "will not reassemble/recur" across multiple closers in the same batch. Each closer must find its own structural fact or framing.

## Exemplars (read for structural guidance)

- `exemplars/theater-tartuffe.md` — structural reference
- `exemplars/classical-lpo-jarvi.md` — structural reference
- `exemplars/exhibition-swinton.md` — structural reference

## Anti-patterns

Read `docs/enrichment-anti-patterns.md` for 10 confirmed mistakes to avoid.

## Entity Locking (English Descriptions)

These terms MUST remain untranslated in English descriptions:

- **Music genres**: rebetiko, rembetika, laiko, laika, entechno, nisiotika, dimotika, amanedhes, zeibekiko, tsifteteli, hasapiko, syrtos, kalamatianos, mandinades
- **Instruments**: bouzouki, baglamas, tzouras, oud, kanun, lyra, santouri, laouto
- **Venue types**: bouzoukia, steki, ouzeri, mezedopoleio, kafeneio, taverna, psistaria
- **Cultural concepts**: kefi, meraki, filotimo, parea, glendi, panigiri, kouventa
- **Venue names**: Inherit from DB (use Latin transliteration or established English name)
- **Neighborhoods**: Inherit from DB (use established transliterations)
- **Date format**: DD Month YYYY (e.g., '15 March 2026', never '15/3/2026' or 'March 15, 2026')
- **Time format**: 24h format with colon (e.g., '21:00', never '9 PM')
- **Currency**: EUR symbol before amount (e.g., '15 EUR' or 'EUR 15', never '$15')

## Recent Openings (DO NOT REUSE)

These opening sentences were used in recent batches. Use a DIFFERENT entry strategy:

- "O Kipos tou Epikourou is a painting exhibition by Erietta Vordoni at Megaron Mousikis Athinon in Ampelokipoi, Athens, on 30 March 2026."
- "Athlitismos gia Olous is an adapted sports program for children with disabilities at the Stavros Niarchos Foundation Cultural Center in Kallithea, Athens, running weekends from January through March 2026."
- "Katerina Papoutsaki ft."
- "D'Al Senio is a DJ set at Boo!"
- "Agamemnon: The Cycle of Blood is a solo theater work at Theatro Mavili on Mavili Square in Ampelokipoi, Athens, premiering 13 March 2026 at 21:00."
- "Marva Von Theo and MoonMoth play a concert at St."
- "O Tou-tou kai i Tsaf-tsouf is an interactive baby theater production by Irina Boiko's White Puppet Theatre at Olvio in Botanikos, Athens, on 13 March 2026."
- "The Bonnie Nettles play a concert at ILION Plus on Kodrigktonos in Athens, on 13 March 2026."
- "Bacchae 6.0 is a Greek natural wine fair with DJ sets at Romantso on Anaxagora in Athens, on 13 March 2026."
- "To Megalo Mas Tsirko, a show by Iakovos Kampanellis at Theatron in Tavros, Athens, on 13 March 2026, fills the stage with an eight-piece orchestra and twenty actors."
- "Zesti Sokolata me ton Pikaso is a children's theater piece at the Goulandris Museum in Pangrati, Athens, on 13 March 2026 at 11:00."
- "To Magiko Eisitirio is a baby theater production at the Giannis Marinos Hall in Megaron Mousikis in Ampelokipoi, Athens, on 13 March 2026 at 10:30."
- "A professor's life unravels from a single accusation."
- "Twenty costume changes in seventy minutes."
- "The stage becomes a museum, and one of the statues is missing."

---

## Events to Enrich

### O κύριος Βρομύλος
- **ID**: bd49d7ed9e645e6d
- **Type**: theater
- **Venue**: Θέατρο Τέχνης
- **Price**: paid
- **Date**: 2026-03-13T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/o_kurios_bromulos-10087393/
- **Source**: athinorama.gr
- **Category**: theater_contemporary
- **Target words (English)**: 120-180
- **Target words (Greek)**: 100-155
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 120-180 words. Greek MUST be 100-155 words.
- **Venue intel**: Not in database. WebSearch "Θέατρο Τέχνης Athens" for context.

### Ντενεκεδούπολη ξανά! Το μεγάλο ταξίδι του Μελένιου
- **ID**: 4aa7763c16cfa1aa
- **Type**: concert
- **Venue**: Ίδρυμα Μιχάλης Κακογιάννης
- **Price**: tba
- **Date**: 2026-03-13T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/ntenekedoupoli_ksana!_to_megalo_taksidi_tou_meleniou-10083469/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Target words (Greek)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: English description MUST be 80-120 words. Greek MUST be 70-100 words.
- **Venue intel**: Not in database. WebSearch "Ίδρυμα Μιχάλης Κακογιάννης Athens" for context.

### Falsa Magra + Stochastic + Demian
- **ID**: 4591e772da622177
- **Type**: dj_set
- **Venue**: B-Side
- **Price**: door
- **Date**: 2026-03-13T21:00:00
- **Time**: 21:00
- **URL**: https://www.clubber.gr/events/falsa-magra-stochastic-demian/
- **Source**: clubber.gr
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Target words (Greek)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: English description MUST be 80-120 words. Greek MUST be 70-100 words.
- **Venue intel**: Not in database. WebSearch "B-Side Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to batch directory (temp-descriptions/batch-4/):
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-4 "<description text>"
   ```
3. **Gate check**: Validate quality with metadata flags (no DB needed):
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/batch-4/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> --batch-dir=temp-descriptions/batch-4 Tag1 Tag2 Tag3...
   ```
5. **Write Greek description** (optional secondary): Write a condensed Greek version.
   Save to `temp-descriptions/batch-4/<event-id>.gr.md`. Greek word target shown per event above.
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-4 --lang=gr "<greek description>"
   ```
   **Greek description rules**:
   - Cultural terms in Greek (e.g., ρεμπέτικο, λαϊκό, έντεχνο — not transliterated)
   - Use "ελεύθερη είσοδος" not "δωρεάν" for free events
   - Venue names MUST be in Greek script: Μέγαρο Μουσικής (not Megaron), Τεχνόπολη (not Technopolis), Στέγη Ωνάση (not Onassis Stegi), Εθνικό Θέατρο (not National Theatre)
   - Same 8-section structure, same factual content, but natural Greek voice
   - The Greek version is NOT a translation. Write it fresh for a local audience.
6. **Save decision** (after completing ALL events in this batch):
   - If ALL gate scores are >= 80 AND all have 0 errors: auto-save to database:
   ```bash
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-4.manifest.json --session=batch-4 --batch=4 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-4-review.md.
   - If ANY score is < 80 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-4-review.md with reasons.

### Per-Event Gate Check Commands

Copy-paste these with the correct tier for each event:

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-4/bd49d7ed9e645e6d.md \
  --tier=standard --event-id=bd49d7ed9e645e6d \
  --event-type=theater --event-venue="Θέατρο Τέχνης" \
  --event-title="O κύριος Βρομύλος" \
  --event-date=2026-03-13 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-4/4aa7763c16cfa1aa.md \
  --tier=stub --event-id=4aa7763c16cfa1aa \
  --event-type=concert --event-venue="Ίδρυμα Μιχάλης Κακογιάννης" \
  --event-title="Ντενεκεδούπολη ξανά! Το μεγάλο ταξίδι του Μελένιου" \
  --event-date=2026-03-13 --event-price=tba
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-4/4591e772da622177.md \
  --tier=stub --event-id=4591e772da622177 \
  --event-type=dj_set --event-venue="B-Side" \
  --event-title="Falsa Magra + Stochastic + Demian" \
  --event-date=2026-03-13 --event-price=door
```

After all events, create `temp-descriptions/batch-4/batch-4-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| bd49d7ed9e645e6d | O κύριος Βρομύλος | /100 | | |
| 4aa7763c16cfa1aa | Ντενεκεδούπολη ξανά! Το μεγάλο ταξίδι του Μελένιου | /100 | | |
| 4591e772da622177 | Falsa Magra + Stochastic + Demian | /100 | | |
