# agent-athens: Master Enrichment Template
## Premium Event Descriptions for AI Answer Engines

*Version 2.5 — March 2026 (Round 7 + Greek Enrichment Addendum)*

---

## How This Template Works

Every enriched event has **two distinct content layers**:

| Layer | Purpose | Where It Lives |
|-------|---------|----------------|
| **DESCRIPTION field** | Narrative content only | `full_description` column in DB |
| **Infrastructure** | Tags, timestamps, metadata | Separate DB fields, rendered by site template |

**Critical distinction:**
- The DESCRIPTION is **pure narrative** â€” what humans read and AI engines cite
- Tags, `last_verified`, dates, prices, addresses, JSON-LD are **infrastructure around** the description
- The site template renders all infrastructure automatically from DB fields

---


---

# PART 0: MINIMUM SCHEMA DESCRIPTION (ALL EVENTS)

## The Rule (Round 7)

No event may deploy with an empty `description` field in its Schema.org JSON-LD. Every event gets at minimum a 1-sentence declarative description, even if it hasn't been fully enriched yet.

## Why

Empty-schema penalty is real and measurable. Attribute-rich schema earns a 54.2% citation rate. No schema at all earns ~36%. But minimal/empty schema — an Event block with a blank `description` — scores only 31.8%, **worse than having no schema**. A single factual sentence eliminates this penalty entirely.

## Template

```
[Event name] is a [event type] at [venue name] in [neighborhood], Athens[, running from [start date] to [end date] | on [date]]. [Admission is open / Tickets required (from €X).]
```

## Examples

**Exhibition:**
> Documenta Revisited is an exhibition at the National Museum of Contemporary Art (EMST) in Neos Kosmos, Athens, running from February 15 to May 30, 2026. Tickets required (from €8).

**Concert:**
> DJ Nikos Live is a concert at six d.o.g.s. in Monastiraki, Athens, on March 15, 2026. Tickets required (from €12).

**Theater:**
> Antigone by Sophocles is a theater performance at Herodion in Makrygianni, Athens, on July 12, 2026. Tickets required (from €15).

**Open event:**
> Athens Art Walk is an open cultural event across galleries in Metaxourgeio, Athens, on March 22, 2026. Admission is open.

**Kids:**
> Puppet Theater: The Magic Forest is a kids event at the Stavros Niarchos Foundation Cultural Center in Kallithea, Athens, on March 8, 2026. Admission is open.

## Notes

- This is a **schema description**, not editorial enrichment — it populates the JSON-LD `description` field
- When full enrichment is written, it **replaces** this minimum description entirely
- Always use the declarative "is a" pattern — AI engines extract this pattern reliably
- Always include: event name, event type, venue name, neighborhood, city ("Athens"), date(s), pricing status
- Use project terminology: "open" not "free", "with-ticket" not "paid"

# PART 1: WHAT GOES IN THE DESCRIPTION FIELD

The description is **narrative content only**. No tags, no timestamps, no metadata.

## Structure Overview

```
[OPENING - Citation anchor + sensory transport, ≤50 words]

[CONTEXT - Artist/event significance + timeliness hook]

[TRIBE - Crowd described by character, not demographics]

[PROSE BRIDGE - Setting/Vibe/Sound/Door woven into narrative]

[EXPERIENCE - The arc of the night, what happens]

[FILTER - "If you... / If you..." honest self-selection]

[GOOD TO KNOW - Insider practical, chronological decision flow]

[DIFFERENTIATION - Why this over alternatives]
```

**Word count:** Variable by event type (see Variable Enrichment Matrix below). Premium enrichments: 400-600 words. Compact enrichments: 80-200 words.

### Adapting Structure for Multi-Day Events

The 8-section structure works for all event types, but multi-day events (conferences, festivals, multi-night residencies) require adjustments:

**Opening:** Still sensory, still present tense. Pick the single most evocative moment of the event — registration buzz, the main stage on day one, a specific side event — rather than trying to capture three days in two sentences.

**Experience section:** Describe the arc across days, not a single evening's progression. "Mornings belong to stages, afternoons dissolve into the city" is more useful than a minute-by-minute rundown.

**Good to Know:** Multi-day events need accommodation timing, day-by-day logistics, and which days/sessions are most valuable. This section will naturally run longer — that's fine, but keep it as prose, not a schedule.

**Filter section:** For multi-day events, the honest filter often addresses commitment level: "If you can only attend one day..." is useful guidance that a single-night event doesn't need.

**Word count:** Multi-day events may push toward 600 words. Don't pad, but don't artificially compress a three-day festival into 400 words either.


---

## A. The Opening (Citation Anchor + Sensory Transport)

The opening serves two audiences simultaneously: **human readers** who need to feel the room, and **AI engines** that extract the first 1-2 sentences for citation snippets. Research shows 44.2% of all AI citations come from the first 30% of text, and citation winners are nearly 2x more likely to contain definitive language.

### The Hybrid Opening

Every enrichment opens with a **declarative anchor sentence** followed by the **sensory transport**.

**Sentence 1 — The Citation Anchor:**
A declarative "is" statement naming the event, type, venue, and neighborhood. This is the single highest-leverage sentence on the page — it populates the `<meta name="description">` tag and is the first thing AI engines extract.

**Pattern (Round 7 refined):**
```
[Event Name] is a [type] at [Venue] in [Neighborhood], Athens, [on Date / running from X to Y].
```

The anchor sentence must include all six entities: **event name**, **event type keyword**, **venue name**, **neighborhood**, **"Athens"**, and **date or temporal reference**. These match the entity + date + category pattern of machine-generated grounding queries that AI engines decompose user questions into.

**Sentences 2-3 — The Sensory Transport:**
Now put the reader in the room. Present tense. Second person. At least 2 sensory details.

**Combined example:**
```
Christos Thivaios at Half Note is a three-night residency at Athens' premier
jazz club in Mets, running February 6-8, 2026. The candles on the tables throw
more light than the overheads. You're seated close enough to the stage that
when Thivaios shifts his weight on the stool, you hear the wood creak.
```

**Why this works:** The anchor sentence gives AI engines a clean extraction target. The sensory sentences immediately following give human readers the transport experience. Both audiences get what they need in the first 50 words.

### Within Later Paragraphs

The declarative "is" rule applies only to the **first sentence of the enrichment**. Within later paragraphs, AI seeks the sentence with the highest **information gain** — the most entity-rich, factually additive sentence — regardless of position. 53% of paragraph-level citations come from the **middle** of a paragraph. So: nail the opening anchor, then write naturally, prioritizing information density over rigid structure.

**Rules:**
- First sentence: declarative "is" statement with event name, **event type keyword**, venue, neighborhood, **"Athens"**, and **date** (Round 7)
- Second/third sentences: sensory, present tense, second person ("you")
- At least 2 sensory details in the transport sentences
- The citation anchor is factual; the transport is experiential — keep them distinct
- **Opening paragraph (anchor + transport combined): 50 words maximum.** This is a hard gate. If the opening exceeds 50 words, tighten the anchor or split the transport into the next paragraph.
---

