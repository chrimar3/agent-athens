# Enrichment Brief — Batch 3

## VERIFICATION CHECKLIST
- This is Batch 3
- Event IDs: 236f9f6ba20a6565, a2d34d0667998419, ab3ff44be932a7b5
- Write descriptions to: temp-descriptions/batch-3/
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

- "O Tou-tou kai i Tsaf-tsouf is a puppet theater performance for babies at Olvio in Botanikos, Athens, on 12 March 2026."
- "Tragoudia Aneipota is a vocal recital at Megaron Mousikis in Ampelokipoi, Athens, on 12 March 2026."
- "SINGLES DISCO CLUB is a DJ night and singles social at Burger Disco Club on Nikis 11 near Syntagma, Athens, on 12 March 2026."
- "Retro Savvata me ton David Nachmia is a concert at the B."
- "MAROUSSI CHERY VS PERISTERI BETSSON is a Greek Basket League game at the OAKA Indoor Arena in Maroussi, Athens, on 14 March 2026."
- "Den tha Pethanoume Kiolas is a stand-up comedy show at Red Jasper Cabaret Theatre on Kefallinias Street in Kypseli, Athens, running Fridays through 27 March 2026."
- "Zesti Sokolata me ton Pikaso is a children's theater production at the Goulandris Museum amphitheater in Pangrati, Athens, on 12 March 2026 at 11:00."
- "Ioulia Karapataki and Atar tou Tar play rebetiko and old laika at Kyttaro near Victoria Square in Athens, on 12 March 2026."
- "Andrew Keatley's Aligatores plays at Auditorium on Sina 2-4 in central Athens, through 31 March 2026."
- "O Kipos tou Epikourou is a painting exhibition by Erietta Vordoni at Megaron Mousikis Athinon in Ampelokipoi, Athens, on 30 March 2026."
- "Athlitismos gia Olous is an adapted sports program for children with disabilities at the Stavros Niarchos Foundation Cultural Center in Kallithea, Athens, running weekends from January through March 2026."
- "Katerina Papoutsaki ft."
- "D'Al Senio is a DJ set at Boo!"
- "Agamemnon: The Cycle of Blood is a solo theater work at Theatro Mavili on Mavili Square in Ampelokipoi, Athens, premiering 13 March 2026 at 21:00."
- "Marva Von Theo and MoonMoth play a concert at St."

---

## Events to Enrich

### Αλιγάτορες
- **ID**: 236f9f6ba20a6565
- **Type**: dj_set
- **Venue**: AUDITORIUM
- **Price**: paid
- **Date**: 2026-03-13T21:00:00
- **Time**: 21:00
- **URL**: https://www.athinorama.gr/theatre/performance/aligatores-10081818/
- **Source**: athinorama.gr
- **Category**: concert_local
- **Target words (English)**: 80-120
- **Target words (Greek)**: 70-100
- **Structure**: three-part-block
- **HARD CONSTRAINT**: English description MUST be 80-120 words. Greek MUST be 70-100 words.
- **Venue intel**: Not in database. WebSearch "AUDITORIUM Athens" for context.

### Velvet Cabaret – NY in Athens
- **ID**: a2d34d0667998419
- **Type**: show
- **Venue**: MÉTRON Stage
- **Price**: paid
- **Date**: 2026-03-13T20:30:00
- **Time**: 20:30
- **URL**: https://www.athinorama.gr/theatre/performance/velvet_cabaret_%e2%80%93_ny_in_athens-10089520/
- **Source**: athinorama.gr
- **Category**: default
- **Target words (English)**: 120-200
- **Target words (Greek)**: 100-170
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 120-200 words. Greek MUST be 100-170 words.
- **Venue intel**: Not in database. WebSearch "MÉTRON Stage Athens" for context.

