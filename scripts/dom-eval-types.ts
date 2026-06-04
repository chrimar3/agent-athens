/**
 * Minimal DOM typings for Puppeteer page.evaluate() callbacks.
 *
 * This project compiles WITHOUT lib.dom on purpose: `document` not compiling
 * in src/ is a load-bearing tripwire for the SSR Tier-1 rule (AI crawlers do
 * not execute JavaScript — all event data must be in the HTML source). Adding
 * "DOM" to tsconfig lib would remove that tripwire project-wide, and it also
 * breaks src/scraping/subprocess-runner.ts (lib.dom's ReadableStream is not
 * async-iterable, unlike Bun's — 2× TS2504, measured 2026-06-04).
 *
 * Instead, each scraper module declares the browser surface file-locally:
 *
 *   import type { DomDocument, DomElement, DomAnchor } from './dom-eval-types';
 *   declare const document: DomDocument; // module-scoped: THIS file only
 *   type HTMLElement = DomElement;       // satisfies existing `as` casts
 *   type HTMLAnchorElement = DomAnchor;
 *
 * Top-level `declare` in a module is local to that module, so src/ keeps
 * erroring on `document`. These interfaces cover only what the evaluate
 * callbacks actually touch — extend them here if a scraper needs more.
 */

export interface DomNodeList {
  length: number;
  forEach(callback: (el: DomElement, index: number) => void): void;
}

export interface DomElement {
  textContent: string | null;
  innerText: string;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): DomNodeList;
  getAttribute(name: string): string | null;
  click(): void;
  /** Present on <img> elements; optional so img query results can read it without a cast. */
  src?: string;
}

export interface DomAnchor extends DomElement {
  href: string;
}

export interface DomDocument {
  body: DomElement;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): DomNodeList;
}
