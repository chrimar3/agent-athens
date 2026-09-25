/**
 * Publish content-diff gate (scripts/publish-diff-gate.ts): stats come from
 * the built site only; a build that adds external script/iframe/stylesheet
 * hosts, many new link or ticket hosts, or loses/gains a large share of pages
 * is refused (exit 3) until it is reviewed and --accept'ed.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { collectPageHosts, computeDistStats, runDiffGate, sanitizeHost, STATS_VERSION } from '../../scripts/publish-diff-gate';

const ROOT = join(import.meta.dir, '..', '..');

interface SiteSpec {
  events?: number;
  enEvents?: number;
  hubs?: number;
  extraLinkHosts?: string[];
  ticketHosts?: string[];
  headExtra?: string;
}

function page(body: string, head = ''): string {
  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/styles/design-system.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>${head}</head>
<body><nav><a href="/">home</a> <a href="https://agentathens.com/concerts/">abs self</a> <a href="mailto:x@example.com">mail</a></nav>${body}</body></html>`;
}

function writeSite(dist: string, spec: SiteSpec = {}): void {
  const { events = 20, enEvents = 10, hubs = 5, extraLinkHosts = [], ticketHosts = ['www.more.com', 'www.viva.gr'], headExtra = '' } = spec;
  mkdirSync(dist, { recursive: true });
  const links = extraLinkHosts.map((h) => `<a href="https://${h}/x">x</a>`).join('');
  writeFileSync(join(dist, 'index.html'), page(`<a href="https://www.instagram.com/agentathens">ig</a>${links}`, headExtra));
  mkdirSync(join(dist, 'styles'), { recursive: true });
  writeFileSync(join(dist, 'styles', 'design-system.css'), 'body{}');
  for (let i = 0; i < hubs; i++) {
    mkdirSync(join(dist, `hub-${i}`), { recursive: true });
    writeFileSync(join(dist, `hub-${i}`, 'index.html'), page('<p>hub</p>'));
  }
  const eventPage = (i: number) => {
    const host = ticketHosts[i % ticketHosts.length];
    return page(`<a href="https://${host}/tickets/${i}" class="edp-cta edp-cta-hero" rel="noopener">Buy</a>
<img src="/images/events/${i}.webp" srcset="https://images.cdn.example/${i}.webp 1x">`);
  };
  for (let i = 0; i < events; i++) {
    mkdirSync(join(dist, 'events', `ev-${i}`), { recursive: true });
    writeFileSync(join(dist, 'events', `ev-${i}`, 'index.html'), eventPage(i));
  }
  for (let i = 0; i < enEvents; i++) {
    mkdirSync(join(dist, 'en', 'events', `ev-${i}`), { recursive: true });
    writeFileSync(join(dist, 'en', 'events', `ev-${i}`, 'index.html'), eventPage(i));
  }
  // Not event pages: the events hub itself and an api file.
  mkdirSync(join(dist, 'en', 'events'), { recursive: true });
  writeFileSync(join(dist, 'en', 'events', 'index.html'), page('<p>en events hub</p>'));
  mkdirSync(join(dist, 'api'), { recursive: true });
  writeFileSync(join(dist, 'api', 'events.json'), '[]');
}

let work: string;
let dist: string;
let stats: string;
let out: string[];
let err: string[];
const io = () => ({ out: (l: string) => out.push(l), err: (l: string) => err.push(l) });
const run = (args: string[], env: Record<string, string | undefined> = {}) => runDiffGate(args, env, io());

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'aa-diff-gate-'));
  dist = join(work, 'dist');
  stats = join(work, 'publish-stats.json');
  out = [];
  err = [];
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const rebuild = (spec: SiteSpec) => {
  rmSync(dist, { recursive: true, force: true });
  writeSite(dist, spec);
};

describe('stats from the built site', () => {
  test('first run: no stats file → baseline written, exit 0', async () => {
    writeSite(dist);
    expect(await run([dist, stats])).toBe(0);
    expect(out.join('\n')).toContain('first run');
    const s = JSON.parse(readFileSync(stats, 'utf-8'));
    expect(s.version).toBe(STATS_VERSION);
    expect(s.htmlPages).toBe(1 + 5 + 20 + 10 + 1);
    expect(s.eventPages).toBe(30);
    expect(s.totalBytes).toBeGreaterThan(0);
    expect(s.scriptHosts).toEqual(['www.googletagmanager.com']);
    expect(s.stylesheetHosts).toEqual([]);
    expect(s.linkHosts).toEqual(['www.instagram.com', 'www.more.com', 'www.viva.gr']);
    expect(s.ticketLinkHosts).toEqual(['www.more.com', 'www.viva.gr']);
    expect(s.imgHosts).toEqual(['images.cdn.example']);
  });

  test('resolution: protocol-relative, <base href>, preload/modulepreload, iframes, own host excluded', async () => {
    const sets = Object.fromEntries(['linkHosts', 'scriptHosts', 'iframeHosts', 'stylesheetHosts', 'imgHosts', 'preloadHosts', 'ticketLinkHosts'].map((k) => [k, new Set<string>()])) as any;
    collectPageHosts(`<html><head>
      <link rel="preload" as="script" href="//Cdn.Evil.example/a.js">
      <link rel="modulepreload" href="https://mod.example/m.js">
      <link rel="preload" as="style" href="https://css.example/a.css">
      <link rel="preload" as="font" href="https://fonts.example/f.woff2">
      <link rel="stylesheet" href="https://www.agentathens.com/x.css">
      </head><body>
      <iframe src="https://frame.example/x"></iframe><object data="https://obj.example/x"></object>
      <a href="javascript:alert(1)">j</a><a href="  https://Trim.Example/ ">t</a>
      </body></html>`, 'https://agentathens.com/events/x/index.html', sets);
    expect([...sets.scriptHosts].sort()).toEqual(['cdn.evil.example', 'mod.example']);
    expect([...sets.stylesheetHosts]).toEqual(['css.example']);
    expect([...sets.preloadHosts]).toEqual(['fonts.example']);
    expect([...sets.iframeHosts].sort()).toEqual(['frame.example', 'obj.example']);
    expect([...sets.linkHosts]).toEqual(['trim.example']);

    const based = Object.fromEntries(['linkHosts', 'scriptHosts', 'iframeHosts', 'stylesheetHosts', 'imgHosts', 'preloadHosts', 'ticketLinkHosts'].map((k) => [k, new Set<string>()])) as any;
    collectPageHosts('<html><head><base href="https://evil.example/"></head><body><a href="/relative">r</a><script src="x.js"></script></body></html>', 'https://agentathens.com/', based);
    expect([...based.linkHosts]).toEqual(['evil.example']);
    expect([...based.scriptHosts]).toEqual(['evil.example']);
  });

  test('a script a browser would run inside <noscript> markup is still seen (parse5, scripting on)', async () => {
    const sets = Object.fromEntries(['linkHosts', 'scriptHosts', 'iframeHosts', 'stylesheetHosts', 'imgHosts', 'preloadHosts', 'ticketLinkHosts'].map((k) => [k, new Set<string>()])) as any;
    collectPageHosts('<noscript><!--</noscript><script src="https://hidden.example/x.js"></script>-->', 'https://agentathens.com/', sets);
    expect([...sets.scriptHosts]).toEqual(['hidden.example']);
  });

  test('the multi-thread scan gives the same stats as the single-thread scan', async () => {
    writeSite(dist, { events: 200, enEvents: 100, extraLinkHosts: ['a.example', 'b.example'], ticketHosts: ['www.more.com', 'x.example', 'y.example'] });
    const now = new Date('2026-01-01T00:00:00Z');
    const single = await computeDistStats(dist, { workers: 1, now });
    const multi = await computeDistStats(dist, { workers: 3, now });
    expect(single.htmlPages).toBeGreaterThanOrEqual(256);
    expect(multi).toEqual(single);
  });

  test('symlinks inside dist are not followed', async () => {
    writeSite(dist);
    const outside = join(work, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'index.html'), page('<script src="https://outside.example/x.js"></script>'));
    symlinkSync(outside, join(dist, 'linked'));
    expect((await computeDistStats(dist)).scriptHosts).toEqual(['www.googletagmanager.com']);
  });
});

describe('comparison', () => {
  beforeEach(async () => {
    writeSite(dist);
    expect(await run([dist, stats])).toBe(0);
    out = [];
    err = [];
  });

  test('unchanged build → 0 and stats rewritten', async () => {
    rebuild({});
    expect(await run([dist, stats])).toBe(0);
    expect(out.join('\n')).toContain('OK');
    expect(err).toEqual([]);
  });

  test('new external script host → 3, stats unchanged', async () => {
    const before = readFileSync(stats, 'utf-8');
    rebuild({ headExtra: '<script src="https://cdn.attacker.example/x.js"></script>' });
    expect(await run([dist, stats])).toBe(3);
    expect(err.filter((l) => l.startsWith('ANOMALY:'))).toEqual(['ANOMALY: new external script host: cdn.attacker.example']);
    expect(readFileSync(stats, 'utf-8')).toBe(before);
  });

  test('new stylesheet and iframe hosts → 3', async () => {
    rebuild({ headExtra: '<link rel="stylesheet" href="https://css.attacker.example/a.css"><iframe src="https://frame.attacker.example/"></iframe>' });
    expect(await run([dist, stats])).toBe(3);
    const lines = err.filter((l) => l.startsWith('ANOMALY:'));
    expect(lines).toContain('ANOMALY: new external stylesheet host: css.attacker.example');
    expect(lines).toContain('ANOMALY: new external iframe/embed host: frame.attacker.example');
  });

  test('many new external link hosts → 3; up to the limit passes', async () => {
    rebuild({ extraLinkHosts: Array.from({ length: 10 }, (_, i) => `site${i}.example`) });
    expect(await run([dist, stats])).toBe(0);
    rebuild({ extraLinkHosts: Array.from({ length: 30 }, (_, i) => `site${i}.example`) });
    expect(await run([dist, stats])).toBe(3);
    const line = err.find((l) => l.startsWith('ANOMALY:'))!;
    expect(line).toStartWith('ANOMALY: 20 new external link hosts (max 10): ');
    expect(line).toContain('(+10 more)'); // bounded
    expect(await run([dist, stats], { AA_DIFF_MAX_NEW_HOSTS: '25' })).toBe(0);
  });

  test('new ticket-link hosts beyond the allowance → 3', async () => {
    rebuild({ ticketHosts: ['www.more.com', 'www.viva.gr', 't1.example', 't2.example', 't3.example'] });
    expect(await run([dist, stats])).toBe(0); // 3 new: allowed by default
    rebuild({ ticketHosts: ['www.more.com', 'www.viva.gr', 't1.example', 't2.example', 't3.example', 'p1.example', 'p2.example', 'p3.example', 'p4.example'] });
    expect(await run([dist, stats])).toBe(3);
    expect(err.find((l) => l.startsWith('ANOMALY:'))).toStartWith('ANOMALY: 4 new ticket-link hosts (max 3): ');
    err = [];
    expect(await run([dist, stats], { AA_DIFF_MAX_NEW_TICKET_HOSTS: '0', AA_DIFF_MAX_NEW_HOSTS: '100' })).toBe(3);
  });

  test('event pages dropped 50% → 3', async () => {
    rebuild({ events: 10, enEvents: 5 });
    expect(await run([dist, stats])).toBe(3);
    expect(err).toContain('ANOMALY: event pages dropped 50% (30 → 15, max drop 30%)');
  });

  test('event pages grew more than 200% → 3', async () => {
    rebuild({ events: 80, enEvents: 20 });
    expect(await run([dist, stats])).toBe(3);
    expect(err.find((l) => l.includes('event pages grew'))).toBe('ANOMALY: event pages grew 233.3% (30 → 100, max growth 200%)');
  });

  test('total HTML pages dropped > 30% → 3', async () => {
    rebuild({ events: 20, enEvents: 10, hubs: 0 });
    expect(await run([dist, stats])).toBe(0); // 37 → 32 pages
    expect(await run([dist, stats], { AA_DIFF_MAX_DROP_PCT: '5' })).toBe(0);
    rebuild({ events: 20, enEvents: 10, hubs: 0 });
    writeFileSync(stats, JSON.stringify({ ...JSON.parse(readFileSync(stats, 'utf-8')), htmlPages: 100 }));
    expect(await run([dist, stats])).toBe(3);
    expect(err.find((l) => l.includes('HTML pages dropped'))).toBe('ANOMALY: HTML pages dropped 68% (100 → 32, max drop 30%)');
  });

  test('--accept → 0, prints the accepted anomalies and updates the stats', async () => {
    rebuild({ events: 10, enEvents: 5, headExtra: '<script src="https://cdn.new.example/x.js"></script>' });
    expect(await run([dist, stats, '--accept'])).toBe(0);
    expect(out).toContain('ACCEPTED: new external script host: cdn.new.example');
    expect(out).toContain('ACCEPTED: event pages dropped 50% (30 → 15, max drop 30%)');
    const s = JSON.parse(readFileSync(stats, 'utf-8'));
    expect(s.eventPages).toBe(15);
    expect(s.scriptHosts).toContain('cdn.new.example');
    out = [];
    expect(await run([dist, stats])).toBe(0); // the accepted build is the new baseline
  });
});

describe('usage and I/O errors → exit 2', () => {
  test('symlinked stats file is refused (read and write), target untouched', async () => {
    writeSite(dist);
    const target = join(work, 'target.json');
    writeFileSync(target, 'do not touch');
    symlinkSync(target, stats);
    expect(await run([dist, stats])).toBe(2);
    expect(err.join('\n')).toContain('symlink');
    expect(await run([dist, stats, '--accept'])).toBe(2);
    expect(readFileSync(target, 'utf-8')).toBe('do not touch');
  });

  test('dangling symlink stats file is refused, not treated as a first run', async () => {
    writeSite(dist);
    symlinkSync(join(work, 'nowhere.json'), stats);
    expect(await run([dist, stats])).toBe(2);
    expect(existsSync(join(work, 'nowhere.json'))).toBe(false);
  });

  test('malformed stats → 2 (not a silent first run); --accept replaces it', async () => {
    writeSite(dist);
    writeFileSync(stats, '{not json');
    expect(await run([dist, stats])).toBe(2);
    expect(err.join('\n')).toContain('not valid JSON');
    expect(readFileSync(stats, 'utf-8')).toBe('{not json');
    writeFileSync(stats, JSON.stringify({ version: 99 }));
    expect(await run([dist, stats])).toBe(2);
    writeFileSync(stats, JSON.stringify({ version: STATS_VERSION, htmlPages: 1, eventPages: 1, totalBytes: 1, linkHosts: 'x' }));
    expect(await run([dist, stats])).toBe(2);
    expect(await run([dist, stats, '--accept'])).toBe(0);
    expect(JSON.parse(readFileSync(stats, 'utf-8')).version).toBe(STATS_VERSION);
  });

  test('stats path is a directory → 2', async () => {
    writeSite(dist);
    mkdirSync(stats);
    expect(await run([dist, stats])).toBe(2);
  });

  test('dist missing, empty, or containing the stats file → 2', async () => {
    expect(await run([join(work, 'nope'), stats])).toBe(2);
    expect(err.join('\n')).toContain('dist directory not found');
    mkdirSync(dist);
    expect(await run([dist, stats])).toBe(2);
    expect(existsSync(stats)).toBe(false);
    writeSite(dist);
    expect(await run([dist, join(dist, 'stats.json')])).toBe(2);
  });

  test('bad arguments or env → 2', async () => {
    writeSite(dist);
    expect(await run([dist])).toBe(2);
    expect(await run([dist, stats, '--force'])).toBe(2);
    expect(await run([dist, stats], { AA_DIFF_MAX_NEW_HOSTS: 'ten' })).toBe(2);
    expect(await run([dist, stats], { AA_DIFF_MAX_DROP_PCT: '-1' })).toBe(2);
    expect(existsSync(stats)).toBe(false);
  });

  test('printed hosts are sanitised', () => {
    expect(sanitizeHost('Evil\u001b[31m.example\n')).toBe('evil?[31m.example?');
    expect(sanitizeHost('a'.repeat(300)).length).toBe(100);
  });
});

describe('CLI', () => {
  test('exit codes reach the process', async () => {
    writeSite(dist);
    const cli = (args: string[]) => Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts/publish-diff-gate.ts'), ...args], { cwd: ROOT, env: { ...process.env } });
    expect(cli([dist, stats]).exitCode).toBe(0);
    rebuild({ headExtra: '<script src="https://cdn.attacker.example/x.js"></script>' });
    const r = cli([dist, stats]);
    expect(r.exitCode).toBe(3);
    expect(r.stderr.toString()).toContain('ANOMALY: new external script host: cdn.attacker.example');
    expect(cli([dist]).exitCode).toBe(2);
  });
});
