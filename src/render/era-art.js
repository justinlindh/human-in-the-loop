import { calendarDate } from '../sim/util.js';

// Fixed previews serve the mock scenes; founded careers follow their saved calendar and era.
const query = new URLSearchParams(globalThis.location?.search ?? '');
const ERAS = ['preinternet', 'dotcom', 'dotcom-bust', 'web2', 'classic', 'chatgbt', 'agents', 'consolidation', 'plateau', 'calendar'];
const selected = query.get('eraArt');
export const ERA_ART_PREVIEW = query.has('eras') && ERAS.includes(selected);
export const ERA_ART_MODELS = ERA_ART_PREVIEW ? [
  'era_crt_desk', 'era_cubicle', 'era_sock_billboard',
  'era_retail_boxes', 'era_floppy_stack', 'era_cd_spindle', 'era_dotcom_board',
  'era_web2_badge', 'era_y2k_clock', 'era_y2k_sticker', 'era_payphone', 'era_video_sign',
  'era_pager_billboard', 'era_lease_billboard', 'era_beta_billboard', 'era_led_billboard',
] : [];

export const eraArtCrt = (era) => ERA_ART_PREVIEW && ['preinternet', 'dotcom', 'dotcom-bust'].includes(era);

export function eraArtEra(state) {
  const actual = state.era?.id ?? 'classic';
  if (!ERA_ART_PREVIEW) return actual;
  if (selected !== 'calendar' && !state.founding?.startEra) return selected;
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
  classic: ['LUNCH LOOP', 'GOOD FOOD. ONE TAP.'],
  chatgbt: ['DRAFT BUDDY', 'A SECOND PAIR OF WORDS.'],
  agents: ['ERRAND CLOUD', 'LET THE LITTLE BOTS DO IT.'],
  consolidation: ['ONE SUITE', 'EVERY TAB UNDER ONE ROOF.'],
  plateau: ['MADE HERE', 'PEOPLE. TASTE. TIME.'],
};
