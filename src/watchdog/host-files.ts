/** Host-side file writes that must not follow a planted symlink (security
 *  loop round 4).
 *
 *  Host jobs (deadman, digest, enrichment check, phase3) run as the owner. A
 *  compromised pipeline container can create files in the repo's logs/ and
 *  data/ folders, so any path a host job writes there could be a symlink into
 *  $HOME. Host jobs therefore keep their own records under the host-only state
 *  dir (hostStateDir()/logs, which containers never mount) and open them with
 *  O_NOFOLLOW, so even a symlink in that folder is refused rather than written
 *  through. */
import { closeSync, constants, fstatSync, ftruncateSync, mkdirSync, openSync, writeSync } from 'fs';
import { dirname, join } from 'path';
import { hostStateDir } from './responders';

/** Folder for host-job logs: ${AA_STATE_DIR:-~/.config/agentathens-docker}/logs.
 *  Resolved at call time so tests can point AA_STATE_DIR at a temp dir. */
export function hostLogDir(): string {
  return join(hostStateDir(), 'logs');
}

/** Append `data` to `path`, creating it (mode 600) and its folder (mode 700)
 *  if missing. Throws if `path` is a symlink (ELOOP from O_NOFOLLOW) or is
 *  not a regular file. `header` is written first when the file is empty. */
export function appendFileNoFollow(path: string, data: string, header?: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    0o600,
  );
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error(`appendFileNoFollow: ${path} is not a regular file — refusing to write`);
    if (header !== undefined && st.size === 0) writeSync(fd, header);
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

/** Replace `path`'s content with `data` (creating it, mode 644), refusing a
 *  symlink (ELOOP from O_NOFOLLOW) or a non-regular file. */
export function writeFileNoFollow(path: string, data: string): void {
  const fd = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    0o644,
  );
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error(`writeFileNoFollow: ${path} is not a regular file — refusing to write`);
    ftruncateSync(fd, 0);
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
}
