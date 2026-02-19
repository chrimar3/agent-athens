// Test fixtures: Sample RawEvent objects (parser output format)
import type { RawEvent } from '../../src/types';

export const sampleRawConcert: RawEvent = {
  title: "Jazz Night at Half Note",
  date: "2025-11-15",
  time: "21:30",
  venue: "Half Note Jazz Club",
  location: "17 Trivonianou St, Mets, Athens 116 36",
  type: "concert",
  genre: "jazz",
  price: "with-ticket",
  description: "An evening of smooth jazz featuring local and international artists.",
  url: "https://www.viva.gr/gr-el/tickets/music/jazz-night/",
  source: "viva.gr"
};

export const sampleRawFreeExhibition: RawEvent = {
  title: "Contemporary Art at Gagosian",
  date: "2025-11-20",
  time: "",
  venue: "Gagosian Athens",
  location: "Athens, Greece",
  type: "exhibition",
  genre: "contemporary-art",
  price: "open",
  description: "A showcase of contemporary Greek artists.",
  url: "https://www.gagosian.com/exhibitions/",
  source: "more.com"
};

export const sampleRawTheater: RawEvent = {
  title: "HOTEL AMOUR",
  date: "2025-11-10",
  time: "21:00",
  venue: "ΘΕΑΤΡΟ ΑΚΡΟΠΟΛ",
  location: "Athens, Greece",
  type: "concert",  // Note: viva.gr classifies theater as concerts
  genre: "",
  price: "with-ticket",
  description: "HOTEL AMOUR - Το νέο μιούζικαλ των Γεράσιμου Ευαγγελάτου και Θέμη Καραμουρατίδη - Σκηνοθεσία: Σμαράγδα Καρύδη",
  url: "https://www.viva.gr/gr-el/tickets/theater/hotel-amour/",
  source: "viva.gr"
};

export const sampleRawWorkshop: RawEvent = {
  title: "Photography Basics Workshop",
  date: "2025-11-12",
  time: "10:00",
  venue: "Technopolis City of Athens",
  location: "100 Pireos St, Gazi, Athens 118 54",
  type: "workshop",
  genre: "photography",
  price: "with-ticket",
  description: "Learn the fundamentals of photography in this hands-on workshop.",
  url: "https://example.com/photography-workshop",
  source: "This is Athens"
};

// Non-Athens event (should be filtered out)
export const sampleRawNonAthens: RawEvent = {
  title: "Beach Concert in Mykonos",
  date: "2025-11-15",
  time: "20:00",
  venue: "Paradise Beach Club",
  location: "Mykonos, Greece",
  type: "concert",
  genre: "electronic",
  price: "with-ticket",
  description: "Summer beach party with international DJs",
  url: "https://example.com/mykonos-concert",
  source: "viva.gr"
};

// Event with Greek characters
export const sampleRawGreek: RawEvent = {
  title: "Ελληνική Μουσική Βραδιά",
  date: "2025-11-18",
  time: "21:00",
  venue: "Μέγαρο Μουσικής Αθηνών",
  location: "Βασ. Σοφίας και Κόκκαλη, 115 21 Αθήνα",
  type: "concert",
  genre: "traditional",
  price: "with-ticket",
  description: "Βραδιά παραδοσιακής ελληνικής μουσικής με κορυφαίους καλλιτέχνες",
  url: "https://www.megaron.gr/event/greek-night/",
  source: "megaron.gr"
};

// Event with no time specified (should default to 20:00)
export const sampleRawNoTime: RawEvent = {
  title: "Art Exhibition Opening",
  date: "2025-11-25",
  time: "",
  venue: "Andie Art Gallery",
  location: "Athens, Greece",
  type: "exhibition",
  genre: "modern-art",
  price: "open",
  description: "Opening night of a modern art exhibition",
  url: "https://example.com/exhibition",
  source: "more.com"
};

// Event with price range
export const sampleRawPriceRange: RawEvent = {
  title: "Rock Festival 2025",
  date: "2025-12-05",
  time: "18:00",
  venue: "Πλατεια Νερου, Φαληρο",
  location: "Athens, Greece",
  type: "concert",
  genre: "rock",
  price: "with-ticket",
  description: "Multi-day rock festival featuring international bands",
  url: "https://example.com/rock-festival",
  source: "viva.gr"
};

// Collection of all sample raw events
export const allSampleRawEvents: RawEvent[] = [
  sampleRawConcert,
  sampleRawFreeExhibition,
  sampleRawTheater,
  sampleRawWorkshop,
  sampleRawGreek,
  sampleRawNoTime,
  sampleRawPriceRange
];

// Sample wrapper format (as returned by parsers)
export const sampleParserOutput = {
  events: allSampleRawEvents
};
