#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'fs';

const configPath = 'config/athens-venues.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

// New Athens venues to add
const newVenues = [
  { canonical_name: "Pharaoh", variations: ["PHARAOH"], neighborhood: "Central Athens" },
  { canonical_name: "Φιλίπ", variations: ["ΘΕΑΤΡΟ ΦΙΛΙΠ", "Θέατρο Φιλίπ"], neighborhood: "Central Athens" },
  { canonical_name: "Σκηνή Brecht - 2510", variations: ["Σκηνή «Brecht» - 2510", "Σκηνή &#171;Brecht&#187; - 2510"], neighborhood: "Central Athens" },
  { canonical_name: "Ροές", variations: ["ROES", "Roes"], neighborhood: "Central Athens" },
  { canonical_name: "Αυλαία Πολυχώρος", variations: ["Αυλαία"], neighborhood: "Central Athens" },
  { canonical_name: "Calderone Art Space", variations: ["Calderone"], neighborhood: "Central Athens" },
  { canonical_name: "Studio Μαυρομιχάλη", variations: ["Studio Mαυρομιχάλη", "Studio Mavromichali"], neighborhood: "Exarchia" },
  { canonical_name: "Μικρό Γκλόρια", variations: ["Mikro Gloria"], neighborhood: "Central Athens" },
  { canonical_name: "Θέατρο Lib'ro", variations: ["Libro", "Lib'ro"], neighborhood: "Central Athens" },
  { canonical_name: "Δίπυλον", variations: ["Dipylon"], neighborhood: "Kerameikos" },
  { canonical_name: "Βαφείο - Λάκης Καραλής", variations: ["Βαφείο-«Λάκης Καραλής»", "Βαφείο-&#171;Λάκης Καραλής&#187;"], neighborhood: "Metaxourgeio" },
  { canonical_name: "Άνεσις", variations: ["Θέατρο Άνεσις", "Anesis"], neighborhood: "Central Athens" },
  { canonical_name: "Studio Κυψέλης", variations: ["Studio Kypselis"], neighborhood: "Kypseli" },
  { canonical_name: "Stage 7", variations: ["Stage7"], neighborhood: "Central Athens" },
  { canonical_name: "Red Jasper Cabaret Theatre", variations: ["Red Jasper"], neighborhood: "Central Athens" },
  { canonical_name: "Paraga", variations: ["PARAGA"], neighborhood: "Central Athens" },
  { canonical_name: "MÉTRON Stage", variations: ["M&#201;TRON Stage", "Metron Stage"], neighborhood: "Central Athens" },
  { canonical_name: "Arroyo", variations: ["ARROYO", "Arroyo Theater"], neighborhood: "Central Athens" },
  { canonical_name: "104", variations: ["Θέατρο 104"], neighborhood: "Central Athens" },
  { canonical_name: "Fuzz Club", variations: ["Fuzz Live Music Club", "FUZZ", "Fuzz"], neighborhood: "Tavros" },
  { canonical_name: "Μορφές Έκφρασης", variations: [], neighborhood: "Central Athens" },
  { canonical_name: "Τεχνοχώρος Εργοτάξιον", variations: ["Τεχνοχώρος&#160;Εργοτάξιον"], neighborhood: "Gazi" },
  { canonical_name: "Τεχνοχώρος Φάμπρικα", variations: ["Fabrika"], neighborhood: "Votanikos" },
  { canonical_name: "Γκλόρια", variations: ["Gloria"], neighborhood: "Central Athens" },
  { canonical_name: "Αργώ", variations: ["Θέατρο Αργώ", "Θέατρο Αργώ - Κεντρική Σκηνή"], neighborhood: "Central Athens" },
  { canonical_name: "Αλίκη", variations: ["Θέατρο Αλίκη"], neighborhood: "Central Athens" },
  { canonical_name: "Ακροπόλ", variations: ["Akropol"], neighborhood: "Central Athens" },
  { canonical_name: "Αγγέλων Βήμα", variations: [], neighborhood: "Psyrri" },
  { canonical_name: "Αίθουσα Διδασκαλίας Μεγάρου Μουσικής", variations: ["Αίθουσα Διδασκαλίας του Μεγάρου Μουσικής Αθηνών"], neighborhood: "Ilisia" },
  { canonical_name: "Art 63", variations: ["ART63", "ART 63"], neighborhood: "Central Athens" },
  { canonical_name: "Altera Pars", variations: [], neighborhood: "Central Athens" },
  { canonical_name: "Εθνική Λυρική Σκηνή", variations: ["Εθνική Λυρική Σκηνή - Εναλλακτική Σκηνή", "Εθνική Λυρική Σκηνή - αίθουσα «Σταύρος Νιάρχος»", "Εθνική Λυρική Σκηνή - αίθουσα &#171;Σταύρος Νιάρχος&#187;"], neighborhood: "Kallithea" },
  { canonical_name: "Θέατρο Αλκυονίς", variations: ["Αλκυονίς", "Alkyonis"], neighborhood: "Central Athens" },
  { canonical_name: "Θέατρο του Νέου Κόσμου", variations: [], neighborhood: "Neos Kosmos" },
  { canonical_name: "Θέατρο Κάτια Δανδουλάκη", variations: ["«Κάτια Δανδουλάκη»", "&#171;Κάτια Δανδουλάκη&#187;"], neighborhood: "Central Athens" },
  { canonical_name: "Μικρό Παλλάς", variations: ["Mikro Pallas"], neighborhood: "Central Athens" },
  { canonical_name: "Ίλιον Plus", variations: ["Ίλιον", "Ilion Plus", "ΙΛΙΟΝ Plus"], neighborhood: "Central Athens" },
  { canonical_name: "Θέατρο Τζένη Καρέζη", variations: ["«Τζένη Καρέζη»", "&#171;Τζένη Καρέζη&#187;"], neighborhood: "Central Athens" },
  { canonical_name: "Θέατρο Χορν", variations: ["«Δημήτρης Χορν»", "&#171;Δημήτρης Χορν&#187;"], neighborhood: "Central Athens" },
  { canonical_name: "Ριάλτο", variations: ["«Αλέκος Αλεξανδράκης» - Ριάλτο", "&#171;Αλέκος Αλεξανδράκης&#187; - Ριάλτο"], neighborhood: "Central Athens" },
  { canonical_name: "Cozmo Athens", variations: ["Cozmo"], neighborhood: "Central Athens" },
  { canonical_name: "Eliart", variations: ["Θέατρο Eliart"], neighborhood: "Central Athens" },
  { canonical_name: "και Ελίζας Γουλανδρή", variations: ["και Ελιζας Γουλανδρη", "Μουσείο Μοντέρνας Τέχνης Ιδρύματος Βασίλη & Ελίζας Γουλανδρή"], neighborhood: "Pangrati" }
];

// Add to existing venues
for (const venue of newVenues) {
  const exists = config.venues.find((v: any) => 
    (v.canonical_name || v.canonical)?.toLowerCase() === venue.canonical_name.toLowerCase()
  );
  if (!exists) {
    config.venues.push(venue);
    console.log(`Added: ${venue.canonical_name}`);
  } else {
    // Merge variations
    const variations = venue.variations || [];
    for (const v of variations) {
      if (!exists.variations?.includes(v)) {
        exists.variations = exists.variations || [];
        exists.variations.push(v);
      }
    }
  }
}

config.last_updated = new Date().toISOString().split('T')[0];
writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(`\n✅ Whitelist updated with ${newVenues.length} venues`);
