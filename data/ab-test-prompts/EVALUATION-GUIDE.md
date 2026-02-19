# A/B Test Evaluation Guide

## Test Overview
- **15 events** enriched with Greek descriptions
- **3 word count groups**: 250, 350, 450 words
- **Goal**: Determine which description length gets cited most by AI answer engines

## Live URLs for Testing

Site: https://agent-athens.netlify.app

### Pages Containing A/B Test Events:

| Page | A/B Events |
|------|------------|
| `/concert-tomorrow` | A1 (Morrissey), A2 (Jazz Quartet) |
| `/concert-this-week` | A1, A2, B1 (Jazzy Christmas), B3 (Farm) |
| `/theater-this-week` | A3 (Lady Macbeth), B2 (Raised in Captivity), C2 (Surriento), C3 (Για Φίλου Πήδημα) |
| `/workshop-this-week` | C4 (SNFCC 65+ workshop) |
| `/performance-this-week` | B4 (200+4 Years), B5 (For Armando) |
| `/this-week` | All 15 events |

---

## Test Queries for AI Answer Engines

### Greek Queries (Primary Test)

Use these queries with ChatGPT, Perplexity, Claude, and Google AI:

#### General Discovery
1. "Τι εκδηλώσεις γίνονται στην Αθήνα αυτή την εβδομάδα;"
2. "Συναυλίες στην Αθήνα Δεκέμβριος 2025"
3. "Θέατρο Αθήνα αυτό το Σαββατοκύριακο"

#### Event-Specific Queries
4. "Morrissey συναυλία Αθήνα 2025"
5. "Τζαζ συναυλίες Αθήνα Δεκέμβριος"
6. "Εργαστήρια για ηλικιωμένους ΚΠΙΣΝ"
7. "AEK μπάσκετ παιχνίδι Δεκέμβριος"

#### Venue-Based Queries
8. "Εκδηλώσεις Gazarte Δεκέμβριος"
9. "Τι παίζει στο Θέατρο Αλκμήνη;"
10. "Παραστάσεις στο Ίδρυμα Νιάρχος"

### English Queries (Secondary Test)

11. "Athens events this week December 2025"
12. "Morrissey concert Athens Greece"
13. "Theater performances Athens weekend"

---

## Evaluation Criteria

### For Each AI Response, Record:

| Metric | Description |
|--------|-------------|
| **Citation** | Did the AI cite agent-athens.netlify.app? (Yes/No) |
| **Event Mentioned** | Which A/B test event(s) appeared in response? |
| **Description Used** | Did it quote from the enriched description? (Yes/Partial/No) |
| **Word Count Group** | A (250w), B (350w), or C (450w) |
| **Response Quality** | Rate 1-5 how useful the response was |

### Tracking Spreadsheet Template

```
Query | AI Engine | Event Cited | Group | Description Quoted | Link Provided | Quality
------|-----------|-------------|-------|-------------------|---------------|--------
Q1    | ChatGPT   | Morrissey   | A     | Yes (partial)     | No            | 4
Q1    | Perplexity| Jazzy Xmas  | B     | Yes (full)        | Yes           | 5
```

---

## A/B Test Event Reference

### Group A - 250 Words (Concise)
| ID | Event | Type |
|----|-------|------|
| A1 | Morrissey Live in Athens | concert |
| A2 | Stelios Chatzikaleas Quartet | concert |
| A3 | ΛΑΙΔΗ ΜΑΚΒΕΘ 3ος Χρόνος | theater |
| A4 | Μαριάννα Καρακώστα | concert |
| A5 | Bridal Expo 2025 | exhibition |

### Group B - 350 Words (Medium)
| ID | Event | Type |
|----|-------|------|
| B1 | A Jazzy Christmas | concert |
| B2 | Raised in Captivity | theater |
| B3 | Tilemachos Moussas Farm | concert |
| B4 | 200+4 Χρόνια Δανεικά | performance |
| B5 | For Armando with Love | performance |

### Group C - 450 Words (Comprehensive)
| ID | Event | Type |
|----|-------|------|
| C1 | Με κέντρο τον Ραχμάνινοφ | concert |
| C2 | Surriento - Ο Κόσμος Ξανά | theater |
| C3 | Για Φίλου Πήδημα | theater |
| C4 | Εργαστήρια 65+ ΚΠΙΣΝ | workshop |
| C5 | AEK BC - Patrioti Levice | sports |

---

## Expected Outcomes

### Hypothesis
Longer descriptions (Group C - 450w) will be cited more often because:
- More factual content for AI to extract
- Higher semantic density
- More context for relevance matching

### Alternative Hypothesis
Medium descriptions (Group B - 350w) might perform best:
- Optimal balance of detail and conciseness
- AI may prefer extractable snippets over dense text

### Null Hypothesis
No significant difference between groups - AI behavior is based on factors other than description length.

---

## Testing Schedule

### Recommended Approach
1. Test each query on all 4 AI engines
2. Record results in spreadsheet
3. Repeat tests over 3 different days (AI responses vary)
4. Calculate citation rate per group

### Timeline
- **Day 1**: Test Greek queries 1-7
- **Day 2**: Test Greek queries 8-10, English queries
- **Day 3**: Repeat top 5 queries for validation
- **Day 4**: Analyze results, determine winner

---

## Post-Test Actions

Based on results:
1. **If Group A wins**: Use 250-word prompts for all future enrichment
2. **If Group B wins**: Use 350-word prompts (current default is 400w)
3. **If Group C wins**: Increase to 450-word prompts
4. **If no difference**: Keep current 400-word default, optimize for other factors

---

## Notes

- Netlify deployment is live at https://agent-athens.netlify.app
- Site updates propagate within 2 minutes of git push
- AI engines may take 24-48 hours to re-index new content
- For immediate testing, use Perplexity (indexes in real-time)
