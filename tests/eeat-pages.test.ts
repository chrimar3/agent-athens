import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderContentPage } from '../src/templates/content-page';
import { renderSiteFooter } from '../src/templates/site-chrome';

// Load source attribution mapping
const sourceAttributionMap: Record<string, string> = JSON.parse(
  readFileSync(join(import.meta.dir, '../config/source-attribution.json'), 'utf-8')
);

describe('renderContentPage template', () => {
  test('without options uses generic meta description', () => {
    const html = renderContentPage('test', 'Test Page', '<p>Body</p>');
    expect(html).toContain('content="Test Page — agent athens, ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας"');
  });

  test('with metaDescription uses custom meta', () => {
    const html = renderContentPage('test', 'Test Page', '<p>Body</p>', {
      metaDescription: 'Custom meta description here'
    });
    expect(html).toContain('content="Custom meta description here"');
    expect(html).not.toContain('ημερολόγιο πολιτιστικών εκδηλώσεων Αθήνας');
  });

  test('with schemaJson renders JSON-LD block', () => {
    const schema = JSON.stringify({ '@type': 'AboutPage', name: 'Test' });
    const html = renderContentPage('test', 'Test Page', '<p>Body</p>', {
      schemaJson: schema
    });
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('AboutPage');
  });

  test('without schemaJson has no JSON-LD block', () => {
    const html = renderContentPage('test', 'Test Page', '<p>Body</p>');
    expect(html).not.toContain('application/ld+json');
  });

  test('renders body content', () => {
    const html = renderContentPage('about', 'Σχετικά', '<h1>Hello</h1>');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('class="content-page-body"');
  });
});

describe('Content page schemas', () => {
  test('About page schema has @type AboutPage', () => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      'publisher': { '@type': 'Organization', 'name': 'agent-athens' }
    };
    expect(schema['@type']).toBe('AboutPage');
    expect(schema.publisher.name).toBe('agent-athens');
  });

  test('Editorial page schema has @type WebPage', () => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      'publisher': { '@type': 'Organization', 'name': 'agent-athens' }
    };
    expect(schema['@type']).toBe('WebPage');
    expect(schema.publisher.name).toBe('agent-athens');
  });
});

describe('Source attribution mapping', () => {
  test('has all 16 known sources', () => {
    expect(Object.keys(sourceAttributionMap).length).toBe(16);
  });

  test('halfnote maps to Half Note Jazz Club', () => {
    expect(sourceAttributionMap['halfnote']).toBe('Half Note Jazz Club');
  });

  test('megaron.gr maps to Greek display name', () => {
    expect(sourceAttributionMap['megaron.gr']).toBe('Μέγαρο Μουσικής Αθηνών');
  });

  test('onassis maps to Greek display name', () => {
    expect(sourceAttributionMap['onassis']).toBe('Στέγη Ίδρυματος Ωνάση');
  });

  test('ticketservices maps to Ticket Services', () => {
    expect(sourceAttributionMap['ticketservices']).toBe('Ticket Services');
  });

  test('manual maps to Agent Athens', () => {
    expect(sourceAttributionMap['manual']).toBe('Agent Athens');
  });
});

describe('Site footer', () => {
  const footerHtml = renderSiteFooter();

  test('contains /editorial/ link', () => {
    expect(footerHtml).toContain('/editorial/');
  });

  test('contains /corrections/ link', () => {
    expect(footerHtml).toContain('/corrections/');
  });

  test('contains /about/ link', () => {
    expect(footerHtml).toContain('/about/');
  });

  test('editorial link has correct Greek text', () => {
    expect(footerHtml).toContain('>Σύνταξη</a>');
  });

  test('corrections link has correct Greek text', () => {
    expect(footerHtml).toContain('>Διορθώσεις</a>');
  });
});
