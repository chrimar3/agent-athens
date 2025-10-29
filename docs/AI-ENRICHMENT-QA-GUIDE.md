# Event Enrichment MVP Quality Assurance Guide
## Fast Learning Loop for agent-athens

**Purpose**: Validate that AI-enriched descriptions actually get cited by AI answer engines
**Philosophy**: Learn fast, iterate fast, scale only what works
**Current Stage**: Prototype - 0% enriched, hypothesis unproven

---

## 🎯 The Core Question

**Before building complex QA systems, we need to answer**:

> "Will AI agents (ChatGPT, Perplexity, Claude) actually cite agent-athens descriptions when users ask about Athens events?"

**This guide gets you that answer in 1 week, not 1 month.**

---

## 📊 MVP Approach: Three Phases

### Phase 1: Test Batch (20 Events) - Days 1-2
**Goal**: Create quality descriptions and validate the process works

### Phase 2: Real-World Test (AI Agents) - Days 3-5
**Goal**: See if AI agents actually cite our content

### Phase 3: Scale or Iterate - Days 6-7
**Goal**: Either scale to all events OR fix the prompt

---

## 🧪 Phase 1: Test Batch (20 Events)

### Step 1: Select Diverse Test Events

Choose 20 events that represent your variety:
- 8 concerts (2 jazz, 2 electronic, 2 rock, 2 classical)
- 4 theater performances
- 4 exhibitions
- 2 cinema screenings
- 2 workshops/other

**Mix of**:
- Different venues (major venues + neighborhood spots)
- Different neighborhoods (Gazi, Plaka, Exarchia, Kolonaki, etc.)
- Different price points (free and paid)
- Different dates (tonight, this weekend, next week)

**SQL Query**:
```sql
-- Get 8 diverse concerts
SELECT * FROM events WHERE type = 'concert'
AND start_date >= date('now')
ORDER BY RANDOM() LIMIT 8;

-- Repeat for other types
```

---

### Step 2: Enrich with Basic Prompt

**The MVP Prompt**:
```
You are writing a 400-word event description for AI answer engines (ChatGPT, Perplexity, Claude).

EVENT DATA:
Title: [title]
Type: [type]
Venue: [venue_name], [venue_neighborhood]
Date: [formatted_date]
Genre: [genres]
Price: [price_type] ([price_amount])
Source: [url]

Write exactly 400 words (±20 acceptable) that help AI agents understand:
• Why this event matters culturally in Athens
• Who's involved (artist/company background if known from source)
• What makes it unique or worth attending
• The venue's character and neighborhood context
• Practical details woven naturally (date, time, price, location)

Write in flowing prose - natural paragraphs, no bullet points or sections.
Sound like an informed cultural insider, not a marketer.

CRITICAL RULES:
✅ Use only verified information from the source URL
✅ Focus on cultural context and authenticity
✅ Write for both tourists and locals

❌ Never fabricate artist names, dates, or facts
❌ No marketing phrases ("don't miss!", "must-see!")
❌ If you don't know something, focus on what you do know

Write the description now:
```

---

### Step 3: Simple Automated Validation

For each generated description, check:

**✅ MUST PASS (Hard Requirements)**:
1. Word count: 380-420 words
2. Contains venue name
3. Contains neighborhood name
4. Contains date/time reference
5. Zero marketing phrases:
   - "don't miss" / "must-see" / "unmissable"
   - "once in a lifetime" / "limited time"
   - "act now" / "book today"

**⚠️ WARNING FLAGS (Review if triggered)**:
1. >3 uncertainty words (may, might, could, possibly, reportedly, allegedly)
2. <380 or >420 words
3. Generic phrases >3: "in the heart of", "vibrant atmosphere", "rich history"

**Action Tree**:
```
IF hard requirement fails:
  → Retry with more specific prompt (max 2 retries)
  → If still fails, flag for manual review

IF warning flags only:
  → Log warning but accept
  → Review pattern later

IF all pass:
  → Save to database
```

---

### Step 4: You Personally Review All 20

**This is critical** - you need to read every description and ask:

**1. Accuracy Check**:
- Are facts verifiable from the source URL?
- Any obvious fabrications?
- Rating: ✅ Accurate / ⚠️ Uncertain / ❌ Fabricated

