import { PALETTE, SKINS, ROLE_COLORS } from './palette.js';

// A character's look, from the sim's appearance and role: the single source for the office
// characters (character.js) and anything drawn flat (UI portraits). No three.js here.
//
// characterLook(appearance, role) -> {
//   skin, hairColor, shirt, pants, hatColor: '#rrggbb' (null without a hat),
//   hair: 0..12 (the style drawn), build: 0..2, accessory: 'none'|'glasses'|'headphones'|'beanie'|'cap',
//   capBack: bool, print: a chest graphic id or null, garment: 'hood'|'hood_tucked'|'scarf'|'blazer'|'headset'|'vest'|'jacket'|null,
//   roleColor: '#rrggbb',
//   linear: { skin, hairColor, shirt, pants, hatColor }   // [r, g, b] in linear light, for rendering
// }
//
// Rules: appearance colors are muted a little and kept off pure black; a shirt too close to the
// role color is swapped for a palette fabric; support wears only its headset (glasses allowed); a
// hat takes a color (and, for a cap, a direction) from a hash of the look; an engineer with long hair
// wears the hoodie without its hood. The sim picks hair 0..7; a hash of the look moves some people
// onto the extra styles 8..12, and gives most people in a role that shows its shirt a role graphic.

const toLinear = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
const toSRGB = (c) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055);
function lin(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}
function hexOf(c) {
  const b = (v) => Math.max(0, Math.min(255, Math.round(toSRGB(Math.max(0, v)) * 255)));
  return `#${((b(c[0]) << 16) | (b(c[1]) << 8) | b(c[2])).toString(16).padStart(6, '0')}`;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const luma = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const INK = lin(PALETTE.ink);
const INK_L = luma(INK);

// Appearance colors come from sim data: kept off pure black and slightly muted so the palette's
// saturated accents stay special.
export function characterColor(hex, mute = 0.15) {
  let c = lin(hex);
  const l = luma(c);
  if (l < INK_L) c = lerp(c, INK, 1 - l / Math.max(INK_L, 1e-4));
  return lerp(c, [l, l, l], mute);
}

// A shirt close to the role color would swallow the role garment, so it is swapped for another
// palette fabric far from that color; the pick follows the original shirt, so a person keeps theirs.
const SHIRT_SWAPS = ['fabric_teal', 'fabric_mustard', 'fabric_terracotta', 'fabric_sage', 'wood_light'];
const CLASH = 0.35;
export function shirtColor(hex, roleHex) {
  const c = characterColor(hex);
  const r = lin(roleHex);
  if (dist(c, r) >= CLASH) return c;
  const ok = SHIRT_SWAPS.map((k) => characterColor(PALETTE[k])).filter((s) => dist(s, r) >= CLASH);
  let h = 0;
  for (const ch of String(hex)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ok.length ? ok[h % ok.length] : c;
}

const HAT_COLORS = ['fabric_teal', 'fabric_terracotta', 'fabric_mustard', 'fabric_slate', 'fabric_sage', 'wood_walnut'];
export function hashLook(a) {
  const s = `${a.hairColor}|${a.shirt}|${a.pants}|${a.skin}|${a.hair}`;
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Extra hair styles: 8 afro, 9 space buns, 10 mohawk, 11 buzz cut, 12 pigtails. Only the buzz cut
// fits under a band and ear cups (headphones, or support's headset).
const EXTRA_HAIR = [8, 9, 10, 11, 12];
const HEADPHONE_HAIR = new Set([11]);
function hairStyle(a, accessory, role, h) {
  const base = Math.max(0, Math.min(7, a.hair ?? 0));
  if (a.style != null) return a.style;
  const k = (h >>> 5) % 13;
  if (k < 8) return base;
  const style = EXTRA_HAIR[k - 8];
  return (accessory === 'headphones' || role === 'support') && !HEADPHONE_HAIR.has(style) ? base : style;
}

// Chest graphics by role, for the roles whose shirt front shows: sales wears a tie, security a vest,
// and a marketer's blazer closes over the chest.
export const PRINTS = {
  engineer: ['brackets', 'branch', 'terminal'],
  designer: ['pen', 'swatches', 'bezier'],
  support: ['heart', 'chat'],
};
function printFor(a, role, h) {
  if (a.print !== undefined) return a.print;
  const list = PRINTS[role];
  if (!list || (h >>> 9) % 3 === 0) return null;
  return list[(h >>> 11) % list.length];
}

const GARMENT = { engineer: 'hood', designer: 'scarf', marketer: 'blazer', support: 'headset', security: 'vest', sales: 'jacket' };
const LONG_HAIR = 2;

export function characterLook(appearance = {}, role = null, roleColor = null) {
  const a = appearance ?? {};
  const roleHex = roleColor ?? ROLE_COLORS[role] ?? PALETTE.role_engineer;
  const accessory = role === 'support' && a.accessory !== 'glasses' ? 'none' : a.accessory ?? 'none';
  const hat = accessory === 'beanie' || accessory === 'cap';
  const h = hashLook(a);
  const hair = hairStyle(a, accessory, role, h);
  const linear = {
    skin: lin(SKINS[a.skin ?? 1] ?? SKINS[1]),
    hairColor: characterColor(a.hairColor ?? '#4a3222', 0.05),
    shirt: shirtColor(a.shirt ?? '#4f8cff', roleHex),
    pants: characterColor(a.pants ?? '#2e3440', 0.1),
    hatColor: hat ? lin(PALETTE[HAT_COLORS[h % HAT_COLORS.length]]) : null,
  };
  let garment = GARMENT[role] ?? null;
  if (garment === 'hood' && hair === LONG_HAIR && !hat) garment = 'hood_tucked';
  return {
    skin: hexOf(linear.skin), hairColor: hexOf(linear.hairColor), shirt: hexOf(linear.shirt), pants: hexOf(linear.pants),
    hatColor: linear.hatColor ? hexOf(linear.hatColor) : null,
    hatName: hat ? HAT_COLORS[h % HAT_COLORS.length] : null,
    hair, build: Math.max(0, Math.min(2, a.build ?? 1)), accessory,
    capBack: accessory === 'cap' && (a.capBack ?? h % 4 === 1),
    garment, print: printFor(a, role, h), roleColor: roleHex, linear,
  };
}
