// Every icon in the UI goes through icon(name). Names map to emoji stand-ins until the
// custom set in public/icons/ exists. ICONS also records where each icon appears and its
// display size in px at 1080p (the overlay scales sizes with the window).
import { CATEGORIES } from './content.js';
import { REACTION_GLYPH } from './tools/glyphs.js';

const I = (glyph, where, size = 16) => ({ glyph, where, size });

export const ICONS = {
  // bottom menu
  'menu.build': I('🔨', 'Bottom menu button', 30),
  'menu.staff': I('🧑‍💻', 'Bottom menu button', 30),
  'menu.marketing': I('📣', 'Bottom menu button', 30),
  'menu.models': I('🧠', 'Bottom menu button', 30),
  'menu.automation': I('🤖', 'Bottom menu button', 30),
  'menu.ops': I('🛡️', 'Bottom menu button', 30),
  'menu.office': I('🏢', 'Bottom menu button', 30),
  'menu.reports': I('📊', 'Bottom menu button', 30),
  // speed controls
  'speed.pause': I('❚❚', 'Top bar speed buttons', 16),
  'speed.play': I('▶', 'Top bar speed buttons', 16),
  'speed.fast': I('▶▶', 'Top bar speed buttons', 16),
  'speed.fastest': I('▶▶▶', 'Top bar speed buttons', 16),
  // arrows and glyphs
  'arrow.up': I('▲', 'MRR trend, active effects (green)', 12),
  'arrow.down': I('▼', 'MRR trend, active effects (red)', 12),
  'arrow.flat': I('•', 'MRR trend when flat', 12),
  'arrow.back': I('◀', 'Staff detail back button', 14),
  'caret.down': I('▾', 'Chat header, expanded', 12),
  'caret.right': I('▸', 'Chat header, collapsed', 12),
  'sort.up': I('▲', 'Staff table sorted column', 10),
  'sort.down': I('▼', 'Staff table sorted column', 10),
  close: I('✕', 'Panel close button, crew chip remove', 16),
  check: I('✔', 'Picked team member, active policy, compliant badge', 12),
  cross: I('✖', 'Non-compliant badge', 12),
  star: I('★', 'Combo fit stars (Build)', 14),
  lock: I('🔒', 'Locked category/angle/size/channel/model/policy', 18),
  idea: I('💡', 'Decision popup header, leadership ideas', 24),
  decision: I('🗳️', 'Decision popup header', 24),
  settings: I('⚙️', 'Settings: top bar gear, title button, settings header', 16),
  continue: I('💾', 'Title: Continue button', 18),
  gameover: I('🪦', 'Game over header when lost', 44),
  slot: I('🔲', 'Office: item slots chip', 12),
  research: I('🧰', 'Build: Internal tools tab', 16),
  path: I('🧭', 'Staff: career path badge and picker', 16),
  legend: I('🌟', 'Staff: Legend badge (level 20)', 14),
  'train.workshop': I('🛠️', 'Training program picker', 22),
  'train.conference': I('🎤', 'Training program picker', 22),
  'train.course': I('🎓', 'Training program picker', 22),
  'stat.features': I('🧱', 'Features and Building', 16),
  'stat.polish': I('🖌️', 'Polish and Craft', 16),
  'stat.reliability': I('🛡️', 'Reliability and Rigor', 16),
  'stat.novelty': I('💡', 'Freshness and Ideas', 16),
  'battery.low': I('🪫', 'Tired marker (stamina under 25), running-on-empty warnings', 14),
  'mic.off': I('🔇', 'Muted marker in the lockdown call grid', 14),
  home: I('🏠', 'Remote staff marker, video call grid', 14),
  'item.desk': I('🪑', 'Office build palette', 30),
  'item.meeting_table': I('🤝', 'Office build palette', 30),
  'item.whiteboard': I('📋', 'Office build palette', 30),
  'item.coffee_corner': I('☕', 'Office build palette', 30),
  'item.plant': I('🌱', 'Office build palette', 30),
  'item.bookshelf': I('📚', 'Office build palette', 30),
  'item.espresso': I('☕', 'Office shop item card', 30),
  'item.plant_wall': I('🪴', 'Office shop item card', 30),
  'item.nap_pod': I('🛌', 'Office shop item card', 30),
  'item.arcade': I('🕹️', 'Office shop item card', 30),
  'item.standing_desk': I('🧍', 'Office shop item card', 30),
  'item.whiteboard_wall': I('📝', 'Office shop item card', 30),
  'item.library': I('📚', 'Office shop item card', 30),
  'item.monitoring_wall': I('🖥️', 'Office shop item card', 30),
  'item.server_rack': I('🗄️', 'Office shop item card', 30),
  'item.trophy_case': I('🏆', 'Office shop item card', 30),
  'research.eval_harness': I('🧪', 'Internal tools card', 26),
  'research.agent_sandbox': I('📦', 'Internal tools card', 26),
  'research.observability': I('🔭', 'Internal tools card', 26),
  'research.ci_cd': I('🔁', 'Internal tools card', 26),
  'research.design_system': I('🧩', 'Internal tools card', 26),
  'research.docs_culture': I('📖', 'Internal tools card', 26),
  'research.onboarding_kit': I('🧭', 'Internal tools card', 26),
  'research.red_team_suite': I('🥷', 'Internal tools card', 26),
  'bot.pager': I('🚨', 'Slackk avatar for @pagerbot', 13),
  'bot.vendor': I('🧠', 'Slackk avatar for @vendorbot', 13),
  'bot.launch': I('🚀', 'Slackk avatar for @launchbot and @shipbot', 13),
  'bot.hr': I('🎉', 'Slackk avatar for @hr-bot', 13),
  'bot.awards': I('🏆', 'Slackk avatar for @saasies', 13),
  'bot.office': I('🏢', 'Slackk avatar for @officebot', 13),
  'bot.hn': I('🟧', 'Slackk avatar for @hackernewsbot', 13),
  'bot.generic': I('🤖', 'Slackk avatar for other bots', 13),
  hourglass: I('⏳', 'Decision choices with delayed effects, active effects list', 14),
  warn: I('⚠️', 'Warnings: compliance, hype ahead of quality', 14),
  // toasts
  'toast.info': I('💬', 'Toast, info tone', 18),
  'toast.good': I('✨', 'Toast, good tone', 18),
  'toast.warn': I('⚠️', 'Toast, warn tone (failed actions)', 18),
  'toast.bad': I('🔥', 'Toast, bad tone', 18),
  // left tray
  'tray.outage': I('🚨', 'Tray outage alert card', 16),
  'tray.project': I('🔨', 'Tray project progress card', 16),
  'tray.trend': I('📡', 'Tray market trend card', 16),
  'tray.effects': I('🌀', 'Tray active effects card header', 16),
  // moods
  'mood.ok': I('😊', 'Staff table, team picker, top bar', 16),
  'mood.coasting': I('😐', 'Staff table, team picker, top bar', 16),
  'mood.burnout': I('😵', 'Staff table, team picker', 16),
  'mood.away': I('🏖️', 'Staff table (on sabbatical)', 16),
  // sizes
  'size.small': I('🧁', 'Build size picker', 20),
  'size.medium': I('🎂', 'Build size picker', 20),
  'size.large': I('🏰', 'Build size picker', 20),
  // actions and concepts
  new: I('✨', 'Build tab: New Product', 16),
  project: I('🔨', 'Build tab: Projects, assignment text', 16),
  dice: I('🎲', 'Build: Suggest name button', 14),
  launch: I('🚀', 'Build: Start building button', 18),
  agentic: I('🤖', 'Agentic angle tag, AI copy pill, automation cost', 14),
  compliance: I('📜', 'Compliance-heavy category tag', 14),
  update: I('⬆️', 'Build: Update a product card', 16),
  migrate: I('🔁', 'Build and Models: migration', 16),
  refactor: I('🧹', 'Build: Refactor card', 16),
  craft: I('🪵', 'Build: Craft project card', 16),
  mentor: I('🎓', 'Staff: mentoring action, juniors mentored chip', 16),
  hardProblem: I('🧩', 'Staff: hard problem action', 16),
  oversight: I('👀', 'Staff and Automation: oversight', 16),
  sabbatical: I('🏖️', 'Staff: sabbatical action and assignment', 16),
  training: I('📚', 'Staff: training action', 16),
  letgo: I('👋', 'Staff: let go action', 16),
  team: I('👥', 'Staff: seats summary chip', 14),
  seat: I('🪑', 'Hire: seats chip', 14),
  refresh: I('🔄', 'Hire: next candidates chip', 14),
  hire: I('📨', 'Staff: Hire tab and button', 16),
  office: I('🏢', 'Hire: need more seats button, Office panel', 16),
  money: I('💵', 'Costs: models, automation, policies', 14),
  debt: I('🧠', 'Comprehension debt readouts', 14),
  pair: I('🤝', 'AI as Pair policy note', 14),
  policy: I('📜', 'Automation: Policies tab', 16),
  product: I('📦', 'Models: products using a model', 12),
  selfhost: I('🖥️', 'Models: self-hosted badge', 14),
  hype: I('🔥', 'Marketing: hype per week', 12),
  brand: I('💜', 'Marketing: brand per week', 12),
  wrapper: I('🌯', 'Marketing: "just a wrapper" warning', 16),
  marketer: I('📣', 'Marketing: marketers boosting', 14),
  humanCopy: I('✍️', 'Marketing: human-written copy', 14),
  clock: I('⏱', 'Marketing: campaign duration', 12),
  award: I('🏆', 'Award toasts', 18),
  security: I('🛡️', 'Ops: security posture', 16),
  audit: I('🔍', 'Ops: audit button', 16),
  consultants: I('🧑‍🚒', 'Ops: call consultants', 16),
  incident: I('🚨', 'Ops: incident log', 16),
  caught: I('🥅', 'Ops: incident caught by overseer', 14),
  rent: I('🧾', 'Office: rent', 14),
  chart: I('📈', 'Reports: charts', 16),
  // automation functions
  'fn.engineering': I('⌨️', 'Automation row', 20),
  'fn.support': I('🎧', 'Automation row', 20),
  'fn.sales': I('💼', 'Automation row', 20),
  'fn.marketing': I('✍️', 'Automation row', 20),
  'fn.qa': I('🧪', 'Automation row', 20),
  'fn.ops': I('🖥️', 'Automation row', 20),
  // marketing channels
  'channel.launch': I('🚀', 'Marketing channel card', 20),
  'channel.content': I('✍️', 'Marketing channel card', 20),
  'channel.producthunt': I('🐱', 'Marketing channel card', 20),
  'channel.community': I('💬', 'Marketing channel card', 20),
  'channel.ads': I('📣', 'Marketing channel card', 20),
  'channel.influencer': I('🤳', 'Marketing channel card', 20),
  'channel.conference': I('🎪', 'Marketing channel card', 20),
  'channel.enterprise': I('💼', 'Marketing channel card', 20),
};

