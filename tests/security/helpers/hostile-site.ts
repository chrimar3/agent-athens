/**
 * Builds the real site (`bun run src/generate-site.ts`) in a temporary copy of
 * the repository, from a fixture database whose every template-read string
 * column holds a hostile value. Used by the whole-build crawl test and the
 * output-gate test, so both see exactly what a production build would emit.
 *
 * The copy has its own data/events.db, so the production-DB test guard and
 * the real dist/ are never touched. Filler rows dated 2020 satisfy the
 * event-count floor gate without being rendered (they are past-expired).
 */
import { Database } from 'bun:sqlite';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { DateTime } from 'luxon';

const REPO = resolve(import.meta.dir, '../../..');

/** Values that break out of text, attribute, script, title, CDATA and URL contexts. */
export const HOSTILE_PAYLOADS = [
  '"><x-pwn></x-pwn><script data-pwn>alert(1)</script>',
  '</script><script data-pwn>alert(1)</script>',
  '€10 <img src=x onerror=alert(1) data-pwn><x-pwn></x-pwn>',
  "' onmouseover='alert(1)' data-pwn='",
  '" autofocus onfocus="alert(1)" data-pwn="',
  'javascript:alert(1)',
  '&lt;x-pwn data-pwn&gt;&lt;/x-pwn&gt;',
  '€ <iframe src=https://evil.example/ data-pwn></iframe>',
  '<meta http-equiv="refresh" content="0;url=https://evil.example/" data-pwn>',
  '€5 </title></textarea></style><x-pwn></x-pwn>',
  ']]><x-pwn data-pwn/><![CDATA[',
  '\u2028</script><x-pwn></x-pwn>',
  // String.replace() substitution patterns: harmless only when data never reaches a replacement string.
  "$' $` $& x",
];

/** A real whitelisted venue, so venue pages, config addresses and CTAs render too. */
const REAL_VENUE = { name: 'Gazarte', address: 'Voutadon 32-34, Athens 118 54', neighborhood: 'Gazi' };

const TYPES = ['concert', 'exhibition', 'theater', 'cinema', 'dj_set'] as const;

export interface HostileSite {
  root: string;
  dist: string;
  exitCode: number;
  output: string;
  /** Date (Athens) the hostile events fall on — inside the coming weekend window. */
  weekendDay: string;
}

function copyRepo(root: string): void {
  for (const dir of ['src', 'config', 'static']) cpSync(join(REPO, dir), join(root, dir), { recursive: true });
  for (const f of ['package.json', 'tsconfig.json']) cpSync(join(REPO, f), join(root, f));
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'));
  mkdirSync(join(root, 'data'), { recursive: true });
  // Small top-level data/*.json state files the generator reads; no databases, no image trees.
  for (const f of readdirSync(join(REPO, 'data'))) {
    const full = join(REPO, 'data', f);
    if (f.endsWith('.json') && statSync(full).isFile() && statSync(full).size < 512 * 1024) {
      cpSync(full, join(root, 'data', f));
    }
  }
}

function hostileRow(i: number, p: string, day: string, today: string) {
  const type = TYPES[i % TYPES.length];
  const onRealVenue = i % 3 === 0;
  const tag = (field: string) => `${field} ${p}`;
  return {
    $id: `hostile-${i}`,
    $title: `Hostile ${i} ${p}`,
    $description: tag('Desc') + '. Second sentence here.',
    $full_description: `${tag('Full')}. ${'Filler sentence for length. '.repeat(12)}`,
    $full_description_en: `${tag('Full EN')}. ${'English filler sentence for length. '.repeat(12)}`,
    $full_description_gr: `${tag('Πλήρες')}. ${'Ελληνική πρόταση για μήκος. '.repeat(12)}`,
    $start_date: type === 'exhibition' ? today : `${day}T${String(18 + (i % 5)).padStart(2, '0')}:30:00`,
    $end_date: type === 'exhibition' ? DateTime.fromISO(today).plus({ days: 30 }).toISODate() : null,
    $type: type,
    $genres: JSON.stringify([tag('genre')]),
    $tags: JSON.stringify([tag('tag'), 'open']),
    $venue_name: onRealVenue ? REAL_VENUE.name : `Venue ${i % 4} ${p}`,
    $venue_address: onRealVenue ? REAL_VENUE.address : tag('Addr'),
    $venue_neighborhood: onRealVenue ? REAL_VENUE.neighborhood : tag('Hood'),
    $venue_lat: i % 2 ? 37.97 : p,
    $venue_lng: i % 2 ? 23.71 : p,
    $price_type: i % 4 === 0 ? 'open' : 'with-ticket',
    $price_amount: null,
    $price_currency: 'EUR',
    // Every price range carries '€' so the raw-range display branch is reached.
    $price_range: p.includes('€') ? p : `€ ${p}`,
    $url: i % 2 ? `https://www.viva.gr/tickets/x${i}/` : p,
    $source: i % 2 ? 'viva.gr' : tag('src'),
    $ai_context: JSON.stringify({ mood: tag('mood'), vibe: tag('vibe') }),
    $image_url: i % 3 === 1 ? 'https://www.viva.gr/img/a.jpg' : p,
    $image_source: tag('imgsrc'),
    $image_local: i % 3 === 2 ? p : null,
    $opening_hours: type === 'exhibition' ? JSON.stringify({ tue: tag('10:00'), wed: '10:00-18:00' }) : null,
    $closed_days: type === 'exhibition' ? tag('Monday') : null,
    // Clock columns are parsed, not printed: a malformed value fails the build
    // closed in formatSchemaDate, so they carry well-formed times here.
    $time_peak: '22:00',
    $time_doors: '21:00',
    $time_source: tag('ts'),
    $ticket_url: i % 2 ? p : 'https://www.viva.gr/tickets/x/',
    $ticket_url_status: i % 2 ? 'direct' : tag('status'),
    $ticket_url_resolved: p,
    $venue_metro_station: tag('Metro'),
    $venue_metro_line: tag('Line'),
    $door_policy_note: tag('door'),
    $price_source: tag('psrc'),
    $source_full_description: tag('srcdesc'),
  };
}

