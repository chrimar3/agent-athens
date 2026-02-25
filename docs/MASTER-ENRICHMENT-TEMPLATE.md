# agent-athens: Master Enrichment Template
## Premium Event Descriptions for AI Answer Engines

*Version 2.1 — February 2026*

---

## How This Template Works

Every enriched event has **two distinct content layers**:

| Layer | Purpose | Where It Lives |
|-------|---------|----------------|
| **DESCRIPTION field** | Narrative content only | `full_description` column in DB |
| **Infrastructure** | Tags, timestamps, metadata | Separate DB fields, rendered by site template |

**Critical distinction:**
- The DESCRIPTION is **pure narrative** — what humans read and AI engines cite
- Tags, `last_verified`, dates, prices, addresses, JSON-LD are **infrastructure around** the description
- The site template renders all infrastructure automatically from DB fields

---

# PART 1: WHAT GOES IN THE DESCRIPTION FIELD

The description is **narrative content only**. No tags, no timestamps, no metadata.

## Structure Overview

```
[OPENING - Sensory, present tense, "you"]

[CONTEXT - Artist/event significance + timeliness hook]

[TRIBE - Crowd described by character, not demographics]

| Aspect | Details |
|--------|---------|
| **Setting** | [Venue type + capacity + key feature] |
| **Vibe** | [2-3 atmosphere descriptors] |
| **Sound** | [Listening room / Dance floor / Background] |
| **Door** | [Selection policy if relevant] |

[EXPERIENCE - The arc of the night, what happens]

[FILTER - "If you... / If you..." honest self-selection]

[GOOD TO KNOW - Insider practical knowledge as prose paragraph]

[DIFFERENTIATION - Why this over alternatives]
```

**Word count:** 400-600 words of pure narrative.

---

## A. The Opening (Transport Before Inform)

**Purpose:** Put the reader IN the experience before giving any facts.

**Format:** 2-3 sentences. Sensory. Present tense. Second person ("you"). Under 50 words.

**Template:**
```
[SENSORY_DETAIL - what you see/hear/feel arriving].
[THE_ATMOSPHERE - the energy of the space].
[THE_PROMISE - what this moment offers].
```

**Example:**
```
The candles on the tables throw more light than the overheads. You're seated
close enough to the stage that when the musician shifts weight on the stool,
you hear the wood creak. Two hundred people, maybe, and every one of them
chose to be in this specific room tonight.
```

**Rules:**
- Uses "you" (second person)
- Present tense
- At least 2 sensory details
- NO FACTS YET — pure experience

---

## B. The Context (What Is This? + Why Now?)

**Purpose:** Artist background, genre, timeliness — through a Resonance lens.

**Format:** 1-2 paragraphs. Show, don't tell.

**Template:**
```
[ARTIST_NAME] [WHAT_THEY_DO - specific, not generic].
[CONTEXT - why they matter, what tradition they come from].
[TIMELINESS - why now, what makes this moment special].
```

