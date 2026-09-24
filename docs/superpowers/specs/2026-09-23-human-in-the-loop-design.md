# Human in the Loop: Design

A Kairosoft-style management sim (in the spirit of *Game Dev Story*) about running a software company that builds AI-driven SaaS products. Rendered as a 3D isometric office diorama in the browser.

## Goals

- **One-shot, then iterate.** The first build is a complete, playable, polished game produced in one autonomous run. Its structure must make later iteration cheap: content in data files, simulation separate from rendering, tests that catch balance regressions.
- **Fun first, with teeth.** Warm and funny like Kairosoft. The darker realities of AI-era software work (junior pipeline collapse, senior burnout, comprehension debt, rogue agents, breaches) are core mechanics, conveyed through characters and events, never lectures. Every problem has creative counterplay; neglecting problems leads to failure.
- **Art is not an afterthought.** The diorama should look good in screenshots. See *Art direction*.
- **Vocabulary:** the player runs a "company" or "lab". Avoid the word "startup" in game text except inside parody jokes.

## Core fantasy

When anyone can build software with AI, building stops being the moat. Distribution, trust, and taste are scarce. You win by marketing well, keeping customers' trust, and keeping the humans who understand your systems engaged and growing.

## Core loop

Time advances in weeks (pausable; 1x/2x/4x speed). A run spans about 15 in-game years starting in 2026.

1. **Conceive a product:** choose a **Category × AI Angle** combo, a **Model vendor**, and a team.
2. **Build:** assigned staff generate four product stats over development weeks, shown as floating "+N" bubbles from their desks:
   - **Features** (what it does), **Polish** (taste/UX), **Reliability** (it works), **Freshness** (how new it feels; decays weekly, restored by updates, cut by clones).
   - Player-facing names: products are rated on Features, Polish, Reliability and Freshness. People have their own skills that drive them: Building (Features), Craft (Polish), Rigor (Reliability), Ideas (Freshness); each pair shares an icon and colour. Internal state keys stay `features`, `polish`, `reliability`, `novelty`.
3. **Launch:** marketing campaign choice, review scores from parody tech press, initial signups.
4. **Operate (live SaaS):** each shipped product has MRR, customer count, churn, uptime, and a feature-request backlog. Products need ongoing maintenance and can get updates (v2, v3) that refresh them.
5. **Grow:** spend money on hiring, office expansions, marketing, security, model upgrades. Unlock new categories and angles via research and market trends.

Combo compatibility is data-driven: some Category × Angle pairs are great (Agent × Support Desk), some are saturated ("AI-powered spreadsheet #47"). Discovering great combos is part of the fun, and a combo that's great early can be saturated later.

## Market

- **Categories** (initial set, unlocked progressively): Notes, Email, CRM, Project Management, Support Desk, HR, Analytics, Design Tools, Accounting, Legal, Recruiting, Dev Tools, Video Editing, Security.
- **AI Angles:** Copilot, Autonomous Agent, AI-native Rebuild, Voice-first, Summarizer, Workflow Automation, Vertical Fine-tune.
- **Incumbents** (parody): Salesfarce (CRM), Jirra (PM), Slackk (chat), Notian (notes), Zendisk (support), Figmo (design), Quickbucks (accounting), Workdai (HR), and others. Each holds market share and customer lock-in per category.
- **Incumbent behavior:** incumbents copy popular AI features 6 to 12 months after you ship them, eroding your Novelty advantage. They sometimes acquire competitors (including you, as an exit).
- **Competitor companies:** clones spawn in hot categories. Clone spawn rate rises each year (everyone has AI too). This is the saturation clock: build advantages decay; brand, trust, and taste persist.
- **Trends:** periodic trend shifts (e.g. "Agents are hot", "AI fatigue", "Compliance crackdown") modify demand per angle and category.

## Marketing

A first-class track, not a button.