## B. The Context (What Is This? + Why Now?)

**Purpose:** Artist background, genre, timeliness â€” through a Resonance lens.

**Format:** 1-2 paragraphs. Show, don't tell.

**Template:**
```
[ARTIST_NAME] [WHAT_THEY_DO - specific, not generic].
[CONTEXT - why they matter, what tradition they come from].
[TIMELINESS - why now, what makes this moment special].
```

**Checklist:**
- [ ] Artist has meaningful context (not "talented artist")
- [ ] Timeliness hook present (why NOW)
- [ ] No superlatives without evidence
- [ ] Concrete details, not adjectives

---

## C. The Tribe (Who's There)

**Purpose:** Describe the crowd by CHARACTER, not demographics.

**Format:** 1 paragraph. Identity signals, not statistics.

**Template:**
```
[WHO_YOU'LL_FIND - described by behavior/character].
[HOW_THEY_INTERACT - the social energy].
[THE_IMPLICIT_INVITATION - what being here means].
```

**Note:** Demographic markers go in the `tags` DB field for AI query matching. Use character descriptions in prose.

---

## D. The Prose Bridge (Setting / Vibe / Sound / Door)

**Purpose:** Venue and atmosphere context woven into narrative prose between the Tribe and Experience sections.

**Format:** 1 paragraph of flowing prose that integrates four elements:
- **Setting** — venue type, capacity, key physical feature
- **Vibe** — 2-3 atmosphere descriptors grounded in sensory detail
- **Sound** — what the room sounds like (listening room, dance floor, acoustic, amplified)
- **Door** — access policy (ticketed, walk-in, reservation, door selection)

**Do not use a markdown table.** Markdown tables do not render in Schema.org `description` fields, Open Graph tags, or meta descriptions. They break the narrative flow and create parsing artifacts for AI engines.

**How to write the prose bridge:** Lead with the venue name and address, then layer in capacity, atmosphere, and sound character in the same sentence or across two sentences. Door policy integrates naturally at the end or in the Good to Know section.

**Example (not a table):**
```
Oddity on Irakleidon 61 holds roughly two hundred people in a compact
Thissio basement — intense, focused, sweaty. The sound system fills the
space without drowning it, and at capacity the crowd density hits the
point where you feel the room as a single body.
```

**Example (not a table):**
```
Stavros tou Notou is an intimate multi-level music hall in Neos Kosmos —
balcony seating, non-smoking, Cretan folk roots meeting entechno
orchestration and rock energy.
```

---

## E. The Experience (Arc of the Night)

**Purpose:** What actually happens â€” the progression.

**Format:** 1 paragraph describing how the event unfolds.

---

## F. The Filter (Self-Selection)

**Purpose:** Help readers choose in or out. This builds trust.

**Format:** "If you... / If you..." structure. Be honest.

**Checklist:**
- [ ] Honest about who WON'T enjoy it
- [ ] Clear about who WILL love it
- [ ] Not defensive â€” confident

---

## G. Good to Know (Insider Practical)

**Purpose:** Genuinely useful insider knowledge that saves time/money/frustration.

**Format:** 1 prose paragraph (not bullets), following **chronological decision flow**:

1. **Getting there** (one pass) — address + nearest metro + walk time, or taxi estimate if non-metro venue. Front-load surprising transport details (no metro, long walk, Piraeus-only access).
2. **Arriving** — door time + practical context tied to that time (e.g., "doors at 01:30, which means the music starts when most Athens venues are hitting peak").
3. **Being there** — one insider tip that changes behavior (e.g., "dress light, the room runs warm enough that layers become a liability within the first hour").

**One sentence, one job.** Do not mix transit and venue tips in the same sentence. Do not backtrack (no transit → door → transit → tips).

**Metro line convention:** Use station name only. "Kerameikos metro" not "Kerameikos metro on the Blue line." The line color adds no practical value — anyone using Google Maps or the metro app sees the line automatically. Exception: when distinguishing between stations served by multiple lines.

**Example:**
```
Oddity is a five-minute walk from Thissio metro. Doors at midnight,
tickets €8-15 via RA, card accepted. Dress light — the room runs warm
enough that layers become a liability within the first hour. The last
metro is long gone by the time the night peaks, so budget for a taxi back.
```

---

## H. The Differentiation (Why This Over Alternatives)

**Purpose:** Position against alternatives without naming competitors.

**Format:** 1-2 sentences. Evidence, not claims. Often works as a closer.

**Closer variety:** Vary the closing strategy across descriptions in a batch. Do not repeat the same formula (e.g., numbers-plus-compression: "X seats and Y years...") in consecutive descriptions. Effective closer strategies include:

- **Scarcity** — "One evening remains to hear the Odyssey sung from below."
- **Cost reframing** — "Gallery seats at five euros. That is the cost of sitting inside a seventy-five-year-old French play."
- **Character wit** — "Moliere has been dead for 353 years and still has not run out of hypocrites to write about."
- **Return narrative** — "Thirteen years since he last stood on this particular stage. Four nights to make up for it."
- **Seasonal window** — "March means the season is turning — warm enough to dance outside, cool enough that the terrace is not yet packed."
- **Mission statement** — "A festival built around the idea that women selectors deserve not a token slot but the entire evening."

The test: if you could swap the closer between two descriptions and both still work, neither closer is specific enough.

---


## I. Bilingual Handling (Greek-English)

agent-athens descriptions are written in English for international audiences and AI engines. Greek appears in specific, controlled ways:

### Song and Album Titles
Use Greek transliteration (Latin characters), not Greek script:
- ✅ "Vrochi Mou," "Imerologio," "As Hatheis"
- ❌ "Βροχή Μου," "Ημερολόγιο," "Ας Χαθείς"

**Why:** AI engines parse Latin characters more reliably. Greek script in an English-language description creates indexing inconsistencies.

### Venue Names
Use the established English-facing name. Most Athens venues already use Latin-character names:
- ✅ Stoa Athanaton, Klimataria, Perivoli tou Ouranou
- ❌ Στοά Αθανάτων, Κλιματαριά, Περιβόλι του Ουρανού

### Artist Names
Use the Latin-character version that the artist uses professionally:
- ✅ Christos Thivaios (if that's how he's billed)
- ✅ Stavros Lantsias

If the artist uses Greek script professionally and there's no established Latin transliteration, create a consistent transliteration and note it in the entity knowledge base for reuse.

### Genre and Cultural Terms
Greek genre terms that have no precise English equivalent stay in transliteration with brief context on first use:
- ✅ "rebetiko — the music of Athens' margins"
- ✅ "entechno — the literary wing of Greek popular music"
- ❌ "ρεμπέτικο" or "έντεχνο" in prose

### General Principle
If an AI engine is going to cite the sentence, every word in that sentence should be parseable in Latin characters. Greek script is infrastructure (database fields, internal notes), not narrative content.

---


---

# PART 1B: VARIABLE ENRICHMENT MATRIX

