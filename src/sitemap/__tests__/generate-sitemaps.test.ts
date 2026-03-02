import { describe, test, expect } from 'bun:test';
import { classifyUrl } from '../generate-sitemaps';

describe('classifyUrl', () => {
  test('classifies event URLs', () => {
    expect(classifyUrl('events/abc123-venue-title')).toBe('events');
    expect(classifyUrl('events/some-slug')).toBe('events');
  });

  test('classifies venue URLs', () => {
    expect(classifyUrl('venues/half-note')).toBe('venues');
    expect(classifyUrl('venues/megaron')).toBe('venues');
  });

  test('classifies homepage as editorial', () => {
    expect(classifyUrl('index')).toBe('editorial');
  });

  test('classifies time filter pages as editorial', () => {
    expect(classifyUrl('today')).toBe('editorial');
    expect(classifyUrl('this-week')).toBe('editorial');
    expect(classifyUrl('this-weekend')).toBe('editorial');
  });

  test('classifies category pages as editorial', () => {
    expect(classifyUrl('concerts')).toBe('editorial');
    expect(classifyUrl('exhibitions')).toBe('editorial');
  });

  test('classifies content pages as editorial', () => {
    expect(classifyUrl('about/')).toBe('editorial');
    expect(classifyUrl('editorial/')).toBe('editorial');
    expect(classifyUrl('corrections/')).toBe('editorial');
  });

  test('classifies combined filter pages as editorial', () => {
    expect(classifyUrl('concert-this-week')).toBe('editorial');
    expect(classifyUrl('open-today')).toBe('editorial');
  });
});
