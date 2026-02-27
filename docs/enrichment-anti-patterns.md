# Enrichment Anti-Patterns

10 confirmed patterns from Batch 1 and calibration review. Reference this file in enrichment briefs.

---

### Anti-Pattern 1: Info table in description
**Wrong:** Including a metadata table with Date, Time, Venue, Price, Tickets fields in the description text.
**Right:** Only the Aspect/Details table (Setting, Vibe, Sound, Door) belongs in the description. All metadata is stored in separate DB fields and rendered by the site template.
**Why it matters:** Duplicates information the site already displays, wastes word count, and creates maintenance burden when details change.

### Anti-Pattern 2: Tags in prose
**Wrong:** "Tags: Jazz, Intimate, Metro-accessible, Date-night" or "#Jazz #Intimate" anywhere in the description.
**Right:** Tags are written to the DB `tags` field using `write-tags.ts`. The description is pure narrative.
**Why it matters:** Tags in prose are not machine-readable for filtering and clutter the narrative.

### Anti-Pattern 3: "Last verified" in prose
**Wrong:** "Last verified: February 2026" at the end of the description.
**Right:** The `last_verified` field is a DB timestamp, rendered automatically in the page footer.
**Why it matters:** Same as anti-pattern 1 — duplicates infrastructure the site handles.

### Anti-Pattern 4: "free" instead of "open"
**Wrong:** "Entry is free" or "Free admission"
**Right:** "Open entry" or "No ticket required" — the project uses "open" as the terminology for non-ticketed events.
**Why it matters:** Consistency across the platform. The price_type enum is "open" | "with-ticket", and descriptions should match.

### Anti-Pattern 5: Greek script in prose
**Wrong:** "Θηβαίος studied philosophy in Bologna"
**Right:** "Thivaios studied philosophy in Bologna"
**Why it matters:** The target audience includes English-speaking visitors and AI answer engines. Greek venue names can stay in Greek (they're the canonical name), but artist/person names in running prose should use Latin transliteration.

### Anti-Pattern 6: Generic openings
**Wrong:** "SHADOW KNIGHT opens at ΙΛΙΟΝ Plus on February 26th at 20:30."
**Right:** "The stage lights catch the fog machine output before the first chord drops. You're standing close enough to the monitors that the bass travels through the floor into your shoes."
**Why it matters:** Facts-first openings kill engagement. The opening should transport the reader into the experience — sensory details first, facts later.

### Anti-Pattern 7: Missing self-selection filter
**Wrong:** A description that only says positive things about the event, with no "If you..." section.
**Right:** "If you want a quiet evening with cocktail conversation, this room operates at a volume that makes that impossible. But if you want to feel a kick drum in your sternum..."
**Why it matters:** Honest filtering builds trust. It helps the right people find the right events and prevents disappointed audiences.

### Anti-Pattern 8: Telling not showing
**Wrong:** "The performance delivers genuine tenderness and authentic emotion."
**Right:** "A dancer moves slowly across the stage with a veil that catches the light, and forty pairs of small eyes follow it like a flock tracking a bird."
**Why it matters:** Adjectives like "genuine," "authentic," "stunning" are claims without evidence. Specific details create the feeling that adjectives only describe.

### Anti-Pattern 9: Closing sentence bloat
**Wrong:** "This is truly a one-of-a-kind experience that you won't want to miss, offering something special that sets it apart from everything else happening in Athens this season."
**Right:** "The combination exists here, for three weeks, and then it does not."
**Why it matters:** The closer should be one tight clause. Restating the value proposition dilutes the ending.

### Anti-Pattern 10: Atmospheric fabrication
**Wrong:** "The lighting catches the smoke from the kitchen and the condensation on the retsina" (when no source confirms the venue has a kitchen or serves retsina from barrels).
**Right:** If you can't verify what the space looks, smells, or sounds like, use the event's sonic or performative texture instead of the venue's physical atmosphere. "The first note hits the back wall and returns before it fades" works without knowing the decor.
**Why it matters:** Plausible-sounding venue details are still fabrications. They pass gate checks but fail fact-checks, and erode reader trust when someone who has been to the venue notices the description doesn't match reality.