- **Channels:** Launch campaign, Content/blog, Conference booth, Influencer deal, Product Hunt day, Paid ads, Enterprise sales hire, Community/Discord.
- **Hype** drives signups. **Brand** is a slow-moving company-level stat that multiplies all acquisition and reduces churn.
- **Hype exceeding product quality** causes churn spikes, bad reviews, and the **"just a wrapper"** reputation hit (Brand penalty, press mockery event).
- **Automated marketing** (AI copy) is cheap but generic: lower Brand gain per dollar, and it stacks a "sameness" penalty.
- **Annual events:** a SaaS conference expo (booth mini-decision), and an awards show (Product of the Year, Best Launch, Worst Outage, and so on).

## Model vendors

Products and internal agents run on licensed models. Choice is per product and per internal automation role.

| Model | Wink | Profile |
|---|---|---|
| Claudius | Claude | Strong, careful, heavy guardrails, pricey |
| ChatGBT | ChatGPT | Strong all-rounder, mid guardrails, high customer brand trust |
| Gemenai | Gemini | Huge context, cheap at scale, occasionally weird output |
| Grokk | Grok | Cheap, edgy, minimal guardrails, PR risk |
| Llamarama | Llama | Open weights, self-host: you own guardrails and the GPU bill |
| DeepSleep | DeepSeek | Very cheap and capable; enterprise-compliance penalty |
| Mistrale | Mistral | EU-friendly; bonus in compliance-heavy categories |

- **Stats:** Capability, Cost, Speed, Guardrails, Brand Trust.
- **Vendor events over time:** new versions release (better stats), price hikes, deprecations that force **migrations** (engineering weeks; skipping a migration degrades the product).

## People

Staff are chibi characters with names, a role, a level, stats, traits, and a portrait.

- **Roles:** Engineer, Designer, Marketer, Support, Security, Sales. Each has a seniority: **Junior / Mid / Senior**.
- **Stats:** Skill (per product stat), Speed, **Meaning**, Stamina, **Knowledge** (understanding of company systems).
- **Traits** (data-driven): e.g. Craftsperson, Hype Machine, Paranoid, Mentor, Night Owl, Vibe Coder, Burnout-prone, Loyal.
- **Growth:** staff level up by working, training (costs money), and **mentorship**. Juniors grow into Mids, Mids into Seniors.

### Meaning

Each person has a **Meaning** meter (0 to 100).

- **Drains** when their core work is automated (strongest for Seniors doing the thing they were proud of), during crunch, and when products they built are killed.
- **Recovers** via mentorship pairings, hard-problem assignments, craft projects, owning or naming things, catching incidents, sabbaticals, awards, and the "AI as pair" policy.
- **Low Meaning states** (visible on the character): Coasting (reduced output, slumped animation), then Burnout (output collapse, Stamina drain), then Resignation (leaves; posts a farewell in the office chat feed).
- When someone with high **Knowledge** leaves, company **Institutional Knowledge** drops.

### The junior pipeline

- Juniors are slow, cost salary, and consume Senior time when mentored.
- Automating junior-level work removes the need to hire them in the short term. No Juniors means no future Seniors.
- As Seniors leave and none replace them, Institutional Knowledge declines, **Comprehension Debt** rises, and incidents become unrecoverable.
- This is a slow, silent spiral. The Reports screen surfaces it with a pipeline chart (juniors, mids, seniors over time).

## Automation

The **Automation panel** has a dial per function: Engineering, Support, Sales, Marketing Copy, QA, Ops. Each dial is 0 to 100% plus a model choice.

- **Effects of higher automation:** more output per week, lower cost; Meaning drain on affected staff; **Comprehension Debt** accrual (engineering, QA, ops); quality and sameness penalties (support hallucinations, generic marketing).
- **Autonomous agents** require **Oversight hours** from humans (scales with autonomy × volume, reduced by model Guardrails). Oversight is a job humans can be assigned to, and doing it well (catching incidents) restores Meaning.
- **Company policies** (unlockable, each a trade-off):
  - *AI as pair, not replacement*: automation output bonus reduced, Meaning drain greatly reduced.
  - *Apprenticeship program*: costs money; Junior growth bonus; recruits better Juniors.
  - *Craft Fridays*: 10% output loss; Meaning recovery; Polish bonus.
  - *Blameless postmortems*: incidents grant Knowledge instead of only losses.
  - *Code comprehension reviews*: slower shipping; Comprehension Debt paydown.
  - *Sabbatical program*: rotating absences; big Meaning recovery.

