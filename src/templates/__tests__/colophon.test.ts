import { describe, expect, test } from 'bun:test';
import {
  renderColophonContent,
  renderColophonTrigger,
  renderColophonDialog,
  renderColophonScript,
  COLOPHON_CONTENT,
} from '../colophon';
import { renderSiteNav, renderHamburgerScript } from '../site-chrome';
import { renderContentPage } from '../content-page';

describe('COLOPHON_CONTENT', () => {
  test('exports a non-trivial shared content string', () => {
    expect(typeof COLOPHON_CONTENT).toBe('string');
    expect(COLOPHON_CONTENT.length).toBeGreaterThan(100);
  });
});

describe('renderColophonContent', () => {
  test('contains NAME', () => {
    expect(renderColophonContent()).toContain('Christos Maragkoudakis');
  });
  test('contains tagline', () => {
    expect(renderColophonContent()).toContain('AI systems, built end to end');
  });
  test('contains story marker', () => {
    expect(renderColophonContent()).toContain("an AI what's on in Athens tonight");
  });
  test('contains how-built with "over 3,800" floor claim', () => {
    const html = renderColophonContent();
    expect(html).toContain('over 3,800 static pages');
    expect(html).toContain('working argument about where discovery is going');
  });
  test('contains open-to-work line', () => {
    expect(renderColophonContent()).toContain('Open to AI roles');
  });
  test('contains GitHub URL', () => {
    expect(renderColophonContent()).toContain('https://github.com/chrimar3');
  });
  test('contains LinkedIn URL', () => {
    expect(renderColophonContent()).toContain('https://linkedin.com/in/christosmarag');
  });
  test('contains email mailto link', () => {
    expect(renderColophonContent()).toContain('mailto:cmarag8@gmail.com');
  });
  test('contains Download CV link to /cv.pdf', () => {
    const html = renderColophonContent();
    expect(html).toContain('Download CV');
    expect(html).toContain('href="/cv.pdf"');
  });
});

describe('renderColophonTrigger', () => {
  test('has class colophon-trigger (stable Step 6 grep marker)', () => {
    expect(renderColophonTrigger()).toContain('colophon-trigger');
  });
  test('is a button with type="button"', () => {
    expect(renderColophonTrigger()).toContain('type="button"');
  });
  test('has aria-haspopup="dialog" and aria-controls', () => {
    const html = renderColophonTrigger();
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-controls=');
  });
  test('visible label is "About me"', () => {
    expect(renderColophonTrigger()).toContain('About me');
  });
  test('progressive enhancement: references /en/colophon/ as JS-off fallback', () => {
    expect(renderColophonTrigger()).toContain('/en/colophon/');
  });
});

describe('renderColophonDialog', () => {
  test('has role="dialog"', () => {
    expect(renderColophonDialog()).toContain('role="dialog"');
  });
  test('has aria-modal="true"', () => {
    expect(renderColophonDialog()).toContain('aria-modal="true"');
  });
  test('has class colophon-dialog (stable Step 6 grep marker)', () => {
    expect(renderColophonDialog()).toContain('colophon-dialog');
  });
  test('has aria-labelledby pointing at a heading', () => {
    expect(renderColophonDialog()).toContain('aria-labelledby=');
  });
  test('starts hidden via aria-hidden="true"', () => {
    expect(renderColophonDialog()).toContain('aria-hidden="true"');
  });
  test('wraps the shared content (single source of truth)', () => {
    const dialog = renderColophonDialog();
    expect(dialog).toContain('over 3,800 static pages');
    expect(dialog).toContain('Christos Maragkoudakis');
  });
});

describe('renderColophonScript', () => {
  test('returns a <script> tag', () => {
    const s = renderColophonScript();
    expect(s).toContain('<script>');
    expect(s).toContain('</script>');
  });
  test('handles Escape to close', () => {
    expect(renderColophonScript()).toContain('Escape');
  });
  test('saves and restores focus via document.activeElement', () => {
    expect(renderColophonScript()).toContain('document.activeElement');
  });
  test('toggles body.scroll-locked', () => {
    expect(renderColophonScript()).toContain('scroll-locked');
  });
  test('targets colophon-dialog selector', () => {
    expect(renderColophonScript()).toContain('colophon-dialog');
  });
  test('contains focus-trap logic (Tab + shiftKey)', () => {
    const s = renderColophonScript();
    expect(s).toContain('Tab');
    expect(s).toContain('shiftKey');
  });
});

// ─────────────────────────────────────────────
// Option A integration: site-chrome must emit colophon alongside the nav
// ─────────────────────────────────────────────

describe('site-chrome integration (Option A — coextensive by construction)', () => {
  test('renderSiteNav output contains colophon-trigger', () => {
    expect(renderSiteNav()).toContain('colophon-trigger');
  });
  test('renderSiteNav output contains colophon-dialog (markup rides with nav)', () => {
    expect(renderSiteNav()).toContain('colophon-dialog');
  });
  test('trigger renders AFTER nav-search-btn and BEFORE hamburger-btn', () => {
    const nav = renderSiteNav();
    const searchIdx = nav.indexOf('nav-search-btn');
    const colophonIdx = nav.indexOf('colophon-trigger');
    const hamburgerIdx = nav.indexOf('hamburger-btn');
    expect(searchIdx).toBeGreaterThan(-1);
    expect(colophonIdx).toBeGreaterThan(-1);
    expect(hamburgerIdx).toBeGreaterThan(-1);
    expect(colophonIdx).toBeGreaterThan(searchIdx);
    expect(colophonIdx).toBeLessThan(hamburgerIdx);
  });
  test('renderHamburgerScript output includes colophon behavior script', () => {
    expect(renderHamburgerScript()).toContain('colophon-dialog');
  });
});

// ─────────────────────────────────────────────
// Single source of truth: mirror page consumes the same content constant
// ─────────────────────────────────────────────

describe('mirror page /en/colophon/ uses the same content as the dialog', () => {
  test('renderContentPage rendering colophon body shares the floor-claim marker', () => {
    const body = renderColophonContent();
    const page = renderContentPage('en/colophon', 'Colophon', body, {
      locale: 'en',
      metaDescription: 'About the maker — Christos Maragkoudakis',
    });
    expect(page).toContain('over 3,800 static pages');
    expect(page).toContain('working argument about where discovery is going');
    expect(page).toContain('Download CV');
    expect(page).toContain('href="/cv.pdf"');
  });
});
