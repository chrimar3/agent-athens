#!/usr/bin/env bun
/**
 * Fix truncated/malformed venue names in the database
 */

import { Database } from "bun:sqlite";

const db = new Database("data/events.db");

// Mapping of broken venue names to correct names
const VENUE_FIXES: Record<string, string> = {
  // Gazarte variations
  "- Ground Stage": "Gazarte - Ground Stage",
  "- Κεντρικη Σκηνη": "Gazarte - Κεντρική Σκηνή",

  // Universe variations
  "/ Saturn Area": "Universe - Saturn Area",
  "Universe - Saturn Area": "Universe - Saturn Area",
  "Universe - Sun Area": "Universe - Sun Area",

  // Museum truncations
  "και Ελιζας Γουλανδρη": "Μουσείο Μπενάκη - Πινακοθήκη Νίκου και Ελίζας Γουλανδρή",

  // Theater truncations
  "του Νεου Κοσμου": "Θέατρο του Νέου Κόσμου",

  // Temple fix
  "- PARTY Temple": "Temple",

  // Generic "Πολλαπλοι χωροι" (multiple venues) - keep but clean
  "Greece! Πολλαπλοι χωροι": "Πολλαπλοί Χώροι",
  "live Πολλαπλοι χωροι": "Πολλαπλοί Χώροι",
  "2026 Πολλαπλοι χωροι": "Πολλαπλοί Χώροι",
  "2\" Πολλαπλοι χωροι": "Πολλαπλοί Χώροι",
  "NOSTOS Πολλαπλοι χωροι": "ΚΠΙΣΝ - Πολλαπλοί Χώροι",

  // Odeon variations
  "Δεσποτοπουλος Ωδειο Αθηνων": "Ωδείο Αθηνών - Αίθουσα Δεσποτόπουλος",

  // Other fixes
  "IN ATHENS ARCH": "ARCH Club",
  "ARCH CLUB ARCH": "ARCH Club",
  "ARCH": "ARCH Club",
  "Athens AUX CLUB": "Aux Club",
  "Athens Κυτταρο Live": "Κύτταρο Live",
};

// Additional direct fixes for malformed entries (event name leaked into venue)
const ADDITIONAL_FIXES: Record<string, string> = {
  // Floyd variations
  "1000MODS 2026 Floyd": "Floyd",
  "TOUR 2026 Floyd": "Floyd",
  "& Nidhogg Floyd": "Floyd",
  "Emperor 2026 Floyd": "Floyd",
  "Μαιου CLUTCH Floyd": "Floyd",

  // Fuzz Club variations
  "05/04/2026 Fuzz Club": "Fuzz Club",
  "Fuzz Fuzz Club": "Fuzz Club",
  "NIGHTFALL Fuzz Club": "Fuzz Club",

  // Eightball Club variations
  "EIGHTBALL Eightball Club": "Eightball Club",
  "Friends-Eightball Eightball Club": "Eightball Club",

  // Christmas Theater variations
  "C.K. CHRISTMAS THEATER": "Christmas Theater",
  "CHRISTMAS THEATER": "Christmas Theater",
  "Emergence CHRISTMAS THEATER": "Christmas Theater",
  "MOTIV CHRISTMAS THEATER": "Christmas Theater",

  // Other venue leaks
  "1821-2025 Βέροια CineStar": "CineStar Βέροια",
  "Addams Θεατρο Βεμπο.": "Θέατρο Βέμπο",
  "104 -Black Box": "Ίδρυμα Μιχάλης Κακογιάννης - Black Box",
  "THE MACHINE ΟΑΚΑ": "ΟΑΚΑ",
  "THE CURE ΟΑΚΑ": "ΟΑΚΑ",
  "Chronoboros/Malignant/Unmother AN Club": "AN Club",
  "McVICAR Ωδειο Αθηνων": "Ωδείο Αθηνών",
  "WAVVES Bios Ρομαντσο": "Bios Ρομάντσο",

  // Πολλαπλοί Χώροι variations
  "Greece Πολλαπλοι χωροι": "Πολλαπλοί Χώροι",

  // Generic venue descriptions (keep but normalize)
  "Live music venue": "Live Music Venue",
  "Conservatoire (in Greek)": "Ωδείο",

  // More Floyd variations
  "Απριλιου Imminence Floyd": "Floyd",
  "Μαιου TINARIWEN Floyd": "Floyd",

  // More Fuzz Club variations
  "PESCH Fuzz Club": "Fuzz Club",

  // More AN Club variations
  "Θλίψις AN Club": "AN Club",

  // More Christmas Theater variations
  "ΘΕΟΔΩΡΑΚΗ CHRISTMAS THEATER": "Christmas Theater",
  "Αθήνα CHRISTMAS THEATER": "Christmas Theater",
  "Αθήνα CORONET THEATER": "Coronet Theater",

  // More Theater fixes
  "ΑΝΑΙΡΕΣΗ Θεατρο Αβατον": "Θέατρο Άβατον",
  "ΕΡΩΦΙΛΗ Θεατρο ΔΡΟΜΟΣ": "Θέατρο Δρόμος",
  "ΠΕΠΠΑ Θεατρο Βεμπο.": "Θέατρο Βέμπο",
  "Πλειάδες Θεατρο Αμαλια": "Θέατρο Αμαλία",
  "Τσινικόρη Θεατρο Αμαλια": "Θέατρο Αμαλία",
  "Δημητριάδη Φουρνος Θεατρο": "Φούρνος Θέατρο",
  "μαντίλι Θεατρο Φουρνος": "Θέατρο Φούρνος",
  "Παπαδιαμάντη Θεατρο Χωρος": "Θέατρο Χώρος",
  "Μυαλού Συγχρονο Θεατρο": "Σύγχρονο Θέατρο",
  "ΦΛΑΜΕΝΚΟ Θεατρο Ολυμπια": "Θέατρο Ολύμπια",
  "Τίνκερμπελ Κιν/θεατρο Ορφεας": "Κινηματοθέατρο Ορφέας",
  "TOUR Embassy Theater": "Embassy Theater",

  // More Πολλαπλοί Χώροι variations
  "ΠΕΡΙΒΑΛΛΟΝ Πολλαπλοι χωροι": "Πολλαπλοί Χώροι",
  "ΤΖΕΠΕΤΟ Πολλαπλοι χωροι": "Πολλαπλοί Χώροι",
  "Σμυρνάκης Πολλαπλοι χωροι": "Πολλαπλοί Χώροι",

  // More venue leaks
  "live Κυτταρο Live": "Κύτταρο Live",
  "Night ΙΛΙΟΝ Plus": "ΙΛΙΟΝ Plus",
  "χρόνος Studio Μαυρομιχαλη": "Studio Μαυρομιχάλη",
  "στην Αθήνα ΟΑΚΑ": "ΟΑΚΑ",
  "στην Αθήνα TBA": "TBA",
  "_ Μαριαννα Τολη": "Μαριάννα Τόλη",

  // Case/accent normalizations
  "SUNEL ARENA": "Sunel Arena",
  "Studio Mαυρομιχάλη": "Studio Μαυρομιχάλη",  // Mixed Latin/Greek M
};