// Slackk reactions: the sim sends emoji; each maps to a glyph name.
for (const [emo, name] of Object.entries(REACTION_GLYPH)) ICONS[name] = I(/^[a-z_]+$/.test(emo) ? '🚫' : emo, 'Slackk reaction pill', 12);
export const reactionIcon = (emo) => REACTION_GLYPH[emo] ?? null;

// Category icons come from the content data's stand-in emoji.
for (const c of CATEGORIES) ICONS[`cat.${c.id}`] = I(c.icon ?? '📦', 'Build category tile', 22);

const warned = new Set();

// Art from public/icons: manifest.json lists the sub-manifests to merge (glyphs, objects), each
// mapping an icon name to { file, size }. Until they load, and for names they do not cover,
// icon() shows the emoji stand-in; loading upgrades icons already on screen.
const ART = new Map();
const BASE = `${import.meta.env?.BASE_URL ?? '/'}icons/`;
let artReady = false;

async function loadManifests() {
  try {
    const root = await (await fetch(`${BASE}manifest.json`)).json();
    for (const inc of root.include ?? []) {
      const m = await (await fetch(`${BASE}${inc}`)).json();
      for (const [name, entry] of Object.entries(m)) ART.set(name, entry);
    }
    for (const [name, entry] of Object.entries(root.icons ?? {})) ART.set(name, entry);
  } catch {
    return;
  }
  artReady = true;
  for (const el of document.querySelectorAll('.ic[data-icon]:not([data-art])')) fill(el, el.dataset.icon);
  window.dispatchEvent(new CustomEvent('hitl:icons'));
}
if (typeof window !== 'undefined' && typeof fetch === 'function') loadManifests();

