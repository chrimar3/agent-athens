/** macOS notification argv builder (security loop round 4).
 *
 *  Notification text can carry pipeline-produced strings: the deadman's first
 *  reason can quote a scraped venue name, and other alerts quote log lines
 *  that container runs write. Splicing such text into AppleScript SOURCE —
 *  even with quotes escaped — lets a backslash or a newline end the string
 *  literal and run `do shell script` as the owner on the host.
 *
 *  So the script text below is a constant. Title, subtitle and message reach
 *  AppleScript only as run-handler arguments (`item N of argv`) after `--`,
 *  which AppleScript never parses as code, whatever they contain. The sound
 *  name travels the same way and is also restricted to macOS's built-in
 *  sound names.
 *
 *  Pure: returns the argv for Bun.spawnSync, spawns nothing. */

/** Built-in macOS alert sounds (/System/Library/Sounds). */
const SOUNDS = new Set([
  'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero',
  'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink',
]);

/** Notification Center truncates long text anyway; the cap keeps a hostile
 *  string from ballooning the process arguments. */
const MAX_LEN = 1000;

function clean(s: string): string {
  // A NUL cannot be passed in argv at all; drop it rather than fail the alert.
  return String(s).replace(/\0/g, '').slice(0, MAX_LEN);
}

export function osascriptNotificationArgv(opts: {
  title: string;
  subtitle: string;
  message: string;
  sound?: string;
}): string[] {
  const sound = opts.sound ?? 'Basso';
  if (!SOUNDS.has(sound)) throw new Error(`osascriptNotificationArgv: unknown sound name "${sound}"`);
  return [
    'osascript',
    '-e', 'on run argv',
    '-e', 'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name (item 4 of argv)',
    '-e', 'end run',
    '--', clean(opts.message), clean(opts.title), clean(opts.subtitle), sound,
  ];
}
