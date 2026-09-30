<!-- Generated from src/data and src/sim/balance.js by `npm run effects`. Do not edit by hand. -->

# People

## Roles

| Role | Default work | Automated by |
|---|---|---|
| Engineer | maintenance | engineering 1, qa 0.5, ops 0.4 |
| Designer | idle | engineering 0.35 |
| Marketer | marketing | marketing 1 |
| Support | support | support 1 |
| Security | security | ops 0.6 |
| Sales | sales | sales 1 |

## Seniority

| Seniority | Salary a week | Output |
|---|---|---|
| junior | $900 | ×0.6 |
| mid | $1,600 | ×1 |
| senior | $2,600 | ×1.45 |

## Traits

| Trait | Effects | Era |
|---|---|---|
| Legacy Whisperer | present senior engineer: new Web 2.0 web-project work x1.08 instead of x1.2; earned after 3 contributed compatible launches, with a free trait slot | any |
| Craftsperson | polish ×1.3, meaning drain ×1.5, meaning recovery ×1.2 | any |
| Hype Machine | hype ×1.5 | any |
| Paranoid | oversight ×1.4, bug catching ×0.15 | agents |
| Mentor | mentoring ×1.6, meaning recovery ×1.2 | any |
| Night Owl | output ×1.1, stamina ×1.2 | any |
| Vibe Coder | features ×1.3, reliability ×0.7, meaning drain ×0.5 | chatgbt |
| Burnout-prone | output ×1.15, stamina ×1.5 | any |
| Loyal | chance of resigning ×0.4 | any |
| Job Hopper | chance of resigning ×1.8 | any |
| Tinkerer | novelty ×1.3, learning speed ×1.2 | any |
| Pragmatist | meaning drain ×0.6, reliability ×1.1 | any |
| Perfectionist | output ×0.85, reliability ×1.3, polish ×1.2 | any |
| Fast Learner | learning speed ×1.5 | any |
| Old Guard | reliability ×1.2, meaning drain ×1.3, bug catching ×0.1 | any |
| AI Enthusiast | meaning drain ×0.3, oversight ×1.2 | chatgbt |
| People Person | hype ×1.2, meaning recovery ×1.1 | any |
| Lone Wolf | output ×1.15, mentoring ×0.6 | any |
| Caffeinated | output ×1.1, stamina ×1.1 | any |
| Visionary | novelty ×1.4 | any |
| Steady | stamina ×0.7, chance of resigning ×0.7 | any |
| Cynic | meaning recovery ×0.7, reliability ×1.15 | any |
| Red Teamer | bug catching ×0.2, oversight ×1.2 | agents |
| Natural Mentor | mentoring ×1.3, meaning recovery ×1.1 | any |
| Percussive Maintenance | reliability ×1.05 | any |

## Training

| Program | Cost | Gains | Away |
|---|---|---|---|
| Workshop | $2,000 | XP +30, skill +3 | - |
| Conference | $8,000 | XP +80, meaning +10, brand +0.5 | 1 weeks |
| Course | $5,000 | XP +60, knowledge +15 | 2 weeks |

## Career paths

| Path | Role | Effects |
|---|---|---|
| Architect | Engineer | tech debt paydown ×1.4, knowledge gain ×1.3 |
| Tech Lead | Engineer | mentoring ×1.4 |
| AI Wrangler | Engineer | oversight ×1.4, bug catching ×0.15, meaning from oversight ×1.35 |
| Staff Engineer | Engineer | novelty from hard problems ×1.4, features ×1.15 |
| UX Lead | Designer | polish ×1.3 |
| Brand Designer | Designer | brand a week ×0.03 |
| Growth Lead | Marketer | hype ×1.35 |
| Brand Lead | Marketer | brand gains ×1.4 |
| Support Lead | Support | support hours ×1.4, churn ×0.9 |
| Community Manager | Support | brand a week ×0.02, hype ×1.15 |
| Red Team Lead | Security | security posture ×8 |
| Incident Commander | Security | outage fixing ×1.4 |
| Enterprise AE | Sales | sales ×1.35 |
| Partnerships | Sales | customer acquisition ×1.15 |

## Vacations and strain

- Everyone takes 2 weeks of vacation a year, with at most 15% of the team away at once.
- An outage, Crunch Mode or a push (Founder hustle, Lockdown sprint, Rivalry, Heads down, Family expectations, Performance plan pressure) postpones a vacation by 4 weeks and adds 6 strain, at most 2 times in a row.
