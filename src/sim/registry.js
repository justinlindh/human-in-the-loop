// Systems run weekly in ascending order; actions are dispatched by type.
const systems = [];
const actions = {};

export function registerSystem(name, fn, order) {
  const existing = systems.findIndex((s) => s.name === name);
  if (existing >= 0) systems.splice(existing, 1);
  systems.push({ name, fn, order });
  systems.sort((a, b) => a.order - b.order);
}

export const getSystems = () => systems;

export function registerAction(type, fn) {
  actions[type] = fn;
}

export const getAction = (type) => (Object.hasOwn(actions, type) ? actions[type] : null);

export function makeCtx(state) {
  const events = [];
  return { state, rng: state.rng, events, emit: (e) => { events.push(e); } };
}