const SVGNS = 'http://www.w3.org/2000/svg';

// Inner markup of each glyph file, fetched once; icons drawn before it arrives are refilled.
const svgText = new Map();
const svgLoading = new Set();
function loadSvg(file) {
  if (svgLoading.has(file) || typeof fetch !== 'function') return;
  svgLoading.add(file);
  fetch(`${BASE}${file}`).then((r) => r.text()).then((txt) => {
    const m = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(txt);
    if (!m) return;
    svgText.set(file, m[1].replace(/\sid="g"/, ''));
    for (const el of document.querySelectorAll('.ic[data-art]')) {
      if (ART.get(el.dataset.icon)?.file === file && el.querySelector('use')) fill(el, el.dataset.icon);
    }
  }).catch(() => {});
}

function fill(el, name) {
  const art = ART.get(name);
  if (!art) {
    el.textContent = ICONS[name]?.glyph ?? '❔';
    return;
  }
  el.dataset.art = '1';
  el.textContent = '';
  if (art.file.endsWith('.svg')) {
    // Glyphs are inlined: an external <use> whose currentColor changes (a speed button turning on
    // or off) can stop repainting in Chrome and show an empty box.
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const markup = svgText.get(art.file);
    if (markup) svg.innerHTML = markup;
    else {
      const use = document.createElementNS(SVGNS, 'use');
      use.setAttribute('href', `${BASE}${art.file}#g`);
      svg.append(use);
      loadSvg(art.file);
    }
    el.append(svg);
  } else {
    const img = document.createElement('img');
    img.src = `${BASE}${art.file}`;
    img.alt = '';
    img.draggable = false;
    el.append(img);
  }
}

export function icon(name, { size, title } = {}) {
  const def = ICONS[name];
  if (!def && !ART.has(name) && !warned.has(name)) {
    warned.add(name);
    if (!location.search.includes('snap')) console.warn(`Unknown icon name: ${name}`);
  }
  const px = size ?? def?.size ?? ART.get(name)?.size ?? 16;
  const el = document.createElement('span');
  el.className = 'ic';
  el.style.setProperty('--is', String(px / 16));
  el.dataset.icon = name;
  fill(el, name);
  if (title) el.title = title;
  return el;
}

// Names in the registry that still fall back to an emoji.
export function iconFallbacks() {
  return Object.keys(ICONS).filter((n) => !ART.has(n));
}
export const iconsLoaded = () => artReady;
