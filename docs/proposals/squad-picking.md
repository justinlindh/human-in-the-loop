# Picking squads in the project pickers

Issue #1909. Today a squad is posted only from its own card (Staff > Squads > Post to project). The two places a player actually staffs a project list people only:
- the team picker when starting a new project;
- the add-people picker on a running project in Build.

This proposal puts squads into both pickers.

## How squads work today (`src/sim/squads.js`)

- A squad is up to 8 people, with an optional lead, a cohesion meter and an After launch setting: upkeep crew, or back to maintenance.
- `postSquad` assigns every member who can take the work. It skips the upkeep crew and, for maintenance, anyone who isn't an engineer.
- Cohesion builds (up to +10% output over 12 weeks) only while at least half the squad works the squad's posting. Members assigned by hand to the same project don't count, because the squad isn't posted there.
- After a new product launches, a posted squad leaves its best engineers as the upkeep crew and benches the rest for 2 weeks.
- A member doing other work while the squad is posted elsewhere shows as "on loan" on the squad card.

So assigning a squad's people one by one silently loses everything that makes it a squad. That is the real bug behind "half baked".

## What comparable games do

- **RTS control groups** (StarCraft, Age of Empires): one key selects the whole group, and shift-click removes one unit. The group stays the unit of thought, and exceptions are one tap each.
- **XCOM 2, squad select:** the squad fills its slots in one step. Soldiers who can't go are listed greyed with the reason (wounded, on a covert op), and any slot can be swapped.
- **Frostpunk, work assignment:** a building takes whole work teams. When too few are free, it shows how many are short instead of failing.
- **Football Manager, team selection:** pick a saved selection, then change individuals. The selection stays named.

The common pattern: **select the group in one tap, show who can't come and why, and let individuals be removed without breaking the group.** Nobody makes the player rebuild a group person by person.

## Recommendation

### 1. A squad strip above the people list, in both pickers

- **The strip:** a row of squad chips, one per squad, shown once squads are unlocked and at least one exists.
- **Chip contents:** the squad's name, a small cohesion bar, the lead's portrait and a count ("4 of 5 can come").
- **One tap** selects the squad. The chip turns on, and every member who can come is ticked in the list below. Each ticked row carries a coloured stripe and the squad's name.
- **Tapping the chip again** clears the squad and unticks its members.
- **Members stay individually removable.** Tapping a ticked member unticks them, and the chip shows "3 of 5". The squad is still selected. The unticked member keeps their current work and shows on the squad card as on loan, as today.
- **Hiding the strip:** with no squads, it doesn't show and the pickers look as they do now.

### 2. Members who can't come, shown before the player commits

The chip has a separate expand button (a chevron, its own 40 px tap target). It opens the member breakdown inside the picker, one line each, with the same reasons the squad card uses:

| Member state | In the picker | Selected by the chip? |
|---|---|---|
| Free, or on default work | normal row | yes |
| On another project | amber tag "moves from <project>" | yes, and can be unticked |
| On this squad's upkeep crew | grey "upkeep: stays on <product>" | no |
| Away or on sabbatical | grey "away" | no |
| Can't be assigned to a project right now (the reason `assign` would give) | grey, with that reason | no |

- **The count on the chip** is the members it will actually post.
- **If nobody can come,** the chip is disabled, showing the reason from the breakdown's first line, so a tap does nothing silently.
- **Moving someone off another project** is allowed, because posting from the squad card already does it. The amber tag makes it a visible choice.

### 3. Picking the chip posts the squad

Tapping the chip and confirming (Start building, or adding to a running project) **posts the squad** to that project. That is the same as Post to project on the squad card:
- the posting is recorded;
- cohesion keeps building;
- the lead counts;
- After launch applies.

Ticking a squad's members one by one assigns **people only**, as today. The difference must not be invisible, so:
- when individual ticks cover at least half of a squad (the cohesion threshold), its chip shows a hint, "3 of 5 picked: tap to post as a squad";
- one tap turns it into a squad posting with the same people ticked.

The breakdown also shows the squad's After launch setting, with the same toggle as the squad card, so the player sees what happens after the launch without leaving the picker.

### 4. Mixed picks and existing teams

- **People from different squads, picked individually:** fine. They're assigned as people. Each squad's chip shows its own "n of m picked" hint.
- **Two squad chips on one project:** allowed. Each squad is posted to the project and builds its own cohesion. A person can't be in two squads, so there's no overlap.
- **Adding a squad to a project that already has people:** the squad is posted and its members join. The people already there stay. The project card keeps its existing squad chip, so a mixed team reads as "Payments squad + 2".
- **A squad already posted to another project:** the chip says "on <project>". Selecting it moves the squad's posting here (one posting per squad, as today), and its members show "moves from <project>".
- **Picking one member of a squad posted elsewhere** (no chip): that person moves alone and shows as on loan. Their row says so before the tap: "Payments squad: on loan if picked".

### 5. Touch

- **Every action is a tap:** chip on or off, the chevron to expand, a row to tick or untick.
- **No hover or long-press:** nothing depends on either. The `title` text is a convenience copy of what the rows already show.
- **Narrow screens:** the strip scrolls sideways, chips are at least 40 px tall, and the breakdown opens inline (not as a popover), so it works at 360 px wide.

### 6. Changes to how the game plays

- **More squad postings:** squads get posted from where players staff projects, so more projects run with cohesion, up to +10% output after 12 weeks. No number changes, but players who use squads will see that bonus more often.
- **After launch reaches more projects:** squads posted from the picker get upkeep crews and the bench. A player who never opens the Squads screen still won't meet any of it, because the strip only appears once a squad exists.

### Contract and lanes

- **sim** (contract change, through team-lead): `postSquad` takes an optional `exclude: [staffId]` for members the player unticked. Members in it are left where they are and reported as skipped with the reason "Left off". No other rule changes. Bots don't use it, so balance is unchanged; a same-seed run identical to main shows that.
- **ui:**
  - the squad strip, chips, breakdown and hints in `src/ui/panels/build.js`, for both the new-project team and the add-people picker;
  - Start building and add-to-project dispatch `postSquad` per selected squad (with `exclude`) and `assign` per other ticked person;
  - the `docs/features/` entry and a phone check.
- **art, audio:** none.

**Order:** sim's `exclude` first (small), then ui. ui mocks the strip and the breakdown for the owner's desk before building. Phone and desktop stills should cover a squad with one member on another project and one on upkeep.
