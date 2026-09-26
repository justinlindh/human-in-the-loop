import { phoneLayout, touchUI } from './media.js';
import { setTip } from './tooltip.js';
import { h, setText, toggleClass, dateOf, clear } from './dom.js';
import { icon, reactionIcon } from './icons.js';
import { portraitImg } from './widgets.js';
import { CHAT_CHANNELS } from '../contract/events.js';
import { loadSettings, saveSetting, YAK_LEVELS, yakLevel, setYakLevel } from './settings.js';
import { createPromptView } from './chatPrompts.js';
import { createPostBar } from './yakPosts.js';
import { memeView, createMemeBox } from './memes.js';

const CHANNELS = CHAT_CHANNELS;
const MAX_PER_CHANNEL = 60;
const QUIET_WEEKS = 6;
// Sizes: the feed's height and the panel's width, in em. A dragged height overrides the preset's.
const SIZES = { small: { h: 12, w: null }, medium: { h: 20, w: 24 }, large: { h: 30, w: 30 } }; // small keeps the layout's width
const MIN_H = 6, MAX_H = 44;
// Messages that still count as new at the Important level: incidents, wins, and bot posts
// (launches, pages, awards, news), or anything the sim marks important.
const important = (m) => m.important === true || m.channel === 'incidents' || m.channel === 'wins' || (!m.fromId && String(m.from).startsWith('@'));
const LEVEL_ICON = { all: 'sound.on', important: 'star', off: 'sound.off' };
const BOT_ICON = {
  '@pagerbot': 'bot.pager', '@vendorbot': 'bot.vendor', '@launchbot': 'bot.launch', '@shipbot': 'bot.launch', '@hr-bot': 'bot.hr',
  '@saasies': 'bot.awards', '@officebot': 'bot.office', '@hackerspewsbot': 'bot.hn', '@newsbot': 'bot.news', '@buildbot': 'bot.build',
};

