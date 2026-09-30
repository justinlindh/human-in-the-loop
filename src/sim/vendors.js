import { B } from './balance.js';
import { chance, pick } from './rng.js';
import { calendarDate, calendarWeek } from './util.js';
import { registerSystem } from './registry.js';
import { emitChat } from './chat.js';
import { processScheduled } from './effects.js';
import { liveProducts } from './projects.js';
import { CATEGORIES } from '../data/categories.js';
import { ANGLES } from '../data/angles.js';
import { MODELS } from '../data/models.js';
import { TRENDS } from '../data/trends.js';
import { periodCopy } from '../data/period-content.js';
import { ERAS } from '../data/eras.js';
import { eraIndex, eraAtLeast, eraOnlyAllowsText, currentEra } from './eras.js';
import { raiseDecision } from './events.js';
import { PERIOD_MARKETS, EARLY_ERAS } from '../data/early-eras.js';
import { dotcomStep } from './dotcom.js';
import { web2Step } from './web2.js';

const VENDOR_LINES = [
  '{model} v{version} is here! Smarter, faster, and only slightly more expensive to think about.',
  'Introducing {model} v{version}: now with 40% more reasoning and 60% more blog posts about reasoning.',
  '{model} v{version} just shipped. The benchmarks are incredible. The benchmarks are always incredible.',
];

// Opens the categories, angles, and models that the current year and era allow.
function openMarkets(ctx) {
  const { state } = ctx;
  const period = PERIOD_MARKETS[state.era.id];
  if (period) {
    for (const id of period.categories) if (!state.market.unlockedCategories.includes(id)) state.market.unlockedCategories.push(id);
    for (const id of period.angles) if (!state.market.unlockedAngles.includes(id)) state.market.unlockedAngles.push(id);
    return;
  }
  const { year } = calendarDate(state);
  const m = state.market;
  for (const c of Object.values(CATEGORIES)) {
    if (c.unlockYear <= year && !m.unlockedCategories.includes(c.id)) {
      m.unlockedCategories.push(c.id);
      ctx.emit({ type: 'toast', text: `New market: ${c.name} is open for business.`, tone: 'info' });
    }
  }
  for (const a of Object.values(ANGLES)) {
    if (eraAtLeast(state, a.era) && !m.unlockedAngles.includes(a.id)) {
      m.unlockedAngles.push(a.id);
      ctx.emit({ type: 'toast', text: `New ${a.ai ? 'AI angle' : 'approach'} unlocked: ${a.name}.`, tone: 'info' });
    }
  }
  if (!eraAtLeast(state, 'chatgbt')) return;
  for (const md of Object.values(MODELS)) {
    const s = state.models[md.id];
    if (md.releaseYear <= year && !s.available) {
      s.available = true;
      ctx.emit({ type: 'toast', text: `${md.name} is now available. ${md.blurb}`, tone: 'info' });
    }
  }
}

// Advances to every era whose arrival week has come, with its card and decision.
function eraStep(ctx) {
  const { state } = ctx;
  for (const e of EARLY_ERAS) {
    if (eraAtLeast(state, e.id) || state.eraSchedule[e.id] === undefined || state.week < state.eraSchedule[e.id]) continue;
    state.era = { id: e.id, since: state.week };
    if (state.flags.erasVisited && !state.flags.erasVisited.includes(e.id)) state.flags.erasVisited.push(e.id);
    ctx.emit({ type: 'era', eraId: e.id });
    openMarkets(ctx);
  }
  for (const e of ERAS.slice(Math.max(0, eraIndex(state) + 1))) {
    if (state.week < state.eraSchedule[e.id]) break;
    state.era = { id: e.id, since: state.week };
    if (state.flags.erasVisited && !state.flags.erasVisited.includes(e.id)) state.flags.erasVisited.push(e.id);
    ctx.emit({ type: 'era', eraId: e.id });
    openMarkets(ctx);
    raiseDecision(ctx, `era_${e.id}`, null, { queue: true });
  }
}

const trendFits = (state, t) => (t.eras ? t.eras.includes(currentEra(state).id) : eraOnlyAllowsText(state, `${t.name} ${t.text}`));

function trendStep(ctx) {
  const m = ctx.state.market;
  m.trendWeeksLeft--;
  if (m.trendWeeksLeft > 0) return;
  const period = PERIOD_MARKETS[ctx.state.era.id];
  const next = pick(ctx.rng, (period?.trends ?? Object.keys(TRENDS)).filter((id) => id !== m.trend && trendFits(ctx.state, TRENDS[id])));
  m.trend = next;
  m.trendWeeksLeft = TRENDS[next].weeks;
  const copy = periodCopy(ctx.state, 'trends', TRENDS[next]);
  ctx.emit({ type: 'toast', text: `Trend: ${copy.name}. ${copy.text}`, tone: 'info', trendId: next });
}

function vendorRelease(ctx) {
  const { state } = ctx;
  const avail = Object.keys(state.models).filter((id) => state.models[id].available && !state.models[id].deprecated);
  if (!avail.length) return;
  const id = pick(ctx.rng, avail);
  const ms = state.models[id];
  ms.version++;
  ms.capability = Math.min(100, ms.capability + B.vendorCapabilityStep);
  const name = MODELS[id].name;
  emitChat(ctx, { from: '@vendorbot', text: pick(ctx.rng, VENDOR_LINES).replace('{model}', name).replace('{version}', ms.version) });
  const consolidation = eraAtLeast(state, 'consolidation');
  if (chance(ctx.rng, consolidation ? B.consolidationDeprecateChance : B.deprecateChance)) {
    const affected = liveProducts(state).filter((p) => p.model === id && p.modelVersion < ms.version && p.migrationDueWeek === null);
    for (const p of affected) p.migrationDueWeek = state.week + B.migrationDeadlineWeeks;
    if (affected.length) {
      ctx.emit({ type: 'toast', text: `${name} is retiring its old version. Migrate ${affected.map((p) => p.name).join(', ')} within ${B.migrationDeadlineWeeks} weeks.`, tone: 'warn' });
    }
  }
  if (chance(ctx.rng, B.priceHikeChance)) priceHike(ctx);
}

// Raises a random available model's price. Shared with the vendor_price_hike event.
export function priceHike(ctx, modelId = null) {
  const { state } = ctx;
  const id = modelId ?? pick(ctx.rng, Object.keys(state.models).filter((m) => state.models[m].available));
  if (!id) return;
  state.models[id].costMult *= B.priceHikeMult;
  ctx.emit({ type: 'toast', text: `${MODELS[id].name} raised prices by ${Math.round((B.priceHikeMult - 1) * 100)}%. "Exciting changes."`, tone: 'warn' });
}

// Weekly calendar step: scheduled consequences, era arrivals, year-start unlocks, trend countdown, and vendor releases.
export function calendarStart(ctx) {
  const { week } = ctx.state;
  dotcomStep(ctx);
  processScheduled(ctx);
  eraStep(ctx);
  web2Step(ctx);
  if (week > 0 && calendarWeek(ctx.state) % 52 === 0) openMarkets(ctx);
  trendStep(ctx);
  const every = eraAtLeast(ctx.state, 'consolidation') ? B.consolidationVendorEveryWeeks : B.vendorReleaseEveryWeeks;
  if (week > 0 && week % every === 0) vendorRelease(ctx);
}

registerSystem('calendar-start', calendarStart, 10);
