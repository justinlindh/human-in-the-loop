# Era modes

Proposal for [#5](https://github.com/justinlindh/human-in-the-loop/issues/5), including [cubicles, #179](https://github.com/justinlindh/human-in-the-loop/issues/179), [period chat, #182](https://github.com/justinlindh/human-in-the-loop/issues/182), [industry nods, #338](https://github.com/justinlindh/human-in-the-loop/issues/338), and [permanent unlocks, #547](https://github.com/justinlindh/human-in-the-loop/issues/547). This is a delivery specification, not a claim that its content is in the game. Proposed values need the paired runs and the owner's playtest below.

The player should recognize an era through the work they manage: shipping a box, keeping a company alive after the IPO party, supporting the browser nobody may upgrade, then deciding what to automate. The people remain the point. Satire targets industry incentives and the speaker's own habits, never people hurt by a bust.

## Modes and starting kits

Keep Classic as the default. A start is a newly founded company in an older world, not a simulated company with an invented history. Two chosen founders, their ordinary salaries and skills, zero launches, zero customers, and zero incidents remain true. Funding and founder selection still work. All kit cash is added to the selected funding's cash, never multiplied by it.

| Start id | Calendar opening | Extra cash | Office / desks | Era score factor | Systems open immediately | Goals skipped without rewards |
| --- | --- | ---: | --- | ---: | --- | --- |
| `preinternet` | 1990 | $40,000 | Garage / 3 | 1.20 | retail distribution, Ops | none |
| `dotcom` | 1997 | $140,000 | Garage / 4 | 0.90 | Marketing, Ops, Research, squads | `place_desks` |
| `web2` | 2003 | $90,000 | Garage / 3 | 0.75 | Marketing, Ops, Research, compatibility | `place_desks` |
| `classic` | 2019 | $0 | Garage / 2 | 1.00 | ordinary progression | none |
| `chatgbt` | selected era's seeded arrival | $90,000 | Garage / 3 | 0.75 | Marketing, Ops, Research, Models, Automation, Meaning, AI as Pair | `place_desks`, `start_product`, `first_launch` |
| `agents` | selected era's seeded arrival | $240,000 | Garage / 4 | 0.40 | ChatGBT kit plus squads; full automation permissions | ChatGBT skips |
| `consolidation` | selected era's seeded arrival | $390,000 | Garage / 4 | 0.45 | Agents kit and the era's normal angles/models | Agents skips |
| `plateau` | selected era's seeded arrival | $540,000 | Garage / 4 | 0.30 | Consolidation kit | Agents skips |

The extra desks are unoccupied. No items, research completions, products, staff tenure, policies enabled, or trophies are invented. A skipped goal stays `done: false`, has `week: null` and `skipped: true`; it cannot award cash or brand later, and the UI counts only eligible goals. The Goals list labels it "Skipped by starting era" rather than pretending it was earned. The player's first actual hire, incident, thousand customers and awards still count.

An Agents founding caps incident severity at 2 for the first 260 company weeks. Cash and brand damage, incident records and score penalties still apply; product outages cannot start during this grace. Full severity returns at the fifth company anniversary. The cap follows the founding choice, not the current era, so Classic and ChatGBT companies do not gain it when Agents arrives.

The founding screen shows era, starting cash after funding, office, unlocked systems, skipped goals and the combined funding/era score factor. Buttons work by tap and keyboard; essential information is visible without hovering. The ending and Reports retain the chosen start and score factor. Total score is the existing nonnegative score calculation multiplied by the era factor, with one final rounding. Funding, dilution and the incubator cut still multiply independently. There is no score for skipped history.

Era selection is a preview, off by default. The UI reads the `eras` URL parameter at startup: `?eras` or `?eras=1` reveals the choices. Ordinary founding remains Classic with no era controls or score-factor rows. Non-Classic saves still load and play without the parameter. Sim callers and balance runs use the start option directly. Public release requires the owner's playtest approval.

The preview exposes available starts without profile locks. Adding locks to these choices later must not take them away from existing profiles. Earlier chapters and the two late starts arrive through the delivery phases below.

### Optional company takeover

From ChatGBT onward, an available era also offers `startMode: 'takeover'`; omitted mode or `garage` keeps the ordinary founding. The predecessor uses the existing `sensible` bot from Classic, with the selected seed, founders and funding, until the first completed tick in the requested era. There is no stored company template, seed retry, cash repair or era kit. A failed predecessor is refused before play, with a reason and the option to change its founding choices.

The takeover retains the predecessor's entire state, including company age, earned goals, pending decisions and history. It keeps the original twentieth-anniversary checkpoint. Additive founding metadata records `startMode`, `takeoverEra`, `takeoverWeek`, `takeoverBot` and `eraScoreMult`; `startEra` remains absent because the company was founded in Classic. This avoids giving inherited companies a garage kit's skipped goals, shifted calendar or incident grace. Save loading never rebuilds the company. These additive API and metadata fields are proposed for team-lead's contract adoption; the contract file remains lead-owned.

Before play, a phone-width summary shows people, live products, cash, weekly burn, office and entering era. Tap-open team and product lists reveal the inherited company. Original funding choices apply to the predecessor's founding, not a fresh deposit. Funding, earned dilution and the takeover score factor multiply independently. `B.takeover.scoreMult` holds the per-era discount, calibrated with paired bot runs. The founding and review screens use `B.takeover.scoreShare` to express expected score relative to Classic, with funding and earned cuts shown separately. IPO and acquisition bars read `B.eraStarts.classic.exitMrrMult` through the shared founding-start helper; the calendar era never selects a takeover's bars.

### Career length and clocks

`state.week` remains elapsed company time, starting at zero for every garage founding. Tenure, cooldowns, salaries, project work, five/ten-year goals and the twentieth anniversary use elapsed time. A modern garage run lasts the ordinary 1,040 playable weeks unless the player retires or loses, and can keep playing after the anniversary. Later garage starts meet more mature competitors sooner and take the score discount; they do not begin with five years of service. A takeover inherits elapsed company time and plays the remaining weeks to that same checkpoint.

Modern calendar date is elapsed week plus a saved calendar offset. For garage founding, the chosen start's offset is its seeded arrival on the ordinary schedule; subtract it from future era arrivals and clamp skipped arrivals to zero. Preserve the era-jitter side stream and the main RNG sequence for Classic. Initialize available categories, approaches and model releases from the starting calendar and era without emitting a backlog of arrival cards. Era-relative beats start from the selected era's week zero. Past one-off world events, including lockdown, do not replay for later garage starts. Company-relative events retain their normal elapsed-time conditions. A takeover retains the predecessor's calendar and event state.

Keep difficulty growth based on elapsed company time where it is already an age-based economic rule (project points, candidate skill, incident cost and market adoption); do not accidentally substitute historical years into those formulas. Era competition still supplies world pressure. Calendar-sensitive data availability and actual date labels use a dedicated pure `calendarDate(state, week = state.week)` helper. The existing `dateOf(week)` API remains valid for Classic and for elapsed-age arithmetic.

Later-start companies receive conference and AI Summit invitations only after a first launch. Starting permissions do not mean there is a product to demonstrate. Classic retains its ordinary invitation rules.

Earlier eras are chapters, not decades of repetitive simulation. Proposed playable lengths in `B.eraChapters`: pre-internet 156 weeks, dot-com 208 weeks, Web 2.0 208 weeks, followed by the existing modern timeline. Their calendar spans are 1990 to 1997, 1997 to 2003, and 2003 to 2019. A chapter's calendar maps its elapsed fraction monotonically into its historical span. This abstraction is stated on the mode card: "A career in chapters. Earlier years pass faster." Tenure and cooldowns count playable weeks, not the compressed calendar.

Phase 3 deliberately bridges dot-com directly to Classic with an explicit transition card: "The company kept going. The web got flatter. The invoices did not." The bridge says that the intervening years are skipped. It preserves every person, placement, product and cash balance; it does not run invisible ticks or invent profits. Adding Web 2.0 inserts its chapter for newly founded careers only. Persist a timeline version with early-era saves so an existing bridge run does not gain an extra era on reload.

The complete `long_career` mode starts in pre-internet and plays all three chapters plus the full modern run: 1,612 playable weeks, era factor 1.20. A chapter start's anniversary/end extends by its remaining early chapters so it can reach the modern end. Intermediate anniversary celebrations are non-terminal. Era-start mode uses the same timeline from its chosen point. A separate `classic_career` label keeps the familiar full modern route obvious. Prestige means a clearly named longer route and its factor, not a promise that every longer run will outscore every shorter run.

## Earlier chapters: work, technology, content

All numeric effects, prices, durations, thresholds, caps and randomness below belong in `src/sim/balance.js`. Data imports those constants. Existing shared systems remain available where their technology fits. New events are idempotent across save/reload and use existing decisions, modifiers and chat events. Randomness uses `src/sim/rng.js`; cosmetic chatter may use its own seeded stream.

### Pre-internet: the box is part of the product

The team builds desktop and on-prem software, writes manuals, duplicates floppies, graduates to CDs and negotiates shelf space. LAN messaging, beige machines, cubicles and boxes replace the modern office cues. Release quality matters because patching a shipped box costs money.

| Content id | Words / behavior | Values and home | Owner |
| --- | --- | --- | --- |
| `desknet` | DeskNet, a LAN bulletin board styled as a plain IRC-like log; `/me` actions, no internet dependency | display metadata in `src/data/era-modes.js`; UI skin | Codex data, ui |
| `boxed` | Boxed Software approach, usable only before Classic; no model | data angles; sim distribution | sim |
| `disk_duplicator` | Disk Duplicator, "The progress bar has a motor." | costs $3k/$6k/$12k; batch cost relief 10/20/30%, capped by ordinary item stacking | sim data; art model |
| `retail_shelf` | Retail Display, "The box has more features than the back of the box can explain." | costs $2k/$4k/$8k; retail demand +10/15/20% | sim data; art model |
| `pre_master_disk` | Gold master decision: pay for verification or ship | verification $2k, reliability +5; rush debt +3, launch cash +$3k | sim events |
| `pre_retail_returns` | Retailer sends the unsold boxes back | once after first batch; buyback 20% of unsold stock's cost, maximum $8k | sim events |
| `pre_cd_rom` | CD release decision: more room, same deadline | unlock at chapter week 78; mastering cost $4k; next batch capacity +25% | sim events |
| `pre_first_batch` | Goal: ship a physical release | reward $5k, brand +2 | sim goals |
| `pre_patch_by_post` | "The patch is in the post. The bug arrived by courier." | one original period chat line, no effect | sim data |

Distribution is an explicit small inventory loop, not renamed MRR: choose a 100/500/1,000-unit batch, pay $8 per unit, sell at $30, retailer takes 30%; weekly demand consumes available stock. Restock lead time is 2 playable weeks; quality below 6 creates 5% returns on sales. A patch costs $2 per installed customer capped at $10k. Reports show units, returns and cash from sales; recurring service revenue remains separate. Existing product-health/quality code drives demand, not a second quality score. On transition, installed customers remain installed customers; service contracts are opt-in, never a free conversion to subscribers. These mechanics require their own phase and balance evidence.

### Dot-com: the graph only goes up, until it does not

The chapter starts with a cubicle farm, CRTs, a hosted web product or on-prem software, banner ads and an investor who measures eyeballs. The IPO frenzy is a financing choice with consequences, not the modern retirement button.

| Content id | Words / behavior | Values and home | Owner |
| --- | --- | --- | --- |
| `awayim` | AwayIM, buddy status and away-message chrome; the same accessible message/reply controls as Yak | era metadata and UI skin | Codex data, ui |
| `dotcom` | Dot-com era; growth, frenzy, warning, bust, recovery | chapter 208 weeks; milestones 26, 78, 104, 156, 208 | sim |
| `dotcom_banner` | Banner Rotation Server, "The ad has loaded. The page is considering it." | existing `server_rack` stand-in; new item costs $3k/$6k/$12k, acquisition +5/10/15% | sim data; art later |
| `dotcom_eyeballs` | A pitch about registered eyeballs. "We have counted both eyes. Finance asked us to." | week 26; boom acquisition x1.25 until bust; no permanent score bonus | sim |
| `dotcom_ipo_frenzy` | "The roadshow has a roadshow." Choose a small public float or stay private | week 78; float cash +$180k, score dilution x0.8 through existing diluted flag; private brand +2 | sim |
| `dotcom_warning` | "The analyst has replaced 'inevitable' with 'interesting'." | week 104; explicit warning of falling demand, no cash damage | sim |
| `dotcom_bust` | "The market has discovered a second direction." Preserve cash or pay to retain customers | week 156; demand x0.65 for 52 weeks; retain costs min($20k, 10% of nonnegative cash) and loses 10% customers; preserve loses 25%; float companies also pay min($50k, 20% of nonnegative cash) | sim |
| `dotcom_recovery` | "We have a business model now. It is invoices." | chapter exit; remove temporary boom/bust modifiers; preserve company state | sim |
| `dotcom_first_web` | Goal: launch a web product in dot-com | cash +$5k, brand +1 | sim goals |
| `dotcom_survivor` | Goal: reach recovery without insolvency | cash +$10k, brand +2; no reward for starting later | sim goals |
| `dotcom_sock_pivot` | PetParcel sells pet supplies and a very confident sock; a parody with an original mascot | random event; choice spends $3k for hype +5 or declines without cost; no real logos | sim data; art optional |
| `dotcom_away` | "Away message: building the future. Back after lunch." | periodic period chatter, no effect | sim data |

The boom multiplies acquisition, not cash, so a company must ship to benefit. The bust is visible, bounded and survivable through runway, maintenance and customer retention. It cannot delete every customer or charge money the company does not have. The market phase advances even if its decision waits in the ordinary queue; settlement consequences apply once when resolved, and the UI never offers a stale boom after recovery. No forced layoffs. Modern AI angles, mobile-first, product-hunt launches, remote video-call culture, vendor bots and AI jokes stay gated out. Period channels replace inappropriate channel names/copy while using the same campaign mechanics. Generic original human office jokes remain.

Phase 3 is a playable sim vertical slice with explicit stand-ins, not completed art or historical localization. Minimum stand-ins: `desk` for a CRT cubicle workstation; `partition` if present for cubicle walls, otherwise ordinary desk spacing; `server_rack` for banner hosting; existing launch celebration for flotation; text decision for the market board; the Classic room shell, carpet, skyline and clothing. Each actual stand-in must be listed in its PR. No new unknown model id may crash rendering. Every early-era content pool needs a nonempty period-safe fallback.

### Post-crash and Web 2.0: Internet Exploder 6

Web 2.0 begins with post-crash recovery, fewer slides and paying customers. Then the browser turns into a platform, except the client's browser is still the old one. The enterprise restriction is an organizational problem, not a joke about the people who must use it.

| Content id | Words / behavior | Values and home | Owner |
| --- | --- | --- | --- |
| `hipcheck` | HipCheck, team rooms, status messages and a restrained notification dot | era metadata and UI | Codex data, ui |
| `web2_recovery` | "The revenue slide now contains revenue." | arrival decision: fund QA $8k for debt -5 or keep cash | sim |
| `legacy_compat` | Old Browser Compatibility, for new web projects | points needed x1.20, legacy whisperer reduces extra work to x1.08; lock values at project creation | sim work |
| `legacy_whisperer` | Senior engineer trait: quietly knows every browser quirk | earned after 3 compatible web launches; reduces extra QA work, not all project work | sim traits |
| `web2_activex` | Active-ish control wants administrator access | sandbox costs $5k, debt -2; exception saves cash, debt +5; decline no effect | sim event |
| `web2_grey_png` | "Transparency works. You can see all the grey." | decision: patch $1k, polish +3 on subject product, or leave it | sim event |
| `web2_box_model` | "The box is wider inside the client demo." | one original chat exchange; shim, conditional comment and clearfix variants | sim data |
| `web2_best_viewed` | Best viewed in whichever browser finance approved | period prop/badge; cosmetic only | art, ui |
| `web2_compatible_launch` | Goal: ship a compatible web product | cash +$5k, brand +2 | sim goals |
| `web2_browser_retired` | An old HipCheck thread resurfaces in Yak: "We can delete the workaround." / "Which one?" | once on entering Classic from Web 2.0; no reward or tax in Classic | sim data |

No recurring arbitrary client-escalation roll is needed in the first version: the visible QA work is enough. An exception choice can create debt through the existing systems. Existing live products retain their saved compatibility facts; new Classic projects do not pay the old-browser tax.

The compatibility estimate uses a present senior Legacy Whisperer's company knowledge when a new web project starts; they need not remain assigned to it. Actual positive engineering contributions accumulate unique staff ids on the saved project. On launch each contributor still employed gains one compatible-launch record. The normal three-trait limit applies, and a mid-level contributor can qualify after promotion. No hire rolls the earned trait. New work in Classic and updates remain untaxed; unfinished taxed projects retain their saved estimates.

Web 2.0 tuning in `B.web2`: chapter 208 weeks, calendar 2003 to 2019, compatibility multipliers 1.20/1.08, three launches to qualify, QA $8,000/debt -5, sandbox $5,000/debt -2, exception debt +5, PNG $1,000/polish +3, event weight 2/cooldown 52 weeks, chatter every 13 weeks, and the $5,000/brand +2 goal. HipCheck uses the existing chat layout, icon and audio. `web2_best_viewed` is a visible project-card text badge; its physical prop belongs to the art delivery.

## Permanent unlocks and existing content

Use #547's profile layer outside run saves, not era completion flags inside one company. Proposed profile ids: `era.preinternet`, `era.dotcom`, `era.web2`, `era.classic`, `era.chatgbt`, `era.agents`, `era.consolidation`, `era.plateau`, `mode.long_career`. Reaching an era records it even in a run that later loses. A union merge of profile achievements handles imports; deleting a company does not delete profile progress. Missing/corrupt profile data must not make an existing save unloadable.

All era starts remain available in a sandbox/custom section; optional career locks provide discovery, never block a returning player's purchased or existing content. Classic is always unlocked. Reaching ChatGBT unlocks its career start, reaching Agents unlocks its start, surviving dot-com unlocks Web 2.0, and finishing any modern career unlocks pre-internet and long career. Existing profiles are grandfathered for all starts exposed before the profile feature. The profile delivery implements these optional locks; phase 2 exposes its preview starts without locks.

Office Space and Silicon Valley content stays core and unlocked, as #547 requires. Do not turn #338's accepted Squish Score, Incubator House, The Box, Tabs or Spaces, Oat Milk and Is it kielbasa? into rewards that must be earned again. Preserve their existing era requirements: Oat Milk's ordering agent and the kielbasa AI app cannot appear in dot-com. Do not add the rejected Better-Place Bingo or Failing Upward concepts.

## Art and audio briefs

These are requests for the owning lanes, not permission for Codex to edit their assets during the sim phases.

Art, in `blender/`, `public/models/` and `src/render/`:

- `era_crt_desk`: rounded beige CRT, tower, keyboard, safe seated sightlines; use the desk's footprint and all seat rotations.
- `era_cubicle`: modular low partitions with readable people, doors and navigation; reuse #179's item when suitable. No hidden placement collisions.
- `era_retail_boxes`, `era_floppy_stack`, `era_cd_spindle`: original retail packaging and media, no brand replicas; one shared small-prop budget.
- `era_dotcom_board`, `era_sock_mascot`: a readable boom/bust board and an original pet-delivery mascot; no price-ticker animation required for the sim slice.
- `era_web2_badge`: Best viewed in Internet Exploder 6; it must still read on a close crop.
- Room dressing: beige/cubicles for pre-internet, bright funded dot-com followed by reused chairs in recovery, practical Web 2.0. Preserve accessibility, Low quality, camera turns and office expansion geometry.
- Every new staged moment gets scene/pose specs, a whole-motion clip and a still. Compare desktop and phone crops, day/night and Low. Remove stand-ins only when this evidence exists.

Audio, in `src/audio/` and `public/audio/`:

- `era_preinternet`, `era_dotcom`, `era_web2`: era arrival stingers, following the existing event timing and pause behavior.
- `desknet_ping`, `awayim_ping`, `hipcheck_ping`: original soft cues, not copied application sounds; the shared notification cooldown still applies.
- `disk_seek`, `cd_tray`, `retail_box`, `dotcom_bell`, `dotcom_bust`: sparse context cues. The bust is subdued, never a joke at a dismissed employee's expense.
- Two optional beds per early era with the existing music bus, ducking and era-card transition. Do not add audio dependencies to the pure sim. The owner hears candidates before assets ship; quiet and muted modes remain complete experiences.

## Proposed contract changes for team-lead

Do not edit `src/contract/contract.md` in these PRs. Team-lead owns adoption of this additive diff; implementation PRs must call out the proposal they implement.

```diff
- createGame({ seed, companyName, logoColor, tagline, founders, funding })
+ createGame({ seed, companyName, logoColor, tagline, founders, funding, startEra })
+ // startEra defaults to classic; unknown/unavailable ids fall back to classic.
+ calendarDate(state, week = state.week) -> { year, yearIndex, week, quarter }
+ // Calendar labels and date-gated availability only; company age remains state.week.
+ founding.startEra?: string
+ founding.calendarOffset?: number
+ founding.eraScoreMult?: number
+ // Missing metadata means a Classic start; no reset or replay during load.
- goals[goalId]: { done, week }
+ goals[goalId]: { done, week, skipped?: boolean }
+ // Skipped means ineligible for rewards and trophies, excluded from eligible-goal counts.
+ // scoreRun keeps its shape; score includes the saved era factor once.
```

Further additions, adopted per phase rather than speculatively added to saves:

- Earlier `era.id` values `preinternet`, `dotcom`, `web2`; earlier keys in `eraSchedule`; keep Classic's ordinal at zero and earlier eras below zero so numeric AI gates do not accidentally open. Audit every array indexed by era before using this convention.
- `founding.timelineVersion` and `founding.mode` for chapter routing and run length. Old modern saves keep their exact schedule and duration.
- `founding.earlyChapters`: ordered saved records `{ id, weeks, startYear, endYear }`. Calendar mapping and the extra career duration read these records so a bridge save never silently acquires another chapter. `flags.erasVisited` records only eras actually played in a historical career.
- `historical-v2` routes new dot-com companies through saved dot-com and Web 2.0 chapters; new Web 2.0 companies have only that chapter. A saved `dotcom-bridge-v1` keeps its direct Classic arrival and does not gain Web 2.0 goals.
- `project.compatibility?: { id: 'legacy_compat', factor: number, contributors: staffId[] }`, `product.legacyCompatible?: boolean`, and `staff.record.compatibleLaunches?: number` retain project pricing and earned experience without adding fields to modern runs. `flags.web2?: { arrived: boolean, retired: boolean }` gates one-time entry and retirement. Goal metadata `requiredChapter` prevents a new chapter goal from appearing in an older bridge save.
- `flags.dotcom`: current phase, entered week, float choice, settlement-applied flag and recovery flag. All decision, market and goal readers derive from this one saved record. Existing `decision`, `chat`, `era` and `goal` events suffice.
- Dot-com milestone news uses ordinary toasts and important saved chat posts for the boom, warning and recovery. Only the float and bust require a choice. A delayed, unanswered bust settles with the no-retention-spending choice at recovery; an expired float cannot grant cash afterward. Retention spending is calculated after any public-company charge, each capped against remaining nonnegative cash.
- `dotcom_banner` uses the renderer's generic crate fallback until art supplies its rack model. Existing desks/screens and room shell stand in for cubicles and CRTs; AwayIM keeps the Yak icon and layout. Annual SaaS conferences and awards wait until Classic; period trade shows remain available as campaigns. These stand-ins have no new model or audio assets.
- Boxed distribution: saved per-product inventory, installed customer count, batch deliveries and sales/returns totals; `orderBatch` and `mailPatch` actions with explicit refusal reasons. No silent reinterpretation of `customers` or `mrr`.
- Web 2.0: per-project compatibility work captured at creation; per-product compatible-release marker; existing trait and growth events can announce `legacy_whisperer`.
- Profile API in save/UI: `loadProfile`, `recordAchievements`, `availableStarts`; run simulation takes validated options and never reads browser storage. Profile export/import is separate from a company save.
- `scoreRun` may later add explicit factors/raw total for the breakdown, without changing existing `score`, `valuation`, `breakdown` meanings. Era-app name is display data; retain `chatLog`, `chatPrompts` and action keys through every reskin.

## Complete delivery plan

Each row is one reviewable PR unless the row explicitly assigns an asset handoff. Sizes are focused implementation time, not approval time. Check open PRs and issue claims before every phase. Codex owns phases 1 to 4 in this run where time permits; remaining task files go only to the proposed queue. Stacked branches keep prior phases visible and unmerged until their own gates and approvals pass.

| Phase / task | Deliverable and completion evidence | Size | Builder | Depends on |
| --- | --- | --- | --- | --- |
| E1 / phase 1 | This design, proposed contract diff, full task plan; docs-only PR pushed before code | 35 min | Codex | issue threads, repository audit |
| E2 / phase 2 | Classic/ChatGBT/Agents starts, additive kits, score, skipped goals, save round trips, founding picker and feature ids; paired 200-seed tables, unchanged Classic proof, desktop/phone stills | 2 h | Codex across sim/data/ui/save | E1 proposal |
| E3 / phase 3 | Dot-com sim, playable founding start, boom/IPO/bust/recovery, period content subset, bridge to Classic, stand-in inventory; deterministic boundary tests and 200-seed runs | 3 h | Codex or sim with Codex UI | E2 |
| E4 / phase 4 | Web 2.0 post-crash chapter and IE6 QA work, trait, events/goals, start kit and flow to Classic; boundary and save tests, 200 seeds, screenshots | 3 h | Codex or sim with ui | E3 |
| E5 | Pre-internet boxed distribution, inventory/restocking/returns, manual patching, data and Reports controls; arithmetic and save tests, 200 seeds, screenshots | 3 h 30 min | Codex or sim with ui | E4 |
| E6 | Complete all-era picker including Consolidation/Plateau and long career; versioned chapter calendar, run-length/anniversary rules, score labels and recap/chart date audit; full-route replay and mixed save fixtures | 3 h | Codex | E2 to E5 |
| E7 | Complete DeskNet/AwayIM/HipCheck reskins and historical content audit across channels, names, marketing, research, advisors, traits and epilogues; safe fallbacks with zero modern leakage; phone/keyboard capture | 3 h | ui plus sim content, one Codex PR if delegated across both | E3 to E6 |
| E8 | Cubicle/CRT/retail/era props and room dressing replace every documented stand-in; placement, sweep/pose, Low quality and camera-turn evidence | 3 h 30 min initial asset batch; scope to existing geometry | art | E3 to E5, #179 audit |
| E9 | Period audio cues and music routing, owner-approved candidates, silent fallback and bus tests | 3 h initial cue batch | audio with ui | E7/E8; owner listening |
| E10 | #547 shared profile achievements, optional era locks and pack picker, grandfathering and profile import/export; storage failure and old-save tests | 3 h 30 min | Codex or sim/save plus ui | E6, #547 profile design |
| E11 | Final balance and delivery audit: every era/funding pair sampled, all starts 200 seeds, long-career survival and score distributions, historical leakage, interrupted/save-reload replay, feature/media inventory, owner playtest package | 3 h | Codex plus reviewer read-only review | E6 to E10 |

E8 and E9 are bounded initial batches. If their complete asset lists do not fit, their reports must propose numbered asset/cue follow-ups with specific missing ids; E11 cannot call the feature complete while any stand-in or required approved cue is outstanding. The plan includes contract adoption by team-lead alongside each implementation and final integration/media work in E11. No implementation PR closes #5 on the strength of only the later-start slice.

### Verification and release boundaries

- Every commit is gated by `npm run test:fast` exit 0 with `&&`. Sim/data/save PRs also run full `npm test` before opening. No local-CI script is started by hand.
- Capture baseline head and branch head, all bots on seeds 1 to 200, default and each new start. Paste exit %, lost/gained seeds, score, elapsed weeks and incidents. Explicit Classic must match omitted Classic; default branch results must match baseline per seed, including final RNG and state, not merely win rate.
- Extend the existing balance harness only enough to choose a start and save paired results; document every new option in `docs/toolkit/balance.md`. Prefer existing `pair.js` for branch/default parity; a tiny one-task comparison can consume exported rows for starts.
- Tests cover invalid start ids, every funding combination, immediate model/angle/system availability, usable placement, no skipped rewards, AI permission boundaries, shifted arrivals and beats, correct age/calendar, old saves and round-trip continuation, and one-time chapter effects while decisions wait.
- Every player-visible addition updates `docs/features/` with ids. The feature inventory describes only implemented behavior, not this proposal's future entries.
- Design is a normal `codex` PR. Every playable phase is draft plus `awaiting-user`, with "Changes to how the game plays", readable review images and the stand-ins. Bodies start "Author: codex". No review verdict or auto-merge from Codex.

## Owner questions and recommendations

The recommendations below have [owner approval](https://github.com/justinlindh/human-in-the-loop/issues/5#issuecomment-5903928292). The [preview requirement](https://github.com/justinlindh/human-in-the-loop/issues/5#issuecomment-5904087166) still holds public release for owner playtesting. These decisions do not approve the visual or audio stand-ins as final assets.

1. Are compressed historical chapters acceptable? Recommend the explicit chapter calendar and visible bridges, keeping company age honest. A literal multi-decade weekly run would greatly extend playtime and require another pacing design.
2. Founding decision: every era defaults to a new company in a garage with its kit. An established-company takeover is a separate optional choice from ChatGBT onward. The starting kit does not fabricate products, employees or earned milestones.
3. Should later starts end at a shared calendar year? Recommend twenty playable years from founding in the modern starts; a fixed world end makes Plateau a short scenario. Keep the displayed score discount.
4. Should starts be locked? Recommend open sandbox starts and optional career unlocks under #547, with grandfathering. Expose the preview starts without locks until the profile delivery.
5. Are the proposed chat names right? Recommend DeskNet, AwayIM and HipCheck. Preserve Yak from Classic onward and retain all existing thread/reply accessibility.
6. Should the dot-com flotation end a run? Recommend no: it funds a company that must live through the bust. Keep modern IPO retirement separate and explain the difference in the choice.
7. How historical should the first playable drafts look? Recommend existing props for the sim drafts, with a visible stand-in list. Art and audio sign-off remain separate gates before calling the entire feature shipped.
8. Which early chapter after dot-com? Recommend Web 2.0 first: it answers the explicit IE6 request and can reuse web projects. Physical retail is a larger economic change and gets E5.
