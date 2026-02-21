# Agent Athens — AI/Tech Event Scraping Sources
## Operational Reference for Scraping Pipeline

*Created: February 20, 2026*

---

# TIER 1: PRIMARY SOURCES (Check Weekly)

Highest-signal Athens AI/tech events. Check every Monday.

---

## 1. Eventbrite — Athens Technology Events

**Scrape URLs (rotate through all):**
- https://www.eventbrite.com/d/greece--athens/technology/
- https://www.eventbrite.com/d/greece/tech/
- https://www.eventbrite.com/d/greece--athens/technology-conferences/
- https://www.eventbrite.com/d/greece--athens/startup/
- https://www.eventbrite.com/d/greece--athens/science-and-tech/
- https://www.eventbrite.com/d/greece--athens/hackathon/
- https://www.eventbrite.com/d/greece--athens/data-science/

**Greek-encoded equivalents (may return different results):**
- https://www.eventbrite.com/d/greece--%CE%B1%CE%B8%CE%B7%CE%BD%CE%B1%CE%B9/technology/
- https://www.eventbrite.com/d/greece--%CE%B1%CE%B8%CE%B7%CE%BD%CE%B1%CE%B9/startup/
- https://www.eventbrite.com/d/greece--%CE%B1%CE%B8%CE%B7%CE%BD%CE%B1%CE%B9/technology-conferences/

**API Option:**
- Endpoint: `https://www.eventbriteapi.com/v3/events/search/`
- Params: `location.address=Athens,Greece` `location.within=25km` `categories=102` (Science & Technology) `expand=venue,ticket_availability`
- Auth: Bearer token required (free account at eventbrite.com/platform)
- Note: Eventbrite removed location-based search from API ~2020. Web scraping or HAR file method may be needed. API still works querying by specific venue ID.

**Filter IN (title or description contains):**
AI, artificial intelligence, machine learning, ML, data science, LLM, deep learning, NLP, hackathon, developer, startup, tech meetup, coding, cloud, DevOps, Python, generative AI

**Filter OUT:**
- "Online" or "Virtual" as sole location (unless hybrid with Athens)
- Events outside Athens metro (Thessaloniki, Crete, etc.)
- Generic career fairs, pub crawls, escape rooms tagged as "tech"

---

## 2. Meetup.com — Athens AI/Tech Groups

**Search URLs:**
- https://www.meetup.com/find/?keywords=ai&location=gr--Athens
- https://www.meetup.com/find/?keywords=artificial+intelligence&location=gr--Athens
- https://www.meetup.com/find/?keywords=machine+learning&location=gr--Athens
- https://www.meetup.com/find/?keywords=data+science&location=gr--Athens
- https://www.meetup.com/find/?keywords=tech&location=gr--Athens
- https://www.meetup.com/find/?keywords=developer&location=gr--Athens

**Known Groups — Monitor Event Pages Directly:**
- https://www.meetup.com/mindstone-athens/events/
- https://www.meetup.com/athens-big-data/events/
- https://www.meetup.com/pydata-piraeus/events/
- https://www.meetup.com/athens-ai-machine-learning-data-science/events/
- https://www.meetup.com/manageengine-greece/events/

**GraphQL API (if scraping):**
```
Endpoint: https://www.meetup.com/gql
Query: keywordSearch with filter { query: "AI", lat: 37.9838, lon: 23.7275, radius: 25, source: EVENTS }
```
Note: May require authentication.

---

## 3. Lu.ma — Athens Community Events

**Discovery URLs:**
- https://lu.ma/discover?q=athens+ai
- https://lu.ma/discover?q=athens+tech
- https://lu.ma/discover?q=athens+startup
- https://lu.ma/discover?q=greece+ai

**Global AI calendars (filter for Athens mentions):**
- https://lu.ma/ai?k=t
- https://lu.ma/ai-events

**Why Lu.ma matters:** Growing as preferred platform for AI community events globally. Many Athens AI events appear here FIRST, before Meetup or Eventbrite.

---

## 4. Starttech.vc — Greek Startup Events

**Scrape URL:**
- https://www.starttech.vc/events/

**Why:** Aggregates Greek startup/tech events. Cross-posts events that don't appear elsewhere. Check weekly.

---

# TIER 2: ORGANIZATION-SPECIFIC SOURCES

Official pages for specific recurring events/organizations. Check per schedule noted.

---

## 5. Mindstone Athens (Check: 1st of each month)

- **Primary:** https://community.mindstone.com/events
- **Also on:** https://www.meetup.com/mindstone-athens/events/
- **Also on:** Eventbrite (search "Mindstone Athens")
- **Also on:** https://www.starttech.vc/events/
- **Schedule:** Monthly, Tuesdays, 18:30-21:00

## 6. Archimedes Seminars (Check: Weekly)

- **Primary:** https://archimedesai.gr/en/
- **Also:** https://www.athenarc.gr/en/archimedes/news-all
- **Schedule:** Irregular, multiple per month
- **Enrichment threshold:** Only enrich for internationally prominent speakers (MIT, Stanford, Oxford, INRIA-level). Skip internal PhD presentations.

## 7. Greeks in AI (Check: Monthly from Feb, weekly from May)

- **Primary:** https://www.greeksin.ai/
- **Watch for:** Keynotes, program, registration opening, abstract deadlines
- **Event:** July annually

## 8. Global AI Athens (Check: Monthly)

- **Chapter page:** https://globalai.community/chapters/athens/events/
- **Athens domain:** https://ai-athens.gr/
- **Azure edition:** https://www.globalazure.gr/
- **Character:** Part of Global AI Community (100+ chapters worldwide). Athens chapter small (7 members) but connected to global infrastructure. Events tend virtual/hybrid.

