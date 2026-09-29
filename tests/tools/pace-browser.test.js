import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { summarize, presentationMetadata } from '../../scripts/pace-browser.js';

describe('observed pacing arguments and metadata', () => {
  it.each([
    [['--player', 'eager'], 'modeled option --player'],
    [['--speed', '3'], 'speed must be'],
    [['--minutes', '-1'], 'positive number'],
    [['--bot', 'missing'], 'unknown bot'],
  ])('rejects unsupported arguments before launching a browser: %j', (args, message) => {
    const result = spawnSync(process.execPath, ['scripts/pace.js', '--browser', ...args], { encoding: 'utf8', timeout: 15000 });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  });

  it('keeps all source metadata hooks explicit and fails on drift', () => {
    const plugin = presentationMetadata();
    for (const file of ['src/main.js', ...['dom', 'toasts', 'chat', 'hud', 'advisor', 'incident'].map(x => `src/ui/${x}.js`)]) {
      expect(plugin.transform(readFileSync(file, 'utf8'), `/${file}`).code).toBeTruthy();
    }
    expect(() => plugin.transform('', '/src/ui/toasts.js')).toThrow('metadata hook missing');
  });

  it('names the source line and repair location when one hook is removed', () => {
    const file = '/src/ui/toasts.js';
    const line = '{ action, glyph, person, player, timed } = {}';
    const source = readFileSync(file.slice(1), 'utf8');
    expect(source).toContain(line);
    const withoutHook = source.replace(line, 'opts = {}');
    expect(() => presentationMetadata().transform(withoutHook, file)).toThrow(
      `pace: metadata hook missing in ${file}. Expected source line: ${line}. Update scripts/pace-browser.js to match the UI source.`,
    );
  });

  it('does not count closing or actionability updates as new attention', () => {
    const records = [
      { kind: 'toast', sequence: 1, transition: 'shown', origin: 'player', actionable: true },
      { kind: 'toast', sequence: 1, transition: 'hidden', origin: 'player', actionable: true },
      { kind: 'yak', sequence: 2, transition: 'updated', origin: 'game', actionable: false },
    ];
    const rates = summarize(records, 120);
    expect(rates.toast).toEqual({ count: 1, perMinute: 0.5, actionable: 1, game: 0, player: 1 });
    expect(rates.yak.count).toBe(0);
    expect(Object.keys(rates)).toContain('office-prompt');
  });

  it('counts a post that becomes actionable after it is presented', () => {
    expect(summarize([
      { kind: 'yak', sequence: 1, transition: 'shown', origin: 'game', actionable: false },
      { kind: 'yak', sequence: 1, transition: 'updated', origin: 'game', actionable: true },
    ], 60).yak).toEqual({ count: 1, perMinute: 1, actionable: 1, game: 1, player: 0 });
  });
});
