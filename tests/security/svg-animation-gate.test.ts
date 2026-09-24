/**
 * Round-4 judge A probe: the published-output gate passed SVG animation that
 * rewrites a link at run time — <set attributeName="href" to="javascript:…">
 * and <animate … values="javascript:…"> — and <use> pointing outside the
 * page. Both the page scan (inline SVG in HTML) and the standalone .svg scan
 * must refuse:
 *   - <animate>/<set>/<animateTransform>/<animateMotion> whose attributeName
 *     is href or xlink:href;
 *   - any to/from/values/by on those elements holding javascript:, vbscript:
 *     or data:;
 *   - <use> whose href/xlink:href is data: or another origin (a same-page
 *     "#id" fragment is what the templates emit and stays allowed).
 */
import { describe, expect, test } from 'bun:test';
import { scanHtmlForUnsafeOutput, scanSvg } from '../../src/validators/published-artifacts';

const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`;

const HOSTILE: [string, string][] = [
  ['set href to javascript: (judge A probe)', '<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>'],
  ['set xlink:href to javascript:', '<svg><a><set attributeName="xlink:href" to="javascript:alert(1)"/><text>x</text></a></svg>'],
  ['animate href values javascript: (judge A probe)', '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>'],
  ['animate href with a harmless value is still refused', '<svg><a><animate attributeName="href" values="https://example.com/"/><text>x</text></a></svg>'],
  ['animateTransform targeting href', '<svg><a><animateTransform attributeName="href" to="https://example.com/"/></a></svg>'],
  ['animateMotion targeting xlink:href', '<svg><a><animateMotion attributeName="xlink:href" from="#a" to="#b"/></a></svg>'],
  ['attributeName with padding and case', '<svg><a><set attributeName="  HREF " to="#x"/></a></svg>'],
  ['values list hiding javascript: in the second slot', '<svg><a><animate attributeName="fill" values="red; javascript:alert(1)"/></a></svg>'],
  ['entity-encoded javascript: in to', '<svg><a><set attributeName="fill" to="&#106;avascript:alert(1)"/></a></svg>'],
  ['tab inside the scheme', '<svg><a><set attributeName="fill" to="java\tscript:alert(1)"/></a></svg>'],
  ['data: in from', '<svg><a><animate attributeName="fill" from="data:text/html,x" to="red"/></a></svg>'],
  ['vbscript: in by', '<svg><a><animate attributeName="fill" by="vbscript:x"/></a></svg>'],
  ['use with external https href', '<svg><use href="https://evil.example/sprite.svg#a"/></svg>'],
  ['use with protocol-relative href', '<svg><use href="//evil.example/sprite.svg#a"/></svg>'],
  ['use with external xlink:href', '<svg><use xlink:href="http://evil.example/s.svg#a"/></svg>'],
  ['use with data: href', '<svg><use href="data:image/svg+xml,&lt;svg id=%22a%22/&gt;#a"/></svg>'],
];

const BENIGN: [string, string][] = [
  ['use of a same-page fragment (satori tiles)', '<svg><defs><path id="p" d="M0 0"/></defs><use href="#p"/></svg>'],
  ['use of a same-origin sprite', '<svg><use href="/images/sprite.svg#icon"/></svg>'],
  ['colour animation', '<svg><rect><animate attributeName="fill" values="red;blue" dur="1s"/></rect></svg>'],
  ['rotation', '<svg><rect><animateTransform attributeName="transform" type="rotate" from="0 5 5" to="360 5 5" dur="2s"/></rect></svg>'],
  ['set of opacity', '<svg><rect><set attributeName="opacity" to="0.5" begin="1s"/></rect></svg>'],
];

describe('inline SVG in a page', () => {
  for (const [name, svg] of HOSTILE) {
    test(`refused: ${name}`, () => expect(scanHtmlForUnsafeOutput(page(svg)).length).toBeGreaterThan(0));
  }
  for (const [name, svg] of BENIGN) {
    test(`allowed: ${name}`, () => expect(scanHtmlForUnsafeOutput(page(svg))).toEqual([]));
  }
});

describe('standalone .svg file', () => {
  const file = (body: string) => body.replace('<svg>', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">');
  for (const [name, svg] of HOSTILE) {
    test(`refused: ${name}`, () => expect(scanSvg(file(svg)).length).toBeGreaterThan(0));
  }
  for (const [name, svg] of BENIGN) {
    test(`allowed: ${name}`, () => expect(scanSvg(file(svg))).toEqual([]));
  }
});
