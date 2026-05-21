/**
 * UI Strings for bilingual event pages (el / en)
 *
 * Single source of truth for all translatable UI text.
 * No i18n framework — just a typed record.
 */

export type Locale = 'el' | 'en';

export interface UIStrings {
  // HTML / OG
  lang: string;
  ogLocale: string;

  // Event types (singular)
  typeLabels: Record<string, string>;

  // Discovery links ("All Concerts", "All Exhibitions")
  typeDiscoveryLabels: Record<string, string>;

  // Event page UI
  buyTickets: string;
  buyTicketsArrow: string;
  findTicketsArrow: string;     // Tier-3 platform search ("lands on results, not the event")
  checkVenueWebsite: string;    // Tier-5 fallback label
  checkVenueArrow: string;      // Tier-5 fallback label with arrow
  doorOnly: string;             // Events with no online purchase
  ticketsShort: string;
  freeEntry: string;
  openEntry: string;
  ticketed: string;
  freeDonation: string;
  readMore: string;
  readLess: string;
  moreEventsAt: string;       // "Περισσότερες εκδηλώσεις στο" / "More events at"
  eventsInArea: string;       // "Εκδηλώσεις στην περιοχή" / "Events in"
  exploreMore: string;        // "Εξερευνήστε περισσότερα" / "Explore more"
  upcomingEventsAt: string;   // "Επόμενες εκδηλώσεις στο" / "Upcoming events at"
  source: string;             // "Πηγή" / "Source"
  eventEnded: string;         // "Αυτή η εκδήλωση έχει ολοκληρωθεί" / "This event has ended"
  openMap: string;            // "Άνοιγμα στον Χάρτη" / "Open in Maps"
  atTime: string;             // "στις" / "at" (before time)

  // Exhibition-specific
  currentlyOpen: string;      // "Τώρα ανοιχτή" / "Now open"
  currentlyOpenShort: string; // "ΑΝΟΙΧΤΗ" / "OPEN"
  exhibitionOpenRelated: string; // "Ανοιχτή" / "Open" (for related card)
  ongoing: string;            // "Συνεχίζεται" / "Ongoing"

  // Practical block
  practicalInfo: string;
  practicalLabels: Record<string, string>; // labelEn keys → localized labels

  // Door policies
  doorPolicies: Record<string, string>;

  // Hub page strings
  hubOverview: string;
  hubDetailed: string;
  hubFaq: string;
  hubEventCount: string;
  hubColEvent: string;
  hubColVenue: string;
  hubColDate: string;
  hubColEntry: string;
  hubFreeEntry: string;
  hubTicketed: string;

  // Save & Share
  saveEvent: string;
  unsaveEvent: string;
  savedEvents: string;
  savedEventsEmpty: string;
  savedEventsDesc: string;
  shareEvent: string;
  linkCopied: string;
  savedRequiresJs: string;
  addToCalendar: string;
  calendarGoogle: string;
  calendarAppleIcs: string;
  calendarOutlook: string;
}

