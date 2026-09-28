// What the effects report (docs/effects/) says about rules that live in code rather than data: each entry
// names the balance.js value behind it, so the report prints the current number. Formats: 'pct' a fraction
// shown as a percent change, 'x100' a multiplier shown as a percent change, 'mult' a multiplier, 'num' a
// signed number, 'count' an unsigned number, 'share' a fraction shown as a percent, 'half' half of a fraction as a
// percent change.
export const POLICY_EFFECTS = {
  daily_standups: [['output', 'standupDailyOutput', 'pct'], ['know-how', 'standupIkBonus', 'pct'], ['meaning per speaker per standup', 'standupDailyMeaning', 'num']],
  async_standups: [['know-how', 'standupIkBonus', 'half'], ['share of speakers who post', 'asyncStandupPostChance', 'share']],
  pair: [['automation meaning drain', 'pairMeaningDrainMult', 'mult'], ['automation output', 'pairAutoMult', 'mult']],
  craft_fridays: [['output', 'craftFridaysOutput', 'x100'], ['meaning recovery a week', 'meaningRecovery.craftFridays', 'num']],
  blameless: [['knowledge per engineer when an outage clears', 'blamelessKnowledge', 'num']],
  comprehension_reviews: [['project speed', 'comprehensionReviewSpeed', 'x100'], ['comprehension debt paid down a week', 'debtPaydownReviews', 'num']],
  apprenticeship: [['skill added to each junior candidate', 'apprenticeSkillBonus', 'num']],
  sabbatical: [['weeks away', 'sabbaticalWeeks', 'count'], ['meaning recovery a week while away', 'meaningRecovery.sabbatical', 'num']],
  no_crunch: [['strain build-up', 'noCrunchStrainMult', 'mult'], ['output', 'noCrunchOutput', 'pct']],
  crunch: [['output', 'crunchOutput', 'pct'], ['strain a week on project or maintenance work', 'crunchStrain', 'num'], ['meaning drain', 'crunchMeaningDrain', 'num']],
  top_pay: [['chance an outside offer is taken', 'topPayAttrition', 'mult']],
  office_upkeep: [['chance an outside offer is taken', 'upkeepAttrition', 'mult'], ['meaning recovery a week', 'upkeepMeaningRecovery', 'num']],
  incentives: [['weeks between rewards', 'incentiveEveryWeeks', 'count'], ['output while a reward lasts', 'incentiveOutput', 'pct'], ["winner's meaning", 'incentiveWinnerMeaning', 'num'], ['envy for everyone else', 'incentiveEnvy', 'num'], ['awards between music nights once the ladder is climbed', 'incentiveMusicEvery', 'count']],
};

// Office item effect keys, as the report names them.
export const ITEM_EFFECT_LABELS = {
  meaningRecovery: 'meaning recovery', staminaRecovery: 'stamina recovery', output: 'output', burnoutResign: 'burnout resignations',
  staminaDrain: 'stamina drain', novelty: 'novelty', knowledgeGain: 'knowledge gain', oversight: 'oversight hours',
  maintenanceNeed: 'maintenance needed', uptimeFloor: 'uptime floor', brandDecay: 'brand decay',
};

// Trait and career path modifiers.
export const TRAIT_MOD_LABELS = {
  polish: 'polish', meaningDrain: 'meaning drain', meaningRecovery: 'meaning recovery', hype: 'hype', oversight: 'oversight', catch: 'bug catching',
  mentorBonus: 'mentoring', output: 'output', stamina: 'stamina', features: 'features', reliability: 'reliability', resign: 'chance of resigning',
  novelty: 'novelty', xp: 'learning speed', debtPaydown: 'debt paydown', knowledgeGain: 'knowledge gain', oversightMeaning: 'meaning from oversight',
  hardProblemNovelty: 'novelty from hard problems', brandPerWeek: 'brand a week', brandGain: 'brand gains', supportHours: 'support hours', churn: 'churn',
  postureFlat: 'security posture', outageFix: 'outage fixing', salesBoost: 'sales', acquisition: 'customer acquisition',
};

// Named conditions on a choice (`requires`) or a conditional effect (`cond`).
export const CONDITION_LABELS = {
  subjectCompliant: 'the product runs on a compliance-friendly model', trustedVendor: 'the last incident was on a trusted vendor',
  blameless: 'Blameless Postmortems is on', ik40: 'know-how is 40 or more', bestScore7: 'a live product scores 7 or more',
  sabbaticalPolicy: 'the Sabbatical Program is on', stage1: 'you have the Office Floor', affordConsultants: `you can afford the consultants`,
  noCraftRunning: 'no craft project is running', canBuyEspresso: 'an espresso machine can be bought', canUpgradeEspresso: 'the espresso machine can be upgraded',
  dealTakeable: 'a deal is open to you', expansionReady: 'the expansion is open', mentorAvailable: 'a mentor is free for them',
};

// Who or what an event is about (its `subject`).
export const SUBJECT_LABELS = {
  randomStaff: 'anyone in', seniorStaff: 'a senior', juniorStaff: 'a junior', unmentoredJunior: 'a junior without a mentor',
  burnoutStaff: 'someone burnt out', coastingStaff: 'someone coasting', workingStaff: 'someone at work (not a founder)',
  automatedSenior: 'a senior whose work is at least half automated', mentorStaff: 'a mentor', founder: 'a founder',
  veteranStaff: 'a long-serving person', randomProduct: 'one of your live products',
};

// Office item rules that live in code rather than in the item's effects, as (B) => text.
export const ITEM_RULES = {
  desk: (B) => `seats one person; every hire needs a free desk. In the HQ Building at most ${B.hqDeskCap}, plus ${B.expansionDeskStep} per expansion`,
  meeting_table: () => 'no effect on the numbers',
};
