// Random and triggered events. `when(state, h)` receives helpers from the sim:
// h = { B, mrr, live, bestScore, usesModel(id), offerReady }. Optional eras: [eraIds] limits an event to those eras;
// without it an event is kept out of the Classic era when its text mentions AI. marks: a flag set to the week it is raised.
// funding: only for companies funded that way.
// Placeholders in title/text: {name} (subject staff), {product} (subject product), {company}, {incumbent}, {rival}, {rivalFounder}.
// Effects apply to the subject (staff or product) where the key is per-subject; see EFFECT_KEYS below.

export const SUBJECTS = [
  null, 'randomStaff', 'seniorStaff', 'juniorStaff', 'unmentoredJunior', 'burnoutStaff', 'coastingStaff', 'workingStaff',
  'automatedSenior', 'mentorStaff', 'founder', 'randomProduct',
];

export const EVENT_KINDS = ['staff', 'leadership', 'market', 'vendor', 'incident', 'cyber', 'annual', 'misc', 'era', 'world'];

export const EFFECT_KEYS = [
  'cash', 'brand', 'debt', 'ik', 'hype', 'customersPct', 'health', 'meaning', 'knowledge', 'teamMeaning',
  'resign', 'assign', 'candidates', 'flag', 'win', 'salaryPct', 'startCraft', 'gpuShortageWeeks',
  'clones', 'priceHike', 'vendorOutage', 'migrateOff', 'modelBoost', 'cond', 'gamble',
  'later', 'modifier', 'followUp', 'awayWeeks', 'setAutomation', 'automationBump', 'pivot', 'teamSalaryPct',
  'consultants', 'clearOutage', 'buyItem', 'upgradeItem', 'openOffer', 'workPolicy', 'adoptPet', 'rivalHit', 'rivalFate',
  'mission', 'purpose',
];


// Named tests usable in `cond` effects and in a choice's `requires`.
export const CONDITION_IDS = [
  'subjectCompliant', 'trustedVendor', 'blameless', 'ik40', 'bestScore7', 'sabbaticalPolicy', 'stage1', 'mentorAvailable',
  'affordConsultants', 'noCraftRunning', 'canBuyEspresso', 'canUpgradeEspresso',
];

const ONCE = 100000;

