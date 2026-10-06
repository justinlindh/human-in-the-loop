import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { digest } from '../../scripts/tools/changelog-digest.mjs';

const data = {
  days: [{
    date: '2026-10-05',
    prs: [{
      number: 12, title: 'feat(art): the box', body: 'A cube.', prMedia: [{ kind: 'still', url: 'https://x.test/a.png', label: 'the cube' }, { kind: 'clip', url: 'https://x.test/a.mp4', label: '' }],
      features: [
        { status: 'added', file: 'docs/features/nods.md', text: '**The Box**: a cube.', media: [{ kind: 'still', url: 'https://x.test/b.webp' }, { kind: 'clip', url: 'https://x.test/b.mp4' }], effects: [{ name: 'The Box', kind: 'decision', text: `## The Box\n${'long '.repeat(300)}` }, { name: 'Box item', kind: 'row', columns: { Item: 'Box item', Effects: 'L1 $3,000' } }] },
        { status: 'removed', file: 'docs/features/nods.md', text: '**Old**: gone.', media: [], effects: [] },
      ],
    }],
    direct: [{ sha: 'abcd1234', subject: 'Add the HUD', body: 'A clock.', features: [] }],
    skipped: [],
  }],
};

describe('digest', () => {
  const t = digest(data, '2026-10-05');

  it('lists each PR with its title, body, stills and feature text, and leaves clips and removed entries out', () => {
    expect(t).toContain('## #12 feat(art): the box');
    expect(t).toContain('A cube.');
    expect(t).toContain('PR still (the cube): https://x.test/a.png');
    expect(t).toContain('still: https://x.test/b.webp');
    expect(t).not.toMatch(/\.mp4/);
    expect(t).not.toContain('Old');
    expect(t).toContain('## commit abcd1234 Add the HUD');
  });

  it('gives the effects, cutting a long section and reading a row by its columns', () => {
    expect(t).toMatch(/effects \(The Box\): .{0,480} \.\.\./);
    expect(t).toContain('effects (Box item): Effects: L1 $3,000');
  });

  it('links a feature to the feature-media still of its id, and keeps a long feature text to 1500 characters', () => {
    const long = 'word '.repeat(400);
    const d = { days: [{ date: '2026-10-05', prs: [{ number: 3, title: 't', body: '', prMedia: [], features: [{ status: 'added', file: 'docs/features/office.md', ids: ['printer_jam'], text: long, media: [], effects: [] }] }], direct: [], skipped: [] }] };
    const out = digest(d, '2026-10-05', ['office-printer_jam.webp', 'decision-other.webp', 'office-printer_jam_xl.webp']);
    expect(out).toContain('still: https://raw.githubusercontent.com/justinlindh/human-in-the-loop/feature-media/office-printer_jam.webp');
    expect(out).not.toMatch(/decision-other|printer_jam_xl/);
    expect(out).toMatch(/Feature \(added.*\): .{1400,1510}\.\.\./);
  });

  it('refuses a day that is not in the data', () => {
    expect(() => digest(data, '2026-10-06')).toThrow(/no 2026-10-06/);
  });

  it('runs from the command line and refuses bad input', () => {
    const dir = mkdtempSync(join(toolTmp(), 'digest-test-'));
    try {
      writeFileSync(join(dir, 'd.json'), JSON.stringify(data));
      const bin = resolve(__dirname, '../../scripts/tools/changelog-digest.mjs');
      const ok = spawnSync(process.execPath, [bin, join(dir, 'd.json')], { encoding: 'utf8' });
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain('# 2026-10-05: 1 merged PR(s), 1 direct commit(s)');
      expect(spawnSync(process.execPath, [bin], { encoding: 'utf8' }).status).toBe(2);
      expect(spawnSync(process.execPath, [bin, join(dir, 'missing.json')], { encoding: 'utf8' }).status).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
