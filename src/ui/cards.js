// Full-screen title and end cards for captured clips, in the game's own type and palette. A page opened with
// ?card=<id> shows that card over everything for its hold time and fades it in and out; the game keeps running
// underneath, so a capture can cut straight from the card to the scene. Extras: &hold=<seconds> (the time
// between the fades), &fade=<seconds>, &freeze (stay on the card, for stills).
// The card's state is on document.documentElement.dataset.cardPhase ('in', 'hold', 'out', 'done') and in
// window.__HITL_CARD, so a recorder can wait for the phase it wants.
import { h } from './dom.js';

export const CARDS = {
  'printer-title': {
    kind: 'title', hold: 3,
    kicker: 'A short film in a field',
    title: ['Paper', 'Jam', 'Session'],
    sub: 'Three coworkers. One printer. No meeting.',
  },
  'printer-end': { kind: 'end', hold: 4 },
};

export const SITE = 'humanintheloopgame.com';

function titleBody(card) {
  return [
    h('div.card-kicker', { text: card.kicker }),
    h('h1.card-title', null, ...card.title.map((w, i) => h(`span.cw${i + 1}`, { text: w }))),
    h('div.card-sub', { text: card.sub }),
  ];
}

function endBody() {
  return [
    h('div.card-kicker', { text: 'A tiny company sim' }),
    h('h1.tl-name.card-logo', null, h('span.w1', { text: 'Human' }), h('span.w2', { text: 'in the' }), h('span.w3', { text: 'Loop' })),
    h('div.card-sub', { text: 'Build software. Keep the humans.' }),
    h('div.card-url', null, h('span', { text: 'Play free in your browser' }), h('b', { text: SITE })),
  ];
}

export function cardOptions(search) {
  const q = new URLSearchParams(search ?? '');
  const id = q.get('card');
  if (!id || !Object.hasOwn(CARDS, id)) return null;
  const num = (key, fallback) => { const v = Number(q.get(key)); return q.has(key) && Number.isFinite(v) && v >= 0 ? v : fallback; };
  return { id, card: CARDS[id], hold: num('hold', CARDS[id].hold), fade: num('fade', 0.5), freeze: q.has('freeze') };
}

// Shows the card for options from cardOptions; returns { el, done } where done resolves when it has gone.
export function showCard(layer, { id, card, hold, fade, freeze }, { doc = document, win = window } = {}) {
  const el = h(`div.hitl-card.${card.kind}`, { dataset: { card: id }, style: { '--card-fade': `${fade}s` } }, h('div.card-inner', null, ...(card.kind === 'end' ? endBody() : titleBody(card))));
  layer.append(el);
  const root = doc.documentElement;
  const state = (win.__HITL_CARD = { id, phase: 'in', done: false });
  const set = (phase) => { state.phase = phase; root.dataset.cardPhase = phase; el.dataset.phase = phase; };
  set('in');
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  setTimeout(() => {
    set('hold');
    if (freeze) return;
    setTimeout(() => {
      set('out');
      el.classList.remove('on');
      setTimeout(() => { el.remove(); state.done = true; set('done'); finish(); }, fade * 1000);
    }, hold * 1000);
  }, fade * 1000);
  return { el, done };
}
