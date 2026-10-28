/**
 * The view ships as a generated TypeScript module, so every host's bundler can
 * import it without a text loader. This fails when events.html is edited and
 * `bun run build:ui` was not run.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EVENTS_HTML } from '../src/ui/events-html';

test('src/ui/events-html.ts matches src/ui/events.html (run `bun run build:ui` after editing the HTML)', () => {
  expect(EVENTS_HTML).toBe(readFileSync(join(import.meta.dir, '..', 'src', 'ui', 'events.html'), 'utf8'));
});