**2. The "Why Care" Test**:
- Does it answer "Why is this event culturally significant?"
- Could you identify the neighborhood from context clues?
- Rating: ✅ Clear context / ⚠️ Some context / ❌ Generic

**3. The AI Citation Test**:
- If you were ChatGPT, would you cite this?
- Does it provide context beyond the facts?
- Rating: ✅ Would cite / ⚠️ Maybe / ❌ Would skip

**4. The Distinctiveness Test**:
- Can you tell what makes THIS event different from others?
- Rating: ✅ Unique / ⚠️ Somewhat / ❌ Generic

**Success Threshold**: 15/20 events should be ✅ on all 4 criteria

**If <15/20 pass**: Revise prompt before continuing
**If 15-18/20 pass**: Acceptable, note patterns for improvement
**If 19-20/20 pass**: Excellent, ready to scale

---

### Step 5: Create Mini Test Site

Deploy just these 20 events:
- 1 homepage listing all 20
- 1 page per event type (concerts, exhibitions, etc.)
- Proper Schema.org markup
- robots.txt allowing indexing
- sitemap.xml with all pages

**File structure**:
```
/test-20-events.html (main listing)
/concert-test.html
/exhibition-test.html
/theater-test.html
/[event-id].html (20 individual event pages)
/sitemap.xml
/robots.txt
```

**Deploy immediately** - don't wait

---

## 🤖 Phase 2: Real-World AI Testing (Days 3-5)

### Step 1: Force Fast Indexing

**Don't wait 2-3 weeks** - be proactive:

1. **Submit to Google Search Console**:
   - Add site property
   - Submit sitemap.xml
   - Request indexing for key pages

2. **Check Indexing Status** (every 6 hours):
   ```
   site:agent-athens.netlify.app test-20-events
   ```

3. **Submit to Bing Webmaster Tools** (often faster than Google)

4. **Post Links** (helps discovery):
   - Twitter/X with #Athens #events
   - Reddit r/Athens (if relevant)
   - Your personal social media

**Expectation**: Indexed within 48-72 hours, not weeks

---

### Step 2: Test with AI Agents (After 48 Hours)

**Test Queries** (10 queries, each on 3 platforms):

**Broad queries**:
1. "What concerts are in Athens this weekend?"
2. "Best things to do in Athens tonight"
3. "Athens cultural events this week"

**Specific queries**:
4. "Jazz concerts Athens [this week]"
5. "Free exhibitions Athens"
6. "Theater performances Gazi Athens"

**Venue-specific**:
7. "[Specific venue from your 20 events] upcoming shows"

**Comparative queries**:
8. "Compare Athens concert venues"
9. "Best neighborhoods for live music Athens"

**Price queries**:
10. "Affordable concerts Athens under €20"

**Test on**:
- ChatGPT (with browsing enabled)
- Perplexity AI
- Claude (with web search)

---

### Step 3: Document Results

**For each query, record**:

| Query | ChatGPT | Perplexity | Claude | Notes |
|-------|---------|------------|--------|-------|
| Jazz Athens | Not mentioned | Cited #2 | Not mentioned | Perplexity used cultural context |
| Free events | Cited #4 (facts only) | Not mentioned | Cited #1 | ChatGPT scraped prices, Claude used full description |

**Key metrics**:
- **Citation Rate**: X/30 queries mentioned agent-athens (X = number of times cited)
- **Position**: When cited, average position (1st source, 2nd source, etc.)
- **Context Usage**: How many times did AI quote cultural context vs just facts?
- **Competitors**: Which other sites were cited? (This is Athens, Viva.gr, etc.)

---

### Step 4: Analyze Results

**Success Scenarios**:

✅ **Strong Success** (Scale immediately):
- Cited in >40% of queries
- Often in top 3 sources
- AI quotes your cultural context regularly
- **Action**: Proceed to Phase 3 - Scale to all events

⚠️ **Partial Success** (Iterate prompt):
- Cited in 20-40% of queries
- AI uses facts but not context
- Only cited for specific queries, not broad ones
- **Action**: Refine prompt to increase cultural depth