## Comprehension Debt

A company-level stat: the amount of shipped behavior nobody on staff understands.

- Rises with automated engineering, with staff departures (Knowledge loss), and with product count and age.
- Falls with human refactor projects, comprehension reviews, mentorship, and Senior engineers with high Knowledge.
- Raises incident rate and incident severity, lowers Security Posture, slows feature work (things break when touched).

## Incidents and threats

Incidents are events that roll weekly based on risk factors. Each has an in-office visual (red server lights, alarm, staff running) and a decision popup.

### Rogue agents

Rolled per deployed agent: risk = autonomy × (1 minus guardrails) × (oversight shortfall) × (1 + comprehension debt factor).

- Examples: agent deletes the prod database; agent runs a runaway cloud-spend loop; agent emails every customer; agent gets prompt-injected into leaking data; agent "helpfully" rewrites pricing.
- An on-duty overseer may **catch** it early (roll based on oversight coverage and overseer skill): large damage reduction, Meaning boost, celebration bubble.

### Cyber attacks

Rolled weekly; frequency scales with fame and MRR.

- **Security Posture** = security staff skill + audits + tooling, reduced by Comprehension Debt.
- Attack types: credential stuffing, ransomware, supply-chain compromise, prompt injection against your agents, data exfiltration.
- Outcomes: cash loss, downtime, customer churn, Brand/Trust damage, lost enterprise deals, compliance fines.

### Crisis escalation

Unmanaged problems escalate. Warning signs (grumbles in speech bubbles, resignation letters, a rising incident count on the dashboard) precede crises (major outage nobody can debug, mass resignation, breach headline).

## Win, lose, score

- **Win:** reach an **exit** (IPO at an MRR/Brand threshold, or accept an acquisition offer) or be **category leader** in 3+ categories by the end of the run.
- **Lose:** cash below zero for 8 consecutive weeks (runway), **or** lab collapse: staff below a minimum plus an unrecoverable incident.
- **End of run:** score screen plus an epilogue that reflects how you treated people and systems (e.g. "Acquired by Salesfarce. Your seniors left within the year. The product was sunset in 18 months.").
- Score combines valuation, Brand, staff wellbeing, and incidents survived.

## Screens and UI