## 9. AI Hackathon Greece (Check: Quarterly, December for CFP)

- **Primary:** https://hackathongreece.ai/
- **Also:** https://digital-skills-jobs.europa.eu/ (EU Digital Skills platform)
- **Event:** March annually

## 10. Devoxx Greece (Check: Monthly from January)

- **Primary:** https://devoxx.gr/
- **Event:** April annually

## 11. Disrupt AI Summit (Check: Monthly from February)

- **Primary:** https://productledhub.com/disrupt-ai-summit/
- **Event:** May annually

## 12. PHAROS AI Factory (Check: Monthly — emerging source)

- **Primary:** https://www.pharos-aifactory.eu/
- **Why:** PHAROS + DAEDALUS supercomputer coming online Q1 2026. Expect training workshops, hackathons, open days. Will become significant.

## 13. ACE AUEB (Check: Monthly)

- **Primary:** https://ace.aueb.gr/ (events section)
- **Why:** Runs AI Hackathon Greece + other startup/tech events year-round

## 14. Found.ation (Check: Monthly)

- **Primary:** https://thefoundation.gr/ (events section)
- **Why:** Major Greek startup incubator. Hosts events, workshops, demo days.

---

# TIER 3: AGGREGATORS & DISCOVERY (Check Monthly)

Wider net. Higher noise. Catch events the specific sources miss.

---

## 15. dev.events

- https://dev.events/GR
- https://dev.events/GR/AI
- https://dev.events/hackathons/EU/GR

Comprehensive developer event aggregator. Filterable by country + topic.

## 16. Conference Alerts (Academic focus)

- https://www.allconferencealert.com/athens/ai-conference.html
- https://conferencealerts.co.in/greece/artificial-intelligence
- https://conferencealerts.co.in/athens/information-technology

**Red flags — SKIP these:**
- "CPD Event" suffix (usually predatory conferences)
- No specific venue mentioned
- Extremely broad topics ("Multidisciplinary Innovation")
- Registration > €500 for unknown organizers

---

# DATA EXTRACTION TEMPLATE

For every event discovered from any source, extract:

```json
{
  "source_url": "",
  "source_platform": "eventbrite|meetup|luma|direct|other",
  "scraped_at": "",

  "title": "",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "time_start": "HH:MM",
  "time_end": "HH:MM",

  "venue_name": "",
  "venue_address": "",
  "neighborhood": "",
  "is_online": false,
  "is_hybrid": false,

  "organizer_name": "",
  "organizer_url": "",

  "price_type": "open|with-ticket",
  "price_amount": null,
  "ticket_url": "",

  "event_type": "conference|meetup|hackathon|seminar|workshop",
  "raw_description": "",

  "detected_keywords": [],
  "enrichment_priority": "high|medium|low|skip",
  "enrichment_status": "pending|enriched|skipped",
  "notes": ""
}
```

---

# ENRICHMENT PRIORITY RULES

**HIGH (enrich immediately):**
- Greeks in AI (any update)
- 200+ expected attendees
- Events at known venues (Eugenides, Megaron, OTEAcademy, ACE AUEB)
- Internationally known speakers
- Annual flagships (Devoxx, Disrupt, AI Hackathon)

**MEDIUM (enrich within 1 week):**
- Mindstone monthly editions
- Notable Archimedes seminars (international speakers)
- First edition of new recurring events
- Events from known organizers (ACE, Found.ation, Product-Led Hub)

**LOW (enrich if capacity allows):**
- One-off small workshops (< 50 people)
- Virtual-only events with Athens organizer
- Academic conferences with no public attendance
- HackerX recruiting events

**SKIP:**
- Online-only, no Athens physical component
- Predatory academic conferences
- Corporate sales pitches disguised as events
- Events outside Athens metro area

---

# SCRAPING SCHEDULE

| Day | Action | Sources |
|-----|--------|---------|
| **Monday** | Weekly discovery sweep | Eventbrite (all URLs), Meetup (search + known groups), Lu.ma, starttech.vc |
| **Wednesday** | Organization check | Archimedes, PHAROS, Global AI Athens |
| **Friday** | Triage | Review week's discoveries, assign enrichment priority |
| **1st of month** | Monthly deep sweep | dev.events, Conference Alerts, all org-specific sources, Mindstone next edition |
| **Quarterly** | Calendar review | Greeks in AI, Devoxx, Disrupt, AI Hackathon — new editions/announcements |

---

# DEDUPLICATION RULES

Events appear on multiple platforms. Deduplicate by:

1. **Title match** (fuzzy) — "Mindstone Athens February Meetup" = "Mindstone Athens February AI Meetup"
2. **Date + Venue match** — same date + same venue = same event
3. **Organizer + Date match** — same organizer + same date = likely same event

**Source preference when duplicated (most complete data wins):**
Direct organizer page > Eventbrite > Meetup > Lu.ma > aggregator

---

# EXISTING SCRAPING SOURCES (Music/Nightlife)

For reference — these are the sources already in use for the core music/nightlife pipeline:

| Source | URL | Purpose |
|--------|-----|---------|
| Clubber.gr | clubber.gr/events | Main scene hub, electronic |
| Resident Advisor | ra.co/events/gr | Electronic events |
| more.com | more.com (formerly Viva.gr) | Concerts — Gazarte, Gagarin, Fuzz, Floyd |
| TicketServices.gr | ticketservices.gr | Festivals |
| Athinorama | athinorama.gr | Greek-language, comprehensive |
| thisisathens.org | thisisathens.org | English-language official |
| Individual venue Instagram | Various | Most reliable for announcements |

The AI/tech sources above are ADDITIVE — they don't replace or overlap with the music pipeline.
