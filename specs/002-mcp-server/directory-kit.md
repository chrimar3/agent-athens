# Directory submission kit: Agent Athens MCP server

*Spec 002, M4.1. Everything needed to submit to Anthropic's connector directory
and OpenAI's app directory. Together with `RUN.md` § Owner steps, this should
take an afternoon. Fill every `[Owner: …]` placeholder before submitting.*

## 0. Before you submit (blocking)

1. **The feed must be fresh.** On 2026-10-28, `/api/events.json` was last
   written on 2026-10-06. The server instructions tell assistants the listings
   are "updated daily", and reviewers will try "this weekend" prompts. Submit
   only after the daily pipeline is running again and `feed_updated` in a
   `search_events` result is from today or yesterday.
2. **Deploy the Netlify site and add `mcp.agentathens.com` to it.** See
   `mcp/README.md` § Deploy (Netlify). The rate limit ships in the function.
3. **Publish a privacy page.** The draft is `privacy-page-draft.md`. Fill in
   the hosting paragraph from the deployed Netlify settings.
4. **Run the examples in §4 again against the deployed endpoint** and check
   that the output still looks like §4.

## 1. Name and descriptions

**Name:** Agent Athens

**Endpoint:** `https://mcp.agentathens.com/mcp` (Streamable HTTP, no
authentication)

**Short description (EN):**
> Cultural events in Athens, Greece: concerts, theatre, exhibitions, cinema and more, with links to every event's page.

**Short description (EL):**
> Πολιτιστικές εκδηλώσεις στην Αθήνα: συναυλίες, θέατρο, εκθέσεις, σινεμά και άλλα, με σύνδεσμο για κάθε εκδήλωση.

**Long description (EN):**
> Agent Athens lists what's on in Athens, Greece: concerts, club nights, theatre, exhibitions, cinema, comedy, dance and festivals. Ask for "concerts this weekend", "free exhibitions this month" or "what's on at Onassis Stegi". Name artists you like and Agent Athens finds their upcoming shows, matching names across Greek and Latin spellings and flagging tribute nights.
>
> Every event comes with its date and time (Athens time), venue, price where the organiser lists one, a ticket link where there is one, and its Agent Athens page. In Claude and ChatGPT, results show as cards. Agent Athens never makes up a price, time or line-up: if the listing doesn't say, neither does it.
>
> Read-only. No account, no sign-in. Agent Athens stores nothing about you and does not log your searches.

**Long description (EL):**
> Το Agent Athens δείχνει τι γίνεται στην Αθήνα: συναυλίες, club nights, θέατρο, εκθέσεις, σινεμά, stand-up, χορό και φεστιβάλ. Ρωτήστε «συναυλίες αυτό το Σαββατοκύριακο», «δωρεάν εκθέσεις αυτόν τον μήνα» ή «τι παίζει στη Στέγη». Πείτε ποιους καλλιτέχνες αγαπάτε και το Agent Athens βρίσκει τις επόμενες εμφανίσεις τους, αναγνωρίζοντας τα ονόματα σε ελληνικούς και λατινικούς χαρακτήρες και επισημαίνοντας τις tribute βραδιές.
>
> Κάθε εκδήλωση έχει ημερομηνία και ώρα (ώρα Αθήνας), χώρο, τιμή όταν τη δηλώνει ο διοργανωτής, σύνδεσμο για εισιτήρια όταν υπάρχει, και τη σελίδα της στο Agent Athens. Στο Claude και στο ChatGPT τα αποτελέσματα εμφανίζονται ως κάρτες. Το Agent Athens δεν επινοεί ποτέ τιμές, ώρες ή line-up: αν δεν τα αναφέρει η καταχώριση, δεν τα αναφέρει ούτε αυτό.
>
> Μόνο ανάγνωση. Χωρίς λογαριασμό, χωρίς σύνδεση. Το Agent Athens δεν αποθηκεύει τίποτα για εσάς και δεν καταγράφει τις αναζητήσεις σας.

**Category suggestions:** Lifestyle / Travel / Entertainment. Use whatever
the form offers.

## 2. Tools

Generated from the server's own `TOOLS` (`mcp/src/mcp.ts`), not typed by hand.
All four have the same annotations.

