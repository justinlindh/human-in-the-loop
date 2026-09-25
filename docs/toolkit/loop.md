---
tool: `blender/checks/loop.mjs [--moments 'q1; q2'] [--seconds 10] [--no-spotlight]`
section: render
covers: blender/checks/loop.mjs
---
Decision moments through the real game loop: loads the state just before the tick that raises an indexed decision (its `preTick` snapshot) into a normal page with the full UI, lets `main.js` tick into the decision on virtual time, and fails if nobody takes the moment or its actors don't move while the decision is open. Every other check stages decisions directly and skips `main.js`'s decision freeze. A failure prints the actors who should have taken the moment (position, walk, the temp and who set it) and the last lines of the ownership trace. It also checks the spotlight hold in `main.js`: with the renderer reporting a spotlight (stood in for), no week passes while the office keeps rendering, the weeks resume once it ends, and a spotlight held past the cap is let go.
