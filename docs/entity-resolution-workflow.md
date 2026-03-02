# agent-athens: Entity Resolution Workflow
## How We Research, Store, Deduplicate, and Maintain Entity Knowledge

*Version 1.0 — February 2026*

---

## Overview

Every time an event comes through the pipeline, it references entities — artists, venues, collectives, organizers. Without a system for managing entity knowledge, every enrichment starts from scratch. This document defines how entity knowledge compounds over time: research once, reuse forever, update when necessary.

---

# SECTION 1: CONFIDENCE TIERS

All entity information carries a confidence tier. The tier determines how the enrichment writer uses the information.

## Tier 1: Verified

**Definition:** Information confirmed by at least two independent, credible sources. The enrichment writer can state this as fact without hedging.

**Minimum evidence:**
- Two independent sources, at least one primary (artist's own website, official label page, venue's own site, Resident Advisor profile, Spotify/Bandcamp artist page)
- OR one authoritative institutional source (Berklee alumni directory, record label roster, government cultural registry)

**Examples:**
- "Stavros Lantsias studied at Berklee College of Music" — confirmed via Berklee alumni records and multiple press profiles
- "Half Note Jazz Club has operated since 1979" — confirmed via venue's own materials and multiple independent sources
- "Stoa Athanaton is located above the Central Meat Market on Sofokleous Street" — confirmed via multiple sources and in-person verification

**How the enrichment writer uses Tier 1:**
- State directly as fact: "Lantsias trained at Berklee"
- No hedging language needed
- Can be used in citability-critical sentences

**Upgrade path:** N/A — this is the highest tier.
**Downgrade trigger:** Source contradiction discovered, or primary source no longer accessible for re-verification.

---

## Tier 2: Probable

**Definition:** Information from a single credible source, or from multiple sources that aren't fully independent (e.g., multiple articles that clearly reference the same original source). Likely accurate but not cross-verified.

**Minimum evidence:**
- One credible source (established music publication, venue social media, artist interview in a reputable outlet)
- OR multiple sources that trace back to the same origin

**Examples:**
- "Artist X studied composition in Thessaloniki" — mentioned in one interview, not independently confirmed
- "This collective has been running nights since 2019" — stated on their Instagram bio, no independent confirmation
- "Venue capacity is approximately 200" — stated on one listings site, not confirmed by venue

**How the enrichment writer uses Tier 2:**
- Use in descriptions but avoid making it a citability anchor
- Frame with soft attribution where natural: "a formation that emerged from the Thessaloniki conservatory scene"
- Don't build the Context section's core claim around Tier 2 facts alone
- Acceptable in Experience, Good to Know, and Tribe sections where precision is less critical

**Upgrade path:** Find a second independent source → Tier 1.
**Downgrade trigger:** Source credibility questioned, or contradictory information found.

---

## Tier 3: Unconfirmed

**Definition:** Information that exists but can't be cross-referenced. Single-source from a non-authoritative origin, or information pieced together from indirect evidence.

**Minimum evidence:**
- One non-authoritative source (social media comment, forum post, second-hand mention)
- OR inference from indirect evidence (e.g., "they probably play bouzouki based on the venue's acoustic-only policy")

**Examples:**
- "Artist reportedly studied under [specific teacher]" — mentioned in a blog comment, nowhere else
- "Venue may have changed ownership in 2024" — mentioned in a single social media post
- "This DJ is Athens-based" — inferred from frequent Athens bookings, not explicitly stated

**How the enrichment writer uses Tier 3:**
- **Do NOT use in descriptions** as stated fact
- Can inform the writer's understanding of context (helps choose the right framing)
- If the information is important and no higher-tier data exists, the writer should use venue-forward or genre-forward strategies instead of stating the unconfirmed fact
- Can be noted in the entity profile for future research: "UNCONFIRMED: reportedly studied under X — verify"

**Upgrade path:** Find any credible source → Tier 2. Find two independent credible sources → Tier 1.
**Downgrade trigger:** N/A — this is the lowest tier. If actively contradicted, remove the information entirely.