### In motion: Ένα άγαλμα που το ’σκασε
- **ID**: ab3ff44be932a7b5
- **Type**: theater
- **Venue**: Δημοτικό Θέατρο Πειραιά
- **Price**: tba
- **Date**: 2026-03-13T11:00:00
- **Time**: 11:00
- **URL**: https://www.athinorama.gr/theatre/performance/in_motion_ena_agalma_pou_to_%e2%80%99skase-10088271/
- **Source**: athinorama.gr
- **Category**: theater_contemporary
- **Target words (English)**: 120-180
- **Target words (Greek)**: 100-155
- **Structure**: hybrid
- **HARD CONSTRAINT**: English description MUST be 120-180 words. Greek MUST be 100-155 words.
- **Venue intel**: Not in database. WebSearch "Δημοτικό Θέατρο Πειραιά Athens" for context.

---

## Execution Instructions

For EACH event:

1. **Research**: WebSearch the event URL for details. Search for artist/performer background. Also search the venue if writing sensory opening details about the physical space — unverified atmosphere (invented food smells, assumed decor) is a fabrication violation even if it sounds plausible.
2. **Write description**: Save to batch directory (temp-descriptions/batch-3/):
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-3 "<description text>"
   ```
3. **Gate check**: Validate quality with metadata flags (no DB needed):
   ```bash
   bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/<event-id>.md --tier=<tier> --event-id=<event-id> \
     --event-type=<type> --event-venue="<venue>" --event-title="<title>" \
     --event-date=<date> --event-price=<price>
   ```
   Tier mapping: three-part-block=stub, hybrid=standard, full-8-section=premium
4. **Write tags** (from taxonomy in docs/MASTER-ENRICHMENT-TEMPLATE.md):
   ```bash
   bun run scripts/write-tags.ts <event-id> --batch-dir=temp-descriptions/batch-3 Tag1 Tag2 Tag3...
   ```
5. **Write Greek description** (optional secondary): Write a condensed Greek version.
   Save to `temp-descriptions/batch-3/<event-id>.gr.md`. Greek word target shown per event above.
   ```bash
   bun run scripts/write-description.ts <event-id> --batch-dir=temp-descriptions/batch-3 --lang=gr "<greek description>"
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
   bun run scripts/save-batch.ts --manifest=temp-briefs/batch-3.manifest.json --session=batch-3 --batch=3 --clean
   ```
   Note "AUTO-SAVED" at the top of batch-3-review.md.
   - If ANY score is < 80 OR any have errors: do NOT run save-batch.ts.
     Note "LEFT FOR REVIEW" at the top of batch-3-review.md with reasons.

### Per-Event Gate Check Commands

Copy-paste these with the correct tier for each event:

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/236f9f6ba20a6565.md \
  --tier=stub --event-id=236f9f6ba20a6565 \
  --event-type=dj_set --event-venue="AUDITORIUM" \
  --event-title="Αλιγάτορες" \
  --event-date=2026-03-13 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/a2d34d0667998419.md \
  --tier=standard --event-id=a2d34d0667998419 \
  --event-type=show --event-venue="MÉTRON Stage" \
  --event-title="Velvet Cabaret – NY in Athens" \
  --event-date=2026-03-13 --event-price=paid
```

```bash
bun run scripts/auto-gate-check.ts temp-descriptions/batch-3/ab3ff44be932a7b5.md \
  --tier=standard --event-id=ab3ff44be932a7b5 \
  --event-type=theater --event-venue="Δημοτικό Θέατρο Πειραιά" \
  --event-title="In motion: Ένα άγαλμα που το ’σκασε" \
  --event-date=2026-03-13 --event-price=tba
```

After all events, create `temp-descriptions/batch-3/batch-3-review.md` with:

| Event ID | Title | Gate Score | Issues | Confidence |
|----------|-------|------------|--------|------------|
| 236f9f6ba20a6565 | Αλιγάτορες | /100 | | |
| a2d34d0667998419 | Velvet Cabaret – NY in Athens | /100 | | |
| ab3ff44be932a7b5 | In motion: Ένα άγαλμα που το ’σκασε | /100 | | |
