import { expect, it } from 'vitest';
import { retireOptions } from './retire.js';
import { createGame } from '../sim/state.js';
import { exitMrr } from '../sim/endgame.js';
import { B } from '../sim/balance.js';

const reasonFor = (startEra) => { const s = createGame({ seed: 3, startEra }); s.week = B.retireFromWeek; return retireOptions(s).ipo.reason; };
const dollars = (n) => `$${n.toLocaleString('en-US')}`;

it.each(['classic', 'dotcom', 'web2', 'chatgbt', 'agents'])('the %s start shows its own scaled IPO MRR bar', (startEra) => {
  const s = createGame({ seed: 3, startEra });
  expect(reasonFor(startEra)).toContain(dollars(exitMrr(s, B.ipoMrr)));
});

it('a dot-com start needs more MRR than Classic', () => {
  expect(reasonFor('dotcom')).toContain('$3,847,500');
  expect(reasonFor('classic')).toContain('$2,850,000');
});
