/**
 * Performer QID Resolver — shared by the audit/apply script and the
 * SPARQL generator (scripts/lookup-performer-sameAs.ts).
 *
 * S179 QID-provenance rule: a QID may only enter config via resolver output
 * (pageprops wikibase_item / wbgetentities / wbsearchentities), never via
 * generation — and it must be verified label-vs-owner, not merely QID-exists
 * (the neighborhood-geodata lesson: fabricated QIDs resolve fine).
 *
 * Two verified methods (recorded in config/performer-qid-verification.json):
 *   - 'wikipedia-pageprops': QID derived from a Wikipedia article (any
 *     language edition — the wikibase_item binding is language-independent)
 *     whose entity labels/aliases own the performer name.
 *   - 'wikidata-label': no Wikipedia article exists anywhere; entity found by
 *     EXACTLY ONE normalized-label match with musician-class P31. Uniqueness
 *     is the guard — a label is not unique the way an article URL is, so
 *     multiple matches = ambiguous = treated as absence (no QID).
 *
 * Ownership = STRICT normalized equality, never containment: enwiki redirects
 * "Dimitri Vegas" → "Dimitri Vegas & Like Mike" (the duo), and containment
 * would accept that wrong owner ("dimitri vegas" ⊂ duo label).
 */

const WD_API = 'https://www.wikidata.org/w/api.php';
const UA = 'AgentAthens/1.0 (https://agentathens.com; cultural events calendar)';

// Musician/performer-class P31 values accepted by the label-unique path.
// Q5 human, Q215380 musical group, Q2088357 musical ensemble,
// Q5741069 rock band, Q9212979 musical duo.
const PERFORMER_P31 = new Set(['Q5', 'Q215380', 'Q2088357', 'Q5741069', 'Q9212979']);

// Performer-class P106 occupations. A Q5 human found by label-unique match
// whose DECLARED occupations contain none of these is rejected — exact label
// + uniqueness alone let an ancient diplomat through (Leon of Athens,
// Q11916529, P106 diplomat). Humans with NO P106 statement still pass: the
// uniqueness and exact-label gates remain, and sparse Wikidata stubs for
// Greek artists often lack P106.
const PERFORMER_P106 = new Set([
  'Q177220',  // singer
  'Q639669',  // musician
  'Q36834',   // composer
  'Q753110',  // songwriter
  'Q130857',  // DJ
  'Q183945',  // record producer
  'Q2252262', // rapper
  'Q245068',  // comedian
  'Q33999',   // actor
  'Q2865819', // conductor
  'Q486748',  // pianist
  'Q855091',  // guitarist
  'Q5716684', // dancer
]);

export type VerificationMethod = 'wikipedia-pageprops' | 'wikidata-label';

export interface VerificationRecord {
  qid: string;
  method: VerificationMethod;
  /** pageprops: the Wikipedia URL the QID is bound to. label: `label:<matched label>` */
  anchor: string;
  matchedLabel: string;
  /** wikidata-label only — must be exactly 1 (uniqueness guard) */
  matchCount?: number;
  verifiedAt: string;
}

export interface ResolvedQid extends VerificationRecord {
  /** Wikipedia URL to ensure present in sameAs (pageprops method) */
  wikipediaUrl?: string;
}

export interface EntityInfo {
  qid: string;
  labels: string[];      // labels ∪ aliases, en+el+mul
  p31: string[];
  p106: string[];
  musicbrainzId: string | null; // P434
  sitelinks: { site: string; title: string }[];
}

/** Schema.org @type from P31: any group-class instance → MusicGroup. */
export function schemaTypeFromP31(p31: string[]): 'Person' | 'MusicGroup' {
  return p31.some(p => p !== 'Q5' && PERFORMER_P31.has(p)) ? 'MusicGroup' : 'Person';
}

/**
 * Normalize a name for ownership comparison: diacritic-, case-, quote- and
 * &/+-insensitive, trailing parenthetical stripped ("Sabaton (band)").
 * Exported for tests and for the build-time validator.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/&amp;/g, ' and ')
    .replace(/[&+]/g, ' and ')
    .replace(/["""''«»‹›'.,!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strict equality after normalization — containment is the Dimitri Vegas trap. */
