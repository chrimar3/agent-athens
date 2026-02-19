# Newsletter Email Parsing Summary

**Date:** November 3, 2025  
**Batch:** newsletters-batch1  
**Output File:** `data/parsed-events/newsletters-batch1.json`

## Source Emails Processed

1. **2025-10-31---------------annex-M.json**
   - From: MEGARON - The Athens Concert Hall
   - Subject: Νοέμβριος στο annex M (November at annex M)
   - Events extracted: 3

2. **2025-10-23----------------------------------Simone-Leigh-----.json**
   - From: SNFCC
   - Subject: Simone Leigh: Anatomy of Architecture
   - Events extracted: 4

3. **2025-10-21---------------------------------------------------.json**
   - From: MEGARON - The Athens Concert Hall
   - Subject: Camerata Orchestra concerts 2025
   - Events extracted: 4

4. **2025-10-23-Jazz-Megaron.json**
   - From: MEGARON - The Athens Concert Hall
   - Subject: Jazz@Megaron
   - Events extracted: 5

5. **2025-10-24---------------------------------------------------.json**
   - From: Google Business Profile
   - Subject: Verification required
   - **SKIPPED** (not a cultural event newsletter)

## Extraction Results

### Total Events: 16

### By Type:
- **Concerts:** 9 events (56%)
- **Exhibitions:** 3 events (19%)
- **Performances:** 2 events (13%)
- **Workshops:** 2 events (13%)

### By Venue:
- **MEGARON - The Athens Concert Hall:** 11 events
- **Stavros Niarchos Foundation Cultural Center (SNFCC):** 4 events
- **MEGARON Garden:** 1 event

### By Price:
- **Open (Free):** 6 events (38%)
- **With Ticket (Paid):** 10 events (62%)

### By Genre:
- Jazz concerts: 5
- Classical concerts: 4
- Contemporary art: 4
- Workshops: 2
- Performance/Discussion: 1

## November 2025 Events

| Date | Time | Event | Type | Price |
|------|------|-------|------|-------|
| Nov 1 | 20:30 | Nikolas Anadolis: Improvisations | Concert | Ticket |
| Nov 2 | 11:00 | Small Sculpture Workshop | Workshop | Open |
| Nov 2 | 12:00 | Gumboot Dance Workshop | Workshop | Open |
| Nov 2 | 17:00 | African-American Music Listening Club | Performance | Open |
| Nov 2 | 20:30 | Camerata: Mozart Concerti | Concert | Ticket |
| Nov 3 | 12:00 | Jenny Marketou Installation | Exhibition | Open |
| Nov 3 | 19:00 | Elke Krasny & Jenny Marketou Discussion | Performance | Open |
| Nov 5 | 10:00 | Simone Leigh Exhibition (last days) | Exhibition | Open |
| Nov 5 | 19:00 | Andreas Kassapis Exhibition Opening | Exhibition | Ticket |
| Nov 5 | 20:30 | Dimos Dimitriadis: Songs in Revolution | Concert | Ticket |
| Nov 8 | 21:00 | Kalantzis 4tet: Tsitsanis Jazz | Concert | Ticket |
| Nov 13 | 21:00 | Stacey Kent Trio | Concert | Ticket |
| Nov 18 | 21:00 | Richard Bona - Alfredo Rodriguez | Concert | Ticket |
| Nov 19 | 20:30 | Camerata: Schubert 8 - Beethoven 5 | Concert | Ticket |

## Data Quality Notes

### Followed Rules:
- ✅ Used "open" instead of "free" for free events
- ✅ Default time set to 20:00 for evening events when not specified
- ✅ Exhibition opening times set to reasonable defaults (10:00 for daytime, 19:00 for openings)
- ✅ Did NOT fabricate information
- ✅ Extracted all URLs where provided
- ✅ Created descriptive short_description from email content
- ✅ Tracked source email for each event

### Event Types Classification:
- **Concert:** Musical performances (classical, jazz, world music)
- **Exhibition:** Visual art exhibitions and installations
- **Performance:** Discussions, talks, listening sessions
- **Workshop:** Participatory educational activities

### Timezone:
All times are in Athens local time (Europe/Athens, EET/EEST).

## Next Steps

1. Import these events to database using `scripts/import-scraped-events.ts`
2. Enrich with AI-generated 400-word descriptions using `scripts/run-enrichment-pipeline.ts`
3. Generate static site pages with `bun run build`
4. Deploy to Netlify with `git push origin main`

## Files Generated

- `data/parsed-events/newsletters-batch1.json` (11 KB)
- `data/parsed-events/PARSING-SUMMARY.md` (this file)
