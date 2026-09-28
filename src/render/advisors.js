import { PALETTE as P } from './palette.js';

// The three advisors as portrait people: built from the staff character kit through the
// portrait pipeline, with their own muted accent in place of a staff role colour so they never read
// as someone on the payroll. The role only picks the garment (blazer, scarf, hoodie). ideaT: the
// moment in the wave (the character's own phase differs by id) that puts the hand beside the face.
export const ADVISORS = {
  cfo: { id: 'advisor:cfo', name: 'Marge Tally', role: 'marketer', roleColor: P.paper, mood: 'ok', ideaT: 0.35,
    appearance: { skin: 1, hair: 5, hairColor: '#b8b2aa', accessory: 'glasses', build: 1, shirt: '#565e70', pants: '#3a3f4a' } },
  people: { id: 'advisor:people', name: 'Dev Okafor', role: 'designer', roleColor: P.fabric_terracotta, mood: 'ok', ideaT: 0.9,
    appearance: { skin: 4, hair: 1, hairColor: '#2b2320', accessory: 'none', build: 2, shirt: '#e9d7c0', pants: '#4a4038' } },
  tech: { id: 'advisor:tech', name: 'Sam Rourke', role: 'engineer', roleColor: P.fabric_teal, mood: 'ok', ideaT: 0.25,
    appearance: { skin: 2, hair: 3, hairColor: '#5a3f2a', accessory: 'headphones', build: 1, shirt: '#7c8a6e', pants: '#3b3a40' } },
};

// advisorPerson(key, { idea }) -> the person object portraits.portrait() takes, or null.
export function advisorPerson(key, { idea = false } = {}) {
  const a = ADVISORS[key];
  if (!a) return null;
  const { ideaT, ...rest } = a;
  return { ...rest, appearance: { ...a.appearance }, pose: idea ? 'idea' : null, poseT: idea ? ideaT : null };
}
