// Advisors: three voices who read the company and say what to consider. The sim supplies a pure
// advice(state) -> [{ key, advisor, severity 1..3, text, why, target: { panel, arg? } | null }], ranked
// and never empty ('fine' when nothing needs saying), and rare { type: 'advice' } events for a line
// worth saying out loud. The UI never acts on advice.
//
//   the lightbulb   in the top-right chip, with a dot while the latest notice is unseen; it opens the panel
//   the panel       the most recent notice (with how long ago it came in, when that matters), Show me
//                   (opens its panel) and Not now (dispatches dismissAdvice, which silences the topic
//                   until it gets worse), and a short Earlier list of the older notices
//   the peek        on an advice event only: the advisor's face and the line slide in at the screen
//                   edge, then tuck away; a tap opens the panel, and the bulb glows until it's opened
//   the setting     On, Quiet (the dot, no peek) or Off (no lightbulb)
//
// A peek is rare and polite: at most one every PEEK_WEEKS game weeks unless it's more urgent than the
// last, never at the top speed, never
// for a line already seen at that tier or higher, and never while something else holds the screen.
import { h, setText, toggleClass } from './dom.js';
import { icon } from './icons.js';
import { SIMX } from './simapi.js';
import { ADVISOR_LEVELS, advisorLevel } from './settings.js';

// The sim's advisor names and titles (src/data/advisors.js), when the build has them.
const DATA = Object.values(import.meta.glob('../data/advisors.js', { eager: true }))[0] ?? {};

const PEEK_WEEKS = 12;
const PEEK_MS = 9000;
const EARLIER_LINES = 4;
const AGE_WEEKS = 2; // younger notices don't say how old they are
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

// The advisor's face: art's portrait in a round badge frame when the renderer has one ready,
// else initials in their colour. Faces showing initials upgrade when portraits finish rendering.
let portraitOf = () => null;
function face(id, size = 28, { idea = false } = {}) {
  const a = who(id);
  const el = h('span.advface', { style: { background: a.color, width: `${size}px`, height: `${size}px` }, 'aria-hidden': 'true', dataset: { adv: id ?? '', idea: idea ? '1' : '' } });
  fillFace(el);
  return el;
}
function fillFace(el) {
  const id = el.dataset.adv;
  const url = id ? portraitOf(id, { idea: el.dataset.idea === '1', size: 96 }) : null;
  if (url) { el.classList.add('portrait'); el.replaceChildren(h('img', { src: url, alt: '' })); }
  else if (!el.firstChild) el.textContent = who(id).initials;
}
if (typeof window !== 'undefined') addEventListener('hitl:portraits', () => { for (const el of document.querySelectorAll('.advface[data-adv]:not(.portrait)')) fillFace(el); });

// The sim's advice for a state, or [] when the sim has none.
export function adviceFor(s) {
  if (typeof SIMX.advice !== 'function') return [];
  try {
    const list = SIMX.advice(s);
    return Array.isArray(list) ? list.filter((x) => x && x.key && x.text) : [];
  } catch { return []; }
}

// The notices worth reading, most recent first: by the week the sim first noticed each (since), the
// sim's own ranking breaking ties and standing in when it gives no week.
export function noticesFor(s) {
  return adviceFor(s).map((x, i) => ({ x, i })).filter(({ x }) => !isFine(x))
    .sort((a, b) => (Number(b.x.since ?? -Infinity) - Number(a.x.since ?? -Infinity)) || a.i - b.i).map(({ x }) => x);
}
// The 'fine' line never says how old it is: its week restarts whenever everything else is dismissed.
const ageText = (s, x) => {
  if (isFine(x)) return '';
  const n = Number.isFinite(x?.since) ? s.week - x.since : null;
  return n !== null && n >= AGE_WEEKS ? `Noticed ${n} weeks ago` : '';
};