- **Main view:** isometric 3D office diorama (camera pan and zoom within bounds, slight rotation allowed), with an HTML/CSS overlay UI in a crisp Kairosoft-inspired style (chunky rounded panels, bold outlines, playful type).
- **Top bar:** Cash, MRR, date, speed controls, runway warning, Brand, Institutional Knowledge indicator.
- **Bottom menu:** Build, Staff, Marketing, Models, Automation, Ops/Security, Office, Reports.
- **Popups:** product creation wizard, launch results and reviews, event decisions, hiring (candidate cards with portraits), staff detail.
- **Feedback:** floating stat bubbles, speech bubbles, a scrolling office chat feed (#general), toasts for events.
- **Reports:** MRR over time, per-product cards, staff pipeline chart, incident log, Comprehension Debt trend.
- **Title screen** with New Game / Continue, and **Settings** (volume, speed, graphics quality).

## Art direction

Target look: a **polished miniature diorama**, like a high-end isometric toy set, not programmer art.

- **Style:** stylized low-poly with soft, rounded forms (beveled and rounded geometry, not raw cubes), a cohesive warm palette with accent colors per role, soft toon-leaning shading with gentle gradients.
- **Lighting:** a key light with soft shadows, ambient occlusion (SSAO/GTAO), subtle bloom on monitor screens and server LEDs, a day/night cycle visible through windows, and warm interior lights at night.
- **Camera:** orthographic isometric, with a tilt-shift depth-of-field effect (toggleable) to sell the miniature feel.
- **Characters:** chibi proportions (big heads), distinct silhouettes per role, hair and outfit variation from data, expressive idle/typing/walking/slumped/celebrating animations (procedural transform animation), emote icons above heads.
- **Office:** desks with monitors that show stylized code and UI, whiteboards, plants, coffee machine, server racks with blinking LEDs, a monitoring wall for agents, meeting room. Three office stages: Garage, Office Floor, HQ Building, each with an upgrade transition.
- **Juice:** squash-and-stretch on bubbles, confetti on launches and awards, screen shake and red alarm lighting on incidents, smooth UI transitions.
- **Asset pipeline:** procedural Three.js geometry by default (rounded boxes, lathe and extrude shapes, merged geometries, shared materials). **Blender (headless, Python-scripted, exported to glTF)** is approved for hero assets (characters, key furniture) if procedural geometry falls short of the target look. Installing Blender is a prerequisite step if used.
- **Quality bar:** before the one-shot is called done, screenshots of each office stage, day and night, and an incident are reviewed against this section.

## Audio

Audio is its own engine subsystem (`src/audio`): a pure director that reads the same paced events and state as the renderer and outputs play commands, a small WebAudio backend with buses (music, ambience, SFX, UI, voice), and a data manifest. Game code holds no sounds. The tools, licences and engine design are in `docs/superpowers/specs/2026-09-24-audio-tools-report.md`.

- **Music:** ACE-Step (the latest XL checkpoint with its planner, at full quality), curated by ear into loops. 2 to 3 beds per era with a shared instrument core, plus short stingers.
- **SFX:** curated CC0 (Kenney first).
- **Voices (Simlish barks):** acted gibberish, 0.5 to 2 s, per voice set (fem, masc), per variant and per emotion, designed with Qwen3-TTS. Each person's voice comes from `staff.voice`, with a small pitch offset.
- **Voice barks are rare. Less is more.** They are never tied to every speech bubble or chat line. They play:
  - always when the player clicks a character in the office;
  - on moments that matter: a launch cheer, an incident groan, an era arrival, the Waffle Party, someone burning out or quitting, a hire's first day;
  - otherwise only as an occasional ambient line, with a global cooldown (roughly one every 30 to 60 s at most) and never over a decision or menu.
- **Mix:** music ducks under barks and decisions, and everything obeys pause.
- **Quality bar:** every generated asset is judged by the user's ear before it ships.

## Architecture

- **Stack:** Vite, vanilla JS (ES modules), Three.js, Vitest. No UI framework (HTML/CSS overlay with small helper functions).
- **Layout:**
  - `src/sim/`: pure, deterministic simulation. Seeded RNG. No DOM or Three.js imports. `tick(state, actions)` returns new state plus events.
  - `src/data/`: content definitions (categories, angles, combos, incumbents, models, traits, events, policies, names, epilogues).
  - `src/render/`: Three.js scene, procedural asset builders, characters, animation, post-processing. Reads sim state; never mutates it.
  - `src/ui/`: HTML overlay, menus, popups, feeds. Dispatches player actions into the sim.
  - `src/audio/`: WebAudio.
  - `src/save/`: serialize and deserialize sim state to localStorage, with a version field.
  - `src/main.js`: game loop and wiring.
- **Rule:** the simulation is the single source of truth and is runnable headless in Node.

## Testing and verification

- **Unit tests (Vitest)** on sim systems: Meaning drain and recovery, comprehension debt, incident risk, market and churn, combo scoring, save round-trip.
- **Balance harness:** headless autoplay bots that play full runs across many seeds:
  - *Automate-everything* bot: must lose (lab collapse or trust death) in at least 70% of seeds.
  - *All-humans, no automation* bot: must lose to runway or fail to win in at least 70% of seeds.
  - *Balanced* bot (mentorship, oversight, moderate automation, marketing): must win in at least 30% of seeds, and must not win in more than 90% (the game should still be hard).
  - The harness prints a summary table; thresholds are asserted in a test.
- **Playtest:** drive the game in Chrome via browser automation; screenshot key states; read the console for errors. Zero console errors required.

## One-shot scope

In: everything above, at modest content depth (roughly 14 categories, 7 angles, 7 models, 8+ incumbents, 40+ events, 20+ traits, 6 policies, 3 office stages).

Out (future iterations): multiplayer, mobile layout, localization, mod support, accessibility beyond readable contrast and keyboard shortcuts for menus.

## Progression

Upgrades change the game in ways the player can see and feel, but no single upgrade is decisive. Guideline: a single item or tool moves its stat by 10% to 40%, never more than 50%; stacking several is how a player builds an edge. Effects are relative to the base value they modify (never flat amounts added to a small base), and stacked meaning boosts together must not make burnout impossible: a fully kitted office with good policies should keep average meaning high but still let neglected people burn out.

### Career paths and training

- **Training programs** replace the single Train button:
  - *Workshop*: cheap, +XP, +3 to one chosen skill.
  - *Conference*: pricier, bigger XP gain, +meaning, a small brand bump; the person is away for a week.
  - *Course*: two weeks away, +knowledge, +XP.
- **Career path at promotion to Senior.** The player picks one path; the person shows a "path pending" badge until chosen. Each path has one clear perk:
  - Engineer: *Architect* (pays down comprehension debt, faster knowledge gain), *Tech Lead* (mentees grow faster), *AI Wrangler* (much stronger oversight and catch chance; oversight restores more meaning), *Staff Engineer* (stronger hard-problem novelty, bonus features).
  - Designer: *UX Lead* (polish), *Brand Designer* (steady brand gain).
  - Marketer: *Growth Lead* (hype), *Brand Lead* (brand gain).
  - Support: *Support Lead* (support capacity, lower churn), *Community Manager* (brand, hype).
  - Security: *Red Team Lead* (posture), *Incident Commander* (faster outage recovery).
  - Sales: *Enterprise AE* (sales boost, compliance deals), *Partnerships* (acquisition in new categories).
- **Legend** at level 20: a title and a 25% boost to the path perk.
- **Earned traits** from experience (max 3 traits per person): 20 weeks mentoring earns *Natural Mentor*; catching 3 incidents earns *Paranoid*; 20 weeks on hard problems earns *Visionary*.

### Office shop

Buyable items that appear in the diorama, each upgradeable from level 1 to 3 with visibly fancier models. Each office stage has a limited number of item slots (Garage 3, Office Floor 8, HQ 16). Items can be sold for half their cost.

| Item | Effect per level (1 / 2 / 3) |
|---|---|
| Espresso | stamina recovery +15% / +30% / +45% |
| Plant Wall | meaning recovery +10% / +20% / +30% |
| Nap Pod | burnout resignation chance -15% / -30% / -45% |
| Arcade | meaning recovery +15% / +25% / +35%, output -2% / -3% / -4% |
| Standing Desks | stamina drain -10% / -20% / -30% |
| Whiteboard Wall | novelty points +5% / +10% / +15% |
| Library | knowledge gain +15% / +30% / +45% |
| Monitoring Wall | oversight hours per person +15% / +30% / +45% |
| Server Racks | maintenance need -5% / -10% / -15%, uptime floor +0.03 / +0.06 / +0.1 |
| Trophy Case | brand decay -15% / -30% / -45% (needs an award) |

### Internal tools (research)

Engineering time spent on tools with permanent effects, run as projects of kind `research`. Some require another tool first.

| Tool | Effect | Requires |
|---|---|---|
| Eval Harness | rogue-agent incident chance -25% | |
| Agent Sandbox | rogue-agent damage -40% | Eval Harness |
| Observability | outage fixes 40% faster; unrecoverable threshold 20% lower | |
| CI/CD | reliability points +10%; health decay -20% | |
| Design System | polish points +10% | |
| Docs Culture | debt from departures -40%; institutional knowledge +10% | |
| Onboarding Kit | new hires start with +15 knowledge | Docs Culture |
| Red Team Suite | security posture +10 | |

## Slackk (team chat)

The #general feed becomes a small Slack-like panel, branded Slackk, and a storytelling surface: morale shows up in chat before it shows up in the meters.

- **Channels:** `#general` (staff chatter), `#incidents` (pagerbot and the scramble), `#wins` (launches, promotions, awards), `#random` (coffee machine drama, office dog).
- **Contextual lines:** templates that reference real products, coworkers, models, and incumbents ("Claudius refused to drop the users table again").
- **Conversations:** a post plus one or two replies from other staff, triggered by moods, roles, and recent events (a coasting senior posts, a junior they mentored replies).
- **Reactions:** emoji counts on posts. A healthy team reacts; a checked-out team does not.
- **Volume follows morale:** a happy team is chatty; a burnt-out team goes quiet.
- **Clickable names** focus the camera on that person and open their card. Unread badges show per channel while the panel is collapsed.

## Decision events

Random events regularly put a decision in front of the player (roughly one every three weeks). They carry the game's personality and its themes.

- **Kinds:** people (complaints, someone not showing up, poaching, burnout, side projects), leadership ideas (a founder read a blog post and wants to replace support with agents, a four-day week, an AI-first mandate, a rebrand, a pivot, an open-plan office), market, vendors, incidents, and office life.
- **Not every consequence is immediate.** A choice can:
  - apply effects now;
  - apply effects later ("in 6 weeks, the rebrand lands");
  - start a temporary modifier that runs for a number of weeks ("four-day week trial: +meaning, -10% output for 8 weeks");
  - schedule a follow-up event that revisits the decision ("the trial is over: keep it?").
- **Visibility:** active modifiers show in the HUD tray with weeks remaining. Scheduled consequences are not shown in full; the decision's hint says "effects later" so the player knows something is coming.
- **No-shows:** someone who does not show up is away for a few weeks; how the player responds (check in, dock pay, ignore) changes that person's meaning and the team's.

## Icons

No stock emoji anywhere in the shipped game. Every icon (menu buttons, categories, toasts, meters, Slackk reactions, emotes above characters, event art) comes from one custom set in the diorama's art direction: the same palette, chunky rounded forms, and thick outlines as the UI. The art director chooses the technique (for example, small renders of the game's own 3D models for object icons, and hand-drawn SVG for small glyphs) as long as the set reads as one family at 16 to 48 px.