---

## Tier Decision Tree

```
Start: You have a piece of information about an entity.

Q1: Do you have TWO independent, credible sources?
  YES → Tier 1 (Verified)
  NO → Continue

Q2: Do you have ONE credible source (established publication, official page, artist's own materials)?
  YES → Tier 2 (Probable)
  NO → Continue

Q3: Do you have ANY source, even informal?
  YES → Tier 3 (Unconfirmed)
  NO → Do not store. No evidence = no entry.
```

---

# SECTION 2: ENTITY TYPES

## Artists

**Subtypes:** Singer-songwriter, DJ/Producer, Traditional musician, Jazz musician, International touring artist, Classical performer

**Required fields for a usable profile:**
| Field | Required | Notes |
|-------|----------|-------|
| Display name | Yes | Latin transliteration as professionally used |
| Greek name | If Greek artist | Greek script for source matching |
| Slug | Yes | `lowercase-hyphenated-latin` |
| Name variants | If any exist | All known Latin and Greek variations |
| Role/Instrument | Yes | Primary instrument or role |
| Genre | Yes | Specific — "groove techno" not just "electronic" |
| Active status | Yes | Active / Inactive / Unknown |
| Confidence | Yes | Overall profile confidence tier |

**Optional but valuable fields:**
| Field | Value |
|-------|-------|
| Active since | Year or decade |
| Key facts | 2-4 verified biographical facts |
| Discography highlights | 2-4 significant works (Latin transliteration) |
| Collaboration history | Notable collaborators |
| Athens venue associations | Which venues they play |
| Label affiliations | For electronic/DJ artists |
| Tradition/lineage | What musical tradition they come from |
| Sources | All sources consulted |

**Minimum viable profile:** Display name + slug + role/instrument + genre + confidence tier. This is enough to avoid researching the same artist from scratch next time, even if it's not enough to write a rich Context section.

---

## Venues

**Subtypes:** Club/electronic, Live music, Jazz, Rebetiko/traditional, Cinema, Theater, Exhibition, Beach/summer, Conference/startup, Coworking

**Required fields:** Already defined in the reference database and enrichment knowledge base. Venue profiles are the most mature entity type in the system.

**Minimum viable profile:** Name + address + metro + capacity estimate + character description + operational status.

---

## Collectives

**Required fields:**
| Field | Required |
|-------|----------|
| Name | Yes |
| Slug | Yes |
| Sound character | Yes |
| Home venue(s) | Yes |
| Known residents | If identifiable |
| Active status | Yes |

---

## Events (Recurring)

For recurring events that deserve their own entity (e.g., Death Disco Indoor Festival, Athens Rebetiko Festival, Panathēnea):

| Field | Required |
|-------|----------|
| Name | Yes |
| Slug | Yes |
| Frequency | Yes (annual, monthly, etc.) |
| Typical venue | Yes |
| Typical dates | Yes |
| Organizer | If known |
| History | Key facts about past editions |

---

# SECTION 3: ENTITY LOOKUP WORKFLOW

When an event comes through the pipeline with an entity reference (usually an artist name):

## Step 1: Check if the Entity Exists

**Method:** Search existing profiles by slug, then by name variants.

```
1. Generate candidate slug from the incoming name:
   - Lowercase
   - Replace spaces with hyphens
   - Remove diacritics
   - Example: "Χρήστος Θηβαίος" → "christos-thivaios"

2. Search entity profiles for matching slug.

3. If no slug match, search name variants:
   - Check display names
   - Check Greek names (if incoming name is in Greek script)
   - Check stored name variants
   - Apply transliteration normalization (see Section 6)

4. Results:
   - MATCH FOUND → Go to Step 2
   - NO MATCH → Go to Step 3
   - AMBIGUOUS (multiple possible matches) → Flag for manual resolution
```

## Step 2: Check Profile Freshness

