const NEIGHBORHOOD_GREEK: Record<string, string> = {
  'Aigaleo': 'Αιγάλεω',
  'Alimos': 'Άλιμος',
  'Ambelokipi': 'Αμπελόκηποι',
  'Ambelokipoi': 'Αμπελόκηποι',
  'Ampelokipoi': 'Αμπελόκηποι',
  'Ano Liosia': 'Άνω Λιόσια',
  'Athens West': 'Δυτική Αθήνα',
  'Central Athens': 'Κέντρο Αθήνας',
  'Dafni': 'Δάφνη',
  'Egaleo': 'Αιγάλεω',
  'Elaionas': 'Ελαιώνας',
  'Ellinikon': 'Ελληνικό',
  'Exarchia': 'Εξάρχεια',
  'Faliro': 'Φάληρο',
  'Galatsi': 'Γαλάτσι',
  'Gazi': 'Γκάζι',
  'Gkyzi': 'Γκύζη',
  'Glyfada': 'Γλυφάδα',
  'Goudi': 'Γουδή',
  'Ilisia': 'Ιλίσια',
  'Kallirois': 'Καλλιρρόης',
  'Kallithea': 'Καλλιθέα',
  'Kerameikos': 'Κεραμεικός',
  'Keramikos': 'Κεραμεικός',
  'Kolonaki': 'Κολωνάκι',
  'Kolonos': 'Κολωνός',
  'Koukaki': 'Κουκάκι',
  'Kypseli': 'Κυψέλη',
  'Marousi': 'Μαρούσι',
  'Metaxourgeio': 'Μεταξουργείο',
  'Mets': 'Μετς',
  'Monastiraki': 'Μοναστηράκι',
  'Moschato': 'Μοσχάτο',
  'Nea Ionia': 'Νέα Ιωνία',
  'Nea Smyrni': 'Νέα Σμύρνη',
  'Neapoli': 'Νεάπολη',
  'Neos Kosmos': 'Νέος Κόσμος',
  'Omonia': 'Ομόνοια',
  'Omonoia': 'Ομόνοια',
  'Paleo Faliro': 'Παλαιό Φάληρο',
  'Pangrati': 'Παγκράτι',
  'Papagou': 'Παπάγου',
  'Patisia': 'Πατήσια',
  'Peania': 'Παιανία',
  'Pedion Areos': 'Πεδίον του Άρεως',
  'Perissos': 'Περισσός',
  'Peristeri': 'Περιστέρι',
  'Petralona': 'Πετράλωνα',
  'Piraeus': 'Πειραιάς',
  'Plaka': 'Πλάκα',
  'Plateia Viktorias': 'Πλατεία Βικτωρίας',
  'Psychiko': 'Ψυχικό',
  'Psyri': 'Ψυρρή',
  'Psyrri': 'Ψυρρή',
  'Rouf': 'Ρουφ',
  'Sepolia': 'Σεπόλια',
  'Syntagma': 'Σύνταγμα',
  'Tavros': 'Ταύρος',
  'Thiseio': 'Θησείο',
  'Thissio': 'Θησείο',
  'Victoria': 'Βικτώρια',
  'Viktoria': 'Βικτώρια',
  'Votanikos': 'Βοτανικός',
  'Vouliagmeni': 'Βουλιαγμένη',
  'Zografou': 'Ζωγράφου',
};

export { NEIGHBORHOOD_GREEK };

export function displayNeighborhood(name: string): string {
  // Direct lookup first (handles simple names and multi-word entries like "Ano Liosia")
  if (NEIGHBORHOOD_GREEK[name]) return NEIGHBORHOOD_GREEK[name];

  // Compound neighborhoods: "Gazi / Keramikos" → "Γκάζι / Κεραμεικός"
  if (name.includes(' / ')) {
    return name.split(' / ').map(part => NEIGHBORHOOD_GREEK[part.trim()] || part.trim()).join(' / ');
  }

  return name;
}
