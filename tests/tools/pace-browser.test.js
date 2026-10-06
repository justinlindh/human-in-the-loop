import { describe, it, expect } from 'vitest';
import { spawnAsync } from './spawn-async.js';
import { readFileSync } from 'node:fs';
import { summarize, presentationMetadata, dwellSeconds, askGaps } from '../../scripts/pace-browser.js';

describe.concurrent('observed pacing arguments and metadata', () => {
  it.each([
    [['--player', 'eager'], 'modeled option --player'],
    [['--speed', '3'], 'speed must be'],
    [['--minutes', '-1'], 'positive number'],
    [['--bot', 'missing'], 'unknown bot'],
    [['--wpm', '0'], 'positive number'],
    [['--choose', '-2'], '0 or more'],
    [['--menu-seconds', '90'], 'per running minute'],
    [['--flat', '--wpm', '250'], '--flat takes no'],
    [['--era', 'stoneage'], 'unknown start era'],
    [['--era', 'dotcom', '--load', 'x.json'], 'exclusive'],
    [['--load', 'no-such-save.json.gz'], '--load no-such-save.json.gz'],
  ])('rejects unsupported arguments before launching a browser: %j', async (args, message) => {
    const result = await spawnAsync(process.execPath, ['scripts/pace.js', '--browser', ...args], { timeout: 15000 });
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

  it('times a surface by its words, plus the choice when it asks for one', () => {
    const text = Array.from({ length: 50 }, () => 'word').join(' ');
    expect(dwellSeconds(text, false, { wpm: 200, choose: 4 })).toBe(15);
    expect(dwellSeconds(text, true, { wpm: 200, choose: 4 })).toBe(19);
    expect(dwellSeconds('', true, { wpm: 200, choose: 4 })).toBe(4);
    expect(dwellSeconds(50, true, { wpm: 200, choose: 4 })).toBe(19);
  });

  it('runs the page player on this same dwellSeconds, with nothing from module scope', () => {
    // installPlayer evaluates dwellSeconds' source in the page, so it must stand alone.
    const inPage = (0, eval)(`(${dwellSeconds.toString()})`);
    expect(inPage(100, false, { wpm: 200, choose: 4 })).toBe(30);
    expect(readFileSync('scripts/pace-browser.js', 'utf8')).toContain('dwell: dwellSeconds.toString()');
  });

  it('measures the paused share, the answerable series and its gaps in running play', () => {
    const p = askGaps([{ kind: 'decision', run: 10 }, { kind: 'yak-prompt', run: 40 }, { kind: 'mail', run: 100 }], 300, 120, { openMax: 2, longestQuiet: 54.32, heldBy: { menu: 80.04, decision: 39.96 } });
    expect(p.heldBy).toEqual({ menu: 80, decision: 40 });
    expect(p.missedAsks).toBe(0);
    expect(askGaps([], 10, 0, { missed: [{ key: 'yak-prompt:cp1', t: 5, week: 3 }] })).toMatchObject({ missedAsks: 1, missed: [{ key: 'yak-prompt:cp1' }] });
    expect(p).toMatchObject({ pausedShare: 0.4, heldSeconds: 120, runningSeconds: 180, asks: 3, asksPerRunningMinute: 1,
      byKind: { decision: 1, 'yak-prompt': 1, mail: 1 }, longestWithNothingToAnswer: 54.3, mostOpenAtOnce: 2 });
    expect(p.gaps).toEqual([30, 60]);
    expect(p.gap).toEqual({ min: 30, median: 60, mean: 45, max: 60 });
    expect(askGaps([], 10, 0).gap).toBeNull();
  });
});
