import { PALETTE, SKINS, ROLE_COLORS } from './palette.js';

// A character's look, from the sim's appearance and role: the single source for the office
// characters (character.js) and anything drawn flat (UI portraits). No three.js here.
//
// characterLook(appearance, role) -> {
//   skin, hairColor, shirt, pants, hatColor: '#rrggbb' (null without a hat),
//   hair: 0..7, build: 0..2, accessory: 'none'|'glasses'|'headphones'|'beanie'|'cap',
//   capBack: bool, garment: 'hood'|'hood_tucked'|'scarf'|'blazer'|'headset'|'vest'|'jacket'|null,
//   roleColor: '#rrggbb',
//   linear: { skin, hairColor, shirt, pants, hatColor }   // [r, g, b] in linear light, for rendering
// }
//
// Rules: appearance colors are muted a little and kept off pure black; a shirt too close to the
// role color is swapped for a palette fabric; support wears only its headset (glasses allowed); a
// hat takes a color (and, for a cap, a direction) from a hash of the look; an engineer with long hair
// wears the hoodie without its hood.

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

const GARMENT = { engineer: 'hood', designer: 'scarf', marketer: 'blazer', support: 'headset', security: 'vest', sales: 'jacket' };
const LONG_HAIR = 2;

export function characterLook(appearance = {}, role = null, roleColor = null) {
  const a = appearance ?? {};
  const roleHex = roleColor ?? ROLE_COLORS[role] ?? PALETTE.role_engineer;
  const accessory = role === 'support' && a.accessory !== 'glasses' ? 'none' : a.accessory ?? 'none';
  const hat = accessory === 'beanie' || accessory === 'cap';
  const hair = Math.max(0, Math.min(7, a.hair ?? 0));
  const h = hashLook(a);
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
    garment, roleColor: roleHex, linear,
  };
}
