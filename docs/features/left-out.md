# Ids left out on purpose

- `letter` and `fumes`: the renderer plays these moments, but they are not in its moment `KINDS` list, so the Staged moments bullets carry their event ids instead.
- Caption keys in `src/data/moments.js` other than `first_user_test`, `efficiency_consultants` and `printer_jam`: the UI caption shows only when the renderer announces a moment, and only those three announce one.
- Events with no `stage`, `grant` or `leaves` (for example `senior_grumble`, `quiet_quitter`, `viral_post`, `vendor_price_hike`, `four_day_week`): decision cards only, nothing staged in the office.
- Research, trait, career path, trend, category, angle, marketing channel, goal, training and policy ids beyond those named above: menu content without an office staging of its own, covered by the panel bullets.
- `@channel` moments and call scripts: they have no ids in the data.
