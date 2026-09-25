import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision } from '../../src/sim/events.js';
import { propsSystem } from '../../src/sim/props.js';
import { ladderSystem } from '../../src/sim/ladder.js';
import { EVENTS } from '../../src/data/events.js';
import { game, addStaff, addProduct, passOfficeGates } from './helpers.js';

// Prop ids art has shipped; the sim uses no others.
const SHIPPED = new Set(['picture_pingpong', 'picture_pingpong_ball', 'brochure', 'photo_lake', 'invoice', 'old_sign', 'sign_rival_copied',
  'envelope', 'envelope_thick', 'binder', 'gift_cards', 'sticky_notes', 'photos_laminated',
  'pizza_boxes', 'smoothie', 'curtain', 'sledgehammer', 'tape_measure', 'pet_carrier', 'cable_chewed', 'visitor_chair',
  'screens_red', 'screens_skull', 'smoke_puff', 'rack_hot']);

const raise = (s, id, subjectId = null) => { delete s.flags.lastDecisionWeek; s.pendingDecision = null; raiseDecision(makeCtx(s), id, subjectId); };
const choose = (s, label) => dispatch(s, { type: 'resolveDecision', choice: EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.label === label) });

describe('issue #228: staged props, batch one', () => {
  it('every staged or left prop is one art has shipped', () => {
    for (const e of Object.values(EVENTS)) {
      if (e.stage) expect(SHIPPED.has(e.stage.prop), e.id).toBe(true);
      for (const c of e.choices ?? []) if (c.leaves) expect(SHIPPED.has(c.leaves.prop), `${e.id}: ${c.label}`).toBe(true);
    }
  });

  it('a desk prop sits at the subject\'s seat; a wall prop on the back wall', () => {
    const s = passOfficeGates(game(1));
    const p = addStaff(s, 'engineer', 'junior');
    raise(s, 'junior_overwhelmed', p.id);
    expect(s.pendingDecision.stage).toMatchObject({ prop: 'sticky_notes', anchor: 'subjectDesk' });
    expect(Number.isInteger(s.pendingDecision.stage.x)).toBe(true);
    raise(s, 'team_offsite');
    expect(s.pendingDecision.stage).toMatchObject({ prop: 'brochure', anchor: 'wall', y: 0 });
  });

  it('the offsite photo stays a year; the reunion sign half a year', () => {
    const s = passOfficeGates(game(2));
    s.cash = 1e6;
    raise(s, 'team_offsite');
    choose(s, 'Book the cabin');
    expect(s.office.props.map((x) => x.prop)).toEqual(['photo_lake']);
    s.week += 51;
    propsSystem(makeCtx(s));
    expect(s.office.props).toHaveLength(1);
    s.week += 1;
    propsSystem(makeCtx(s));
    expect(s.office.props).toEqual([]);
  });

  it('the "days since they copied us" sign comes down once the rival is gone', () => {
    const s = passOfficeGates(game(3));
    addProduct(s);
    s.rival = { name: 'Syncopate', founderName: 'Pat Vance', logoColor: '#fff', categoryId: 'email', strength: 40, status: 'rising' };
    raise(s, 'rival_jab');
    choose(s, 'Rise above it');
    expect(s.office.props.map((x) => x.prop)).toEqual(['sign_rival_copied']);
    propsSystem(makeCtx(s));
    expect(s.office.props).toHaveLength(1);
    s.rival.status = 'dead';
    ladderSystem(makeCtx(s));
    propsSystem(makeCtx(s));
    expect(s.office.props).toEqual([]);
  });

  it('screens overlays have no tile; the moonshot curtain stays until the moonshot is done', async () => {
    const { moonshotEffect } = await import('../../src/sim/moonshot.js');
    const s = passOfficeGates(game(4));
    s.cash = 1e8;
    raise(s, 'ransomware');
    expect(s.pendingDecision.stage).toMatchObject({ prop: 'screens_skull', anchor: 'screens', x: null, y: null });
    raise(s, 'moonshot_pitch');
    choose(s, 'Fund the moonshot');
    expect(s.office.props.map((x) => x.prop)).toEqual(['curtain']);
    propsSystem(makeCtx(s));
    expect(s.office.props).toHaveLength(1);
    moonshotEffect(makeCtx(s), 'stop');
    propsSystem(makeCtx(s));
    expect(s.office.props).toEqual([]);
  });

  it('a hackathon leaves pizza boxes for two weeks', () => {
    const s = passOfficeGates(game(5));
    s.cash = 1e6;
    raise(s, 'hackathon');
    choose(s, 'Host it');
    expect(s.office.props.map((x) => x.prop)).toEqual(['pizza_boxes']);
    s.week += 2;
    propsSystem(makeCtx(s));
    expect(s.office.props).toEqual([]);
  });
});
