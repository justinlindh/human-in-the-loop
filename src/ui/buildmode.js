// Build mode: place, rotate, and move furniture on the office grid.
// The renderer draws the ghost (setBuildMode) and maps the cursor to a tile (pickTile); this module
// owns the bar, the cursor tip, keys, and every dispatch. Without those renderer hooks the bar still
// works through "Place for me".
import { h, setText, toggleClass, fmtMoney } from './dom.js';
import { icon } from './icons.js';
import { CATALOG, isDesk } from './v2content.js';
import { checkPlace, adjacencyPreview, firstFit, footprint, itemAt, placedOf, rectOf } from './placement.js';
import { effectWords } from './panels/office.js';
import { confirmButton } from './widgets.js';

const CLICK_PX = 6;

export function createBuildMode({ layer, ctx, controls }) {
  const R = () => controls.renderer ?? controls.getRenderer?.() ?? null;
  let mode = null; // { itemId, rot, moveId }
  let hover = null; // { x, y }
  let lastSig = '';

  const nameEl = h('b.bname');
  const priceEl = h('span.pill.num');
  const sizeEl = h('span.pill.num');
  const statusEl = h('div.bstatus');
  const rotBtn = h('button.btn', { title: 'Rotate (R)', onclick: () => rotate() }, icon('refresh'), ' Rotate', h('span.key', { text: ' R' }));
  const autoBtn = h('button.btn.blue', { title: 'Put it in the first spot that fits', onclick: () => autoPlace() }, icon('dice'), ' Place for me');
  const doneBtn = h('button.btn.go', { title: 'Done (Esc)', onclick: () => exit() }, icon('check'), ' Done');
  const icoEl = h('span.iico');
  const bar = h('div.buildbar', null,
    icoEl,
    h('div.binfo', null, h('div.row', null, nameEl, priceEl, sizeEl), statusEl),
    h('span.spacer'), rotBtn, autoBtn, doneBtn);
  const tip = h('div.buildtip');
  bar.style.display = 'none';
  tip.style.display = 'none';
  layer.append(bar, tip);

  function syncRenderer() {
    const r = R();
    if (!r?.setBuildMode) return;
    if (!mode) { r.setBuildMode(null); return; }
    const m = mode;
    r.setBuildMode({
      itemId: m.itemId, rot: m.rot, moveId: m.moveId,
      validate: (x, y, rot = m.rot) => checkPlace(ctx.getState(), { itemId: m.itemId, x, y, rot, moveId: m.moveId }),
    });
  }

  function enter(itemId, { moveId = null, rot = 0 } = {}) {
    if (!CATALOG[itemId]) return;
    ctx.close();
    ctx.modal?.close();
    mode = { itemId, rot, moveId };
    hover = null;
    lastSig = '';
    const it = CATALOG[itemId];
    icoEl.replaceChildren(icon(`item.${itemId}`, { size: 30 }));
    setText(nameEl, moveId ? `Moving: ${it.name}` : it.name);
    priceEl.style.display = moveId ? 'none' : '';
    setText(priceEl, fmtMoney(it.costs?.[0] ?? 0));
    autoBtn.style.display = moveId ? 'none' : '';
    bar.style.display = '';
    layer.classList.add('building');
    syncRenderer();
    refresh();
    ctx.sfx('open');
  }

  function exit() {
    if (!mode) return false;
    mode = null;
    hover = null;
    bar.style.display = 'none';
    tip.style.display = 'none';
    layer.classList.remove('building');
    highlight(null);
    syncRenderer();
    ctx.sfx('close');
    return true;
  }

  function rotate() {
    if (!mode) return;
    mode.rot = (mode.rot + 1) % 4;
    syncRenderer();
    refresh();
    ctx.sfx('click');
  }

  function place(x, y) {
    const m = mode;
    const action = m.moveId ? { type: 'moveItem', id: m.moveId, x, y, rot: m.rot } : { type: 'placeItem', itemId: m.itemId, x, y, rot: m.rot };
    const res = ctx.act(action);
    if (!res.ok) return;
    ctx.sfx(m.moveId ? 'confirm' : 'coin');
    if (m.moveId) exit();
    else { lastSig = ''; syncRenderer(); refresh(); }
  }

  function autoPlace() {
    if (!mode) return;
    const spot = firstFit(ctx.getState(), mode.itemId, mode.rot) ?? [1, 2, 3].map((k) => firstFit(ctx.getState(), mode.itemId, (mode.rot + k) % 4)).find(Boolean);
    if (!spot) {
      const why = checkPlace(ctx.getState(), { itemId: mode.itemId, x: 0, y: 0, rot: mode.rot }).reason;
      ctx.toast(why === 'Not enough cash' ? why : 'No room for that here', 'warn');
      ctx.sfx('error');
      return;
    }
    mode.rot = spot.rot;
    place(spot.x, spot.y);
  }

  function statusFor(s) {
    const m = mode;
    const f = footprint(m.itemId, m.rot);
    setText(sizeEl, `${f.w}x${f.h}`);
    if (!hover) {
      const r = R();
      return { ok: null, text: r?.pickTile ? 'Point at the floor to place it. R rotates, Esc finishes.' : 'Use "Place for me" to drop it in the first spot that fits.' };
    }
    const chk = checkPlace(s, { itemId: m.itemId, x: hover.x, y: hover.y, rot: m.rot, moveId: m.moveId });
    if (!chk.ok) return { ok: false, text: chk.reason ?? 'Cannot place here' };
    const prev = adjacencyPreview(s, { itemId: m.itemId, x: hover.x, y: hover.y, rot: m.rot, moveId: m.moveId });
    return { ok: true, text: adjacencyWords(prev) || 'Click to place', ids: prev.gives?.ids ?? [] };
  }

  // Warm plates under the things the item would boost, when the renderer offers them.
  let litSig = '';
  function highlight(ids) {
    const sig = ids?.length ? ids.join() : '';
    if (sig === litSig) return;
    litSig = sig;
    R()?.highlightItems?.(sig ? ids : null);
  }

  // The tile the ghost is anchored at. The renderer centers big footprints on the cursor, so its
  // buildTarget is the placement corner; pickTile is the fallback.
  function anchorAt(clientX, clientY) {
    const r = R();
    const t = r?.buildTarget;
    if (t && Number.isFinite(t.x)) return { x: t.x, y: t.y };
    return r?.pickTile?.(clientX, clientY) ?? null;
  }

  function refresh() {
    if (!mode) return;
    const s = ctx.getState();
    const st = statusFor(s);
    setText(statusEl, st.text);
    toggleClass(statusEl, 'bad', st.ok === false);
    toggleClass(statusEl, 'good', st.ok === true);
    setText(tip, st.text);
    toggleClass(tip, 'bad', st.ok === false);
    tip.style.display = hover ? '' : 'none';
    highlight(st.ok ? st.ids : null);
  }

  // Pointer: a press and release that barely moved is a click; anything more is the camera pan.
  let down = null;
  let pendingMove = null;
  const scene = () => document.getElementById('scene');
  const onScene = (e) => e.target === scene();

  addEventListener('pointerdown', (e) => { if (onScene(e) && e.button === 0) down = { x: e.clientX, y: e.clientY }; }, true);
  addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || !onScene(e) || Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_PX) return;
    if (mode) {
      const at = anchorAt(e.clientX, e.clientY);
      if (at) place(at.x, at.y);
    } else inspect(e.clientX, e.clientY);
  }, true);
  addEventListener('pointermove', (e) => {
    if (!mode) return;
    tip.style.left = `${e.clientX - layer.getBoundingClientRect().left + 16}px`;
    tip.style.top = `${e.clientY - layer.getBoundingClientRect().top + 18}px`;
    if (pendingMove) { pendingMove = e; return; }
    pendingMove = e;
    requestAnimationFrame(() => {
      const ev = pendingMove;
      pendingMove = null;
      if (!mode) return;
      const tile = onScene(ev) ? anchorAt(ev.clientX, ev.clientY) : null;
      if ((tile?.x ?? -1) !== (hover?.x ?? -1) || (tile?.y ?? -1) !== (hover?.y ?? -1)) { hover = tile; refresh(); }
    });
  });

  // Clicking a placed item outside build mode opens its card: move, upgrade, sell.
  function inspect(clientX, clientY) {
    if (layer.classList.contains('title-mode')) return;
    const r = R();
    // A person under the cursor: tell the audio engine (a voice bark) and open them in Staff.
    const hit = r?.pick?.(clientX, clientY);
    if (hit?.kind === 'staff' && hit.id) {
      window.dispatchEvent(new CustomEvent('hitl:characterClick', { detail: { staffId: hit.id } }));
      if (!ctx.isBusy?.() || ctx.currentMenu?.() === 'staff') ctx.open('staff', { staffId: hit.id });
      return;
    }
    if (ctx.isBusy?.()) return;
    let id = r?.pickPlaced?.(clientX, clientY) ?? null;
    if (!id) {
      const tile = r?.pickTile?.(clientX, clientY);
      id = tile ? itemAt(ctx.getState(), tile.x, tile.y)?.id ?? null : null;
    }
    if (id) openItemCard(id);
  }

  function openItemCard(id) {
    const s = ctx.getState();
    const p = placedOf(s).find((q) => q.id === id);
    const it = p && CATALOG[p.itemId];
    if (!it) return;
    const lvl = p.level ?? 1;
    const nextCost = it.costs?.[lvl] ?? null;
    const spent = (it.costs ?? []).slice(0, lvl).reduce((a, b) => a + b, 0);
    let close = null;
    const up = nextCost == null ? null : h('button.btn.blue', {
      disabled: s.cash < nextCost, title: s.cash < nextCost ? 'Not enough cash' : '',
      onclick: () => { if (ctx.act({ type: 'upgradeItem', id }).ok) { ctx.sfx('coin'); close?.(); openItemCard(id); } },
    }, icon('update'), ` Upgrade ${fmtMoney(nextCost)}`);
    const adj = it.adjacency ? adjacencyPreview(s, { itemId: p.itemId, x: p.x, y: p.y, rot: p.rot, moveId: p.id }) : null;
    const r = rectOf(p);
    const body = h('div.col.itemcard', null,
      h('div.row', null, h('span.iico', null, icon(`item.${p.itemId}`, { size: 30 })),
        h('div.small.muted', { text: it.desc ?? '' })),
      it.costs?.length > 1 ? h('div.row', null, h('span.lvpips', { title: `Level ${lvl} of ${it.costs.length}` }, ...it.costs.map((_, i) => h(`i${i < lvl ? '.on' : ''}`))), h('b.small', { text: `Level ${lvl}` })) : null,
      it.effects?.[lvl - 1] && Object.keys(it.effects[lvl - 1]).length ? h('div.small', { text: `Now: ${effectWords(it.effects[lvl - 1])}` }) : null,
      nextCost != null && it.effects?.[lvl] ? h('div.small.muted', { text: `Next: ${effectWords(it.effects[lvl])}` }) : null,
      adj?.gives ? h('div.small', { text: adjacencyWords(adj) }) : null,
      isDesk(p.itemId) ? h('div.small.muted', { text: 'One person works here.' }) : null,
      h('div.small.muted', { text: `Takes ${r.w}x${r.h} tiles.` }),
      h('div.row.wrap', null,
        h('button.btn', { onclick: () => { close?.(); enter(p.itemId, { moveId: id, rot: p.rot ?? 0 }); } }, icon('migrate'), ' Move'),
        up,
        h('span.spacer'),
        confirmButton(`Sell ${fmtMoney(Math.floor(spent / 2))}`, 'Sell? Click again', 'bad', () => { if (ctx.act({ type: 'sellItem', id }).ok) { ctx.sfx('coin'); close?.(); } })));
    close = ctx.openModal({ title: it.name, iconName: 'menu.office', body, cls: 'small' });
  }

  return {
    get on() { return !!mode; },
    enter,
    exit,
    openItemCard,
    // Keys while building: R rotates, Esc finishes. Returns true when handled.
    onKey(e) {
      if (!mode) return false;
      if (e.key === 'Escape') { exit(); e.preventDefault(); return true; }
      if (e.key === 'r' || e.key === 'R') { rotate(); e.preventDefault(); return true; }
      return false;
    },
    update(s) {
      if (!mode) return;
      if (s.gameOver) { exit(); return; }
      const sig = `${s.cash >= (CATALOG[mode.itemId]?.costs?.[0] ?? 0)}|${placedOf(s).length}|${s.office?.stage}`;
      if (sig !== lastSig) { lastSig = sig; refresh(); }
    },
  };
}