| Tool | Title | Description | Annotations | Card UI |
|---|---|---|---|---|
| `search_events` | Search Athens events | Find upcoming cultural events in Athens by date, category, neighborhood, venue, price or free text. Returns events sorted by date with venue, price, ticket link and the Agent Athens page. | readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false | yes |
| `get_event` | Get one event | Full details of one event, including the complete description. | readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false | no |
| `list_venues` | List venues | Venues with events in the next 30 days, busiest first, with their categories. | readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false | no |
| `match_artists` | Match artists to events | Given artists the user likes (e.g. their top artists from a music app, or names they mention), return upcoming Athens events by those artists. Matches by Spotify artist ID (through Wikidata), then Wikidata ID, then by name across Greek and Latin spellings, then by mention in the title. | readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false | yes |

**MCP Apps resource:** `ui://agent-athens/events.html`
(`text/html;profile=mcp-app`). CSP: `resourceDomains: ["https://agentathens.com"]`,
with no `connectDomains` and no `frameDomains`. Spec version 2026-01-26
(stable).

**Server instructions** (sent at `initialize`): the model is told to link each
event's `url` and `ticket_url`, never to invent prices, times or line-ups, and
to say that a `title_mention` match may be a tribute act.

## 3. Data source and privacy statement

> **Data source.** Agent Athens' public event feed (`https://agentathens.com/api/events.json` and `/api/en/events.json`), licensed CC BY 4.0. The server reads only that feed. It has no database and does no scraping of its own.
>
> **Privacy.** The server stores nothing about users: no accounts, no profiles, no cookies, no saved searches. Its code writes no logs. The server is hosted on Netlify, which processes standard request metadata to deliver and protect the service (including a per-IP rate limit); no logging beyond Netlify's defaults is enabled. *[Owner: confirm against the deployed site's settings.]* Links carry no tracking parameters. Event images load only from agentathens.com. Full policy: *[Owner: privacy page URL]*.

**Support contact:** *[Owner: support email or URL]*

## 4. Example prompts, run against the live feed

Run on 2026-10-28 with `cd mcp && bun run scripts/examples.ts`. Each example
is the tool call an assistant would make for the prompt, sent through the real
server code to `https://agentathens.com`. The output below is trimmed only in
the event lists, and is stored in full in `evidence/m4.1-examples.txt`.
**The feed was 22 days old at the time** (`feed_updated
2026-10-06T06:02:14.618Z`). See §0.

**1. "What concerts are on in Athens this weekend?"**
`search_events {"when":"this_weekend","category":"music","limit":5}` → window 2026-10-31..2026-11-01, **total 11**, returned 5:

```
2026-10-31 | The Cure Party - Halloween Edition | Temple | ticket, price not listed
2026-10-31 | SMUT x Polygonia B2B DJ HI-C x PLO Man | SMUT Athens | ticket, price not listed
2026-10-31 | ØTTA in ATHENS (Hotties album tour) | Oddity | ticket, price not listed
2026-10-31T20:00:00+02:00 | Orchestra Popolare La Notte della Taranta | Μέγαρο Μουσικής Αθηνών | ticket, price not listed
2026-10-31T20:30:00+02:00 | Tasos Rosopoulos: Songs About a Return Contemporary Music Days | ΚΠΙΣΝ | 10 EUR
```

**2. "Any exhibitions with free entry in Athens over the next month?"**
`search_events {"category":"exhibition","open_only":true,"when":"next_30_days","limit":5}` → **total 6**, returned 5:

```
2026-04-28 | Barbara Kruger: Untitled (Pride and Contempt) | ΚΠΙΣΝ | open entry
2026-09-20 | Mustafah Abdulaziz | WATER | ΚΠΙΣΝ | open entry
2026-09-21 | Mustafah Abdulaziz | WATER | ΚΠΙΣΝ | open entry
2026-09-22 | Mustafah Abdulaziz | WATER | ΚΠΙΣΝ | open entry
2026-09-23 | Mustafah Abdulaziz | WATER | ΚΠΙΣΝ | open entry
```

*Owner note:* the feed carries WATER as one row per day, so it appears four
times. This is pipeline data; fix it before the screenshots are taken.

**3. "Τι θέατρο παίζεται απόψε στην Αθήνα;"**
`search_events {"when":"today","category":"theatre","lang":"el","limit":5}` → **total 86**, returned 5:

```
2026-08-13T21:00:00+03:00 | Ανεξάρτητα κράτη | Βεάκειο Δημοτικό Θέατρο | ticket, price not listed
2026-09-13 | NEPENTHE 4 Year Anniversary at Alsos Theater with The Bausa and Yulia Niko b2b Ede | Άλσος | ticket, price not listed
2026-09-13T10:30:00+03:00 | Ο Του-του και η Τσαφ-τσουφ | Olvio | ticket, price not listed
2026-09-13T11:30:00+03:00 | Α μπε μπα μπλε | Olvio | ticket, price not listed
2026-09-13T12:30:00+03:00 | Ο λύκος και τα επτά κατσικάκια | Olvio | ticket, price not listed
```

*Owner note:* runs with no stated end count as "on" for the site's
presumption window (45 days for theatre), so a stale feed inflates "tonight".
"NEPENTHE" is a DJ night that the feed types as theatre. Both are pipeline
data. With a fresh feed this prompt is the strongest Greek example; until
then, prefer prompts 1, 4 and 5 for screenshots.

**4. "What's coming up at Onassis Stegi?"**
`search_events {"venue":"Onassis Stegi","when":"next_30_days","limit":5}` → **total 5**, returned 5:

```
2026-10-29 | Athens Palestine Film Festival | Onassis Stegi | ticket, price not listed
2026-11-12 | Οιδίποδας | Robert Icke | Onassis Stegi | ticket, price not listed
2026-11-20 | ArteKino Festival 2026 | Onassis Stegi | ticket, price not listed
2026-09-01 | Αρχείο Καβάφη: Ένα αρχείο ανοιχτό σε όλους | Onassis Stegi | ticket, price not listed
2026-10-04 | Onassis Masterclass με τον Romain Gavras | Onassis Stegi | ticket, price not listed
```

**5. "I'm a big fan of The Cure. Is there anything for me in Athens?"**
`match_artists {"artists":["The Cure"]}` → **1 match**:

```
[title_mention] 2026-10-31 | The Cure Party - Halloween Edition | Temple
```

This shows the honesty rule at work: the name is only in the title, so the
match is flagged and the assistant is told to say it may be a tribute night.

Each result also carries the event's agentathens.com `url`. They are left out
above for width and are in the evidence file.

## 5. Icon

**What the site has today.**

- `https://agentathens.com/favicon.svg`: a 32×32 viewBox, a rounded `#111114`
  square with a blue `a` drawn as `<text>` in a system font.
- `/favicon-32x32.png`.
- `/apple-touch-icon.png`.

**What the directories ask for:**

- **OpenAI.** PNG, JPEG, WebP or SVG, at most 5 MiB. Square, at least 48×48,
  raster at most 4096 px per side. Contrast of at least 2:1 against white
  *and* against `#212121`. A dark variant is optional.
- **Anthropic.** An icon is required. No format or size was found in its docs.

**Recommendation.** Export a square **512×512 PNG**, plus an SVG in which the
letter is converted to a path. The current SVG's `<text>` renders in whatever
font the viewer has, so it can look different on each system.

Check the 2:1 rule on both backgrounds. The `#111114` tile on `#212121` is
about 1.2:1, so the outer edge disappears there. The blue mark (`#5ba4e6`) is
what has to carry the contrast. Have a person check it against both
backgrounds before uploading.

## 6. Directory requirements

Researched on 2026-10-28 from primary pages. I fetched and read the Anthropic
submission page and the OpenAI plugin guidelines myself. The other points
come from a research subagent's reading of the pages listed, so treat them as
"check in the form".

### Anthropic: Connectors Directory

- **Where:** <https://claude.ai/directory/manage> → **Submit new** → **MCP
  connector**. Any paid Claude plan can submit. On Team or Enterprise plans, an
  Owner submits.
- **Listing:**

  | Field | Limit | This kit |
  |---|---|---|
  | Name | ≤ 100 characters | "Agent Athens" |
  | One-liner | ≤ 200 characters | §1 short description (EN), 117 characters |
  | Description | ≤ 2,000 characters | §1 long description (EN) |
  | Categories | 1–5 | see §1 |
  | Documentation URL | required | *[Owner: link to `mcp/README.md` or a site page]* |
  | Privacy policy URL | required | the published page from `privacy-page-draft.md` |
  | Support contact | required | *[Owner]* |
  | Icon | required | §5 |
  | Slug | permanent once published | choose carefully |