export function createAdvisors({ ctx, layer, getRenderer = () => null, getSpeed = () => 1, held = () => false, openGoals = () => {}, panels = {} }) {
  let level = advisorLevel();
  portraitOf = (id, opts) => { try { return getRenderer()?.advisorPortrait?.(id, opts) ?? null; } catch { return null; } };
  const seen = new Map();          // key -> the highest tier of that line the player has seen
  const tierOf = (x) => Number(x?.tier ?? x?.severity ?? 1) || 1;
  const saw = (x) => seen.set(x.key, Math.max(seen.get(x.key) ?? 0, tierOf(x)));
  const seenAt = (x) => (seen.get(x.key) ?? 0) >= tierOf(x);
  let lastPeek = { week: -Infinity, tier: 0 };
  let pending = null;              // an advice event waiting for a quiet moment to peek
  let glowing = false;
  let peekTimer = 0;
  let countShown = null;

  const count = h('span.advcount', { 'aria-hidden': 'true' });
  const button = h('button.btn.small.advbtn', { type: 'button', title: 'Advisors (H)', 'aria-label': 'Advisors', onclick: () => open() }, icon('idea'), count);
  const peekFace = h('span.advpeek-face');
  const peekWho = h('b');
  const peekText = h('span.advpeek-text');
  const peek = h('button.advpeek', { type: 'button', 'aria-label': 'Open the advisors', dataset: { occludes: '' }, onclick: () => { hidePeek(); open(); } },
    h('span.advpeek-bub', null, peekWho, peekText, h('span.advpeek-more', { text: 'More ›' })), peekFace);
  layer?.append(peek);

  const canShow = (item) => { const p = panelOf(item); return !!p && (p === 'goals' || !!panels[p]); };
  const options = (item) => (Array.isArray(item.options) ? item.options.filter((o) => o?.text && canShow(o)).slice(0, 3) : []);
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

  function row(item, rerender, age = '') {
    const a = who(item.advisor);
    return h(`div.advitem.sev-${sev(item.severity)}`, null,
      face(item.advisor, 34),
      h('div.advbody', null,
        h('div.small.muted', { text: `${a.name}${a.role ? ` · ${a.role}` : ''}${age ? ` · ${age}` : ''}` }),
        h('div.advtext', { text: item.text }),
        item.why ? h('div.small.advwhy', { text: item.why }) : null,
        isFine(item) ? null : h('div.advacts', null,
          // A notice's own ways to address it, each opening its panel; Show me when it has none.
          ...(options(item).length ? options(item).map((o) => h('button.btn.small.go.advopt', { type: 'button', onclick: () => showMe(o) }, o.text))
            : [canShow(item) ? h('button.btn.small.go', { type: 'button', onclick: () => showMe(item) }, 'Show me') : null]),
          h('button.btn.small', { type: 'button', onclick: () => { if (dismiss(item)) rerender(); } }, 'Not now'))));
  }

  function open(focusKey = null) {
    if (level === 'off') return;
    hidePeek();
    setGlow(false);
    const body = h('div.advlist');
    let focus = focusKey;
    const render = () => {
      const st = ctx.getState();
      const list = noticesFor(st);
      const main = list.find((x) => x.key === focus) ?? list[0] ?? adviceFor(st).find(isFine) ?? null;
      if (main) saw(main);
      const earlier = list.filter((x) => x !== main).slice(0, EARLIER_LINES);
      const age = main ? ageText(st, main) : '';
      body.replaceChildren(
        main ? row(main, render, age) : h('div.empty', { text: 'Nothing to report. The advisors are pretending to read the reports.' }),
        earlier.length ? h('div.advearlier', null, h('div.small.muted.advearlier-t', { text: 'Earlier' }),
          ...earlier.map((x) => h('button.advearlier-row', { type: 'button', onclick: () => { focus = x.key; render(); } },
            face(x.advisor, 22), h('span.advearlier-text', { text: x.text }), h('span.small.muted', { text: ageText(st, x) })))) : null);
    };
    render();
    ctx.openModal({ title: 'Advisors', iconName: 'idea', body, cls: 'small' });
    ctx.sfx?.('open');
  }

  function setGlow(on) { glowing = on; toggleClass(button, 'glow', on); }
  function hidePeek() { clearTimeout(peekTimer); peekTimer = 0; peek.classList.remove('show'); }
  function showPeek(e) {
    const a = who(e.advisor);
    peekFace.replaceChildren(face(e.advisor, 44, { idea: true }));
    setText(peekWho, `${a.name}${a.role ? `, ${a.role}` : ''}`);
    setText(peekText, e.text);
    peek.classList.add('show');
    clearTimeout(peekTimer);
    peekTimer = setTimeout(hidePeek, PEEK_MS);
  }

  // Once a frame: the count, and a waiting peek once the screen is free.
  function update(s) {
    const latest = level === 'off' ? null : noticesFor(s)[0] ?? null;
    const dot = !!latest && !seenAt(latest);
    if (dot !== countShown) {
      countShown = dot;
      toggleClass(count, 'show', dot);
      button.setAttribute('aria-label', dot ? 'Advisors: something new to consider' : 'Advisors');
    }
    button.style.display = level === 'off' ? 'none' : '';
    if (!pending) return;
    // The rate limit holds back repeats, not an escalation to a higher tier.
    const tooSoon = s.week - lastPeek.week < PEEK_WEEKS && tierOf(pending) <= lastPeek.tier;
    if (level !== 'on' || seenAt(pending) || tooSoon || getSpeed() >= TOP_SPEED) { pending = null; return; }
    if (held()) return;
    lastPeek = { week: s.week, tier: tierOf(pending) };
    saw(pending);
    showPeek(pending);
    setGlow(true);
    pending = null;
  }

  // The sim's rare advice event: a line worth a peek.
  function onEvent(e) {
    if (level !== 'on' || !e?.key || isFine(e)) return;
    pending = { key: e.key, advisor: e.advisor, severity: e.severity, tier: e.tier, text: e.text };
  }

  addEventListener('hitl:advisors', (e) => {
    level = ADVISOR_LEVELS.some((l) => l.v === e.detail?.level) ? e.detail.level : 'on';
    countShown = null;
    if (level !== 'on') { hidePeek(); pending = null; }
    if (level === 'off') setGlow(false);
  });

  return {
    button, peek, open, update, onEvent,
    get glowing() { return glowing; },
    reset() { seen.clear(); lastPeek = { week: -Infinity, tier: 0 }; pending = null; hidePeek(); setGlow(false); countShown = null; },
  };
}
