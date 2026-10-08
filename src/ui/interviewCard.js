// The "Watch the interview" card body (Spot the AI): the interview feed, the transcript one line at a
// time, and a single follow-up question. Whether the candidate is an AI is never shown; the player decides.
import { h } from './dom.js';
import { pAfter, pClear } from './pclock.js';

const LINE_MS = 1500;

// FNV-1a of the candidate id: a stable seed for the feed.
export const feedSeed = (id) => { let x = 2166136261; for (const ch of String(id)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; };

export function interviewBlock(ctx, d, renderer) {
  const lines = () => d.vars?.lines ?? [];
  const talk = h('div.iv-talk', { role: 'log', 'aria-live': 'polite' });
  const feed = h('div.iv-feed', null, h('span.iv-wait', { text: 'Connecting to the call...' }));
  let handle = null;
  try { handle = renderer?.interviewFeed?.({ seed: feedSeed(d.vars?.candidateId), tells: d.vars?.tells ?? [], decoy: d.vars?.decoy ?? null }) ?? null; } catch { handle = null; }
  if (handle?.canvas) feed.replaceChildren(handle.canvas);
  const ask = h('button.btn.iv-ask', { type: 'button', onclick: () => {
    if (!ctx.act({ type: 'askFollowUp' }).ok) return;
    ctx.sfx('click');
    ask.hidden = true;
    sync();
  } }, 'Can you be more specific?');
  ask.hidden = true;
  const skip = h('button.btn.small.iv-skip', { type: 'button', onclick: () => { showAll(); } }, 'Skip ahead');
  skip.hidden = true;
  const el = h('div.iv', null, feed, h('div.iv-side', null, talk, h('div.row.iv-acts', null, ask, h('span.spacer'), skip)));

  let shown = 0;
  let timer = 0;
  const asked = () => !!ctx.getState().flags?.aiWatch?.asked;

  function addLine(l) {
    const mine = l.who === 'Interviewer';
    const line = h(`div.iv-line${mine ? '.bot' : ''}`, null, h('b.iv-who', { text: l.who }), h('span.iv-text', { text: l.text }));
    talk.append(line);
    talk.scrollTop = talk.scrollHeight;
    shown += 1;
    if (!mine) ctx.sfx('blip');
  }
  function showAll() { pClear(timer); timer = 0; while (shown < lines().length) addLine(lines()[shown]); settle(); }
  function settle() {
    const waiting = shown < lines().length;
    skip.hidden = !waiting;
    // The follow-up opens once the tape has played, and goes once it is used.
    ask.hidden = waiting || asked();
  }
  function step() {
    timer = 0;
    if (shown < lines().length) addLine(lines()[shown]);
    settle();
    if (shown < lines().length) timer = pAfter(LINE_MS, step);
  }
  // Called every frame: only lines the sim added since (the follow-up's answer) cost any work.
  function sync() { settle(); if (shown < lines().length && !timer) timer = pAfter(shown === 0 ? 400 : LINE_MS, step); }
  sync();

  return {
    el, sync, showAll,
    dispose() { pClear(timer); timer = 0; try { handle?.dispose?.(); } catch { /* the feed is gone with the card */ } },
  };
}
