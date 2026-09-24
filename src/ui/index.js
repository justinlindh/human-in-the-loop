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
import { createAnnouncer } from './announce.js';
import { GOALS, GOAL, goalReward } from './v2content.js';

// UI sound cues go out as window events so the audio lane needs no reference to the UI.
export function sfx(name) {
  window.dispatchEvent(new CustomEvent('hitl:sfx', { detail: name }));
}

const PANEL_REFRESH_MS = 150;

export function createUI({ root, getState, dispatch, controls }) {
  const layer = h('div.hitl');
  root.append(layer);

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

  const ctx = {
    getState,
    act,
    toast: (text, tone) => toasts.push(text, tone),
    open: (id, arg) => menu.open(id, arg),
    close: () => menu.close(),
    controls,
    sfx,
    meaningLog: new Map(),
    modal: null,
    // A simple modal card for panel-owned dialogs (career paths, training). Returns a close function.
    openModal({ title, iconName, body, cls = '' }) {
      ctx.modal?.close();
      const back = h('div.modal-back.generic');
      const dock = h('div.modal-dock');
      const close = () => {
        back.remove();
        if (ctx.modal?.back === back) { ctx.modal = null; toasts.setDock(menu.current ? menu.dockEl : null); }
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
  const announcer = createAnnouncer({ layer, sfx, openMenu: (id) => menu.open(id) });

  // Progressive unlocks. A state without unlocks (the v1 sim) shows every menu.
  const UNLOCK_HOST = { marketing: 'marketing', ops: 'ops', models: 'models', automation: 'automation', research: 'build', paths: 'staff', standups: 'automation' };
  const hostOf = (key) => UNLOCK_HOST[key] ?? (key.startsWith('policy.') ? 'automation' : null);
  const newMenus = new Set();
  let menuSig = null;
  function syncMenus(state, animate = false) {
    const u = state.unlocks;
    const policiesIn = !!u && Object.keys(u).some((k) => k.startsWith('policy.') || k === 'standups');
    const sig = u ? Object.keys(u).sort().join() : 'all';
    if (sig === menuSig) return;
    menuSig = sig;
    for (const id of ['marketing', 'ops', 'models']) menu.setVisible(id, !u || u[id] != null, { animate });
    menu.setVisible('automation', !u || u.automation != null || policiesIn, { animate });
    menu.setLabel('automation', !u || u.automation != null ? 'Automation' : 'Policies');
  }
  // One tick's unlocks and era arrive together (both are immediate events). An era card lists the
  // unlocks that came with it; several unlocks without an era share one card; a lone one gets its own.
  function onUnlocksAndEra(keys, era, state) {
    if (keys.length) syncMenus(state, true);
    const items = keys.map((key) => {
      const host = hostOf(key);
      if (host && menu.current !== host) { newMenus.add(host); menu.setNew(host, true); }
      const label = host ? (MENU.find((m) => m.id === host)?.label ?? host) : null;
      return { key, menuId: host, menuLabel: host === 'automation' && !state.unlocks?.automation ? 'Policies' : label };
    });
    if (era) {
      const d = state.pendingDecision;
      const own = d && d.eventId === `era_${era.eraId}` ? d.title : null;
      announcer.era(era.eraId, state.week, own, keys);
    } else if (items.length === 1) announcer.unlock(items[0].key, items[0].menuId, items[0].menuLabel);
    else if (items.length > 1) announcer.unlocks(items);
  }

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
  const gameover = createGameOver({ layer, controls, sfx });
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
      else controls.setSpeed(speed);
    },
  });

  // Overlays take keys in stacking order: settings, title, tutorial, popups, game over.
  ui.modalKey = (e) => {
    if (ctx.modal) { if (e.key === 'Escape') ctx.modal.close(); e.preventDefault(); return true; }
    if (settings.isOpen) { if (e.key === 'Escape') settings.close(); e.preventDefault(); return true; }
    if (title.isOpen) return true;
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
    if (announcer.onKey(e)) return;
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

  let lastPanelAt = 0;
  function update(state) {
    toasts.setWeek(state.week);
    hud.update(state);
    gameover.update(state);
    popups.update(state);
    buildMode.update(state);
    syncMenus(state);
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
          toasts.push(e.text, e.tone, who ? { action: () => menu.open('staff', { staffId: who.id, pickPath: true }) } : undefined);
          break;
        }
        case 'chat': chat.add(e, state.week); break;
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
        case 'award': toasts.push(e.text, 'good'); break;
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
          const reward = goalReward(g);
          toasts.push(`Goal complete: ${g?.name ?? e.goalId}${reward ? ` (${reward})` : ''}`, 'good', { action: () => goalsModal() });
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
    return !!(menu.current || ctx.modal || buildMode.on || announcer.open || popups.launchOpen || settings.isOpen || tutorial.open);
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
  };
  // Test hooks: ?title=1 shows the title screen and ?tutorial=1 runs the coach marks.
  const q = new URLSearchParams(location.search);
  if (q.has('title')) api.showTitle();
  if (q.has('tutorial')) setTimeout(() => tutorial.start(true), 300);
  if (q.has('icons')) import('./iconboard.js').then((m) => m.showIconBoard(layer));
  if (import.meta.env?.DEV) window.__HITL_UI = api;
  return api;
}
