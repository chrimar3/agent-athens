// Test fixtures: Sample Event objects for testing
import type { Event } from '../../src/types';

export const sampleConcert: Event = {
  "@context": "https://schema.org",
  "@type": "MusicEvent",
  id: "jazz-night-at-half-note-2025-11-15",
  title: "Jazz Night at Half Note",
  description: "An evening of smooth jazz featuring local and international artists.",
  fullDescription: "Experience an unforgettable evening of smooth jazz at Athens' premier jazz venue. Featuring a lineup of talented local and international musicians, this night promises to deliver world-class performances in an intimate setting. The Half Note Jazz Club, located in the heart of Mets, has been a cornerstone of Athens' music scene for decades, known for its exceptional acoustics and warm atmosphere. Tonight's program includes classic standards and contemporary compositions, showcasing the versatility and creativity of the jazz genre. Whether you're a long-time jazz enthusiast or new to the scene, this concert offers something for everyone. Doors open at 20:00, with the main performance starting at 21:30. Light refreshments and a full bar are available throughout the evening.",
  hasNativeGreek: false,
  startDate: "2025-11-15T21:30:00+03:00",
  endDate: "2025-11-16T00:00:00+03:00",
  type: "concert",
  genres: ["jazz"],
  tags: [],
  venue: {
    name: "Half Note Jazz Club",
    address: "17 Trivonianou St, Mets, Athens 116 36",
    neighborhood: "Mets",
    coordinates: {
      lat: 37.9648,
      lon: 23.7432
    },
    capacity: 200
  },
  price: {
    type: "with-ticket",
    amount: 15,
    currency: "EUR",
    range: "€15-€20"
  },
  url: "https://example.com/jazz-night",
  source: "viva.gr",
  createdAt: "2025-10-31T10:00:00Z",
  updatedAt: "2025-10-31T10:00:00Z",
  language: "en",
  ticketUrlResolved: null,
};

export const sampleFreeExhibition: Event = {
  "@context": "https://schema.org",
  "@type": "ExhibitionEvent",
  id: "contemporary-art-at-gagosian-2025-11-20",
  title: "Contemporary Art at Gagosian",
  description: "A showcase of contemporary Greek artists.",
  hasNativeGreek: false,
  startDate: "2025-11-20T10:00:00+03:00",
  endDate: "2025-12-20T18:00:00+03:00",
  type: "exhibition",
  genres: ["contemporary-art"],
  tags: ["open"],
  venue: {
    name: "Gagosian Athens",
    address: "3 Merlin St, Kolonaki, Athens 106 71",
    neighborhood: "Kolonaki",
    coordinates: {
      lat: 37.9749,
      lon: 23.7341
    }
  },
  price: {
    type: "open"
  },
  url: "https://example.com/contemporary-art",
  source: "more.com",
  createdAt: "2025-10-31T10:00:00Z",
  updatedAt: "2025-10-31T10:00:00Z",
  language: "en",
  ticketUrlResolved: null,
};

export const sampleTheaterPerformance: Event = {
  "@context": "https://schema.org",
  "@type": "TheaterEvent",
  id: "hotel-amour-2025-11-10",
  title: "HOTEL AMOUR",
  description: "A new musical by Gerasimos Evangelatos and Themis Karamouratidis",
  hasNativeGreek: false,
  startDate: "2025-11-10T21:00:00+03:00",
  type: "theater",
  genres: ["musical"],
  tags: [],
  venue: {
    name: "ΘΕΑΤΡΟ ΑΚΡΟΠΟΛ",
    address: "Athens, Greece",
    coordinates: {
      lat: 37.9838,
      lon: 23.7276
    }
  },
  price: {
    type: "with-ticket",
    amount: 25,
    currency: "EUR",
    range: "€25-€35"
  },
  url: "https://www.viva.gr/gr-el/tickets/theater/hotel-amour/",
  source: "viva.gr",
  createdAt: "2025-10-31T10:00:00Z",
  updatedAt: "2025-10-31T10:00:00Z",
  language: "en",
  ticketUrlResolved: null,
};

export const sampleWorkshop: Event = {
  "@context": "https://schema.org",
  "@type": "EducationEvent",
  id: "photography-basics-2025-11-12",
  title: "Photography Basics Workshop",
  description: "Learn the fundamentals of photography in this hands-on workshop.",
  hasNativeGreek: false,
  startDate: "2025-11-12T10:00:00+03:00",
  endDate: "2025-11-12T16:00:00+03:00",
  type: "workshop",
  genres: ["photography"],
  tags: [],
  venue: {
    name: "Technopolis City of Athens",
    address: "100 Pireos St, Gazi, Athens 118 54",
    neighborhood: "Gazi",
    coordinates: {
      lat: 37.9785,
      lon: 23.7152
    }
  },
  price: {
    type: "with-ticket",
    amount: 45,
    currency: "EUR",
    range: "€45"
  },
  url: "https://example.com/photography-workshop",
  source: "This is Athens",
  createdAt: "2025-10-31T10:00:00Z",
  updatedAt: "2025-10-31T10:00:00Z",
  language: "en",
  ticketUrlResolved: null,
};

// Event happening today (dynamically generated)
export function getTodayEvent(): Event {
  const today = new Date();
  today.setHours(20, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    id: "concert-today-" + today.toISOString().split('T')[0],
    title: "Tonight's Concert",
    description: "A special concert happening tonight",
    hasNativeGreek: false,
    startDate: today.toISOString(),
    type: "concert",
    genres: ["rock"],
    tags: [],
    venue: {
      name: "Gagarin 205",
      address: "205 Liosion St, Athens",
      neighborhood: "Athens",
      coordinates: {
        lat: 38.0067,
        lon: 23.7282
      }
    },
    price: {
      type: "with-ticket",
      amount: 20,
      currency: "EUR"
    },
    url: "https://example.com/tonight",
    source: "viva.gr",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    language: "en",
    ticketUrlResolved: null,
  };
}

// Event happening tomorrow
export function getTomorrowEvent(): Event {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(21, 0, 0, 0);

  return {
    "@context": "https://schema.org",
    "@type": "TheaterEvent",
    id: "play-tomorrow-" + tomorrow.toISOString().split('T')[0],
    title: "Tomorrow's Theater Play",
    description: "A captivating theater performance",
    hasNativeGreek: false,
    startDate: tomorrow.toISOString(),
    type: "theater",
    genres: ["drama"],
    tags: [],
    venue: {
      name: "National Theatre",
      address: "Athens, Greece",
      coordinates: {
        lat: 37.9838,
        lon: 23.7276
      }
    },
    price: {
      type: "with-ticket",
      amount: 15,
      currency: "EUR"
    },
    url: "https://example.com/tomorrow-play",
    source: "more.com",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    language: "en",
    ticketUrlResolved: null,
  };
}

export const sampleConcertWithTicket: Event = {
  ...sampleConcert,
  ticketUrl: "https://www.viva.gr/tickets/jazz-night/",
  // viva.gr is on the ticket-host allowlist; resolver classifies as Tier 1 direct.
  // D7's CTA mapper requires ticketUrlStatus to gate "Buy tickets" rendering;
  // pre-D11 tests relied on implicit "any ticketUrl → CTA" which D7 removed.
  ticketUrlStatus: "direct",
};

// Collection of all sample events
export const allSampleEvents: Event[] = [
  sampleConcert,
  sampleFreeExhibition,
  sampleTheaterPerformance,
  sampleWorkshop
];
