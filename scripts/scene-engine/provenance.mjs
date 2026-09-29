import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
function hashFiles(paths) {
  const hash = createHash('sha256');
  const visit = path => {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const name = `${path}/${entry.name}`;
      if (entry.isDirectory()) visit(name);
      else { hash.update(name); hash.update('\0'); hash.update(readFileSync(join(root, name))); }
    }
  };
  paths.forEach(visit); return hash.digest('hex');
}
export function provenance(state, options) {
  return { stateSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    sourceSha256: hashFiles(['src', 'scripts/scene-engine', 'blender/checks']), assetSha256: hashFiles(['public/models']),
    lockSha256: createHash('sha256').update(readFileSync(join(root, 'package-lock.json'))).digest('hex'),
    quality: options.quality ?? 'low', rig: options.rig ?? false,
    initialPerkDelayControl: options.initialPerkDelay ?? null, randomProtocol: 'legacy-harness-two-streams',
    statePolicy: 'frozen-input-from-render-epoch-zero' };
}