If the entity exists, check whether the profile is fresh enough to use:

```
1. Check last_verified timestamp on the profile.

2. Apply freshness rules by entity type:
   - Venue: Valid for 3 months (quarterly verification cycle)
   - Artist: Valid for 6 months (unless event-triggered update needed)
   - Collective: Valid for 6 months
   - Recurring event: Valid until next edition announced

3. Check for staleness flags:
   - FRESH → Use the profile as-is for enrichment
   - DUE FOR REVIEW → Use the profile but note it may need updating
   - STALE → Use venue/genre knowledge, flag profile for re-research
   - FLAGGED → Do NOT use without re-verification
```

## Step 3: Handle New Entities

If the entity doesn't exist in the system:

```
1. Assess enrichment urgency:
   - Is the event publishing soon? (within 48 hours)
   - How important is artist context to this specific description?

2. Decision:
   a. HIGH urgency + artist context CRITICAL:
      → Quick research (see Section 4, "Quick Research Protocol")
      → Create minimum viable profile
      → Write enrichment using available information

   b. HIGH urgency + artist context NOT critical:
      → Write venue-forward description (venue carries the narrative)
      → Create stub profile for future research

   c. LOW urgency:
      → Full research (see Section 4, "Full Research Protocol")
      → Create complete profile
      → Write enrichment with full context
```

---

# SECTION 4: RESEARCH PROCESS FOR NEW ENTITIES

## Full Research Protocol

For a new artist entity when time permits thorough research.

### Greek Artists

**Source priority order:**
1. Artist's official website (if exists)
2. Spotify / Bandcamp / SoundCloud artist page
3. Greek Wikipedia (Ελληνική Βικιπαίδεια)
4. musicheaven.gr artist page
5. Athinorama profiles/reviews
6. Greek music press interviews
7. Resident Advisor (for electronic artists)
8. Discogs (for discography verification)
9. English Wikipedia (often incomplete for Greek artists)
10. General web search (Greek-language queries first)

**Greek-language search strategy:**
- Search the artist's name in Greek script first: "Χρήστος Θηβαίος"
- Then Latin transliteration: "Christos Thivaios"
- Then common variant transliterations: "Hristos Thivaios," "Christos Thevaios"
- Use Greek-language search queries: "[artist name] βιογραφικό," "[artist name] δισκογραφία," "[artist name] συναυλία Αθήνα"

**Diminishing returns threshold:** If after checking sources 1-6 you have fewer than 3 verified facts, the artist likely has low public profile. Create a minimum viable profile and move on. Don't spend more than 20 minutes on a single artist.

### International Touring Artists

**Source priority order:**
1. Resident Advisor (for electronic artists)
2. Bandcamp / Spotify
3. Artist's official website
4. English Wikipedia
5. Label website/roster page
6. Music press (Pitchfork, The Quietus, Stereogum — genre-dependent)
7. Discogs
8. Songkick / Bandsintown (for tour history, including Athens appearances)

**Athens-specific check:** Always search "[artist name] Athens" and "[artist name] Greece" to find previous Athens appearances. This feeds the "Athens history" field, which is the most valuable field for the enrichment writer.

### Rebetiko / Traditional Musicians

**Special considerations:**
- Many active rebetiko musicians have zero English-language web presence
- Greek-language sources are the ONLY option for most
- Venue associations are often the most discoverable fact
- A profile with just name + instrument + venue association is still valuable
- Facebook may be the primary web presence (check before assuming no presence exists)

**Source priority order:**
1. Venue websites and social media (Stoa Athanaton, Klimataria, etc.)
2. Facebook (many traditional musicians maintain FB but not websites)
3. Greek music forums and blogs
4. musicheaven.gr
5. Greek Wikipedia
6. YouTube (live performance videos often list musicians)

### Quick Research Protocol

When time is limited (event publishing within 48 hours):

