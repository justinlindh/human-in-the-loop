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
   - **Features** (what it does), **Polish** (taste/UX), **Reliability** (it works), **Novelty** (differentiation).
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

Lightweight procedural audio via WebAudio (UI clicks, typing ambience, launch fanfare, alarm), with a simple generated background loop. Mute and volume in Settings. Audio is polish, not a blocker.

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

Upgrades change the game in ways the player can see and feel, but no single upgrade is decisive. Guideline: a single item or tool moves its stat by 10% to 40%, never more than 50%; stacking several is how a player builds an edge.

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
| Plant Wall | meaning recovery +0.1 / +0.2 / +0.3 per week |
| Nap Pod | burnout lasts +1 / +2 / +3 weeks before resignations roll |
| Arcade | base meaning recovery +0.2 / +0.35 / +0.5, output -2% / -3% / -4% |
| Standing Desks | stamina drain -10% / -20% / -30% |
| Whiteboard Wall | novelty points +5% / +10% / +15% |
| Library | knowledge gain +15% / +30% / +45% |
| Monitoring Wall | oversight hours per person +15% / +30% / +45% |
| Server Racks | maintenance need -5% / -10% / -15%, uptime floor +0.03 / +0.06 / +0.1 |
| Trophy Case | brand +0.02 / +0.04 / +0.06 per week (needs an award) |

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