const ADJ_LABEL = { novelty: 'freshness', staminaRecovery: 'stamina recovery', meaningRecovery: 'meaning recovery', uptimeFloor: 'minimum uptime', knowledgeGain: 'knowledge gain' };

// "Boosts 2 desks: +3% freshness" or, for a desk, "This desk gets +3% meaning recovery from a Plant".
export function adjacencyWords(prev) {
  if (prev.texts?.length) return prev.texts.join('. ');
  const parts = [];
  if (prev.gives) {
    const g = prev.gives;
    const val = g.key === 'uptimeFloor' ? `+${Math.round(g.value * 100)} pts` : `+${Math.round(g.value * 100)}%`;
    const label = ADJ_LABEL[g.key] ?? g.key;
    const empty = g.empty ? ` (${g.empty} empty until someone sits there)` : '';
    parts.push(g.count
      ? `Boosts ${g.count} ${g.to}${g.count === 1 ? '' : 's'} nearby: ${val} ${label}${empty}`
      : `No ${g.to}s within ${g.radius} tiles yet (${val} ${label} each)`);
  }
  if (prev.receives?.length) {
    const byKey = new Map();
    for (const r of prev.receives) byKey.set(r.key, (byKey.get(r.key) ?? 0) + r.value);
    parts.push(`This desk gets ${[...byKey].map(([k, v]) => `+${Math.round(v * 100)}% ${ADJ_LABEL[k] ?? k}`).join(', ')}`);
  }
  return parts.join('. ');
}