1. Check Spotify/Bandcamp (2 minutes) — establishes genre, active status, discography basics
2. Check Resident Advisor or musicheaven.gr (3 minutes) — depending on genre
3. One Greek-language web search (5 minutes) — for Greek artists
4. Create minimum viable profile with whatever you found
5. Flag profile as "STUB — needs full research"

**Total time budget:** 10 minutes maximum.

---

# SECTION 5: DEDUPLICATION RULES

## Variant Transliterations

The same Greek name can be transliterated multiple ways:

| Problem | Solution |
|---------|----------|
| Χ → Ch or H | Store both as variants. Slug uses the artist's preferred Latin spelling. If unknown, use Ch. |
| Γ → G or Y | Follow standard convention (G before a/o/u, Y before e/i) unless artist uses otherwise |
| ΟΥ → Ou or U | Store both as variants |
| ΜΠ → B or Mp | Store both (e.g., Bofiliou / Mpofiliou) |
| ΝΤ → D or Nt | Store both (e.g., Dalaras / Ntalaras) |

**Rule:** The slug is canonical. Variants are stored for matching but the slug is what the system uses for identity.

**Example:**
```
Slug: giorgos-dalaras
Display name: Giorgos Dalaras
Greek name: Γιώργος Νταλάρας
Variants: George Dalaras, Giorgos Ntalaras, Yiorgos Dalaras, Γ. Νταλάρας
```

## Multiple Performance Names

| Scenario | Rule |
|----------|------|
| DJ name + birth name | Primary entity under the name they're BILLED as. Cross-reference in variants. |
| Solo + band | Separate entities. Cross-reference in collaboration history. |
| Artist rebrands | Single entity, old name stored as variant. Note the change in profile. |
| Collective member | Member gets own profile. Collective gets own profile. Both cross-reference. |

**Example:**
```
Entity 1: ate-salin (collective)
  Members: [link to até profile], [link to salin profile]

Entity 2: até (individual)
  Collective affiliations: Até & Salin

Entity 3: salin (individual)
  Collective affiliations: Até & Salin
```

## Venue Name Changes

| Scenario | Rule |
|----------|------|
| Rebrand (same location) | Update the existing entity. Store old name as variant. |
| Relocation (same name) | Update address. Note relocation and date in profile. |
| Closure + new venue at same address | Two separate entities. Note the connection. |
| Ownership change (same name, same location) | Single entity. Note the management change if relevant. |

---

# SECTION 6: TRANSLITERATION NORMALIZATION

When matching incoming names against stored entities, apply these normalizations:

```
1. Case: lowercase both strings
2. Diacritics: remove (ά→α, έ→ε, etc.)
3. Common substitutions:
   - ch ↔ h (for Χ)
   - g ↔ y (for Γ before e/i)
   - ou ↔ u (for ΟΥ)
   - b ↔ mp (for ΜΠ)
   - d ↔ nt (for ΝΤ)
   - th ↔ t (for Θ)
   - k ↔ c (occasional)
4. Spacing: normalize multiple spaces, trim
5. Hyphens vs. spaces: treat as equivalent for matching
6. Articles: ignore leading "the," "oi," "o," "i" for matching
```

**Important:** Normalization is for MATCHING only. Storage always preserves the artist's preferred spelling.

---

# SECTION 7: UPDATE POLICY

## When to Re-Research

| Trigger | Action | Priority |
|---------|--------|----------|
| New album/release announced | Update discography highlights, add timeliness context | Medium |
| Tour announced (includes Athens date) | Update Athens venue associations, check current context | High |
| Venue closure/relocation | Update venue profile immediately | Critical |
| Seasonal transition (May/October) | Verify operational status of seasonal venues | High |
| Artist hasn't appeared in listings for 12+ months | Check active status | Low |
| Contradictory information discovered | Re-research and reconcile | High |
| Profile older than 12 months with no updates | Flag for review | Medium |

## Marking Staleness

Every entity profile carries a freshness indicator:

```
- last_verified: [ISO timestamp]
- freshness_status: FRESH | DUE_FOR_REVIEW | STALE | FLAGGED
- flag_reason: [if FLAGGED, explain why]
```

**Status transitions:**
```
FRESH → (time passes beyond cycle) → DUE_FOR_REVIEW
DUE_FOR_REVIEW → (verified) → FRESH
DUE_FOR_REVIEW → (more time passes) → STALE
Any status → (trigger event) → FLAGGED
FLAGGED → (re-verified) → FRESH
STALE → (re-verified) → FRESH
```

## Archival Policy

Entities are never deleted, only archived:

| Scenario | Action |
|----------|--------|
| Venue permanently closed | Mark status: CLOSED. Keep profile (historical reference for descriptions mentioning it). |
| Artist deceased | Mark status: DECEASED. Keep profile (catalogue still relevant for tribute events, repertoire context). |
| Artist retired/inactive | Mark status: INACTIVE. Keep profile (may return). |
| Collective disbanded | Mark status: DISBANDED. Keep profile (members may be referenced individually). |

---

# SECTION 8: FILE CONVENTIONS

## Profile File Location

Until a database is implemented, entity profiles live in markdown files within the enrichment knowledge base:

```
enrichment-knowledge.md
  └── SECTION 5: ARTISTS
       ├── Greek Singer-Songwriter / Entechno
       ├── Electronic / DJ
       ├── Rebetiko / Traditional
       └── International Touring Artists
```

## Profile Entry Format

```markdown
### Artist Name — Latin Transliteration
- **Greek name:** Ελληνικό Όνομα
- **Slug:** artist-name-latin
- **Name variants:** Variant1, Variant2, Ελληνική Παραλλαγή
- **Role/Instrument:** Piano / DJ / Vocals+Guitar / etc.
- **Genre:** Specific genre positioning
- **Active since:** Year
- **Active status:** Active / Inactive / Unknown
- **Key facts:** [verified biographical facts]
- **Discography highlights:** [significant works, Latin transliteration]
- **Collaboration history:** [notable collaborators]
- **Athens venue associations:** [venues they play]
- **Tradition:** [1-2 sentences on musical lineage]
- **Confidence:** Tier 1 / Tier 2 / Tier 3
- **Sources:** [list of sources consulted]
- **Last verified:** YYYY-MM-DD
- **Freshness status:** FRESH / DUE_FOR_REVIEW / STALE / FLAGGED
```

## Slug Conventions

Already established:
- Lowercase Latin characters only
- Hyphens for spaces
- No diacritics
- No special characters
- Examples: `christos-thivaios`, `half-note-jazz-club`, `pulse-tribe-kollektiv`

For disambiguation:
- Same name different entity: append genre or location (`giorgos-dalaras`, `giorgos-dalaras-dj` if needed)
- Collectives: use the collective name as-is (`ate-salin`, `hardvision`)

---

# SECTION 9: ENRICHMENT WRITER QUICK REFERENCE

When you receive an event and need to check entity knowledge:

```
1. LOOK UP the artist/venue in the enrichment knowledge base
   → Found with FRESH status? Use it.
   → Found with STALE/FLAGGED status? Use venue-forward approach, flag for update.
   → Not found? Decide: quick research or venue-forward description.

2. ASSESS what tier of information you have:
   → Tier 1 facts: State directly, use for citability anchors
   → Tier 2 facts: Use in narrative, don't build core claims on them alone
   → Tier 3 facts: Do NOT state in descriptions, use only for your own context

3. NEVER fabricate. If you don't have the information:
   → Lead with the venue (you always know the venue)
   → Frame the genre/tradition
   → Be transparently thin rather than fabricated

4. AFTER writing, update the knowledge base:
   → New entity? Create at least a stub profile
   → Learned something new? Add it with confidence tier
   → Discovered an error? Flag the profile
```

---

*This workflow is designed for manual operation (human + Claude enrichment). As the system scales, the lookup and matching steps can be automated, but the confidence tiers and editorial judgment remain human decisions.*