- **Tools:** every tool needs a `title` plus `readOnlyHint` or
  `destructiveHint`. All four have both (§2).
- **Authentication:** none, which is allowed for public data. Choose **not
  required**. "Test account" reads as "none needed: public, read-only".
- **Data handling (step 7):** the underlying API is our own:
  agentathens.com's public feed, built by our pipeline.
- **MCP Apps carousel:** 3–5 PNGs, at least 1000 px wide, cropped to the app
  response with no prompt in the image, each paired with its prompt. These
  can be produced by command:

  ```bash
  cd mcp
  EVIDENCE_DIR=../specs/002-mcp-server/evidence LIVE=1 bun run e2e
  ```

  That writes `directory-1.png` to `directory-5.png` (1200 px wide), one per
  prompt in §4. The current files show the stale feed (6 Oct) and the
  duplicate WATER rows, so **retake them after §0**.
- **Allowed link URIs:** list `https://agentathens.com`. Ticket sellers
  (more.com, viva.gr and others) are third-party origins and may not be
  listed, so Claude asks the user to confirm before opening a ticket link.
  That is acceptable.
- **Compliance (step 9):** seven acknowledgments, among them first-party API
  use, no financial transactions, no AI media generation, prompt injection,
  and no conversation-data collection. The server meets each one: it reads its
  own feed, sells nothing, generates no media, treats feed text as data, and
  stores nothing.
- **After submitting:** an automated scan, then a Community listing by default.
  Some listings get a human review. Escalations: `mcp-review@anthropic.com`.

### OpenAI: ChatGPT directory

- **The route has changed.** OpenAI's developer docs now describe
  *plugins*, submitted at <https://platform.openai.com/plugins>, where earlier
  docs described "apps". Confirm in the dashboard which package type a remote
  MCP server uses. A research source said the change happened in July 2026,
  but that was not verified from a primary page.
- **Ticket links: decide this before submitting.** OpenAI's plugin guidelines
  say plugins may not "Link directly to a checkout or other transactional
  page" (read on 2026-10-28). `ticket_url` and the card's **Tickets** button
  point at sellers' purchase pages. Options:
  1. **Recommended:** submit as is, and let review decide;
  2. omit `ticket_url` and the Tickets button for ChatGPT, leaving the
     Agent Athens page, which shows ticket info, as the only link. This needs a
     per-host switch, which is new work, and it changes the M3 behaviour the
     spec asked for.

  This is a policy decision for the owner, not a code bug.
- **Annotations:** explicit booleans for `readOnlyHint`, `destructiveHint` and
  `openWorldHint`, which the server already sends. The guidelines say to use
  `openWorldHint: true` for "public or open-ended entities, including
  read-only web search". This server returns a closed dataset (our feed), so
  `false` fits, but a reviewer may question it.
- **Listing fields** (research, verify in the form): display name ≤ 30
  characters ("Agent Athens"); short description ≤ 30 characters, for example
  "Athens cultural events" (22) or «Εκδηλώσεις στην Αθήνα» (21); long
  description ≤ 4,000 (use §1); up to 3 default prompts of ≤ 128 characters
  each (use §4 prompts 1, 3 and 5); website, support, privacy and **terms of
  service** URLs, all required.
- **Domain verification:** serve the token OpenAI gives as plain text at
  `https://mcp.agentathens.com/.well-known/openai-apps-challenge`. The server
  does not serve that path today. It is a three-line change in
  `mcp/src/mcp.ts`, best made once the token exists.
- **Review package:** five positive and three negative test cases, run before
  submitting, and a video walkthrough. Suggested negative cases:
  1. "Buy me two tickets for Rotting Christ". The server cannot buy anything.
     The assistant should give the Agent Athens page and the ticket link.
  2. "What's on in Thessaloniki tonight?" Out of scope; the assistant should
     say Agent Athens covers Athens.
  3. "How much is the Cure Party?" The price is not listed, and the assistant
     must say so rather than guess.
- **Content rules:** suitable for general audiences, no advertising, no
  selling of digital goods. Agent Athens sells nothing.

### Gemini

No public directory submission is needed: users add the URL in Gemini CLI
settings (see `mcp/README.md` § Connect it).
