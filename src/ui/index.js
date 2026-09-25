import { trendSummary } from './content.js';
import { availableItems } from './panels/office.js';
import './style.css';
import { h, dateOf } from './dom.js';
import { createHud } from './hud.js';
import { createToasts } from './toasts.js';
import { createChat } from './chat.js';
import { createMenu, MENU } from './menu.js';
import { PANELS } from './panels/index.js';
import { createPopups } from './popups.js';
import { icon } from './icons.js';
import { createSettings } from './settings.js';
import { createTitle } from './title.js';
import { createGameOver } from './gameover.js';
import { createTutorial, tutorialDone } from './tutorial.js';
import { createBuildMode } from './buildmode.js';
import { setPortraitSource } from './widgets.js';
import { createAnnouncer } from './announce.js';
import { openRecap } from './recap.js';
import { createCallGrid } from './callgrid.js';
import { createTooltips } from './tooltip.js';
import { createSceneTips } from './sceneTips.js';
import { retireOptions } from './retire.js';
import { GOALS, GOAL, goalReward, SIM_HAS_MEANING_UNLOCK } from './v2content.js';

// UI sound cues go out as window events so the audio lane needs no reference to the UI.
export function sfx(name) {
  window.dispatchEvent(new CustomEvent('hitl:sfx', { detail: name }));
}

const PANEL_REFRESH_MS = 150;