// Yak: the office's team chat. Channels with unread badges, threads, reactions, and names you
// can click to find the person. Messages stay bounded per channel in memory and in the DOM.
export function createChat(root, { getState, onName, onMaximize, onAnswer, onPost } = {}) {
  const store = Object.fromEntries(CHANNELS.map((c) => [c, []]));
  const unread = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
  let current = 'general';
  let collapsed = false;
  let lastGeneralWeek = null;

  const totalBadge = h('span.count');
  // An open reply prompt, flagged on the header while Yak is collapsed. Tapping it goes to the
  // prompt: in the big view on touch screens, where the small Yak is too cramped to read one.
  const replyMark = h('button.ymark', { type: 'button', text: 'Reply', 'aria-label': 'Go to the reply prompt', onclick: (e) => { e.stopPropagation(); showPrompt(); } });
  const caret = h('span.caret', null, icon('caret.down'));
  // Size controls sit in the header; their clicks do not collapse the panel.
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const sizeBtns = Object.keys(SIZES).map((k) => h('button.ysz', { title: `${k[0].toUpperCase()}${k.slice(1)} Yak`, 'aria-label': `${k} size`, onclick: stop(() => setSize(k, null)) }, k[0].toUpperCase()));
  const maxBtn = h('button.ysz.ymax', { title: 'Open Yak big', 'aria-label': 'Maximize Yak', onclick: stop(() => setMax(!maximized)) }, icon('expand', { size: 13 }));
  let level = yakLevel();
  const levelBtn = h('button.ysz.ylevel', { type: 'button', onclick: stop(() => setYakLevel(YAK_LEVELS[(YAK_LEVELS.findIndex((l) => l.v === level) + 1) % YAK_LEVELS.length].v)) });
  const head = h('div.chat-head', { title: touchUI() ? 'Yak' : 'Yak (C)', onclick: () => { if (!maximized) toggle(); } },
    h('span.slogo', null, icon('brand.yak', { size: 18 })), h('b.sbrand', { text: 'Yak' }), replyMark, totalBadge,
    h('span.ysizes', null, levelBtn, ...sizeBtns, maxBtn), caret);
  // Drag the top edge to set any height between MIN_H and MAX_H.
  const grip = h('div.ygrip', { title: 'Drag to resize', 'aria-hidden': 'true' });

  const tabBtns = {};
  const tabBadges = {};
  const tabsEl = h('div.chat-tabs', null, ...CHANNELS.map((c) => {
    tabBadges[c] = h('span.cbadge');
    tabBtns[c] = h('button.ctab', { onclick: () => select(c) }, `#${c}`, tabBadges[c]);
    return tabBtns[c];
  }));
  const quiet = h('div.chat-quiet.banner');
  const list = h('div.chat-body');
  const el = h('div.chat.yak', { dataset: { occludes: '' } }, grip, head, tabsEl, quiet, list);
  const prompts = createPromptView({ list, onAnswer });
  // The founder's quick posts: a successful one shows its channel, scrolled to the new post.
  const posts = createPostBar({ layer: root.closest('.hitl') ?? root, getState, onPost: (o) => {
    const res = onPost?.(o.id) ?? { ok: false };
    if (res.ok) { select(CHANNELS.includes(o.channel) ? o.channel : 'general'); list.scrollTop = list.scrollHeight; }
    return res;
  } });
  el.append(posts.bar);
  head.insertBefore(posts.headBtn, head.querySelector('.ysizes'));
  root.append(el);

  const memeBox = createMemeBox(root.closest('.hitl') ?? root);
  const saved = loadSettings();
  let size = SIZES[saved.yakSize] ? saved.yakSize : 'small';
  let height = Number.isFinite(saved.yakHeight) ? saved.yakHeight : null;
  let maximized = false;
  const layerEl = () => root.closest('.hitl') ?? root;
  function applySize() {
    const sz = SIZES[size];
    const hgt = Math.max(MIN_H, Math.min(MAX_H, height ?? sz.h));
    if (sz.w) layerEl().style.setProperty('--yak-w', `${sz.w}em`); else layerEl().style.removeProperty('--yak-w');
    el.style.setProperty('--yak-h', `${hgt}em`);
    sizeBtns.forEach((b, i) => toggleClass(b, 'on', Object.keys(SIZES)[i] === size && height === null));
  }
  function setSize(k, hgt) {
    size = k; height = hgt;
    saveSetting('yakSize', size);
    saveSetting('yakHeight', height);
    applySize();
    if (collapsed) toggle(false);
  }
  grip.addEventListener('pointerdown', (e) => {
    if (maximized || collapsed) return;
    e.preventDefault();
    grip.setPointerCapture?.(e.pointerId);
    const em = parseFloat(getComputedStyle(list).fontSize) || 16;
    const startY = e.clientY, startH = list.getBoundingClientRect().height / em;
    const move = (ev) => { height = Math.max(MIN_H, Math.min(MAX_H, startH + (startY - ev.clientY) / em)); applySize(); };
    const up = () => { grip.removeEventListener('pointermove', move); saveSetting('yakHeight', Math.round(height * 10) / 10); };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once: true });
    grip.addEventListener('pointercancel', up, { once: true });
  });

  // Maximized: the panel moves into a large overlay, and time holds like any open panel.
  const back = h('div.yak-back', { onpointerdown: (e) => { if (e.target === back) setMax(false); } });
  // An empty cell holds Yak's place in the bottom row, so the menu does not shift under the overlay.
  const slot = h('div.yak-slot');
  function setMax(on) {
    if (on === maximized) return;
    maximized = on;
    if (on) {
      if (collapsed) toggle(false);
      el.replaceWith(slot);
      back.append(el);
      layerEl().append(back);
    } else {
      back.remove();
      slot.replaceWith(el);
    }
    el.classList.toggle('max', on);
    maxBtn.replaceChildren(icon(on ? 'close' : 'expand', { size: 13 }));
    setTip(maxBtn, on ? 'Back to the corner' : 'Open Yak big');
    list.scrollTop = list.scrollHeight;
    onMaximize?.(on);
  }

  function avatar(m) {
    if (m.from?.startsWith('@')) return h('span.av.bot', null, icon(BOT_ICON[m.from] ?? 'bot.generic', { size: 13 }));
    const p = m.fromId ? getState?.().staff.find((x) => x.id === m.fromId) : null;
    if (p) return portraitImg(p, 44);
    return h('span.av.gone', { text: (m.from ?? '?').slice(0, 1) });
  }

  // "@channel" and "@here" render as mention pills; the rest stays plain text.
  function withMentions(text) {
    const parts = String(text ?? '').split(/(@channel|@here)\b/);
    return parts.map((t, i) => (i % 2 ? h('span.mention', { text: t }) : t)).filter((x) => x !== '');
  }

  function node(m) {
    const bot = m.from?.startsWith('@');
    const name = h(`b.who${m.fromId ? '.link' : ''}`, { text: m.from, title: m.fromId ? 'Find them in the office' : '' });
    if (m.fromId) name.addEventListener('click', (e) => { e.stopPropagation(); onName?.(m.fromId); });
    const reacts = Object.entries(m.reactions ?? {}).filter(([, n]) => n > 0);
    return h(`div.msg${bot ? '.bot' : ''}${m.replyTo ? '.reply' : ''}`, { dataset: { id: m.id ?? '', root: m.replyTo ?? m.id ?? '' } },
      avatar(m),
      h('div.mcol', null,
        h('div.mline', null, name, m.week === null ? null : h('span.w.num', { text: `W${dateOf(m.week).week}` })),
        m.image ? (memeView(m.image, { onOpen: (im) => memeBox.open(im) }) ?? h('div.mtext', null, ...withMentions(m.text))) : h('div.mtext', null, ...withMentions(m.text)),
        reacts.length ? h('div.reacts', null, ...reacts.map(([emo, n]) => h('span.react', null, reactionIcon(emo) ? icon(reactionIcon(emo), { size: 12 }) : emo, h('b.num', { text: ` ${n}` })))) : null));
  }

  // Replies go after the last message of their thread so threads stay together.
  function place(m, n) {
    if (m.replyTo) {
      const thread = list.querySelectorAll(`.msg[data-root="${CSS.escape(m.replyTo)}"]`);
      const after = thread[thread.length - 1];
      if (after) { after.after(n); return; }
    }
    list.append(n);
  }

  function renderChannel() {
    clear(list);
    const msgs = store[current];
    if (!msgs.length) list.append(h('div.chat-quiet.empty', { text: current === 'general' ? 'Quiet in here. Chatter shows up once the week gets going.' : `Nothing in #${current} yet.` }));
    for (const m of msgs) place(m, node(m));
    prompts.attach();
    list.scrollTop = list.scrollHeight;
  }

  function refreshBadges() {
    let total = 0;
    for (const c of CHANNELS) {
      const n = unread[c];
      total += n;
      setText(tabBadges[c], n > 99 ? '99+' : n || '');
      toggleClass(tabBadges[c], 'show', n > 0);
      toggleClass(tabBtns[c], 'on', c === current);
    }
    if (level === 'off') { for (const c of CHANNELS) unread[c] = 0; total = 0; }
    setText(totalBadge, total > 99 ? '99+' : total || '');
    toggleClass(totalBadge, 'show', collapsed && total > 0);
  }

  function select(c) {
    current = c;
    unread[c] = 0;
    renderChannel();
    refreshBadges();
  }

  function showPrompt() {
    const p = prompts.open()[0];
    if (!p) return;
    select(CHANNELS.includes(p.channel) ? p.channel : 'general');
    if (phoneLayout() || touchUI()) setMax(true); else toggle(false);
    requestAnimationFrame(() => list.querySelector(`.yprompt[data-prompt="${CSS.escape(p.id)}"]`)?.scrollIntoView({ block: 'center' }));
  }

  function toggle(force) {
    collapsed = force ?? !collapsed;
    el.classList.toggle('collapsed', collapsed);
    caret.replaceChildren(icon(collapsed ? 'caret.right' : 'caret.down'));
    if (!collapsed) { unread[current] = 0; list.scrollTop = list.scrollHeight; }
    refreshBadges();
  }

  // Whether a new message raises an unread count at the current level.
  const counts = (m, channel) => level === 'all' || (level === 'important' && important({ ...m, channel }));
  function add(e, week, { quiet: silent = false } = {}) {
    if (e.type === 'say') return;
    const channel = CHANNELS.includes(e.channel) ? e.channel : 'general';
    const m = { important: e.important === true, image: e.image?.id ? { id: e.image.id, alt: e.image.alt ?? e.text ?? '' } : null, id: e.id ?? null, from: e.from ?? '?', fromId: e.fromId ?? null, text: e.text ?? '', replyTo: e.replyTo ?? null, reactions: e.reactions ?? {}, week };
    const msgs = store[channel];
    msgs.push(m);
    const dropped = msgs.length > MAX_PER_CHANNEL ? msgs.shift() : null;
    if (channel === 'general' && week !== null) lastGeneralWeek = week;
    if (channel === current) {
      list.querySelector('.chat-quiet.empty')?.remove();
      if (dropped) (dropped.id ? list.querySelector(`.msg[data-id="${CSS.escape(dropped.id)}"]`) : list.querySelector('.msg'))?.remove();
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
      place(m, node(m));
      prompts.attach();
      if (nearBottom) list.scrollTop = list.scrollHeight;
        if (collapsed && !silent && counts(m, channel)) unread[channel]++;
    } else if (!silent && counts(m, channel)) {
      unread[channel]++;
    }
    refreshBadges();
  }

  let quietText = '';
  let markSig = '';
  function update(s) {
    prompts.sync(s);
    posts.update(s);
    const open = prompts.open();
    const sig = `${collapsed ? 1 : 0}|${open.map((p) => p.channel).join(',')}`;
    if (sig !== markSig) {
      markSig = sig;
      toggleClass(replyMark, 'show', collapsed && open.length > 0);
      for (const c of CHANNELS) toggleClass(tabBtns[c], 'prompt', open.some((p) => (p.channel ?? 'general') === c));
    }
    const weeks = lastGeneralWeek === null ? 0 : s.week - lastGeneralWeek;
    const text = current === 'general' && weeks >= QUIET_WEEKS ? `It's been quiet in #general for ${weeks} weeks.` : '';
    if (text !== quietText) {
      quietText = text;
      setText(quiet, text);
      toggleClass(quiet, 'show', !!text);
    }
  }

  // A new or loaded game rebuilds the feed from the state's recent chat log.
  function reset(s) {
    for (const c of CHANNELS) { store[c] = []; unread[c] = 0; }
    lastGeneralWeek = null;
    renderChannel();
    // Spoken 'say' lines are office bubbles, never Yak messages.
    for (const e of s?.chatLog ?? []) if (e.type !== 'say') add(e, Number.isFinite(e.week) ? e.week : null, { quiet: true });
    refreshBadges();
  }

  function setLevel(v) {
    level = YAK_LEVELS.some((l) => l.v === v) ? v : 'all';
    const l = YAK_LEVELS.find((x) => x.v === level);
    levelBtn.replaceChildren(icon(LEVEL_ICON[level], { size: 13 }));
    levelBtn.dataset.level = level;
    setTip(levelBtn, `${l.tip}. Tap to change.`);
    levelBtn.setAttribute('aria-label', l.tip);
    el.classList.toggle('yak-off', level === 'off');
    if (level === 'off' && !maximized) toggle(true);
    refreshBadges();
  }
  window.addEventListener('hitl:yakLevel', (e) => setLevel(e.detail?.level));

  renderChannel();
  setLevel(level);
  refreshBadges();
  // On phones Yak starts collapsed so it does not cover the tray and the office; the header's
  // unread badge still counts new messages.
  if (phoneLayout()) toggle(true);
  applySize();
  return { add, toggle, update, reset, el, setMax, get maximized() { return maximized; },
    onKey(e) {
      if (e.key === 'Escape' && memeBox.close()) { e.preventDefault(); return true; }
      if (maximized && e.key === 'Escape') { e.preventDefault(); setMax(false); return true; }
      return false;
    } };
}
