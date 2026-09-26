import { describe, it, expect } from 'vitest';
import { createYakPacer } from '../../src/yak-pacing.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { startOutage, clearOutage } from '../../src/sim/incidents.js';
import { standupSystem } from '../../src/sim/standup.js';
import { game, addProduct } from './helpers.js';

function office() {
  const state = game(1);
  state.staff = state.staff.slice(0, 1);
  Object.assign(state.staff[0], { role: 'engineer', mood: 'ok', assignment: { type: 'idle' } });
  state.policies.async_standups = true;
  const product = addProduct(state, { name: 'Inboxer' });
  startOutage(makeCtx(state), { productId: product.id, kind: 'ransomware', severity: 1 });
  return state;
}

function posts(state) {
  const ctx = makeCtx(state);
  standupSystem(ctx);
  const chat = ctx.events.filter(e => e.type === 'chat');
  expect(chat).toHaveLength(1);
  expect(chat[0].channel).toBe('standup');
  return chat;
}

function waiting(state, chat) {
  const queue = createYakPacer();
  const reading = { type: 'chat', id: 'reading', text: 'Read this company update.', from: '@officebot' };
  queue.enqueue([reading, ...chat], { state });
  expect(queue.step(0, true, { state })).toEqual([reading]);
  return queue;
}

describe.each([1, 2, 4])('async standup producer to Yak at %ix', (speed) => {
  it.each(['resolved', 'replaced'])('drops a post for a %s outage below both age ceilings', (ending) => {
    const state = office();
    const chat = posts(state);
    const queue = waiting(state, chat);
    expect(queue.step(1, true, { state, gameTime: speed })).toEqual([]);
    const productId = state.outage.productId;
    clearOutage(makeCtx(state), '');
    if (ending === 'replaced') startOutage(makeCtx(state), { productId, kind: 'ransomware', severity: 1 });
    expect(6).toBeLessThan(B.yakMaxWaitSeconds);
    expect(6 * speed).toBeLessThan(B.yakMaxWaitGameSeconds);
    expect(queue.step(5, true, { state, gameTime: 6 * speed })).toEqual([]);
    expect(queue.queued).toBe(0);
  });

  it('delivers the post while its outage is still active', () => {
    const state = office();
    const chat = posts(state);
    const queue = waiting(state, chat);
    expect(queue.step(6, true, { state, gameTime: 6 * speed })).toEqual(chat);
  });

  it.each(['idle', 'coasting', 'project', 'support'])('keeps an ordinary %s update after recovery', (kind) => {
    const state = office();
    if (kind === 'idle') clearOutage(makeCtx(state), '');
    if (kind === 'coasting') state.staff[0].mood = 'coasting';
    if (kind === 'project') {
      state.projects.push({ id: 'project', name: 'Notes', progress: 10, pointsNeeded: 100 });
      state.staff[0].assignment = { type: 'project', targetId: 'project' };
    }
    if (kind === 'support') state.staff[0].role = 'support';
    const chat = posts(state);
    expect(state.flags.outageChat?.[chat[0].id]).toBeUndefined();
    const queue = waiting(state, chat);
    clearOutage(makeCtx(state), '');
    expect(queue.step(6, true, { state, gameTime: 6 * speed })).toEqual(chat);
  });
});
