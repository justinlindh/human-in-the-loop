import { B } from '../sim/balance.js';
// Office classics: the banner, the TPS report cover sheets, the red stapler, the efficiency consultants, the
// printer and the Saturday ask. Each fires at most once a run. Text lives here so any line is a one-line swap.
// Chat effects: { from, text, channel } posts to Yak; {first} is the subject's first name.

const N = B.nods;
const ONCE = 100000;
const k = (n) => `$${Math.round(n / 1000)}k`;

// Who the consultants may interview out of a job: nobody on leave, no founder, nobody hired recently.
export const cuttable = (state) => state.staff.filter((p) => !p.founder && p.mood !== 'away' && state.week - (p.hiredWeek ?? 0) >= N.consultantNewHireWeeks);

// A rough read of someone's weekly output, as the consultants see it: their best skill at their pace.
export const consultantRating = (p) => Math.max(0, ...Object.values(p.skills ?? {})) * (p.speed ?? 1);

export const OFFICE_NODS = [
  {
    id: 'banner_company', kind: 'leadership', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'randomStaff', eras: ['consolidation'],
    when: (s) => s.staff.length >= N.bannerStaff,
    title: 'A new banner',
    text: '{name} ordered a banner for the break room. In 96-point type it asks: "Is This Good For The Company?" Nobody remembers approving it.',
    stage: { prop: 'banner_company', anchor: 'wall' },
    choices: [
      { label: 'Hang it', hint: 'Output up a little for 26 weeks; meaning drains a little faster', effects: { modifier: [
        { key: 'output', value: N.bannerOutput, weeks: N.bannerWeeks, label: 'The banner' },
        { key: 'meaningDrain', value: N.bannerDrain, weeks: N.bannerWeeks, label: 'The banner, looming' }] },
      leaves: { prop: 'banner_company', until: { weeks: N.bannerStays } }, outcome: 'It goes up over the kitchen. People start asking it out loud before lunch orders.' },
      { label: 'Hang it, ironically', hint: 'Team meaning up a little; a visitor might miss the joke', effects: { teamMeaning: 2, gamble: { p: N.bannerIronyMiss, effects: { brand: -1,
        chat: { from: '@officebot', channel: 'random', text: 'A visiting investor photographed the banner and posted it with no irony at all. It has 4,000 likes. Most of them sincere.' } } } },
      leaves: { prop: 'banner_company', until: { weeks: N.bannerStays } }, outcome: 'It goes up with one sarcastic sticky note on the corner. Morale, somehow, improves.' },
      { label: 'Send it back', hint: `$${N.bannerReturnFee} restocking fee`, effects: { cash: -N.bannerReturnFee }, outcome: 'The courier asks if you are sure. You have never been more sure.' },
    ],
  },
  {
    id: 'cover_sheets', kind: 'leadership', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'workingStaff',
    when: (s) => s.staff.length >= N.coverStaff,
    title: 'The new cover sheets',
    text: 'Starting Monday, every TPS report needs the new cover sheet. {name} forgot it once, on a Tuesday. Facilities noticed.',
    stage: { prop: 'cover_sheets', anchor: 'subjectDesk' },
    choices: [
      { label: 'Mandate it', hint: 'Output down a little for 26 weeks; knowledge up; {name} will hear about it', effects: {
        modifier: { key: 'output', value: N.coverOutput, weeks: N.coverWeeks, label: 'TPS cover sheets' }, ik: N.coverIk, later: [
          { inWeeks: 1, effects: { chat: { from: '@facilities', text: 'Hi {first}. Did you get the memo about the cover sheets on the TPS reports?' } } },
          { inWeeks: 2, effects: { chat: { from: '@facilities', text: '{first}, friendly reminder: cover sheet. On the TPS report. I will send you another copy of that memo.' } } },
          { inWeeks: 3, effects: { chat: { from: '@facilities', text: 'Hey {first}. I went ahead and printed the memo and left it on your chair. Both of them.' } } },
        ] }, outcome: 'The cover sheet has a logo, a date field, and a field for when the date field was filled in.' },
      { label: 'Quietly lose the memo', hint: 'Team meaning up a little', effects: { teamMeaning: 1 }, outcome: 'The memo goes in the recycling. Nobody files a report about it. Nobody could: no cover sheet.' },
    ],
  },
  {
    id: 'the_stapler', kind: 'staff', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'veteranStaff',
    when: () => true,
    title: 'The red stapler',
    text: '{name} has a red stapler. It is not the company stapler. Facilities would like to standardize the staplers.',
    stage: { prop: 'stapler', anchor: 'subjectDesk' },
    choices: [
      { label: 'Standardize the staplers', hint: `{name}'s meaning drops hard, and some of it comes back later; saves $${N.staplerSaving}`, effects: { cash: N.staplerSaving, meaning: -N.staplerLoss, later: [
        { inWeeks: N.staplerBackWeeks, effects: { meaning: N.staplerBack, chat: { from: '@officebot', channel: 'random', text: '{first} found their red stapler in the lost and found. They are keeping it. Case closed.' } } },
      ] }, outcome: '{name} hands it over without a word. Then says several words, quietly, to the stapler.' },
      { label: 'Let them keep it', hint: "{name}'s meaning up a little", effects: { meaning: N.staplerKeep, ownerFlag: 'staplerOwner' },
        leaves: { prop: 'stapler', until: { flag: 'staplerOwnerGone' } }, outcome: 'The stapler stays. Everyone is a little afraid of it now.' },
    ],
  },
  {
    id: 'efficiency_consultants', kind: 'leadership', weight: 2, cooldownWeeks: ONCE, random: true, subject: null, eras: ['consolidation'], marks: 'layoffWeek',
    when: (s) => s.staff.length >= N.consultantStaff && cuttable(s).length >= N.consultantMinEligible
      && s.week - (s.flags.layoffWeek ?? -ONCE) >= N.layoffGapWeeks,
    title: 'The consultants',
    text: 'Two efficiency consultants, both named Rob, will interview everyone this week. Their first question: "So what would you say you do here?"',
    stage: { prop: 'visitor_chair', anchor: 'door' },
    choices: [
      { label: 'Let them work', hint: `${k(N.consultantFee)}; the two they rate lowest are let go; output up for 26 weeks; team meaning down`, effects: {
        cash: -N.consultantFee, efficiencyCuts: N.consultantCuts, teamMeaning: N.consultantMeaning,
        modifier: { key: 'output', value: N.consultantOutput, weeks: N.consultantWeeks, label: 'Post-consultant hustle' } },
      outcome: 'The Robs recommend two departures and a new cover sheet. Everyone else walks a little faster past the meeting room.' },
      { label: 'Take the report, file it', hint: `${k(N.consultantFee)}, and nothing changes`, effects: { cash: -N.consultantFee }, outcome: 'The report is 140 pages. It is filed under R, for Rob.' },
      { label: 'Send them home', hint: 'Brand down a little: they will blog about it', effects: { brand: -1 }, outcome: 'The Robs leave. Their blog post is called "Culture Fit: A Warning". Four people forward it to you.' },
    ],
  },
  {
    id: 'printer_jam', kind: 'misc', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'randomStaff',
    when: (s) => s.officeStage >= 1,
    chat: 'The printer is jammed. Again.',
    title: 'PC LOAD LETTER',
    text: 'The printer has jammed for the ninth time this week. It says PC LOAD LETTER. It has letter. It has always had letter. {name} has been staring at it for a while.',
    stage: { prop: 'printer_jammed', anchor: 'kitchen' },
    choices: [
      { label: 'Take it out back', hint: `Team meaning up; ${k(N.printerCost)} for a new printer`, effects: { teamMeaning: N.printerMeaning, cash: -N.printerCost },
        leaves: { prop: 'printer_wrecked', until: { weeks: N.printerWreckWeeks } }, outcome: 'Three people carry it out to the parking lot. What happens next stays between them and the printer. Everyone comes back smiling.' },
      { label: 'Call the repair line', hint: `$${N.printerRepair}`, effects: { cash: -N.printerRepair }, outcome: 'A technician shows up, says "huh", and leaves. It works now. Nobody knows why.' },
      { label: 'Print less', hint: 'Output down a little for 13 weeks', effects: { modifier: { key: 'output', value: N.printLessOutput, weeks: N.printLessWeeks, label: 'Paperless, grudgingly' },
        later: [{ inWeeks: 1, effects: { chat: { from: '@officebot', channel: 'random', text: 'Reminder: the printer is out of order. Printing is a state of mind now.' } } }] },
      outcome: 'A sign goes up over the printer: OUT OF ORDER. FOREVER.' },
    ],
  },
  {
    id: 'saturday_ask', kind: 'leadership', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'seniorStaff',
    when: (s) => s.staff.length >= N.saturdayStaff,
    title: 'About Saturday',
    text: '{name} leans on your desk holding a coffee mug. "Yeahhh. So if you could go ahead and have everyone come in on Saturday, that would be great."',
    choices: [
      { label: 'Saturday it is', hint: 'Output up for 2 weeks; everyone more strained; team meaning down', effects: {
        modifier: { key: 'output', value: N.saturdayOutput, weeks: N.saturdayWeeks, label: 'Saturdays' }, teamStrain: N.saturdayStrain, teamMeaning: N.saturdayMeaning },
      outcome: 'Saturday happens. Someone brings bagels. Nobody forgives anyone.' },
      { label: 'No. Mmkay?', hint: '{name} is put out; team meaning up a little', effects: { teamMeaning: N.saturdayNoTeam, meaning: N.saturdayNoSubject },
        outcome: '{name} says "Okay. Great." in a way that means neither.' },
    ],
  },
];
