import { expect, it } from 'vitest';
import { gateWords } from './officeGate.js';
import { OFFICE_STAGES } from '../data/office.js';
import { officeGateReason } from '../sim/products.js';

const floor = OFFICE_STAGES[1];
const game = (o) => ({ week: 104, cash: 0, stats: { launches: 9 }, staff: new Array(9).fill({}), brand: 50, products: [{ id: 'a', mrr: 210000 }], ...o });
const words = (s) => gateWords(s, floor, officeGateReason(s, floor));

it('says what is met and what is left when savings would count later', () => {
  expect(words(game({ cash: 709000 }))).toBe('Needs $250K MRR (you have $210K). Your $709K in the bank counts from 2021 (in 31 weeks).');
});

it('lists both ways in when neither is met yet', () => {
  expect(words(game({ cash: 300000 }))).toBe('Needs $250K MRR (you have $210K), or $450K in the bank from 2021 (you have $300K).');
});

it('after savings count, says how far each way is', () => {
  expect(words(game({ week: 140, cash: 300000 }))).toBe('Needs $250K MRR (you have $210K), or $450K in the bank (you have $300K).');
});

it('words an era start by company week', () => {
  expect(words(game({ cash: 709000, founding: { startEra: 'agents' } }))).toContain('counts from company week 135 (in 31 weeks)');
});

it('leaves open gates and every other reason as the sim worded them', () => {
  expect(words(game({ products: [{ id: 'a', mrr: 300000 }] }))).toBeNull();
  const few = game({ staff: [] });
  expect(words(few)).toBe(officeGateReason(few, floor));
  expect(gateWords(few, floor, null)).toBeNull();
});