## Standups

A weekly ritual that shows morale in person.

- **Daily Standups policy:** once per in-game week the team walks to the whiteboard (or the meeting room once there is one), stands in a loose circle, and 3 to 5 speech bubbles play out in turn; then everyone returns to work. Lines come from real state: project progress, mentoring, blockers, outages. Coasting people give flat answers ("Same as yesterday."), and burnt-out people say nothing. Cost: a small output loss. Benefit: better knowledge sharing (institutional knowledge) and a small meaning lift.
- **Async Standups policy:** the same updates are posted to a Slackk `#standup` channel instead. No output cost, a weaker benefit, and people who are checked out stop posting, so a quiet channel is a warning sign.
- The two policies are mutually exclusive. At 2x speed and above, the in-person gathering is shortened and the bubbles are skipped, so it never drags.

## Structure v2: eras, unlocks, founding, placement (supersedes the run shape above)

Approved after the first playtests: the game threw everything at the player at once, ran too fast, and started in a finished office. This section supersedes the earlier run shape (15 fixed years from 2026), the fixed item slots, and the up-front menus.

### Run shape
- The run starts in January 2019 and is a **20-year career**, like Game Dev Story. The 20th anniversary (2039) is the natural ending: it produces the epilogue and score, and the player may keep playing after it.
- **Target length:** a first full run takes about 4 to 5 hours at 1x, played across several sessions. Saves must make that comfortable (see Saves).
- **Goals** (first launch, reaching the Office Floor, reaching HQ, the first award, leading a category, an IPO, a 10-year anniversary, and similar) are milestones with small rewards (cash, brand, a trophy for the shelf), shown in a Goals card.
- **Retiring early:** from about year 10, when eligible, the player can take an IPO or accept an acquisition and retire, which produces the epilogue and score; or keep playing. Bankruptcy and collapse still end a run.
- **Clock:** about 8 real seconds per week at 1x (to be confirmed with the pacing simulator). Balance is expressed in weeks, so the clock can change without retuning the sim. With decision and menu pauses, a game year takes roughly 12 to 15 real minutes at 1x.
- **Content ladder:** something new arrives roughly every 10 to 20 real minutes for the whole run (product categories, items, office stages, research, awards, trade shows, rivals, perks, pets, world events), never more than 2 unlock cards in a real minute outside era arrivals. A longer run with the same content is not the goal.

