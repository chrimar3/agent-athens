import { describe, test, expect } from 'bun:test';
import { categorizeEvent, recategorizeIfNeeded, normalizeTheaterSpelling } from '../event-categorizer';

describe('categorizeEvent', () => {
  describe('performance events (dance/ballet/tango)', () => {
    test('should categorize tango as performance', () => {
      expect(categorizeEvent({ title: 'Tango night at Megaron' })).toBe('performance');
    });

    test('should categorize Greek tango as performance', () => {
      expect(categorizeEvent({ title: 'Βραδιά ταγκό στην Αθήνα' })).toBe('performance');
    });

    test('should categorize ballet as performance', () => {
      expect(categorizeEvent({ title: 'Swan Lake ballet performance' })).toBe('performance');
    });

    test('should categorize contemporary dance as performance', () => {
      expect(categorizeEvent({ title: 'Contemporary dance workshop' })).toBe('performance');
    });

    test('should categorize flamenco as performance', () => {
      expect(categorizeEvent({ title: 'Flamenco show' })).toBe('performance');
    });

    test('should categorize milonga as performance', () => {
      expect(categorizeEvent({ title: 'Milonga at Gazi' })).toBe('performance');
    });
  });

  describe('dj_set events', () => {
    test('should categorize DJ set as dj_set', () => {
      expect(categorizeEvent({ title: 'DJ set at Dybbuk' })).toBe('dj_set');
    });

    test('should categorize techno events as dj_set', () => {
      expect(categorizeEvent({ title: 'Techno night' })).toBe('dj_set');
    });

    test('should categorize house music as dj_set', () => {
      expect(categorizeEvent({ title: 'House music party' })).toBe('dj_set');
    });

    test('should categorize electronic events as dj_set', () => {
      expect(categorizeEvent({ title: 'Electronic music festival' })).toBe('dj_set');
    });

    test('should categorize rave as dj_set', () => {
      expect(categorizeEvent({ title: 'Rave party Athens' })).toBe('dj_set');
    });
  });

  describe('concert events', () => {
    test('should categorize concert as concert', () => {
      expect(categorizeEvent({ title: 'Rock concert at Gagarin' })).toBe('concert');
    });

    test('should categorize jazz as concert', () => {
      expect(categorizeEvent({ title: 'Jazz at Half Note' })).toBe('concert');
    });

    test('should categorize live music as concert', () => {
      expect(categorizeEvent({ title: 'Live music night' })).toBe('concert');
    });

    test('should categorize Greek concert as concert', () => {
      expect(categorizeEvent({ title: 'Συναυλία στο Ηρώδειο' })).toBe('concert');
    });

    test('should categorize blues as concert', () => {
      expect(categorizeEvent({ title: 'Blues night at An Club' })).toBe('concert');
    });
  });

  describe('theater events', () => {
    test('should categorize theater as theater', () => {
      expect(categorizeEvent({ title: 'Hamlet at National Theatre' })).toBe('theater');
    });

    test('should categorize Greek theater as theater', () => {
      expect(categorizeEvent({ title: 'Θέατρο στην Επίδαυρο' })).toBe('theater');
    });

    test('should categorize play as theater', () => {
      expect(categorizeEvent({ title: 'New play at Aliki Theatre' })).toBe('theater');
    });

    test('should categorize drama as theater', () => {
      expect(categorizeEvent({ title: 'Greek drama at Epidaurus' })).toBe('theater');
    });
  });

  describe('show events', () => {
    test('should categorize stand-up as show', () => {
      expect(categorizeEvent({ title: 'Stand-up comedy night' })).toBe('show');
    });

    test('should categorize cabaret as show', () => {
      expect(categorizeEvent({ title: 'Cabaret at Bios' })).toBe('show');
    });

    test('should categorize comedy as show', () => {
      expect(categorizeEvent({ title: 'Comedy show Athens' })).toBe('show');
    });

    test('should categorize drag show as show', () => {
      expect(categorizeEvent({ title: 'Drag show night' })).toBe('show');
    });
  });

  describe('screening events (now categorized as cinema)', () => {
    test('should categorize outdoor cinema as cinema', () => {
      expect(categorizeEvent({ title: 'Outdoor cinema screening' })).toBe('cinema');
    });

    test('should categorize Greek screening as cinema', () => {
      expect(categorizeEvent({ title: 'Προβολή ταινίας' })).toBe('cinema');
    });

    test('should categorize summer cinema as cinema', () => {
      expect(categorizeEvent({ title: 'Θερινό σινεμά Athens' })).toBe('cinema');
    });
  });

  describe('exhibition events', () => {
    test('should categorize exhibition as exhibition', () => {
      expect(categorizeEvent({ title: 'Art exhibition at EMST' })).toBe('exhibition');
    });

    test('should categorize Greek exhibition as exhibition', () => {
      expect(categorizeEvent({ title: 'Έκθεση ζωγραφικής' })).toBe('exhibition');
    });

    test('should categorize gallery show as exhibition', () => {
      expect(categorizeEvent({ title: 'Gallery opening' })).toBe('exhibition');
    });
  });

  describe('workshop events', () => {
    test('should categorize workshop as workshop', () => {
      expect(categorizeEvent({ title: 'Photography workshop' })).toBe('workshop');
    });

    test('should categorize masterclass as workshop', () => {
      expect(categorizeEvent({ title: 'Masterclass with pianist' })).toBe('workshop');
    });

    test('should categorize Greek workshop as workshop', () => {
      expect(categorizeEvent({ title: 'Εργαστήριο κεραμικής' })).toBe('workshop');
    });
  });

  describe('cinema events', () => {
    test('should categorize movie as cinema', () => {
      expect(categorizeEvent({ title: 'New movie at Attikon' })).toBe('cinema');
    });

    test('should categorize film premiere as cinema', () => {
      expect(categorizeEvent({ title: 'Film premiere Athens' })).toBe('cinema');
    });

    test('should categorize Greek cinema as cinema', () => {
      expect(categorizeEvent({ title: 'Νέα ταινία στο σινεμά' })).toBe('cinema');
    });
  });

  describe('performance events', () => {
    test('should categorize performance art as performance', () => {
      expect(categorizeEvent({ title: 'Performance art installation' })).toBe('performance');
    });

    test('should categorize experimental as performance', () => {
      expect(categorizeEvent({ title: 'Experimental multimedia show' })).toBe('performance');
    });
  });

  describe('fallback behavior', () => {
    test('should return currentType if no match found', () => {
      expect(categorizeEvent({ title: 'Unknown event', currentType: 'concert' })).toBe('concert');
    });

    test('should return other if no match and no currentType', () => {
      expect(categorizeEvent({ title: 'Something vague' })).toBe('other');
    });
  });
});

describe('recategorizeIfNeeded', () => {
  test('should change theater to performance for tango events', () => {
    const result = recategorizeIfNeeded({
      title: 'Tango show',
      type: 'theater'
    });
    expect(result).toBe('performance');
  });

  test('should change concert to dj_set for DJ events', () => {
    const result = recategorizeIfNeeded({
      title: 'DJ night with techno',
      type: 'concert'
    });
    expect(result).toBe('dj_set');
  });

  test('should not change correctly categorized events', () => {
    const result = recategorizeIfNeeded({
      title: 'Rock concert',
      type: 'concert'
    });
    expect(result).toBe('concert');
  });
});

describe('normalizeTheaterSpelling', () => {
  test('should convert theatre to theater', () => {
    expect(normalizeTheaterSpelling('theatre')).toBe('theater');
  });

  test('should keep theater as theater', () => {
    expect(normalizeTheaterSpelling('theater')).toBe('theater');
  });

  test('should not change other types', () => {
    expect(normalizeTheaterSpelling('concert')).toBe('concert');
    expect(normalizeTheaterSpelling('exhibition')).toBe('exhibition');
  });
});
