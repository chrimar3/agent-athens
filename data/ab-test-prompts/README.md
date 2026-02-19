# A/B Test: Greek Description Word Count

## Objective
Test which word count (250, 350, or 450 words) produces the best descriptions for AI answer engine citation and human readability.

## Test Groups

| Group | Word Count | Events |
|-------|------------|--------|
| A | 250 words | 5 events |
| B | 350 words | 5 events |
| C | 450 words | 5 events |

## Event Distribution

### Group A (250 words)
1. **Morrissey Live in Athens** - concert, Tae Kwon Do Stadium
2. **Stelios Chatzikaleas Quartet** - jazz, Baumstrasse
3. **ΛΑΙΔΗ ΜΑΚΒΕΘ 3ος Χρόνος** - theater, Θέατρο Βαφείο
4. **Μαριάννα Καρακώστα** - Greek music, Caja de Música
5. **Bridal Expo** - exhibition, Ζάππειο

### Group B (350 words)
1. **Αδάμ Τσαρούχης - A Jazzy Christmas** - jazz, Half Note
2. **RAISED IN CAPTIVITY** - theater, Θέατρο Μπέλλος
3. **Tilemachos Moussas Farm** - experimental, Theatre Of The No
4. **200+4 Χρόνια Δανεικά** - theater, Θέατρο Τζένη Καρέζη
5. **STATHIS ANNINOS – RAPHAEL MELETEAS** - jazz, Half Note

### Group C (450 words)
1. **Με κέντρο τον Ραχμάνινοφ** - classical, Μέγαρο Μουσικής
2. **Surriento - Ο Κόσμος Ξανά** - theater, Τεχνοχώρος Εργοτάξιον
3. **Για Φίλου Πήδημα** - theater, Θέατρο Αλκμήνη
4. **Εργαστήρια 65+: Σταμπωτά Υφάσματα** - workshop, ΚΠΙΣΝ
5. **AEK BC - Patrioti Levice** - basketball, SUNEL ARENA

## Workflow

### Step 1: Generate Descriptions
Use Claude UI to process each prompt file:
- `GROUP-A-250-words.md`
- `GROUP-B-350-words.md`
- `GROUP-C-450-words.md`

### Step 2: Save Results
Save each generated description to `results/` folder:
```
results/
  A1-morrissey-live-in-athens-2025-12-12-gr.txt
  A2-stelios-chatzikaleas-quartet-2025-12-11-gr.txt
  ...
  B1-a-jazzy-christmas-2025-12-10-gr.txt
  ...
  C1--2025-12-09-gr.txt
  ...
```

### Step 3: Import to Database
```bash
bun run scripts/run-enrichment-pipeline.ts --import
```

### Step 4: Evaluate
Test with AI answer engines:
- ChatGPT: "What concerts are happening in Athens this week?"
- Perplexity: "Athens cultural events December 2025"
- Claude: "Recommend theater shows in Athens"

## Evaluation Criteria

1. **Citation Rate**: Does the AI cite/quote our descriptions?
2. **Information Density**: Is key info (date, venue, price) included?
3. **Readability**: Natural Greek, authentic tone?
4. **SEO/GEO Value**: Does it answer common queries?

## Hypothesis

- **250 words**: May be too short, missing context
- **350 words**: Balanced - enough detail without padding
- **450 words**: May include more context but risk filler

## Created
December 9, 2025
