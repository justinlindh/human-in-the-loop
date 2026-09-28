// The effects report (docs/effects/): how each game element and choice changes the game, rendered from
// src/data and balance.js. Pure: renderEffects() returns { fileName: markdown } and touches nothing.
import { B } from './balance.js';
import { EVENTS } from '../data/events.js';
import { POLICIES } from '../data/policies.js';
import { ITEMS } from '../data/items.js';
import { ROLES } from '../data/roles.js';
import { TRAITS } from '../data/traits.js';
import { TRAINING } from '../data/training.js';
import { PATHS } from '../data/paths.js';
import { CATEGORIES } from '../data/categories.js';
import { ANGLES } from '../data/angles.js';
import { MODELS } from '../data/models.js';
import { CHANNELS } from '../data/channels.js';
import { RESEARCH } from '../data/research.js';
import { ERAS } from '../data/eras.js';
import { POSTS } from '../data/posts.js';
import * as MODS from '../data/modifiers.js';
import { POLICY_EFFECTS, ITEM_RULES, ITEM_EFFECT_LABELS, CONDITION_LABELS, TRAIT_MOD_LABELS, SUBJECT_LABELS } from '../data/effects-map.js';

const { MODIFIER_KEYS } = MODS;
const VACATION_PUSHES = MODS.VACATION_PUSHES ?? {};
const HEADER = '<!-- Generated from src/data and src/sim/balance.js by `npm run effects`. Do not edit by hand. -->\n\n';
const list = (d) => (Array.isArray(d) ? d : Object.values(d));
const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
const mult = (x) => `×${x}`;
// Text placeholders like {name} show as [name].
const holes = (s) => String(s ?? '').replace(/\{(\w+)\}/g, '[$1]');
const cell = (s) => holes(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
// A number from balance.js by its dotted path, for tables that name where each value comes from.
export const valueOf = (path) => path.split('.').reduce((o, k) => o?.[k], B);

function modifierText(m) {
  const k = MODIFIER_KEYS[m.key];
  const amount = k?.format === 'flat' ? signed(m.value) : pct(m.value);
  return `${k?.label ?? m.key} ${amount} for ${m.weeks} weeks ("${m.label}")`;
}

const ASSIGN = { mentor: 'a free senior starts mentoring them', hardProblem: 'they move to a hard problem', sabbatical: 'they go on sabbatical' };
// Effects whose meaning lives in code, phrased with the balance values they use.
const SPECIAL = {
  assign: (v) => ASSIGN[v.type] ?? `they're assigned to ${v.type}`,
  startCraft: () => 'a craft project starts, if none is running',
  pivot: () => 'your newest product pivots',
  win: (v) => (v === 'acquired' ? 'you win by acquisition: the offer opens' : `the game ends: ${v}`),
  openOffer: () => 'an acquisition offer opens',
  priceHike: () => 'one of your model vendors raises prices',
  vendorOutage: (v) => `products on one of your vendors' models lose ${v} health`,
  migrateOff: (v) => `products on ${MODELS[v]?.name ?? v} need a migration within ${B.migrationDeadlineWeeks} weeks`,
  modelBoost: (v) => `${MODELS[v.model]?.name ?? v.model} capability +${v.capability}`,
  gpuShortageWeeks: (v) => `automation costs ${pct(B.gpuShortageMult - 1)} for ${v} weeks`,
  consultants: () => `consultants clear the outage for ${money(B.consultantCost)}`,
  clearOutage: () => 'the outage clears',
  ransom: () => 'you pay the ransom',
  rivalMerge: () => 'you buy the rival (priced by its strength)',
  rivalFate: (v) => `the rival ${v === 'dead' ? 'shuts down' : v}`,
  agentAudit: () => `an agent audit: ${B.agentAuditWeeks} weeks of agent spend, rogue risk -${Math.round(B.agentAuditRogueRelief * 100)}% for 52 weeks`,
  agentCap: () => `every automation is capped at level ${B.agentCapLevel}`,
  agentInvoice: (v) => `pay ${v === 1 ? '' : `${v}× `}${B.agentInvoiceWeeks} weeks of agent spend`,
  expandNow: () => 'the office expands now',
  acquireBest: () => 'you buy the best company for sale',
  mission: (v) => `your mission becomes "${v}"`,
  musicNight: (v) => `a music night (${v.replace(/_/g, ' ')})`,
  moonshot: (v) => `the moonshot: ${v}`,
  lastBet: (v) => `the last bet: ${v}`,
  ownerFlag: () => 'they become its owner',
  efficiencyCuts: (v) => `the ${v} lowest-rated people are let go`,
  flag: (v) => `remembers "${v?.name ?? v}"`,
};

// One decision effect object in plain words.
export function describeEffects(fx) {
  if (!fx || typeof fx !== 'object') return [];
  const out = [];
  const num = (key, label, fmt = signed) => { if (typeof fx[key] === 'number') out.push(`${label} ${fmt(fx[key])}`); };
  if (typeof fx.cash === 'number') out.push(`cash ${fx.cash < 0 ? '-' : '+'}${money(Math.abs(fx.cash))}`);
  num('brand', 'brand'); num('meaning', 'their meaning'); num('teamMeaning', 'team meaning'); num('ik', 'know-how');
  num('debt', 'comprehension debt'); num('hype', 'hype on your newest product'); num('fame', 'fame'); num('health', 'product health');
  num('knowledge', 'their knowledge'); num('strain', 'their strain'); num('teamStrain', 'team strain'); num('purpose', 'purpose');
  if (typeof fx.customersPct === 'number') out.push(`customers ${pct(fx.customersPct / 100)}`);
  if (typeof fx.salaryPct === 'number') out.push(`their salary ${pct(fx.salaryPct / 100)}`);
  if (typeof fx.teamSalaryPct === 'number') out.push(`everyone's salary ${pct(fx.teamSalaryPct / 100)}`);
  if (typeof fx.awayWeeks === 'number') out.push(`they're away ${fx.awayWeeks} weeks`);
  if (fx.resign) out.push('they leave the company');
  for (const m of [fx.modifier].flat().filter(Boolean)) out.push(modifierText(m));
  if (fx.candidates) out.push(`new candidates (${fx.candidates})`);
  if (fx.automationBump) out.push(`automation level +1 (${fx.automationBump})`);
  if (fx.setAutomation) out.push('automation set by the choice');
  if (fx.workPolicy) out.push(`work policy: ${fx.workPolicy}`);
  if (fx.adoptPet) out.push(`a ${fx.adoptPet} joins the office`);
  if (fx.buyItem) out.push(`buys ${ITEMS[fx.buyItem]?.name ?? fx.buyItem}`);
  if (fx.upgradeItem) out.push(`upgrades ${ITEMS[fx.upgradeItem]?.name ?? fx.upgradeItem}`);
  if (fx.summit) out.push(`hosts a ${fx.summit} summit`);
  if (fx.followUp) out.push(`"${EVENTS[fx.followUp.eventId]?.title ?? fx.followUp.eventId}" follows in ${fx.followUp.inWeeks} weeks`);
  if (fx.clones) out.push(`${fx.clones} copycat product${fx.clones === 1 ? '' : 's'} appear`);
  if (fx.rivalHit) out.push(`the rival takes a hit (${fx.rivalHit})`);
  const known = new Set(['cash', 'brand', 'meaning', 'teamMeaning', 'ik', 'debt', 'hype', 'fame', 'health', 'knowledge', 'strain', 'teamStrain', 'purpose',
    'customersPct', 'salaryPct', 'teamSalaryPct', 'awayWeeks', 'resign', 'modifier', 'candidates', 'automationBump', 'setAutomation', 'workPolicy', 'adoptPet',
    'buyItem', 'upgradeItem', 'summit', 'followUp', 'clones', 'rivalHit', 'gamble', 'cond', 'later', 'chat']);
  for (const [k, v] of Object.entries(fx)) {
    if (known.has(k)) continue;
    out.push(SPECIAL[k] ? SPECIAL[k](v) : `${k}${v === true ? '' : `: ${typeof v === 'object' ? JSON.stringify(v) : v}`}`);
  }
  if (fx.gamble) {
    const win = describeEffects(fx.gamble.effects), lose = describeEffects(fx.gamble.else);
    out.push(`${Math.round(fx.gamble.p * 100)}% chance of ${win.join(', ') || 'nothing'}; otherwise ${lose.join(', ') || 'nothing'}`);
  }
  if (fx.cond) {
    const test = CONDITION_LABELS[fx.cond.test] ?? fx.cond.test;
    out.push(`if ${test}: ${describeEffects(fx.cond.then).join(', ') || 'nothing'}; otherwise ${describeEffects(fx.cond.else).join(', ') || 'nothing'}`);
  }
  for (const l of fx.later ?? []) out.push(`after ${l.weeks ?? l.inWeeks} weeks: ${describeEffects(l.effects).join(', ') || 'nothing'}`);
  return out;
}

function policiesFile() {
  const rows = list(POLICIES).map((p) => {
    const cost = p.costPayrollShare ? `${Math.round(p.costPayrollShare * 100)}% of payroll` : p.costPerHead ? `${money(p.costPerHead)} per person` : p.weeklyCost ? money(p.weeklyCost) : 'free';
    const unlock = [p.lockText.replace(/^Unlocks /, '').replace(/^Needs /, 'needs ').replace(/^Arrives /, 'arrives '), p.excludes ? `replaces ${POLICIES[p.excludes].name}` : null].filter(Boolean).join(' · ');
    const fx = (POLICY_EFFECTS[p.id] ?? []).map(([label, path, fmt]) => `${label} ${fmt === 'mult' ? mult(valueOf(path)) : fmt === 'pct' ? pct(valueOf(path)) : fmt === 'x100' ? pct(valueOf(path) - 1) : fmt === 'half' ? pct(valueOf(path) / 2) : fmt === 'share' ? `${Math.round(valueOf(path) * 100)}%` : fmt === 'count' ? valueOf(path) : signed(valueOf(path))}`);
    return [p.name, unlock, cost, fx.join(' · ') || p.desc];
  });
  const sources = [...new Set(Object.values(POLICY_EFFECTS).flat().map(([, path]) => path))].join(', ');
  return `${HEADER}# Policies\n\nSwitch in the Policies menu. Costs are per game week.\n\n${table(['Policy', 'Unlocks', 'Cost', 'Effects'], rows)}\n\n<sub>Values from balance.js: ${sources}.</sub>\n`;
}

function decisionsFile() {
  const parts = [`${HEADER}# Decisions\n\nEvery event, in the order of src/data/events.js. "Weight" is its share of the weekly random roll; events with no weight are raised by a rule (a calendar date, a follow-up, a threshold).`];
  for (const ev of list(EVENTS)) {
    const meta = [ev.kind, ev.weight ? `weight ${ev.weight}` : 'raised by a rule', ev.cooldownWeeks ? `cooldown ${ev.cooldownWeeks} weeks` : null,
      ev.subject ? `about ${SUBJECT_LABELS[ev.subject] ?? ev.subject}` : null, ev.yak ? 'arrives as a Yak prompt' : null, ev.stage ? `staged: ${ev.stage.prop}` : null].filter(Boolean).join(' · ');
    const when = ev.when ? String(ev.when).replace(/\s+/g, ' ') : '';
    const rule = when && !/^\(\) => true$/.test(when) ? `\n\nWhen: \`${when.replace(/`/g, "'")}\`` : '';
    parts.push(`## ${holes(ev.title ?? ev.id)} \`${ev.id}\`\n\n${meta}${rule}`);
    if (ev.auto) parts.push(`Happens: ${describeEffects(ev.auto).join('; ') || 'nothing'}`);
    const rows = (ev.choices ?? []).map((c) => {
      const extra = [c.requires ? `requires ${CONDITION_LABELS[c.requires] ?? c.requires}` : null, c.grant ? `grants ${ITEMS[c.grant.item]?.name ?? c.grant.item}` : null,
        c.leaves ? `leaves ${c.leaves.prop}${c.leaves.until?.weeks ? ` for ${c.leaves.until.weeks} weeks` : ''}` : null].filter(Boolean);
      return [c.label, [...describeEffects(c.effects), ...extra].join('; ') || 'nothing'];
    });
    if (rows.length) parts.push(table(['Choice', 'Effects'], rows));
  }
  return parts.join('\n\n') + '\n';
}