export function ownershipMatch(performerName: string, candidates: string[]): string | null {
  const p = normalizeName(performerName);
  for (const c of candidates) {
    if (c && normalizeName(c) === p) return c;
  }
  return null;
}

// ============================================================================
// Wikimedia API helpers (rate-limited)
// ============================================================================

let lastRequest = 0;
const MIN_INTERVAL_MS = 600;

async function api(base: string, params: Record<string, string>): Promise<any> {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await Bun.sleep(wait);
  lastRequest = Date.now();

  const qs = new URLSearchParams({ ...params, format: 'json' });
  const res = await fetch(`${base}?${qs}`, { headers: { 'User-Agent': UA } });
  if (res.status === 429) {
    await Bun.sleep(10_000);
    return api(base, params);
  }
  if (!res.ok) throw new Error(`${base} → ${res.status} ${res.statusText}`);
  return res.json();
}

export function parseWikipediaUrl(url: string): { lang: string; title: string } | null {
  const m = url.match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/);
  if (!m) return null;
  return { lang: m[1], title: decodeURIComponent(m[2]).replace(/_/g, ' ') };
}

/** Derive the QID bound to a Wikipedia article via wikibase_item pageprops. */
export async function deriveQidFromWikipedia(url: string): Promise<string | null> {
  const parsed = parseWikipediaUrl(url);
  if (!parsed) return null;
  const data = await api(`https://${parsed.lang}.wikipedia.org/w/api.php`, {
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    redirects: '1',
    titles: parsed.title,
  });
  for (const page of Object.values<any>(data.query?.pages ?? {})) {
    if (page.pageprops?.wikibase_item) return page.pageprops.wikibase_item;
  }
  return null;
}

