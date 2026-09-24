import { h, setText } from './dom.js';
import { icon } from './icons.js';

const NAME_A = ['Loop', 'Pair', 'Kindly', 'Tiny', 'Candor', 'Hearth', 'Paper', 'Lantern', 'Honest', 'Maple', 'Orbit', 'Quiet'];
const NAME_B = ['works', 'labs', ' & Co', ' Software', 'craft', ' Systems', 'house', ' Collective', 'forge', ' Studio'];

function suggestCompany() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return `${pick(NAME_A)}${pick(NAME_B)}`;
}

// Title screen over the live diorama: New Game (company name, optional seed), Continue, Settings.
export function createTitle({ layer, controls, sfx, toast, onStart, openSettings }) {
  const root = h('div.title');
  root.style.display = 'none';
  layer.append(root);

  function lockup() {
    return h('div.lockup', null,
      h('div.tl-kicker', { text: 'A tiny company sim' }),
      h('h1.tl-name', null, h('span.w1', { text: 'Human' }), h('span.w2', { text: 'in the' }), h('span.w3', { text: 'Loop' })),
      h('div.tl-sub', { text: 'Build software. Keep the humans.' }));
  }

  function menuView() {
    const status = controls.loadStatus?.() ?? { ok: false, reason: 'No save found' };
    const cont = h('button.btn.big.tl-btn', {
      disabled: !status.ok,
      title: status.ok ? 'Continue your saved company' : status.reason,
      onclick: () => {
        const res = controls.continueGame?.();
        if (res && res.ok === false) { toast(res.reason ?? 'Could not load the save', 'warn'); return; }
        if (res?.notice) toast(res.notice, 'info');
        sfx('confirm');
        onStart({ fresh: false });
      },
    }, icon('continue'), ' Continue');
    root.replaceChildren(h('div.tl-card', null, lockup(),
      h('div.tl-menu', null,
        h('button.btn.go.big.tl-btn', { onclick: () => { sfx('click'); newGameView(); } }, icon('launch'), ' New Game'),
        cont,
        !status.ok ? h('div.small.tl-why', { text: status.reason ?? '' }) : null,
        h('button.btn.big.tl-btn', { onclick: () => openSettings() }, icon('settings'), ' Settings'))));
  }

  function newGameView() {
    const nameIn = h('input.text', { value: suggestCompany(), maxlength: 24, placeholder: 'Company name' });
    const seedIn = h('input.text.seed', { placeholder: 'Random', inputmode: 'numeric', maxlength: 9 });
    const err = h('div.small.bad-t');
    const start = () => {
      const companyName = nameIn.value.trim();
      if (!companyName) { setText(err, 'Give your company a name.'); nameIn.focus(); return; }
      const raw = seedIn.value.trim();
      if (raw && !/^\d+$/.test(raw)) { setText(err, 'The seed is a whole number, or leave it blank.'); return; }
      const seed = raw ? Number(raw) : Math.floor(Math.random() * 1e9);
      sfx('confirm');
      controls.newGame?.({ companyName, seed });
      onStart({ fresh: true });
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    seedIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    root.replaceChildren(h('div.tl-card', null, lockup(),
      h('div.tl-form', null,
        h('label', null, h('b', { text: 'Company name' }),
          h('div.row', null, nameIn, h('button.btn.small', { onclick: () => { nameIn.value = suggestCompany(); } }, icon('dice'), ' Suggest'))),
        h('label', null, h('b', { text: 'Seed' }), h('span.small.muted', { text: ' optional: the same seed plays the same game' }), seedIn),
        err,
        h('div.row', null,
          h('button.btn.big', { onclick: () => { sfx('click'); menuView(); } }, icon('arrow.back'), ' Back'),
          h('span.spacer'),
          h('button.btn.go.big', { onclick: start }, icon('launch'), ' Start the company')))));
    setTimeout(() => { nameIn.focus(); nameIn.select(); }, 0);
  }

  return {
    show() { menuView(); root.style.display = ''; layer.classList.add('title-mode'); },
    hide() { root.style.display = 'none'; root.replaceChildren(); layer.classList.remove('title-mode'); },
    get isOpen() { return root.style.display !== 'none'; },
  };
}
