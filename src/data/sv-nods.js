import { B } from '../sim/balance.js';
// Nods to a certain TV show about a certain valley: the incubator house, The Box, four thousand pounds of oat
// milk, tabs or spaces, and a one-trick sausage app. Each fires at most once a run. Text lives here so any line
// is a one-line swap. The Squish Score is a research node (src/data/research.js).

const N = B.svNods;
const ONCE = 100000;
const k = (n) => `$${Math.round(n / 1000)}k`;

export const SV_NODS = [
  {
    id: 'incubator_house', kind: 'leadership', weight: 3, cooldownWeeks: ONCE, random: true, subject: null, eras: ['classic'],
    when: (s) => s.officeStage === 0 && s.week >= N.incubatorFrom && s.week <= N.incubatorUntil,
    title: 'The incubator house',
    text: 'A would-be mentor has a big house, a hot tub nobody uses, and an offer: live and work there rent-free, for ten percent of whatever {company} becomes.',
    stage: { prop: 'house_sign', anchor: 'door' },
    choices: [
      { label: 'Move in', hint: `+${k(N.incubatorCash)} saved on rent now; the final score gives up ${Math.round(N.incubatorCut * 100)}%; he will want credit later`,
        effects: { cash: N.incubatorCash, flag: { name: 'incubatorCut', value: N.incubatorCut }, later: [
          { inWeeks: N.incubatorPodcastWeeks, effects: { chat: { from: '@newsbot', channel: 'random', text: 'Podcast episode 212: a self-described "founder of {company}" talks about the early days. Nobody at {company} has met him since.' } } },
        ] },
        leaves: { prop: 'house_sign', until: { weeks: N.incubatorSignWeeks } },
        outcome: 'You move in. The hot tub is, it turns out, a storage room for his previous founders\' laptops.' },
      { label: 'Keep the garage', hint: 'Nothing changes', effects: {}, outcome: 'The garage stays. It is cold, but it is yours.' },
      { label: 'Counter at five percent', hint: `A gamble: half the time he takes it (+${k(N.incubatorCash)}, the final score gives up ${Math.round(N.incubatorCounterCut * 100)}%), otherwise he walks`,
        effects: { gamble: { p: N.incubatorCounterChance, effects: { cash: N.incubatorCash, flag: { name: 'incubatorCut', value: N.incubatorCounterCut } } } },
        outcome: 'He thinks about it in the hot tub. You wait by the door.' },
    ],
  },
  {
    id: 'the_box', kind: 'market', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'seniorStaff', eras: ['agents', 'consolidation', 'plateau'],
    when: (s) => !!s.rival && ['rising', 'stalled'].includes(s.rival.status),
    title: 'The Box',
    text: '{rival} launched The Box: a brushed-aluminium cube that does what your product does, slower, for four times the price. Analysts love it.',
    stage: { prop: 'box_poster', anchor: 'wall' },
    choices: [
      { label: 'Build our own box', hint: `${k(N.boxCost)}; hype up; some comprehension debt`, effects: { cash: -N.boxCost, hype: N.boxHype, debt: N.boxDebt },
        leaves: { prop: 'box_cube', anchor: 'subjectDesk', until: { weeks: N.boxCubeWeeks } },
        outcome: '{name} gets a cube on their desk and a deadline. The cube has no ports. The deadline has no mercy.' },
      { label: 'Stay software', hint: 'Brand up a little now, and again later when The Box ages badly', effects: { brand: 1, later: [
        { inWeeks: N.boxRecallWeeks, effects: { chat: { from: '@newsbot', channel: 'random', text: '{rival} is recalling The Box. It was, a teardown found, a regular server in a nice jacket.' }, brand: 1 } },
      ] }, outcome: 'You keep shipping software. It has no aluminium in it at all.' },
      { label: 'Mock it', hint: 'A gamble: brand up if it lands, down if it does not', effects: { gamble: { p: N.boxMockChance, effects: { brand: 3 }, else: { brand: -2 } } },
        outcome: 'You post a photo of a shoebox with our logo on it. The internet decides.' },
    ],
  },
  {
    id: 'oat_milk', kind: 'vendor', weight: 2, cooldownWeeks: ONCE, random: true, subject: null, eras: ['agents', 'consolidation', 'plateau'],
    when: (s) => s.automation.ops.level >= N.oatOpsLevel && s.staff.length >= N.oatStaff,
    title: 'Four thousand pounds of oat milk',
    text: 'The procurement agent noticed oat milk runs out on Thursdays. It fixed that. There are now four thousand pounds of oat milk in the lobby.',
    stage: { prop: 'oat_milk', anchor: 'door' },
    choices: [
      { label: 'Send it back', hint: `${k(N.oatFee)} restocking fee`, effects: { cash: -N.oatFee }, outcome: 'The pallets leave. The agent files a ticket titled "Thursday risk".' },
      { label: 'Keep it', hint: 'Stamina drains a little slower for 52 weeks; the lobby smells faintly of oats',
        effects: { modifier: { key: 'staminaDrain', value: -N.oatStamina, weeks: 52, label: 'The oat milk reserve' } },
        leaves: { prop: 'oat_milk', until: { weeks: N.oatWeeks } }, outcome: 'Lattes for everyone, forever. Or for a year, which feels the same.' },
      { label: 'Donate it', hint: 'Brand up', effects: { brand: 2 }, outcome: 'A food bank sends a thank-you card and a slightly worried follow-up.' },
    ],
  },
  {
    id: 'is_it_kielbasa', kind: 'staff', weight: 2, cooldownWeeks: ONCE, random: true, subject: 'juniorStaff', eras: ['chatgbt', 'agents'],
    when: (s) => s.staff.length >= N.kielbasaStaff,
    title: 'Is it kielbasa?',
    text: '{name} built an app over the weekend that tells you whether something is kielbasa. It is extremely confident. It is right about half the time.',
    choices: [
      { label: 'Ship it', hint: 'Hype up now, fading over the next weeks; the team loves it', effects: { hype: N.kielbasaHype, teamMeaning: 2, later: [{ inWeeks: N.kielbasaFadeWeeks, effects: { hype: -Math.round(N.kielbasaHype / 2) } }] },
        outcome: 'The app store listing gets forty thousand downloads and one furious review from a hot dog.' },
      { label: 'Sell the tech', hint: `{incumbent} pays ${k(N.kielbasaSale)}`, effects: { cash: N.kielbasaSale },
        outcome: '{incumbent} buys it for a sum nobody will say out loud. They rename it "Sausage Intelligence".' },
      { label: 'Keep it as a demo', hint: 'Their meaning up; the team loves it', effects: { meaning: 6, teamMeaning: 2 },
        outcome: 'It becomes the office party trick. It identifies the office plant as kielbasa. Nobody corrects it.' },
    ],
  },
  {
    id: 'tabs_or_spaces', kind: 'staff', weight: 0, cooldownWeeks: ONCE, random: false, subject: 'randomStaff',
    when: () => true,
    title: 'Tabs or spaces',
    text: 'The indentation argument has reached its fourth week and its second whiteboard. {name} would like a ruling.',
    choices: [
      { label: 'Set a company standard', hint: '{name} is thrilled; the other side sulks; team meaning down a little', effects: { meaning: 4, teamMeaning: -1 },
        outcome: 'A standard is set. One side is smug in Yak for a month. The other side sets their editor to lie.' },
      { label: 'Let the linter decide', hint: 'Institutional knowledge up; nobody is happy', effects: { ik: 2, teamMeaning: -1 },
        outcome: 'The linter decides. Everyone agrees to hate the linter. Peace, of a kind.' },
      { label: 'Ban the topic', hint: 'Team meaning down a little; it moves to a private channel', effects: { teamMeaning: -1 },
        outcome: 'The topic is banned. A private channel called #whitespace appears within the hour.' },
    ],
  },
];
