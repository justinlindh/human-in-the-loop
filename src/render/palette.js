// Every color the renderer uses. Warm neutrals dominate; saturation is reserved for
// people, screens, plants, and alerts. Darkest surface is ink, brightest is paper.

export const PALETTE = {
  // Extremes
  ink: '#2a2630',
  paper: '#fbf5ea',

  // Structure
  wall_cream: '#f0e4cf',
  wall_warm: '#e9d6b8',
  wall_sage: '#c9d3b8',
  wall_trim: '#d6bf9c',
  baseboard: '#b89b78',
  slab_edge: '#6f6259',
  slab_side: '#8a7a6c',
  floor_concrete: '#bdb5aa',
  floor_concrete_dark: '#a89f94',
  floor_carpet: '#a3a9b4',
  floor_carpet_alt: '#949ba8',
  floor_wood: '#d7a975',
  floor_wood_dark: '#c4935f',
  floor_tile: '#e7dfd2',
  floor_tile_alt: '#d6cdbf',
  rug_teal: '#5d8f8b',
  rug_mustard: '#d4a24a',

  // Furniture
  wood_honey: '#d39b5d',
  wood_light: '#e6c18f',
  wood_dark: '#8d5d3e',
  wood_walnut: '#6d4a37',
  laminate: '#efe7da',
  metal_soft: '#b9bcc4',
  metal_dark: '#4d4a55',
  plastic_white: '#f2ece1',
  plastic_charcoal: '#3b3742',
  fabric_sage: '#8eab8a',
  fabric_teal: '#4f8a87',
  fabric_mustard: '#d8a444',
  fabric_terracotta: '#c7734f',
  fabric_slate: '#6c7589',
  cardboard: '#c9a06e',
  paper_sheet: '#f7f1e6',
  whiteboard: '#f6f3ee',
  marker_blue: '#4f7fd9',
  marker_green: '#3f9f6b',
  marker_orange: '#e08a3c',
  glass: '#bcdde8',
  water: '#9fcfe0',
  glass_frame: '#8f8a86',
  gold: '#e3b04b',
  mug: '#f1ebe0',
  coffee: '#5a3a2a',

  // Nature
  leaf: '#5ea35a',
  leaf_dark: '#3d7c46',
  leaf_light: '#8fc66e',
  pot_terracotta: '#c77b52',
  pot_cream: '#ece2d1',
  soil: '#5a4234',

  // People
  skin_0: '#f6d5bd',
  skin_1: '#eec29f',
  skin_2: '#d9a27a',
  skin_3: '#b87b53',
  skin_4: '#8e5a3b',
  skin_5: '#5f3b28',
  eye: '#2f2a33',
  blush: '#eea596',

  // Role accents (match ROLES colors in the sim data)
  role_engineer: '#4f8cff',
  role_designer: '#ff7eb6',
  role_marketer: '#ffb020',
  role_support: '#34c38f',
  role_security: '#e5484d',
  role_sales: '#9b6bff',

  // Emissives
  screen_bg: '#1e2333',
  screen_blue: '#62b4ff',
  screen_cyan: '#5fe0d0',
  screen_green: '#7be38f',
  screen_amber: '#ffc15e',
  screen_pink: '#ff8fc4',
  screen_off: '#2d2b35',
  led_green: '#3ee07a',
  led_amber: '#ffb238',
  led_red: '#ff4d4d',
  alarm_red: '#ff3b3b',
  lamp_warm: '#ffcf96',
  city_lit: '#ffd27a',

  // Tone colors for floating labels
  tone_features: '#4f8cff',
  tone_polish: '#ff7eb6',
  tone_reliability: '#34c38f',
  tone_novelty: '#ffb020',
  tone_good: '#34c38f',
  tone_bad: '#e5484d',

  // Sky and light
  sky_day_top: '#f4e9d8',
  sky_day_bottom: '#e6d3b6',
  sky_dusk_top: '#e9c9b0',
  sky_dusk_bottom: '#c9a7a4',
  sky_night_top: '#1f2445',
  sky_night_bottom: '#343a66',
  window_day: '#d3ebf5',
  window_night: '#22305a',
  sun_day: '#ffe4bf',
  sun_dusk: '#ffb27a',
  moon: '#9cb0ff',
  hemi_sky_day: '#d6e2fa',
  hemi_ground_day: '#e8d2b0',
  hemi_sky_night: '#4a5590',
  hemi_ground_night: '#3a3148',
};

export const ROLE_COLORS = {
  engineer: PALETTE.role_engineer,
  designer: PALETTE.role_designer,
  marketer: PALETTE.role_marketer,
  support: PALETTE.role_support,
  security: PALETTE.role_security,
  sales: PALETTE.role_sales,
};

export const SKINS = [0, 1, 2, 3, 4, 5].map((i) => PALETTE[`skin_${i}`]);
