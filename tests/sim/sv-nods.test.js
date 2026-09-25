import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision } from '../../src/sim/events.js';
import { stageTile } from '../../src/sim/props.js';
import { processScheduled } from '../../src/sim/effects.js';
import { scoreRun } from '../../src/sim/endgame.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { SV_NODS } from '../../src/data/sv-nods.js';
import { RESEARCH, RESEARCH_ANNOUNCE } from '../../src/data/research.js';
import { RUNNING_JOKES } from '../../src/data/talk.js';
import { classicGame, game, addStaff, addProduct } from './helpers.js';

const N = B.svNods;
const raise = (s, id, subjectId = null) => { delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek; s.pendingDecision = null; raiseDecision(makeCtx(s), id, subjectId); };
const choose = (s, label) => dispatch(s, { type: 'resolveDecision', choice: EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.label === label) });

describe('issue #338: nods to the valley', () => {
  it('the five decisions are in EVENTS and fire at most once a run; tabs or spaces only comes from its joke', () => {
    expect(SV_NODS.map((e) => e.id).sort()).toEqual(['incubator_house', 'is_it_kielbasa', 'oat_milk', 'tabs_or_spaces', 'the_box']);
    for (const e of SV_NODS) {
      expect(EVENTS[e.id]).toBe(e);
      expect(e.cooldownWeeks).toBeGreaterThanOrEqual(10000);
    }
    expect(EVENTS.tabs_or_spaces.random).toBe(false);
    expect(RUNNING_JOKES.find((j) => j.id === 'joke_tabs_spaces').then).toBe('tabs_or_spaces');
  });

  it('the incubator house is an early garage offer; moving in takes a cut of the final score', () => {
    const s = classicGame(1);
    s.week = N.incubatorFrom;
    expect(EVENTS.incubator_house.when(s)).toBe(true);
    s.week = N.incubatorUntil + 1;
    expect(EVENTS.incubator_house.when(s)).toBe(false);
    s.week = N.incubatorFrom;
    const before = scoreRun(s).score;
    raise(s, 'incubator_house');
    expect(s.pendingDecision.stage.prop).toBe('house_sign');
    const cash = s.cash;
    choose(s, 'Move in');
    expect(s.cash).toBe(cash + N.incubatorCash);
    expect(s.flags.incubatorCut).toBe(N.incubatorCut);
    s.cash = cash;
    expect(scoreRun(s).score).toBe(Math.round(before * (1 - N.incubatorCut)));
  });

  it("The Box needs an active rival; building one leaves a cube on the subject's desk", () => {
    const s = game(2);
    s.week = 400;
    expect(EVENTS.the_box.when(s)).toBe(false);
    s.rival = { name: 'Rivalry', status: 'rising', strength: 50, categoryId: 'email', logoColor: '#fff', founderName: 'Pat Doe' };
    expect(EVENTS.the_box.when(s)).toBe(true);
    const senior = addStaff(s, 'engineer', 'senior');
    s.cash = 1e6;
    addProduct(s);
    raise(s, 'the_box', senior.id);
    choose(s, 'Build our own box');
    const seat = stageTile(s, 'subjectDesk', senior.id);
    expect(s.office.props.at(-1)).toMatchObject({ prop: 'box_cube', until: { weeks: N.boxCubeWeeks }, x: seat.x, y: seat.y });
  });

  it('the oat milk needs ops agents and a team; keeping it lingers in the lobby', () => {
    const s = game(3);
    for (let i = 0; i < N.oatStaff; i++) addStaff(s, 'engineer', 'mid');
    s.automation.ops.level = 0;
    expect(EVENTS.oat_milk.when(s)).toBe(false);
    s.automation.ops.level = N.oatOpsLevel;
    expect(EVENTS.oat_milk.when(s)).toBe(true);
    raise(s, 'oat_milk');
    choose(s, 'Keep it');
    expect(s.office.props.at(-1)).toMatchObject({ prop: 'oat_milk' });
    expect(s.modifiers.some((m) => m.key === 'staminaDrain' && m.value < 0)).toBe(true);
  });

  it('the Box recall line names the rival once it is posted', () => {
    const s = game(4);
    s.week = 400;
    s.rival = { name: 'Rivalry', status: 'rising', strength: 50, categoryId: 'email', logoColor: '#fff', founderName: 'Pat Doe' };
    raise(s, 'the_box', addStaff(s, 'engineer', 'senior').id);
    choose(s, 'Stay software');
    s.week += N.boxRecallWeeks;
    const ctx = makeCtx(s);
    processScheduled(ctx);
    const line = ctx.events.find((e) => e.type === 'chat');
    expect(line.text).toContain('Rivalry is recalling The Box');
  });

  it('Squish is a research node with its own launch line', () => {
    expect(RESEARCH.squish).toMatchObject({ requires: 'ci_cd' });
    expect(RESEARCH_ANNOUNCE.squish).toContain('Squish Score of 5.2');
  });
});