export const STRINGS: Record<Locale, UIStrings> = {
  el: {
    lang: 'el',
    ogLocale: 'el_GR',

    typeLabels: {
      concert: 'Συναυλία',
      dj_set: 'DJ Set',
      classical: 'Κλασική Μουσική',
      opera: 'Όπερα',
      theater: 'Θέατρο',
      dance: 'Χορός',
      comedy: 'Κωμωδία',
      exhibition: 'Έκθεση',
      screening: 'Προβολή',
      cinema: 'Κινηματογράφος',
      workshop: 'Εργαστήριο',
      show: 'Show',
      festival: 'Φεστιβάλ',
      performance: 'Παράσταση',
      other: 'Εκδήλωση',
    },

    typeDiscoveryLabels: {
      concert: 'Όλες οι Συναυλίες',
      dj_set: 'Όλα τα DJ Sets',
      theater: 'Όλες οι Θεατρικές Παραστάσεις',
      exhibition: 'Όλες οι Εκθέσεις',
      screening: 'Όλες οι Προβολές',
      cinema: 'Όλες οι Ταινίες',
      workshop: 'Όλα τα Εργαστήρια',
      show: 'Όλα τα Shows',
      festival: 'Όλα τα Φεστιβάλ',
      performance: 'Όλες οι Παραστάσεις',
      tech: 'Όλα τα Tech Events',
      other: 'Όλες οι Εκδηλώσεις',
    },

    buyTickets: 'Αγοράστε εισιτήρια',
    buyTicketsArrow: 'Αγοράστε εισιτήρια →',
    findTicketsArrow: 'Βρείτε εισιτήρια →',
    checkVenueWebsite: 'Δείτε το site του χώρου',
    checkVenueArrow: 'Δείτε το site του χώρου →',
    doorOnly: 'Μόνο στην είσοδο',
    ticketsShort: 'Εισιτήρια',
    freeEntry: 'Ελεύθερη είσοδος',
    openEntry: 'Ελεύθερη είσοδος',
    ticketed: 'Με εισιτήριο',
    freeDonation: 'Ελεύθερη συνεισφορά',
    readMore: 'Περισσότερα ▾',
    readLess: 'Λιγότερα ▴',
    moreEventsAt: 'Περισσότερες εκδηλώσεις στο',
    eventsInArea: 'Εκδηλώσεις στην περιοχή',
    exploreMore: 'Εξερευνήστε περισσότερα',
    upcomingEventsAt: 'Επόμενες εκδηλώσεις στο',
    source: 'Πηγή',
    eventEnded: 'Αυτή η εκδήλωση έχει ολοκληρωθεί.',
    openMap: 'Άνοιγμα στον Χάρτη →',
    atTime: 'στις',

    currentlyOpen: 'Τώρα ανοιχτή',
    currentlyOpenShort: 'ΑΝΟΙΧΤΗ',
    exhibitionOpenRelated: 'Ανοιχτή',
    ongoing: 'Συνεχίζεται',

    practicalInfo: 'Πρακτικές Πληροφορίες',
    practicalLabels: {
      'Duration': 'Διάρκεια',
      'Date': 'Ημερομηνία',
      'Time': 'Ώρα',
      'Today': 'Σήμερα',
      'Closed': 'Κλειστά',
      'Peak time': 'Peak time',
      'Price': 'Τιμή',
      'Tickets': 'Εισιτήρια',
      'Venue': 'Χώρος',
      'Address': 'Διεύθυνση',
      'Getting there': 'Πρόσβαση',
      'Door policy': 'Είσοδος',
    },

    doorPolicies: {
      strict: 'Αυστηρός έλεγχος ηλικίας',
      moderate: 'Έλεγχος ταυτότητας',
      relaxed: 'Χαλαρή είσοδος',
      members: 'Μόνο μέλη',
      guestlist: 'Guest list απαιτείται',
      dress_code: 'Dress code',
    },

    hubOverview: 'Επισκόπηση',
    hubDetailed: 'Αναλυτικά',
    hubFaq: 'Συχνές Ερωτήσεις',
    hubEventCount: 'εκδηλώσεις',
    hubColEvent: 'Εκδήλωση',
    hubColVenue: 'Χώρος',
    hubColDate: 'Ημερομηνία',
    hubColEntry: 'Είσοδος',
    hubFreeEntry: 'Ελ. είσοδος',
    hubTicketed: 'Εισιτήριο',

    saveEvent: 'Αποθήκευση',
    unsaveEvent: 'Αποθηκευμένο',
    savedEvents: 'Αποθηκευμένα',
    savedEventsEmpty: 'Δεν έχετε αποθηκευμένες εκδηλώσεις ακόμα.',
    savedEventsDesc: 'Τα αποθηκευμένα σας events — agent athens πολιτιστικές εκδηλώσεις Αθήνα',
    shareEvent: 'Κοινοποίηση',
    linkCopied: 'Ο σύνδεσμος αντιγράφηκε!',
    savedRequiresJs: 'Απαιτείται JavaScript για την προβολή αποθηκευμένων εκδηλώσεων.',
    addToCalendar: 'Ημερολόγιο',
    calendarGoogle: 'Google Ημερολόγιο',
    calendarAppleIcs: 'Apple / .ics',
    calendarOutlook: 'Outlook',
  },

  en: {
    lang: 'en',
    ogLocale: 'en_US',

    typeLabels: {
      concert: 'Concert',
      dj_set: 'DJ Set',
      classical: 'Classical Music',
      opera: 'Opera',
      theater: 'Theatre',
      dance: 'Dance',
      comedy: 'Comedy',
      exhibition: 'Exhibition',
      screening: 'Screening',
      cinema: 'Cinema',
      workshop: 'Workshop',
      show: 'Show',
      festival: 'Festival',
      performance: 'Performance',
      other: 'Event',
    },

    typeDiscoveryLabels: {
      concert: 'All Concerts',
      dj_set: 'All DJ Sets',
      theater: 'All Theatre',
      exhibition: 'All Exhibitions',
      screening: 'All Screenings',
      cinema: 'All Films',
      workshop: 'All Workshops',
      show: 'All Shows',
      festival: 'All Festivals',
      performance: 'All Performances',
      tech: 'All Tech Events',
      other: 'All Events',
    },

    buyTickets: 'Buy tickets',
    buyTicketsArrow: 'Buy tickets →',
    findTicketsArrow: 'Find tickets →',
    checkVenueWebsite: 'Check venue website',
    checkVenueArrow: 'Check venue website →',
    doorOnly: 'At the door',
    ticketsShort: 'Tickets',
    freeEntry: 'Free entry',
    openEntry: 'Free entry',
    ticketed: 'Ticketed',
    freeDonation: 'Free (donations welcome)',
    readMore: 'Read more ▾',
    readLess: 'Read less ▴',
    moreEventsAt: 'More events at',
    eventsInArea: 'Events in',
    exploreMore: 'Explore more',
    upcomingEventsAt: 'Upcoming events at',
    source: 'Source',
    eventEnded: 'This event has ended.',
    openMap: 'Open in Maps →',
    atTime: 'at',

    currentlyOpen: 'Now open',
    currentlyOpenShort: 'OPEN',
    exhibitionOpenRelated: 'Open',
    ongoing: 'Ongoing',

    practicalInfo: 'Practical Information',
    practicalLabels: {
      'Duration': 'Duration',
      'Date': 'Date',
      'Time': 'Time',
      'Today': 'Today',
      'Closed': 'Closed',
      'Peak time': 'Peak time',
      'Price': 'Price',
      'Tickets': 'Tickets',
      'Venue': 'Venue',
      'Address': 'Address',
      'Getting there': 'Getting there',
      'Door policy': 'Door policy',
    },

    doorPolicies: {
      strict: 'Strict age check',
      moderate: 'ID check',
      relaxed: 'Relaxed entry',
      members: 'Members only',
      guestlist: 'Guest list required',
      dress_code: 'Dress code',
    },

    hubOverview: 'Overview',
    hubDetailed: 'In Detail',
    hubFaq: 'Frequently Asked Questions',
    hubEventCount: 'events',
    hubColEvent: 'Event',
    hubColVenue: 'Venue',
    hubColDate: 'Date',
    hubColEntry: 'Entry',
    hubFreeEntry: 'Free',
    hubTicketed: 'Ticket',

    saveEvent: 'Save',
    unsaveEvent: 'Saved',
    savedEvents: 'Saved Events',
    savedEventsEmpty: 'You have no saved events yet.',
    savedEventsDesc: 'Your saved events — agent athens cultural events Athens',
    shareEvent: 'Share',
    linkCopied: 'Link copied!',
    savedRequiresJs: 'JavaScript is required to view saved events.',
    addToCalendar: 'Calendar',
    calendarGoogle: 'Google Calendar',
    calendarAppleIcs: 'Apple / .ics',
    calendarOutlook: 'Outlook',
  },
};
