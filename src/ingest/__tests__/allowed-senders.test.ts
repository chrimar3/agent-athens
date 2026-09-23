import { readFileSync } from 'fs';
import { join } from 'path';
/**
 * Sender authentication gate for newsletter ingestion.
 *
 * A message is ingested only when its single From address is on the
 * allowlist AND the receiving server's (topmost) Authentication-Results
 * header records dkim=pass for a signing domain aligned with that allowlisted
 * domain. Everything else is rejected with a reason code.
 */
import { describe, test, expect } from 'bun:test';
import {
  ALLOWED_SENDER_DOMAINS,
  TRUSTED_AUTHSERV_IDS,
  allowlistedDomainFor,
  fromHeaderDomain,
  isAuthenticatedEmailRecord,
  parseAuthenticationResults,
  verifySender,
} from '../allowed-senders';

const GMAIL_PASS_MEGARON =
  'mx.google.com;\r\n       dkim=pass header.i=@megaron.gr header.s=s1 header.b=AbCd;\r\n' +
  '       spf=pass (google.com: domain of bounce@megaron.gr designates 192.0.2.1 as permitted sender) smtp.mailfrom=bounce@megaron.gr;\r\n' +
  '       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=megaron.gr';

function verdict(from: string | string[], ar: string[]) {
  return verifySender({ fromHeaders: Array.isArray(from) ? from : [from], authenticationResults: ar });
}

describe('allowlist contents', () => {
  test('is exactly the domains that have a dedicated newsletter parser', () => {
    // Every enabled newsletter in config/newsletter-formats.json, no more.
    const config = JSON.parse(readFileSync(join(import.meta.dir, '../../../config/newsletter-formats.json'), 'utf8'));
    const configured = new Set<string>();
    for (const f of config.formats) {
      if (f.enabled) for (const s of f.senders) configured.add(String(s).split('@')[1].toLowerCase());
    }
    expect([...ALLOWED_SENDER_DOMAINS].sort()).toEqual([...configured].sort());
  });
  test('trusts only the Gmail receiving server as authserv-id', () => {
    expect([...TRUSTED_AUTHSERV_IDS]).toEqual(['mx.google.com']);
  });
});

describe('allowlistedDomainFor', () => {
  test('exact domain and subdomains match', () => {
    expect(allowlistedDomainFor('megaron.gr')).toBe('megaron.gr');
    expect(allowlistedDomainFor('news.megaron.gr')).toBe('megaron.gr');
  });
  test('look-alike and suffix-embedding domains do not match', () => {
    expect(allowlistedDomainFor('evilmegaron.gr')).toBeNull();
    expect(allowlistedDomainFor('megaron.gr.attacker.example')).toBeNull();
    expect(allowlistedDomainFor('attacker.example')).toBeNull();
  });
});

describe('fromHeaderDomain', () => {
  test('bare address and display-name form', () => {
    expect(fromHeaderDomain('newsletter@megaron.gr')).toBe('megaron.gr');
    expect(fromHeaderDomain('"Μέγαρο Μουσικής" <Newsletter@Megaron.GR>')).toBe('megaron.gr');
  });
  test('an address-like display name makes the header ambiguous', () => {
    expect(fromHeaderDomain('"news@megaron.gr" <x@attacker.example>')).toBeNull();
  });
  test('group/multiple addresses are ambiguous', () => {
    expect(fromHeaderDomain('a@megaron.gr, b@attacker.example')).toBeNull();
  });
  test('no address at all', () => {
    expect(fromHeaderDomain('Megaron')).toBeNull();
  });
});

describe('parseAuthenticationResults', () => {
  test('parses authserv-id and method results, ignoring comments', () => {
    const parsed = parseAuthenticationResults(GMAIL_PASS_MEGARON);
    expect(parsed).not.toBeNull();
    expect(parsed!.authservId).toBe('mx.google.com');
    const dkim = parsed!.results.find((r) => r.method === 'dkim');
    expect(dkim?.result).toBe('pass');
    expect(dkim?.props['header.i']).toBe('@megaron.gr');
    const dmarc = parsed!.results.find((r) => r.method === 'dmarc');
    expect(dmarc?.props['header.from']).toBe('megaron.gr');
  });
});