const ITEM_NEEDS = { award: 'after your first award' };
function officeFile() {
  const label = (k) => ITEM_EFFECT_LABELS[k] ?? k;
  const rows = list(ITEMS).map((it) => {
    const levels = it.effects.map((e, i) => {
      const fx = Object.entries(e).map(([k, v]) => `${label(k)} ${typeof v === 'number' && Math.abs(v) < 1 ? pct(v) : signed(v)}`);
      return `L${i + 1} ${money(it.costs[i] ?? it.costs.at(-1))}${fx.length ? `: ${fx.join(', ')}` : ''}`;
    });
    const a = it.adjacency;
    const tiles = a && `within ${a.radius} tile${a.radius === 1 ? '' : 's'}`;
    const near = a && (a.to ? `${label(a.key)} ${pct(a.value)} for each other ${ITEMS[a.to].name} ${tiles}`
      : `${label(a.key)} ${pct(a.value)} for each occupied desk ${tiles}, shared across the team`);
    const effects = [levels.join(' · '), near, ITEM_RULES[it.id]?.(B)].filter(Boolean).join('; ');
    const from = [it.minStage ? ['', 'Office Floor', 'HQ Building'][it.minStage] : 'any', it.era ? `the ${list(ERAS).find((e) => e.id === it.era)?.name ?? it.era} era` : null, ITEM_NEEDS[it.requires] ?? it.requires].filter(Boolean).join(', ');
    return [it.name, it.kind, from, effects];
  });
  const rules = `A second copy of an item adds its level effect at ${Math.round(B.itemSecondCopy * 100)}%, and copies past the second add no level effect. `
    + 'Nearby bonuses are different: every copy counts in full, for each desk or item in reach. '
    + `All items together are capped at ±${Math.round(B.itemBonusCap * 100)}% on any one effect. A desk bonus counts only when someone sits at that desk, and is divided by headcount.`;
  return `${HEADER}# Office items and perks\n\nPlaced in Build mode. Each level's cost and what it adds.\n\n${table(['Item', 'Kind', 'From', 'Effects'], rows)}\n\n${rules}\n`;
}