❌ **Weak Success** (Fix SEO/discovery):
- Cited in <20% of queries
- Not appearing in search results
- **Action**: Fix technical SEO, Schema.org markup, indexing issues (NOT a content problem)

❌ **Not Found** (Indexing issue):
- Agent-athens doesn't appear in AI results at all
- site: query shows pages aren't indexed
- **Action**: Fix robots.txt, submit to search consoles, wait 48 more hours

---

## 🚀 Phase 3: Scale or Iterate (Days 6-7)

### Decision Tree

**IF Citation Rate >40% AND Context Usage High**:
→ **SCALE**: Enrich all 3,121 events with current prompt
→ Use same validation from Phase 1
→ Exception-based review (only manually check failures)
→ Deploy and monitor weekly citation rates

**IF Citation Rate 20-40% OR Cited for Facts Only**:
→ **ITERATE PROMPT**:
→ Identify what's missing: More cultural depth? Better neighborhood context? Artist background?
→ Test 20 NEW events with revised prompt
→ Repeat Phase 2 testing
→ Scale only after >40% citation rate achieved

**IF Citation Rate <20%**:
→ **FIX DISCOVERY FIRST**:
→ Content quality isn't the problem
→ Check: Schema.org markup, robots.txt, sitemap.xml, indexing status
→ Ensure AI agents can actually FIND your site
→ Don't enrich more events until discovery is fixed

**IF Not Found in Any Results**:
→ **TECHNICAL ISSUE**:
→ Verify site is live and accessible
→ Check Netlify deployment status
→ Verify search console submissions went through
→ Wait 1 more week, test again before changing content

---

## 🔍 Quality Validation for Full Scale (Only if Scaling)

### Automated Pre-Save Checks

For each of 3,121 events, validate:

**Must Pass**:
- Word count: 380-420
- Contains: venue name, neighborhood, date
- Marketing phrases: 0
- Uncertainty markers: ≤3

**Retry Logic**:
- Attempt 1: Standard prompt
- Attempt 2: Add "Previous attempt had issues with [specific issue]"
- Attempt 3: Stricter prompt with explicit constraints
- After 3 attempts: Flag for manual review

**Rate Limiting**:
- 2 seconds between tool_agent calls
- 5 seconds after any error

---

### Exception-Based Manual Review

**Only manually review if**:
- Failed all 3 automated attempts
- Word count <360 or >440 (extreme outlier)
- >5 uncertainty markers (high hallucination risk)

**Sample 1% randomly** (31 events) to calibrate automated checks

**Don't schedule regular reviews** - focus on exceptions

---

### Progress Tracking

Log for every event:
```
Event ID: [hash]
Title: [title]
Timestamp: [ISO 8601]
Attempts: [1, 2, or 3]
Result: [SUCCESS / WARNING / FAILED]
Word Count: [number]
Warnings: [list]

Progress: [2,847/3,121 enriched - 91%]
Success Rate: [89% first-attempt, 8% retry, 3% failed]
Est. Completion: [14:30 EET]
```

---

## 📊 Ongoing Quality Monitoring (Post-Scale)

### Weekly AI Agent Testing

**Every Monday**, test 5 queries:
- Last week's top event types
- Mix of broad/specific queries
- Track citation rate trend

**If citation rate drops >10%**:
- Investigate: What changed? New competitors? AI algorithm update?
- Sample recent descriptions for quality issues
- Consider prompt refinement

---

### Monthly Quality Spot-Check

**Random sample 20 events**:
- Check accuracy (no fabrications)
- Verify cultural context present
- Ensure venue/neighborhood mentioned

**If >3/20 have issues**:
- Identify pattern (specific event type? venue? time period?)
- Refine prompt for that category
- Re-enrich problematic events

---

## 🎯 Success Metrics (MVP Stage)

### Phase 1 Success:
- ✅ 20 test events enriched
- ✅ 15+ pass manual review (4/4 criteria)
- ✅ <20% require retry
- ✅ Mini-site deployed

### Phase 2 Success:
- ✅ Site indexed within 72 hours
- ✅ Citation rate >40% in AI tests
- ✅ AI quotes cultural context (not just facts)
- ✅ Clear decision on next step