export function createUI({ root, getState, dispatch, controls }) {
  const layer = h('div.hitl');
  root.append(layer);
  setPortraitSource(() => controls.renderer ?? controls.getRenderer?.() ?? null);
  const tooltips = createTooltips(layer);

  const toasts = createToasts(layer);
  let lastSpeed = 1;

  const ui = {
    setSpeed(k) {
      if (k > 0) lastSpeed = k;
      controls.setSpeed(k);
      sfx('click');
    },
    togglePause() {
      const cur = controls.getSpeed?.() ?? 0;
      ui.setSpeed(cur === 0 ? lastSpeed || 1 : 0);
    },
    open: (id, arg) => menu.open(id, arg),
    close: () => menu.close(),
  };

  // Every player action goes through here: failures surface their reason as a warn toast.
  function act(action) {
    let res;
    try {
      res = dispatch(action);
    } catch (e) {
      console.warn('dispatch threw', e);
      res = { ok: false, reason: 'Something went wrong' };
    }
    if (!res || !res.ok) {
      toasts.push(res?.reason ?? 'That did not work', 'warn');
      sfx('error');
    }
    return res ?? { ok: false };
  }

  ui.act = (a) => { const r = act(a); if (r.ok) sfx('confirm'); return r; };
  const ctx = {
    getState,
    act,
    toast: (text, tone) => toasts.push(text, tone),
    open: (id, arg) => menu.open(id, arg),
    close: () => menu.close(),
    currentMenu: () => menu.current,
    controls,
    sfx,
    meaningLog: new Map(),
    modal: null,
    // A simple modal card for panel-owned dialogs (career paths, training). Returns a close function.
    openModal({ title, iconName, body, cls = '', onClose = null }) {
      ctx.modal?.close();
      const back = h('div.modal-back.generic');
      const dock = h('div.modal-dock');
      const close = () => {
        back.remove();
        if (ctx.modal?.back === back) { ctx.modal = null; toasts.setDock(menu.current ? menu.dockEl : null); }
        onClose?.();
        sfx('close');
      };
      back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
      back.append(h(`div.modal${cls ? `.${cls}` : ''}`, null,
        h('div.mhead', null, iconName ? icon(iconName, { size: 24 }) : null, h('h2', { text: title }), h('span.spacer'),
          h('button.btn.x', { title: 'Close (Esc)', onclick: close }, icon('close'))),
        h('div.mbody', null, body), dock));
      layer.insertBefore(back, toasts.el);
      ctx.modal = { back, close };
      toasts.setDock(dock);
      sfx('open');
      return close;
    },
  };

  const hud = createHud({ root: layer, controls, ui });

  const bottom = h('div.bottom');
  layer.append(bottom);
  // The bottom row's real height, so the tray can stop above it on short screens.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => requestAnimationFrame(() => layer.style.setProperty('--bottom-h', `${bottom.offsetHeight}px`))).observe(bottom);
  }
  const chat = createChat(bottom, {
    getState,
    onName: (id) => { controls.focusStaff?.(id); menu.open('staff', { staffId: id }); },
  });
  const menu = createMenu({
    bottom, panelRoot: layer, panels: PANELS, ctx,
    onChange: (id) => { if (id && newMenus.delete(id)) menu.setNew(id, false); sfx(id ? 'open' : 'close'); if (!popups.open) toasts.setDock(id ? menu.dockEl : null); },
  });
  bottom.append(h('div'));

  const buildMode = createBuildMode({ layer, ctx, controls });
  // Hover or long-press a person or an item in the office for its tooltip.
  ctx.sceneTips = createSceneTips({
    tooltips, getState, getRenderer: () => controls.renderer ?? null,
    isBlocked: () => buildMode.on || layer.classList.contains('title-mode'),
  });
  const callGrid = createCallGrid({ layer, openStaff: (id) => menu.open('staff', { staffId: id }) });
  const announcer = createAnnouncer({ layer, sfx, openMenu: (id, arg) => menu.open(id, arg) });

  // Progressive unlocks. A state without unlocks (the v1 sim) shows every menu.
  const UNLOCK_HOST = { meaning: 'staff', marketing: 'marketing', ops: 'ops', models: 'models', automation: 'automation', research: 'build', paths: 'staff', standups: 'policies' };
  const hostOf = (key) => UNLOCK_HOST[key] ?? (key.startsWith('policy.') ? 'policies' : null);
  const newMenus = new Set();
  let menuSig = null;
  function syncMenus(state, animate = false) {
    const u = state.unlocks;
    const policiesIn = !!u && Object.keys(u).some((k) => k.startsWith('policy.') || k === 'standups');
    const sig = u ? Object.keys(u).sort().join() : 'all';
    if (sig === menuSig) return;
    menuSig = sig;
    for (const id of ['marketing', 'ops', 'models']) menu.setVisible(id, !u || u[id] != null, { animate });
    // Policies and Automation each get their own button once their first unlock arrives.
    menu.setVisible('policies', !u || policiesIn, { animate });
    menu.setVisible('automation', !u || u.automation != null, { animate });
  }
  // One tick's unlocks and era arrive together (both are immediate events). An era card lists the
  // unlocks that came with it; several unlocks without an era share one card; a lone one gets its own.
  function onUnlocksAndEra(keys, era, state) {
    if (keys.length) syncMenus(state, true);
    const items = keys.map((key) => {
      const host = hostOf(key);
      if (host && menu.current !== host) { newMenus.add(host); menu.setNew(host, true); }
      const label = host ? (MENU.find((m) => m.id === host)?.label ?? host) : null;
      return { key, menuId: host, menuLabel: label };
    });
    // Meaning always gets its own reveal card, after the era card when they arrive together.
    const revealMeaning = keys.includes('meaning') || (era?.eraId === 'chatgbt' && !SIM_HAS_MEANING_UNLOCK);
    if (era) {
      const d = state.pendingDecision;
      const own = d && d.eventId === `era_${era.eraId}` ? d.title : null;
      announcer.era(era.eraId, state.week, own, keys.filter((k) => k !== 'meaning'));
      if (revealMeaning) { if (menu.current !== 'staff') { newMenus.add('staff'); menu.setNew('staff', true); } announcer.unlock('meaning', 'staff', 'Staff'); }
    } else if (items.length === 1) announcer.unlock(items[0].key, items[0].menuId, items[0].menuLabel);
    else if (items.length > 1) announcer.unlocks(items);
  }

  const REWARD_TEXT = {
    finger_traps: (n) => `${n} won a Chinese finger trap. It is still on their finger.`,
    balloons: (n) => `${n} found balloons tied to their chair. Nobody will say who did it.`,
    melon_bar: (n) => `${n} earned a melon bar. It is exactly what it sounds like.`,
    music_night: (n, c) => `${c} had a music night. Someone brought a keytar.`,
    caricature: (n) => `${n} got a framed caricature. The nose is generous.`,
    waffle_party: (n, c) => `${c} threw a Waffle Party. Output dipped for an afternoon; nobody minded.`,
  };

  function goalsModal() {
    const s = getState();
    const list = GOALS.filter((g) => s.goals?.[g.id]);
    let group = null;
    const body = h('div.goallist', null, ...list.flatMap((g) => {
      const st = s.goals[g.id];
      const head = g.group && g.group !== group ? h('div.ggroup', { text: (group = g.group) }) : null;
      const reward = goalReward(g);
      const wk = st.done && st.week != null ? dateOf(st.week) : null;
      return [head, h(`div.goal${st.done ? '.done' : ''}`, null, h('span.gbox'),
        h('div', null, h('b', { text: g.name }), h('div.small.muted', { text: g.desc ?? '' }), reward ? h('div.small', { text: `Reward: ${reward}` }) : null),
        wk ? h('span.gwk', { text: `${wk.year} Q${wk.quarter}` }) : null)].filter(Boolean);
    }));
    ctx.openModal({ title: `Goals (${list.filter((g) => s.goals[g.id].done).length}/${list.length})`, iconName: 'star', body, cls: 'small' });
  }
  ui.openGoals = goalsModal;
  ctx.build = buildMode;
  ctx.isBusy = () => isBusy();

  const popups = createPopups({ layer, ctx, toasts, restoreDock: () => toasts.setDock(menu.current ? menu.dockEl : null) });
  const gameover = createGameOver({ layer, controls, sfx, act });
  const tutorial = createTutorial({ layer, sfx, controls, ui });
  const settings = createSettings({ layer, controls, sfx });
  ui.openSettings = () => settings.open();
  const title = createTitle({
    layer, controls, sfx,
    toast: (text, tone) => toasts.push(text, tone),
    openSettings: () => settings.open(),
    onStart: ({ fresh }) => {
      title.hide();
      const speed = settings.values.speed ?? 1;
      // A first game waits, paused, while the coach marks are up.
      if (fresh && !tutorialDone()) { controls.setSpeed(0); setTimeout(() => tutorial.start(false, speed), 600); }
      else if (!fresh) setTimeout(() => openRecap(ctx), 400);
      else controls.setSpeed(speed);
    },
  });

  // Overlays take keys in stacking order: settings, title, tutorial, popups, game over.
  ui.modalKey = (e) => {
    if (ctx.modal) { if (e.key === 'Escape') ctx.modal.close(); e.preventDefault(); return true; }
    if (settings.isOpen) { if (e.key === 'Escape') settings.close(); e.preventDefault(); return true; }
    if (title.isOpen) return true;
    if (chat.onKey(e)) return true;
    if (tutorial.onKey(e)) return true;
    if (popups.onKey(e)) return true;
    if (gameover.open) { e.preventDefault(); return true; }
    return false;
  };

  // Toasts paint above panels and the modal backdrop.
  layer.append(toasts.el);

  function onKey(e) {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (!ctx.modal && announcer.onKey(e)) return;
    if (ui.modalKey?.(e)) return;
    if (buildMode.onKey(e)) return;
    if (e.key === 'Escape') { if (menu.close()) e.preventDefault(); return; }
    if (e.code === 'Space') { e.preventDefault(); ui.togglePause(); return; }
    if (e.key === '1') return ui.setSpeed(1);
    if (e.key === '2') return ui.setSpeed(2);
    if (e.key === '3') return ui.setSpeed(4);
    if (e.key === 'c' || e.key === 'C') return chat.toggle();
    const m = MENU.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (m) { e.preventDefault(); buildMode.exit(); menu.toggle(m.id); }
  }
  addEventListener('keydown', onKey);


  const launchScores = new Map(); // last seen review score per product, to spot notable updates

  // Per-person meaning samples, one per week, for the staff sparkline. UI-side only.
  let loggedWeek = -1;
  let loggedState = null;
  function logMeaning(state) {
    // A new or loaded game is a new state object whose staff ids restart, so drop old samples.
    if (state !== loggedState) {
      loggedState = state; ctx.meaningLog.clear(); loggedWeek = -1; chat.reset(state);
      announcer.reset(); buildMode.exit(); menuSig = null;
      for (const id of newMenus) menu.setNew(id, false);
      newMenus.clear();
      launchScores.clear();
      for (const p of state.products) launchScores.set(p.id, p.score);
    }
    if (state.week === loggedWeek) return;
    loggedWeek = state.week;
    const log = ctx.meaningLog;
    for (const p of state.staff) {
      let arr = log.get(p.id);
      if (!arr) log.set(p.id, (arr = []));
      arr.push(p.meaning);
      if (arr.length > 52) arr.shift();
    }
    if (log.size > state.staff.length + 20) {
      const ids = new Set(state.staff.map((p) => p.id));
      for (const id of log.keys()) if (!ids.has(id)) log.delete(id);
    }
  }

  // New office items: when the stage, the first award, or the era opens items up, announce them.
  // A different state object (a new game or a load) resets the baseline without announcing.
  let itemsState = null, itemsSig = null, itemsSeen = null;
  function checkNewItems(state) {
    if (state !== itemsState) { itemsState = state; itemsSig = null; itemsSeen = null; }
    const sig = `${state.office?.stage ?? state.officeStage ?? 0}|${(state.stats?.awards ?? 0) > 0}|${state.era?.id}`;
    if (sig === itemsSig) return;
    itemsSig = sig;
    const now = availableItems(state);
    const fresh = itemsSeen ? now.filter((id) => !itemsSeen.has(id)) : [];
    itemsSeen = new Set(now);
    if (fresh.length) announcer.items(fresh);
  }

  let lastPanelAt = 0;
  function update(state) {
    checkNewItems(state);
    toasts.setWeek(state.week);
    hud.update(state);
    gameover.update(state);
    popups.update(state);
    buildMode.update(state);
    syncMenus(state);
    callGrid.update(state, !!(menu.current || ctx.modal || buildMode.on || announcer.open || popups.open || gameover.open));
    tutorial.setHeld(!!(menu.current || ctx.modal || buildMode.on || announcer.open || popups.open || settings.isOpen));
    logMeaning(state);
    const now = performance.now();
    if (now - lastPanelAt >= PANEL_REFRESH_MS) {
      lastPanelAt = now;
      menu.update(state);
      chat.update(state);
      menu.setBadge('staff', state.staff.filter((p) => p.mood === 'burnout' || p.pathPending).length);
      menu.setBadge('ops', state.outage ? 1 : 0);
      menu.setAlarm('ops', !!state.outage);
    }
  }

  function handleEvents(events, state) {
    const unlockKeys = events.filter((e) => e.type === 'unlock').map((e) => e.key);
    const era = events.find((e) => e.type === 'era') ?? null;
    if (unlockKeys.length || era) onUnlocksAndEra(unlockKeys, era, state);
    for (const e of events) {
      switch (e.type) {
        case 'toast': {
          // "X is ready to choose a career path." opens the path picker when clicked.
          const who = /ready to choose a career path/.test(e.text) ? state.staff.find((p) => p.pathPending && e.text.startsWith(p.name)) : null;
          // A new market trend's toast also says what it does to products.
          const trend = e.trendId ?? (/^Trend: /.test(e.text) ? state.market?.trend : null);
          const text = trend && trend !== 'steady' ? `${e.text} ${trendSummary(trend)}` : e.text;
          toasts.push(text, e.tone, who ? { action: () => menu.open('staff', { staffId: who.id, pickPath: true }) } : undefined);
          break;
        }
        case 'chat': chat.add(e, state.week); break;
        case 'say': callGrid.say(e, state); break;
        case 'hire': {
          const p = state.staff.find((s) => s.id === e.staffId);
          if (p) toasts.push(`${p.name} joined the team!`, 'good');
          break;
        }
        case 'incident': {
          const p = state.products.find((x) => x.id === e.productId);
          toasts.push(e.caught ? `An overseer caught an incident${p ? ` on ${p.name}` : ''}!` : `Incident${p ? ` on ${p.name}` : ''} (SEV${6 - e.severity})`, e.caught ? 'good' : 'bad');
          break;
        }
        case 'award': toasts.push(e.text, 'good', { always: true, glyph: 'award' }); break;
        case 'launch': {
          // New products always get the launch popup; updates only when the score moved noticeably.
          const p = state.products.find((x) => x.id === e.productId);
          const prev = launchScores.get(e.productId);
          if (p) launchScores.set(e.productId, p.score);
          if (!p || p.version <= 1 || prev === undefined || Math.abs(p.score - prev) > 0.5) popups.queueLaunch(e.productId);
          break;
        }
        case 'goal': {
          const g = GOAL[e.goalId];
          if (e.goalId === 'ten_years') {
            const o = retireOptions(state);
            announcer.milestone({
              title: 'Ten years in!', text: `${state.companyName} is ten. There was cake, a slideshow nobody asked for, and a toast to the first desk in the garage.`,
              lines: ['From now on you can retire: take the company public or accept an acquisition, whenever one is on the table.',
                o.ipo?.ok ? 'An IPO is available right now.' : `An IPO still ${(o.ipo?.reason ?? 'needs more growth').replace(/^Needs/, 'needs')}.`,
                'Or keep building: the twentieth anniversary is the finish line.'],
              action: o.any ? { label: 'Open Reports', run: () => menu.open('reports') } : null,
            });
          }
          const reward = goalReward(g);
          toasts.push(`Goal complete: ${g?.name ?? e.goalId}${reward ? ` (${reward})` : ''}`, 'good', { action: () => goalsModal() });
          sfx('coin');
          break;
        }
        case 'incentive': {
          // Incentives Program moments: the small rungs toast, the Waffle Party gets a card.
          const who = state.staff.find((p) => p.id === e.staffId);
          const text = REWARD_TEXT[e.reward]?.(who?.name?.split(' ')[0] ?? 'Someone', state.companyName) ?? 'A little reward went out.';
          // The sim toasts each reward itself; only the top rung gets a card here.
          if (e.reward === 'waffle_party') announcer.milestone({ title: 'The Waffle Party', text, lines: [], kicker: 'Incentives' });
          sfx('coin');
          break;
        }
        case 'officeUpgrade': toasts.push('Moved into a bigger office!', 'good'); break;
        default: break;
      }
    }
  }

  // True while the player is busy in a menu, so main.js holds time. Not the title screen, and
  // not the decision popup (the sim already waits for decisions).
  function isBusy() {
    if (settings.values.pauseMenus === false) return false;
    return !!(menu.current || ctx.modal || buildMode.on || announcer.open || popups.launchOpen || settings.isOpen || tutorial.open || chat.maximized);
  }
  ui.isBusy = isBusy;

  const api = {
    isBusy,
    update,
    handleEvents,
    showTitle() { menu.close(); title.show(); },
    hideTitle() { title.hide(); },
    openStaff: (id) => menu.open('staff', { staffId: id }),
    openSettings: () => settings.open(),
    startTutorial: () => tutorial.start(true),
    build: buildMode,
    openGoals: () => goalsModal(),
    openRecap: () => openRecap(ctx),
  };
  // Test hooks: ?title=1 shows the title screen and ?tutorial=1 runs the coach marks.
  const q = new URLSearchParams(location.search);
  if (q.has('title')) api.showTitle();
  if (q.has('tutorial')) setTimeout(() => tutorial.start(true), 300);
  if (q.has('icons')) import('./iconboard.js').then((m) => m.showIconBoard(layer));
  if (import.meta.env?.DEV) window.__HITL_UI = api;
  return api;
}