### Saves
- Autosave every few weeks and when the tab is hidden or closed.
- Several save slots, listed on the title screen with company, date and logo.
- A "Welcome back" recap on Continue: the state of the company, what is waiting on the player, and the last few notable moments.

### Eras
The world timeline is fixed, with each era's arrival jittered by up to one quarter per run. Each arrival is shown as an era card and usually comes with a decision.
1. **Classic SaaS** (2019 to about 2022): no models, no automation, no rogue agents, no AI angles. A product is a category plus an **approach** (Web App, Mobile-first, API-first, Freemium, On-prem). The player learns building, hiring, launching, marketing, and the office.
2. **The ChatGBT moment** (about 2022 to 2024): model vendors, the Copilot and Summarizer angles, and gentle automation (support and marketing copy only, capped at 50%). Incumbents and clones begin adopting AI.
3. **Agents** (about 2025 to 2028): the Agent and Workflow angles, the AI-native angle, the full automation dials (engineering, QA, ops up to 100%), rogue agents, oversight, and AI research tools.
4. **Consolidation** (about 2029 to 2033): price wars, frequent vendor deprecations, incumbents fighting back, regulation, and regular acquisition offers.
5. **The Plateau** (about 2034 on): AI is a commodity everyone has, so the edge is people, taste and trust. Human craft, comprehension and brand decide who wins. Open-ended from here, driven by trends.
The pre-AI Classic era is deliberately long: at 1x it is the first hour or so of play.
Approaches stay available after the AI eras; AI angles add to them.