const list = [
  // Staff
  {
    id: 'senior_grumble', kind: 'staff', weight: 3, cooldownWeeks: 20, random: true, subject: 'automatedSenior',
    when: (s) => s.automation.engineering.level >= 0.5,
    title: 'A senior has concerns',
    text: '{name} corners you in the kitchen: "Is my job just reviewing robot PRs now?"',
    choices: [
      { label: 'Give them a hard problem', hint: 'Meaning up, off regular work', effects: { assign: { type: 'hardProblem' }, meaning: 6 }, outcome: '{name} is already sketching on the whiteboard.' },
      { label: 'Talk it through over lunch', hint: 'Small cost, meaning up', effects: { cash: -500, meaning: 8 }, outcome: 'Good tacos. Better conversation.' },
      { label: 'Tell them to embrace the future', hint: 'Meaning down', effects: { meaning: -6 }, outcome: '{name} nods slowly and says nothing.' },
    ],
  },
  {
    id: 'junior_asks_mentor', kind: 'staff', weight: 3, cooldownWeeks: 16, random: true, subject: 'unmentoredJunior',
    when: () => true,
    title: 'Can someone show me how this works?',
    text: '{name} has been stuck on the same error for two days and finally asks for a mentor.',
    choices: [
      { label: 'Pair them with a senior', hint: 'A mid or senior becomes their mentor', requires: 'mentorAvailable', effects: { assign: { type: 'mentor' }, meaning: 5 }, outcome: 'The whiteboard fills with boxes and arrows.' },
      { label: 'Point them at the docs', hint: 'Meaning down', effects: { meaning: -4 }, outcome: 'The docs were last updated by someone who left.' },
    ],
  },
  {
    id: 'resignation_letter', kind: 'staff', weight: 4, cooldownWeeks: 12, random: true, subject: 'burnoutStaff',
    when: () => true,
    title: 'A letter on your desk',
    text: '{name} hands you an envelope. It is not a birthday card.',
    choices: [
      { label: 'Counter-offer', hint: '+15% salary, meaning up', effects: { salaryPct: 15, meaning: 20 }, outcome: '{name} stays. For now.' },
      { label: 'Suggest a sabbatical', hint: 'Needs the Sabbatical Program', requires: 'sabbaticalPolicy', effects: { assign: { type: 'sabbatical' } }, outcome: '{name} is going somewhere with no Wi-Fi.' },
      { label: 'Accept it gracefully', hint: 'They leave', effects: { resign: true }, outcome: 'Cake in the kitchen at 4. Nobody eats it.' },
    ],
  },
  {
    id: 'burnout_warning', kind: 'staff', weight: 2, cooldownWeeks: 10, random: true, subject: 'burnoutStaff',
    when: () => true,
    title: 'Warning signs',
    text: '{name} has been staring at the same diff for an hour. The diff is one line.',
    auto: { teamMeaning: -1 },
  },
  {
    id: 'poached_by_bigco', kind: 'staff', weight: 2, cooldownWeeks: 26, random: true, subject: 'seniorStaff',
    when: (s) => s.week >= 26,
    title: 'A recruiter is circling',
    text: '{incumbent} offered {name} a job with a title that has three words and one of them is "Principal".',
    choices: [
      { label: 'Match the offer', hint: '+20% salary', effects: { salaryPct: 20, meaning: 3 }, outcome: '{name} stays and buys a nicer chair.' },
      { label: 'Wish them well', hint: 'They leave', effects: { resign: true }, outcome: '{name} leaves for {incumbent}. They will be back in #alumni.' },
    ],
  },
  {
    id: 'junior_first_feature', kind: 'staff', weight: 2, cooldownWeeks: 20, random: true, subject: 'juniorStaff',
    when: () => true,
    title: 'First feature shipped',
    text: '{name} shipped their first real feature. There were balloons. One of them was emotional support.',
    auto: { meaning: 10, teamMeaning: 1 },
  },
  {
    id: 'senior_side_project', kind: 'staff', weight: 2, cooldownWeeks: 30, random: true, subject: 'seniorStaff',
    when: () => true,
    title: 'A little side project',
    text: '{name} has been rebuilding the admin panel on weekends "just to see". It is beautiful.',
    choices: [
      { label: 'Greenlight a craft project', hint: 'Starts a craft project for you to staff; meaning up', requires: 'noCraftRunning', effects: { startCraft: true, meaning: 5 }, outcome: 'The craft project begins. Fonts will be discussed.' },
      { label: 'Not now', hint: 'Meaning down a little', effects: { meaning: -3 }, outcome: 'Back to the backlog.' },
    ],
  },
  {
    id: 'hackathon', kind: 'staff', weight: 2, cooldownWeeks: 40, random: true, subject: null,
    when: (s) => s.staff.length >= 4,
    title: 'Hackathon weekend?',
    text: 'Someone proposes a weekend hackathon. There will be pizza and questionable architecture.',
    choices: [
      { label: 'Host it', hint: 'Costs cash, team meaning up, a bit of debt', effects: { cash: -3000, teamMeaning: 6, debt: 2 }, outcome: 'Twelve prototypes, one good idea, zero sleep.' },
      { label: 'Skip it', hint: 'Nothing happens', effects: {}, outcome: 'Everyone goes home and does their laundry.' },
    ],
  },
  {
    id: 'team_offsite', kind: 'staff', weight: 1, cooldownWeeks: 52, random: true, subject: null,
    when: (s) => s.staff.length >= 6,
    title: 'Team offsite',
    text: 'The team wants an offsite. A cabin, a lake, zero Slackk.',
    choices: [
      { label: 'Book the cabin', hint: 'Expensive, big team meaning boost', effects: { cash: -12000, teamMeaning: 10 }, outcome: 'Someone fell in the lake. Morale has never been higher.' },
      { label: 'Maybe next quarter', hint: 'Nothing happens', effects: {}, outcome: 'Next quarter, everyone says.' },
    ],
  },
  {
    id: 'bootcamp_grads', kind: 'staff', weight: 2, cooldownWeeks: 26, random: true, subject: null,
    when: () => true,
    title: 'Bootcamp graduation',
    text: 'A local bootcamp just graduated a cohort. Several of them have heard of {company}.',
    auto: { candidates: 'juniorBatch' },
  },
  {
    id: 'industry_layoffs', kind: 'staff', weight: 1, cooldownWeeks: 52, random: true, subject: null,
    when: (s) => s.week >= 52,
    title: 'Industry layoffs',
    text: '{incumbent} laid off 12% of staff "to invest in AI". Your candidate pool is suddenly very senior.',
    auto: { candidates: 'seniorBatch', teamMeaning: -3 },
  },
  {
    id: 'remote_debate', kind: 'staff', weight: 1, cooldownWeeks: 52, random: true, subject: null,
    when: (s) => s.staff.length >= 5,
    title: 'The office debate',
    text: 'A thread in #general about office days has 214 replies and one gif.',
    choices: [
      { label: 'Go hybrid', hint: 'Team meaning up a little', effects: { teamMeaning: 2 }, outcome: 'Tuesdays and Thursdays. Everyone complains equally.' },
      { label: 'Five days in the office', hint: 'Meaning down, knowledge sharing up', effects: { teamMeaning: -5, ik: 2 }, outcome: 'The whiteboards get used. The commute gets hated.' },
    ],
  },
  {
    id: 'ai_skeptic_speech', kind: 'staff', weight: 2, cooldownWeeks: 30, random: true, subject: 'seniorStaff',
    when: (s) => Object.values(s.automation).some((a) => a.level > 0),
    title: 'A speech at all-hands',
    text: '{name} stands up at all-hands: "Does anyone here still understand what we ship?"',
    choices: [
      { label: 'Listen and take notes', hint: 'Meaning up', effects: { meaning: 6, flag: { name: 'heardSkeptic', value: true } }, outcome: 'Some people clap. Some people look at their shoes.' },
      { label: 'Wave it off', hint: 'Meaning down', effects: { meaning: -4 }, outcome: '{name} sits down. The room gets quiet.' },
    ],
  },
  {
    id: 'mentor_pride', kind: 'staff', weight: 2, cooldownWeeks: 20, random: true, subject: 'mentorStaff',
    when: () => true,
    title: 'A proud mentor',
    text: '{name} watched their mentee debug prod without help. They pretended not to tear up.',
    auto: { meaning: 8 },
  },

  // People
  {
    id: 'no_show', kind: 'staff', weight: 2, cooldownWeeks: 40, random: true, subject: 'workingStaff',
    when: (s) => s.staff.length >= 4,
    title: 'Where is {name}?',
    text: '{name} has not been in for three days. Their Slackk status just says "focusing". It has said that since Tuesday.',
    choices: [
      { label: 'Check in kindly', hint: 'They take a couple of weeks off; comes back stronger, effects later', effects: { awayWeeks: 2, teamMeaning: 1, later: [{ inWeeks: 3, effects: { meaning: 15 } }] }, outcome: 'You send soup. Actual soup. {name} replies with a single heart.' },
      { label: 'Dock their pay', hint: 'Saves a little cash; they and the team notice', effects: { awayWeeks: 2, cash: 1500, salaryPct: -10, meaning: -15, teamMeaning: -3 }, outcome: 'HR sends a very formal email. Everyone reads it. Everyone.' },
      { label: 'Say nothing', hint: 'Nothing now. It may happen again, effects later', effects: { awayWeeks: 3, followUp: { eventId: 'no_show_again', inWeeks: 10 } }, outcome: 'The desk stays empty. The plant on it looks worried.' },
    ],
  },
  {
    id: 'no_show_again', kind: 'staff', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: '{name} vanished again',
    text: 'Same empty desk, same "focusing" status. The plant has given up.',
    choices: [
      { label: 'Have a real conversation', hint: 'Costs a little, meaning up', effects: { cash: -1000, meaning: 12 }, outcome: 'It turns out a lot was going on. It usually is.' },
      { label: 'Let them go', hint: 'They leave', effects: { resign: true }, outcome: 'The desk is cleared. The plant is adopted by support.' },
    ],
  },
  {
    id: 'quiet_quitter', kind: 'staff', weight: 2, cooldownWeeks: 30, random: true, subject: 'coastingStaff',
    when: () => true,
    title: 'Exactly what the ticket says',
    text: '{name} does exactly what each ticket says. Nothing more. They are extremely polite about it.',
    choices: [
      { label: 'Give them something to own', hint: 'Meaning up now and more later', effects: { meaning: 8, later: [{ inWeeks: 4, effects: { meaning: 6 } }] }, outcome: '{name} gets a whole feature. They start a design doc. Unprompted.' },
      { label: 'Performance plan', hint: 'A burst of output now; resentment later', effects: { meaning: -10, modifier: { key: 'output', value: 0.05, weeks: 6, label: 'Performance plan pressure' }, later: [{ inWeeks: 6, effects: { meaning: -8, teamMeaning: -2 } }] }, outcome: 'Tickets close faster. Nobody makes eye contact.' },
      { label: 'Leave it', hint: 'Nothing happens', effects: {}, outcome: 'The tickets keep closing. Precisely.' },
    ],
  },
  {
    id: 'public_complaint', kind: 'staff', weight: 2, cooldownWeeks: 39, random: true, subject: 'randomStaff',
    when: (s) => Object.values(s.automation).some((a) => a.level >= 0.5),
    title: 'A post on LinkedOut',
    text: '{name} wrote a LinkedOut post about being "a human rubber stamp for AI". It has 40,000 likes and a lot of people tagging {company}.',
    choices: [
      { label: 'Respond publicly with real changes', hint: 'Costs cash; brand and team meaning up', effects: { cash: -3000, brand: 2, teamMeaning: 2, meaning: 6 }, outcome: 'Your reply is the second most liked comment. {name} reposts it.' },
      { label: 'Ask them to take it down', hint: 'Brand and their meaning down', effects: { brand: -3, meaning: -10 }, outcome: 'They take it down. Screenshots do not.' },
      { label: 'Ignore it', hint: 'Might blow over, might not', effects: { gamble: { p: 0.5, effects: { brand: -5 } } }, outcome: 'You close the tab. You open the tab again.' },
    ],
  },
  {
    id: 'pay_equity_question', kind: 'staff', weight: 2, cooldownWeeks: 52, random: true, subject: 'randomStaff',
    when: (s) => s.stats.hires >= 2,
    title: 'A question about pay',
    text: '{name} found out a new hire makes more than they do. They would like to understand why.',
    choices: [
      { label: 'Fix it across the team', hint: 'A permanent raise for everyone (+8% salaries); team meaning up', effects: { teamSalaryPct: 8, meaning: 10, teamMeaning: 4 }, outcome: 'Everyone gets a letter with a bigger number. Morale improves in real time.' },
      { label: 'Explain the market', hint: 'Free now; it festers, effects later', effects: { meaning: -8, later: [{ inWeeks: 8, effects: { meaning: -6, teamMeaning: -2 } }] }, outcome: '"The market" is a very unsatisfying answer. Everyone knows it.' },
    ],
  },
  {
    id: 'junior_overwhelmed', kind: 'staff', weight: 2, cooldownWeeks: 26, random: true, subject: 'juniorStaff',
    when: () => true,
    title: 'Fourteen tabs of docs',
    text: '{name} has fourteen tabs of documentation open and is quietly panicking in a very organized way.',
    choices: [
      { label: 'Pair them with a mentor', hint: 'A mid or senior becomes their mentor', requires: 'mentorAvailable', effects: { assign: { type: 'mentor' }, meaning: 5 }, outcome: 'Thirteen tabs close. The one that matters stays open.' },
      { label: 'Give them a smaller task', hint: 'Meaning up a little', effects: { meaning: 3 }, outcome: 'A good first win. They ship it before lunch.' },
      { label: 'Sink or swim', hint: 'They learn fast or hate it', effects: { knowledge: 5, meaning: -8 }, outcome: 'They swim. Barely. They remember who did not help.' },
    ],
  },

  // Leadership ideas: a founder read something and has plans
  {
    id: 'ceo_replace_support', kind: 'leadership', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'founder',
    when: (s, h) => h.live.length > 0 && s.automation.support.level < 1,
    title: '{name} has an idea',
    text: '{name} read a blog post called "Support Teams Are Dead". They want support fully automated by Monday. "Think of the savings!"',
    choices: [
      { label: 'Do it', hint: 'Support automation to 100% now (adds a weekly model bill); how customers feel shows up later', effects: { setAutomation: { support: 1 }, purpose: { people: -8, trust: -5, growth: 4 }, followUp: { eventId: 'ceo_support_fallout', inWeeks: 10 } }, outcome: 'The support bot goes live. It says "Great question!" to everyone.' },
      { label: 'Trial it on half the tickets', hint: 'Support automation to 50%', effects: { setAutomation: { support: 0.5 } }, outcome: 'A careful rollout. {name} calls it "timid". You call it Tuesday.' },
      { label: 'Talk them down', hint: '{name} sulks a little', effects: { meaning: -3 }, outcome: '{name} reads a different blog post. It is about sourdough.' },
    ],
  },
  {
    id: 'ceo_support_fallout', kind: 'leadership', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Customers noticed the support bot',
    text: 'Customers noticed the support bot. The support bot did not notice the customers. A thread titled "is anyone human at {company}" is trending.',
    choices: [
      { label: 'Keep the bot', hint: 'Some customers leave; brand down', effects: { customersPct: -6, brand: -3 }, outcome: 'The bot keeps saying "Great question!". Fewer people are asking.' },
      { label: 'Bring humans back', hint: 'Costs cash; brand recovers a little', effects: { setAutomation: { support: 0.25 }, cash: -5000, brand: 1 }, outcome: 'Real humans answer the phones. A customer cries with relief.' },
    ],
  },
  {
    id: 'four_day_week', kind: 'leadership', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'founder',
    when: (s) => s.staff.length >= 5,
    title: 'What about a four-day week?',
    text: '{name} saw a study about four-day weeks and cannot stop talking about it. "Same output, happier people. Probably."',
    choices: [
      { label: 'Run an 8-week trial', hint: 'Less output, faster recovery for 8 weeks, then decide', effects: { modifier: [{ key: 'output', value: -0.1, weeks: 8, label: 'Four-day week trial' }, { key: 'meaningRecovery', value: 0.5, weeks: 8, label: 'Four-day week trial' }], followUp: { eventId: 'four_day_week_review', inWeeks: 8 } }, outcome: 'Fridays are gone. Nobody knows what day it is anymore. Everyone is thrilled.' },
      { label: 'Not now', hint: 'The team is a little disappointed', effects: { teamMeaning: -2 }, outcome: 'The study gets forwarded around anyway.' },
    ],
  },
  {
    id: 'four_day_week_review', kind: 'leadership', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Four-day week: keep going?',
    text: 'Time to review the four-day week. Output dipped a bit. People look like they sleep now. What does {company} do?',
    choices: [
      { label: 'Keep it', hint: 'Less output, better recovery for 52 weeks, then review again', effects: { modifier: [{ key: 'output', value: -0.1, weeks: 52, label: 'Four-day week' }, { key: 'meaningRecovery', value: 0.4, weeks: 52, label: 'Four-day week' }], followUp: { eventId: 'four_day_week_review', inWeeks: 52 } }, outcome: 'It is official. Someone makes a banner. It is slightly crooked and perfect.' },
      { label: 'Back to five days', hint: 'Team meaning down', effects: { teamMeaning: -4 }, outcome: 'Friday returns. It is greeted like a tax audit.' },
    ],
  },
  {
    id: 'ai_first_mandate', kind: 'leadership', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'founder',
    when: (s) => s.week >= 26,
    title: '"We are an AI-first company now"',
    text: '{name} wants to announce that {company} is AI-first. Every team must use agents for everything. There is a slide with a rocket on it.',
    choices: [
      { label: 'Announce it', hint: 'Every automation dial +25% and a hype bump now; meaning drains faster for 26 weeks', effects: { automationBump: 0.25, hype: 10, purpose: { craft: -8, people: -8, trust: -3, growth: 6 }, modifier: { key: 'meaningDrain', value: 0.4, weeks: 26, label: 'AI-first mandate' }, followUp: { eventId: 'ai_first_review', inWeeks: 12 } }, outcome: 'The press release goes out. Engineers read it on their phones, silently.' },
      { label: 'Make agents optional', hint: 'Team meaning up a little', effects: { teamMeaning: 1 }, outcome: 'People use the agents where they help. It is almost boring.' },
      { label: 'Kill the slide', hint: '{name} is a bit deflated', effects: { meaning: -3 }, outcome: 'The rocket slide lives on in a folder called "someday".' },
    ],
  },
  {
    id: 'ai_first_review', kind: 'leadership', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Twelve weeks of AI-first',
    text: 'Twelve weeks into AI-first. The dashboards look great. The standups are very quiet.',
    choices: [
      { label: 'Double down', hint: 'Another +25% on every dial; team meaning down', effects: { automationBump: 0.25, teamMeaning: -4 }, outcome: 'The rocket slide gets a second rocket.' },
      { label: 'Roll it back quietly', hint: 'Every dial -25%; brand dips, team exhales', effects: { automationBump: -0.25, brand: -1, teamMeaning: 3 }, outcome: 'Nobody announces anything. Everyone notices.' },
    ],
  },
  {
    id: 'rebrand', kind: 'leadership', weight: 1, cooldownWeeks: ONCE, random: true, subject: 'founder',
    when: (s) => s.week >= 52 && s.cash >= 30000,
    title: 'Time for a rebrand?',
    text: '{name} thinks the logo "feels very 2020s". An agency sent a deck with a lot of lowercase letters.',
    choices: [
      { label: 'Go bold', hint: 'Costs $20k now; lands in 6 weeks, could flop', effects: { cash: -20000, later: [{ inWeeks: 6, effects: { gamble: { p: 0.6, effects: { brand: 8 }, else: { brand: -4 } } } }] }, outcome: 'The new logo is a lowercase blob. The reveal is in six weeks.' },
      { label: 'Refresh the logo', hint: 'Small cost, small brand bump', effects: { cash: -3000, brand: 1 }, outcome: 'Same logo, slightly rounder. People say it looks "friendlier".' },
      { label: 'Keep it', hint: 'Nothing happens', effects: {}, outcome: 'The agency sends a follow-up deck. It is also lowercase.' },
    ],
  },
  {
    id: 'pivot_pitch', kind: 'leadership', weight: 1, cooldownWeeks: 104, random: true, subject: 'founder',
    when: (s, h) => h.live.length >= 2,
    title: '{name} wants to pivot',
    text: '{name} gathers everyone: "The market has spoken. It said something else." They want to drop the weakest product and chase what is hot.',
    choices: [
      { label: 'Pivot', hint: 'Sunset your weakest product; start a free medium project on a hot combo', effects: { pivot: true }, outcome: 'Whiteboards are wiped. New sticky notes appear. Some are the same sticky notes.' },
      { label: 'Stay the course', hint: 'Team meaning up a little', effects: { teamMeaning: 1 }, outcome: '"Focus is a feature," you say. It goes on a mug.' },
    ],
  },
  {
    id: 'open_plan_office', kind: 'leadership', weight: 1, cooldownWeeks: ONCE, random: true, subject: 'founder',
    when: (s) => s.officeStage >= 1,
    title: 'Knock down the walls?',
    text: '{name} wants an open-plan office. "Collaboration!" The walls are not structural. Neither, it turns out, is the plan.',
    choices: [
      { label: 'Knock them down', hint: 'Cheap; more output but slower recovery for 26 weeks', effects: { cash: -2000, modifier: [{ key: 'output', value: 0.08, weeks: 26, label: 'Open-plan buzz' }, { key: 'meaningRecovery', value: -0.3, weeks: 26, label: 'Open-plan noise' }] }, outcome: 'Everyone can see everyone. Headphone sales in the area spike.' },
      { label: 'Keep the walls', hint: 'Nothing happens', effects: {}, outcome: 'The walls stay. So do the doors, which close.' },
    ],
  },
  {
    id: 'hackathon_week', kind: 'leadership', weight: 1, cooldownWeeks: 52, random: true, subject: 'founder',
    when: (s, h) => s.staff.length >= 5 && h.live.length > 0,
    title: 'A whole hackathon week',
    text: '{name} wants to stop everything for a week of pure hacking. "Remember when we used to have fun?"',
    choices: [
      { label: 'Stop everything for a week', hint: 'Costs $2k and half output next week; hype and team meaning up', effects: { cash: -2000, hype: 8, teamMeaning: 5, modifier: { key: 'output', value: -0.5, weeks: 1, label: 'Hackathon week' } }, outcome: 'Someone builds a karaoke bot for Slackk. It is the best thing you own.' },
      { label: 'Not this quarter', hint: 'Team meaning down a little', effects: { teamMeaning: -1 }, outcome: 'The hackathon becomes a "hack afternoon". It gets moved twice.' },
    ],
  },
  {
    id: 'founder_burnout', kind: 'leadership', weight: 3, cooldownWeeks: 52, random: true, subject: 'founder',
    when: (s) => s.staff.some((p) => p.founder && p.meaning < 40 && p.mood !== 'away'),
    title: 'Even founders run out',
    text: '{name} answered an email at 3am, then another at 4am, then stared at a wall until 6. They say they are fine.',
    choices: [
      { label: 'Take a real break', hint: '{name} is away four weeks and comes back restored', effects: { awayWeeks: 4, meaning: 10 }, outcome: '{name} goes somewhere with no Wi-Fi and one very patient dog.' },
      { label: 'Push through', hint: 'A burst of output now; the crash comes later', effects: { modifier: { key: 'output', value: 0.1, weeks: 8, label: 'Founder hustle' }, later: [{ inWeeks: 8, effects: { meaning: -20, teamMeaning: -3 } }] }, outcome: '{name} buys a treadmill desk and a mug the size of a bucket.' },
    ],
  },

  // Market
  {
    id: 'incumbent_copies_flavor', kind: 'market', weight: 2, cooldownWeeks: 30, random: true, subject: 'randomProduct',
    when: (s, h) => h.live.length > 0,
    title: 'Suspiciously familiar',
    text: '{incumbent} just shipped "{product} Lite". It is in a sidebar. It is gray.',
    choices: [
      { label: 'Lean into taste', hint: 'Costs cash, hype up', effects: { cash: -5000, hype: 10 }, outcome: 'Your comparison page is devastating and polite.' },
      { label: 'Ignore it', hint: 'Hype down a little', effects: { hype: -5 }, outcome: 'Customers notice the sidebar. Some of them click it.' },
    ],
  },
  {
    id: 'clone_wave', kind: 'market', weight: 2, cooldownWeeks: 26, random: true, subject: 'randomProduct',
    when: (s, h) => h.live.some((p) => p.score >= 6),
    title: 'Clone wave',
    text: 'Three new companies launched "{product}, but with AI" this week. One of them is literally your landing page.',
    auto: { clones: 2 },
  },
  {
    id: 'enterprise_rfp', kind: 'market', weight: 2, cooldownWeeks: 26, random: true, subject: 'randomProduct',
    when: (s, h) => h.live.length > 0 && s.week >= 30,
    title: 'An enterprise RFP',
    text: 'A bank wants {product}. Their security questionnaire has 340 questions, four about the model you use.',
    choices: [
      { label: 'Bid for it', hint: 'Wins if the model is compliance-friendly', effects: { cond: { test: 'subjectCompliant', then: { customersPct: 15, brand: 2 }, else: { brand: -1 } } }, outcome: 'The questionnaire is submitted. Legal needs a nap.' },
      { label: 'Pass', hint: 'Nothing happens', effects: {}, outcome: 'The bank buys from {incumbent}. Of course.' },
    ],
  },
  {
    id: 'big_customer_threat', kind: 'market', weight: 2, cooldownWeeks: 26, random: true, subject: 'randomProduct',
    when: (s, h) => h.live.some((p) => p.customers > 500),
    title: 'Your biggest customer is unhappy',
    text: 'Your largest {product} account says {incumbent} offered them a 40% discount. They want to "talk".',
    choices: [
      { label: 'Offer a discount', hint: 'Costs cash, keeps them', effects: { cash: -8000 }, outcome: 'They stay. They will ask again next year.' },
      { label: 'Call their bluff', hint: 'Half the time you lose 8% of customers', effects: { gamble: { p: 0.5, effects: { customersPct: -8 } } }, outcome: 'You wait by the phone.' },
    ],
  },
  {
    id: 'press_wrapper_mockery', kind: 'market', weight: 2, cooldownWeeks: 30, random: true, subject: 'randomProduct',
    when: (s, h) => h.live.some((p) => p.score < 6),
    title: 'The press is laughing',
    text: 'Hacker Olds has a thread titled "{product} is just an API call with a logo". It has 900 points.',
    choices: [
      { label: 'Laugh along in the comments', hint: 'Brand up a little', effects: { brand: 1, hype: 5 }, outcome: 'Your self-deprecating comment is the top reply.' },
      { label: 'Send a cease and desist', hint: 'Brand down, costs cash', effects: { brand: -3, cash: -2000 }, outcome: 'The thread now has 2,400 points.' },
    ],
  },
  {
    id: 'viral_post', kind: 'market', weight: 2, cooldownWeeks: 20, random: true, subject: 'randomProduct',
    when: (s, h) => h.live.length > 0,
    title: 'Gone viral',
    text: 'A developer posted a video of {product} saving their weekend. Eleven million views.',
    auto: { hype: 20 },
  },
  {
    id: 'acquisition_offer', kind: 'market', weight: 6, cooldownWeeks: 52, random: true, subject: null, marks: 'acquisitionOfferWeek',
    when: (s, h) => h.offerReady,
    title: 'An acquisition offer',
    text: '{incumbent} wants to buy {company}. The number has a lot of zeros. The integration plan has a lot of question marks.',
    choices: [
      { label: 'Accept and retire', hint: 'Ends the run as a win', effects: { win: 'acquired' }, outcome: 'You sign. Somewhere, a press release is already written.' },
      { label: 'Keep it on the table', hint: 'You can retire from Reports for six months', effects: { openOffer: true }, outcome: '"Let us circle back," you say, like a real executive.' },
      { label: 'Decline', hint: 'Brand up a little', effects: { brand: 2 }, outcome: '"We are just getting started," you tell TechCrunchy.' },
    ],
  },
  {
    id: 'bridge_loan', kind: 'market', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The bank account is red',
    text: 'The balance has a minus sign in front of it. Your accountant has started using the word "concerning" in every sentence.',
    choices: [
      { label: 'Take a bridge loan', hint: '+$60k now; repay $72k in 26 weeks, effects later; a small brand hit', effects: { cash: 60000, brand: -1, later: [{ inWeeks: 26, effects: { cash: -72000 } }] }, outcome: 'The bank agrees. The interest rate has a lot of confidence in it.' },
      { label: 'Cut costs', hint: '+$10k now; less output and slower recovery for 12 weeks', effects: { cash: 10000, modifier: [{ key: 'output', value: -0.1, weeks: 12, label: 'Cost cutting' }, { key: 'meaningRecovery', value: -0.3, weeks: 12, label: 'Cost cutting' }] }, outcome: 'No more fancy oat milk. The team notices. The team notices everything.' },
      { label: 'Ride it out', hint: 'Eight losing weeks in the red and the company is done', effects: {}, outcome: 'You stare at the revenue chart and will it upward.' },
    ],
  },
  {
    id: 'vc_offer', kind: 'market', weight: 3, cooldownWeeks: ONCE, random: true, subject: null, funding: 'bootstrapped',
    when: (s) => !s.flags.diluted && (s.week >= 26 || s.cash < 20000),
    title: 'A venture capitalist calls',
    text: 'A VC in a vest wants to give {company} half a million dollars. They say "AI-native" four times.',
    choices: [
      { label: 'Take the money', hint: '+$500k now, final score x0.8', effects: { cash: 500000, flag: { name: 'diluted', value: true } }, outcome: 'The wire clears. The board meetings begin.' },
      { label: 'Stay bootstrapped', hint: 'Team meaning up a little', effects: { teamMeaning: 2 }, outcome: 'You own all of it. It is small and it is yours.' },
    ],
  },
  {
    id: 'product_hunt_top', kind: 'market', weight: 2, cooldownWeeks: 26, random: true, subject: 'randomProduct',
    when: (s, h) => h.live.some((p) => p.score >= 6),
    title: 'Product of the Day',
    text: '{product} hit #1 on Product Hunt. Your mom upvoted it twice from two accounts.',
    auto: { hype: 15, brand: 2 },
  },
  {
    id: 'analyst_report', kind: 'market', weight: 2, cooldownWeeks: 39, random: true, subject: null,
    when: (s, h) => h.live.length > 0,
    title: 'Analyst quadrant',
    text: 'An analyst firm placed {company} in their quadrant. Which quadrant is a matter of some debate.',
    auto: { cond: { test: 'bestScore7', then: { brand: 3 }, else: { brand: -2 } } },
  },

  // Vendors
  {
    id: 'vendor_new_version', kind: 'vendor', weight: 2, cooldownWeeks: 26, random: true, subject: null,
    when: () => true,
    title: 'A new frontier model',
    text: 'A new model dropped overnight. #general is now 90% benchmark screenshots.',
    choices: [
      { label: 'Let the team play with it', hint: 'Costs a little, team meaning up', effects: { cash: -1500, teamMeaning: 3 }, outcome: 'Someone made it write a sonnet about the billing service.' },
      { label: 'Stay focused', hint: 'Nothing happens', effects: {}, outcome: 'The benchmarks will still be wrong next week.' },
    ],
  },
  {
    id: 'vendor_price_hike', kind: 'vendor', weight: 1, cooldownWeeks: 39, random: true, subject: null,
    when: (s, h) => h.live.length > 0,
    title: 'A friendly pricing update',
    text: 'One of your model vendors emailed about "exciting pricing changes". They are not exciting.',
    auto: { priceHike: true },
  },
  {
    id: 'vendor_outage', kind: 'vendor', weight: 2, cooldownWeeks: 26, random: true, subject: null,
    when: (s, h) => h.live.length > 0,
    title: 'Vendor outage',
    text: 'A model vendor is down. Their status page says "degraded". Your customers say worse words.',
    auto: { vendorOutage: 20 },
  },
  {
    id: 'grokk_pr_scandal', kind: 'vendor', weight: 3, cooldownWeeks: 39, random: true, subject: null,
    when: (s, h) => h.usesModel('grokk'),
    title: 'Grokk said something',
    text: 'Grokk told a customer their business plan was "cringe". The screenshot is everywhere, next to your logo.',
    choices: [
      { label: 'Ride it out', hint: 'Brand down', effects: { brand: -4 }, outcome: 'It will blow over. It does not blow over quickly.' },
      { label: 'Switch vendors now', hint: 'Every Grokk product needs a migration', effects: { migrateOff: 'grokk', brand: 1 }, outcome: 'Migration tickets appear. Engineers sigh.' },
    ],
  },
  {
    id: 'open_weights_release', kind: 'vendor', weight: 1, cooldownWeeks: 52, random: true, subject: null,
    when: () => true,
    title: 'New open weights',
    text: 'Llamarama released new open weights. The GPU resellers are having a very good week.',
    auto: { modelBoost: { model: 'llamarama', capability: 5 } },
  },
  {
    id: 'gpu_shortage', kind: 'vendor', weight: 1, cooldownWeeks: 52, random: true, subject: null,
    when: (s) => Object.values(s.automation).some((a) => a.level > 0),
    title: 'GPU shortage',
    text: 'Every data center is full. Automation costs are up 50% for two months.',
    auto: { gpuShortageWeeks: 8 },
  },

  // Incidents (raised by the incidents system for severe uncaught rogue agents)
  {
    id: 'agent_db_wipe', kind: 'incident', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The agent dropped the production database',
    text: 'Your engineering agent decided the users table was "unused" and cleaned it up. It is very proud.',
    choices: [
      { label: 'Roll back and eat the cost', hint: 'Cash hit, customers stay', effects: { cash: -15000 }, outcome: 'The backups work. Everyone exhales.' },
      { label: 'Blame the vendor', hint: 'Brand hit unless the model is well trusted', effects: { cond: { test: 'trustedVendor', then: {}, else: { brand: -3 } } }, outcome: 'The vendor responds with a link to their terms of service.' },
      { label: 'Publish a public postmortem', hint: 'Honest. Painful. Respected with blameless culture', effects: { cond: { test: 'blameless', then: { brand: 3 }, else: { brand: -1 } }, ik: 3 }, outcome: 'Hacker Olds calls it "refreshingly honest".' },
    ],
  },
  {
    id: 'agent_runaway_spend', kind: 'incident', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The cloud bill has feelings',
    text: 'An agent spun up 4,000 GPUs to "optimize" a cron job. The bill is still counting.',
    choices: [
      { label: 'Pay it and apologize to finance', hint: 'Big cash hit', effects: { cash: -25000 }, outcome: 'Finance puts a sticky note on the agent. It does nothing.' },
      { label: 'Beg the cloud provider for credits', hint: 'Half the time you still pay $30k', effects: { gamble: { p: 0.5, effects: { cash: -30000 } } }, outcome: 'You write a very nice email.' },
      { label: 'Publish a public postmortem', hint: 'Knowledge up, brand depends on culture', effects: { cash: -12000, cond: { test: 'blameless', then: { brand: 3 }, else: { brand: -1 } }, ik: 3 }, outcome: 'The postmortem includes a graph shaped like a rocket.' },
    ],
  },
  {
    id: 'agent_mass_email', kind: 'incident', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Every customer got an email',
    text: 'The marketing agent emailed every customer at 3am. The subject line was "Final notice :)".',
    choices: [
      { label: 'Send an apology email', hint: 'Small churn', effects: { customersPct: -3, brand: -1 }, outcome: 'The apology email has a 94% open rate. Your best ever.' },
      { label: 'Blame the vendor', hint: 'Brand hit unless the model is well trusted', effects: { cond: { test: 'trustedVendor', then: {}, else: { brand: -3 } } }, outcome: 'Nobody believes the vendor wrote "Final notice :)".' },
      { label: 'Publish a public postmortem', hint: 'Knowledge up, brand depends on culture', effects: { cond: { test: 'blameless', then: { brand: 3 }, else: { brand: -1 } }, ik: 3 }, outcome: 'Customers enjoy the postmortem more than the newsletter.' },
    ],
  },
  {
    id: 'agent_prompt_injection_leak', kind: 'incident', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The agent followed the wrong instructions',
    text: 'A PDF uploaded by a "customer" told your ops agent to share its config. It did. Politely.',
    choices: [
      { label: 'Rotate every secret tonight', hint: 'Cash hit, overtime', effects: { cash: -12000, teamMeaning: -2 }, outcome: 'Keys rotated. Pizza ordered. Sun rising.' },
      { label: 'Blame the vendor', hint: 'Brand hit unless the model is well trusted', effects: { cond: { test: 'trustedVendor', then: {}, else: { brand: -3 } } }, outcome: 'The vendor adds a new paragraph to its system prompt.' },
      { label: 'Publish a public postmortem', hint: 'Knowledge up, brand depends on culture', effects: { cond: { test: 'blameless', then: { brand: 3 }, else: { brand: -1 } }, ik: 3 }, outcome: 'Security researchers send you a fruit basket.' },
    ],
  },
  {
    id: 'agent_pricing_rewrite', kind: 'incident', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The agent fixed pricing',
    text: 'The sales agent decided the enterprise plan should be free "to maximize adoption". Adoption is up.',
    choices: [
      { label: 'Honor the deals', hint: 'Cash hit, brand up', effects: { cash: -18000, brand: 2 }, outcome: 'A few very happy customers tell everyone.' },
      { label: 'Cancel the free plans', hint: 'Some customers leave', effects: { customersPct: -6 }, outcome: 'The angry emails are long and well formatted.' },
      { label: 'Publish a public postmortem', hint: 'Knowledge up, brand depends on culture', effects: { cash: -8000, cond: { test: 'blameless', then: { brand: 3 }, else: { brand: -1 } }, ik: 3 }, outcome: 'The postmortem title: "Adoption at all costs".' },
    ],
  },
  {
    id: 'support_refund_hallucination', kind: 'incident', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The support bot promised refunds',
    text: 'Your support agent promised 400 customers a full refund plus "a small pony". Lawyers are asking about the pony.',
    choices: [
      { label: 'Pay the refunds', hint: 'Cash hit, brand kept', effects: { cash: -15000 }, outcome: 'No ponies were purchased.' },
      { label: 'Blame the vendor', hint: 'Lose 4% of customers, plus a brand hit unless the model is well trusted', effects: { cond: { test: 'trustedVendor', then: {}, else: { brand: -3 } }, customersPct: -4 }, outcome: 'Customers do not care whose fault the pony is.' },
      { label: 'Publish a public postmortem', hint: 'Knowledge up, brand depends on culture', effects: { cash: -6000, cond: { test: 'blameless', then: { brand: 3 }, else: { brand: -1 } }, ik: 3 }, outcome: 'The pony becomes a company mascot.' },
    ],
  },

  {
    id: 'outage_unfixable', kind: 'incident', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Nobody here can debug this',
    text: '{product} is down and nobody on staff understands the part that broke. The logs are long, confident, and wrong.',
    choices: [
      { label: 'Call in consultants', hint: '$45k, and it is fixed this week', requires: 'affordConsultants', effects: { consultants: true }, outcome: 'Three people in vests arrive, say "interesting" a lot, and fix it by Thursday.' },
      { label: 'Hire an emergency contractor', hint: '$15k; fixed in about 2 weeks, effects later; adds some debt nobody will understand', effects: { cash: -15000, debt: 3, later: [{ inWeeks: 2, effects: { clearOutage: true } }] }, outcome: 'A contractor named Dmitri logs in from an airport. He seems calm. That is something.' },
      { label: 'Keep trying ourselves', hint: 'If {product} stays down {collapseWeeks} more weeks and it is your main product, or nobody understands the systems anymore, the company collapses', effects: {}, outcome: 'Someone orders pizza. Someone else opens the oldest file in the repo.' },
    ],
  },

  // Cyber (raised by the incidents system for severe landed attacks)
  {
    id: 'credential_stuffing', kind: 'cyber', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Credential stuffing',
    text: 'Someone is trying ten million leaked passwords against {product}. Some of them work.',
    choices: [
      { label: 'Force password resets', hint: 'Small churn, brand up', effects: { customersPct: -3, brand: 1 }, outcome: 'Customers grumble, then enable two-factor.' },
      { label: 'Patch it quietly', hint: 'Risky if it leaks', effects: { gamble: { p: 0.4, effects: { brand: -6 } } }, outcome: 'You patch it and hope nobody noticed.' },
    ],
  },
  {
    id: 'ransomware', kind: 'cyber', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Ransomware',
    text: 'Every server now displays a skull and a crypto wallet address. The skull is animated.',
    choices: [
      { label: 'Pay the ransom', hint: 'Huge cash hit', effects: { cash: -60000 }, outcome: 'The keys work. You feel dirty.' },
      { label: 'Restore from backups', hint: 'Needs institutional knowledge 40+, else heavy churn', effects: { cond: { test: 'ik40', then: { ik: 2 }, else: { customersPct: -20, brand: -4 } } }, outcome: 'Someone has to remember where the backups are.' },
    ],
  },
  {
    id: 'supply_chain', kind: 'cyber', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Supply chain compromise',
    text: 'A tiny package someone installed at 2 a.m. turned out to be a crypto miner in a trench coat.',
    choices: [
      { label: 'Audit every dependency', hint: 'Costs cash, lowers debt', effects: { cash: -15000, debt: -3 }, outcome: 'You now know what left-pad is. Again.' },
      { label: 'Remove it and move on', hint: 'Risky', effects: { gamble: { p: 0.5, effects: { brand: -5, debt: 3 } } }, outcome: 'Probably fine. Probably.' },
    ],
  },
  {
    id: 'data_exfiltration', kind: 'cyber', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Data exfiltration',
    text: 'Customer data is for sale on a forum with a very bad font.',
    choices: [
      { label: 'Disclose it publicly', hint: 'Brand and cash hit now', effects: { brand: -3, cash: -10000 }, outcome: 'The disclosure is clear and nobody enjoys reading it.' },
      { label: 'Say nothing', hint: 'Half the time it comes out anyway, badly', effects: { gamble: { p: 0.5, effects: { brand: -12, cash: -30000 } } }, outcome: 'You refresh the news every morning now.' },
    ],
  },
  {
    id: 'phishing_ceo', kind: 'cyber', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The CEO wants gift cards',
    text: 'An email from "you" asked finance to buy $25,000 of gift cards "for a client". Finance almost did it. Finance is very efficient.',
    choices: [
      { label: 'Mandatory security training', hint: 'Small cost, team grumbles', effects: { cash: -4000, teamMeaning: -1 }, outcome: 'The training video is 40 minutes long.' },
      { label: 'Laugh it off', hint: 'It may happen again', effects: { gamble: { p: 0.3, effects: { cash: -25000 } } }, outcome: 'Finance now calls you before buying anything.' },
    ],
  },

  // Era arrivals (raised by the calendar when an era begins)
  {
    id: 'era_chatgbt', kind: 'era', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The ChatGBT moment',
    text: 'A chatbot is on the evening news. Your customers want to know your AI strategy. So does your mom. {incumbent} has a banner that says AI in a font normally used for funerals.',
    choices: [
      { label: 'Try copilots', hint: 'Hype on your newest product now; everyone learns faster for 26 weeks', effects: { hype: 15, teamMeaning: 2, modifier: { key: 'xp', value: 0.2, weeks: 26, label: 'Copilot experiments' } }, outcome: 'Everyone gets a copilot license. Three people use it. One of them for poetry.' },
      { label: 'Wait and see', hint: 'Customers stay calmer for 26 weeks; the brand slips a little later', effects: { modifier: { key: 'churn', value: -0.1, weeks: 26, label: 'Steady hands' }, later: [{ inWeeks: 13, effects: { brand: -2 } }] }, outcome: 'You let the hype cycle cycle. Your customers find this oddly soothing.' },
      { label: 'The board wants an AI strategy', hint: 'Brand up and more signups for 26 weeks; the team rolls its eyes', effects: { brand: 4, teamMeaning: -3, modifier: { key: 'acquisition', value: 0.15, weeks: 26, label: 'AI strategy buzz' } }, outcome: 'The deck has 40 slides. Slide 12 just says "agents". Nobody knows what that means yet.' },
    ],
  },
  {
    id: 'era_agents', kind: 'era', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The agents are here',
    text: 'The models stopped suggesting and started doing. {incumbent} announced an agent that replaces a whole team. The team found out from the press release.',
    choices: [
      { label: 'Go all in', hint: 'Every automation dial +25% and a hype bump; meaning drains faster for 26 weeks', effects: { automationBump: 0.25, hype: 15, modifier: { key: 'meaningDrain', value: 0.4, weeks: 26, label: 'Agent gold rush' } }, outcome: 'The agents start work on Monday. By Wednesday one of them has opened a ticket about the other.' },
      { label: 'Humans stay in the loop', hint: 'Brand up; people recover faster for 26 weeks', effects: { brand: 2, modifier: { key: 'meaningRecovery', value: 0.3, weeks: 26, label: 'Humans in the loop' } }, outcome: 'You put a sign on the door: HUMANS IN THE LOOP. Someone adds "mostly" in pencil.' },
      { label: 'Pilot with oversight', hint: '-$10k; more oversight hours and fewer rogue agents for 52 weeks', effects: { cash: -10000, modifier: [{ key: 'oversight', value: 0.3, weeks: 52, label: 'Agent pilot program' }, { key: 'rogueRisk', value: -0.3, weeks: 52, label: 'Agent pilot program' }] }, outcome: 'Every agent gets a babysitter and a tiny badge. The badges were a mistake. Everyone loves them.' },
    ],
  },
  {
    id: 'era_consolidation', kind: 'era', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Consolidation',
    text: 'Everyone is buying everyone. Two of your vendors merged, a third is "exploring strategic options", and regulators have discovered AI. There is a hearing. It is on TV.',
    choices: [
      { label: 'Hire a compliance lead', hint: '-$25k; customers churn less for 52 weeks', effects: { cash: -25000, modifier: { key: 'churn', value: -0.15, weeks: 52, label: 'Compliance lead' } }, outcome: 'They arrive with three binders and a label maker. Everyone feels safer and slightly afraid.' },
      { label: 'Lobby a little', hint: '-$10k and a coin flip: good press or a scandal', effects: { cash: -10000, gamble: { p: 0.5, effects: { brand: 5 }, else: { brand: -6 } } }, outcome: 'You buy a senator a sandwich. The results are pending.' },
      { label: 'Keep your head down', hint: 'Nothing now; the price war slows signups for 26 weeks', effects: { modifier: { key: 'acquisition', value: -0.1, weeks: 26, label: 'Price war' } }, outcome: 'You ship features and ignore the news. The news does not ignore you.' },
    ],
  },
  {
    id: 'era_plateau', kind: 'era', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The Plateau',
    text: 'Every company has the same agents now. {incumbent} runs its whole support desk with three people and a very tired dashboard. Customers have started asking a new question: "Who actually made this?"',
    choices: [
      { label: 'Lean into craft', hint: 'Brand up; people recover faster for 52 weeks', effects: { brand: 3, purpose: { craft: 8, people: 4 }, modifier: { key: 'meaningRecovery', value: 0.3, weeks: 52, label: 'The craft turn' } }, outcome: 'You rewrite the About page. It now has photos of actual people. Some of them are even smiling.' },
      { label: 'Automate to the floor', hint: 'Every automation dial +25%; meaning drains faster for 26 weeks', effects: { automationBump: 0.25, purpose: { craft: -8, people: -8, growth: 6 }, modifier: { key: 'meaningDrain', value: 0.4, weeks: 26, label: 'Automate to the floor' } }, outcome: 'Margins go up. The office gets quieter. Someone starts a support group in the kitchen.' },
      { label: 'Become the trusted one', hint: '-$20k; customers churn less for 52 weeks', effects: { cash: -20000, purpose: { trust: 10, craft: 2 }, modifier: { key: 'churn', value: -0.15, weeks: 52, label: 'Trust program' } }, outcome: 'You publish your incident history, your model choices, and a phone number that a human answers.' },
    ],
  },
  // The first product's user test (raised halfway through the first build)
  {
    id: 'first_user_test', kind: 'staff', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The first user test',
    text: 'A real person, found through a friend of a friend, is about to try {company}\'s first product. The founders are hiding behind a door.',
    choices: [
      { label: 'Watch in silence', hint: 'It hurts. Everyone learns faster for 8 weeks', effects: { teamMeaning: -1, modifier: { key: 'xp', value: 0.15, weeks: 8, label: 'Lessons from the user test' } }, outcome: 'They look for the save button for four minutes. Nobody breathes. Nobody forgets it.' },
      { label: 'Explain everything as they go', hint: 'Feels great; the team is happier, and learns nothing', effects: { teamMeaning: 3 }, outcome: 'They love it! They loved the explanation, anyway.' },
      { label: 'Skip it and keep building', hint: 'A little more output for 4 weeks', effects: { modifier: { key: 'output', value: 0.05, weeks: 4, label: 'Heads down' } }, outcome: 'You will find out what users think at launch. Like everyone does.' },
    ],
  },
  // Ladder chunk: the lockdown, the work policy, office pets, and the rival
  {
    id: 'lockdown_start', kind: 'world', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The office closes',
    text: 'The whole world is working from home for a while. Everyone takes a laptop and a monitor from the office, except {name}, who says somebody has to keep the place running.',
    choices: [
      { label: 'Laptops and a stipend for everyone', hint: '-$5k; people take it better', effects: { cash: -5000, teamMeaning: 3 }, outcome: 'Someone buys a chair that costs more than their first car. It is a very good chair.' },
      { label: 'Keep calm and ship', hint: 'More output for 10 weeks; people burn out faster for 10 weeks', effects: { modifier: [{ key: 'output', value: 0.05, weeks: 10, label: 'Lockdown sprint' }, { key: 'meaningDrain', value: 0.3, weeks: 10, label: 'Lockdown sprint' }] }, outcome: 'The commit graph goes up. So does the number of people who have not been outside.' },
      { label: 'A daily video call for everyone', hint: 'Knowledge keeps flowing; the camera fatigue is real', effects: { ik: 5, teamMeaning: -2 }, outcome: 'You learn what everyone\'s kitchen looks like. One person always has their camera off. You respect it.' },
    ],
  },
  {
    id: 'work_policy', kind: 'world', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'How do we work now?',
    text: 'The office is open again. Some people missed it. Some people have discovered they like working next to their dog. {company} needs a policy.',
    choices: [
      { label: 'Back to the office', hint: 'Mentoring works best; the team grumbles', effects: { workPolicy: 'office', teamMeaning: -2 }, outcome: 'The kitchen is thrilled to see everyone. Nobody else says anything.' },
      { label: 'Hybrid', hint: 'Some weeks in, some at home; mentoring and learning a little slower', effects: { workPolicy: 'hybrid', teamMeaning: 1 }, outcome: 'Tuesdays and Thursdays are office days. Everyone comes in on Wednesday by mistake.' },
      { label: 'Remote-first', hint: 'Lower rent and a wider hiring pool; slower learning, fewer fresh ideas, slower fixes, and it gets lonely', effects: { workPolicy: 'remote', teamMeaning: 1 }, outcome: 'The office becomes a place people visit, like a museum of your own company.' },
    ],
  },
  {
    id: 'pet_request', kind: 'staff', weight: 3, cooldownWeeks: 52, random: true, subject: 'workingStaff',
    when: (s) => s.workPolicy !== null && s.workPolicy !== 'remote' && s.staff.length >= 6 && !s.pets.some((p) => p.species === 'dog'),
    title: 'A dog on Fridays?',
    text: '{name} would like to bring their dog in on Fridays. They have printed photos. The photos are laminated.',
    choices: [
      { label: 'Yes, dogs welcome', hint: 'A dog joins the office; everyone recovers a little faster', effects: { adoptPet: 'dog', teamMeaning: 2 }, outcome: 'The dog does a lap of every desk, then lies down under the one belonging to the person who least expected it.' },
      { label: 'Not in the office', hint: '{name} is disappointed', effects: { meaning: -5 }, outcome: '{name} sets the dog as their video background instead. It is a strong statement.' },
    ],
  },
  {
    id: 'cat_request', kind: 'staff', weight: 2, cooldownWeeks: 78, random: true, subject: 'workingStaff',
    when: (s) => s.workPolicy !== null && s.staff.length >= 8 && !s.pets.some((p) => p.species === 'cat') && s.week >= (s.flags.workPolicyAsked ?? 9999) + 52,
    title: 'A cat, apparently',
    text: '{name} wants to bring a cat to the office. The cat has not been consulted and does not care either way.',
    choices: [
      { label: 'Fine. One cat.', hint: 'A cat moves in, picks one favourite person, and stays', effects: { adoptPet: 'cat', teamMeaning: 1 }, outcome: 'The cat sleeps on the warmest server. It has never looked at you. It never will.' },
      { label: 'Absolutely not', hint: 'Nothing happens. The cat is unbothered.', effects: {}, outcome: 'Somehow the cat is in the office on Monday anyway.' },
    ],
  },
  {
    id: 'pet_mishap', kind: 'misc', weight: 2, cooldownWeeks: 52, random: true, subject: null,
    when: (s) => s.pets.length > 0,
    title: 'Pet incident',
    text: 'A pet chewed through the network cable in the middle of a customer demo. The demo is now about the pet.',
    choices: [
      { label: 'Laugh it off', hint: 'Brand up a little; a little less output for 2 weeks', effects: { brand: 1, modifier: { key: 'output', value: -0.03, weeks: 2, label: 'Chewed cable' } }, outcome: 'The customer asks if the pet comes with the enterprise plan.' },
      { label: 'Pets stay home on demo days', hint: 'Team meaning dips a little', effects: { teamMeaning: -1 }, outcome: 'There is now a demo-day calendar. The pets are not invited to it.' },
    ],
  },
  {
    id: 'rival_appears', kind: 'market', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'A rival appears',
    text: '{rival} just launched in your market. Their founder, {rivalFounder}, says your product "feels a bit last year". Their launch video has a drone shot.',
    choices: [
      { label: 'Ignore them', hint: 'Nothing happens, for now', effects: {}, outcome: 'You do not watch the launch video. You watch it twice.' },
      { label: 'Fire back online', hint: 'A coin flip: sympathy and a slower rival, or you look small', effects: { gamble: { p: 0.5, effects: { brand: 3, rivalHit: 10 }, else: { brand: -2 } } }, outcome: 'Your reply gets more likes than their launch. Or it does not. The internet decides.' },
      { label: 'Out-ship them', hint: 'More output for 8 weeks; people burn out faster for 8 weeks', effects: { modifier: [{ key: 'output', value: 0.06, weeks: 8, label: 'Rivalry' }, { key: 'meaningDrain', value: 0.2, weeks: 8, label: 'Rivalry' }] }, outcome: 'The team has a new favourite hobby, and it is being better than {rival}.' },
    ],
  },
  {
    id: 'rival_jab', kind: 'market', weight: 2, cooldownWeeks: 52, random: true, subject: null,
    when: (s) => s.rival?.status === 'rising' || s.rival?.status === 'stalled',
    title: 'Another jab from {rival}',
    text: '{rivalFounder} went on a podcast and called {company} "a nice little lifestyle business". The podcast has eleven listeners. All of them work for you.',
    choices: [
      { label: 'Rise above it', hint: 'Team meaning up a little', effects: { teamMeaning: 1 }, outcome: 'You say nothing. It is the most satisfying nothing you have ever said.' },
      { label: 'Poach one of their people', hint: '-$10k; three senior candidates appear, and {rival} slows down', effects: { cash: -10000, candidates: 'seniorBatch', rivalHit: 15 }, outcome: 'Their best engineer takes your call. So do two of their friends.' },
    ],
  },
  {
    id: 'rival_merge', kind: 'market', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Merge with {rival}?',
    text: '{rival} is running out of money. {rivalFounder} proposes a merger: their customers, their team, and your name on the door.',
    choices: [
      { label: 'Merge', hint: '-$150k; their customers join your product in that market; {rival} is gone', effects: { cash: -150000, rivalFate: 'merged' }, outcome: '{rivalFounder} gets a nice title and a nicer chair. Their customers get your product. Most of them are fine with it.' },
      { label: 'Let them fall', hint: '{rival} shuts down', effects: { rivalFate: 'dead' }, outcome: 'Their last blog post is titled "What we learned". It is very long.' },
    ],
  },
  // Purpose: the mission, and the decisions that test it
  {
    id: 'mission_statement', kind: 'leadership', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'What are we for?',
    text: 'The agents can do most of the work now. The team keeps asking the same question in different words: what is {company} actually for? Pick one answer and mean it.',
    choices: [
      { label: 'Make software people love', hint: 'Purpose from craft and care; automating the craft away will cost it later', effects: { mission: 'craft', teamMeaning: 3 }, outcome: 'Someone prints it on a mug. The mug has a typo. You keep it.' },
      { label: 'A place where people grow', hint: 'Purpose from mentoring and juniors; replacing people will cost it later', effects: { mission: 'people', teamMeaning: 4 }, outcome: 'The juniors read it twice. One of them cries a little, quietly, in a good way.' },
      { label: 'The company customers trust', hint: 'Purpose from reliability and honesty; hype and shortcuts will cost it later', effects: { mission: 'trust', brand: 2 }, outcome: 'You write it at the top of the incident runbook. It is the only line anyone reads.' },
      { label: 'Grow as fast as the tools allow', hint: 'Purpose starts lower; automation keeps faith with it later', effects: { mission: 'growth', hype: 10 }, outcome: 'The all-hands claps. Some of the clapping is real.' },
    ],
  },
  {
    id: 'mission_test_support', kind: 'leadership', weight: 2, cooldownWeeks: 104, random: true, subject: null, eras: ['agents', 'consolidation', 'plateau'],
    when: (s) => !!s.purpose && s.staff.some((p) => p.role === 'support'),
    title: 'Humans on the phones?',
    text: 'The board has a spreadsheet showing support run entirely by agents. The support team has seen the spreadsheet. The spreadsheet is very convincing.',
    choices: [
      { label: 'Keep humans on support', hint: '-$20k; Purpose up if this is who you are', effects: { cash: -20000, teamMeaning: 2, purpose: { people: 6, trust: 6, craft: 3 } }, outcome: 'The support team sends you a photo of their very old headsets, raised in salute.' },
      { label: 'Hand support to the agents', hint: 'Support automation up; Purpose down unless you are here to grow', effects: { setAutomation: { support: 1 }, purpose: { people: -10, trust: -6, craft: -3, growth: 5 } }, outcome: 'The agents are polite, fast, and very sure about refunds.' },
    ],
  },
  {
    id: 'mission_test_demo', kind: 'market', weight: 2, cooldownWeeks: 78, random: true, subject: 'randomProduct', eras: ['agents', 'consolidation', 'plateau'],
    when: (s) => !!s.purpose,
    title: 'Ship it for the demo?',
    text: 'There is a big conference next week. The new {product} feature is half finished. Marketing has already made the slide.',
    choices: [
      { label: 'Ship it for the demo', hint: 'Hype +15; Purpose down if you promised care or trust', effects: { hype: 15, purpose: { craft: -6, trust: -6, growth: 4 } }, outcome: 'The demo goes perfectly, as long as nobody clicks anywhere.' },
      { label: 'Wait until it is right', hint: 'Hype down a little; Purpose up if this is who you are', effects: { hype: -5, purpose: { craft: 5, trust: 4 } }, outcome: 'Marketing mourns the slide. The feature ships three weeks later and works.' },
    ],
  },
  // Classic era flavor
  {
    id: 'cloud_bill', kind: 'misc', weight: 2, cooldownWeeks: 52, random: true, subject: null, eras: ['classic'],
    when: (s, h) => h.live.length > 0,
    title: 'The hosting bill',
    text: 'The hosting invoice has a new line item called "Egress". Nobody knows what egress is. Everyone is paying for it.',
    choices: [
      { label: 'Spend a sprint optimizing', hint: 'Less output for 4 weeks; savings arrive later', effects: { modifier: { key: 'output', value: -0.1, weeks: 4, label: 'Cost-cutting sprint' }, later: [{ inWeeks: 8, effects: { cash: 8000 } }] }, outcome: 'Someone finds a test server that has been running since the garage. It had a name. It was Kevin.' },
      { label: 'Just pay it', hint: '-$6k', effects: { cash: -6000 }, outcome: 'You pay it. Egress remains a mystery, like most of the cloud.' },
    ],
  },
  {
    id: 'app_store_rejection', kind: 'market', weight: 2, cooldownWeeks: 39, random: true, subject: 'randomProduct', eras: ['classic'],
    when: (s, h) => h.live.length > 0,
    title: 'Rejected by the app store',
    text: 'The app store rejected the latest {product} update for "unclear reasons". The reasons are, in fact, unclear.',
    choices: [
      { label: 'Appeal politely', hint: 'Slow, but it works out; hype later', effects: { later: [{ inWeeks: 4, effects: { hype: 8 } }] }, outcome: 'You fill in a form. Then another form. Then the first form again.' },
      { label: 'Complain loudly online', hint: 'A gamble: sympathy and hype, or you look petty', effects: { gamble: { p: 0.45, effects: { brand: 3, hype: 15 }, else: { brand: -3 } } }, outcome: 'Your post has a lot of replies. Some of them are even on your side.' },
    ],
  },
  {
    id: 'blockchain_pitch', kind: 'leadership', weight: 1, cooldownWeeks: 104, random: true, subject: 'founder', eras: ['classic'],
    when: (s, h) => s.week >= 26 && h.live.length > 0,
    title: 'Have you considered the blockchain?',
    text: 'A friend of {name} corners you at a barbecue with a plan to put {product} "on the blockchain". He has a hoodie with a logo on it.',
    choices: [
      { label: 'Politely decline', hint: 'The team is relieved', effects: { teamMeaning: 2 }, outcome: 'You say "interesting" four times and leave early. Your team is quietly proud of you.' },
      { label: 'Mint a coin', hint: 'A long shot: a hype spike or a brand hit', effects: { gamble: { p: 0.3, effects: { hype: 25, brand: 2 }, else: { brand: -5, teamMeaning: -3 } } }, outcome: 'The coin is called {product}Coin. Nobody can explain what it does, including the coin.' },
    ],
  },
  {
    id: 'onprem_bank', kind: 'market', weight: 2, cooldownWeeks: 52, random: true, subject: 'randomProduct', eras: ['classic'],
    when: (s, h) => s.week >= 30 && h.live.length > 0,
    title: 'A bank wants it on their servers',
    text: 'A regional bank wants {product} installed in their own server room. They will pay well. They also sent a 90-page security questionnaire.',
    choices: [
      { label: 'Do the install', hint: '+$20k; less output for 8 weeks', effects: { cash: 20000, modifier: { key: 'output', value: -0.1, weeks: 8, label: 'The bank install' } }, outcome: 'Your engineer spends three weeks in a room with no windows and one very old chair.' },
      { label: 'Say no', hint: 'Nothing happens', effects: {}, outcome: 'The bank is disappointed. The bank is always a little disappointed.' },
    ],
  },
  {
    id: 'ping_pong', kind: 'misc', weight: 2, cooldownWeeks: 104, random: true, subject: null, eras: ['classic'],
    when: (s) => s.staff.length >= 3,
    title: 'The ping pong question',
    text: 'Someone printed a picture of a ping pong table and taped it to the wall where a ping pong table would go.',
    choices: [
      { label: 'Buy one', hint: '-$1.5k; people recover a bit faster for 26 weeks', effects: { cash: -1500, modifier: { key: 'meaningRecovery', value: 0.1, weeks: 26, label: 'Ping pong' } }, outcome: 'The tournament bracket goes up within the hour. The founders lose in round one.' },
      { label: 'Not yet', hint: 'Nothing happens', effects: {}, outcome: 'The picture stays up. Someone draws a tiny ball on it.' },
    ],
  },
  // Funding pressure (only for companies funded that way)
  {
    id: 'family_dinner', kind: 'leadership', weight: 2, cooldownWeeks: 52, random: true, subject: 'founder', funding: 'family',
    when: (s) => s.week >= 20,
    title: 'Dinner, with questions',
    text: 'At a family dinner, {name}\'s uncle asks when {company} will "go public, like the Facebook". Everyone turns to look.',
    choices: [
      { label: 'Show them the dashboard', hint: '{name} feels seen; brand up a little', effects: { meaning: 5, brand: 1 }, outcome: 'Grandma asks what churn is. {name} explains for forty minutes. Grandma is now an investor.' },
      { label: 'Promise big news next year', hint: 'More output for 12 weeks; people burn out faster for 12 weeks', effects: { modifier: [{ key: 'output', value: 0.06, weeks: 12, label: 'Family expectations' }, { key: 'meaningDrain', value: 0.3, weeks: 12, label: 'Family expectations' }] }, outcome: 'The uncle raises a glass. The pressure is now a houseguest.' },
    ],
  },
  {
    id: 'family_checkin', kind: 'leadership', weight: 2, cooldownWeeks: 52, random: true, subject: null, funding: 'family',
    when: (s) => s.week >= 30,
    title: 'Your cousin would like an update',
    text: 'Your cousin put in ten thousand dollars and would like to "just check in" about the burn rate. Every Sunday. By voicemail.',
    choices: [
      { label: 'Start a monthly newsletter', hint: 'A little less output for 8 weeks; brand up a little', effects: { brand: 1, modifier: { key: 'output', value: -0.03, weeks: 8, label: 'Investor newsletter' } }, outcome: 'The newsletter has a mascot now. Nobody asked for the mascot.' },
      { label: 'Pay them back early', hint: '-$10k; the team exhales', effects: { cash: -10000, teamMeaning: 2 }, outcome: 'The cousin is thrilled, and very slightly offended.' },
    ],
  },
  {
    id: 'family_intern', kind: 'staff', weight: 2, cooldownWeeks: 78, random: true, subject: 'founder', funding: 'family',
    when: (s) => s.week >= 26,
    title: 'An internship for the nephew',
    text: '{name}\'s aunt has a kid who is "very good with computers". The kid would like a summer internship. The aunt would like it more.',
    choices: [
      { label: 'Sure, one summer', hint: 'Three junior candidates appear; the family is happy', effects: { candidates: 'juniorBatch', teamMeaning: 1 }, outcome: 'The nephew brings two friends. One of them is actually brilliant.' },
      { label: 'Politely decline', hint: '{name} dreads the holidays', effects: { meaning: -4 }, outcome: 'The aunt says it is fine. It is not fine.' },
    ],
  },
  {
    id: 'investor_growth_push', kind: 'leadership', weight: 3, cooldownWeeks: 39, random: true, subject: null, funding: 'preseed',
    when: (s, h) => h.live.length > 0,
    title: 'The board wants growth',
    text: 'Your investor forwards a chart where every line goes up and to the right. The subject line is "Q3?"',
    choices: [
      { label: 'Push for growth', hint: 'Signups up for 13 weeks; people burn out faster for 13 weeks', effects: { modifier: [{ key: 'acquisition', value: 0.2, weeks: 13, label: 'Growth push' }, { key: 'meaningDrain', value: 0.3, weeks: 13, label: 'Growth push' }] }, outcome: 'Everyone gets a growth target. The growth targets get growth targets.' },
      { label: 'Push back', hint: 'Brand dips a little; the team respects it', effects: { brand: -1, teamMeaning: 3 }, outcome: 'You say "sustainable" in a board meeting and live to tell the tale.' },
    ],
  },
  {
    id: 'investor_demo_day', kind: 'market', weight: 2, cooldownWeeks: 52, random: true, subject: null, funding: 'preseed',
    when: (s, h) => h.live.length > 0,
    title: 'Demo day',
    text: 'Your fund\'s demo day is next week. Two minutes on stage, three hundred investors, and one very loud smoothie blender.',
    choices: [
      { label: 'Pitch the newest product', hint: 'Hype +20 on your newest product, brand up a little', effects: { hype: 20, brand: 1 }, outcome: 'The blender goes off mid-sentence. You pause, perfectly. People clap.' },
      { label: 'Skip it', hint: 'Nothing happens', effects: {}, outcome: 'You watch the livestream. Someone else pitches the same idea, worse.' },
    ],
  },
  {
    id: 'investor_automation_push', kind: 'leadership', weight: 3, cooldownWeeks: 52, random: true, subject: null, funding: 'preseed', eras: ['agents', 'consolidation'],
    when: (s) => s.staff.length >= 6,
    title: 'Why so many humans?',
    text: 'Your investor read a thread about a company with three employees and fifty million in revenue. They would like to discuss your headcount.',
    choices: [
      { label: 'Automate harder', hint: 'Every automation dial +25%; meaning drains faster for 26 weeks', effects: { automationBump: 0.25, purpose: { craft: -5, people: -8, growth: 5 }, modifier: { key: 'meaningDrain', value: 0.4, weeks: 26, label: 'Headcount pressure' } }, outcome: 'The agents get more work. The humans get more dashboards about the agents.' },
      { label: 'Defend the team', hint: 'Team meaning up; fewer signups for 13 weeks while the investor sulks', effects: { teamMeaning: 4, purpose: { people: 8, craft: 3 }, modifier: { key: 'acquisition', value: -0.1, weeks: 13, label: 'Investor sulking' } }, outcome: '"Those three employees have not slept since 2027," you say. The call ends early.' },
    ],
  },
  // Annual calendar (raised by the annual system)
  {
    id: 'conference_expo', kind: 'annual', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'SaaSCon is next week',
    text: 'The biggest software expo of the year. {incumbent} has a booth with a slide.',
    choices: [
      { label: 'Skip it', hint: 'Nothing happens', effects: {}, outcome: 'You watch the keynote on stream. It is fine.' },
      { label: 'Small booth', hint: '-$15k, brand +2, hype +10 on newest product', effects: { cash: -15000, brand: 2, hype: 10 }, outcome: 'A folding table, a banner, and a lot of stickers.' },
      { label: 'Big booth', hint: '-$40k, brand +5, hype +25. Needs the Office Floor', requires: 'stage1', effects: { cash: -40000, brand: 5, hype: 25 }, outcome: 'Your booth has a slide too. Yours is bigger.' },
    ],
  },
  {
    id: 'awards_show', kind: 'annual', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'The Saasies',
    text: 'The annual awards show. Everyone pretends not to care.',
    auto: {},
  },
  {
    id: 'year_summary', kind: 'annual', weight: 0, cooldownWeeks: 0, random: false, subject: null,
    when: () => true,
    title: 'Year in review',
    text: 'Another year at {company}.',
    auto: {},
  },

  // Misc
  {
    id: 'coffee_machine_broke', kind: 'misc', weight: 2, cooldownWeeks: 104, random: true, subject: null, office: 'espresso',
    when: (s) => s.office.placed.some((i) => i.itemId === 'espresso'),
    chat: 'Coffee machine status: deceased. Please grieve responsibly.',
    title: 'The coffee machine is dead',
    text: 'The espresso machine made a noise like a sad robot and stopped. Productivity is in freefall.',
    choices: [
      { label: 'Buy the fancy one', hint: 'Upgrades your espresso machine one level at shop price; team meaning up', requires: 'canUpgradeEspresso', effects: { upgradeItem: 'espresso', teamMeaning: 3 }, outcome: 'It has a touchscreen. Nobody knows how to make a normal coffee.' },
      { label: 'Get it repaired', hint: '$800 and it works again', effects: { cash: -800 }, outcome: 'A technician named Gary fixes it with a single, confident tap.' },
      { label: 'Live with it', hint: 'Team meaning down', effects: { teamMeaning: -2 }, outcome: 'The instant coffee comes out. Morale goes in.' },
    ],
  },
  {
    id: 'coffee_wanted', kind: 'misc', weight: 2, cooldownWeeks: 52, random: true, subject: null,
    when: (s) => s.week >= 8 && !s.office.placed.some((i) => i.itemId === 'espresso'),
    chat: 'The office kettle is doing its best. Its best is not enough.',
    title: 'The team wants a coffee machine',
    text: 'Someone has started bringing a thermos to meetings. Someone else brought a French press and guards it like a dragon.',
    choices: [
      { label: 'Buy an espresso machine', hint: 'Adds an Espresso Machine to the office at shop price; team meaning up', requires: 'canBuyEspresso', effects: { buyItem: 'espresso', teamMeaning: 2 }, outcome: 'The machine arrives. So does a queue.' },
      { label: 'Not yet', hint: 'Team meaning down a little', effects: { teamMeaning: -1 }, outcome: 'The French press stays on its throne.' },
    ],
  },
];

export const EVENTS = Object.fromEntries(list.map((e) => [e.id, e]));

export const INCIDENT_EVENT = {
  db_wipe: 'agent_db_wipe', runaway_spend: 'agent_runaway_spend', mass_email: 'agent_mass_email',
  prompt_injection_leak: 'agent_prompt_injection_leak', pricing_rewrite: 'agent_pricing_rewrite',
  refund_hallucination: 'support_refund_hallucination', credential_stuffing: 'credential_stuffing',
  ransomware: 'ransomware', supply_chain: 'supply_chain', data_exfiltration: 'data_exfiltration', phishing: 'phishing_ceo',
};
