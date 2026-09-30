import { h, setText, fmtMoney, dateOf } from './dom.js';
import { portrait, roleChip, confirmButton } from './widgets.js';
import { traitInfo } from './content.js';
import { ERA, ARCHETYPES, FUNDING, LOGO_COLORS, archetypePerson, fundingCash, fundingMult, archetypeBlurb, foundingWarning } from './v2content.js';
import { icon } from './icons.js';
import { confirmGate } from './confirm-gate.js';
import { SAVE_NOTE, SAVE_NOTE_SHORT } from './saveNote.js';
import { downloadSave, pickSaveFile } from './saveFiles.js';
import { STAT } from './stats.js';
import { ERA_STARTS } from '../data/era-modes.js';
import { B } from '../sim/balance.js';
import { OFFICE_STAGES } from '../data/office.js';
import { GOALS } from '../data/goals.js';
import { erasPreview } from './eraPreview.js';
import { periodCopy } from '../data/period-content.js';
import { createGame } from '../sim/state.js';
import { canTakeOver } from '../sim/takeover.js';
import { weeklyCosts, weeklyRevenue } from '../sim/economy.js';

const NAME_A = ['Loop', 'Pair', 'Kindly', 'Tiny', 'Candor', 'Hearth', 'Paper', 'Lantern', 'Honest', 'Maple', 'Orbit', 'Quiet'];
const NAME_B = ['works', 'labs', ' & Co', ' Software', 'craft', ' Systems', 'house', ' Collective', 'forge', ' Studio'];
const KIT_FUNDING = {
  bootstrapped: 'Savings and a credit card, plus the era kit. Nobody to answer to.',
  family: 'Money from people who love you, plus the era kit. More runway, with dinner-table questions.',
  preseed: 'Outside money, a little press and two senior introductions, plus the era kit.',
};

// The release version, injected at build time; 'dev' in a local build.
/* global __HITL_VERSION__ */
export const BUILD_VERSION = (typeof __HITL_VERSION__ !== 'undefined' && __HITL_VERSION__) || 'dev';
const versionLabel = () => (/^\d/.test(BUILD_VERSION) ? `v${BUILD_VERSION}` : BUILD_VERSION);

// A save the current build cannot read (older or newer): the loader says so with a flag or its reason text.
const isOldSave = (r) => !!r && r.ok === false && (r.stale === true || r.incompatible === true || r.code === 'incompatible' || /incompatible|(older|newer) build|older version/i.test(r.reason ?? ''));

function suggestCompany() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return `${pick(NAME_A)}${pick(NAME_B)}`;
}

