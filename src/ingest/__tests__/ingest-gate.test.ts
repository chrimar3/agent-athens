/**
 * Ingestion gate: the IMAP ingest path must only save messages from an
 * allowlisted, DKIM-authenticated sender, must cap message size and the number
 * of messages handled per run, and must connect with verified TLS.
 *
 * No network: a fake MailboxClient stands in for IMAP; the real mailparser
 * parses the fixture messages.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildImapConfig,
  ingestFromMailbox,
  type MailboxClient,
  type MailboxHeaderInfo,
} from '../email-ingestion';

interface FakeMessage {
  uid: number;
  from: string;
  ar: string[];
  size?: number;
  subject?: string;
  body?: string;
  messageId?: string;
  /** Override what the full-body fetch returns (to simulate a From mismatch). */
  rawFrom?: string;
}

const PASS = (d: string) => `mx.google.com; dkim=pass header.i=@${d} header.s=s1 header.b=x; spf=pass smtp.mailfrom=b@${d}`;
const FAIL = (d: string) => `mx.google.com; dkim=fail (bad signature) header.i=@${d} header.s=s1`;

function rawOf(m: FakeMessage): string {
  const lines = [
    ...m.ar.map((a) => `Authentication-Results: ${a}`),
    `From: ${m.rawFrom ?? m.from}`,
    `To: agentathens.events@example.invalid`,
    `Subject: ${m.subject ?? `Newsletter ${m.uid}`}`,
    `Message-ID: ${m.messageId ?? `<msg-${m.uid}@fixture.invalid>`}`,
    `Date: Mon, 21 Sep 2026 09:00:00 +0000`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    m.body ?? `Body of ${m.uid}`,
  ];
  return lines.join('\r\n');
}

class FakeMailbox implements MailboxClient {
  seen: number[] = [];
  rawFetched: number[] = [];
  headerFetchedUids: number[] = [];
  constructor(private messages: FakeMessage[]) {}
  async listUnseenUids() { return this.messages.map((m) => m.uid); }
  async fetchHeaders(uids: number[]): Promise<MailboxHeaderInfo[]> {
    this.headerFetchedUids.push(...uids);
    return this.messages
      .filter((m) => uids.includes(m.uid))
      .map((m) => ({
        uid: m.uid,
        size: m.size ?? rawOf(m).length,
        headers: { from: [m.from], 'authentication-results': m.ar },
      }));
  }
  async fetchRaw(uid: number) {
    this.rawFetched.push(uid);
    const m = this.messages.find((x) => x.uid === uid)!;
    return rawOf(m);
  }
  async markSeen(uid: number) { this.seen.push(uid); }
}

function createDb(): Database {
  const db = new Database(':memory:');
  db.run(`CREATE TABLE processed_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE, subject TEXT, sender TEXT,
    received_at TEXT, processed_at TEXT NOT NULL, event_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'processed', error_message TEXT, raw_path TEXT)`);
  return db;
}

let outDir: string;
let db: Database;
let logs: string[];

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'ingest-gate-'));
  db = createDb();
  logs = [];
});
afterEach(() => {
  db.close();
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
});

function run(box: FakeMailbox, limits?: { maxMessageBytes?: number; maxMessagesPerRun?: number }) {
  return ingestFromMailbox(box, db, { outputDir: outDir, delayMs: 0, limits, log: (l: string) => logs.push(l) });
}

