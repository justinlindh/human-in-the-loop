import { afterEach, describe, expect, it } from 'vitest';
import { splitUnlocks, pipToast } from './unlockPips.js';
import { B } from '../sim/balance.js';

afterEach(() => { delete B.pacing; });
const item = (key, menuId = 'build', menuLabel = 'Build') => ({ key, menuId, menuLabel });

describe('unlockPips', () => {
  it('on: a small unlock gets a pip and one toast, a new system keeps its card', () => {
    B.pacing = { unlockPips: true };
    const { card, pip } = splitUnlocks([item('paths', 'staff', 'Staff'), item('marketing', 'marketing', 'Marketing')], null);
    expect(card.map((i) => i.key)).toEqual(['marketing']);
    expect(pip.map((i) => i.key)).toEqual(['paths']);
    expect(pipToast(pip, () => 'Research lab').text).toBe('New: Research lab, placed from Staff.');
    expect(pipToast([item('a'), item('b')], () => '').text).toMatch(/^2 new things/);
    expect(pipToast([], () => '')).toBeNull();
  });
  it('on: the first Research, Ops and Standups keep their cards', () => {
    B.pacing = { unlockPips: true };
    const out = splitUnlocks([item('research'), item('ops', 'ops', 'Ops'), item('standups', 'policies', 'Policies')], null);
    expect(out.card).toHaveLength(3);
    expect(out.pip).toEqual([]);
  });
  it('on: an era card keeps everything', () => {
    B.pacing = { unlockPips: true };
    expect(splitUnlocks([item('research')], { eraId: 'chatgbt' }).card).toHaveLength(1);
  });
  it('off or no block: every unlock keeps its card', () => {
    const items = [item('paths', 'staff', 'Staff')];
    expect(splitUnlocks(items, null)).toEqual({ card: items, pip: [] });
    B.pacing = { unlockPips: false };
    expect(splitUnlocks(items, null)).toEqual({ card: items, pip: [] });
  });
});