console.log("🔧 Fixing venue names in database...\n");

let fixCount = 0;

// Apply direct mappings
for (const [broken, fixed] of Object.entries(VENUE_FIXES)) {
  const result = db.prepare("UPDATE events SET venue_name = ? WHERE venue_name = ?").run(fixed, broken);
  if (result.changes > 0) {
    console.log(`✅ "${broken}" → "${fixed}" (${result.changes} events)`);
    fixCount += result.changes;
  }
}

// Apply additional fixes
for (const [broken, fixed] of Object.entries(ADDITIONAL_FIXES)) {
  const result = db.prepare("UPDATE events SET venue_name = ? WHERE venue_name = ?").run(fixed, broken);
  if (result.changes > 0) {
    console.log(`✅ "${broken}" → "${fixed}" (${result.changes} events)`);
    fixCount += result.changes;
  }
}

// Clean up venue names that start with special characters
const specialCharVenues = db.prepare(`
  SELECT DISTINCT venue_name
  FROM events
  WHERE venue_name LIKE '- %'
     OR venue_name LIKE '/ %'
     OR venue_name LIKE '& %'
`).all() as { venue_name: string }[];

for (const { venue_name } of specialCharVenues) {
  // Try to find the full venue name by looking at related events
  const cleanName = venue_name.replace(/^[\/\-&]\s*/, '').trim();
  if (cleanName.length > 3) {
    const result = db.prepare("UPDATE events SET venue_name = ? WHERE venue_name = ?").run(cleanName, venue_name);
    if (result.changes > 0) {
      console.log(`✅ "${venue_name}" → "${cleanName}" (${result.changes} events)`);
      fixCount += result.changes;
    }
  }
}

console.log(`\n📊 Fixed ${fixCount} venue entries`);

// Show final venue list
console.log("\n📍 All venues in Athens:\n");

const finalVenues = db.prepare(`
  SELECT venue_name, COUNT(*) as count
  FROM events
  WHERE venue_name IS NOT NULL
  GROUP BY venue_name
  ORDER BY count DESC
`).all() as { venue_name: string; count: number }[];

for (const { venue_name, count } of finalVenues) {
  console.log(`  ${count.toString().padStart(3)} │ ${venue_name}`);
}

console.log(`\n✅ Total unique venues: ${finalVenues.length}`);

db.close();
