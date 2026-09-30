// Every tunable number in the simulation. Tune here, nowhere else.
export const B = {
  web2: {
    weeks: 208, startYear: 2003, endYear: 2019,
    workMult: 1.20, whispererWorkMult: 1.08, legacyLaunches: 3,
    qaCost: 8000, qaDebt: -5, sandboxCost: 5000, sandboxDebt: -2, exceptionDebt: 5,
    pngCost: 1000, pngPolish: 3, eventWeight: 2, eventCooldown: 52, chatterEvery: 13,
    launchReward: { cash: 5000, brand: 2 },
  },
  y2k: {
    year: 1999, onCallQuarter: 4, contractPoints: 40, contractFee: 18000, contractLimit: 3,
    consultantRate: 3000, consultantMultiplier: 3,
    gatherSeconds: 5, countdownSeconds: 5, anticlimaxSeconds: 3, invoiceSeconds: 5,
    propWeeks: 2,
  },
  dotcom: {
    weeks: 208, startYear: 1997, endYear: 2003,
    boomWeek: 26, ipoWeek: 78, warningWeek: 104, bustWeek: 156,
    boomAcquisition: 1.25, bustAcquisition: 0.65, floatCash: 180000, privateBrand: 2,
    retainCostCap: 20000, retainCashShare: 0.1, retainLoss: 0.1, preserveLoss: 0.25,
    floatCostCap: 50000, floatCashShare: 0.2,
    bannerCosts: [3000, 6000, 12000], bannerAcquisition: [0.05, 0.1, 0.15],
    launchReward: { cash: 5000, brand: 1 }, survivorReward: { cash: 10000, brand: 2 },
    sockCost: 3000, sockHype: 5, sockWeight: 2, sockCooldown: 52, chatterEvery: 13,
  },
  momentTalkRadius: 4,
  momentTalkLines: 2,
  momentSpeechQueueMax: 24,
  momentSpeechMaxAge: 45,
  momentSpeechGap: 1,
  momentSpeechStartDelay: 1,
  momentTalkMemory: 24, partyTalkGapWeeks: 6,
  runWeeks: 1040, anniversaryWeek: 1040, retireFromWeek: 520, startBrand: 5, runwayLoseWeeks: 8, maxHistory: 800,
  salary: { junior: 900, mid: 1600, senior: 2600 }, hireFeeWeeks: 2,
  candidateRefreshWeeks: 4, candidateCount: 5,
  // Level-ups in one week that earn a team growth line in #wins.
  growthDigestMin: 3,
  // Level and training entries kept in a person's growth history; milestones are kept for good.
  growthHistoryMax: 20,
  xpPerLevel: 60, xpPerWeekWorking: 8, promoteMidLevel: 5, promoteSeniorLevel: 10, maxLevel: 20,
  juniorXpAutomationPenalty: 0.7, mentorXpMult: 2.2, mentorOutputMult: 0.6,
  basePoints: 4, pointsPerLevel: 1.1,
  roleWeights: {
    engineer: { features: 0.45, reliability: 0.35, novelty: 0.1, polish: 0.1 },
    designer: { features: 0.2, reliability: 0, novelty: 0.3, polish: 0.5 },
    marketer: { features: 0, reliability: 0, novelty: 0.3, polish: 0.1 },
    security: { features: 0, reliability: 0.4, novelty: 0, polish: 0 },
    support: { features: 0.05, reliability: 0.1, novelty: 0, polish: 0.1 },
    sales: { features: 0.05, reliability: 0, novelty: 0.05, polish: 0 },
  },
  seniorityOutput: { junior: 0.6, mid: 1.0, senior: 1.45 },
  hardProblemNovelty: 6, craftFridaysOutput: 0.9, comprehensionReviewSpeed: 0.85,
  autoEngPoints: 45, autoEngWeights: { features: 0.55, reliability: 0.25, novelty: 0.05, polish: 0.15 },
  autoOpsMaintenance: 60, autoQaReliability: 0.3,
  pairAutoMult: 0.6, pairMeaningDrainMult: 0.3,
  oversightHoursPerLevel: { engineering: 20, support: 14, sales: 8, marketing: 6, qa: 10, ops: 24 },
  oversightHoursPerPerson: 20,
  supportHoursPerCustomer: 1 / 150, supportHoursPerPerson: 40, autoSupportHours: 400,
  salesCloseBoostPerPerson: 0.006, autoSalesBoost: 0.008,
  meaningDrain: { junior: 0.6, mid: 1.1, senior: 1.8 }, meaningBaseRecovery: 0.35,
  meaningRecovery: { mentor: 1.2, mentee: 0.6, hardProblem: 1.6, craft: 1.1, sabbatical: 4, oversight: 0.4, craftFridays: 0.5, owner: 0.4 },
  meaningGrind: 0.22, meaningGrindPerHead: 0.02, meaningCeilingBand: 50,
  yearlyRaise: 0.04, modelCostMult: 2, autoCostMult: 0.6, overheadFreeHeadcount: 12, overheadPerHead: 300, staleChurn: 0.012,
  meaningCatchBonus: 12, meaningAwardBonus: 8, meaningLaunchBonus: 4,
  coastingBelow: 35, burnoutBelow: 15, coastingOutput: 0.6, burnoutOutput: 0.2,
  resignChance: { coasting: 0.01, burnout: 0.07 }, burnoutWeeksBeforeResign: 3, sabbaticalWeeks: 4,
  staminaDrainWorking: 0.6, staminaRecovery: 1.2, staminaLowBelow: 25,
  knowledgeGainWorking: 0.5, knowledgeGainMentee: 1.0, newHireKnowledge: 10,
  ikBaseline: 1.35, ikPerProduct: 0.68,
  debtFromEngAuto: 0.8, debtFromQaAuto: 0.35, debtFromOpsAuto: 0.3, debtPerProduct: 0.04,
  // Project work adds debt per builder-week, weighted by seniority; paydowns are shares of the current debt
  // a week, so debt settles where inflow and paydown meet. The Big Refactor clears a share when it ships.
  debtPerBuildWeek: 0.12, debtBuildWeight: { junior: 1.6, mid: 1, senior: 0.4 }, debtCrunchMult: 1.5,
  debtPaydownPerSeniorEng: 0.004, debtPaydownMaintenance: 0.002, debtPaydownReviews: 0.027, debtRefactorShare: 0.6,
  debtFromDeparturePerKnowledge: 0.12, debtLowIkThreshold: 40, debtLowIkRate: 0.03,
  sizes: {
    small: { points: 400, cost: 2000, minStage: 0 },
    medium: { points: 1000, cost: 8000, minStage: 0 },
    large: { points: 2400, cost: 25000, minStage: 1 },
  },
  pointsGrowthPerYear: 0.1, expectationGrowth: 0.1, expectationYearsCap: 5, reviewNoise: 0.9, balancePenaltyBelow: 0.08,
  qualityBase: 0.5, autoQualityBase: 0.3, autoQualityPerCap: 0.6, autoAssistQuality: 0.9,
  reviewBase: 6.1, reviewScale: 4.1, fitScoreScale: 3.3, reviewsReliabilityBonus: 0.1, updateOldScoreWeight: 0.4,
  migrationPoints: 250, updatePointsMult: 0.3, refactorPoints: 450, craftPoints: 320,
  appealExp: 1.5, noveltyAppealPer: 1 / 6, appealScale: 5, sizeAppeal: { small: 1, medium: 1.4, large: 2 }, incumbentStrengthGrowth: 0.03, cloneStrength: 60,
  marketScale: 0.15, adoptionStart: 0.4, adoptionPerYear: 0.06, incumbentErosion: 0.002, erosionScore: 8, candidateSkillPerYear: 2.5,
  acquisitionRate: 0.04, hypeAcquisition: 0.0012,
  baseChurn: 0.008, minChurn: 0.002, churnBrandRelief: 0.00004, wrapperChurn: 0.02, supportShortfallChurn: 0.02, outageChurn: 0.05,
  maintenancePerProduct: 3, maintenancePerCustomer: 1 / 4000, healthDecay: 6, healthRecovery: 1, uptimeFloor: 0.5,
  noveltyDecay: 0.08, enterpriseComplianceMult: 0.75,
  hypeDecay: 0.08, brandDecay: 0.03, brandDecayRate: 0.012, marketerHypePerWeek: 1.2, autoMarketingHype: 0.4,
  autoMarketingBrandPenalty: 0.6, wrapperGap: 2.5, wrapperBrandHit: 4,
  showHnEveryWeeks: 6, cloneChanceBase: 0.012, cloneChanceYearGrowth: 0.35, cloneDecay: 0.01,
  copyDelayWeeks: [26, 52], copyNoveltyMult: 0.5, copyIncumbentMult: 1.08,
  vendorReleaseEveryWeeks: 26, vendorCapabilityStep: 7, deprecateChance: 0.5, priceHikeChance: 0.08,
  migrationDeadlineWeeks: 26, missedMigrationHealth: 3, priceHikeMult: 1.3,
  rogueBase: 0.015, rogueShortfallFloor: 0.08, catchBase: 0.75, catchMax: 0.95, caughtDamageMult: 0.2,
  // The NOC (#342): Security staff for a full humans crew; the agents' catch multiplier, the chance they misread
  // an incident, and the weeks between switching modes.
  nocCrew: 3, nocAgentCatch: 1.5, nocMisreadChance: 0.15, nocSwitchWeeks: 26,
  // The office robot (#178). Item effects live in items.js; these are its moods.
  //   plantBoost: Potted Plant adjacency multiplier from level 2. breakChance: a week, x l3BreakMult at level 3.
  //   grumbleFrom / sabotageFrom: automation share where grumbling and sabotage start; refuseExposure: how automated
  //   someone's own job is before they refuse its coffee. sabotageChance: a week at full automation, scaled from
  //   sabotageFrom; googlyMult once it has eyes. calmWeeks: no sabotage after a blameless meeting or a party.
  //   fixesForTrait: slaps that earn Percussive Maintenance. fixMeaning: meaning for a same-week fix. grumbleChat / fondChat: a week, a line in #random.
  robot: {
    plantBoost: 1.25, breakChance: 0.02, l3BreakMult: 0.6, grumbleFrom: 0.3, sabotageFrom: 0.6, refuseExposure: 0.5,
    sabotageChance: 0.04, googlyMult: 0.5, calmWeeks: 26, fixesForTrait: 2, fixMeaning: 2, grumbleChat: 0.08, fondChat: 0.03,
  },
  ransomFloor: 10000, ransomCap: 400000, ransomCashShare: 0.2, ransomMrrMonths: 0.5, ransomMaxCashShare: 0.6,
  cyberGraceWeeks: 26, cyberBase: 0.006, cyberPerMrr: 0.00000004, cyberMax: 0.12,
  incidentCashPerSeverity: 4000, incidentCashYearGrowth: 0.3, outageMinSeverity: 3,
  postureSecurityPerSkill: 3.2, postureAudit: 20, postureAuditDecay: 0.4, postureTooling: 12, postureDebtPenalty: 0.5,
  auditCost: 15000, toolingWeekly: 900, consultantCost: 45000, founderFixMult: 1.5, bridgeOfferCooldownWeeks: 26,
  outageComplexityPerProduct: 0.2, fixersCounted: 3,
  postmortemWeeks: 1, postmortemQueueMax: 6, postmortemDebt: 5, postmortemKnowledge: 3, postmortemMeaning: 2, patchDebt: 3, incidentDebtLineMult: 1.3, incidentSprawlLine: 4,
  outageCollapseWeeks: 6, collapseMrrShare: 0.5, collapseIkBelow: 20,
  gpuWeeklySelfHost: 1200, randomEventChance: 0.22, heldRollsMax: 2, deskStageWaitWeeks: 4,
  standupDailyOutput: -0.03, standupDailyMeaning: 0.3, standupIkBonus: 0.1, meetingTableKnowledge: 0.3,
  // Emoji reactions by a post's weight: routine chatter and replies rarely get any (one or two when they do),
  // and a trivial post now and then gets a pile of one emoji as a joke. Big posts use reactionMax.
  reactions: { routineChance: 0.3, routineSecond: 0.25, replyChance: 0.12, pileOnChance: 0.012, pileOnMin: 6, pileOnMax: 10 },
  // Advisors (#808): runway tiers in weeks, debt tiers, the share of team knowledge one person holds, weeks
  // before an unused policy is worth a word (and for how long), how long a new era is, and how rarely an urgent line is pushed unprompted.
  advisorsEnabled: true,
  advisor: {
    runwayWeeks: [12, 8, 4], burnoutShareUrgent: 1 / 3, debt: [30, 50, 70], busFactorMinHolders: 3, busFactorShare: [0.4, 0.55],
    unusedPolicyWeeks: 26, unusedPolicyWindowWeeks: 26, eraWeeks: 8, oneProductPct: 75, migrationWarnWeeks: 8, unmentoredJuniors: 2,
    cooldownWeeks: 26, pushGapWeeks: 12,
  },
  launchbotVersionStep: 5,
  // Apprenticeship Program: skill added to each junior candidate; Blameless Postmortems: knowledge each engineer gains when an outage clears.
  apprenticeSkillBonus: 10, blamelessKnowledge: 5,
  // A GPU shortage multiplies automation's weekly cost while it lasts.
  gpuShortageMult: 1.5,
  // Once the Incentives Program's ladder is climbed, music night comes back every this many awards.
  incentiveMusicEvery: 3,
  // desk_squeeze: weeks to add a promised desk, and the poster's meaning lost when it never comes.
  deskPromiseWeeks: 4, deskPromiseBroken: 3,
  chatLogSize: 80, eventGraceWeeks: 10, decisionGapWeeks: 3, reactionMax: 6, chatMemory: 24,
  readMinimumSeconds: 2.5, readSecondsPerWord: 0.25, readFadeSeconds: 0.4,
  // readSeconds in src/pacing.js: a line's hold at 1x, its cap, the reading-speed floor, and the shortening at 2x and 4x.
  readBaseSeconds: 1.8, readSecondsPerChar: 0.06, readMaxSeconds: 7,
  readFloorSeconds: 1, readCharsPerSecond: 15,
  readSpeedFactor2x: 0.75, readSpeedFactor4x: 0.6,
  standupSpeechGap: 0.6, standupSilenceSeconds: 1.3, standupConversationMemory: 12, standupConversationChance: 0.4, standupConversationCast: 3, standupMaxLines: 5, standupMaxTotalLines: 7,
  bubbleMaxOnScreen: 3, bubbleGapSeconds: 6, bubblePersonGapSeconds: 20,
  bubbleStaffPerExtra: 8, // one more ordinary speech bubble at once for each this many staff, up to bubbleMaxOnScreen
  yakMinGapSeconds: 6, yakReadingGapSeconds: 2, yakMaxWaitSeconds: 30, yakPendingLimit: 40, yakMemorySeconds: 120,
  yakMaxWaitGameSeconds: 30, // Queue age at 1x; reading gaps still use active real seconds.
  yakImportantMaxWaitGameSeconds: 60, // Important Yak posts other than incidents expire after this much game time.
  saySituationChance: 0.8, sayExchangeChance: 0.22, saySoloChance: 0.45, asyncStandupPostChance: 0.35, standupMemory: 80, helloMemory: 8, standupPersonMemory: 16, ongoingSituationChance: 0.2, chatSituationChance: 0.7, threadChance: 0.15, chatSoloChance: 0.3,
  rareExchangeShare: 0.34, atChannelChance: 0.03, atChannelWarrantedChance: 0.3, atChannelSighChance: 0.4, atChannelGapWeeks: 40, runningJokesPerRun: 3, jokeGapWeeks: [8, 20], talkMemory: 60, exchangeCooldownWeeks: 52, neighbourTiles: 3,
  funding: {
    bootstrapped: { cash: 110000, scoreMult: 1, brand: 0, seniorCandidates: 0 },
    family: { cash: 150000, scoreMult: 0.97, brand: 0, seniorCandidates: 0 },
    preseed: { cash: 300000, scoreMult: 0.96, brand: 8, seniorCandidates: 2 },
  },
  dilutionScoreMult: 0.8,
  // scoreShare expresses expected final score relative to Classic for the founding screen.
  eraStarts: {
    web2: { cash: 90000, officeStage: 0, desks: 3, scoreMult: 0.56, scoreShare: 0.75, exitMrrMult: 1.2 },
    dotcom: { cash: 140000, officeStage: 0, desks: 4, scoreMult: 0.61, scoreShare: 0.9, exitMrrMult: 1.35 },
    classic: { cash: 0, officeStage: 0, desks: 2, scoreMult: 1, scoreShare: 1, exitMrrMult: 1 },
    chatgbt: { cash: 90000, officeStage: 0, desks: 3, scoreMult: 1, scoreShare: 0.67, exitMrrMult: 0.8 },
    agents: { cash: 240000, officeStage: 0, desks: 4, scoreMult: 0.81, scoreShare: 0.4, exitMrrMult: 0.7, incidentGraceWeeks: 260, incidentSeverityCap: 2 },
  },
  takeover: { bot: 'sensible', scoreMult: { chatgbt: 0.3, agents: 0.14 }, scoreShare: { chatgbt: 0.33, agents: 0.16 } },
  founderStrengthBonus: 3, founderIkWeight: 0.4, founderGeneralistWeights: { features: 0.3, polish: 0.15, reliability: 0.2, novelty: 0.1 },
  botBuildersPerProject: 6, botTimeOffStrain: 70, botCancelUnstaffedWeeks: 2, botExpandCushion: 2, botDialCash: 3000000, botAcquireCushion: 4, botAcquireDesks: 3, botMoonshotCushion: 3, botFameBelow: 30, botFameCushion: 6,
  eraAutoEngMult: { classic: 1, chatgbt: 1, agents: 3, consolidation: 3, plateau: 2 },
  unlockGapWeeks: 6,
  lockdownWeek: 62, lockdownWeeks: 10, hybridRemoteShare: 0.4, remoteFirstShare: 0.65, remoteLearningMult: 0.6,
  remoteRentMult: 0.75, remoteExtraCandidates: 1, remoteMeaningGrind: 0.12, remotePatternWeeks: [8, 13],
  callWeekChance: 0.2, callMutedChance: 0.25, callFrozenChance: 0.1, callBadCameraChance: 0.12, callMomentChance: 0.6,
  remoteKnowledgeMult: 0.8, remoteNoveltyMult: 0.7, remoteFixPenalty: 0.3,
  rivalFromWeek: 104, rivalStartStrength: 20, rivalGrowth: 0.3, rivalStallChance: 0.004, rivalFateAfterWeeks: 30,
  rivalStrengthScale: 3, rivalMergeCustomers: 0.25, petMeaningRecovery: 0.04, petMaxCount: 2,
  strainTiredBelow: 35, strainFromTired: 3, strainUnderstaffed: 2, strainPerCrunch: 25, strainOnCall: 3, strainOnCallWeeks: 8, strainSlack: 1, strainSlackMax: 3,
  strainRecoverWorking: 1.5, strainRestedAbove: 60, strainRecoverRest: 5, strainRecoverAway: 20, noCrunchStrainMult: 0.5, noCrunchOutput: -0.03,
  crunchOutput: 0.15, crunchStrain: 1.5, crunchMeaningDrain: 0.3,
  strainWarn: 60, strainBurnout: 85, strainRecoveredBelow: 55, strainOutputPenalty: 0.3, timeOffWeeks: 2,
  vacationWeeks: 2, vacationFirstAfter: 20, vacationMaxShare: 0.15, vacationPostponeWeeks: 4, vacationMaxPostpones: 2,
  vacationPostponeStrain: 6, vacationStamina: 60,
  incentiveEveryWeeks: 8, musicNightDancers: [3, 5], waffleLaunches: 20, waffleLevel: 20, waffleCooldownWeeks: 156, incentiveWinnerMeaning: 6, incentiveEnvy: 1, incentiveOutput: 0.06, incentiveFatigue: 0.01,
  awardAiScore: 8.5, awardWorkplaceStaff: 10, awardWorkplaceMeaning: 78, awardWorkplaceStreak: 2, awardTrustedIncidents: 0, awardAiHype: 15, awardWorkplacePride: 1, awardTrustedBrand: 2,
  recordEngPointsPerFeature: 8, recordDesignPointsPerFeature: 120, recordPointsPerPr: 30, recordTicketHours: 2, recordCustomersPerDeal: 25,
  // Squads: how many, how big, and the headcount that unlocks them without the Office Floor.
  squadMax: 6, squadMaxMembers: 8, squadUnlockStaff: 8,
  // After a launch the benched part of a squad waits this long for a new posting; cohesion fills over
  // squadCohesionWeeks of working together and is worth up to squadCohesionOutput extra output.
  squadBenchWeeks: 2, squadCohesionWeeks: 12, squadCohesionOutput: 0.1, squadIdleWeeks: 2,
  // Office items: the most all items together move one effect, and what a second copy's level effect counts for.
  itemBonusCap: 0.5, itemSecondCopy: 0.5,
  hqDeskCap: 30, expansionDeskStep: 5, topPayAttrition: 0.6, upkeepAttrition: 0.85, upkeepMeaningRecovery: 0.15,
  agentSpendFloor: 3000, agentAuditWeeks: 8, agentInvoiceWeeks: 20, agentAuditRogueRelief: 0.3, agentCapLevel: 0.5,
  rivalMergeBase: 150000, rivalMergePerStrength: 60000,
  beatAgentBillAfter: 45, beatMegaroundAfter: 95, beatFloorNextDoorAfter: 130, megaroundWeeks: 26,
  productNameMax: 20,
  // Yak reply prompts: at most chatPromptsOpen open, a new one at least chatPromptGapWeeks after the last,
  // each open for chatPromptExpiryWeeks, and answered ones kept chatPromptsKept weeks for the thread view.
  // The founders' quick posts in Yak: a shared cooldown, a repeat window that makes the same post fall flat,
  // and the small effects of each post when it lands or backfires.
  postsEnabled: true,
  posts: {
    cooldownWeeks: 2, repeatWeeks: 8, newsWeeks: 2, replyWeeks: 2, lowMorale: 30, pizzaPerHead: 25,
    pepTalk: 2, meme: 2, pizza: 3, pizzaStamina: 10, news: 3, backfire: 1, scare: 2, memeBackfire: 3, blame: 1, fixHealth: 3,
  },
  chatPromptsEnabled: true, chatPromptsOpen: 1, chatPromptGapWeeks: 1, chatPromptExpiryWeeks: 3, chatPromptsKept: 4, chatPromptChance: 0.6, chatPromptFromWeek: 6,
  prompts: {
    strainAt: 40, lateWeeks: 12, newHireWeeks: 3, supportShortfall: 0.2, lateProgress: 0.6, agentLevel: 0.3,
    restStrain: 20, pushStrain: 3, pushOutput: 0.02, launchHype: 4, cakeCost: 300, subtweetBackfire: 0.25,
    crunchOutput: 0.04, reviewDebt: 3, mergeDebt: 4, lunchCost: 40, teamLunchCost: 400,
  },
  // Nods to the valley: the incubator house, The Box, oat milk, the kielbasa app, tabs or spaces, the Squish Score.
  svNods: {
    incubatorFrom: 8, incubatorUntil: 60, incubatorCash: 12000, incubatorCut: 0.1, incubatorCounterCut: 0.05, incubatorCounterChance: 0.5,
    incubatorPodcastWeeks: 52, incubatorSignWeeks: 52,
    boxCost: 40000, boxHype: 12, boxDebt: 4, boxCubeWeeks: 26, boxRecallWeeks: 30, boxMockChance: 0.55,
    oatOpsLevel: 0.25, oatStaff: 8, oatWindowWeeks: 26, oatFee: 3000, oatStamina: 0.1, oatWeeks: 26,
    kielbasaStaff: 5, kielbasaHype: 15, kielbasaFadeWeeks: 6, kielbasaSale: 25000,
  },
  // The office classics: banner, cover sheets, stapler, consultants, printer and the Saturday ask.
  nods: {
    bannerStaff: 12, bannerOutput: 0.02, bannerDrain: 0.05, bannerWeeks: 26, bannerStays: 104, bannerIronyMiss: 0.2, bannerReturnFee: 300,
    coverStaff: 8, coverOutput: -0.02, coverWeeks: 26, coverIk: 3,
    staplerTenureWeeks: 104, staplerLoss: 25, staplerBack: 10, staplerBackWeeks: 13, staplerKeep: 5, staplerSaving: 200,
    consultantStaff: 15, consultantFee: 60000, consultantCuts: 2, consultantNewHireWeeks: 13, consultantMinEligible: 3,
    consultantOutput: 0.05, consultantWeeks: 26, consultantMeaning: -4, layoffGapWeeks: 52,
    printerCost: 2500, printerMeaning: 6, printerWreckWeeks: 4, printerRepair: 300, printLessOutput: -0.01, printLessWeeks: 13,
    // The printer jams once, on a week this many weeks after the company first reaches the Office Floor.
    printerFromWeeks: 8, printerToWeeks: 48,
    saturdayStaff: 10, saturdayOutput: 0.08, saturdayWeeks: 2, saturdayStrain: 10, saturdayMeaning: -3, saturdayNoTeam: 2, saturdayNoSubject: -3,
  },
  // Staff names: the share of draws from the international tier, the share of the US mix that is South
  // Asian, and how often a last name comes from the same tier as the first name.
  intlNameShare: 0.28, southAsianNameShare: 0.18, nameTierMatch: 0.7,
  fameDecay: 0.3, fameChurnRelief: 0.25, fameHireRelief: 0.4,
  moonshotAfterConsolidation: 100, moonshotRevenueShare: 0.25, moonshotMinWeekly: 50000, moonshotCheckinWeeks: 26, moonshotCheckins: 4,
  moonshotProduct: { stats: { features: 200, polish: 180, reliability: 160, novelty: 120 }, score: 8.6, hype: 60, novelty: 10, health: 90 },
  moonshotMinMrr: 20000, foundationPurpose: { people: 8, trust: 5 },
  moonshotSuccess: 0.5, moonshotCustomers: 0.15, moonshotStopFame: 3, moonshotFailFame: 8, moonshotFailBrand: 2, moonshotWinFame: 20, moonshotWinBrand: 8,
  lastBetWeek: 900, lastBetCashShare: 0.3, lastBetSuccess: 0.45, lastBetWinFame: 30, lastBetLoseFame: 10, lastBetWinBrand: 10, lastBetLoseBrand: 5,
  foundationCashShare: 0.25, foundationFame: 15, foundationMeaning: 5, keysSeniorMeaning: 8,
  officePropsMax: 6,
  forSaleWeek: 30, forSaleWeeks: 13, forSalePerRound: 3, forSaleMinArr: 600000, forSaleArrShare: [0.03, 0.12],
  forSalePriceMult: [6, 10], forSaleConsolidationDiscount: 0.8, acquiredScore: [6, 7.8], acquiredBrand: 1,
  epilogueOutcomeLines: 2, epilogueLines: 7,
  alumniKept: 40, aiSummitWeek: 20, summitCost: { small: 20000, big: 80000 }, summitEraMult: [1, 1, 1.5, 2, 2.5], summitPauseAfter: 2,
  moveOnPerYear: 0.025, moveOnTenureWeeks: 156, moveOnMinStaff: 5,
  attritionPerYear: 0.025, attritionAfterWeeks: 26, attritionMinStaff: 5, attritionMeaningBelow: 60, attritionMeaningSpan: 20,
  attritionUnhappy: 2, attritionUnderpaidBelow: 0.95, attritionUnderpaid: 1.8, attritionRival: 1.4, attritionPerkRelief: 1.5,
  attritionPerkFloor: 0.35, attritionGoodPolicy: 0.8, referralMeaning: 70, candidateListMax: 8, hearingFromWeek: 416,
  purposeStart: { craft: 55, people: 55, trust: 55, growth: 40 }, missionAfterWeeks: 8, purposeTestsKept: 12,
  purposeMeaning: 0.3, purposeRetention: 0.4, purposeAppeal: 0.3, purposeHiring: 6,
  plateauPolishAppeal: 1.5, plateauBrandAppeal: 0.5,
  eraJitterWeeks: 13, chatgbtAutomationCap: 0.5, chatgbtAutomationFns: ['support', 'marketing'], noModelTrust: 0.85,
  eraCompetition: { classic: 1, chatgbt: 1.12, agents: 1.25, consolidation: 1.4, plateau: 1.45 }, consolidationVendorEveryWeeks: 13, consolidationDeprecateChance: 0.8,
  // How often an acquisition offer comes up among random events: the main dial for how often good play exits.
  acquisitionOfferWeight: 4.5, acquisitionOfferOpenWeeks: 26, consolidationOfferMult: 0.95,
  ipoMrr: 2850000, ipoBrand: 60, acquisitionOfferMrr: 2550000, acquisitionOfferBrand: 50, leaderCategoriesToWin: 3,
};
