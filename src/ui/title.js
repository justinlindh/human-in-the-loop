import { h, setText, fmtMoney, dateOf } from './dom.js';
import { portrait, roleChip } from './widgets.js';
import { traitInfo } from './content.js';
import { ARCHETYPES, FUNDING, LOGO_COLORS, archetypePerson, fundingCash, fundingMult, strengthChips, archetypeBlurb, foundingWarning } from './v2content.js';
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

  // Saves: controls.listSaves() -> [{ id, ok, reason, meta: { companyName, week, logoColor } }] when
  // slots exist; otherwise the single save from loadStatus(). Each becomes one row in the slot list.
  function saveSlots() {
    const list = controls.listSaves?.();
    if (Array.isArray(list) && list.length) return list;
    const st = controls.loadStatus?.() ?? { ok: false, reason: 'No save found' };
    return [{ id: null, ...st }];
  }

  function slotRow(slot) {
    const m = slot.meta;
    const d = m && Number.isFinite(m.week) ? dateOf(m.week) : null;
    const load = () => {
      const res = controls.continueGame?.(slot.id ?? undefined);
      if (res && res.ok === false) { toast(res.reason ?? 'Could not load the save', 'warn'); return; }
      if (res?.notice) toast(res.notice, 'info');
      sfx('confirm');
      onStart({ fresh: false });
    };
    const btn = h('button.btn.big.tl-btn.tl-slot', { disabled: !slot.ok, title: slot.ok ? 'Continue this company' : slot.reason, onclick: load },
      m ? h('span.slogo', { style: { background: m.logoColor ?? '' }, text: (m.companyName || '?').slice(0, 1).toUpperCase() }) : icon('continue'),
      h('span.sinfo', null, h('b', { text: m?.companyName ? `Continue ${m.companyName}` : 'Continue' }),
        d ? h('span.small.muted', { text: `${d.year} · Q${d.quarter} · Week ${d.week}` }) : null));
    return [btn, !slot.ok ? h('div.small.tl-why', { text: slot.reason ?? '' }) : null];
  }

  function menuView() {
    root.replaceChildren(h('div.tl-card', null, lockup(),
      h('div.tl-menu', null,
        h('button.btn.go.big.tl-btn', { onclick: () => { sfx('click'); newGameView(); } }, icon('launch'), ' New Game'),
        h('div.tl-slots', null, ...saveSlots().flatMap(slotRow)),
        h('button.btn.big.tl-btn', { onclick: () => openSettings() }, icon('settings'), ' Settings'))));
  }

  // Founding: identity, then two founders, then funding. Choices persist across steps.
  const TAGLINES = ['Build software. Keep the humans.', 'Small team, big opinions.', 'We read the docs so you do not have to.', 'Software with a pulse.', 'Made by people, mostly.', 'Ship it, then ship it better.'];
  let draft = null;

  function newGameView() {
    draft = { companyName: suggestCompany(), logoColor: LOGO_COLORS[0], tagline: TAGLINES[0], seed: '', founders: [], funding: 'bootstrapped' };
    identityStep();
  }

  function steps(n) {
    return h('div.fsteps', null, ...['Company', 'Founders', 'Funding'].map((label, i) =>
      h(`span.fstep${i === n ? '.on' : i < n ? '.done' : ''}`, null, h('b.num', { text: String(i + 1) }), ` ${label}`)));
  }

  function frame(n, body, onNext, nextLabel, nextOk = true) {
    const next = h('button.btn.go.big', { disabled: !nextOk, onclick: onNext }, n === 2 ? icon('launch') : null, n === 2 ? ' ' : null, nextLabel);
    root.replaceChildren(h(`div.tl-card.founding.f${n}`, null, lockup(),
      h('div.tl-form', null, steps(n), body,
        h('div.row', null,
          h('button.btn.big', { onclick: () => { sfx('click'); if (n === 0) menuView(); else [identityStep, foundersStep][n - 1](); } }, icon('arrow.back'), ' Back'),
          h('span.spacer'), next))));
    return next;
  }

  function identityStep() {
    const err = h('div.small.bad-t');
    const nameIn = h('input.text', { value: draft.companyName, maxlength: 24, placeholder: 'Company name', oninput: (e) => { draft.companyName = e.target.value; } });
    const tagIn = h('input.text', { value: draft.tagline, maxlength: 48, placeholder: 'Tagline', oninput: (e) => { draft.tagline = e.target.value; } });
    const seedIn = h('input.text.seed', { value: draft.seed, placeholder: 'Random', inputmode: 'numeric', maxlength: 9, oninput: (e) => { draft.seed = e.target.value; } });
    const logo = h('div.flogo', { style: { background: draft.logoColor } });
    const setLogo = () => { logo.style.background = draft.logoColor; setText(logo, (draft.companyName.trim() || '?').slice(0, 1).toUpperCase()); };
    nameIn.addEventListener('input', setLogo);
    const swatches = h('div.swatches', null, ...LOGO_COLORS.map((c) => {
      const b = h('button.swatch', { style: { background: c }, title: 'Logo color', onclick: () => { draft.logoColor = c; swatches.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b)); setLogo(); } });
      if (c === draft.logoColor) b.classList.add('on');
      return b;
    }));
    const next = () => {
      if (!draft.companyName.trim()) { setText(err, 'Give your company a name.'); nameIn.focus(); return; }
      if (draft.seed.trim() && !/^\d+$/.test(draft.seed.trim())) { setText(err, 'The seed is a whole number, or leave it blank.'); return; }
      sfx('click');
      foundersStep();
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
    frame(0, h('div.fbody', null,
      h('div.row', null, logo, h('div.col', { style: { flex: 1 } },
        h('label', null, h('b', { text: 'Company name' }),
          h('div.row', null, nameIn, h('button.btn.small', { onclick: () => { draft.companyName = suggestCompany(); nameIn.value = draft.companyName; setLogo(); } }, icon('dice'), ' Suggest'))))),
      h('label', null, h('b', { text: 'Logo color' }), swatches),
      h('label', null, h('b', { text: 'Tagline' }),
        h('div.row', null, tagIn, h('button.btn.small', { onclick: () => { draft.tagline = TAGLINES[(TAGLINES.indexOf(draft.tagline) + 1) % TAGLINES.length]; tagIn.value = draft.tagline; } }, icon('dice'), ' Suggest'))),
      h('label', null, h('b', { text: 'Seed' }), h('span.small.muted', { text: ' optional: the same seed plays the same game' }), seedIn),
      err), next, 'Next: founders');
    setLogo();
    setTimeout(() => { nameIn.focus(); nameIn.select(); }, 0);
  }

  function foundersStep() {
    const count = h('span.small.muted');
    const warn = h('div.fwarn');
    let nextBtn = null;
    const refresh = () => {
      setText(count, `${draft.founders.length} of 2 picked`);
      const w = foundingWarning(draft.founders);
      warn.replaceChildren(...(w ? [icon('warn', { size: 14 }), h('span', { text: ` ${w}` })] : []));
      warn.style.display = w ? '' : 'none';
      if (nextBtn) nextBtn.disabled = draft.founders.length !== 2;
    };
    const cards = ARCHETYPES.map((a, i) => {
      const card = h('button.fcard', {
        onclick: () => {
          const k = draft.founders.indexOf(a.id);
          if (k >= 0) draft.founders.splice(k, 1);
          else { if (draft.founders.length >= 2) draft.founders.shift(); draft.founders.push(a.id); }
          cardsEl.querySelectorAll('.fcard').forEach((c, j) => c.classList.toggle('on', draft.founders.includes(ARCHETYPES[j].id)));
          sfx('click');
          refresh();
        },
      },
      portrait(archetypePerson(a, i), 64),
      h('b.fname', { text: a.name }),
      roleChip(a.role),
      h('span.small', { text: archetypeBlurb(a) }),
      strengthChips(a).length ? h('span.fstr', null, ...strengthChips(a).map((n) => h('span.pill.good', { text: n }))) : null,
      a.warning ? h('span.small.fcardwarn', null, icon('warn', { size: 11 }), ` ${a.warning}`) : null,
      a.trait ? h('span.pill.trait', { title: traitInfo(a.trait).desc, text: traitInfo(a.trait).name }) : null);
      if (draft.founders.includes(a.id)) card.classList.add('on');
      return card;
    });
    const cardsEl = h('div.fcards', null, ...cards);
    nextBtn = frame(1, h('div.fbody', null,
      h('div.row', null, h('b', { text: 'Pick two founders' }), h('span.spacer'), count),
      h('div.small.muted', { text: 'The pair shapes your opening: who builds, who sells, who keeps things running.' }),
      cardsEl, warn), () => { sfx('click'); fundingStep(); }, 'Next: funding', draft.founders.length === 2);
    refresh();
  }

  function fundingStep() {
    const cards = FUNDING.map((f) => {
      const mult = fundingMult(f);
      const card = h('button.fund', {
        onclick: () => { draft.funding = f.id; cardsEl.querySelectorAll('.fund').forEach((c, j) => c.classList.toggle('on', FUNDING[j].id === f.id)); sfx('click'); },
      },
      h('b.fname', { text: f.name }),
      h('span.fcash.num', { text: fmtMoney(fundingCash(f)) }),
      h('span', { class: mult < 1 ? 'pill warn' : 'pill good', text: mult < 1 ? `Score x${mult}` : 'Full score' }),
      h('span.small', { text: f.desc ?? '' }),
      f.pressure ? h('span.small.fpress', null, icon('warn', { size: 12 }), ` ${f.pressure}`) : null);
      if (f.id === draft.funding) card.classList.add('on');
      return card;
    });
    const cardsEl = h('div.funds', null, ...cards);
    frame(2, h('div.fbody', null,
      h('b', { text: 'How are you paying for this?' }),
      cardsEl), start, 'Start the company');
  }

  function start() {
    const raw = draft.seed.trim();
    const seed = raw ? Number(raw) : Math.floor(Math.random() * 1e9);
    sfx('confirm');
    controls.newGame?.({
      companyName: draft.companyName.trim(), seed, logoColor: draft.logoColor, tagline: draft.tagline.trim(),
      founders: [...draft.founders], funding: draft.funding,
    });
    onStart({ fresh: true });
  }

  return {
    show() { menuView(); root.style.display = ''; layer.classList.add('title-mode'); },
    hide() { root.style.display = 'none'; root.replaceChildren(); layer.classList.remove('title-mode'); },
    get isOpen() { return root.style.display !== 'none'; },
  };
}
