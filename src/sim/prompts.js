import { B } from './balance.js';
import { chance, pick } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { applyEffects, checkCondition, requireReason } from './effects.js';
import { emitChat } from './chat.js';
import { eraAllowsText, eraLines, currentEra } from './eras.js';
import { PROMPTS } from '../data/prompts.js';
import { deskCapacity } from './office.js';
import { mentorOf } from './staff.js';

// Yak reply prompts: a staff post with two or three founder replies, open for a few weeks. Answering applies
// the option's effects and posts the founder's reply and the poster's answer in the thread; letting it expire
// applies the template's `ignored` consequence. What set a prompt off lives in flags.promptCtx by prompt id,
// so the thread can name the same product or project when it resolves.

const TEMPLATES = Object.fromEntries(PROMPTS.map((t) => [t.id, t]));
const present = (state) => state.staff.filter((p) => p.mood !== 'away' && !p.remote);
const staffOnly = (state) => present(state).filter((p) => !p.founder);

// For each kind of trigger: who posts and what the text refers to this week, or null when it does not apply.
const TRIGGERS = {
  strain: (state) => {
    const tired = staffOnly(state).filter((p) => (p.strain ?? 0) >= B.prompts.strainAt || p.mood === 'burnout');
    const poster = tired.sort((a, b) => (b.strain ?? 0) - (a.strain ?? 0))[0];
    return poster ? { poster } : null;
  },
  incident: (state, ctx) => {
    const hit = ctx.events.find((e) => e.type === 'incident' && !e.caught);
    const productId = state.outage?.productId ?? hit?.productId ?? null;
    if (!productId) return null;
    const people = staffOnly(state);
    const poster = people.find((p) => p.role === 'security') ?? people.find((p) => p.role === 'engineer') ?? people[0];
    return poster ? { poster, productId } : null;
  },
  launch: (state, ctx) => {
    const e = ctx.events.find((x) => x.type === 'launch');
    const people = staffOnly(state);
    const poster = people.find((p) => p.role === 'marketer') ?? people.find((p) => p.role === 'designer') ?? people[0];
    return e && poster ? { poster, productId: e.productId } : null;
  },
  rival: (state) => {
    if (!state.rival || !['rising', 'stalled'].includes(state.rival.status)) return null;
    const people = staffOnly(state);
    const poster = people.find((p) => p.role === 'marketer') ?? people.find((p) => p.role === 'sales') ?? people[0];
    return poster ? { poster } : null;
  },
  late: (state) => {
    const late = state.projects.find((j) => j.kind !== 'craft' && state.week - j.startedWeek >= B.prompts.lateWeeks
      && j.progress < B.prompts.lateProgress * j.pointsNeeded);
    if (!late) return null;
    const people = staffOnly(state);
    const poster = people.find((p) => p.assignment.type === 'project' && p.assignment.targetId === late.id) ?? people.find((p) => p.role === 'engineer');
    return poster ? { poster, projectId: late.id } : null;
  },
  newhire: (state) => {
    const poster = staffOnly(state).filter((p) => state.week - (p.hiredWeek ?? 0) <= B.prompts.newHireWeeks).at(-1);
    return poster ? { poster } : null;
  },
  coasting: (state) => {
    const poster = staffOnly(state).find((p) => p.mood === 'coasting');
    return poster ? { poster } : null;
  },
  support: (state) => {
    const live = state.products.filter((p) => !p.killed);
    if (state.ops.supportShortfall < B.prompts.supportShortfall || !live.length) return null;
    const people = staffOnly(state);
    const poster = people.find((p) => p.role === 'support') ?? people[0];
    return poster ? { poster, productId: live.at(-1).id } : null;
  },
  lowcash: (state) => {
    if (!(state.lowCashWeeks > 0)) return null;
    const poster = staffOnly(state)[0];
    return poster ? { poster } : null;
  },
  crowded: (state) => {
    if (state.staff.length < deskCapacity(state)) return null;
    const poster = staffOnly(state).at(-1);
    return poster ? { poster } : null;
  },
  junior: (state) => {
    const poster = staffOnly(state).find((p) => p.seniority === 'junior' && !mentorOf(state, p));
    return poster ? { poster } : null;
  },
  agents: (state) => {
    if (state.automation.engineering.level < B.prompts.agentLevel) return null;
    const people = staffOnly(state).filter((p) => p.role === 'engineer');
    const poster = people.find((p) => p.assignment.type === 'oversight') ?? people.find((p) => p.seniority === 'senior') ?? people[0];
    return poster ? { poster } : null;
  },
};

function fill(state, text, pc) {
  const product = state.products.find((p) => p.id === pc.productId);
  const project = state.projects.find((j) => j.id === pc.projectId);
  const values = { product: product?.name ?? pc.productName, project: project?.name ?? pc.projectName, rival: state.rival?.name ?? pc.rivalName };
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (_, k) => { if (!values[k]) missing = true; return values[k] ?? ''; });
  return missing ? null : out;
}

function optionBlocker(state, o, subjectId) {
  return o.requires && !checkCondition(state, o.requires, subjectId) ? requireReason(state, o.requires) : null;
}

// A template fits when it names this era (or names none), one of its posts fits the era and the office, and
// its labels and hints all do. Replies and answers are filtered line by line when they are posted.
const fitsEra = (state, t) => (!t.eras || t.eras.includes(currentEra(state).id))
  && t.text.some((l) => eraAllowsText(state, l))
  && t.options.every((o) => eraAllowsText(state, o.label) && eraAllowsText(state, o.hint));

const founderOf = (state) => present(state).find((p) => p.founder) ?? state.staff.find((p) => p.founder) ?? null;

