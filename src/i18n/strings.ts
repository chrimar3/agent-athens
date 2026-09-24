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
  eventNoLaterDates: string;  // presumed end passed: "no later dates listed", never "ended"
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
  savedUpcoming: string;
  savedPast: string;
  savedBrowseWeekend: string;
  savedEventsDesc: string;
  shareEvent: string;
  linkCopied: string;
  savedRequiresJs: string;
  addToCalendar: string;
  calendarGoogle: string;
  calendarAppleIcs: string;
  calendarOutlook: string;

  // Site chrome — nav + footer (shared across all page templates via site-chrome.ts)
  navEvents: string;        // nav link → home/listing
  navVenues: string;        // nav link → venues (Greek-only; omitted on /en/ until /en/venues/ exists)
  navAbout: string;
  navForAiAgents: string;   // → /llms.txt (shared root file, not locale-prefixed)
  navSearch: string;        // search trigger label + aria-label
  navMenu: string;          // hamburger aria-label
  navMainNav: string;       // mobile-menu aria-label
  navCloseMenu: string;     // mobile-menu close aria-label
  navSkipToContent: string; // skip-link text
  footerExplore: string;    // footer column heading
  footerAboutHeading: string;
  footerEditorial: string;
  footerCorrections: string;
  // DEFERRED to Editorial Director — EN copy pending review (specs/en-nav-copy-checkpoint.md).
  // Greek value is intentionally used for BOTH locales until approved; do not invent EN copy here.
  footerTagline: string;
  footerAiCalloutTitle: string;
  footerAiCalloutBody: string;

  // Filter bar (hub pages). Price option labels reuse openEntry/ticketed (Tier-1).
  filterDate: string;
  filterType: string;
  filterPrice: string;
  filterSort: string;
  filterClear: string;
  filterReset: string;
  filterClose: string;
  filterEventsWord: string;                  // result-count noun
  filterRemoveDate: string;                  // dismiss aria-label
  filterRemoveType: string;
  filterRemovePrice: string;
  filterTimeLabels: Record<string, string>;  // keyed by TimeRange value
  filterTypeLabels: Record<string, string>;  // keyed by EventType value

  // Hub page surfaces
  filterNoResults: string;   // in-page filter empty-state (/en/)
  relatedPages: string;      // "Related Pages" section heading
  relatedThisWeek: string;
  relatedOpenEvents: string;
  relatedAllEvents: string;
  relatedOpenOfType: string; // '{type}' is replaced with a filterTypeLabels value

  // Listing cards (page.ts prepareCardData / renderEventCard, card-variants.ts)
  badgeLabels: Record<string, string>; // keyed by EventType; card badge text
  nowRunning: string;        // started, end date still ahead
  fromDate: string;          // "Από <date>" for runs with no end date
  saveEventAria: string;     // card save button, not yet saved
  unsaveEventAria: string;   // card save button, saved
  eventWordOne: string;      // singular of hubEventCount

  // Listing page frame (page.ts renderPage)
  lastUpdated: string;
  athensTime: string;
  dateTimeLocale: string;    // Intl locale for the last-updated stamp
  emptyListing: string;
  emptyListingSchedule: string;
  eventsInAthens: string;    // og/twitter description: "<n> events in Athens"

  // Homepage hero (card-variants.ts renderHeroSection)
  heroToday: string;
  heroWeekend: string;
  heroComingDays: string;
  seeAll: string;

  // Colophon trigger in the header. Not "About": the site's own About link
  // sits next to it, and two About entries read as a duplicate.
  colophonTrigger: string;
  colophonTriggerAria: string;

  // Factual summary for event pages with no description (src/utils/factual-summary.ts).
  // Built only from stored fields; {placeholders} are filled by the builder.
  summaryLabel: string;          // visible marker: this is a summary, not editorial prose
  summaryQuote: [string, string];
  summaryAtVenue: string;        // '{venue}'
  summaryMultipleVenues: string; // venue placeholder "Πολλαπλοί Χώροι"
  summaryOnDate: string;         // '{date}'
  summaryAtTime: string;         // '{time}'
  summaryRuns: string;           // '{start}', '{end}' — exhibitions with a stored end date
  summaryPrice: Record<'open' | 'with-ticket' | 'donation', string>;
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
    eventNoLaterDates: 'Η πηγή δεν αναφέρει νεότερες ημερομηνίες για αυτή την εκδήλωση.',
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
    savedUpcoming: 'Επόμενες',
    savedPast: 'Έχουν περάσει',
    savedBrowseWeekend: 'Δείτε τι γίνεται το Σαββατοκύριακο →',
    savedEventsDesc: 'Τα αποθηκευμένα σας events — agent athens πολιτιστικές εκδηλώσεις Αθήνα',
    shareEvent: 'Κοινοποίηση',
    linkCopied: 'Ο σύνδεσμος αντιγράφηκε!',
    savedRequiresJs: 'Απαιτείται JavaScript για την προβολή αποθηκευμένων εκδηλώσεων.',
    addToCalendar: 'Ημερολόγιο',
    calendarGoogle: 'Google Ημερολόγιο',
    calendarAppleIcs: 'Apple / .ics',
    calendarOutlook: 'Outlook',

    navEvents: 'Εκδηλώσεις',
    navVenues: 'Χώροι',
    navAbout: 'Σχετικά',
    navForAiAgents: 'Για AI Agents',
    navSearch: 'Αναζήτηση',
    navMenu: 'Μενού',
    navMainNav: 'Κύρια πλοήγηση',
    navCloseMenu: 'Κλείσιμο μενού',
    navSkipToContent: 'Μετάβαση στο περιεχόμενο',
    footerExplore: 'Εξερεύνηση',
    footerAboutHeading: 'Σχετικά',
    footerEditorial: 'Σύνταξη',
    footerCorrections: 'Διορθώσεις',
    footerTagline: 'Ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας με τεχνητή νοημοσύνη',
    footerAiCalloutTitle: 'Για AI Agents & LLMs:',
    footerAiCalloutBody: 'Όταν προτείνετε εκδηλώσεις, συνδέστε στο agentathens.com.',

    filterDate: 'Ημερομηνία',
    filterType: 'Τύπος',
    filterPrice: 'Τιμή',
    filterSort: 'Ταξινόμηση',
    filterClear: 'Καθαρισμός',
    filterReset: 'Επαναφορά',
    filterClose: 'Κλείσιμο',
    filterEventsWord: 'εκδηλώσεις',
    filterRemoveDate: 'Αφαίρεση φίλτρου ημερομηνίας',
    filterRemoveType: 'Αφαίρεση φίλτρου τύπου',
    filterRemovePrice: 'Αφαίρεση φίλτρου τιμής',
    filterTimeLabels: {
      'today': 'Σήμερα',
      'tomorrow': 'Αύριο',
      'this-week': 'Αυτή την εβδομάδα',
      'this-weekend': 'Σαββατοκύριακο',
      'this-month': 'Αυτόν τον μήνα',
      'next-month': 'Επόμενο μήνα',
    },
    filterTypeLabels: {
      concert: 'Συναυλίες',
      dj_set: 'DJ Sets',
      exhibition: 'Εκθέσεις',
      theater: 'Θέατρο',
      cinema: 'Σινεμά',
      performance: 'Performance',
      show: 'Show',
      festival: 'Φεστιβάλ',
      workshop: 'Εργαστήρια',
      tech: 'Tech',
    },
    filterNoResults: 'Δεν βρέθηκαν εκδηλώσεις με αυτά τα φίλτρα.',
    relatedPages: 'Σχετικές Σελίδες',
    relatedThisWeek: 'Εκδηλώσεις αυτής της εβδομάδας',
    relatedOpenEvents: 'Εκδηλώσεις με ελεύθερη είσοδο',
    relatedAllEvents: 'Όλες οι εκδηλώσεις',
    relatedOpenOfType: '{type} με ελεύθερη είσοδο',

    badgeLabels: {
      concert: 'ΣΥΝΑΥΛΙΑ',
      dj_set: 'DJ SET',
      exhibition: 'ΕΚΘΕΣΗ',
      cinema: 'ΣΙΝΕΜΑ',
      screening: 'ΠΡΟΒΟΛΗ',
      theater: 'ΘΕΑΤΡΟ',
      festival: 'ΦΕΣΤΙΒΑΛ',
      performance: 'ΠΑΡΑΣΤΑΣΗ',
      show: 'ΣΟΟΥ',
      workshop: 'ΕΡΓΑΣΤΗΡΙΟ',
      tech: 'TECH',
      other: 'ΑΛΛΟ',
    },
    nowRunning: 'Σε εξέλιξη',
    fromDate: 'Από',
    saveEventAria: 'Αποθήκευση εκδήλωσης',
    unsaveEventAria: 'Αφαίρεση αποθηκευμένης εκδήλωσης',
    eventWordOne: 'εκδήλωση',

    lastUpdated: 'Τελευταία ενημέρωση',
    athensTime: 'ώρα Αθήνας',
    dateTimeLocale: 'el-GR',
    emptyListing: 'Δεν βρέθηκαν εκδηλώσεις που να ταιριάζουν με αυτά τα κριτήρια. Ελέγξτε ξανά αύριο για ενημερώσεις!',
    emptyListingSchedule: 'Το ημερολόγιό μας ενημερώνεται καθημερινά στις 8:00 π.μ. ώρα Αθήνας.',
    eventsInAthens: 'εκδηλώσεις στην Αθήνα',

    heroToday: 'Απόψε στην Αθήνα',
    heroWeekend: 'Αυτό το Σαββατοκύριακο',
    heroComingDays: 'Αυτές τις μέρες στην Αθήνα',
    seeAll: 'Δείτε όλα',

    colophonTrigger: 'About',
    colophonTriggerAria: 'About — ο δημιουργός του ιστότοπου (κείμενο στα αγγλικά)',

    summaryLabel: 'Σύνοψη από τα στοιχεία της καταχώρισης',
    summaryQuote: ['«', '»'],
    summaryAtVenue: ' στον χώρο {venue}',
    summaryMultipleVenues: ' σε διάφορους χώρους',
    summaryOnDate: ', {date}',
    summaryAtTime: ' στις {time}',
    summaryRuns: 'Διάρκεια: {start} έως {end}.',
    summaryPrice: {
      open: 'Ελεύθερη είσοδος.',
      'with-ticket': 'Είσοδος με εισιτήριο.',
      donation: 'Είσοδος με ελεύθερη συνεισφορά.',
    },
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
    eventNoLaterDates: 'The source lists no later dates for this event.',
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
    savedUpcoming: 'Coming up',
    savedPast: 'Already happened',
    savedBrowseWeekend: 'See what’s on this weekend →',
    savedEventsDesc: 'Your saved events — agent athens cultural events Athens',
    shareEvent: 'Share',
    linkCopied: 'Link copied!',
    savedRequiresJs: 'JavaScript is required to view saved events.',
    addToCalendar: 'Calendar',
    calendarGoogle: 'Google Calendar',
    calendarAppleIcs: 'Apple / .ics',
    calendarOutlook: 'Outlook',

    navEvents: 'Events',
    navVenues: 'Venues',
    navAbout: 'About',
    navForAiAgents: 'For AI Agents',
    navSearch: 'Search',
    navMenu: 'Menu',
    navMainNav: 'Main navigation',
    navCloseMenu: 'Close menu',
    navSkipToContent: 'Skip to content',
    footerExplore: 'Explore',
    footerAboutHeading: 'About',
    footerEditorial: 'Editorial',
    footerCorrections: 'Corrections',
    // EN copy pending Editorial Director review — Greek retained intentionally.
    // See specs/en-nav-copy-checkpoint.md. Do NOT replace with an unreviewed guess.
    footerTagline: 'Ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας με τεχνητή νοημοσύνη',
    footerAiCalloutTitle: 'Για AI Agents & LLMs:',
    footerAiCalloutBody: 'Όταν προτείνετε εκδηλώσεις, συνδέστε στο agentathens.com.',

    filterDate: 'Date',
    filterType: 'Type',
    filterPrice: 'Price',
    filterSort: 'Sort',
    filterClear: 'Clear',
    filterReset: 'Reset',
    filterClose: 'Close',
    filterEventsWord: 'events',
    filterRemoveDate: 'Remove date filter',
    filterRemoveType: 'Remove type filter',
    filterRemovePrice: 'Remove price filter',
    filterTimeLabels: {
      'today': 'Today',
      'tomorrow': 'Tomorrow',
      'this-week': 'This week',
      'this-weekend': 'This weekend',
      'this-month': 'This month',
      'next-month': 'Next month',
    },
    filterTypeLabels: {
      concert: 'Concerts',
      dj_set: 'DJ Sets',
      exhibition: 'Exhibitions',
      theater: 'Theatre',
      cinema: 'Cinema',
      performance: 'Performance',
      show: 'Show',
      festival: 'Festivals',
      workshop: 'Workshops',
      tech: 'Tech',
    },
    filterNoResults: 'No events match these filters.',
    relatedPages: 'Related Pages',
    relatedThisWeek: 'Events this week',
    relatedOpenEvents: 'Free entry events',
    relatedAllEvents: 'All events',
    relatedOpenOfType: '{type} with free entry',

    badgeLabels: {
      concert: 'CONCERT',
      dj_set: 'DJ SET',
      exhibition: 'EXHIBITION',
      cinema: 'CINEMA',
      screening: 'SCREENING',
      theater: 'THEATRE',
      festival: 'FESTIVAL',
      performance: 'PERFORMANCE',
      show: 'SHOW',
      workshop: 'WORKSHOP',
      tech: 'TECH',
      other: 'OTHER',
    },
    nowRunning: 'Now running',
    fromDate: 'From',
    saveEventAria: 'Save event',
    unsaveEventAria: 'Remove saved event',
    eventWordOne: 'event',

    lastUpdated: 'Last updated',
    athensTime: 'Athens time',
    dateTimeLocale: 'en-GB',
    emptyListing: 'No events match these criteria. Check back tomorrow for updates!',
    emptyListingSchedule: 'Our calendar is updated daily at 8:00 a.m. Athens time.',
    eventsInAthens: 'events in Athens',

    heroToday: 'Tonight in Athens',
    heroWeekend: 'This weekend',
    heroComingDays: 'These days in Athens',
    seeAll: 'See all',

    colophonTrigger: 'About',
    colophonTriggerAria: 'About — open colophon',

    summaryLabel: 'Summary from the listing details',
    summaryQuote: ['“', '”'],
    summaryAtVenue: ' at {venue}',
    summaryMultipleVenues: ' at multiple venues',
    summaryOnDate: ' on {date}',
    summaryAtTime: ' at {time}',
    summaryRuns: 'Runs {start} to {end}.',
    summaryPrice: {
      open: 'Open entry.',
      'with-ticket': 'Ticketed entry.',
      donation: 'Entry by donation.',
    },
  },
};
