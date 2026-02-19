#!/bin/bash
# Autonomous November enrichment - processes all unenriched November events

cd "/Users/chrism/Project with Claude/AgentAthens/agent-athens"

echo "📊 Counting November events needing enrichment..."

# Get list of unenriched November events
sqlite3 data/events.db << 'SQL' > /tmp/november-events.txt
SELECT id || '|' || title || '|' || venue_name || '|' || type || '|' || price_type || '|' || COALESCE(price_amount, '') || '|' || start_date
FROM events
WHERE (start_date LIKE '2025-11-%' OR start_date LIKE '2024-11-%')
ORDER BY id;
SQL

total=$(wc -l < /tmp/november-events.txt)
echo "Total November events: $total"

# Count already enriched
enriched_count=0
while IFS='|' read -r id rest; do
  if [ -f "data/enriched/$id-en.txt" ] && [ -f "data/enriched/$id-gr.txt" ]; then
    ((enriched_count++))
  fi
done < /tmp/november-events.txt

unenriched=$((total - enriched_count))
echo "Already enriched: $enriched_count"
echo "Need enrichment: $unenriched"

echo ""
echo "🚀 Starting autonomous enrichment (NO approval needed)..."
echo "Press Ctrl+C to stop"
echo ""

processed=0
while IFS='|' read -r id title venue type price_type price_amount start_date; do
  # Skip if already enriched
  if [ -f "data/enriched/$id-en.txt" ] && [ -f "data/enriched/$id-gr.txt" ]; then
    continue
  fi
  
  ((processed++))
  echo "[$processed/$unenriched] $title"
  
  # Get full description from database
  full_desc=$(sqlite3 data/events.db "SELECT COALESCE(source_full_description, '') FROM events WHERE id='$id'")
  
  # Generate English description using tool_agent
  tool_agent << EOF > "data/enriched/$id-en.txt"
Generate a compelling 400-word description for this Athens cultural event.

Event Details:
- Title: $title
- Type: $type
- Venue: $venue
- Date: $start_date
- Price: $price_type ${price_amount:+€$price_amount}
- Full Description: $full_desc

Requirements:
1. Write exactly 400 words (±20 acceptable)
2. Focus on cultural context and what makes this event special
3. Include ALL performers/creators mentioned in the description
4. Mention the Athens neighborhood and venue atmosphere
5. Write in an authentic, engaging tone (not marketing fluff)
6. Target: AI answer engines and human readers

CRITICAL: Do not fabricate information. Only use the details provided.
EOF
  
  # Generate Greek description
  tool_agent << EOF > "data/enriched/$id-gr.txt"
Δημιούργησε περιγραφή 400 λέξεων για αυτήν την πολιτιστική εκδήλωση στην Αθήνα.

Λεπτομέρειες:
- Τίτλος: $title
- Τύπος: $type
- Χώρος: $venue
- Ημερομηνία: $start_date
- Τιμή: $price_type ${price_amount:+€$price_amount}
- Περιγραφή: $full_desc

Απαιτήσεις:
1. 400 λέξεις (±20 αποδεκτό)
2. Πολιτιστικό πλαίσιο
3. ΟΛΑ τα ονόματα performers
4. Γειτονιά και ατμόσφαιρα
5. Αυθεντικό ύφος

ΚΡΙΣΙΜΟ: Μόνο δεδομένα που παρέχονται.
EOF
  
  # Rate limit
  sleep 2
  
done < /tmp/november-events.txt

echo ""
echo "🎉 COMPLETE: Enriched $processed November events"
