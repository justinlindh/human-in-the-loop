import { B } from '../sim/balance.js';

const fee = B.y2k.consultantRate * B.y2k.consultantMultiplier;
export const Y2K_PROJECT = { id: 'y2k_compliance', name: 'Y2K compliance', desc: 'Mostly renaming date fields.' };
export const Y2K_EVENTS = [{
  id: 'dotcom_y2k_oncall', kind: 'era', random: false, weight: 0, cooldownWeeks: B.dotcom.sockCooldown,
  eras: ['dotcom'], subject: null, when: () => true,
  title: 'Who volunteers for New Year’s Eve?',
  text: 'Clive, our millennium consultant, charges triple. His checklist says to rename date to date_four_digits. Paying Y2K compliance contracts are in Build > Projects. Someone still needs to watch the servers at midnight.',
  choices: [
    { label: 'I’ll take the pager', hint: 'Founder on call. No cost or work penalty.', effects: { dotcom: 'y2k_founder' }, outcome: 'The founder volunteers. The team promises to bring the cheapest champagne with a cork.' },
    { label: 'Share the watch', hint: 'Team on call. No cost or work penalty.', effects: { dotcom: 'y2k_team' }, outcome: 'Everyone takes a turn watching the same green light. A very small rota is laminated.' },
    { label: 'Book Clive at triple rate', hint: `$${fee.toLocaleString('en-US')}. No extra protection; it is a very confident checklist.`, requires: 'affordY2kConsultant',
      effects: { dotcom: 'y2k_consultant' }, outcome: 'Clive invoices at triple his usual rate. The invoice is certified millennium-ready.' },
  ],
}];

export const Y2K_REPLIES = [
  'Nothing broke because I renamed every date field. You are welcome, next century.',
  'Pretty sure it was my backup of the backup. I labelled both disks.',
  'I tested midnight at lunchtime. That is twelve hours of advance warning.',
  'My checklist had a checkbox for the checklist. Hard to argue with the results.',
  'I watched the green light the entire time. It stayed green. That was me.',
];
