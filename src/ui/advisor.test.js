import { describe, it, expect, afterEach } from 'vitest';
import { SIMX } from './simapi.js';
import { panelModel } from './advisor.js';

const real = SIMX.advice;
const line = (key, since) => ({ key, advisor: 'cfo', severity: 2, tier: 2, since, text: key });

describe('advisor panel', () => {
  afterEach(() => { SIMX.advice = real; });

  it('shows one notice with no Earlier list when there is only one', () => {
    SIMX.advice = () => [line('runway', 3)];
    const m = panelModel({ week: 10 });
    expect(m.main.key).toBe('runway');
    expect(m.earlier).toEqual([]);
  });

  it('leads with the most recent notice and lists the rest as Earlier', () => {
    SIMX.advice = () => [line('old', 2), line('new', 9), line('mid', 5)];
    const m = panelModel({ week: 10 });
    expect(m.main.key).toBe('new');
    expect(m.earlier.map((x) => x.key)).toEqual(['mid', 'old']);
    expect(panelModel({ week: 10 }, 'old').main.key).toBe('old');
  });

  it('falls back to the all-clear line, alone', () => {
    SIMX.advice = () => [{ key: 'fine', advisor: 'tech', severity: 1, text: 'No fires.' }];
    const m = panelModel({ week: 10 });
    expect(m.main.key).toBe('fine');
    expect(m.earlier).toEqual([]);
  });
});
