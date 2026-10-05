// The render lane's spotlight policy. Durations are presentation estimates for the pacing tool;
// a live scene ends from its actors, and may supply a more precise expectedSeconds.
import { B } from '../sim/balance.js';

export const MOMENT_KINDS = {
  y2k_rollover: { spotlight: true, seconds: B.y2k.gatherSeconds + B.y2k.countdownSeconds + B.y2k.anticlimaxSeconds + B.y2k.invoiceSeconds, zoom: 1.8 },
  printer_jam: { spotlight: true, seconds: 22, zoom: 1.8 },
  first_user_test: { spotlight: true, seconds: 12, zoom: 2 },
  efficiency_consultants: { spotlight: true, seconds: 12, zoom: 2 },
  open_plan_office: { spotlight: true, seconds: 3.3, zoom: 2 },
  waffle_party: { spotlight: true, seconds: 16, zoom: 1.6 },
  music_night: { spotlight: true, seconds: 90, zoom: 1.6 },
  letter: { spotlight: true, seconds: 7, zoom: 2, caption: 'An envelope, a deep breath, and some unwelcome news.' },
  fumes: { spotlight: true, seconds: 6, zoom: 2, caption: 'Something is smoking. Someone has volunteered to fan it.' },
  carrier: { spotlight: true, seconds: 7, zoom: 2, caption: 'There is someone new in the carrier.' },
  // Routine life and ambient celebrations play on without holding the clock: only scenes that
  // follow from a decision (and the staged moments above) spotlight.
  pizza: { spotlight: false },
  screen: { spotlight: false },
  company_party: { spotlight: false },
  promotion: { spotlight: false, seconds: 6 },
  legend: { spotlight: false, seconds: 6 },
  top_level: { spotlight: false, seconds: 6 },
  standup: { spotlight: false },
  respond: { spotlight: false },
  // A notable deal: the seller's hand up at the desk while the week plays on.
  deal: { spotlight: false, seconds: 3 },
  // Someone fired: the nearest colleagues turn to watch them go, shocked.
  fired: { spotlight: false, seconds: 2 },
  coffee: { spotlight: false },
  pair: { spotlight: false },
  // The office robot slapped back to life: a breakdown never holds the clock.
  robot: { spotlight: false, seconds: 5 },
};