function peopleFile() {
  const roles = table(['Role', 'Default work', 'Automated by'], list(ROLES).map((r) => [r.name, r.defaultAssignment, Object.entries(r.automatedBy ?? {}).map(([f, v]) => `${f} ${v}`).join(', ') || 'nothing']));
  const pay = table(['Seniority', 'Salary a week', 'Output'], Object.entries(B.salary).map(([s, v]) => [s, money(v), mult(B.seniorityOutput[s])]));
  const modText = (mods) => Object.entries(mods ?? {}).map(([k, v]) => `${TRAIT_MOD_LABELS[k] ?? k} ${mult(v)}`).join(', ');
  const traits = table(['Trait', 'Effects', 'Era'], list(TRAITS).map((t) => [t.name, modText(t.mods), t.era ?? 'any']));
  const training = table(['Program', 'Cost', 'Gains', 'Away'], list(TRAINING).map((t) => [t.name, money(t.cost),
    [t.xp && `XP +${t.xp}`, t.skill && `skill +${t.skill}`, t.meaning && `meaning +${t.meaning}`, t.brand && `brand +${t.brand}`, t.knowledge && `knowledge +${t.knowledge}`].filter(Boolean).join(', '), t.awayWeeks ? `${t.awayWeeks} weeks` : '-']));
  const paths = table(['Path', 'Role', 'Effects'], list(PATHS).map((p) => [p.name, ROLES[p.role]?.name ?? p.role, modText(p.mods)]));
  const pushes = Object.keys(VACATION_PUSHES).join(', ');
  return `${HEADER}# People\n\n## Roles\n\n${roles}\n\n## Seniority\n\n${pay}\n\n## Traits\n\n${traits}\n\n## Training\n\n${training}\n\n## Career paths\n\n${paths}\n\n## Vacations and strain\n\n- Everyone takes ${B.vacationWeeks} weeks of vacation a year, with at most ${Math.round(B.vacationMaxShare * 100)}% of the team away at once.\n- An outage, Crunch Mode${pushes ? ` or a push (${pushes})` : ''} postpones a vacation by ${B.vacationPostponeWeeks} weeks and adds ${B.vacationPostponeStrain} strain, at most ${B.vacationMaxPostpones} times in a row.\n`;
}

