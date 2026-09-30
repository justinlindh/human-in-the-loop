import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadGame, saveGame, SAVE_KEY } from '../../src/save/save.js';
import { dispatch, tick } from '../../src/sim/index.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/period-chat-saves.json', import.meta.url)));
const memory = (state) => {
  const map = new Map([[SAVE_KEY, JSON.stringify(state)]]);
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
};

it.each(Object.keys(fixtures))('round trips an existing %s save with open replies and queued post responses', (era) => {
  const original = structuredClone(fixtures[era]);
  const storage = memory(original);
  const loaded = loadGame(storage);
  expect(loaded.ok).toBe(true);
  const s = loaded.state;
  expect(s.chatLog).toEqual(original.chatLog);
  expect(s.chatPrompts).toEqual(original.chatPrompts);
  expect(s.flags.posts).toEqual(original.flags.posts);
  expect(s.founding).toEqual(original.founding);
  expect(s.era).toEqual(original.era);
  const promptId = s.chatPrompts[0].id;
  const action = { type: 'answerPrompt', promptId, choice: 1 };
  expect(dispatch(s, action)).toEqual(dispatch(original, action));
  expect(s.chatPrompts[0].resolved.choice).toBe(1);
  expect(s.chatLog.some((m) => m.replyTo === s.chatPrompts[0].chatId)).toBe(true);
  for (let i = 0; i < 3; i++) {
    if (s.pendingDecision) {
      const choice = s.pendingDecision.choices.findIndex((c) => c.available);
      const answer = { type: 'resolveDecision', choice };
      expect(dispatch(s, answer)).toEqual(dispatch(original, answer));
    }
    expect(tick(s)).toEqual(tick(original));
  }
  expect(s.chatLog.some((m) => m.text === 'Back after lunch.')).toBe(true);
  expect(s).toEqual(original);
  expect(saveGame(s, storage)).toBe(true);
  const again = loadGame(storage);
  expect(again.ok).toBe(true);
  expect(again.state).toEqual(s);
  expect(tick(again.state)).toEqual(tick(s));
  expect(again.state).toEqual(s);
});