function applyOption(ctx, o, pc) {
  applyEffects(ctx, o.effects, pc.posterId, `prompt:${pc.kind}`);
  if (o.productEffects && pc.productId) applyEffects(ctx, o.productEffects, pc.productId, `prompt:${pc.kind}`);
}

function openPrompt(ctx) {
  const { state } = ctx;
  const found = [];
  for (const t of PROMPTS) {
    if ((state.flags[`pcd_${t.id}`] ?? -1) > state.week || !fitsEra(state, t)) continue;
    const hit = TRIGGERS[t.on]?.(state, ctx);
    if (hit) found.push({ t, hit });
  }
  if (!found.length) return;
  const { t, hit } = pick(ctx.rng, found);
  const pc = { kind: t.id, posterId: hit.poster.id, productId: hit.productId ?? null, projectId: hit.projectId ?? null };
  pc.productName = state.products.find((p) => p.id === pc.productId)?.name ?? null;
  pc.projectName = state.projects.find((j) => j.id === pc.projectId)?.name ?? null;
  pc.rivalName = state.rival?.name ?? null;
  const texts = eraLines(state, t.text).map((x) => fill(state, x, pc)).filter(Boolean);
  if (!texts.length) return;
  const msg = emitChat(ctx, { channel: t.channel, person: hit.poster, text: pick(ctx.rng, texts) });
  state.flags.promptSeq = (state.flags.promptSeq ?? 0) + 1;
  const id = `cp${state.flags.promptSeq}`;
  (state.flags.promptCtx ??= {})[id] = pc;
  state.chatPrompts.push({
    id, kind: t.id, chatId: msg.id, channel: t.channel, fromId: hit.poster.id, week: state.week,
    expiresWeek: state.week + B.chatPromptExpiryWeeks,
    options: t.options.map((o) => { const why = optionBlocker(state, o, pc.posterId); return { label: o.label, hint: fill(state, o.hint, pc) ?? o.hint, available: !why, reason: why }; }),
    resolved: null,
  });
  state.flags.lastPromptWeek = state.week;
  state.flags[`pcd_${t.id}`] = state.week + t.cooldown;
  ctx.emit({ type: 'chatPrompt', promptId: id, chatId: msg.id });
}

// A line in the prompt's thread from someone still at the company; returns the chat id or null.
function threadLine(ctx, prompt, person, lines, pc) {
  if (!person || !ctx.state.staff.includes(person)) return null;
  const texts = eraLines(ctx.state, lines).map((x) => fill(ctx.state, x, pc)).filter(Boolean);
  if (!texts.length) return null;
  return emitChat(ctx, { channel: prompt.channel, person, text: pick(ctx.rng, texts), replyTo: prompt.chatId }).id;
}

function resolve(ctx, prompt, choice) {
  const { state } = ctx;
  const t = TEMPLATES[prompt.kind];
  const pc = state.flags.promptCtx?.[prompt.id] ?? { kind: prompt.kind, posterId: prompt.fromId };
  const poster = state.staff.find((p) => p.id === pc.posterId) ?? null;
  let replyId = null;
  if (choice === null) {
    applyEffects(ctx, t.ignored.effects, pc.posterId, `prompt:${prompt.kind}`);
    threadLine(ctx, prompt, poster, t.ignored.line, pc);
  } else {
    const o = t.options[choice];
    applyOption(ctx, o, pc);
    replyId = threadLine(ctx, prompt, founderOf(state), o.reply, pc);
    threadLine(ctx, prompt, poster, o.answer, pc);
  }
  prompt.resolved = { choice, week: state.week, replyId };
  delete state.flags.promptCtx?.[prompt.id];
  ctx.emit({ type: 'chatPromptResolved', promptId: prompt.id, choice });
}

export function promptsSystem(ctx) {
  const { state } = ctx;
  state.chatPrompts ??= [];
  for (const p of state.chatPrompts) if (!p.resolved && state.week >= p.expiresWeek) resolve(ctx, p, null);
  state.chatPrompts = state.chatPrompts.filter((p) => !p.resolved || state.week - p.resolved.week < B.chatPromptsKept);
  const open = state.chatPrompts.filter((p) => !p.resolved);
  for (const p of open) {
    const t = TEMPLATES[p.kind];
    t.options.forEach((o, i) => { const why = optionBlocker(state, o, p.fromId); p.options[i].available = !why; p.options[i].reason = why; });
  }
  if (open.length >= B.chatPromptsOpen || state.week < B.chatPromptFromWeek) return;
  if (state.week - (state.flags.lastPromptWeek ?? -Infinity) < B.chatPromptGapWeeks) return;
  if (!chance(ctx.rng, B.chatPromptChance)) return;
  openPrompt(ctx);
}

registerSystem('prompts', promptsSystem, 89);

registerAction('answerPrompt', (ctx, { promptId, choice }) => {
  const { state } = ctx;
  const prompt = (state.chatPrompts ?? []).find((p) => p.id === promptId);
  if (!prompt) return { ok: false, reason: 'No such prompt' };
  if (prompt.resolved?.choice !== undefined && prompt.resolved?.choice !== null) return { ok: false, reason: 'Already answered' };
  if (prompt.resolved) return { ok: false, reason: 'That has gone quiet' };
  const t = TEMPLATES[prompt.kind];
  if (!Number.isInteger(choice) || choice < 0 || choice >= t.options.length) return { ok: false, reason: 'Invalid choice' };
  const why = optionBlocker(state, t.options[choice], prompt.fromId);
  if (why) return { ok: false, reason: why };
  resolve(ctx, prompt, choice);
  return { ok: true };
});
