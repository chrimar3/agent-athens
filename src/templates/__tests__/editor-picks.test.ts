import { describe, test, expect } from 'bun:test';
import { renderEditorPicks, type EditorPicksProps, type EditorPick } from '../editor-picks';

const samplePick = (overrides: Partial<EditorPick> = {}): EditorPick => ({
  eventId: 'evt-1',
  vignette: 'A standout night.',
  rank: 1,
  eventCanonicalUrl: 'https://agentathens.com/events/evt-1/',
  ...overrides,
});

const sampleProps = (overrides: Partial<EditorPicksProps> = {}): EditorPicksProps => ({
  picks: [samplePick()],
  intro: 'This week we picked these.',
  locale: 'en',
  windowLabel: 'May 22-28',
  pageUrl: 'https://agentathens.com/en/this-weekend/',
  ...overrides,
});

describe('renderEditorPicks structure', () => {
  test('emits <section class="editor-picks"> wrapper', () => {
    const html = renderEditorPicks(sampleProps());
    expect(html).toContain('<section class="editor-picks">');
  });

  test('emits <h2 class="section-label"> with the windowLabel', () => {
    const html = renderEditorPicks(sampleProps({ windowLabel: 'May 22-28' }));
    expect(html).toContain('<h2 class="section-label">May 22-28</h2>');
  });

  test('emits <ol class="picks-list"> with one <li class="pick"> per pick', () => {
    const html = renderEditorPicks(sampleProps({
      picks: [
        samplePick({ eventId: 'a', rank: 1 }),
        samplePick({ eventId: 'b', rank: 2 }),
        samplePick({ eventId: 'c', rank: 3 }),
      ],
    }));
    expect(html).toContain('<ol class="picks-list">');
    const liMatches = html.match(/<li class="pick">/g) ?? [];
    expect(liMatches.length).toBe(3);
  });

  test('each pick has a <p class="pick-rationale">', () => {
    const html = renderEditorPicks(sampleProps({
      picks: [
        samplePick({ vignette: 'First rationale.' }),
        samplePick({ vignette: 'Second rationale.', rank: 2 }),
      ],
    }));
    expect(html).toContain('<p class="pick-rationale">First rationale.</p>');
    expect(html).toContain('<p class="pick-rationale">Second rationale.</p>');
  });

  test('emits event-card slot placeholder per pick', () => {
    const html = renderEditorPicks(sampleProps({
      picks: [samplePick({ eventId: 'abc123' })],
    }));
    expect(html).toContain('<!-- event-card slot: abc123 -->');
  });
});

describe('renderEditorPicks JSON-LD', () => {
  test('emits ItemList with correct @id', () => {
    const html = renderEditorPicks(sampleProps({ pageUrl: 'https://agentathens.com/this-weekend/' }));
    const ldMatch = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
    expect(ldMatch).not.toBeNull();
    const ld = JSON.parse(ldMatch![1]);
    expect(ld['@type']).toBe('ItemList');
    expect(ld['@id']).toBe('https://agentathens.com/this-weekend/#editor-picks');
  });

  test('itemListOrder is Manual', () => {
    const html = renderEditorPicks(sampleProps());
    const ldMatch = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
    const ld = JSON.parse(ldMatch![1]);
    expect(ld.itemListOrder).toBe('https://schema.org/ItemListOrderManual');
  });

  test('numberOfItems matches picks length', () => {
    const picks = [
      samplePick({ rank: 1 }),
      samplePick({ rank: 2 }),
      samplePick({ rank: 3 }),
    ];
    const html = renderEditorPicks(sampleProps({ picks }));
    const ldMatch = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
    const ld = JSON.parse(ldMatch![1]);
    expect(ld.numberOfItems).toBe(3);
  });

  test('itemListElement has correct position per pick (sorted by rank)', () => {
    // Pass picks out-of-order to verify sort
    const picks = [
      samplePick({ eventId: 'b', rank: 2, eventCanonicalUrl: 'https://agentathens.com/events/b/' }),
      samplePick({ eventId: 'a', rank: 1, eventCanonicalUrl: 'https://agentathens.com/events/a/' }),
    ];
    const html = renderEditorPicks(sampleProps({ picks }));
    const ldMatch = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
    const ld = JSON.parse(ldMatch![1]);
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      item: { '@id': 'https://agentathens.com/events/a/' },
    });
    expect(ld.itemListElement[1].position).toBe(2);
  });
});
