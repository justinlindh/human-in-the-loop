import { ASSIGNMENT_LABEL } from '../content.js';

export const KIND_LABEL = { new: 'New product', update: 'Update', migration: 'Migration', refactor: 'Refactor', craft: 'Craft project' };

export function projectLabel(state, j) {
  const prod = j.productId ? state.products.find((p) => p.id === j.productId) : null;
  if (j.kind === 'new') return j.name || 'Untitled';
  if (j.kind === 'update') return `${prod?.name ?? j.name ?? 'Product'} v${(prod?.version ?? 1) + 1}`;
  if (j.kind === 'migration') return `Migrate ${prod?.name ?? j.name ?? 'product'}`;
  if (j.kind === 'refactor') return j.name || 'Refactor';
  return j.name || 'Craft project';
}

export function mentorOf(state, junior) {
  return state.staff.find((p) => p.assignment?.type === 'mentor' && p.assignment.targetId === junior.id) ?? null;
}

export function assignmentText(state, p) {
  const a = p.assignment ?? { type: 'idle' };
  if (a.type === 'project') {
    const j = state.projects.find((x) => x.id === a.targetId);
    return j ? `🔨 ${projectLabel(state, j)}` : 'Project';
  }
  if (a.type === 'mentor') {
    const t = state.staff.find((x) => x.id === a.targetId);
    return `🎓 Mentoring ${t ? t.name.split(' ')[0] : ''}`.trim();
  }
  if (a.type === 'sabbatical') return `🏖️ Sabbatical${p.sabbaticalWeeksLeft ? ` (${p.sabbaticalWeeksLeft}w)` : ''}`;
  return ASSIGNMENT_LABEL[a.type] ?? a.type;
}

// Options for a person's assignment dropdown. Value encodes "type:targetId".
export function assignmentOptions(state, p) {
  const out = [];
  const add = (type, targetId, label, group) => out.push({ value: `${type}:${targetId ?? ''}`, type, targetId: targetId ?? null, label, group });
  for (const j of state.projects) add('project', j.id, `Build: ${projectLabel(state, j)}`, 'Projects');
  const byRole = {
    engineer: ['maintenance', 'oversight', 'security', 'support'],
    designer: ['maintenance', 'oversight'],
    marketer: ['marketing', 'oversight', 'sales'],
    support: ['support', 'oversight'],
    security: ['security', 'oversight', 'maintenance'],
    sales: ['sales', 'marketing', 'oversight'],
  }[p.role] ?? ['maintenance', 'oversight'];
  for (const t of byRole) add(t, null, ASSIGNMENT_LABEL[t], 'Jobs');
  if (p.seniority === 'senior') add('hardProblem', null, 'Hard Problem', 'Growth');
  if (p.seniority !== 'junior') {
    for (const j of state.staff) if (j.seniority === 'junior' && j.id !== p.id) add('mentor', j.id, `Mentor ${j.name}`, 'Growth');
  }
  if (state.policies?.sabbatical || p.assignment?.type === 'sabbatical') add('sabbatical', null, 'Sabbatical', 'Growth');
  add('idle', null, 'Idle', 'Jobs');
  const cur = `${p.assignment?.type}:${p.assignment?.targetId ?? ''}`;
  if (!out.some((o) => o.value === cur)) add(p.assignment?.type ?? 'idle', p.assignment?.targetId, assignmentText(state, p), 'Current');
  return out;
}

export function isAvailable(p) {
  return p.mood !== 'away' && p.assignment?.type !== 'sabbatical';
}

const PREFIX = ['Inbox', 'Plan', 'Desk', 'Note', 'Deal', 'Chart', 'Pixel', 'Ship', 'Ledger', 'Brief', 'Loop', 'Hire', 'Clip', 'Vault', 'Flow', 'Pilot', 'Nudge', 'Tidy', 'Quill', 'Beacon'];
const SUFFIX = ['ly', 'ify', 'bot', 'wise', 'hub', 'io', 'genie', 'pal', 'sense', 'mind', 'ster', 'o', 'able', 'dex', 'ware'];
const SILLY = ['Synergy.ai', 'Clippy Returns', 'Yet Another Copilot', 'Prompt and Circumstance', 'Agentic McAgentface', 'Hallucinate Less', 'Summarize This', 'Vibe Ledger', 'Just Ship It', 'Tokenomicon'];
const CAT_WORD = { notes: 'Note', email: 'Inbox', pm: 'Plan', support: 'Desk', crm: 'Deal', analytics: 'Chart', design: 'Pixel', devtools: 'Ship', hr: 'People', recruiting: 'Hire', accounting: 'Ledger', video: 'Clip', legal: 'Brief', security: 'Vault' };

let suggestN = 0;
export function suggestName(category) {
  suggestN++;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (suggestN % 5 === 0) return pick(SILLY);
  const base = category && CAT_WORD[category] && Math.random() < 0.7 ? CAT_WORD[category] : pick(PREFIX);
  return `${base}${pick(SUFFIX)}`;
}