// Title screen over the live diorama: New Game (company name, optional seed), Continue, Settings.
export function createTitle({ layer, controls, sfx, toast, onStart, openSettings, getState = null }) {
  const root = h('div.title');
  root.style.display = 'none';
  layer.append(root);
  let preparedTakeover = null;

  function lockup() {
    return h('div.lockup', null,
      h('div.tl-kicker', { text: 'A tiny company sim' }),
      h('h1.tl-name', null, h('span.w1', { text: 'Human' }), h('span.w2', { text: 'in the' }), h('span.w3', { text: 'Loop' })),
      h('div.tl-sub', { text: 'Build software. Keep the humans.' }));
  }

  function prealpha() {
    return h('div.tl-prealpha', null, h('b', { text: `Pre-alpha build ${versionLabel()}.` }), ' Things will break, including your saves.');
  }

  // How saving works. main.js autosaves every few weeks and whenever the tab is hidden or closed,
  // into this browser's storage. Full on a first visit; one quiet line once a save exists.
  function saveNote(hasSave) {
    return hasSave
      ? h('div.tl-savenote.quiet', { text: SAVE_NOTE_SHORT })
      : h('div.tl-savenote', null, icon('continue', { size: 18 }), h('span', { text: SAVE_NOTE }));
  }

  // Saves: controls.listSaves() -> [{ id, companyName, logoColor, week, year, eraId, over, savedAt }], most
  // recent first. Without it, the single save from loadStatus(). Each becomes one row in the slot list.
  function saveSlots() {
    const list = controls.listSaves?.();
    if (Array.isArray(list)) return list.length ? list.map((m) => ({ id: m.id, ok: m.ok !== false, reason: m.reason, meta: m })) : [{ id: null, ok: false, reason: 'No saved companies yet' }];
    const st = controls.loadStatus?.() ?? { ok: false, reason: 'No save found' };
    return [{ id: null, ...st }];
  }

  const ago = (t) => {
    if (!Number.isFinite(t)) return '';
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  };

  function slotRow(slot) {
    const m = slot.meta;
    const week = m && Number.isFinite(m.week) ? dateOf(m.week) : null;
    const load = () => {
      const res = controls.continueGame?.(slot.id ?? undefined);
      if (isOldSave(res)) { oldSaveView(slot); return; }
      if (res && res.ok === false) { toast(res.reason ?? 'Could not load the save', 'warn'); return; }
      if (res?.notice) toast(res.notice, 'info');
      sfx('confirm');
      onStart({ fresh: false });
    };
    const when = [m?.year ?? week?.year, ERA[m?.eraId]?.name, m?.over ? 'finished' : null, ago(m?.savedAt)].filter(Boolean).join(' · ');
    const old = isOldSave(slot);
    const btn = h('button.btn.big.tl-btn.tl-slot', { disabled: !slot.ok && !old, title: slot.ok ? `Continue ${m?.companyName ?? 'your company'}` : slot.reason, onclick: load },
      m ? h('span.slogo', { style: { background: m.logoColor ?? '' }, text: (m.companyName || '?').slice(0, 1).toUpperCase() }) : icon('continue'),
      h('span.sinfo', null, h('b', { text: m?.companyName ? `Continue ${m.companyName}` : 'Continue' }),
        when ? h('span.small.muted', { text: when }) : null));
    // Delete asks inside the row: the first tap arms it, a second tap within a few seconds deletes.
    const del = slot.id && controls.deleteSave ? deleteButton(() => {
      const res = controls.deleteSave(slot.id);
      if (res && res.ok === false) { toast(res.reason ?? 'Could not delete the save', 'warn'); return; }
      sfx('close');
      menuView();
    }, m?.companyName) : null;
    // Export keeps a copy of the save as a file, for another browser or device (Import there).
    const exp = slot.id && !old && controls.exportSave ? h('button.btn.tl-exp', {
      title: `Export ${m?.companyName ?? 'this save'} as a file`, 'aria-label': `Export ${m?.companyName ?? 'this save'}`,
      onclick: () => {
        const text = controls.exportSave(slot.id);
        if (!text) { toast('Could not read that save', 'warn'); return; }
        downloadSave(text, m?.companyName, slot.id); sfx('confirm'); toast('Save exported as a file.', 'good');
      },
    }, icon('save.export'), h('span.tl-explbl', { text: ' Export' })) : null;
    return [h('div.tl-slotrow', null, btn, exp, del), old ? h('div.small.tl-why', { text: 'From a different build. Tap to see your options.' }) : !slot.ok ? h('div.small.tl-why', { text: slot.reason ?? '' }) : null];
  }

  // An old save the current build cannot load: say so plainly and offer a fresh start.
  function oldSaveView(slot) {
    sfx('error');
    const name = slot.meta?.companyName;
    // Export keeps a copy of the save as a file; hidden when the host cannot read the slot's text.
    const text = slot.id ? controls.exportSave?.(slot.id) ?? null : null;
    const exportBtn = text ? h('button.btn.big', { onclick: () => { downloadSave(text, name, slot.id); sfx('confirm'); toast('Save exported as a file.', 'good'); } }, icon('save.export'), ' Export') : null;
    root.replaceChildren(h('div.tl-card', null, lockup(),
      h('div.tl-form', null,
        h('b', { text: 'This save is from a different build' }),
        h('div', { text: `${name ? `${name} was` : 'It was'} saved by another version of the game, and this build cannot read it. That comes with pre-alpha, sorry.${text ? ' You can export it to keep a copy.' : ''}` }),
        // The main action gets its own full-width row, so it never wraps alone.
        h('button.btn.go.big.tl-wide', { onclick: () => { sfx('click'); newGameView(); } }, icon('launch'), ' Start fresh'),
        h('div.row', null,
          h('button.btn.big', { onclick: () => { sfx('click'); menuView(); } }, icon('arrow.back'), ' Back'),
          h('span.spacer'),
          exportBtn,
          slot.id && controls.deleteSave ? confirmButton('Delete it', 'Delete? Tap again', 'big', () => { controls.deleteSave(slot.id); sfx('close'); menuView(); }) : null),
        prealpha())));
  }

  function deleteButton(onConfirm, name) {
    const b = h('button.btn.tl-del', { title: `Delete ${name ?? 'this save'}`, 'aria-label': `Delete ${name ?? 'this save'}` }, icon('close'));
    const gate = confirmGate({
      outsideOf: b,
      onChange: (on) => { b.classList.toggle('armed', on); b.replaceChildren(on ? h('span', { text: 'Delete?' }) : icon('close')); },
    });
    b.addEventListener('click', () => { if (gate.tap()) onConfirm(); });
    return b;
  }

  // Import: pick a file, let the save module check it, and add it as a new slot. When every slot is
  // taken, the player picks which one to replace, and that takes a second tap.
  async function importFlow() {
    sfx('click');
    const got = await pickSaveFile();
    if (!got) return;
    if (!got.text) { sfx('error'); toast(got.reason, 'warn'); return; }
    finishImport(got.text);
  }

  function finishImport(text, replaceId = null) {
    let res;
    try { res = controls.importSave(text, replaceId ? { replaceId } : undefined); } catch { res = { ok: false, reason: 'Could not import that file' }; }
    if (res?.ok) {
      sfx('confirm');
      toast(`Imported ${res.meta?.companyName ?? 'the save'}.`, 'good');
      menuView();
      return;
    }
    if (res?.full) { importReplaceView(text); return; }
    sfx('error');
    toast(`That file can't be loaded: ${(res?.reason ?? 'unknown problem').replace(/^./, (c) => c.toLowerCase())}.`, 'warn');
  }

  // The companies to replace, in a box that scrolls on short screens; a fade at the bottom shows
  // while more rows are below.
  function replaceList(rows) {
    const box = h('div.tl-slots.tl-replacelist', null, ...rows);
    const cue = () => box.classList.toggle('more', box.scrollTop + box.clientHeight < box.scrollHeight - 2);
    box.addEventListener('scroll', cue, { passive: true });
    requestAnimationFrame(cue);
    return box;
  }

  function importReplaceView(text) {
    // The loaded game autosaves to its own slot, which would overwrite an import placed there.
    const live = getState?.()?.flags?.saveSlot ?? null;
    const list = (controls.listSaves?.() ?? []).filter((m) => m.id !== live);
    root.replaceChildren(h('div.tl-card', null, lockup(),
      h('div.tl-form', null,
        h('b', { text: 'Every save slot is taken' }),
        h('div', { text: `Pick a company to replace with the imported save. Its current save is lost, so export it first if you want to keep it.${live ? ' The company you have open is not listed: it keeps saving to its own slot.' : ''}` }),
        replaceList(list.map((m) => h('div.tl-slotrow', null,
          h('div.tl-slot.tl-replaceinfo', null, h('span.slogo', { style: { background: m.logoColor ?? '' }, text: (m.companyName || '?').slice(0, 1).toUpperCase() }),
            h('span.sinfo', null, h('b', { text: m.companyName ?? 'A company' }), h('span.small.muted', { text: [m.year, ERA[m.eraId]?.name, ago(m.savedAt)].filter(Boolean).join(' · ') }))),
          confirmButton('Replace', 'Replace? Tap again', 'big.danger', () => finishImport(text, m.id))))),
        h('button.btn.big', { onclick: () => { sfx('click'); menuView(); } }, icon('arrow.back'), ' Cancel'))));
  }

  function menuView() {
    const slots = saveSlots();
    const hasSave = slots.some((x) => x.id != null || x.ok);
    root.replaceChildren(h('div.tl-card', null, lockup(),
      h('div.tl-menu', null,
        h('button.btn.go.big.tl-btn', { onclick: () => { sfx('click'); newGameView(); } }, icon('launch'), ' New Game'),
        h('div.tl-slots', null, ...slots.flatMap(slotRow)),
        controls.importSave ? h('button.btn.big.tl-btn', { onclick: () => importFlow() }, icon('save.import'), ' Import a save') : null,
        h('button.btn.big.tl-btn', { onclick: () => openSettings() }, icon('settings'), ' Settings')),
      saveNote(hasSave),
      prealpha()));
  }

  // Founding: identity, then two founders, then funding. Choices persist across steps.
  const TAGLINES = ['Build software. Keep the humans.', 'Small team, big opinions.', 'We read the docs so you do not have to.', 'Software with a pulse.', 'Made by people, mostly.', 'Ship it, then ship it better.'];
  let draft = null;

  const MAX_SAVES = 6;

  function newGameView() {
    preparedTakeover = null;
    draft = { companyName: suggestCompany(), logoColor: LOGO_COLORS[0], tagline: TAGLINES[0], seed: '', founders: [], funding: 'bootstrapped', startEra: 'classic', startMode: 'garage', replaceId: null };
    const list = controls.listSaves?.();
    if (Array.isArray(list) && list.length >= (controls.maxSaves ?? MAX_SAVES)) replaceView(list);
    else identityStep();
  }

  // Every slot is taken: the player picks which company the new one replaces (the oldest by default).
  // Nothing is deleted until the founding steps finish.
  function replaceView(list) {
    const oldest = [...list].sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0))[0];
    let pick = oldest.id;
    const label = (m) => `${m.companyName ?? 'A company'}, ${m.year ?? ''}`.replace(/, $/, '');
    const note = h('div.small');
    const rows = h('div.tl-slots', null, ...list.map((m) => {
      const b = h('button.btn.big.tl-btn.tl-slot.pickable', { onclick: () => { pick = m.id; sync(); } },
        h('span.slogo', { style: { background: m.logoColor ?? '' }, text: (m.companyName || '?').slice(0, 1).toUpperCase() }),
        h('span.sinfo', null, h('b', { text: m.companyName ?? 'Company' }),
          h('span.small.muted', { text: [m.year, ERA[m.eraId]?.name, m.over ? 'finished' : null, ago(m.savedAt)].filter(Boolean).join(' · ') })));
      b.dataset.id = m.id;
      return b;
    }));
    const sync = () => {
      rows.querySelectorAll('.tl-slot').forEach((b) => b.classList.toggle('on', b.dataset.id === pick));
      const m = list.find((x) => x.id === pick);
      setText(note, `Starting a new company replaces ${label(m)}.`);
      sfx('click');
    };
    root.replaceChildren(h('div.tl-card', null, lockup(),
      h('div.tl-form', null,
        h('b', { text: `All ${list.length} save slots are full` }),
        h('div.small.muted', { text: 'Pick the company to make room for. It is only replaced once you start the new one.' }),
        rows, note,
        h('div.row', null,
          h('button.btn.big', { onclick: () => { sfx('click'); menuView(); } }, icon('arrow.back'), ' Back'),
          h('span.spacer'),
          h('button.btn.go.big', { onclick: () => { draft.replaceId = pick; sfx('click'); identityStep(); } }, 'Replace and continue')))));
    sync();
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
      h('span.small', { text: archetypeBlurb(periodCopy(erasPreview ? { era: { id: draft.startEra } } : null, 'founders', a)) }),
      // A non-builder never shows Building as a strength: it would contradict their warning line.
      Array.isArray(a.strengths) && a.strengths.length ? h('span.fstr', null, ...a.strengths.filter((k) => STAT[k] && !(k === 'features' && a.builder === false)).map((k) => h('span.pill.strength', { style: { '--sc': STAT[k].color }, title: `${STAT[k].skill}: drives ${STAT[k].product}` }, icon(STAT[k].icon, { size: 12 }), ` ${STAT[k].skill}`))) : null,
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

  // A start's expected score against Classic's, from balance data, so x0.61 never reads as harder than x0.81.
  const shareText = (kit, long = false) => kit.scoreShare >= 1 ? (long ? 'the same as Classic' : 'full score') : `${Math.round(kit.scoreShare * 100)}% of Classic${long ? '' : ' score'}`;
  function fundingStep() {
    let nextBtn;
    const modeCards = erasPreview ? h('div.takeover-choices', { role: 'group', 'aria-label': 'Company start' },
      ...[['garage', 'Found a company', 'Start with your two founders in a garage.'],
        ['takeover', 'Take over a company', 'Inherit the people, products and history of a company already running.']].map(([id, name, text]) =>
        h('button.start-mode', { dataset: { startMode: id }, onclick: () => { draft.startMode = id; sfx('click'); refreshEra(); } },
          h('b', { text: name }), h('span.small', { text })))) : null;
    const fundingLabel = h('b', { text: 'How are you paying for this?' });
    const scoreNote = h('div.small.muted');
    const error = h('div.small.bad-t', { role: 'alert', hidden: true });
    const eraCards = erasPreview ? h('div.era-starts', { role: 'group', 'aria-label': 'Starting era' }, ...Object.values(ERA_STARTS).map((e) => {
      const k = B.eraStarts[e.id];
      return h(`button.era-start${e.id === draft.startEra ? '.on' : ''}`, {
        'aria-pressed': String(e.id === draft.startEra), dataset: { era: e.id },
        onclick: () => { draft.startEra = e.id; sfx('click'); refreshEra(); },
      }, h('b', { text: e.name }), h('span.small', { text: e.blurb }),
      h('span.small', { text: `${OFFICE_STAGES[k.officeStage].name} · ${k.desks} desks · ${shareText(k)}` }));
    })) : null;
    const unlockNote = h('div.small.muted');
    const skippedNote = h('div.small.muted');
    const summary = h('div.era-start-summary', { 'aria-live': 'polite' });
    const refreshSummary = () => {
      if (draft.startMode === 'takeover') {
        setText(summary, 'Your chosen founders and funding build the predecessor company under the sensible manager. Review what survived before you take over. No era kit or fresh funding is added.');
        return;
      }
      const kit = B.eraStarts[draft.startEra];
      const total = B.funding[draft.funding].cash + kit.cash;
      const fundMult = B.funding[draft.funding].scoreMult;
      const career = draft.startEra === 'dotcom' ? `${B.dotcom.weeks} weeks of dot-com, ${B.web2.weeks} weeks of Web 2.0, then twenty modern years.`
        : draft.startEra === 'web2' ? `${B.web2.weeks} weeks of Web 2.0, then twenty modern years. New web products include old-browser QA work.` : 'A twenty-year company career.';
      setText(summary, `${ERA_STARTS[draft.startEra].name}: ${fmtMoney(total)} starting cash, ${OFFICE_STAGES[kit.officeStage].name}, ${kit.desks} desks. Expected score ${shareText(kit, true)}${fundMult < 1 ? `, times the funding factor x${fundMult}` : ''}. Two founders, no products yet. ${career}`);
    };
    const cards = FUNDING.map((f) => {
      const mult = fundingMult(f);
      const card = h('button.fund', {
        onclick: () => { draft.funding = f.id; cardsEl.querySelectorAll('.fund').forEach((c, j) => { c.classList.toggle('on', FUNDING[j].id === f.id); c.setAttribute('aria-pressed', String(FUNDING[j].id === f.id)); }); refreshSummary(); sfx('click'); },
        'aria-pressed': String(f.id === draft.funding),
      },
      h('b.fname', { text: f.name }),
      h('span.fcash.num'),
      h('span', { class: mult < 1 ? 'pill warn' : 'pill good', text: erasPreview ? (mult < 1 ? `Funding score x${mult}` : 'Funding score x1') : (mult < 1 ? `Final score x${mult}` : 'Full final score'),
        title: mult < 1 ? `Final score\nWhen the game ends, your company is scored on what it built. Outside money means that score is multiplied by ${mult}.` : 'Final score\nWhen the game ends, your company is scored on what it built. Bootstrapping keeps all of it.' }),
      h('span.small.fdesc'),
      h('span.small.fkit'),
      f.pressure ? h('span.small.fpress', null, icon('warn', { size: 12 }), ` ${f.pressure}`) : null);
      if (f.id === draft.funding) card.classList.add('on');
      return card;
    });
    const cardsEl = h('div.funds', null, ...cards);
    const refreshEra = () => {
      if (!canTakeOver(draft.startEra)) draft.startMode = 'garage';
      const takeover = draft.startMode === 'takeover';
      if (modeCards) {
        modeCards.querySelectorAll('button').forEach((b) => {
          const selected = b.dataset.startMode === draft.startMode;
          b.disabled = b.dataset.startMode === 'takeover' && !canTakeOver(draft.startEra);
          if (b.dataset.startMode === 'takeover') setText(b.lastElementChild, b.disabled
            ? 'Takeover starts from ChatGBT. Choose ChatGBT or Agents.'
            : 'Inherit the people, products and history of a company already running.');
          b.classList.toggle('on', selected);
          b.setAttribute('aria-pressed', String(selected));
        });
      }
      setText(error, '');
      error.hidden = true;
      setText(fundingLabel, takeover ? 'How was the company originally funded?' : 'How are you paying for this?');
      setText(scoreNote, takeover ? `Expected score ${shareText({ scoreShare: B.takeover.scoreShare[draft.startEra] }, true)}. Funding and earned cuts affect your final score. The company keeps its age and twentieth-anniversary checkpoint.`
        : erasPreview ? 'Funding then scales the expected score. Classic keeps the full score; other starts trade score for a kit.' : 'When the game ends, your company gets a final score. More money now means a slightly smaller score later.');
      if (nextBtn && erasPreview) nextBtn.replaceChildren(icon('launch'), ' ', takeover ? 'Review the company' : 'Start the company');
      const era = ERA_STARTS[draft.startEra];
      const kit = B.eraStarts[draft.startEra];
      eraCards?.querySelectorAll('.era-start').forEach((card) => {
        const id = card.dataset.era;
        const selected = id === draft.startEra;
        card.classList.toggle('on', selected);
        card.setAttribute('aria-pressed', String(selected));
        const cardKit = B.eraStarts[id];
        const inherited = takeover && canTakeOver(id);
        card.disabled = takeover && !canTakeOver(id);
        setText(card.children[1], inherited
          ? 'Inherit a company built from Classic, with its existing people, products and history.'
          : card.disabled ? 'Choose Found a company to start in this era.' : ERA_STARTS[id].blurb);
        setText(card.lastElementChild, inherited
          ? `Existing company · ${shareText({ scoreShare: B.takeover.scoreShare[id] })}`
          : `${OFFICE_STAGES[cardKit.officeStage].name} · ${cardKit.desks} desks · ${shareText(cardKit)}`);
      });
      const skipped = era.skippedGoals.map((id) => GOALS.find((g) => g.id === id)?.name).join(', ');
      const unlocks = era.unlocks.map((key) => key === 'policy.pair' ? 'AI as Pair' : key[0].toUpperCase() + key.slice(1)).join(', ');
      setText(unlockNote, unlocks ? `Already open: ${unlocks}. Policies start off.` : 'Classic is the full modern run, with the ordinary unlocks and goals.');
      setText(skippedNote, skipped ? `Skipped without rewards: ${skipped}.` : '');
      skippedNote.style.display = !takeover && skipped ? '' : 'none';
      unlockNote.style.display = takeover ? 'none' : '';
      cards.forEach((card, i) => {
        const f = FUNDING[i];
        setText(card.querySelector('.fcash'), fmtMoney(fundingCash(f) + (takeover ? 0 : kit.cash)));
        setText(card.querySelector('.fdesc'), takeover ? 'Original funding, spent and earned by the previous management.' : draft.startEra === 'classic' ? f.desc ?? '' : KIT_FUNDING[f.id]);
        const kitNote = card.querySelector('.fkit');
        setText(kitNote, kit.cash ? `Includes ${fmtMoney(kit.cash)} era kit` : '');
        kitNote.style.display = !takeover && kit.cash ? '' : 'none';
      });
      refreshSummary();
    };
    nextBtn = frame(2, h('div.fbody', null,
      erasPreview ? h('b', { text: 'When does your company begin?' }) : null, eraCards,
      modeCards,
      erasPreview ? unlockNote : null,
      erasPreview ? skippedNote : null,
      fundingLabel,
      cardsEl,
      erasPreview ? summary : null,
      scoreNote, erasPreview ? error : null), () => {
      if (draft.startMode !== 'takeover') { start(); return; }
      if (!draft.seed.trim()) draft.seed = String(Math.floor(Math.random() * 1e9));
      prepare(nextBtn, () => {
        try {
          const options = gameOptions();
          const key = JSON.stringify(options);
          if (preparedTakeover?.key !== key) preparedTakeover = { key, state: createGame(options) };
          takeoverStep(preparedTakeover.state);
        }
        catch (e) { setText(error, e.message); error.hidden = false; sfx('error'); }
      });
    }, 'Start the company');
    refreshEra();
  }

  async function prepare(button, build) {
    const card = button.closest('.founding');
    const buttons = [...card.querySelectorAll('button')].map((b) => [b, b.disabled]);
    const content = [...button.childNodes];
    buttons.forEach(([b]) => { b.disabled = true; });
    card.setAttribute('aria-busy', 'true');
    button.replaceChildren(h('span', { role: 'status', text: 'Reading the books...' }));
    // Give the progress label a painted frame before running the predecessor.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try { if (card.isConnected) build(); }
    finally {
      buttons.forEach(([b, disabled]) => { b.disabled = disabled; });
      card.removeAttribute('aria-busy');
      button.replaceChildren(...content);
    }
  }

  function gameOptions() {
    const raw = draft.seed.trim();
    const seed = raw ? Number(raw) : Math.floor(Math.random() * 1e9);
    return {
      companyName: draft.companyName.trim(), seed, logoColor: draft.logoColor, tagline: draft.tagline.trim(),
      founders: [...draft.founders], funding: draft.funding,
      ...(erasPreview ? { startEra: draft.startEra } : {}),
      ...(erasPreview && draft.startMode === 'takeover' ? { startMode: 'takeover' } : {}),
    };
  }

  function takeoverStep(s) {
    const costs = Object.values(weeklyCosts(s)).reduce((a, b) => a + b, 0);
    const burn = costs - weeklyRevenue(s);
    const products = s.products.filter((p) => !p.killed);
    const factors = [];
    const funding = B.funding[s.founding.funding].scoreMult;
    if (funding < 1) factors.push(`funding x${funding}`);
    if (s.flags.diluted) factors.push(`VC dilution x${B.dilutionScoreMult}`);
    if (s.flags.incubatorCut) factors.push(`incubator cut x${1 - s.flags.incubatorCut}`);
    const fact = (label, value) => h('div.takeover-fact', null, h('span.small', { text: label }), h('b', { text: value }));
    root.replaceChildren(h('div.tl-card.founding.takeover', null, lockup(),
      h('div.tl-form', null,
        h('h2', { text: `Take over ${s.companyName}` }),
        h('p.small', { text: `Built by the sensible manager from seed ${s.seed}. Your founders and original funding shaped this company. These are its actual books and people.` }),
        h('div.takeover-facts', null,
          fact('Entering', ERA_STARTS[draft.startEra].name), fact('Company age', `${s.week} weeks`),
          fact('People', String(s.staff.length)), fact('Live products', String(products.length)),
          fact('Cash', fmtMoney(s.cash)), fact('Weekly burn', burn > 0 ? `${fmtMoney(burn)}/wk` : `$0 (${fmtMoney(-burn)}/wk surplus)`),
          fact('Office', OFFICE_STAGES[s.officeStage].name), fact('Weekly costs', fmtMoney(costs))),
        h('details.takeover-detail', null, h('summary', { text: `Meet the team (${s.staff.length})` }),
          h('ul', { tabindex: 0, 'aria-label': 'Team' }, ...s.staff.map((p) => h('li', { text: `${p.name}, ${p.seniority} ${p.role}` })))),
        h('details.takeover-detail', null, h('summary', { text: `See the products (${products.length})` }),
          h('ul', { tabindex: 0, 'aria-label': 'Products' }, ...products.map((p) => h('li', { text: `${p.name}: ${p.customers} customers, ${fmtMoney(p.mrr)} MRR` })))),
        h('p.small', { text: `The company keeps its projects, policies, debts, incidents and history. Its twentieth-anniversary checkpoint is in ${Math.max(0, B.anniversaryWeek - s.week)} weeks.` }),
        h('p.small', { text: `Expected score ${shareText({ scoreShare: B.takeover.scoreShare[s.founding.takeoverEra] }, true)}${factors.length ? ` · ${factors.join(', ')}` : ''}.` }),
        s.pendingDecision ? h('p.small', { text: `Waiting for you: ${s.pendingDecision.title}` }) : null,
        h('div.row.takeover-actions', null,
          h('button.btn.big', { onclick: () => { sfx('click'); fundingStep(); } }, 'Back'),
          h('button.btn.go.big', { onclick: () => start(s) }, 'Take over and play')))));
  }

  function start(preparedState) {
    const options = gameOptions();
    sfx('confirm');
    if (draft.replaceId) controls.deleteSave?.(draft.replaceId);
    controls.newGame?.(options, preparedState);
    preparedTakeover = null;
    onStart({ fresh: true });
  }

  return {
    show() { menuView(); root.style.display = ''; layer.classList.add('title-mode'); },
    hide() { preparedTakeover = null; root.style.display = 'none'; root.replaceChildren(); layer.classList.remove('title-mode'); },
    get isOpen() { return root.style.display !== 'none'; },
  };
}
