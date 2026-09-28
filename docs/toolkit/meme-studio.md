---
tool: `node blender/memes/studio.mjs --out <dir> [--only is_this_agi,distracted_founder,the_bill,the_plan]`
section: render
who: art, video
covers: blender/memes/studio.mjs
---
Yak memes drawn in the game's style rather than captured from the office. Each meme is a small studio scene built from the game's own character kit (`createCharacter`), palette and portrait lighting: a floor, a wainscoted wall, a window or a plant, and people posed by hand (an anim, then shoulder angles through the character's `shoulders()` and a head turn), shot with a free camera. Captions, labels and panel rules go on top in 2D, in the same frame as the engine-captured memes: paper, an ink border and Fredoka. It writes `<id>.png` at 1200x900 per meme, rendered with the rig off (`?rig=0`) so hand-set joints drive the mesh. Video copies the images into `public/memes` and the meme data. To add a meme, add a branch in `render()` and its id to `MEMES`.