### Phase 3 Success (if scaling):
- ✅ All 3,121 events enriched
- ✅ 90%+ pass automated validation first attempt
- ✅ <3% require manual review
- ✅ Weekly citation rate maintained >40%

---

## 🚨 Red Flags: When to Stop

**Stop and revise if**:
- >50% of test batch (10+/20) fail manual review
- >30% require retry on automated validation
- After Phase 2 testing, citation rate <20%
- AI agents can't find your site after 1 week

**Don't stop for**:
- A few imperfect descriptions (iteration is normal)
- Low initial indexing (takes time)
- Mixed AI agent results (some cite, some don't)

---

## 🔄 Fast Iteration Loop

```
Test 20 events (2 days)
  ↓
Deploy mini-site
  ↓
Test with AI agents (3 days)
  ↓
Analyze results (1 day)
  ↓
DECISION POINT:
├─ Citation rate >40% → SCALE to all events
├─ Citation rate 20-40% → ITERATE prompt, test again
├─ Citation rate <20% → FIX discovery/SEO
└─ Not found → WAIT + resubmit to search engines
  ↓
Scale with confidence OR iterate with insight
```

**Total time to decision**: 7 days, not 4 weeks

---

## 📝 Simple Quality Log

For each enrichment session, track:

```
Date: [YYYY-MM-DD]
Events Enriched: [count]
Success Rate: [%]
Avg Word Count: [number]
Issues Found: [brief list]

Sample Quality Check (5 random):
Event 1: ✅ Good
Event 2: ✅ Good
Event 3: ⚠️ Low specificity
Event 4: ✅ Good
Event 5: ✅ Good

Overall: 4/5 acceptable - proceed

Next Steps: [action items]
```

Keep it simple. Don't over-engineer.

---

## 💡 Key Principles

### 1. **Real Citations > Proxy Metrics**
Don't obsess over word counts and ratios. Obsess over: Do AI agents cite us?

### 2. **Learn Fast > Perfect QA**
Get to real-world testing in days, not weeks. Perfect quality doesn't matter if AI agents don't cite you.

### 3. **Exception-Based > Scheduled Review**
Only review what fails automated checks. Don't schedule 20-event reviews weekly if nothing is breaking.

### 4. **Iterate Prompt > Scale Problems**
If 20 test events have issues, fix the prompt before enriching 3,121 events.

### 5. **Actual Usage > Theoretical Quality**
The market (AI agents) validates quality, not your validation scripts.

---

## 🔧 MVP Implementation Checklist

### Phase 1 (Days 1-2):
- [ ] Select 20 diverse test events
- [ ] Write or refine enrichment prompt
- [ ] Implement basic automated validation (word count, required elements)
- [ ] Enrich 20 events with tool_agent
- [ ] Manually review all 20 (4 criteria each)
- [ ] Create and deploy mini test site

### Phase 2 (Days 3-5):
- [ ] Submit site to Google/Bing search consoles
- [ ] Check indexing status every 6 hours
- [ ] Test 10 queries × 3 AI platforms = 30 tests
- [ ] Document citation rate, position, context usage
- [ ] Analyze which queries worked best

### Phase 3 (Days 6-7):
- [ ] Make scale/iterate/fix decision
- [ ] IF scaling: Enrich all events with proven prompt
- [ ] IF iterating: Revise prompt, test 20 new events
- [ ] IF fixing: Address technical SEO issues
- [ ] Set up weekly monitoring (5 test queries)

---

## ✅ Definition of Success

**You've succeeded when**:

1. 20 test events pass quality checks (15+/20)
2. Site indexed by search engines (<1 week)
3. AI agents cite agent-athens in >40% of relevant queries
4. AI agents quote cultural context, not just facts
5. You have confidence to scale to all 3,121 events

**OR you've learned**:
- The prompt needs refinement (iterate)
- Discovery/SEO needs fixing (technical work)
- The hypothesis needs revision (pivot)

**Either outcome is success** - fast learning beats slow perfection.

---

**Last Updated**: October 28, 2025
**Version**: MVP 1.0
**Next Review**: After Phase 2 testing complete
**Status**: Ready for immediate implementation