function seed(dbPath: string, today: string, day: string): void {
  const db = new Database(dbPath, { create: true });
  db.exec(readFileSync(join(REPO, 'src/db/schema.sql'), 'utf-8'));
  db.exec('CREATE TABLE IF NOT EXISTS venue_context (venue_name TEXT PRIMARY KEY, image_path TEXT, description TEXT)');
  const cols = Object.keys(hostileRow(0, 'x', day, today)).map(k => k.slice(1));
  const insert = db.prepare(
    `INSERT INTO events (${cols.join(',')}, created_at, updated_at, location_status, schema_valid)
     VALUES (${cols.map(c => '$' + c).join(',')}, $now, $now, 'verified_athens', 1)`,
  );
  const now = new Date().toISOString();
  db.transaction(() => {
    HOSTILE_PAYLOADS.forEach((p, n) => {
      for (let k = 0; k < TYPES.length; k++) {
        const i = n * TYPES.length + k;
        insert.run({ ...hostileRow(i, p, day, today), $now: now });
      }
    });
    const filler = db.prepare(
      `INSERT INTO events (id, title, start_date, type, venue_name, venue_address, price_type, source, created_at, updated_at, location_status)
       VALUES (?, ?, '2020-01-01T20:00:00', 'concert', 'Gazarte', 'Voutadon 32-34, Athens 118 54', 'with-ticket', 'viva.gr', ?, ?, 'verified_athens')`,
    );
    for (let i = 0; i < 5100; i++) filler.run(`filler-${i}`, `Past concert ${i}`, now, now);
    // The type column is free text in the schema; one row carries a hostile type.
    insert.run({ ...hostileRow(9999, HOSTILE_PAYLOADS[0], day, today), $type: `concert${HOSTILE_PAYLOADS[4]}`, $now: now });
    db.prepare('INSERT INTO venue_context (venue_name, image_path) VALUES (?, ?)').run(`Venue 1 ${HOSTILE_PAYLOADS[1]}`, HOSTILE_PAYLOADS[3]);
  })();
  db.close();
}

/**
 * Persisted state from an earlier (compromised) run, planted before the
 * build: dist/ and data/ survive between builds, so the generator must treat
 * what it reads back as input. Slug-history values try to add _redirects
 * rules; manifest dates try to break out of <lastmod> and JSON-LD.
 */
export const HOSTILE_SLUG_HISTORY: Record<string, unknown> = {
  'hostile-1': ['old /x 200\n/* https://attacker.example/:splat 302!\n/y', 'hostile-kept-old-slug', 'UPPER-Case', '../../etc', 'a b'],
  'hostile-3': '/* https://attacker.example/ 302!',
  'hostile-5': [{ slug: 'x' }, 'x/* https://attacker.example/:splat 200!'],
  'filler-0': ['https://attacker.example/'],
};
/** The one valid previous slug in HOSTILE_SLUG_HISTORY; it must still yield a 301. */
export const KEPT_OLD_SLUG = 'hostile-kept-old-slug';

function plantHostileState(root: string): void {
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/.slug-history.json'), JSON.stringify(HOSTILE_SLUG_HISTORY));
  writeFileSync(join(root, 'dist/.og-cache.json'), JSON.stringify({ '../../x': 'abc', 'ok-slug': '</script>' }));
  const badManifest = {
    version: 1,
    generatedAt: '<x-pwn>',
    entries: {
      index: { hash: 'zz</lastmod><x-pwn/>', lastModified: '</lastmod><x-pwn data-pwn/>' },
      today: { hash: '0123456789abcdef', lastModified: '"}]<x-pwn>' },
    },
  };
  writeFileSync(join(root, 'data/content-hashes.json'), JSON.stringify(badManifest));
  writeFileSync(join(root, 'data/event-set-hashes.json'), JSON.stringify(badManifest));
}

/** Copies the repo to a temp dir, seeds the hostile DB and runs the real generator there. */
export function buildHostileSite(): HostileSite {
  const root = mkdtempSync(join(tmpdir(), 'aa-hostile-site-'));
  copyRepo(root);
  plantHostileState(root);
  const athensToday = DateTime.now().setZone('Europe/Athens').startOf('day');
  const friday = athensToday.plus({ days: 5 - athensToday.weekday });
  const weekendDay = friday.plus({ days: 2 }).toISODate()!; // Sunday: never before today
  seed(join(root, 'data/events.db'), athensToday.toISODate()!, weekendDay);
  // Provenance stamping needs a git HEAD; the temp copy gets an empty one.
  const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  Bun.spawnSync(['git', 'init', '-q', root], { env: gitEnv });
  Bun.spawnSync(['git', '-C', root, 'commit', '-q', '--allow-empty', '-m', 'fixture'], { env: gitEnv });
  const proc = Bun.spawnSync(['bun', 'run', 'src/generate-site.ts'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = new TextDecoder().decode(proc.stdout) + new TextDecoder().decode(proc.stderr);
  return { root, dist: join(root, 'dist'), exitCode: proc.exitCode ?? -1, output, weekendDay };
}

/** Every emitted file under dir, relative path → absolute path. */
export function listFiles(dir: string, base = dir, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, base, out);
    else out.push(full);
  }
  return out;
}
