import { B } from './content.js';

export const NOC_MODES = [
  { v: 'humans', label: 'Humans on the glass', blurb: 'People on the security assignment watch the screens. Catch chance scales with the crew, and nothing gets misread.' },
  { v: 'agents', label: 'Let the agents watch', blurb: 'Agents watch with nobody needed and catch more, but some alerts get read as routine and land a severity worse.' },
];

export const nocPlaced = (s) => (s.office?.placed ?? []).find((p) => p.itemId === 'noc') ?? null;

// Weeks until the mode can be switched again (0 when it can now, or nothing is chosen).
export function nocLockWeeks(s) {
  const since = s.ops?.nocSince;
  if (!s.ops?.noc || since == null) return 0;
  return Math.max(0, (B.nocSwitchWeeks ?? 0) - (s.week - since));
}

// The status line: what is chosen and whether it can change.
export function nocStatus(s) {
  const mode = s.ops?.noc;
  if (!mode) return 'Not chosen yet. Yak asks once the Agents era arrives and the NOC is level 2.';
  const name = mode === 'agents' ? 'Agents are watching' : 'Humans are watching';
  const w = nocLockWeeks(s);
  return w > 0 ? `${name}. You can switch again in ${w} ${w === 1 ? 'week' : 'weeks'}.` : `${name}. You can switch any time.`;
}

// The consequence of the chosen mode, in numbers the player can check.
export function nocEffect(s, crew) {
  const mode = s.ops?.noc;
  if (mode === 'agents') return `Catch x${B.nocAgentCatch}, ${Math.round((B.nocMisreadChance ?? 0) * 100)}% of incidents misread.`;
  const need = B.nocCrew ?? 1;
  return `Crew on security: ${Math.min(crew, need)} of ${need} for full catch.`;
}