describe('sender allowlist + DKIM gate', () => {
  test('saves an allowlisted sender with aligned dkim=pass and records its authenticated domain', async () => {
    const box = new FakeMailbox([{ uid: 1, from: '"Megaron" <newsletter@megaron.gr>', ar: [PASS('megaron.gr')] }]);
    const result = await run(box);
    expect(result.saved).toBe(1);
    const files = readdirSync(outDir);
    expect(files.length).toBe(1);
    const saved = JSON.parse(readFileSync(join(outDir, files[0]), 'utf-8'));
    expect(saved.authenticatedSenderDomain).toBe('megaron.gr');
    expect(box.seen).toEqual([1]);
  });

  test('a non-allowlisted sender domain is not ingested (body never downloaded)', async () => {
    const box = new FakeMailbox([{ uid: 2, from: 'promo@attacker.example', ar: [PASS('attacker.example')] }]);
    const result = await run(box);
    expect(result.saved).toBe(0);
    expect(result.rejected).toBe(1);
    expect(readdirSync(outDir)).toEqual([]);
    expect(box.rawFetched).toEqual([]);
  });

  test('an allowlisted From with dkim=fail is not ingested', async () => {
    const box = new FakeMailbox([{ uid: 3, from: 'newsletter@megaron.gr', ar: [FAIL('megaron.gr')] }]);
    const result = await run(box);
    expect(result.saved).toBe(0);
    expect(result.rejected).toBe(1);
    expect(readdirSync(outDir)).toEqual([]);
    expect(box.rawFetched).toEqual([]);
  });

  test('a spoofed allowlisted From with no Authentication-Results is not ingested', async () => {
    const box = new FakeMailbox([{ uid: 4, from: 'newsletter@megaron.gr', ar: [] }]);
    const result = await run(box);
    expect(result.saved).toBe(0);
    expect(result.rejected).toBe(1);
  });

  test('rejected messages are marked seen so they are not re-evaluated every run', async () => {
    const box = new FakeMailbox([{ uid: 5, from: 'promo@attacker.example', ar: [PASS('attacker.example')] }]);
    await run(box);
    expect(box.seen).toEqual([5]);
  });

  test('skip log carries count and sender domain only — never subject or body', async () => {
    const box = new FakeMailbox([
      { uid: 6, from: 'promo@attacker.example', ar: [PASS('attacker.example')], subject: 'SECRET-SUBJECT', body: 'SECRET-BODY' },
      { uid: 7, from: 'promo@attacker.example', ar: [PASS('attacker.example')], subject: 'SECRET-SUBJECT', body: 'SECRET-BODY' },
    ]);
    await run(box);
    const joined = logs.join('\n');
    expect(joined).toContain('attacker.example');
    expect(joined).toMatch(/\b2\b/);
    expect(joined).not.toContain('SECRET-SUBJECT');
    expect(joined).not.toContain('SECRET-BODY');
  });

  test('a full message whose parsed From differs from the authenticated header is not ingested', async () => {
    const box = new FakeMailbox([{ uid: 8, from: 'newsletter@megaron.gr', ar: [PASS('megaron.gr')], rawFrom: 'x@attacker.example' }]);
    const result = await run(box);
    expect(result.saved).toBe(0);
    expect(result.rejected).toBe(1);
    expect(readdirSync(outDir)).toEqual([]);
  });
});

describe('resource caps', () => {
  test('a message over the size cap is not downloaded or ingested', async () => {
    const box = new FakeMailbox([{ uid: 9, from: 'newsletter@megaron.gr', ar: [PASS('megaron.gr')], size: 50 * 1024 * 1024 }]);
    const result = await run(box, { maxMessageBytes: 1024 * 1024 });
    expect(result.saved).toBe(0);
    expect(result.rejected).toBe(1);
    expect(box.rawFetched).toEqual([]);
  });

  test('a message with unknown size is an error (fail closed, left unseen for retry)', async () => {
    const box = new FakeMailbox([{ uid: 10, from: 'newsletter@megaron.gr', ar: [PASS('megaron.gr')] }]);
    box.fetchHeaders = async (uids) => uids.map((uid) => ({ uid, size: undefined, headers: { from: ['newsletter@megaron.gr'], 'authentication-results': [PASS('megaron.gr')] } }));
    const result = await run(box);
    expect(result.saved).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(box.rawFetched).toEqual([]);
    expect(box.seen).toEqual([]);
  });

  test('at most maxMessagesPerRun messages are handled; the rest are deferred', async () => {
    const msgs: FakeMessage[] = [];
    for (let i = 1; i <= 5; i++) msgs.push({ uid: i, from: 'newsletter@megaron.gr', ar: [PASS('megaron.gr')] });
    const box = new FakeMailbox(msgs);
    const result = await run(box, { maxMessagesPerRun: 2 });
    expect(result.saved).toBe(2);
    expect(result.deferred).toBe(3);
    expect(box.headerFetchedUids).toEqual([1, 2]);
    expect(box.rawFetched).toEqual([1, 2]);
  });
});

