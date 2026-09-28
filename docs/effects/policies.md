<!-- Generated from src/data and src/sim/balance.js by `npm run effects`. Do not edit by hand. -->

# Policies

Switch in the Policies menu. Costs are per game week.

| Policy | Unlocks | Cost | Effects |
|---|---|---|---|
| Daily Standups | at 5 people · replaces Async Standups | free | output -3% · know-how +10% · meaning per speaker per standup +0.3 |
| Async Standups | at 5 people · replaces Daily Standups | free | know-how +5% · share of speakers who post 35% |
| AI as Pair, Not Replacement | arrives with the ChatGBT moment | free | automation meaning drain ×0.3 · automation output ×0.6 |
| Craft Fridays | at 4 people | free | output -10% · meaning recovery a week +0.5 |
| Blameless Postmortems | after your first incident | $200 | knowledge per engineer when an outage clears +5 |
| Code Comprehension Reviews | at 20 tech debt or on the Office Floor | free | project speed -15% · share of tech debt paid down a week 3% |
| Apprenticeship Program | needs the Office Floor | $1,500 | skill added to each junior candidate +10 |
| Sabbatical Program | needs the Office Floor | $500 | weeks away 4 · meaning recovery a week while away +4 |
| No Crunch | when someone is running on empty · replaces Crunch Mode | free | strain build-up ×0.5 · output -3% |
| Crunch Mode | after your first launch · replaces No Crunch | free | output +15% · strain a week on project or maintenance work +1.5 · meaning drain +0.3 |
| Top-of-Market Pay | needs the HQ Building | 15% of payroll | chance an outside offer is taken ×0.6 |
| Office Upkeep | needs the HQ Building | $150 per person | chance an outside offer is taken ×0.85 · meaning recovery a week +0.15 |
| Incentives Program | with a team of 8 and three launches | $300 | weeks between rewards 8 · output while a reward lasts +6% · winner's meaning +6 · envy for everyone else +1 · awards between music nights once the ladder is climbed 3 |

<sub>Values from balance.js: standupDailyOutput, standupIkBonus, standupDailyMeaning, asyncStandupPostChance, pairMeaningDrainMult, pairAutoMult, craftFridaysOutput, meaningRecovery.craftFridays, blamelessKnowledge, comprehensionReviewSpeed, debtPaydownReviews, apprenticeSkillBonus, sabbaticalWeeks, meaningRecovery.sabbatical, noCrunchStrainMult, noCrunchOutput, crunchOutput, crunchStrain, crunchMeaningDrain, topPayAttrition, upkeepAttrition, upkeepMeaningRecovery, incentiveEveryWeeks, incentiveOutput, incentiveWinnerMeaning, incentiveEnvy, incentiveMusicEvery.</sub>
