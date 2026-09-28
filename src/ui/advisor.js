// Advisors (#808): three voices who read the company and say what to consider. The sim supplies a
// pure advice(state) -> [{ key, advisor, severity, text, panel? }], ranked; the UI never acts on it.
//
//   the tray card   the top line, with the advisor's face; an urgent new line pulses there
//   the panel       the top few lines, each with Show me (opens its panel) and Not now
//                   (dispatches dismissAdvice, which silences the topic until it gets worse)
//   the setting     On, Quiet (no pulse, the card shrinks to the face) or Off (no card, no button)
//
// A pulse is rare and polite: only an urgent line the player hasn't seen, at most one every
// PULSE_WEEKS game weeks, never at the top speed, and never while something else holds the screen.
import { h, setText, toggleClass } from './dom.js';
import { icon } from './icons.js';
import { SIMX } from './simapi.js';
import { ADVISOR_LEVELS, advisorLevel } from './settings.js';

const PULSE_WEEKS = 12;
const PANEL_LINES = 3;
const TOP_SPEED = 4;
export const ADVISORS = {
  cfo: { name: 'The CFO', short: 'CFO', initials: 'CFO', role: 'Money', color: '#34c38f' },
  people: { name: 'The people lead', short: 'People', initials: 'PL', role: 'People', color: '#ff7eb6' },
  tech: { name: 'The tech lead', short: 'Tech', initials: 'TL', role: 'Tech', color: '#4f8cff' },
};
const who = (id) => ADVISORS[id] ?? { name: 'An advisor', short: '?', initials: '?', role: '', color: '#8a8a8a' };

// The advisor's face: a round badge in their colour with their initials, until portraits exist.
function face(id, size = 28) {
  const a = who(id);
  return h('span.advface', { style: { background: a.color, width: `${size}px`, height: `${size}px` }, 'aria-hidden': 'true', text: a.initials });
}

// The sim's advice for a state, or [] when the sim has none.
export function adviceFor(s) {
  if (typeof SIMX.advice !== 'function') return [];
  try {
    const list = SIMX.advice(s);
    return Array.isArray(list) ? list.filter((x) => x && x.key && x.text) : [];
  } catch { return []; }
}

export function createAdvisors({ ctx, getSpeed = () => 1, held = () => false, openGoals = () => {}, panels = {} }) {
  let level = advisorLevel();
  let list = [];
  let sig = '';
  const seen = new Set();          // keys whose line the player has seen (on the card or in the panel)
  let lastPulseWeek = -Infinity;
  let pulsing = false;

  const faceSlot = h('span.advslot');
  const line = h('span.advline');
  const card = h('div.tray-card.advisor', { role: 'button', tabindex: '0', 'aria-label': 'Advisors', onclick: () => open(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } },
    h('div.t', null, h('span', null, icon('idea', { size: 14 }), ' Advisors'), h('span.k', null, icon('caret.right', { size: 12 }))),
    h('div.advrow', null, faceSlot, line));
  const button = h('button.btn.small.advbtn', { type: 'button', title: 'Advisors (H)', 'aria-label': 'Advisors', onclick: () => open() }, icon('idea'));

  function showMe(item) {
    const target = item.panel;
    ctx.modal?.close();
    if (target === 'goals') openGoals();
    else if (target && panels[target]) ctx.open(target);
  }

  function dismiss(item) {
    const res = ctx.act({ type: 'dismissAdvice', key: item.key });
    if (res?.ok) { ctx.sfx?.('click'); return true; }
    return false;
  }

  function row(item, rerender) {
    const a = who(item.advisor);
    return h(`div.advitem.sev-${item.severity ?? 'info'}`, null,
      face(item.advisor, 34),
      h('div.advbody', null,
        h('div.small.muted', { text: `${a.name}${a.role ? ` · ${a.role}` : ''}` }),
        h('div.advtext', { text: item.text }),
        h('div.advacts', null,
          item.panel && (panels[item.panel] || item.panel === 'goals') ? h('button.btn.small.go', { type: 'button', onclick: () => showMe(item) }, 'Show me') : null,
          h('button.btn.small', { type: 'button', onclick: () => { if (dismiss(item)) rerender(); } }, 'Not now'))));
  }

  function open() {
    if (level === 'off') return;
    const body = h('div.advlist');
    const render = () => {
      const s = ctx.getState();
      const items = adviceFor(s).slice(0, PANEL_LINES);
      for (const x of items) seen.add(x.key);
      body.replaceChildren(...(items.length ? items.map((x) => row(x, render))
        : [h('div.empty', { text: 'Nothing pressing. The advisors are pretending to read the reports.' })]));
      stopPulse();
    };
    render();
    ctx.openModal({ title: 'Advisors', iconName: 'idea', body, cls: 'small' });
    ctx.sfx?.('open');
  }

  function stopPulse() {
    if (!pulsing) return;
    pulsing = false;
    toggleClass(card, 'pulse', false);
  }

  // Once a frame: cheap unless the advice changed.
  function update(s) {
    list = level === 'off' ? [] : adviceFor(s);
    const top = list[0] ?? null;
    const next = `${level}|${top ? `${top.key}|${top.advisor}|${top.severity}|${top.text}` : ''}`;
    if (next !== sig) {
      sig = next;
      card.style.display = level === 'off' ? 'none' : '';
      button.style.display = level === 'off' ? 'none' : '';
      toggleClass(card, 'quiet', level === 'quiet');
      faceSlot.replaceChildren(top ? face(top.advisor) : face(null));
      setText(line, top ? top.text : 'Nothing pressing right now.');
      toggleClass(card, 'idle', !top);
      if (!top) stopPulse();
    }
    // An urgent line the player hasn't seen may pulse, rarely.
    if (level === 'on' && top && top.severity === 'urgent' && !seen.has(top.key) && !pulsing
      && s.week - lastPulseWeek >= PULSE_WEEKS && getSpeed() < TOP_SPEED && !held()) {
      pulsing = true;
      lastPulseWeek = s.week;
      toggleClass(card, 'pulse', true);
    }
  }

  addEventListener('hitl:advisors', (e) => { level = ADVISOR_LEVELS.some((l) => l.v === e.detail?.level) ? e.detail.level : 'on'; sig = ''; stopPulse(); });

  return {
    card, button, open, update,
    get pulsing() { return pulsing; },
    reset() { seen.clear(); lastPulseWeek = -Infinity; sig = ''; stopPulse(); },
  };
}
