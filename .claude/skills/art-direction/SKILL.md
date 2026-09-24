---
name: art-direction
description: Look target, palette rules, and the screenshot critique loop for Human in the Loop's 3D isometric diorama. Use when building or judging anything visual in src/render, blender/, or the UI's visual style, and before reporting any visual task done.
---

# Art direction: Human in the Loop

## The target

A **polished miniature diorama**: a high-end isometric toy set of a tech office, lit like a product photo. Think "tiny, expensive, handmade", not "programmer art" and not "photoreal". Kairosoft's charm (busy little people, instant readability) with modern lighting.

## Rules

**Form**
- Nothing is a raw box. Every hard edge is bevelled or rounded, so light rolls off edges and creates highlights. Blender assets: bevel modifier (width 0.01 to 0.03 m, 2 to 3 segments) plus weighted normals. Procedural: `RoundedBoxGeometry` with radius at least 2% of the smallest dimension.
- Chunky proportions. Furniture slightly oversized and simplified; characters chibi (head about 45% of height).
- Silhouettes read at gameplay zoom. If you cannot tell a chair from a plant in a snap at default zoom, simplify and exaggerate.

**Color**
- Colors come only from `src/render/palette.js`. Warm neutrals dominate (cream walls, honey wood, soft gray floors); saturated color is reserved for people (role accents), screens, plants, and alerts.
- No pure black or pure white surfaces. Darkest surface about #2a2630, brightest about #fbf5ea.
- Role colors appear on each character (lanyard or collar) so teams are readable at a glance.
- Red means danger. Do not use saturated red for decoration.

**Light**
- One warm key light with soft shadows, a cool hemisphere fill, and ambient occlusion in contact areas (desk legs, under chairs, wall corners). Shadows are soft and never pitch black.
- Only emissive things bloom: monitors, LEDs, lamps, windows at night. If walls bloom, the threshold is wrong.
- Night is warm inside and blue outside: interior lamps on, screens brighter, windows dark blue with a few lit city windows.
- Tilt-shift is subtle: the center third stays sharp; the blur only sells scale.

**Life**
- Something is always moving: typing hands, blinking LEDs, scrolling screens, someone walking to coffee.
- Mood is visible without UI: slumped posture and grayer screens for coasting or burnout, sparkles and bounce for celebrations, red sweep and running for incidents.
- Effects pop with squash and stretch (scale 0 to 1.15 to 1 over about 200 ms) and never linger.

## Critique loop (run before every visual commit)

1. `npm run snap` for every scenario the task lists (day, and night where relevant). Read each PNG.
2. Score each image against this checklist, pass or fail per line:
   - Reads as a miniature diorama at first glance.
   - No raw unbevelled boxes in the foreground.
   - Palette cohesive; no stray saturated colors; red only for danger.
   - Characters readable: role, mood, and activity legible at default zoom.
   - Lighting: clear key direction, soft shadows, AO in contact areas, no blown-out whites, no crushed blacks.
   - Bloom only on emissives.
   - Composition: office centered, nothing important cut off, UI overlays leave the action visible.
   - Nothing floating, clipping, or z-fighting.
   - Zero console errors from the snap run.
3. Write down the three biggest weaknesses in plain words, fix the worst one, re-snap. Repeat until nothing on the checklist fails.
4. Report with the screenshot paths and the remaining weaknesses. "Looks good" without screenshots is not a report.
