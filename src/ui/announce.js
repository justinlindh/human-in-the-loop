// Big one-at-a-time cards: era arrivals and first-time unlock explainers.
// Era cards jump the queue. Esc, the backdrop, or the button dismisses; the game waits while one is up.
import { h, dateOf } from './dom.js';
import { icon } from './icons.js';
import { ERA, unlockInfo, unlockShort } from './v2content.js';

const MAX_QUEUE = 8;

export function createAnnouncer({ layer, sfx, openMenu }) {
  const queue = [];
  let cur = null; // { back, item }

  function show() {
    if (cur || !queue.length) return;
    const item = queue.shift();
    const back = h(`div.announce-back${item.kind === 'era' ? '.docked' : ''}`);
    const done = () => { if (cur?.back !== back) return; back.remove(); cur = null; layer.classList.remove('announcing'); sfx('close'); show(); };
    back.addEventListener('pointerdown', (e) => { if (e.target === back) done(); });
    back.append(item.kind === 'era' ? eraCard(item, done) : item.kind === 'unlocks' ? unlocksCard(item, done)
      : item.kind === 'milestone' ? milestoneCard(item, done) : unlockCard(item, done));
    layer.append(back);
    layer.classList.add('announcing');
    cur = { back, item, done };
    sfx(item.kind === 'era' ? 'confirm' : 'open');
  }

  function eraCard({ eraId, week, decision, keys = [] }, done) {
    const e = ERA[eraId] ?? { name: eraId, blurb: '', changes: [] };
    const d = dateOf(week ?? 0);
    const go = h('button.btn.go.big', { onclick: done }, decision ? 'See the decision' : 'Onward');
    setTimeout(() => go.focus(), 0);
    return h(`div.announce.era.${eraId}`, null,
      h('div.erahead', null,
        h('div.kicker', null, icon('clock', { size: 14 }), ' A new era'),
        h('h2', { text: e.name }),
        h('div.year', { text: `${d.year} · Q${d.quarter}` })),
      h('div.erabody', null,
        e.blurb ? h('div.ablurb', { text: e.blurb }) : null,
        e.changes?.length ? h('div', null, h('b', { text: 'What changes' })) : null,
        e.changes?.length ? h('ul.changes', null, ...e.changes.map((c) => h('li', { text: c }))) : null,
        keys.length ? h('div.eranew', null, icon('new', { size: 16 }), h('b', { text: ' New: ' }), keys.map(unlockShort).join(', ')) : null,
        decision ? h('div.eranote', null, icon('decision', { size: 16 }), ` A decision is waiting: ${decision}`) : null,
        h('div.row.acts', null, go)));
  }

  // A big birthday: headline, a line of copy, and what it opens (e.g. retiring at ten years).
  function milestoneCard({ title, text, lines = [], action, kicker = 'Milestone' }, done) {
    const ok = h('button.btn', { onclick: done }, 'Onward');
    const act = action ? h('button.btn.go', { onclick: () => { done(); action.run(); } }, action.label) : null;
    setTimeout(() => (act ?? ok).focus(), 0);
    return h('div.announce.milestone', null,
      h('div.kicker', null, icon('award', { size: 14 }), ` ${kicker}`),
      h('h2', { text: title }),
      text ? h('div.ablurb', { text }) : null,
      lines.length ? h('ul.changes', null, ...lines.map((l) => h('li', { text: l }))) : null,
      h('div.row.acts', null, ok, act));
  }

  function unlocksCard({ items }, done) {
    const ok = h('button.btn.go', { onclick: done }, 'Got it');
    setTimeout(() => ok.focus(), 0);
    return h('div.announce.unlock.multi', null,
      h('div', null, h('div.kicker', null, icon('new', { size: 14 }), ' New!'), h('h2', { text: `${items.length} new things to try` })),
      h('div.ulist', null, ...items.map((it) => {
        const u = unlockInfo(it.key);
        return h('div.uitem', null, h('span.uico', null, icon(it.menuId ? `menu.${it.menuId}` : 'new', { size: 20 })),
          h('div', null, h('b', { text: u.title }), u.why ? h('div.small.muted', { text: u.why }) : null));
      })),
      h('div.row.acts', null, ok));
  }

  function unlockCard({ key, menuId, menuLabel }, done) {
    const u = unlockInfo(key);
    const open = menuId ? h('button.btn.go', { onclick: () => { done(); openMenu(menuId); } }, `Open ${menuLabel}`) : null;
    const ok = h('button.btn', { onclick: done }, 'Got it');
    setTimeout(() => (open ?? ok).focus(), 0);
    return h('div.announce.unlock', null,
      h('div.row', { style: { gap: '0.8em', alignItems: 'center' } },
        h('div.uico', null, icon(menuId ? `menu.${menuId}` : 'new', { size: 30 })),
        h('div', null, h('div.kicker', null, icon('new', { size: 14 }), ' New!'), h('h2', { text: u.title }))),
      u.why ? h('div.ablurb', { text: u.why }) : null,
      h('div.row.acts', null, ok, open));
  }

  return {
    get open() { return !!cur; },
    era(eraId, week, decision, keys = []) {
      // Era cards go ahead of unlock explainers.
      const at = queue.findIndex((q) => q.kind !== 'era');
      queue.splice(at < 0 ? queue.length : at, 0, { kind: 'era', eraId, week, decision, keys });
      show();
    },
    unlock(key, menuId, menuLabel) {
      if (queue.length >= MAX_QUEUE || queue.some((q) => q.key === key)) return;
      queue.push({ kind: 'unlock', key, menuId, menuLabel });
      show();
    },
    milestone(m) {
      if (queue.length >= MAX_QUEUE) return;
      queue.push({ kind: 'milestone', ...m });
      show();
    },
    unlocks(items) {
      if (queue.length >= MAX_QUEUE) return;
      queue.push({ kind: 'unlocks', items });
      show();
    },
    onKey(e) {
      if (!cur) return false;
      if (e.key === 'Escape') { cur.done(); e.preventDefault(); }
      return true;
    },
    reset() { queue.length = 0; cur?.back.remove(); cur = null; layer.classList.remove('announcing'); },
  };
}