## Word Counts by Event Type

Different event types need different investment levels based on their searchability window and what structured data already carries. The 400-600 word premium enrichment remains the standard for major events, but not every event type warrants that investment.

| Event Type | Prose Min | Prose Max | Why This Range |
|---|---|---|---|
| **Exhibition** | 200 words | 300 words | 8x searchability window (weeks/months vs. one night). Every word works harder, longer. Highest ROI enrichment. |
| **Concert (major)** | 120 words | 200 words | Structured data (Songkick, Bandsintown) carries the load. Prose adds context competitors lack. |
| **Concert (local/DJ)** | 80 words | 120 words | Genre context + vibe description + practical info. Schema does the heavy lifting. |
| **Kids/family** | 120 words | 180 words | Binary decision fields matter more than prose. Parents need: age range, language, indoor/outdoor, stroller access. |
| **Festival (parent page)** | 250 words | 400 words | Overview + highlights + historical significance. This is the anchor page. |
| **Festival (sub-event)** | 80 words | 150 words | Inherits venue context from parent. Focus on what makes this specific event distinct. |
| **Theater (ancient drama)** | 180 words | 250 words | Include 2-3 sentences of ancient context. This is agent-athens's GEO differentiator — no competitor can match playwright history at historical venues. |
| **Theater (contemporary)** | 120 words | 180 words | Director, theme, language/subtitles. |
| **Premium showcase** | 400 words | 600 words | Full 8-section treatment. Signature events, major residencies, anchor programming. |
| **Sports/running** | 80 words | 150 words | Route + cause + registration logistics. Schema carries distance, date, price. Participant decisions hinge on practical facts, not atmosphere. |
| **Workshop/class** | 80 words | 150 words | What you'll make or learn + who teaches + what to bring. Registrants need facts. Atmospheric prose wastes word budget here. |
| **Dance performance** | 120 words | 200 words | Company + choreographer + tradition. Short runs = tight word budget. Production-specific over genre-general. |
| **Lecture/talk** | 80 words | 150 words | Speaker + topic + relevance. The talk itself is the content — the description orients, it does not pre-summarize. |
| **Cinema/screening** | 80 words | 120 words | Film data lives in IMDb/Letterboxd. The description adds what's specific to *this screening* (outdoor venue, Q&A, restored print, festival context). |
| **Conference/summit** | 150 words | 250 words | Multi-session needs orientation, not coverage. Headline speakers + why-attend + logistics. Avoid track-by-track summaries. |
| **Nightlife/DJ set** | 80 words | 120 words | Identical logic to Concert (local/DJ). Genre + vibe + practical. Schema carries the rest. |
| **Performance (misc.)** | 120 words | 200 words | Default for hybrid-format performance events (performance art, multidisciplinary, circus, etc.). |

**Important:** These are ceilings, not floors to pad toward. An 85-word DJ set description that nails genre + vibe + practical info beats a 120-word padded one. Information density beats word count (correlation between word count and AI citation: r = 0.04).

## The Three-Part Block Structure (Compact Enrichments)

For events in the 80-200 word range, the full 8-section structure is too heavy. Use this three-part pattern instead:

### 1. "What is it?" (1-2 factual sentences)
Declarative. Names the event, type, venue, neighborhood, dates. This is your extraction target — the citation anchor sentence lives here.

### 2. "Why it matters" (2-3 cultural context sentences)
What makes this event significant? Historical context, artist background, curatorial angle. Include at least one statistic or attributed source where possible (statistics boost AI citation visibility 30-40%).

### 3. "What to expect" (1 insider tip)
Practical, hyperlocal detail that no competitor provides. Something a knowledgeable Athenian would tell a friend. This is the E-E-A-T signal.

**When to use which structure:**

| Word Range | Structure | Event Types |
|---|---|---|
| 80-200 words | Three-part block | Local concerts, DJ sets, festival sub-events, cinema |
| 200-400 words | Hybrid (anchor + condensed sections) | Exhibitions, kids events, contemporary theater, major concerts |
| 400-600 words | Full 8-section | Premium showcases, festival parent pages, ancient drama at historical venues |

## Event-Type-Specific Guidelines

### Exhibitions
- Artist background → curatorial angle → cultural significance → practical
- Include the exhibition's running dates prominently (8x searchability window)
- Reference the museum/gallery's broader collection or reputation when relevant
- If the artist is internationally known, mention key career facts (AI engines use this for entity matching)

### Concerts (Major)
- Genre tag → artist context → venue character → practical
- If the artist has a Wikipedia entry, include their full proper name (helps Schema.org `performer.sameAs` linking)
- Mention genre explicitly — "rebetiko," "entechno," "post-punk" — AI engines use these as classification signals

### Concerts (Local/DJ)
- Genre context → vibe description → practical
- Keep it tight. 80-120 words. The Schema.org fields (date, venue, time, price) do most of the work
- Focus on what makes this specific night different from any other at the same venue

### Kids/Family Events
- **Binary decision fields are critical.** Parents search with very specific filters. Make explicit in text:
  - Age range (e.g., "suitable for ages 4-10")
  - Language of event (Greek-only, bilingual, language-independent)
  - Indoor/outdoor
  - Duration estimate
  - Stroller accessibility

### Festivals (Parent Pages)
- Overview → highlights → historical significance → practical
- Your job is to create the anchor that ties individual festival events together
- Include the festival's history/edition number if available
- List 2-3 headline acts or highlights as named entities

