// Notification text can come from files pipeline runs write. It must reach
// AppleScript as an argument, never as script text.
import { describe, expect, test } from 'bun:test';
import { osascriptAlertArgs } from '../../scripts/check-deploy-cadence';

describe('deploy-cadence alert', () => {
  test('hostile log text is passed as a separate argv item, not script text', () => {
    const hostile = 'x\\" & (do shell script "id") & "';
    const args = osascriptAlertArgs(hostile);
    expect(args.at(-1)).toBe(hostile);
    expect(args.at(-2)).toBe('--');
    const scriptParts = args.slice(0, -2).join(' ');
    expect(scriptParts).not.toContain('do shell script');
    expect(scriptParts).toContain('item 1 of argv');
  });
});
