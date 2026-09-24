import { B } from './balance.js';
import { clamp, sum, newId } from './util.js';
import { registerAction, registerSystem } from './registry.js';
import { outputMult, staffMods } from './staff.js';
import { liveProducts, findProduct } from './projects.js';
import { CHANNELS } from '../data/channels.js';
import { modifierBonus } from './modifiers.js';
import { itemBonus } from './bonus.js';

const marketers = (state) => state.staff.filter((p) => p.mood !== 'away' && p.assignment.type === 'marketing');

registerAction('runCampaign', (ctx, { channel, productId, projectId }) => {
  const { state } = ctx;
  const ch = CHANNELS[channel];
  if (!ch) return { ok: false, reason: 'Unknown channel' };
  if (state.officeStage < ch.minStage) return { ok: false, reason: 'Needs a bigger office' };
  const hasProduct = productId !== null && productId !== undefined;
  const hasProject = projectId !== null && projectId !== undefined;
  if (hasProduct === hasProject) return { ok: false, reason: 'Pick a product or a project' };
  if (hasProduct) {
    const p = findProduct(state, productId);
    if (!p || p.killed) return { ok: false, reason: 'No such product' };
  } else if (!state.projects.some((j) => j.id === projectId && j.kind === 'new')) {
    return { ok: false, reason: 'No such project' };
  }
  if (state.cash < ch.cost) return { ok: false, reason: 'Not enough cash' };
  state.cash -= ch.cost;
  state.campaigns.push({ id: newId(state, 'c'), channel, productId: hasProduct ? productId : null, projectId: hasProject ? projectId : null, weeksLeft: ch.weeks });
  ctx.emit({ type: 'toast', text: `${ch.name} is live.`, tone: 'info' });
  return { ok: true };
});

export function marketingSystem(ctx) {
  const { state } = ctx;
  const team = marketers(state);
  const marketerMult = Math.min(2.5, 1 + 0.25 * sum(team, (p) => outputMult(state, p) * staffMods(p).hype));
  const autoLevel = state.automation.marketing.level;
  const brandGain = Math.max(1, ...team.map((p) => staffMods(p).brandGain));
  const autoMult = (1 + B.autoMarketingHype * autoLevel) * Math.max(0, 1 + modifierBonus(state, 'hype'));

  for (const c of state.campaigns) {
    const ch = CHANNELS[c.channel];
    const product = c.productId ? findProduct(state, c.productId) : null;
    const project = c.projectId ? state.projects.find((j) => j.id === c.projectId) : null;
    if ((product && product.killed) || (!product && !project)) {
      c.weeksLeft = 0;
      ctx.emit({ type: 'toast', text: `${ch.name} stopped: ${product ? `${product.name} was sunset` : 'its project is gone'}.`, tone: 'info' });
      continue;
    }
    const gain = ch.hype * marketerMult * autoMult;
    if (product) product.hype += gain;
    else project.bankedHype = Math.min(100, project.bankedHype + gain);
    state.brand += ch.brand * (1 - B.autoMarketingBrandPenalty * autoLevel) * brandGain;
    c.weeksLeft--;
    if (c.weeksLeft <= 0) ctx.emit({ type: 'toast', text: `${ch.name} wrapped up.`, tone: 'info' });
  }
  state.campaigns = state.campaigns.filter((c) => c.weeksLeft > 0);

  const live = liveProducts(state);
  const covered = new Set(state.campaigns.map((c) => c.productId));
  const target = [...live].reverse().find((p) => !covered.has(p.id));
  if (target) target.hype += sum(team, (p) => B.marketerHypePerWeek * outputMult(state, p) * staffMods(p).hype);

  const steady = sum(state.staff.filter((p) => p.mood !== 'away'), (p) => staffMods(p).brandPerWeek);
  state.brand = clamp(state.brand - B.brandDecay + modifierBonus(state, 'brandPerWeek') + itemBonus(state, 'brandPerWeek') + steady, 0, 100);
  for (const p of live) {
    p.hype = clamp(p.hype * (1 - B.hypeDecay), 0, 100);
    if (!p.wrapperHit && p.hype / 10 > p.score + B.wrapperGap) {
      p.wrapperHit = true;
      state.brand = Math.max(0, state.brand - B.wrapperBrandHit);
      ctx.emit({ type: 'toast', text: `The Vergence calls ${p.name} 'just a wrapper'`, tone: 'bad' });
    }
  }
}

registerSystem('marketing', marketingSystem, 45);
