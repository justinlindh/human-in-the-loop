import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha = (...parts) => parts.reduce((h, p) => h.update(p).update('\n'), createHash('sha256')).digest('hex');

// What a capture renders: the game, its assets and the capture engine. Anything else in a commit
// (docs, other lanes' scripts, the trailer config) leaves a clip's key alone.
const CODE_PATHS = ['src', 'public', 'index.html', 'vite.config.js', 'package-lock.json', 'scripts/capture.js', 'scripts/lib'];

// Tracked blob ids plus any uncommitted change and untracked file under those paths. When git
// can't answer, the hash is unique to this run so no earlier clip matches.
export function codeHash(root) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  try {
    const untracked = git('ls-files', '-o', '--exclude-standard', '--', ...CODE_PATHS).split('\n').filter(Boolean);
    return sha(git('ls-files', '-s', '--', ...CODE_PATHS), git('diff', 'HEAD', '--', ...CODE_PATHS),
      ...untracked.map((f) => f + ':' + sha(readFileSync(join(root, f)))));
  } catch {
    console.error('trailer: the game code could not be hashed (git failed), so reuse is off for this run');
    return `unknown-${Date.now()}-${Math.random()}`;
  }
}

// The saved games a capture item loads, named in its setup as /<dir>/<name>.snap.
export function snapshotHash(root, item) {
  const files = [...new Set(JSON.stringify(item).match(/\/[\w./-]+\.snap/g) ?? [])].sort();
  return sha(...files.map((f) => { const p = join(root, f); return f + ':' + (existsSync(p) ? sha(readFileSync(p)) : 'missing'); }));
}

export const subjectOf = (root, item, code = codeHash(root)) => ({ code, snapshots: snapshotHash(root, item) });

// The key names the capture specification, its pinned snapshots and the game code, not the commit.
export const captureKey = (subject, item) => sha(subject.code, subject.snapshots, JSON.stringify(item));

// Cross-build reuse is explicit and requires the same capture key and passing subject checks.
export function canReuse({ beat, item, record, key, subject }) {
  if (beat.id === 'yak' || beat.id === 'yak-react' || !record?.build || record.errors !== 0) return false;
  if (key !== captureKey(subject, item)) return false;
  const checks = record.marks?.filter(m => m.label === 'beat-check' && m.beat === beat.id) ?? [];
  return checks.length > 0 && checks.every(m => !!m.ok) && checks.some(m => Math.abs(m.t - beat.from) < 1e-6);
}
