// Random and triggered events. `when(state, h)` receives helpers from the sim:
// h = { B, mrr, live, bestScore, usesModel(id) }.
// Placeholders in title/text: {name} (subject staff), {product} (subject product), {company}, {incumbent}.
// Effects apply to the subject (staff or product) where the key is per-subject; see EFFECT_KEYS below.

export const SUBJECTS = [null, 'randomStaff', 'seniorStaff', 'juniorStaff', 'burnoutStaff', 'automatedSenior', 'mentorStaff', 'randomProduct'];

export const EFFECT_KEYS = [
  'cash', 'brand', 'debt', 'ik', 'hype', 'customersPct', 'health', 'meaning', 'knowledge', 'teamMeaning',
  'resign', 'assign', 'candidates', 'flag', 'win', 'salaryPct', 'startCraft', 'gpuShortageWeeks',
  'clones', 'priceHike', 'vendorOutage', 'migrateOff', 'modelBoost', 'cond', 'gamble',
];

// Named tests usable in `cond` effects and in a choice's `requires`.
export const CONDITION_IDS = [
  'subjectCompliant', 'trustedVendor', 'blameless', 'ik40', 'bestScore7', 'sabbaticalPolicy', 'stage1', 'mentorAvailable',
];

const ONCE = 100000;

const list = [
  // Staff
  {
    id: 'senior_grumble', kind: 'staff', weight: 3, cooldownWeeks: 20, random: true, subject: 'automatedSenior',
    when: (s) => s.automation.engineering.level >= 0.5,
    title: 'A senior has concerns',
    text: '{name} corners you by the coffee machine: "Is my job just reviewing robot PRs now?"',
    choices: [
      { label: 'Give them a hard problem', hint: 'Meaning up, off regular work', effects: { assign: { type: 'hardProblem' }, meaning: 6 }, outcome: '{name} is already sketching on the whiteboard.' },
      { label: 'Talk it through over lunch', hint: 'Small cost, meaning up', effects: { cash: -500, meaning: 8 }, outcome: 'Good tacos. Better conversation.' },
      { label: 'Tell them to embrace the future', hint: 'Meaning down', effects: { meaning: -6 }, outcome: '{name} nods slowly and says nothing.' },
    ],
  },
  {
    id: 'junior_asks_mentor', kind: 'staff', weight: 3, cooldownWeeks: 16, random: true, subject: 'juniorStaff',
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
      { label: 'Greenlight a craft project', hint: 'Starts a craft project, meaning up', effects: { startCraft: true, meaning: 5 }, outcome: 'The craft project begins. Fonts will be discussed.' },
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
    id: 'acquisition_offer', kind: 'market', weight: 6, cooldownWeeks: ONCE, random: true, subject: null,
    when: (s, h) => h.mrr >= h.B.acquisitionOfferMrr,
    title: 'An acquisition offer',
    text: '{incumbent} wants to buy {company}. The number has a lot of zeros. The integration plan has a lot of question marks.',
    choices: [
      { label: 'Accept the offer', hint: 'Ends the run as a win', effects: { win: 'acquired' }, outcome: 'You sign. Somewhere, a press release is already written.' },
      { label: 'Decline', hint: 'Brand up a little', effects: { brand: 2 }, outcome: '"We are just getting started," you tell TechCrunchy.' },
    ],
  },
  {
    id: 'vc_offer', kind: 'market', weight: 3, cooldownWeeks: ONCE, random: true, subject: null,
    when: (s) => s.week >= 26 && !s.flags.diluted,
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
    text: 'A tiny package your agents auto-installed turned out to be a crypto miner in a trench coat.',
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
    id: 'coffee_machine_broke', kind: 'misc', weight: 2, cooldownWeeks: 40, random: true, subject: null,
    when: () => true,
    title: 'The coffee machine is dead',
    text: 'The coffee machine made a noise like a sad robot and stopped. Productivity is in freefall.',
    choices: [
      { label: 'Buy the fancy one', hint: 'Costs cash, team meaning up', effects: { cash: -2500, teamMeaning: 3 }, outcome: 'It has a touchscreen. Nobody knows how to make a normal coffee.' },
      { label: 'Live with it', hint: 'Team meaning down', effects: { teamMeaning: -2 }, outcome: 'The instant coffee comes out. Morale goes in.' },
    ],
  },
  {
    id: 'office_dog', kind: 'misc', weight: 2, cooldownWeeks: 52, random: true, subject: null,
    when: (s) => s.staff.length >= 3,
    title: 'Office dog',
    text: 'Someone brought their dog to work. The dog has attended every meeting and approved every PR.',
    auto: { teamMeaning: 4 },
  },
];

export const EVENTS = Object.fromEntries(list.map((e) => [e.id, e]));

export const INCIDENT_EVENT = {
  db_wipe: 'agent_db_wipe', runaway_spend: 'agent_runaway_spend', mass_email: 'agent_mass_email',
  prompt_injection_leak: 'agent_prompt_injection_leak', pricing_rewrite: 'agent_pricing_rewrite',
  refund_hallucination: 'support_refund_hallucination', credential_stuffing: 'credential_stuffing',
  ransomware: 'ransomware', supply_chain: 'supply_chain', data_exfiltration: 'data_exfiltration', phishing: 'phishing_ceo',
};