/** Fetch labels∪aliases (en/el/mul), P31, and sitelinks for an entity. */
export async function fetchEntity(qid: string): Promise<EntityInfo | null> {
  const data = await api(WD_API, {
    action: 'wbgetentities',
    ids: qid,
    props: 'labels|aliases|claims|sitelinks',
    languages: 'en|el|mul',
  });
  const ent = data.entities?.[qid];
  if (!ent || ent.missing !== undefined) return null;

  const labels: string[] = [];
  for (const lang of ['en', 'el', 'mul']) {
    if (ent.labels?.[lang]?.value) labels.push(ent.labels[lang].value);
    for (const a of ent.aliases?.[lang] ?? []) labels.push(a.value);
  }
  const p31 = (ent.claims?.P31 ?? [])
    .map((c: any) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
  const p106 = (ent.claims?.P106 ?? [])
    .map((c: any) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
  const musicbrainzId = ent.claims?.P434?.[0]?.mainsnak?.datavalue?.value ?? null;
  const sitelinks = Object.entries<any>(ent.sitelinks ?? {})
    .filter(([site]) => site.endsWith('wiki') && site !== 'commonswiki' && !site.includes('quote') && !site.includes('source'))
    .map(([site, v]) => ({ site, title: v.title }));

  return { qid, labels, p31, p106, musicbrainzId, sitelinks };
}

function wikipediaUrlFromSitelink(site: string, title: string): string {
  const lang = site.replace(/wiki$/, '');
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/** Pick the best Wikipedia sitelink: en first, then el, then any. */
function pickSitelink(sitelinks: EntityInfo['sitelinks']): EntityInfo['sitelinks'][0] | null {
  return (
    sitelinks.find(s => s.site === 'enwiki') ??
    sitelinks.find(s => s.site === 'elwiki') ??
    sitelinks[0] ??
    null
  );
}

/** Search Wikidata for entities whose LABEL exactly matches the name. */
async function searchByLabel(name: string): Promise<EntityInfo[]> {
  const seen = new Set<string>();
  const out: EntityInfo[] = [];
  for (const language of ['en', 'el']) {
    const data = await api(WD_API, {
      action: 'wbsearchentities',
      search: name,
      language,
      type: 'item',
      limit: '20',
    });
    for (const hit of data.search ?? []) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      // Exact normalized match on the label OR the matched alias (search also
      // returns prefix hits — those must not count). Ownership is re-verified
      // against the full labels∪aliases set after the entity fetch.
      const exact =
        (hit.label && normalizeName(hit.label) === normalizeName(name)) ||
        (hit.match?.text && normalizeName(hit.match.text) === normalizeName(name));
      if (!exact) continue;
      const ent = await fetchEntity(hit.id);
      if (!ent || !ent.p31.some(p => PERFORMER_P31.has(p))) continue;
      if (!ownershipMatch(name, ent.labels)) continue;
      // Occupation gate (humans with declared occupations only — see PERFORMER_P106)
      if (ent.p31.includes('Q5') && ent.p106.length > 0 && !ent.p106.some(o => PERFORMER_P106.has(o))) continue;
      out.push(ent);
    }
  }
  return out;
}

// ============================================================================
// Resolution pipeline
// ============================================================================

export interface ResolveOptions {
  /** Wikipedia URLs already bound to this performer (from existing sameAs). */
  wikipediaUrls?: string[];
  today: string; // YYYY-MM-DD, injected so callers control the clock
}

export interface ResolveResult {
  resolved: ResolvedQid | null;
  /** Human-readable trail for the audit report */
  notes: string[];
}

/**
 * Resolve a performer name to a verified QID.
 *
 * 1. Wikipedia-anchor path: derive QID from each known Wikipedia URL (any
 *    language); accept only if the entity's labels/aliases own the name.
 * 2. Label-unique path: exactly one normalized-label match with performer
 *    P31. If that entity has a Wikipedia sitelink, promote to the pageprops
 *    method (and surface the URL for sameAs); otherwise method wikidata-label.
 * 3. Anything else → null (absence beats fabrication; ambiguity is absence).
 */
export async function resolvePerformerQid(name: string, opts: ResolveOptions): Promise<ResolveResult> {
  const notes: string[] = [];

  for (const url of opts.wikipediaUrls ?? []) {
    const qid = await deriveQidFromWikipedia(url);
    if (!qid) {
      notes.push(`derive failed: ${url} has no wikibase_item`);
      continue;
    }
    const ent = await fetchEntity(qid);
    if (!ent) {
      notes.push(`derived ${qid} from ${url} but entity is missing`);
      continue;
    }
    const parsed = parseWikipediaUrl(url);
    const matched = ownershipMatch(name, [...ent.labels, parsed?.title ?? '']);
    if (matched) {
      return {
        resolved: {
          qid, method: 'wikipedia-pageprops', anchor: url,
          matchedLabel: matched, verifiedAt: opts.today, wikipediaUrl: url,
        },
        notes,
      };
    }
    notes.push(`ownership REJECTED: ${url} → ${qid} (${ent.labels[0] ?? 'no label'}) does not own "${name}"`);
  }

  // Label-unique fallback
  const matches = await searchByLabel(name);
  if (matches.length === 1) {
    const ent = matches[0];
    const matched = ownershipMatch(name, ent.labels)!;
    const sitelink = pickSitelink(ent.sitelinks);
    if (sitelink) {
      // Promote: bind to the Wikipedia article — the article TITLE itself must
      // own the name (title-only check; including ent.labels here would defeat
      // it, since the label already matched — that's how Q11916529 "Leon of
      // Athens" nearly slipped through with its cawiki article "Damis
      // d'Atenes"). Known limitation: an entity whose only article uses a
      // transliterated title (Greek name ↔ Latin article) fails this check and
      // drops — acceptable; absence beats a fuzzy cross-script guess.
      const url = wikipediaUrlFromSitelink(sitelink.site, sitelink.title);
      const titleOwned = ownershipMatch(name, [sitelink.title]);
      if (titleOwned) {
        return {
          resolved: {
            qid: ent.qid, method: 'wikipedia-pageprops', anchor: url,
            matchedLabel: matched, verifiedAt: opts.today, wikipediaUrl: url,
          },
          notes,
        };
      }
      notes.push(`label-unique ${ent.qid} has sitelink "${sitelink.title}" that does not own "${name}" — ambiguous, dropping`);
      return { resolved: null, notes };
    }
    return {
      resolved: {
        qid: ent.qid, method: 'wikidata-label', anchor: `label:${matched}`,
        matchedLabel: matched, matchCount: 1, verifiedAt: opts.today,
      },
      notes,
    };
  }

  notes.push(
    matches.length === 0
      ? 'no exact-label performer-class entity found'
      : `AMBIGUOUS: ${matches.length} exact-label matches (${matches.map(m => m.qid).join(', ')}) — treated as absence`,
  );
  return { resolved: null, notes };
}