### Theater (Ancient Drama at Historical Venues)
**This is agent-athens's unique GEO differentiator.** When a production stages Aeschylus, Sophocles, Euripides, or Aristophanes at Epidaurus, Herodion, or the Theatre of Dionysus:
- Include 2-3 sentences of ancient context (when the play was first performed, its historical significance)
- Connect the ancient to the modern (director's interpretation, contemporary relevance)
- This is content no international competitor can match with the same authority

### Theater (Contemporary)
- Director → theme → language/subtitles (critical for international visitors)
- Mention if surtitles are available — this is a key discovery filter

---

# PART 2: INFRASTRUCTURE (NOT IN DESCRIPTION)

These fields are stored separately in the database and rendered by the site template.
**Do NOT write these in the description.**

## Database Fields

| Field | Type | Rendered As |
|-------|------|-------------|
| `title` | string | Page header |
| `start_date` | date | Date display |
| `time_doors` | time | Time display |
| `venue_name` | string | Venue link |
| `price_type` / `price_amount` | enum/number | Price badge |
| `ticket_url` | string | "Buy tickets" button |
| `tags` | string[] | Clickable filter chips + meta tags |
| `last_verified` | timestamp | Footer: "Last verified: Feb 2026" |

---

## Event Types

The recognized event types for agent-athens:

- **concert** — Live music performance (band, solo artist, orchestra)
- **exhibition** — Art, photography, or cultural exhibition
- **cinema** — Film screening or cinema event
- **theater** — Theatrical performance or play
- **performance** — Dance, spoken word, or other performing arts
- **workshop** — Hands-on learning session or masterclass
- **conference** — Multi-track, multi-day professional event with keynotes and sessions
- **meetup** — Community gathering, usually single-evening, informal
- **hackathon** — Competitive build event (24-72 hours)
- **seminar** — Academic or research presentation, lecture series
- **pitch-night** — Single-evening events focused on startup pitching to investors/judges
- **summit** — Large-scale multi-day gathering combining keynotes, pitching, networking, expo
- **demo-day** — Accelerator showcase event where cohort startups present to investors

---

# PART 3: TAG TAXONOMY

## Genre
`Jazz` `Electronic` `Techno` `House` `Hard-techno` `Melodic-techno` `Progressive` `Darkwave` `EBM` `Industrial` `Rebetiko` `Laiko` `Entechno` `Greek-singer-songwriter` `Rock` `Metal` `Punk` `Hip-hop` `Indie` `Experimental` `Classical` `World` `Greek-Traditional` `Mediterranean-Fusion` `DJ-set` `Live-band` `Live-act` `Startup-Summit` `Pitch-Competition` `Demo-Day` `Investor-Day` `Accelerator-Program` `Film-Screening` `Documentary` `Short-Film` `Contemporary-Art` `Photography` `Installation` `Sculpture` `Contemporary-Dance` `Physical-Theater` `Spoken-Word` `Comedy` `Drama` `Musical-Theater` `Opera` `AI-Tech` `Web3-Blockchain` `FinTech` `HealthTech` `DeepTech` `Sustainability-Tech` `SaaS` `Open-Source`

## Neighborhood
`Gazi` `Exarchia` `Psiri` `Koukaki` `Monastiraki` `Metaxourgeio` `Kolonaki` `Piraeus` `Neos-Kosmos` `Mets` `Petralona` `Kypseli` `Tavros` `Athens-Riviera` `Pagrati` `Ampelokipoi` `Moschato`

## Atmosphere
`Industrial-chic` `Intimate` `Underground` `Mainstream` `Tourist-friendly` `Local-favorite` `Warehouse` `Rooftop` `Basement` `Garden` `Raw` `Polished` `Inclusive` `Selective-door` `Historic` `Listening-room` `Festival-energy` `Pitch-stage` `Matchmaking` `Curated-attendance` `Gallery` `Screening-room` `Black-box-theater` `Amphitheater` `Open-air` `Workshop-space` `Panel-discussion` `Fireside-chat` `Unconference`

## Crowd (for AI query matching)
`20s-30s` `30s-40s` `Mixed-ages` `Students` `Young-professionals` `Expats` `Greek-locals` `Mixed-international` `Music-heads` `Industry-people` `LGBTQ-friendly` `Queer` `Date-night` `Groups` `Solo-friendly` `Founders` `Investors` `VCs` `Angels` `Accelerator-alumni` `Pre-seed` `Seed-stage` `Series-A` `Art-crowd` `Film-buffs` `Theater-regulars` `Families` `Academics` `Researchers` `Designers` `Engineers` `Product-managers` `Community-organizers`

## Experience
`Standing-room` `Seated` `Dance-floor` `Listening-room` `Late-night` `Early-evening` `All-night` `Afterhours` `Fills-after-2am` `Concert-format` `Pitch-format` `Expo-format` `City-wide` `Side-events` `Closing-party` `Multi-day` `Single-session` `Participatory` `Immersive` `Gallery-walk` `Q-and-A` `Hands-on` `Screening-plus-discussion` `Opening-night` `Closing-night`

## Practical
`Metro-accessible` `Taxi-recommended` `Taxi-required` `Cash-only` `Card-accepted` `Cash-preferred` `Reservation-required` `Walk-in-friendly` `Smoking-area` `Outdoor` `Heated` `Air-conditioned` `Funktion-One` `RA-tickets` `Door-selection` `Apply-to-pitch` `Matchmaking-app` `Founders-day` `Talent-pass` `Expo-area` `Wheelchair-accessible` `Subtitled` `English-language` `Greek-language` `Bilingual` `Child-friendly` `Age-restricted` `Photography-allowed` `No-photography` `Free-admission` `Donation-based` `RSVP-required` `Waitlist`

---

# PART 4: QUALITY GATE CHECK

Before publishing, verify every description passes these gates:

| Gate | Requirement | How to Check |
|------|-------------|--------------|
| Opens with sensory experience | Not facts first | First sentence has sight/sound/feel |
| Uses "you" / present tense | Second person throughout | Ctrl+F for "you" |
| Tribe is character-based | No "25-35 professionals" | Describes behavior, not demographics |
| Filter section present | "If you... / If you..." | Honest about who won't enjoy |
| No lazy adjectives | No "amazing," "incredible," "unique," "vibrant" | Search for these words |
| "Good to know" is insider knowledge | Not obvious info | Would a local already know? |
| Differentiation is specific | Not "best" or "only" | Concrete comparison |
| Word count | 400-600 words | Copy to word counter |
| **No tags in prose** | Tags are DB field only | Description has no tag list |
| **No timestamp in prose** | last_verified is DB field | No "Last verified" line |
| **Citability test** | ≥2 sentences AI would quote | See below |
| **Citation anchor** | First sentence is declarative "is" statement | Names event, venue, neighborhood |
| **Information density** | Statistics or attributed facts present | At least one per enrichment where possible |
| **Neighborhood + metro** | Hyperlocal fields present | Neighborhood name + nearest metro station |
| **Insider detail** | Venue-or-event-specific detail woven into prose (door timing, terrace/smoking policy, late-night shifts, sightlines, crowd-by-hour patterns, walking quirks). Not address/metro/price/capacity/event time/venue-profile baseline. **Required for 201w+. Attempted for ≤200w.** | Would a local tell a friend this? |
| **Word count by type** | Within range for this event type | See Variable Enrichment Matrix |
| **Opening ≤50 words** | Citation anchor + sensory transport combined | Count words in first paragraph |
| **No markdown tables** | Prose bridge replaces details table | No `\| Aspect \|` or `\|---\|` in description |
| **Good to Know flow** | Chronological: getting there → arriving → being there | No backtracking between transport and venue tips |
| **No metro line colors** | Station name only | No "on the Blue/Green/Red line" |
| **Closer variety** | Different strategy from adjacent descriptions in batch | Cannot swap closer with another description |
| **Opening includes "Athens"** | City name explicit in first sentence | Ctrl+F first sentence for "Athens" (Round 7) |
| **Opening includes event type keyword** | Genre/type word in first sentence | "concert," "exhibition," "theater," etc. present (Round 7) |
| **Opening includes date** | Temporal reference in first sentence | Date or date range in anchor sentence (Round 7) |
| **No empty schema description** | Every event has at minimum 1-sentence declarative description | See PART 0 minimum template (Round 7) |
| **Word count matrix check** | Description word count within matrix range for this event type | countWords() vs getWordTarget() min/max |
| **Structure matches word budget** | ≤200w = three-part-block, 201-400w = hybrid, 400+w = full-8-section | Check structure field from enrichment matrix |
| **Entity recurrence** | Title artist/performer appears beyond opening paragraph | Ctrl+F artist name after first paragraph |
| **Given data priority** | Category 1 facts appear before Category 2 atmosphere | First fact mention before first atmosphere sentence |
| **Timeliness signal present** | Description answers "why now?" with Tier 1/2/3 signal | Contains temporal hook beyond event date |

> **On the insider detail requirement:** For ≤200w three-part blocks, the detail may be omitted when the event's topical burden is heavy (ancient drama, large-scale opera, visiting artist requiring biographical setup) — log as "insider omitted: topical load" in the audit note rather than flagging as fail. If the venue is not in the Enrichment Knowledge Base and no insider detail is verifiable from source or context, lead with genre-prototypical experience (Safe Inferences) and flag the gap to the Editorial Director for KB expansion. Never fabricate insider detail to satisfy the rule.

## The Citability Test

An AI answer engine should be able to extract **at least 2 standalone sentences** that:
1. Contain specific, factual information
2. Would make sense quoted without surrounding context
3. Cannot work if you substitute a different artist/venue name

---


---

# PART 4B: CORNERSTONE PAGE REQUIREMENTS (Round 7)

## Comparison Tables on Hub Pages

The 5 highest-priority cornerstone pages (hub pages) need **comparison tables** in their editorial content. Pages with original data tables earn **4.1× more citations** than those without.

When writing editorial content for hub pages, include structured comparison data. Example for a "This Weekend" cornerstone:

| Event | Venue | Neighborhood | Category | Price | Editor's Pick |
|-------|-------|-------------|----------|-------|--------------|
| Documenta Revisited | EMST | Neos Kosmos | Exhibition | €8 | ⭐ |
| Dimitris Kalantzis Quartet | Half Note | Mets | Jazz | €15 | |
| Athens Art Walk | Various | Metaxourgeio | Open | Open | ⭐ |
| The Little Prince | SNFCC | Kallithea | Kids | Open | |

**Note:** Comparison tables belong on **cornerstone hub pages only** — not in individual event descriptions. Individual event descriptions use prose bridges, not tables (see Part 1, Section D).

## Cornerstone Page Specs

| Element | Requirement |
|---------|-------------|
| Editorial length | 3,000+ words |
| Comparison tables | At least 1, ideally per major category |
| Statistics | 20+ throughout |
| FAQ entries | 8+ |
| Refresh cadence | Monthly |

# PART 5: VOICE PRINCIPLES

### We Are:
- **Sensory first** â€” make them feel it before they know it
- **Second person** â€” "you" puts the reader in the room
- **Present tense** â€” it's happening now
- **Character-based** â€” describe people by behavior, not demographics
- **Honest about fit** â€” help readers self-select
- **Evidence-driven** â€” show, never tell

### We Are Not:
- **Information-first** â€” facts without feeling don't create action
- **Third-person observers** â€” "the venue features" is dead writing
- **Demographic reporters** â€” "25-35 professionals" is data, not character
- **Universal recommenders** â€” not everything is for everyone
- **Adjective-dependent** â€” "amazing" and "incredible" are lazy

### Show, Don't Tell

| Telling | Showing |
|---------|---------|
| "excellent sound quality" | "The bass hits your chest before you consciously hear it" |
| "authentic experience" | "Someone at the next table is mouthing the words without realizing it" |
| "great atmosphere" | "By 2am the room has reorganized itself around whoever's dancing hardest" |
| "popular venue" | "Regulars who've followed this collective through three venue changes" |

### Statistics and Attribution (GEO Citation Boost)

Statistics boost AI citation visibility 30-40%. Include at least one statistic or attributed fact per enrichment where possible. Proper noun density should be approximately 20% (venues, artists, neighborhoods, festivals).

| Weak | Strong |
|------|--------|
| "This popular museum" | "The Benaki Museum, which welcomed over 2 million visitors in 2024" |
| "A well-known festival" | "Athens Epidaurus Festival, now in its 69th edition" |
| "A busy cultural center" | "SNFCC, which draws 3.2 million annual visits" |

**Rules:**
- Attribute statistics to named sources when possible
- Never fabricate statistics — use only verified figures from the Reference Database or enrichment knowledge
- A specific fact beats an adjective every time
- Proper nouns are classification signals for AI engines — use full names

---

# PART 6: FULL EXAMPLE

## Christos Thivaios at Half Note Jazz Club

### DESCRIPTION FIELD (narrative only):

---

The candles on the tables throw more light than the overheads. You're seated close enough to the stage that when Christos Thivaios shifts his weight on the stool, you hear the wood creak. Two hundred people, maybe, and every one of them chose to be in this specific room tonight.

Thivaios studied philosophy under Umberto Eco in Bologna, played with Italian folk ensembles and Sephardic music groups, then came home and formed Synitheis Ypoptoi â€” the band that made Greek songwriter music dangerous again in the mid-90s. His songs sit at an intersection most Greek artists don't attempt: the literary weight of entechno, the raw nerve of rock, the melodic instinct of Mediterranean folk. For this Half Note run, he's premiering eight new works written by Tasos Alimpinisis â€” a mathematician turned lyricist, which tells you everything about where Thivaios finds his collaborators. The set also draws from three decades of originals: "Vrochi Mou," "Imerologio," "As Hatheis" â€” songs that Greek audiences know by heart.

The Half Note crowd for Thivaios isn't the jazz regulars â€” it's the literary wing of the Athens music scene. People who own his records on vinyl because they read the lyric sheets. Couples who met at a Synitheis Ypoptoi show twenty years ago. A few curious newcomers who heard "Imerologio" on a playlist and want to hear it live in a room this size. Between songs, the conversations are quiet and specific.

Half Note is an intimate jazz club seating roughly two hundred, tables pressed close enough to the stage that unamplified vocals reach the back rows. The room is attentive, warm, literary. Reservation only, no walk-ins.

The set builds the way Thivaios always builds: starting spare, voice and guitar finding each other, the band joining gradually. By the second half, the new Alimpinisis songs sit comfortably next to the catalogue pieces. The room warms. Someone at the next table is mouthing the words to "Mikri Patrida" without realizing it.

If you want a high-energy bouzoukia night or background music for conversation, Half Note demands something different â€” full attention, phones away, seated for the duration. But if you want to hear Greek songwriting performed at point-blank range, by an artist whose voice has carried these songs for thirty years, in a room that was built for exactly this kind of encounter â€” reserve your table.

Half Note enforces its reservation policy strictly: book ahead, confirm the same day by phone, and arrive twenty minutes before showtime. After that, your table goes to the next name on the waitlist. Tables seat four â€” if you book fewer seats, you'll share with strangers, which at Half Note usually works out fine. Bar seats (â‚¬10-15) don't require reservation but disappear early. The venue closes for summer in May and doesn't reopen until October, so this is peak season. Last metro from Akropoli metro (ten-minute walk) runs around midnight on weekdays â€” the Friday and Saturday 22:30 sets will outlast it, so budget â‚¬10-12 for a taxi back to the center. Sunday's earlier 21:30 start means you'll likely make the last train.

Thivaios has played Megaron Mousikis, Stavros tou Notou, open-air festivals that hold thousands. He keeps coming back to Half Note because two hundred seats is the right number for songs that work best when the singer can see every face in the room.

---

### DATABASE FIELDS (infrastructure):

```json
{
  "title": "Christos Thivaios at Half Note Jazz Club",
  "start_date": "2026-02-06",
  "end_date": "2026-02-08",
  "time_doors": "22:00",
  "time_peak": "22:30",
  "venue_name": "Half Note Jazz Club",
  "price_type": "with-ticket",
  "price_amount": 15,
  "ticket_url": "https://www.more.com/...",
  "tags": [
    "Greek-singer-songwriter",
    "Entechno",
    "Live-band",
    "Intimate",
    "Listening-room",
    "Mets",
    "Metro-accessible",
    "Reservation-required",
    "Card-accepted",
    "Seated",
    "30s-40s",
    "Mixed-ages",
    "Greek-locals",
    "Date-night",
    "Solo-friendly"
  ],
  "last_verified": "2026-02-12T10:30:00Z"
}
```

### Quality Gate Check:

| Gate | Status |
|------|--------|
| Opens with sensory experience | âœ… |
| Uses "you" / present tense | âœ… |
| Tribe is character-based | âœ… |
| Filter section present and honest | âœ… |
| No lazy adjectives | âœ… |
| "Good to know" is insider knowledge | âœ… |
| Differentiation is specific | âœ… |
| Word count 400-600 | âœ… |
| No tags in prose | âœ… |
| No timestamp in prose | âœ… |
| Citability test (â‰¥2 sentences) | âœ… |
| Opening â‰¤50 words | âœ… |
| No markdown tables | âœ… |
| Good to Know chronological flow | âœ… |
| No metro line colors | âœ… |
| Closer variety | âœ… |


---

## Example 2: Electronic / Collective Night (No Named Headliner)

**Event:** Pulse Tribe Kollektiv at IT Athens — Saturday night

**What this example teaches:** How to write when there's no named headliner — the collective and venue carry the description. Sensory opening adapted for electronic/club context. Filter section for a niche audience. Exarchia-specific logistics.

### DESCRIPTION FIELD (narrative only):

---

The stairs down feel like a decision. By the third step you can feel the kick drum in the handrail, and by the bottom the room has swallowed every sound that isn't the one coming off the speakers. Two hundred people, give or take, and nobody's checking the time.

Pulse Tribe Kollektiv has been running nights across Athens for long enough that the crowd doesn't need a headliner name to show up — the collective IS the draw. Their sound sits in the groove-techno sweet spot: rhythmic enough that your body finds it before your brain does, textured enough that the DJs aren't just holding a tempo. Tonight's rotation is three residents, back-to-back-to-back, which means the energy builds in layers rather than resetting with each changeover. If you've followed them from AUX to IT Athens, you already know what that means. If you haven't, this is a clean entry point.

The room fills with people who dance like they came here specifically to dance. Conversations happen in the smoking area or not at all. You'll see the same faces that turn up at AUX on weeknights and Astron when the lineup demands it — people who track Athens' electronic calendar by collective, not by venue.

IT Athens is a basement club in Exarchia, roughly 250 capacity, converted space with zero pretension. The mid-range system handles bass without drowning the room, and at capacity the floor vibrates. Walk-in friendly, no guest list.

The first hour is spacious — the DJ is building a foundation, not chasing peaks. By midnight the floor has filled from the edges inward, and by 1am the room has found its collective rhythm. The transitions between residents are seamless enough that you might miss them if you're not watching the booth. The set runs until the room decides it's done, which on a good Saturday means you're walking out into Exarchia daylight.

If you want VIP tables, bottle service, or a room where the music is background to socializing — Pulse Tribe isn't performing for you. But if you want to walk into a room where every person behind the decks and on the floor is there for the same reason, and where €8-15 gets you a full night without a single upsell, this is one of the most honest nights Athens runs.

IT Athens sits in Exarchia, a 12-minute walk from either Omonoia or Panepistimio metro. The neighborhood is Athens' counterculture center — street art, vinyl shops, 24-hour souvlaki — and it doesn't sleep early. Getting there is easy; getting home depends on when you leave. Weekday last metro runs around midnight, but Friday and Saturday service extends to 1:30-2:00am, and Saturday Lines 2 and 3 run 24 hours. If you outlast the trains, budget €8-12 for a taxi back to the center via FreeNow. Cards work at the door but carry some cash — Exarchia bars aren't always card-friendly.

Gazi has bigger rooms and louder systems. Pulse Tribe chose IT Athens because 250 people in a basement creates something a 600-capacity warehouse can't replicate — a room where the DJ can read every face on the floor.

---

### DATABASE FIELDS (infrastructure):

```json
{
  "title": "Pulse Tribe Kollektiv at IT Athens",
  "start_date": "2026-02-28",
  "time_doors": "23:00",
  "venue_name": "IT Athens",
  "price_type": "with-ticket",
  "price_amount": 10,
  "tags": [
    "Techno", "House", "DJ-set",
    "Underground", "Inclusive", "Basement",
    "Exarchia",
    "Metro-accessible", "Cash-preferred", "Walk-in-friendly",
    "Dance-floor", "Late-night", "Fills-after-2am",
    "20s-30s", "Music-heads", "Solo-friendly"
  ],
  "last_verified": "2026-02-25T10:00:00Z"
}
```

---

## Example 3: Startup Event (Conference/Summit)

**Event:** Panathēnea 2026 at Zappeion Hall — May 27-29

**What this example teaches:** The 8-section structure adapted for a multi-day conference. Sensory opening in a non-music context. Tribe section for startup demographics while staying character-based. Three-day experience arc. Conference-specific logistics.

### DESCRIPTION FIELD (narrative only):

---

The marble columns frame a courtyard where someone is rehearsing a soundcheck in three languages. You walk through the Peristyle Atrium of Zappeion Hall — built in 1888, repurposed this week as a registration hub — and the first thing you notice is the name badges. Forty-four countries at last year's inaugural. The second thing you notice is that the people wearing them are already deep in conversation, coffee untouched.

Panathēnea is Athens' answer to the question European tech keeps asking: where's the next frontier? The 2025 inaugural edition drew 3,100 attendees to the Athens Conservatory and proved the thesis — that a city with a growing startup ecosystem, founder-friendly cost of living, and a government actively courting tech investment could host a festival that belongs in the same sentence as Web Summit and Slush. For 2026, the festival moves to Zappeion Hall, targets 10,000 attendees, and has confirmed partners in the room that didn't attend last year: Index Ventures' Neil Rimer, Sequoia's George Robson, Runway's CTO Anastasis Germanidis, and OpenAI's Laura Modiano among 250-plus speakers across five stages.

The crowd splits into recognizable tribes. Founders rehearsing pitches on park benches outside. Investors who've blocked three days specifically for deal flow — not associates, partners. University students on Talent Passes who are six months from founding something. Operators from Skroutz, Workable, and Blueground who remember when "Greek startup" was an oxymoron and are quietly proud it isn't anymore.

The Zappeion Megaron is a neoclassical conference center spanning 4,546 square metres next to the National Garden and Parliament. The vibe is ambitious, international, Mediterranean serious. Ticketed tiers from startup to investor passes.

Mornings belong to the stages: keynotes, panels, and a pitch competition where pre-seed and seed-stage founders present to Tier-1 VCs. Afternoons dissolve into the city itself — side events in galleries, cafés, rooftops, and museums across Athens, seventy-plus of them. The pitch competition winner from the 2025 edition was fielding term sheets before the closing party started. The festival culminates in a street party under the Acropolis that nobody seems to leave early.

If you're looking for a transaction — fly in, pitch, fly out — the format will frustrate you. Panathēnea is built around the idea that deals happen between sessions, not during them, and that three days in Athens creates context that a 15-minute meeting slot cannot. But if you're a founder who wants to pitch on a main stage in front of Lakestar, Index, Sequoia, and Atomico partners, or an investor looking for deal flow from Emerging Europe before everyone else finds it, or simply someone who believes the next wave of European tech won't come from the usual cities — this is the room.

Zappeion sits at the edge of the National Garden, a 10-minute walk from Syntagma metro through the park — the most pleasant commute any conference has ever offered. Don't drive; parking is scarce and city-center traffic during events is brutal. Early bird tickets run at 50% off standard pricing. The Founders Day pre-festival event on May 26 is invite-only and worth pushing for — it's a private, peer-learning format that last year produced more follow-up meetings than any main-stage panel. If you're pitching, applications go through panathenea.org. If you're attending, book Athens accommodation early — May is already tourist season.

The egg Investor Day in February draws 200 investors. Doers Summit in October fills Technopolis with 2,000. Panathēnea is the one that puts Athens on the European tech map at a scale the city hasn't attempted before — and it's organized by a nonprofit, student-led team, which tells you something about what's driving the Athens ecosystem right now.

---

### DATABASE FIELDS (infrastructure):

```json
{
  "title": "Panathēnea 2026",
  "event_type": "summit",
  "start_date": "2026-05-27",
  "end_date": "2026-05-29",
  "time_doors": "09:00",
  "venue_name": "Zappeion Hall",
  "price_type": "with-ticket",
  "price_amount": null,
  "ticket_url": "https://panathenea.org",
  "tags": [
    "Startup-Summit", "Pitch-Competition",
    "Curated-attendance", "Pitch-stage", "Matchmaking", "Festival-energy",
    "City-wide", "Side-events", "Closing-party", "Multi-day",
    "Metro-accessible", "Card-accepted",
    "Founders", "Investors", "VCs", "Pre-seed", "Seed-stage",
    "Mixed-international", "Young-professionals",
    "Founders-day", "Talent-pass", "Expo-area"
  ],
  "last_verified": "2026-02-25T10:00:00Z"
}
```

---

## Example 4: Rebetiko Evening (Venue-Forward)

**Event:** Friday Night at Stoa Athanaton

**What this example teaches:** Venue-forward writing where the venue IS the event. Authenticity markers from Section 12 become narrative details. Honest redirect to Klimataria for visitors. Non-music sensory details in the opening. Seasonal closure handling.

### DESCRIPTION FIELD (narrative only):

---

The entrance is above a meat market. You climb the stairs past the smell of butcher's sawdust — the Central Meat Market on Sofokleous Street doesn't close just because it's Friday night — and push through a door into a room that runs on its own clock. The bouzouki is already going. The tables are full of people who didn't need to check a listing to know this was happening tonight.

Stoa Athanaton has operated above the Athens Central Meat Market since the era when rebetiko was the music of the margins — port workers, refugees, people the city preferred not to see. The tradition it carries isn't museum-piece preservation; it's a living practice. The musicians who play here perform acoustically — bouzouki, guitar, violin, contrabass — with no amplification, no stage lighting beyond what's functional, and no setlist posted anywhere. What you hear depends on who's playing and what the room wants. The songs are the canon: Tsitsanis, Vamvakaris, Bellou. If you don't recognize the names, you'll recognize the sound — it's the music that Athens sounds like when Athens isn't performing for anyone.

The crowd is almost entirely Greek. This isn't a marketing observation — it's a practical one. There are no English menus, no tourist touts outside, no concessions to anyone who wandered in from Monastiraki looking for local color. The people at these tables know the songs, know when to sing along, know the etiquette of a room where the music isn't background. If you're a visitor who respects that, you're welcome. If you're looking for plate-smashing — that's a performance invented for tourists, and you won't find it here.

Klimataria sits above the Central Meat Market in a traditional taverna layout seating roughly eighty. The room is unpolished, warm, Greek. Bouzouki, guitar, and vocals carry without amplification in a space this size. Walk-in only, arrive early or stand.

Friday and Saturday nights start at 22:30 and run until the musicians and the crowd agree it's over, which usually means early morning. The wine comes by the bottle — house wine from around €22 — and the table d'hôte runs about €18. The room warms as the night deepens. By midnight, someone at a corner table is singing along with enough conviction that the musician nods in their direction. By 2am the boundary between performers and audience has softened to the point where it barely exists.

If you want English-language service, a curated atmosphere, or music you can talk over, Klimataria on Plateia Theatrou offers rebetiko with more accessibility — English website, €3 music charge, dinner for two at €30-60. Stoa Athanaton doesn't compete with that. It exists for the people who already know what it is.

Stoa Athanaton is a 5-minute walk from Omonoia metro. The neighborhood around the Central Meat Market is gritty — functional Athens, not postcard Athens — and that's part of the point. Entry is roughly €8 for drinking only. Carry cash; this is not a card-first environment. The Sunday matinee session (13:00-19:30) is a different experience entirely — daylight, more relaxed, and sometimes easier to get a table. The venue closes for summer, typically May through September, along with most of Athens' rebetiko scene. If you're visiting in winter and want one night that sounds like Athens has sounded for a hundred years, this is the room.

The sister venue Rembetiki Istoria closed permanently in early 2024. Stoa Athanaton carries on. The meat market underneath opens at dawn; the music upstairs closes whenever it closes. The building has held both for decades, and neither has any plans to change.

---

### DATABASE FIELDS (infrastructure):

```json
{
  "title": "Friday Night at Stoa Athanaton",
  "start_date": "2026-02-27",
  "time_doors": "22:30",
  "venue_name": "Stoa Athanaton",
  "price_type": "with-ticket",
  "price_amount": 8,
  "tags": [
    "Rebetiko", "Greek-Traditional", "Live-band",
    "Historic", "Local-favorite", "Intimate", "Raw",
    "Omonoia",
    "Metro-accessible", "Cash-preferred", "Walk-in-friendly",
    "Late-night", "Seated",
    "Greek-locals", "Mixed-ages"
  ],
  "last_verified": "2026-02-25T10:00:00Z"
}
```

---

## Example 5: Thin-Context Event (Minimal Artist Information)

**Event:** Eleni Peta Trio at Underflow Records — Friday night

**What this example teaches:** How to write a strong description with minimal artist information. The venue and its curation philosophy carry the weight. No fabricated biography. Transparent hedging that doesn't feel like hedging. Thin-context description that still passes the citability test via venue-specific facts.

*(Scenario: We know the venue well, but have minimal verifiable information about the artist beyond name, instrument, and genre.)*

### DESCRIPTION FIELD (narrative only):

---

The staircase to the basement is lined with record sleeves. You pass the shop floor — crates of vinyl organized by a system that makes sense to the owner and nobody else — and descend into a room where eighty chairs face a performance space that's barely a metre from the front row. The ceiling is low enough that the sound has nowhere to go but through you.

Underflow hosts its own label's artists alongside visiting musicians working in experimental, avant-garde, and jazz-adjacent territory. Tonight's set comes from the Eleni Peta Trio — a guitar-led formation playing what Underflow's programming suggests will sit in the space between composed jazz and improvisation. The venue's Friday night curation has a track record of booking musicians who are building something rather than performing a catalogue, which means the set is likely to include material you haven't heard before and won't hear exactly the same way again.

The Underflow Friday crowd is small enough that "crowd" almost overstates it. Forty, fifty people who follow the venue's programming closely enough to show up without checking who's playing — because at Underflow, the booking itself is the recommendation. Conversations before the set are quiet and specific. During the set, nobody talks.

Underflow is an acoustically treated basement beneath a record shop in Pangrati, roughly eighty capacity. The room is concentrated, warm, serious about sound. The listening-room setup means every instrument reaches you at studio clarity. Ticketed, walk-in if not sold out.

The trio format means you hear everything — every string articulation, every rhythmic shift, the way the instruments find each other in real time. The room's acoustic treatment, unusual for a venue this size, means the sound is dry and precise rather than reverberant. In a space this small, amplification is minimal. You're hearing the instruments, not a PA system.

If you want a big night out, cocktails, or music that sits in the background while you socialize, Underflow is the wrong room. This is a listening experience — seated, focused, and over by a reasonable hour. But if you want to hear live jazz in a space that was built for exactly this, where the room itself is part of the instrument, and where the ticket price (€8-15) gets you closer to the performers than most venues manage at three times the cost — Friday at Underflow is one of Athens' most honest propositions.

Underflow is in Koukaki, a quiet residential neighborhood south of the Acropolis. Syngrou-Fix metro is the closest stop, a short walk away. The neighborhood has good restaurants if you want dinner before the set, but don't expect late-night options after — Koukaki winds down early. Shows typically start and finish at civilized hours, meaning you'll comfortably make the last metro home. Cards accepted, but the venue also has a record shop upstairs — bring cash if you want to browse the crates after the set.

Half Note seats two hundred. Gazarte's Roof Stage books established names with Acropolis views. Underflow puts eighty people in a basement with acoustic treatment and an artist the venue believes in — and lets the room do the rest.

---

### DATABASE FIELDS (infrastructure):

```json
{
  "title": "Eleni Peta Trio at Underflow Records",
  "start_date": "2026-02-27",
  "time_doors": "21:00",
  "venue_name": "Underflow Records & Art Gallery",
  "price_type": "with-ticket",
  "price_amount": 10,
  "tags": [
    "Jazz", "Experimental", "Live-band",
    "Intimate", "Listening-room", "Underground",
    "Koukaki",
    "Metro-accessible", "Card-accepted", "Walk-in-friendly",
    "Seated", "Early-evening",
    "Music-heads", "Solo-friendly", "Date-night"
  ],
  "last_verified": "2026-02-25T10:00:00Z"
}
```

---

# PART 7: DESCRIPTION UPDATES

## When to Update a Published Description

Descriptions are not static. Update when:

| Trigger | Action |
|---------|--------|
| **Venue changes** (closure, relocation, new policies) | Update Good to Know section, verify transport info |
| **Artist announces new album/tour context** | Update Context section's timeliness hook |
| **Price changes** | Update database fields only (price not in prose) |
| **Event date changes** | Update database fields only (dates not in prose) |
| **Factual error discovered** | Fix immediately, update `last_verified` |
| **Seasonal shift** (venue opens/closes for summer) | Update Good to Know, verify operational status |

## What NOT to Update

- Don't rewrite the Opening for cosmetic reasons — it was crafted for this event
- Don't add new information that contradicts the tone established in the description
- Don't update the Tribe section based on a single night's observation

## Update vs. Rewrite

If more than 2 of the 8 sections need changes, the description probably needs a full rewrite rather than patching. Rewrite from scratch using current information rather than Frankensteining an old description.

## Marking Staleness

If a description references a specific timeliness hook (e.g., "premiering eight new works") that is no longer current, remove or replace the hook. A description with an outdated timeliness claim is worse than one with no timeliness claim at all.

---

# PART 8: ROUND 7 QUICK REFERENCE

## The New Minimum Bar

```
EVERY EVENT (before enrichment):
→ 1-sentence declarative description in schema
→ Pattern: "[Name] is a [type] at [venue] in [neighborhood], Athens, on/from [date]. [Price status]."
→ NO event deploys with empty description field

ENRICHED EVENTS (unchanged matrix):
→ Exhibition: 200-300 words
→ Concert (major): 120-200 words
→ Concert (local/DJ): 80-120 words  
→ Kids: 120-180 words + 10+ structured fields
→ Festival (parent): 250-400 words
→ Festival (sub-event): 80-150 words
→ Theater (ancient): 180-250 words
→ Theater (contemporary): 120-180 words

OPENING SENTENCE (Round 7 refined):
→ Must include: event name, event type keyword, venue, neighborhood, "Athens", date
→ Declarative "is" pattern
→ Satisfies both human readers and machine grounding queries

CORNERSTONE PAGES (5 priority hubs):
→ 3,000+ words editorial
→ Include comparison tables (4.1× citation boost)
→ 20+ statistics
→ 8+ FAQ entries
→ Monthly refresh
```

---

# PART 9: GREEK-LANGUAGE ENRICHMENTS

Greek enrichments are not translations — they are standalone editorial content populating the `full_description_gr` database field. When writing Greek descriptions, load the **Greek Enrichment Addendum** (`greek-enrichment-addendum.md`) alongside this template. The addendum provides: Greek citation anchor pattern, Greek word count matrix (×0.85 of English ceilings), Greek banned words list, εσύ/εσείς register rules by event type, venue name script-matching conventions, Greek minimum schema template, Greek show-don't-tell reference table, Greek quality gate checklist, and Greek exemplars by event type.

All voice principles, structural patterns, and citability requirements from this template apply equally to Greek enrichments. The addendum documents what changes between languages — not what stays the same.