describe('verifySender', () => {
  test('accepts an allowlisted sender with aligned dkim=pass from the trusted server', () => {
    const v = verdict('"Megaron" <newsletter@megaron.gr>', [GMAIL_PASS_MEGARON]);
    expect(v).toEqual({ ok: true, domain: 'megaron.gr', senderDomain: 'megaron.gr' });
  });

  test('accepts a subdomain signature (relaxed alignment)', () => {
    const ar = 'mx.google.com; dkim=pass header.i=@mail.snfcc.org header.s=k1 header.b=x';
    expect(verdict('info@snfcc.org', [ar]).ok).toBe(true);
  });

  test('rejects a sender domain that is not allowlisted, even with dkim=pass', () => {
    const ar = 'mx.google.com; dkim=pass header.i=@attacker.example header.s=k1';
    const v = verdict('news@attacker.example', [ar]);
    expect(v).toEqual({ ok: false, reason: 'domain-not-allowlisted', senderDomain: 'attacker.example' });
  });

  test('rejects dkim=fail', () => {
    const ar = 'mx.google.com; dkim=fail (bad signature) header.i=@megaron.gr header.s=s1';
    const v = verdict('newsletter@megaron.gr', [ar]);
    expect(v).toMatchObject({ ok: false, reason: 'dkim-not-pass' });
  });

  test('rejects a spoofed From with no DKIM signature (dkim=none, spf only)', () => {
    const ar = 'mx.google.com; spf=pass smtp.mailfrom=x@attacker.example; dmarc=fail header.from=megaron.gr';
    expect(verdict('newsletter@megaron.gr', [ar])).toMatchObject({ ok: false, reason: 'dkim-not-pass' });
  });

  test('rejects dkim=pass by an unaligned domain (e.g. a bulk-mail provider only)', () => {
    const ar = 'mx.google.com; dkim=pass header.i=@mailer.example header.s=k1';
    expect(verdict('newsletter@megaron.gr', [ar])).toMatchObject({ ok: false, reason: 'dkim-not-aligned' });
  });

  test('accepts when one of several dkim results is aligned', () => {
    const ar = 'mx.google.com; dkim=pass header.i=@mailer.example; dkim=pass header.d=megaron.gr header.s=s1';
    expect(verdict('newsletter@megaron.gr', [ar]).ok).toBe(true);
  });

  test('rejects a message with no Authentication-Results header', () => {
    expect(verdict('newsletter@megaron.gr', [])).toMatchObject({ ok: false, reason: 'no-authentication-results' });
  });

  test('only the topmost header counts: a sender-supplied pass below a real fail is ignored', () => {
    const real = 'mx.google.com; dkim=none; spf=fail smtp.mailfrom=x@attacker.example';
    const forged = 'mx.google.com; dkim=pass header.i=@megaron.gr';
    expect(verdict('newsletter@megaron.gr', [real, forged])).toMatchObject({ ok: false, reason: 'dkim-not-pass' });
  });

  test('rejects results stamped by an untrusted authserv-id', () => {
    const ar = 'attacker.example; dkim=pass header.i=@megaron.gr';
    expect(verdict('newsletter@megaron.gr', [ar])).toMatchObject({ ok: false, reason: 'untrusted-authserv-id' });
  });

  test('rejects multiple From headers', () => {
    expect(verdict(['newsletter@megaron.gr', 'x@attacker.example'], [GMAIL_PASS_MEGARON]))
      .toMatchObject({ ok: false, reason: 'ambiguous-from' });
  });

  test('rejects missing From', () => {
    expect(verifySender({ fromHeaders: [], authenticationResults: [GMAIL_PASS_MEGARON] }))
      .toMatchObject({ ok: false, reason: 'no-from' });
  });
});

describe('isAuthenticatedEmailRecord (parser-side gate on saved email files)', () => {
  test('accepts a record carrying an allowlisted authenticated domain', () => {
    expect(isAuthenticatedEmailRecord({ authenticatedSenderDomain: 'megaron.gr' })).toBe(true);
  });
  test('rejects legacy/unmarked records and non-allowlisted markers', () => {
    expect(isAuthenticatedEmailRecord({ from: 'newsletter@megaron.gr' })).toBe(false);
    expect(isAuthenticatedEmailRecord({ authenticatedSenderDomain: 'attacker.example' })).toBe(false);
    expect(isAuthenticatedEmailRecord(null)).toBe(false);
  });
});
