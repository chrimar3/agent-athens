import { describe, test, expect } from 'bun:test';
import { isAuditableHubFile } from '../audit-aria';

describe('isAuditableHubFile', () => {
  test('accepts real hub pages', () => {
    expect(isAuditableHubFile('today.html')).toBe(true);
    expect(isAuditableHubFile('this-weekend.html')).toBe(true);
    expect(isAuditableHubFile('concerts-this-month.html')).toBe(true);
    expect(isAuditableHubFile('ai-tech.html')).toBe(true);
  });

  test('excludes the 404 error page', () => {
    expect(isAuditableHubFile('404.html')).toBe(false);
  });

  test('excludes GSC ownership verification stubs', () => {
    expect(isAuditableHubFile('googled03df0efd969df1f.html')).toBe(false);
    expect(isAuditableHubFile('google1234567890abcdef.html')).toBe(false);
  });

  test('excludes Bing ownership verification stubs', () => {
    expect(isAuditableHubFile('bing0123abc.html')).toBe(false);
    expect(isAuditableHubFile('BingSiteAuth.xml')).toBe(false);
  });

  test('excludes other SiteAuth stubs', () => {
    expect(isAuditableHubFile('BingSiteAuth.xml')).toBe(false);
    expect(isAuditableHubFile('YandexSiteAuth.html')).toBe(false);
  });
});
