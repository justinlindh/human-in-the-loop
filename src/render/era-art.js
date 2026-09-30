import { calendarDate } from '../sim/util.js';

// Era art is on for a fixed preview (`?eras&eraArt=<era>`, the mock scenes) and, with `?eras`, for any
// company founded in an era mode, which follows its saved calendar and era. A Classic founding keeps
// the ordinary office.
const query = new URLSearchParams(globalThis.location?.search ?? '');
const ERAS = ['preinternet', 'dotcom', 'dotcom-bust', 'web2', 'classic', 'chatgbt', 'agents', 'consolidation', 'plateau', 'calendar'];
const ERAS_ON = query.has('eras');
const selected = query.get('eraArt');
export const ERA_ART_PREVIEW = ERAS_ON && ERAS.includes(selected);
// Loaded with `?eras` alone too: a founded era career is chosen after the models load.
export const ERA_ART_MODELS = ERAS_ON ? [
  'era_crt_desk', 'era_cubicle', 'era_sock_billboard',
  'era_retail_boxes', 'era_floppy_stack', 'era_cd_spindle', 'era_dotcom_board',
  'era_web2_badge', 'era_y2k_clock', 'era_y2k_sticker', 'era_payphone', 'era_video_sign',
  'era_pager_billboard', 'era_lease_billboard', 'era_beta_billboard', 'era_led_billboard',
  'era_desk_phone', 'era_dot_matrix', 'era_fax', 'era_rolodex', 'era_corkboard',
] : [];

const eraArtOn = (state) => ERA_ART_PREVIEW || (ERAS_ON && !!state.founding?.startEra);
// Whether the company the renderer last synced wears era art; builds read it.
let active = ERA_ART_PREVIEW;
export const eraArtActive = () => active;
export const eraArtCrt = (era) => active && ['preinternet', 'dotcom', 'dotcom-bust'].includes(era);

// The renderer calls this at the top of each sync, before anything is built.
export function syncEraArt(state) {
  active = eraArtOn(state);
  return eraArtEra(state);
}

export function eraArtEra(state) {
  const actual = state.era?.id ?? 'classic';
  if (!eraArtOn(state)) return actual;
  if (ERA_ART_PREVIEW && selected !== 'calendar' && !state.founding?.startEra) return selected;
  if (actual === 'dotcom' && state.flags?.dotcom) return state.flags.dotcom.phase === 'bust' ? 'dotcom-bust' : 'dotcom';
  if (actual === 'preinternet' || actual === 'web2') return actual;
  const year = calendarDate(state).year;
  if (year < 1995) return 'preinternet';
  if (year < 2001) return 'dotcom';
  if (year < 2004) return 'dotcom-bust';
  if (year < 2019) return 'web2';
  return ['classic', 'chatgbt', 'agents', 'consolidation', 'plateau'].includes(actual) ? actual : 'classic';
}

export function eraBillboard(era) {
  if (era === 'preinternet') return ['era_pager_billboard', 'painted'];
  if (era === 'dotcom') return ['era_sock_billboard', 'painted'];
  if (era === 'dotcom-bust') return ['era_lease_billboard', 'box'];
  if (era === 'web2') return ['era_beta_billboard', 'box'];
  return ['era_led_billboard', 'led'];
}

export const ERA_ADS = {
  classic: ['Disrupting', 'Tuesday.'],
  chatgbt: ['Prompt Engineer.', '$400K.'],
  agents: ['Pay-per-thought.', 'Our agents', 'think a LOT.'],
  consolidation: ['This billboard', 'has been', 'acquired.'],
  plateau: ['MADE BY', 'HUMANS*', '*mostly'],
};
