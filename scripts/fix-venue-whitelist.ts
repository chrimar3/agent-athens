#!/usr/bin/env bun
/**
 * Fix venue whitelist - consolidate duplicates and add missing variations
 */

import { readFileSync, writeFileSync } from 'fs';

const configPath = 'config/athens-venues.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

// Convert all entries to canonical_name format and consolidate
const venueMap = new Map<string, { canonical_name: string; variations: string[]; neighborhood: string }>();

for (const venue of config.venues) {
  const name = venue.canonical_name || venue.canonical;
  if (!name) continue;
  
  const normalizedKey = name.toLowerCase().replace(/[^a-zα-ω0-9]/g, '');
  
  if (venueMap.has(normalizedKey)) {
    // Merge variations
    const existing = venueMap.get(normalizedKey)!;
    const newVariations = venue.variations || [];
    for (const v of newVariations) {
      if (!existing.variations.includes(v)) {
        existing.variations.push(v);
      }
    }
  } else {
    venueMap.set(normalizedKey, {
      canonical_name: name,
      variations: venue.variations || [],
      neighborhood: venue.neighborhood || 'Unknown'
    });
  }
}

// Add new venues and variations
const additions = [
  // New venues
  { canonical_name: "Zelus", variations: ["Zelus, Πλουτάρχου 9, Κολωνάκι, Αθήνα, Greece", "ZELUS"], neighborhood: "Kolonaki" },
  { canonical_name: "Αλκμήνη", variations: ["Alkmini", "ΑΛΚΜΗΝΗ"], neighborhood: "Central Athens" },
  { canonical_name: "ΘΕΑΤΡΟ RADAR", variations: ["Radar Theater", "Θέατρο Radar"], neighborhood: "Central Athens" },
  { canonical_name: "ROES THEATER", variations: ["Roes Theater", "Θέατρο Roes"], neighborhood: "Central Athens" },
  { canonical_name: "Olvio", variations: ["OLVIO"], neighborhood: "Central Athens" },
  { canonical_name: "Θέατρο Nous", variations: ["Θέατρο Nous - Creative space", "Nous Creative Space"], neighborhood: "Central Athens" },
  { canonical_name: "ΠΛΥΦΑ", variations: ["Plyfa"], neighborhood: "Central Athens" },
  { canonical_name: "Σταθμός Θέατρο", variations: ["Stathmos Theatre", "Σταθμός"], neighborhood: "Central Athens" },
  { canonical_name: "Κέντρο Ελέγχου Τηλεοράσεων", variations: [], neighborhood: "Central Athens" },
  
  // Address variations for existing venues
  { canonical_name: "Dybbuk", variations: ["Dybbuk, Πατριάρχου Ιωακείμ 37, Κολωνάκι, Αθήνα, Greece"], neighborhood: "Kolonaki" },
  { canonical_name: "Crust", variations: ["Crust, Πρωτογένους 13, Ψυρρή, Αθήνα, Greece"], neighborhood: "Psyrri" },
  { canonical_name: "Astron", variations: ["Astron Club", "Astron, Λεωφόρος Κωνσταντινουπόλεως 121, Αθήνα, 10447, Greece"], neighborhood: "Votanikos" },
  { canonical_name: "Half Note Jazz Club", variations: [], neighborhood: "Mets" },
  { canonical_name: "Μέγαρο Μουσικής Αθηνών", variations: [
    "Μέγαρο Μουσικής",
    "Μέγαρο Μουσικής - Αίθουσα «Γιάννης Μαρίνος»",
    "Μέγαρο Μουσικής - αίθουσα «Χρήστος Λαμπράκης»",
    "Μέγαρο Μουσικής - αίθουσα «Δημήτρης Μητρόπουλος»",
    "Μέγαρο Μουσικής Αθηνών - Γιάννης Μαρίνος",
    "ΜΟΥΣΙΚΗ ΒΙΒΛΙΟΘΗΚΗ ΣΤΟ ΜΕΓΑΡΟ ΜΟΥΣΙΚΗΣ"
  ], neighborhood: "Ilisia" },
  { canonical_name: "Θέατρο Άβατον", variations: ["Άβατον", "Avaton"], neighborhood: "Psyrri" },
  { canonical_name: "Ίδρυμα Μιχάλης Κακογιάννης", variations: ["Ίδρυμα «Μιχάλης Κακογιάννης»", "Ίδρυμα &#171;Μιχάλης Κακογιάννης&#187;"], neighborhood: "Tavros" },
  { canonical_name: "Ολύμπια - Δημοτικό Μουσικό Θέατρο", variations: ["Ολύμπια - Δημοτικό Μουσικό Θέατρο «Μαρία Κάλλας»", "Ολύμπια - Δημοτικό Μουσικό Θέατρο &#171;Μαρία Κάλλας&#187;"], neighborhood: "Central Athens" }
];

for (const addition of additions) {
  const normalizedKey = addition.canonical_name.toLowerCase().replace(/[^a-zα-ω0-9]/g, '');
  
  if (venueMap.has(normalizedKey)) {
    const existing = venueMap.get(normalizedKey)!;
    for (const v of addition.variations) {
      if (!existing.variations.includes(v)) {
        existing.variations.push(v);
      }
    }
  } else {
    venueMap.set(normalizedKey, addition);
  }
}

// Convert back to array
const consolidatedVenues = Array.from(venueMap.values());

// Create new config
const newConfig = {
  version: "1.1",
  last_updated: new Date().toISOString().split('T')[0],
  notes: "Consolidated venue whitelist with proper canonical_name format",
  venues: consolidatedVenues,
  neighborhoods: config.neighborhoods,
  pass_through_venues: config.pass_through_venues
};

writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
console.log(`✅ Consolidated ${consolidatedVenues.length} venues`);
console.log(`   Added variations for address-style names`);
console.log(`   Added new venues: Zelus, Αλκμήνη, RADAR, ROES, Olvio, Nous, ΠΛΥΦΑ, Σταθμός`);