**Example:**
```
Thivaios studied philosophy under Umberto Eco in Bologna, played with Italian
folk ensembles and Sephardic music groups, then came home and formed Synitheis
Ypoptoi — the band that made Greek songwriter music dangerous again in the
mid-90s. His songs sit at an intersection most Greek artists don't attempt:
the literary weight of entechno, the raw nerve of rock, the melodic instinct
of Mediterranean folk. For this Half Note run, he's premiering eight new works
written by Tasos Alimpinisis — a mathematician turned lyricist, which tells
you everything about where Thivaios finds his collaborators.
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

**Example:**
```
The Half Note crowd for Thivaios isn't the jazz regulars — it's the literary
wing of the Athens music scene. People who own his records on vinyl because
they read the lyric sheets. Couples who met at a Synitheis Ypoptoi show twenty
years ago. A few curious newcomers who heard "Imerologio" on a playlist and
want to hear it live in a room this size. Between songs, the conversations
are quiet and specific.
```

**Note:** Demographic markers go in the `tags` DB field for AI query matching. Use character descriptions in prose.

---

## D. The Details Table

**Purpose:** Scannable practical info embedded in the narrative.

**Format:** Markdown table with 4 key aspects.

```markdown
| Aspect | Details |
|--------|---------|
| **Setting** | [VENUE_TYPE + capacity + key feature] |
| **Vibe** | [2-3 atmosphere descriptors] |
| **Sound** | [Listening room / Dance floor / Background] |
| **Door** | [Selection policy — reservation, walk-in, etc.] |
```

**Example:**
```markdown
| Aspect | Details |
|--------|---------|
| **Setting** | Intimate jazz club, ~200 capacity, tables pressed close to stage |
| **Vibe** | Attentive, warm, literary — this is a listening room |
| **Sound** | Acoustic-forward, unamplified vocals audible in the back rows |
| **Door** | Reservation only — no walk-ins |
```

### Details Table — Tech/Conference Variant

For tech events (conferences, meetups, hackathons, seminars), replace **Sound** and **Door** rows:

| Aspect | Details |
|--------|---------|
| **Setting** | [VENUE_TYPE + capacity + key feature] |
| **Vibe** | [2-3 atmosphere descriptors] |
| **Format** | [Talks / Workshops / Hands-on / Panels / Networking / Hackathon / Seminar] |
| **Access** | [Open / RSVP / Ticketed / Application-based / Invite-only] |

Use the music variant (Sound/Door) for: concerts, DJ sets, live music, club nights, rebetiko.
Use the tech variant (Format/Access) for: conferences, meetups, hackathons, workshops, seminars.

---

## E. The Experience (Arc of the Night)

**Purpose:** What actually happens — the progression.

**Format:** 1 paragraph describing how the event unfolds.

**Example:**
```
The set builds the way Thivaios always builds: starting spare, voice and
guitar finding each other, the band joining gradually. By the second half,
the new Alimpinisis songs sit comfortably next to the catalogue pieces. The
room warms. Someone at the next table is mouthing the words to "Mikri Patrida"
without realizing it.
```

---

## F. The Filter (Self-Selection)

**Purpose:** Help readers choose in or out. This builds trust.

**Format:** "If you... / If you..." structure. Be honest.

**Example:**
```
If you want a high-energy bouzoukia night or background music for conversation,
Half Note demands something different — full attention, phones away, seated
for the duration. But if you want to hear Greek songwriting performed at
point-blank range, by an artist whose voice has carried these songs for thirty
years, in a room that was built for exactly this kind of encounter — reserve
your table.
```

**Checklist:**
- [ ] Honest about who WON'T enjoy it
- [ ] Clear about who WILL love it
- [ ] Not defensive — confident

---

## G. Good to Know (Insider Practical)

**Purpose:** Genuinely useful insider knowledge that saves time/money/frustration.

**Format:** 1 prose paragraph (not bullets). Include:
- Venue policies that catch people out
- Seasonal considerations
- Transport logistics tied to specific show times
- Payment/booking quirks
- Tips that locals would know

**Example:**
```
Half Note enforces its reservation policy strictly: book ahead, confirm the
same day by phone, and arrive twenty minutes before showtime. After that,
your table goes to the next name on the waitlist. Tables seat four — if you
book fewer seats, you'll share with strangers, which at Half Note usually
works out fine. Bar seats (€10-15) don't require reservation but disappear
early. The venue closes for summer in May and doesn't reopen until October,
so this is peak season. Last metro from Akropoli (Red line, 10-minute walk)
runs around midnight on weekdays — the Friday and Saturday 22:30 sets will
outlast it, so budget €10-12 for a taxi back to the center. Sunday's earlier
21:30 start means you'll likely make the last train.
```

---

## H. The Differentiation (Why This Over Alternatives)

**Purpose:** Position against alternatives without naming competitors.

**Format:** 1-2 sentences. Evidence, not claims. Often works as a closer.

**Example:**
```
Thivaios has played Megaron Mousikis, Stavros tou Notou, open-air festivals
that hold thousands. He keeps coming back to Half Note because two hundred
seats is the right number for songs that work best when the singer can see
every face in the room.
```

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

## Event Types

The recognized event types: `concert` `exhibition` `cinema` `theater` `performance` `workshop` `conference` `meetup` `hackathon` `seminar` `pitch-night` `summit` `demo-day`

- **conference** — Multi-session, typically multi-day events with keynotes, panels, breakouts
- **meetup** — Recurring community gatherings, typically single-evening, informal
- **hackathon** — Competitive build events, typically 24-72 hours
- **seminar** — Single-speaker academic or research presentations
- **pitch-night** — Single-evening events focused on startup pitching to investors/judges
- **summit** — Large-scale multi-day gatherings combining keynotes, pitching, networking, expo
- **demo-day** — Accelerator showcase events where cohort startups present to investors

## Tags Field

Tags are stored as an array in the database:
```json
{
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
  ]
}
```

The site template renders these as:
- Clickable filter chips on the event page
- Hidden meta tags for SEO/AI discovery
- Faceted search filters

## Last Verified

The `last_verified` field is updated when:
- Description is written or revised
- Event details are re-confirmed
- Any fact-check occurs

Rendered in a small footer: `Last verified: February 2026`

---

# PART 3: TAG TAXONOMY

## Genre
`Jazz` `Electronic` `Techno` `House` `Hard-techno` `Melodic-techno` `Progressive` `Darkwave` `EBM` `Industrial` `Rebetiko` `Laiko` `Entechno` `Greek-singer-songwriter` `Rock` `Metal` `Punk` `Hip-hop` `Indie` `Experimental` `Classical` `World` `Greek-Traditional` `Mediterranean-Fusion` `DJ-set` `Live-band` `Live-act` `AI` `Machine-Learning` `Data-Science` `Tech-Conference` `Hackathon` `Developer-Conference` `Research-Seminar` `Startup-Event` `Startup-Summit` `Pitch-Competition` `Demo-Day` `Investor-Day` `Accelerator-Program`

## Neighborhood
`Gazi` `Exarchia` `Psiri` `Koukaki` `Monastiraki` `Metaxourgeio` `Kolonaki` `Piraeus` `Neos-Kosmos` `Mets` `Petralona` `Kypseli` `Tavros` `Athens-Riviera` `Pagrati` `Ampelokipoi` `Marousi` `Paleo-Faliro` `Glyfada` `Ellinikon`

## Atmosphere
`Industrial-chic` `Intimate` `Underground` `Mainstream` `Tourist-friendly` `Local-favorite` `Warehouse` `Rooftop` `Basement` `Garden` `Raw` `Polished` `Inclusive` `Selective-door` `Historic` `Listening-room` `Academic` `Corporate` `Startup-energy` `Hands-on` `Conference-center` `Festival-energy` `Pitch-stage` `Matchmaking` `Curated-attendance`

## Crowd (for AI query matching)
`20s-30s` `30s-40s` `Mixed-ages` `Students` `Young-professionals` `Expats` `Greek-locals` `Mixed-international` `Music-heads` `Industry-people` `LGBTQ-friendly` `Queer` `Date-night` `Groups` `Solo-friendly` `Tech-professionals` `Developers` `Founders` `AI-researchers` `AI-practitioners` `Academic-researchers` `C-suite` `Diaspora` `PhD-students` `Investors` `VCs` `Angels` `Accelerator-alumni` `Pre-seed` `Seed-stage` `Series-A`

## Experience
`Standing-room` `Seated` `Dance-floor` `Listening-room` `Late-night` `Early-evening` `All-night` `Afterhours` `Fills-after-2am` `Concert-format` `Workshop-format` `Conference-format` `Hackathon-format` `Seminar-format` `Multi-day` `Networking-event` `Bootcamp` `Daytime-event` `Pitch-format` `Expo-format` `City-wide` `Side-events` `Closing-party`

## Practical
`Metro-accessible` `Taxi-recommended` `Taxi-required` `Cash-only` `Card-accepted` `Cash-preferred` `Reservation-required` `Walk-in-friendly` `Smoking-area` `Outdoor` `Heated` `Air-conditioned` `Funktion-One` `RA-tickets` `Door-selection` `Laptop-recommended` `Wi-Fi-available` `Catered` `RSVP-required` `Application-based` `Invite-only` `Streaming-available` `English-language` `Bilingual-GR-EN` `Apply-to-pitch` `Matchmaking-app` `Founders-day` `Talent-pass` `Expo-area`

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

## The Citability Test

An AI answer engine should be able to extract **at least 2 standalone sentences** that:
1. Contain specific, factual information
2. Would make sense quoted without surrounding context
3. Cannot work if you substitute a different artist/venue name

**Passing examples:**
- "Thivaios studied philosophy under Umberto Eco in Bologna"
- "Half Note enforces its reservation policy strictly: book ahead, confirm the same day by phone"
- "The venue closes for summer in May and doesn't reopen until October"
- "Last metro from Akropoli runs around midnight on weekdays"

**Failing examples:**
- "This is a great venue for music lovers" (generic)
- "The atmosphere is amazing" (no facts)
- "You'll have a wonderful time" (not citable)

---

# PART 5: VOICE PRINCIPLES

### We Are:
- **Sensory first** — make them feel it before they know it
- **Second person** — "you" puts the reader in the room
- **Present tense** — it's happening now
- **Character-based** — describe people by behavior, not demographics
- **Honest about fit** — help readers self-select
- **Evidence-driven** — show, never tell

### We Are Not:
- **Information-first** — facts without feeling don't create action
- **Third-person observers** — "the venue features" is dead writing
- **Demographic reporters** — "25-35 professionals" is data, not character
- **Universal recommenders** — not everything is for everyone
- **Adjective-dependent** — "amazing" and "incredible" are lazy

### Show, Don't Tell

| Telling | Showing |
|---------|---------|
| "excellent sound quality" | "The bass hits your chest before you consciously hear it" |
| "authentic experience" | "Someone at the next table is mouthing the words without realizing it" |
| "great atmosphere" | "By 2am the room has reorganized itself around whoever's dancing hardest" |
| "popular venue" | "Regulars who've followed this collective through three venue changes" |
| "leading AI conference" | "Keynotes from researchers whose papers you've been citing for three years" |
| "great networking opportunities" | "By lunch, three people at your table have already exchanged GitHub repos" |
| "hands-on workshop" | "You walk out with a deployed app that didn't exist four hours ago" |
| "international speakers" | "The panelist on the left flew in from MIT, the one on the right walked over from Marousi" |
| "growing community" | "Last edition had forty people. This one has a waitlist" |
| "cutting-edge research" | "The paper being presented was posted on arXiv six days ago" |
| "innovative startups" | "Three of the presenting teams are already in talks with VCs in the hallway" |
| "diverse attendees" | "PhD students, CTOs, and a government advisor all reaching for the same coffee pot" |

---

# PART 6: FULL EXAMPLE

## Christos Thivaios at Half Note Jazz Club

### DESCRIPTION FIELD (narrative only):

---

The candles on the tables throw more light than the overheads. You're seated close enough to the stage that when Christos Thivaios shifts his weight on the stool, you hear the wood creak. Two hundred people, maybe, and every one of them chose to be in this specific room tonight.

Thivaios studied philosophy under Umberto Eco in Bologna, played with Italian folk ensembles and Sephardic music groups, then came home and formed Synitheis Ypoptoi — the band that made Greek songwriter music dangerous again in the mid-90s. His songs sit at an intersection most Greek artists don't attempt: the literary weight of entechno, the raw nerve of rock, the melodic instinct of Mediterranean folk. For this Half Note run, he's premiering eight new works written by Tasos Alimpinisis — a mathematician turned lyricist, which tells you everything about where Thivaios finds his collaborators. The set also draws from three decades of originals: "Vrochi Mou," "Imerologio," "As Hatheis" — songs that Greek audiences know by heart.

The Half Note crowd for Thivaios isn't the jazz regulars — it's the literary wing of the Athens music scene. People who own his records on vinyl because they read the lyric sheets. Couples who met at a Synitheis Ypoptoi show twenty years ago. A few curious newcomers who heard "Imerologio" on a playlist and want to hear it live in a room this size. Between songs, the conversations are quiet and specific.

| Aspect | Details |
|--------|---------|
| **Setting** | Intimate jazz club, ~200 capacity, tables pressed close to stage |
| **Vibe** | Attentive, warm, literary — this is a listening room |
| **Sound** | Acoustic-forward, unamplified vocals audible in the back rows |
| **Door** | Reservation only — no walk-ins |

The set builds the way Thivaios always builds: starting spare, voice and guitar finding each other, the band joining gradually. By the second half, the new Alimpinisis songs sit comfortably next to the catalogue pieces. The room warms. Someone at the next table is mouthing the words to "Mikri Patrida" without realizing it.

If you want a high-energy bouzoukia night or background music for conversation, Half Note demands something different — full attention, phones away, seated for the duration. But if you want to hear Greek songwriting performed at point-blank range, by an artist whose voice has carried these songs for thirty years, in a room that was built for exactly this kind of encounter — reserve your table.

Half Note enforces its reservation policy strictly: book ahead, confirm the same day by phone, and arrive twenty minutes before showtime. After that, your table goes to the next name on the waitlist. Tables seat four — if you book fewer seats, you'll share with strangers, which at Half Note usually works out fine. Bar seats (€10-15) don't require reservation but disappear early. The venue closes for summer in May and doesn't reopen until October, so this is peak season. Last metro from Akropoli (Red line, 10-minute walk) runs around midnight on weekdays — the Friday and Saturday 22:30 sets will outlast it, so budget €10-12 for a taxi back to the center. Sunday's earlier 21:30 start means you'll likely make the last train.

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

### SITE TEMPLATE RENDERS:

**Header:** Christos Thivaios at Half Note Jazz Club
**Date:** Friday 6 – Sunday 8 February 2026
**Time:** Fri & Sat 22:30 / Sun 21:30
**Venue:** Half Note Jazz Club
**Address:** Trivonianou 17, Mets
**Price:** From €15
**Tickets:** [Buy on more.com]
**Tags:** `Greek-singer-songwriter` `Entechno` `Live-band` `Intimate` ...
**Footer:** Last verified: February 2026

---

### Quality Gate Check for this example:

| Gate | Status |
|------|--------|
| Opens with sensory experience, not facts | ✅ Candles, stage proximity, wood creak |
| Uses "you" / present tense | ✅ Throughout |
| Tribe is character-based | ✅ "literary wing," "people who own his records on vinyl because they read the lyric sheets" |
| Filter section present and honest | ✅ "If you want bouzoukia / If you want point-blank range" |
| No lazy adjectives | ✅ No "amazing," "incredible," "unique," "vibrant" |
| "Good to know" is insider knowledge | ✅ Table sharing policy, summer closure, metro timing per show day |
| Differentiation is specific | ✅ "He keeps coming back to Half Note because 200 seats is the right number" |
| Word count | ✅ ~500 words (pure narrative) |
| No tags in prose | ✅ Tags are in DB field only |
| No timestamp in prose | ✅ last_verified is DB field |
| **Citability test (≥2 sentences)** | ✅ See below |

**Citable sentences an AI engine would quote:**

1. "Thivaios studied philosophy under Umberto Eco in Bologna, played with Italian folk ensembles and Sephardic music groups, then came home and formed Synitheis Ypoptoi"
2. "For this Half Note run, he's premiering eight new works written by Tasos Alimpinisis — a mathematician turned lyricist"
3. "Half Note enforces its reservation policy strictly: book ahead, confirm the same day by phone, and arrive twenty minutes before showtime"
4. "Bar seats (€10-15) don't require reservation but disappear early"
5. "The venue closes for summer in May and doesn't reopen until October"
6. "Last metro from Akropoli runs around midnight on weekdays — the Friday and Saturday 22:30 sets will outlast it, so budget €10-12 for a taxi"

**Substitution test:** None of these sentences work if you replace "Thivaios" or "Half Note" with another artist/venue. ✅

---

*This template tells you HOW to write the narrative description.*
*Tags and timestamps are set separately when saving to database.*