function productsFile() {
  const cats = table(['Category', 'Market size', 'Price a month', 'From', 'Compliance'], list(CATEGORIES).map((c) => [c.name, c.tam.toLocaleString('en-US'), money(c.price), c.unlockYear, c.compliance ? 'yes' : 'no']));
  const angles = table(['Approach', 'Era', 'AI', 'Agentic'], list(ANGLES).map((a) => [a.name, a.era, a.ai ? 'yes' : 'no', a.agentic ? 'yes' : 'no']));
  const models = table(['Model', 'Capability', 'Cost per customer', 'Automation cost', 'Guardrails', 'Trust', 'Compliance', 'From'],
    list(MODELS).map((m) => [m.name, m.capability, money(m.productCost), money(m.autoCost), m.guardrails, m.trust, m.complianceOk ? 'yes' : 'no', m.releaseYear]));
  const sizes = table(['Size', 'Points'], Object.entries(B.sizes).map(([k, v]) => [k, v.points]));
  return `${HEADER}# Products\n\n## Categories\n\n${cats}\n\n## Approaches\n\n${angles}\n\n## Models\n\n${models}\n\n## Project sizes\n\n${sizes}\n`;
}

function growthFile() {
  const channels = table(['Channel', 'Cost', 'Weeks', 'Hype', 'Brand', 'From'], list(CHANNELS).map((c) => [c.name, money(c.cost), c.weeks, signed(c.hype), signed(c.brand), c.minStage ? ['', 'Office Floor', 'HQ Building'][c.minStage] : 'any']));
  const research = table(['Research', 'Points', 'Needs', 'Effect'], list(RESEARCH).map((r) => [r.name, r.points, r.requires ? RESEARCH[r.requires]?.name ?? r.requires : '-',
    Object.entries(r.effect ?? {}).map(([k, v]) => `${MODIFIER_KEYS[k]?.label ?? k} ${pct(v)}`).join(', ') || r.desc]));
  const eras = table(['Era', 'Around week', 'What changes'], list(ERAS).map((e) => [e.name, e.week, (e.changes ?? []).join('; ')]));
  return `${HEADER}# Growth\n\n## Marketing channels\n\n${channels}\n\n## Research\n\n${research}\n\n## Eras\n\n${eras}\n`;
}

