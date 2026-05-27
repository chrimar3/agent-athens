import { describe, test, expect } from 'bun:test';
import { upgradeAthinoramaImage } from '../athinorama-image';

describe('upgradeAthinoramaImage', () => {
  test('upgrades a 250x300 thumbnail to 1200x1440, preserving query string', () => {
    const url =
      'https://www.athinorama.gr/Content/ImagesDatabase/p/250x300/crop/both/4a/4a42d377893e420b812c7c3d48cd47cf.jpg?quality=81&404=default&v=4';
    expect(upgradeAthinoramaImage(url)).toBe(
      'https://www.athinorama.gr/Content/ImagesDatabase/p/1200x1440/crop/both/4a/4a42d377893e420b812c7c3d48cd47cf.jpg?quality=81&404=default&v=4'
    );
  });

  test('upgrades a 300x380 thumbnail to 1200x1440', () => {
    const url =
      'https://www.athinorama.gr/Content/ImagesDatabase/p/300x380/crop/both/cd/cd24a27cb6ec42c4add7d8b9e6872aca.jpg';
    expect(upgradeAthinoramaImage(url)).toBe(
      'https://www.athinorama.gr/Content/ImagesDatabase/p/1200x1440/crop/both/cd/cd24a27cb6ec42c4add7d8b9e6872aca.jpg'
    );
  });

  test('is idempotent — an already-1200x1440 URL is unchanged', () => {
    const url =
      'https://www.athinorama.gr/Content/ImagesDatabase/p/1200x1440/crop/both/7b/7b9224aef1e04befb06ff7369e2429ce.jpg';
    expect(upgradeAthinoramaImage(url)).toBe(url);
  });

  test('passes non-athinorama URLs through unchanged', () => {
    const url = 'https://cdn.snfcc.org/uploads/event-poster.jpg';
    expect(upgradeAthinoramaImage(url)).toBe(url);
  });

  test('passes an athinorama URL without an ImagesDatabase size segment through unchanged', () => {
    const url = 'https://www.athinorama.gr/lmnts/events/some-other-image.jpg';
    expect(upgradeAthinoramaImage(url)).toBe(url);
  });

  test('returns empty/malformed input unchanged without throwing', () => {
    expect(upgradeAthinoramaImage('')).toBe('');
    expect(upgradeAthinoramaImage('not a url')).toBe('not a url');
  });
});
