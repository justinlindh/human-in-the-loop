// Runs a --patch-js / setup / step body the same way in every check: as the body of an async function, so it can
// `await import('/src/render/checks.js')` (a setup helper) and the caller waits for it. `vars` names what the body
// sees ({ S, R } for a patch). Page code loads this with `await import('/blender/checks/patch-js.js')`, which works
// in a harness page and on the studio engine alike; it makes no three.js objects, so it costs the game's random
// stream nothing.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

export function runJs(body, vars) {
  return new AsyncFunction(...Object.keys(vars), body)(...Object.values(vars));
}
