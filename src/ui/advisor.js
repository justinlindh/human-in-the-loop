// Advisors (#808): three voices who read the company and say what to consider. The sim supplies a
// pure advice(state) -> [{ key, advisor, severity 1..3, text, why, target: { panel, arg? } | null }],
// ranked and never empty ('fine' when nothing needs saying), and rare { type: 'advice' } events for
// a line worth a nudge. The UI never acts on advice.
//
//   the tray card   the top line, with the advisor's face; an urgent new line pulses there
//   the panel       the top few lines, each with Show me (opens its panel) and Not now
//                   (dispatches dismissAdvice, which silences the topic until it gets worse)
//   the setting     On, Quiet (no pulse, the card shrinks to the face) or Off (no card, no button)
//
// A pulse is rare and polite: only on an advice event the player hasn't seen, at most one every
// PULSE_WEEKS game weeks, never at the top speed, and never while something else holds the screen.
import { h, setText, toggleClass } from './dom.js';
import { icon } from './icons.js';
import { SIMX } from './simapi.js';
import { ADVISOR_LEVELS, advisorLevel } from './settings.js';

// The sim's advisor names and titles (src/data/advisors.js), when the build has them.
const DATA = Object.values(import.meta.glob('../data/advisors.js', { eager: true }))[0] ?? {};

const PULSE_WEEKS = 12;
const PANEL_LINES = 3;
const TOP_SPEED = 4;
export const ADVISORS = {
  cfo: { name: 'The CFO', short: 'CFO', initials: 'CFO', role: 'Money', color: '#34c38f' },
  people: { name: 'The people lead', short: 'People', initials: 'PL', role: 'People', color: '#ff7eb6' },
  tech: { name: 'The tech lead', short: 'Tech', initials: 'TL', role: 'Tech', color: '#4f8cff' },
};
function who(id) {
  const base = ADVISORS[id] ?? { name: 'An advisor', short: '?', initials: '?', role: '', color: '#8a8a8a' };
  const d = DATA.ADVISORS?.[id];
  if (!d) return base;
  const initials = String(d.name ?? '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || base.initials;
  return { ...base, name: d.name ?? base.name, role: d.title ?? base.role, initials };
}
// Severity 1..3 from the sim (names are accepted too) as a style.
const sev = (x) => (x === 3 || x === 'urgent' ? 'urgent' : x === 2 || x === 'warn' ? 'warn' : 'info');
const isFine = (x) => x?.key === 'fine';
const panelOf = (x) => x?.target?.panel ?? x?.panel ?? null;

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

  const canShow = (item) => { const p = panelOf(item); return !!p && (p === 'goals' || !!panels[p]); };
  function showMe(item) {
    const target = panelOf(item);
    const arg = item.target?.arg;
    ctx.modal?.close();
    if (target === 'goals') openGoals();
    else if (target === 'staff') ctx.open('staff', arg ? { staffId: arg } : undefined);
    else if (target && panels[target]) ctx.open(target);
  }

  function dismiss(item) {
    const res = ctx.act({ type: 'dismissAdvice', key: item.key });
    if (res?.ok) { ctx.sfx?.('click'); return true; }
    return false;
  }

  function row(item, rerender) {
    const a = who(item.advisor);
    return h(`div.advitem.sev-${sev(item.severity)}`, null,
      face(item.advisor, 34),
      h('div.advbody', null,
        h('div.small.muted', { text: `${a.name}${a.role ? ` · ${a.role}` : ''}` }),
        h('div.advtext', { text: item.text }),
        item.why ? h('div.small.advwhy', { text: item.why }) : null,
        isFine(item) ? null : h('div.advacts', null,
          canShow(item) ? h('button.btn.small.go', { type: 'button', onclick: () => showMe(item) }, 'Show me') : null,
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
        : [h('div.empty', { text: 'Nothing to report. The advisors are pretending to read the reports.' })]));
      stopPulse();
    };
    render();
    ctx.openModal({ title: 'Advisors', iconName: 'idea', body, cls: 'small' });
    ctx.sfx?.('open');
  }

  function stopPulse() {
    if (!pulsing) return;
    pulsing = false;
    nudge = null;
    sig = '';
    toggleClass(card, 'pulse', false);
  }

  // Once a frame: cheap unless the advice changed.
  function update(s) {
    list = level === 'off' ? [] : adviceFor(s);
    const top = (pulsing && nudge) ? nudge : (list[0] ?? null);
    const next = `${level}|${top ? `${top.key}|${top.advisor}|${top.severity}|${top.text}` : ''}`;
    if (next !== sig) {
      sig = next;
      card.style.display = level === 'off' ? 'none' : '';
      button.style.display = level === 'off' ? 'none' : '';
      toggleClass(card, 'quiet', level === 'quiet');
      faceSlot.replaceChildren(top ? face(top.advisor) : face(null));
      setText(line, top ? top.text : 'Nothing pressing right now.');
      toggleClass(card, 'idle', !top || isFine(top));
      if (!top) stopPulse();
    }
    // A nudge from the sim waits for a quiet moment, then pulses the card once.
    if (nudge && !pulsing && level === 'on' && getSpeed() < TOP_SPEED && !held()) {
      if (seen.has(nudge.key) || s.week - lastPulseWeek < PULSE_WEEKS) nudge = null;
      else { pulsing = true; lastPulseWeek = s.week; sig = ''; toggleClass(card, 'pulse', true); }
    }
  }

  // The sim's rare advice event: a line worth a nudge on the card.
  let nudge = null;
  function onEvent(e) {
    if (level !== 'on' || !e?.key || isFine(e)) return;
    nudge = { key: e.key, advisor: e.advisor, severity: e.severity, text: e.text, why: e.why, target: e.target ?? null };
  }

  addEventListener('hitl:advisors', (e) => { level = ADVISOR_LEVELS.some((l) => l.v === e.detail?.level) ? e.detail.level : 'on'; sig = ''; stopPulse(); });

  return {
    card, button, open, update, onEvent,
    get pulsing() { return pulsing; },
    reset() { seen.clear(); lastPulseWeek = -Infinity; sig = ''; stopPulse(); nudge = null; },
  };
}
