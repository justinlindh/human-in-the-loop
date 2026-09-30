import { hashLook } from './look.js';
import { PALETTE } from './palette.js';
import { ERA_ART_PREVIEW, eraArtEra } from './era-art.js';

const query = new URLSearchParams(globalThis.location?.search ?? '');
export const WARDROBE_MODELS = query.has('eras') ? ['era_attire'] : [];
export const TEE_PRINTS = ['parcel_paws', 'onlineland', 'y2k', 'shoutbook', 'tuesday', 'beta_forever', 'weekend', 'ship_it'];

const TEES = {
  parcel_paws: { shirt: 'fabric_teal', trim: 'wall_cream', neckline: 'ringer' },
  onlineland: { shirt: 'wall_cream', trim: 'fabric_slate', neckline: 'raglan', longSleeve: true },
  y2k: { shirt: 'fabric_mustard', trim: 'ink', neckline: 'ringer' },
  shoutbook: { shirt: 'metal_soft', trim: 'metal_soft' },
  tuesday: { shirt: 'fabric_terracotta', trim: 'wall_cream', neckline: 'ringer' },
  beta_forever: { shirt: 'fabric_teal', trim: 'fabric_teal', allOver: true, longSleeve: true },
  weekend: { shirt: 'plastic_charcoal', trim: 'plastic_charcoal' },
  ship_it: { shirt: 'paper', trim: 'fabric_teal', neckline: 'raglan' },
};

export function wardrobeEra(state) {
  if (!query.has('eras')) return null;
  const era = ERA_ART_PREVIEW ? eraArtEra(state) : state?.founding?.startEra ? state.era?.id : null;
  return ['preinternet', 'dotcom', 'dotcom-bust', 'web2'].includes(era) ? era : null;
}

// Clothes follow the career; each person's cut and print stay stable within that wardrobe.
export function wardrobeLook(appearance, era) {
  if (!era) return null;
  const h = hashLook(appearance);
  const variant = appearance.wardrobeVariant ?? h % 4;
  if (era === 'preinternet') return {
    era, cut: 'shirt', leg: 'khaki', glasses: true,
    shirt: PALETTE[['paper', 'wall_sage', 'wall_cream', 'metal_soft'][h % 4]], pants: PALETTE.wall_trim,
  };
  const web = era === 'web2';
  const cut = variant === 3 ? 'tee' : web ? 'hoodie' : variant === 2 ? 'polo' : 'fleece';
  const prints = web ? TEE_PRINTS.slice(3) : TEE_PRINTS.slice(0, 3);
  const print = appearance.eraPrint ?? prints[(h >>> 5) % prints.length];
  const tee = cut === 'tee' ? TEES[print] : null;
  return {
    era, cut, leg: web ? 'jeans' : 'cargo', glasses: false,
    shirt: PALETTE[tee?.shirt ?? ['fabric_sage', 'fabric_slate', 'wall_cream', 'fabric_teal'][h % 4]],
    pants: PALETTE[web ? 'plastic_charcoal' : 'wall_trim'],
    print, tee,
  };
}