describe('IMAP TLS configuration', () => {
  const env = { EMAIL_USER: 'u@example.invalid', EMAIL_PASSWORD: 'p' };

  test('verifies the server certificate explicitly', () => {
    const cfg = buildImapConfig(env);
    expect(cfg.imap.tls).toBe(true);
    expect(cfg.imap.tlsOptions.rejectUnauthorized).toBe(true);
    expect(cfg.imap.tlsOptions.servername).toBe('imap.gmail.com');
    expect(cfg.imap.tlsOptions.minVersion).toBe('TLSv1.2');
  });

  test('refuses to run when TLS verification is globally disabled', () => {
    expect(() => buildImapConfig({ ...env, NODE_TLS_REJECT_UNAUTHORIZED: '0' })).toThrow(/NODE_TLS_REJECT_UNAUTHORIZED/);
  });

  // The container's email-ingest run connects to the egress relay
  // (IMAP_CONNECT_HOST=egress, IMAP_CONNECT_PORT=9993); TLS stays end to end
  // with IMAP_HOST, so the relay can neither read nor impersonate the server.
  const cert = (name: string) => ({ subject: { CN: name }, subjectaltname: `DNS:${name}` }) as never;

  test('without a relay it connects to IMAP_HOST:IMAP_PORT directly', () => {
    const cfg = buildImapConfig({ ...env, IMAP_HOST: 'imap.example.com', IMAP_PORT: '993' });
    expect([cfg.imap.host, cfg.imap.port]).toEqual(['imap.example.com', 993]);
    expect(cfg.imap.tlsOptions.servername).toBe('imap.example.com');
  });

  test('through the relay: connects to IMAP_CONNECT_HOST:PORT, verifies IMAP_HOST', () => {
    const cfg = buildImapConfig({ ...env, IMAP_HOST: 'imap.example.com', IMAP_CONNECT_HOST: 'egress', IMAP_CONNECT_PORT: '9993' });
    expect(cfg.imap.host).toBe('egress');
    expect(cfg.imap.port).toBe(9993);
    expect(cfg.imap.tls).toBe(true);
    expect(cfg.imap.autotls).toBe('never');
    const t = cfg.imap.tlsOptions;
    expect(t.rejectUnauthorized).toBe(true);
    expect(t.servername).toBe('imap.example.com');
    expect(t.host).toBe('imap.example.com'); // overrides node-imap's tlsOptions.host (= the relay)
    // Whatever host name the TLS layer passes in, identity is IMAP_HOST's.
    expect(t.checkServerIdentity('egress', cert('imap.example.com'))).toBeUndefined();
    expect(t.checkServerIdentity('egress', cert('egress'))).toBeInstanceOf(Error);
    expect(t.checkServerIdentity('imap.example.com', cert('evil.example'))).toBeInstanceOf(Error);
  });

  test('relay settings are validated; IMAP_HOST must be a name when relayed', () => {
    const relay = { ...env, IMAP_HOST: 'imap.example.com', IMAP_CONNECT_HOST: 'egress' };
    expect(buildImapConfig(relay).imap.port).toBe(993); // IMAP_CONNECT_PORT defaults to IMAP_PORT
    for (const bad of ['0', '65536', '99x', '-1']) {
      expect(() => buildImapConfig({ ...relay, IMAP_CONNECT_PORT: bad })).toThrow(/IMAP_CONNECT_PORT/);
    }
    for (const bad of ['egress:9993', 'a b', 'http://egress', '']) {
      if (bad) expect(() => buildImapConfig({ ...relay, IMAP_CONNECT_HOST: bad })).toThrow(/IMAP_CONNECT_HOST/);
    }
    expect(() => buildImapConfig({ ...relay, IMAP_HOST: '192.168.1.5' })).toThrow(/IMAP_HOST/);
    expect(() => buildImapConfig({ ...env, IMAP_CONNECT_PORT: '9993' })).toThrow(/without IMAP_CONNECT_HOST/);
    expect(() => buildImapConfig({ ...env, IMAP_PORT: 'imap' })).toThrow(/IMAP_PORT/);
  });
});
