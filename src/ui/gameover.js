import { h, fmtMoney, fmtNum, dateOf } from './dom.js';
import * as SIM from '../sim/index.js';
import { icon } from './icons.js';

const HEADLINE = {
  ipo: ['IPO day!', 'The bell rang. Your company is public.'],
  acquired: ['Acquired!', 'Someone bigger bought what you built.'],
  leader: ['Category leader', 'You own the categories that matter.'],
  runway: ['Out of runway', 'The cash ran out and stayed out.'],
  collapse: ['The lab collapsed', 'Nobody left could keep the lights on.'],
  timeout: ['Time is up', 'Fifteen years went by. The company is still here, mostly.'],
};

const BREAKDOWN = [
  ['valuation', 'Valuation'], ['brand', 'Brand'], ['wellbeing', 'Staff wellbeing'],
  ['caught', 'Incidents caught'], ['breaches', 'Breaches'], ['resignations', 'Resignations'],
];

// End-of-run screen: headline, score breakdown, epilogue lines revealed one at a time.
export function createGameOver({ layer, controls, sfx }) {
  const root = h('div.gameover');
  root.style.display = 'none';
  layer.append(root);
  let shown = null;
  let timers = [];

  function show(s) {
    const g = s.gameOver;
    shown = g;
    timers.forEach(clearTimeout);
    timers = [];
    const [title, sub] = HEADLINE[g.reason] ?? [g.won ? 'You won' : 'Game over', ''];
    let run = null;
    try { run = typeof SIM.scoreRun === 'function' ? SIM.scoreRun(s) : null; } catch { run = null; }
    const d = dateOf(s.week);
    const lines = (g.epilogue ?? []).map((t) => h('p.epi', { text: t }));
    const rows = run?.breakdown ? BREAKDOWN.filter(([k]) => k in run.breakdown).map(([k, label]) => {
      const v = Math.round(run.breakdown[k]) || 0;
      return h('div.kv', null, h('span', { text: label }), h(`b.num${v < 0 ? '.bad-t' : ''}`, { text: `${v > 0 ? '+' : ''}${fmtNum(v)}` }));
    }) : [];
    root.replaceChildren(h(`div.go-card${g.won ? '.won' : '.lost'}`, null,
      h('div.go-head', null,
        icon(g.won ? 'award' : 'gameover', { size: 44 }),
        h('div', null, h('h1', { text: title }), h('div.go-sub', { text: sub })),
        h('span.spacer'),
        h('div.go-score', null, h('span.small', { text: 'Score' }), h('b.num', { text: fmtNum(g.score ?? run?.score ?? 0) }))),
      h('div.go-body', null,
        h('div.go-left', null,
          h('div.small.muted', { text: `${s.companyName} · ${d.year}, week ${d.week}` }),
          h('div.go-stats', null,
            h('div.kv', null, h('span', { text: 'Valuation' }), h('b.num', { text: fmtMoney(run?.valuation ?? 0) })),
            h('div.kv', null, h('span', { text: 'Peak MRR' }), h('b.num', { text: fmtMoney(s.stats?.peakMrr ?? 0) })),
            h('div.kv', null, h('span', { text: 'Launches' }), h('b.num', { text: String(s.stats?.launches ?? 0) })),
            h('div.kv', null, h('span', { text: 'People hired' }), h('b.num', { text: String(s.stats?.hires ?? 0) }))),
          rows.length ? h('div.go-break', null, h('b', { text: 'Score breakdown' }), ...rows) : null),
        h('div.go-epi', null, h('b', { text: 'What happened next' }), ...lines)),
      h('div.go-foot', null, h('span.spacer'),
        h('button.btn.go.big', { onclick: () => { sfx('confirm'); controls.newGame?.(); } }, icon('launch'), ' New Game'))));
    root.style.display = '';
    layer.classList.add('ended');
    sfx(g.won ? 'fanfare' : 'gameover');
    lines.forEach((el, i) => timers.push(setTimeout(() => { el.classList.add('in'); sfx('blip'); }, 900 + i * 1100)));
  }

  function update(s) {
    if (s.gameOver && s.gameOver !== shown) show(s);
    else if (!s.gameOver && shown) { shown = null; root.style.display = 'none'; root.replaceChildren(); layer.classList.remove('ended'); }
  }

  return { update, get open() { return !!shown; } };
}