### Progressive unlocks
Menus and systems appear as the company grows. At the start: Build, Staff, Office, and a simple Reports panel. Unlocks: Marketing at the first launch; Ops and Security at the first incident; Research at the third launch; Models and Automation at the ChatGBT moment; career paths at the first promotion to senior; standups at 5 staff; policies arrive one by one with their triggers. Each unlock shows a "New!" badge on its menu button and a one-card explainer (what it is, why it matters now).

### Founding phase
After New Game, before week 1:
1. Company name, a logo color, and a tagline (cosmetic, with Suggest buttons).
2. Two founders chosen from about 6 generated archetype cards: Engineer, Designer, Hustler (marketer), Operator (support or security), Researcher (novelty-heavy engineer), Seller. The pair shapes the opening.
3. Funding: Bootstrapped (about $90k; full score), Friends and Family (about $150k; score x0.9; occasional guilt-pressure events), or Pre-seed VC (about $300k; score x0.8; investor events pushing growth and, later, automation).
The first product is then started from the normal Build panel (guided by the first goal).

### The office: empty start and free placement
- Each stage is a tile grid (Garage 9x7, Office Floor 15x12, HQ 21x16) with fixed walls, windows, and a door. The run starts in an empty garage.
- Everything is bought and placed on tiles: desk sets (desk, chair, and screen; one person each), meeting table, whiteboard, coffee corner, racks, plants, bookshelves, and every shop item (with their upgrade levels). Build mode shows a ghost preview (valid or invalid), and supports rotate, move, and sell (half refund). Placement must keep a walkable path from the door to every desk.
- **Desks are capacity:** hiring needs a free desk.
- **Adjacency:** some items give bonuses to nearby desks or items within a small radius (plants and meaning, whiteboards and novelty, racks next to racks and uptime, a coffee corner and stamina). Adjacency stacks with the item's global effect and follows the 50% cap.
- **Moving offices:** a stage upgrade auto-arranges existing furniture into the new space; the player can then rearrange.

### Guidance
- A **Goals** card in the tray (for example "Getting started: place 2 desks, start a product, launch it"), updated as goals complete.
- The founders nudge in speech bubbles and Slackk ("We should probably get desks in here first").
- Unlock explainer cards. No front-loaded tutorial beyond the HUD and speed basics.
