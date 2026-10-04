// Scratch space for the tools, on disk. /tmp is RAM-backed with a cap on inodes, which worktrees,
// browser profiles and leftover scratch files exhaust; everything the tools write as scratch goes
// under HITL_TMP instead (default ~/.cache/hitl-ci/tmp).
//
//   toolTmp()          the directory, created if missing
//   makeTemp('x-')     a fresh directory in it (mkdtemp); the caller removes it
// Shell scripts: mkdir -p "${HITL_TMP:=$HOME/.cache/hitl-ci/tmp}"; tmp="$(mktemp -d -p "$HITL_TMP")"
import { mkdirSync, mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function toolTmp(env = process.env) {
  const dir = env.HITL_TMP || join(homedir(), '.cache', 'hitl-ci', 'tmp');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function makeTemp(prefix, env = process.env) {
  return mkdtempSync(join(toolTmp(env), prefix));
}
