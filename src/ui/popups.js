import { h } from './dom.js';
import { EVENTS } from '../data/events.js';
import { icon } from './icons.js';
import { portrait, roleChip } from './widgets.js';

const LEADERSHIP_IDS = new Set(['ceo_replace_support', 'four_day_week', 'ai_first_mandate', 'rebrand', 'pivot_pitch', 'open_plan_office',
  'hackathon_week', 'founder_burnout', 'ceo_support_fallout', 'four_day_week_review', 'ai_first_review']);
const DELAYED = /later|week/i;

const isLeadership = (d) => EVENTS[d.eventId]?.kind === 'leadership' || LEADERSHIP_IDS.has(d.eventId);

// Modal layer for decisions (and later launch results and endings). While a modal is open,
// toasts dock in its strip so a refused choice's reason shows right under the choices.
export function createPopups({ layer, ctx, toasts, restoreDock }) {
  const backdrop = h('div.modal-back');
  backdrop.style.display = 'none';
  layer.append(backdrop);

  let shown = null; // the pendingDecision object on screen
  let choiceBtns = [];

  function choose(i) {
    const d = ctx.getState().pendingDecision;
    if (!d || !d.choices[i]) return;
    const res = ctx.act({ type: 'resolveDecision', choice: i });
    if (res.ok) ctx.sfx('confirm');
    else {
      const b = choiceBtns[i];
      if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
    }
  }

  function renderDecision(s, d) {
    const leader = isLeadership(d);
    const subject = s.staff.find((p) => p.id === d.subjectId)
      ?? (leader ? s.staff.find((p) => p.founder) : null);
    const product = s.products.find((p) => p.id === d.subjectId);
    choiceBtns = d.choices.map((c, i) => {
      const later = DELAYED.test(c.hint ?? '');
      return h('button.choice', { onclick: () => choose(i) },
        h('span.ckey.num', { text: String(i + 1) }),
        h('span.cbody', null,
          h('b.clabel', { text: c.label }),
          c.hint ? h('span.chint', null, later ? icon('hourglass', { size: 13, title: 'Effects arrive later' }) : null, later ? ' ' : null, c.hint) : null));
    });
    const body = leader && subject
      ? h('div.leader', null,
        h('div.lport', null, portrait(subject, 88), h('b.small', { text: subject.name.split(' ')[0] }), roleChip(subject.role)),
        h('div.bubble', null, h('p', { text: d.text })))
      : h('div.dtext', null,
        subject ? h('div.subj', null, portrait(subject, 44), h('div', null, h('b', { text: subject.name }), h('div', null, roleChip(subject.role)))) : null,
        product ? h('span.pill.ink', null, icon('product', { size: 12 }), ` ${product.name}`) : null,
        h('p', { text: d.text }));
    const dock = h('div.modal-dock');
    const card = h(`div.modal.decision${leader ? '.lead' : ''}`, null,
      h('div.mhead', null, icon(leader ? 'idea' : 'decision', { size: 24 }), h('h2', { text: d.title }), h('span.spacer'),
        h('span.mtag', { text: leader ? 'Leadership idea' : 'Decision' })),
      h('div.mbody', null, body, h('div.choices', null, ...choiceBtns),
        h('div.small.muted.keys', null, 'Press ', h('span.kbd', { text: '1' }), ` to `, h('span.kbd', { text: String(d.choices.length) }), ' to choose. The week waits for you.')),
      dock);
    backdrop.replaceChildren(card);
    backdrop.style.display = '';
    toasts.setDock(dock);
    ctx.sfx('decision');
  }

  function hide() {
    backdrop.style.display = 'none';
    backdrop.replaceChildren();
    choiceBtns = [];
    shown = null;
    restoreDock();
  }

  function update(s) {
    const d = s.pendingDecision;
    if (d && d !== shown) { shown = d; renderDecision(s, d); }
    else if (!d && shown) hide();
  }

  // Returns true when the modal consumed the key.
  function onKey(e) {
    if (!shown) return false;
    const n = Number(e.key);
    if (n >= 1 && n <= shown.choices.length) { e.preventDefault(); choose(n - 1); return true; }
    if (e.code === 'Space' || e.key === 'Escape' || /^[a-z]$/i.test(e.key)) { e.preventDefault(); return true; }
    return false;
  }

  return { update, onKey, get open() { return !!shown; } };
}
