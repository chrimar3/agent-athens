# Fact-Check Verification Prompt

Reusable prompt for post-enrichment factual verification. Run after descriptions are saved to catch subagent hallucinations before they go live.

---

## Fact-Check Task

You are reviewing event descriptions for factual accuracy. You have the **ORIGINAL EVENT DATA** (from the database) and the **GENERATED DESCRIPTION** (written by an enrichment subagent).

### What to Check

Verify ONLY concrete, checkable claims. Ignore subjective atmosphere and literary style.

1. **Venue name + location** — Does the description match the event data? Watch for same-name venues in different neighborhoods (e.g., VOX Cinema vs VOX Live Stage, multiple "Bios" locations).

2. **Artist/performer credentials** — Are these verifiable?
   - Origin city or nationality
   - Album names, release years, record labels
   - Awards, nominations, education
   - Career milestones ("debut album," "20-year career," "Grammy-nominated")

3. **Source material attributions** — Are adaptations, translations, and original works correctly attributed?
   - Playwright or author name
   - Source work title
   - "Based on" or "inspired by" claims

4. **Historical dates and founding claims** — Are years, anniversaries, and founding dates accurate?
   - "Founded in 1985"
   - "10-year anniversary"
   - "First performance since 2019"

5. **Geographic claims** — Are artist origins, venue locations, and neighborhood references correct?
   - Artist home city/country
   - Venue neighborhood
   - Tour routing claims ("fresh off a European tour")

### How to Verify

- **Web search** the specific claim (e.g., "DJ Yazi Black Smoker Records" or "VOX Live Stage Athens address")
- **Cross-reference** the event source URL — it often has the authoritative facts
- **Check** Resident Advisor, Discogs, official artist sites, venue websites
- **Compare** against `config/venue-intelligence.md` for known venue data

### How to Report

For each issue found:

```
**Claim:** "[exact text from description]"
**Evidence:** [what the search/source actually shows]
**Severity:** ERROR (factually wrong) | UNVERIFIABLE (can't confirm or deny)
```

If no issues found for an event, respond: **NO ISSUES FOUND**

### Severity Guide

| Severity | Definition | Example |
|----------|-----------|---------|
| **ERROR** | Claim is contradicted by evidence | "Berlin-based" when artist is from Tokyo |
| **UNVERIFIABLE** | Can't find evidence either way | "Studied under master X" with no source |
| **PLAUSIBLE** | Not directly verified but consistent | "Regular Athens performer" for artist with multiple RA listings |

### Known Error Patterns (from batches 115-117)

These are the 3 confirmed error types that triggered this fact-check system:

1. **Ambiguous venue → wrong location** (VOX Cinema vs VOX Live Stage)
2. **Assumed origin from venue city** (Tokyo artist called "Athens fixture")
3. **Fabricated authorship from theme** (Philip K. Dick attribution on original work)

Weight your checks toward these patterns — they represent the actual failure modes.

---

## Integration

### As a post-save verification step (~3 min per 15 events)

```
1. Read saved descriptions from DB (batch of 15)
2. Read corresponding event data (title, venue, type, source URL)
3. For each: check 2-3 claims using web search
4. Report: events with errors, error types, suggested corrections
5. If errors found: flag for manual review before next site build
```

### As a batch-level quality gate

Add to `save-batch.ts` workflow:
1. After auto-gate-check passes (structure/style)
2. Before final DB write
3. Only blocks on ERROR severity (not UNVERIFIABLE)