function yakFile() {
  const posts = table(['Quick post', 'Channel', 'What it does'], list(POSTS).map((p) => [p.label, `#${p.channel}`, p.hint]));
  return `${HEADER}# Yak\n\n## Quick posts\n\n${posts}\n`;
}

function advisorsFile() {
  const A = B.advisor;
  const rows = [
    ['Runway', 'CFO', `under ${A.runwayWeeks.join(' / ')} weeks of cash at this burn (tiers 1 to 3), or in the red`],
    ['Burnout', 'people lead', `one person burnt out; two or more; two or more and at least ${Math.round(A.burnoutShareUrgent * 100)}% of the team`],
    ['Comprehension debt', 'tech lead', `at ${A.debt.join(' / ')}`],
    ['One person holds the know-how', 'tech lead', `one of ${A.busFactorMinHolders} or more holders has ${A.busFactorShare.map((x) => `${Math.round(x * 100)}%`).join(' / ')} of the team's knowledge`],
    ['Unused policy', 'people lead', `a good policy unlocked ${A.unusedPolicyWeeks} weeks and never switched on (for ${A.unusedPolicyWindowWeeks} weeks)`],
    ['New era', 'tech lead', `the first ${A.eraWeeks} weeks of a new era`],
    ['One product', 'CFO', `one product earns ${A.oneProductPct}% or more of revenue`],
    ['Migration', 'tech lead', `due within ${A.migrationWarnWeeks} weeks, or overdue`],
    ['Juniors', 'people lead', `${A.unmentoredJuniors} or more juniors without a mentor`],
  ];
  return `${HEADER}# Advisors\n\nWhat makes each advisor speak. Urgent advice pushes itself at most once every ${A.pushGapWeeks} weeks; a topic rests ${A.cooldownWeeks} weeks unless it gets worse.\n\n${table(['Topic', 'Advisor', 'Speaks when'], rows)}\n`;
}

const FILES = { 'policies.md': policiesFile, 'decisions.md': decisionsFile, 'office.md': officeFile, 'people.md': peopleFile,
  'products.md': productsFile, 'growth.md': growthFile, 'yak.md': yakFile, 'advisors.md': advisorsFile };

export function renderEffects() {
  const out = {};
  const index = Object.keys(FILES).map((f) => `- [${f.replace('.md', '')}](${f})`).join('\n');
  out['README.md'] = `${HEADER}# Effects\n\nHow each game choice and element changes the game, generated from the data and the balance values. Numbers are per game week unless a row says otherwise.\n\n${index}\n`;
  for (const [f, render] of Object.entries(FILES)) out[f] = render();
  return out;
}
