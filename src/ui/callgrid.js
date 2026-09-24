// The lockdown video call: a docked grid of the remote staff while state.lockdown is active.
// One or two people "speak" at a time (live portraits); the rest are stills. Tapping a tile opens
// that person in Staff. The grid folds to a small pill and hides while a menu or popup is up.
import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { portrait, portraitLive } from './widgets.js';

const MAX_TILES = 12;
const FLAGS = ['muted', 'frozen', 'badCamera'];

// Call glitches per person: { muted, frozen, badCamera }. The sim sets them on staff (flat, or under
// p.call); until it does, a deterministic stand-in picks a few people per turn so the jokes show.
function glitches(s, remote, turn) {
  const real = remote.some((p) => FLAGS.some((f) => p[f] || p.call?.[f]));
  const out = new Map();
  remote.forEach((p, i) => {
    if (real) { out.set(p.id, { muted: !!(p.muted ?? p.call?.muted), frozen: !!(p.frozen ?? p.call?.frozen), badCamera: !!(p.badCamera ?? p.call?.badCamera) }); return; }
    const k = (i * 5 + s.week + turn) % Math.max(4, remote.length);
    out.set(p.id, { muted: k === 0, frozen: k === 2 && remote.length > 4, badCamera: (i + s.week) % Math.max(5, remote.length) === 3 });
  });
  return out;
}
const TURN_MS = 5000;

export function createCallGrid({ layer, openStaff }) {
  const title = h('b.cgtitle');
  const sub = h('span.small.cgsub');
  const tiles = h('div.cgtiles');
  const foldBtn = h('button.btn.small.cgfold', { onclick: () => { folded = !folded; sig = ''; } });
  const card = h('div.callgrid', null, h('div.cghead', null, icon('home', { size: 16 }), h('div.cgt', null, title, sub), h('span.spacer'), foldBtn), tiles);
  card.style.display = 'none';
  layer.append(card);
  let sig = '';
  let folded = false;

  function update(s, hidden) {
    const lock = s.lockdown;
    const show = !!lock && !s.gameOver && !hidden;
    card.style.display = show ? '' : 'none';
    if (!show) { if (sig) { sig = ''; tiles.replaceChildren(); } return; }
    const remote = s.staff.filter((p) => p.remote);
    const turn = Math.floor(performance.now() / TURN_MS);
    const speakers = new Set(remote.length ? [remote[turn % remote.length].id, remote[(turn * 7 + 3) % remote.length].id] : []);
    const gl = glitches(s, remote, turn);
    // A muted person is always one of the speakers: talking away with the mic off is the joke.
    const mutedOne = remote.find((p) => gl.get(p.id)?.muted);
    if (mutedOne && speakers.size) { speakers.delete([...speakers][1]); speakers.add(mutedOne.id); }
    const next = `${folded}|${remote.map((p) => { const g = gl.get(p.id); return `${p.id}${p.mood}${g.muted ? 'm' : ''}${g.frozen ? 'f' : ''}${g.badCamera ? 'c' : ''}`; }).join()}|${[...speakers].join()}`;
    if (next === sig) return;
    sig = next;
    const stayer = s.staff.find((p) => p.id === lock.stayerId);
    const left = Number.isFinite(lock.until) ? Math.max(0, lock.until - s.week) : null;
    setText(title, `Everyone is working from home`);
    setText(sub, [`${remote.length} on the call`, left !== null ? `about ${left} wk to go` : null, stayer ? `${stayer.name.split(' ')[0]} still goes in` : null].filter(Boolean).join(' · '));
    setText(foldBtn, folded ? 'Show call' : 'Hide');
    card.classList.toggle('folded', folded);
    if (folded) { tiles.replaceChildren(); return; }
    const shown = remote.slice(0, MAX_TILES);
    tiles.replaceChildren(...shown.map((p) => {
      const g = gl.get(p.id);
      const talking = speakers.has(p.id) && !g.frozen;
      const face = talking ? portraitLive(p, 60) : portrait(p, 60);
      const cls = `${talking ? '.talking' : ''}${g.muted ? '.muted' : ''}${g.frozen ? '.frozen' : ''}${g.badCamera ? '.badcam' : ''}`;
      const status = g.frozen ? 'Connection frozen' : g.badCamera ? 'Camera pointed at the ceiling' : g.muted && talking ? 'Talking, but muted' : '';
      return h(`button.cgtile${cls}`, { title: `${p.name}${status ? `: ${status}` : ''}. Open in Staff`, onclick: () => openStaff(p.id) },
        h('span.cgface', null, face, g.frozen ? h('span.cgspin') : null),
        g.muted ? h('span.cgmute', { title: 'Muted' }, icon('mic.off', { size: 12 })) : null,
        h('span.cgname', { text: p.name.split(' ')[0] }));
    }), ...(remote.length > MAX_TILES ? [h('div.cgmore', { text: `+${remote.length - MAX_TILES} more` })] : []));
  }

  return { update };
}
