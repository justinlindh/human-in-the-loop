import { expect, it } from 'vitest';
import { gateWords } from './officeGate.js';
import { OFFICE_STAGES } from '../data/office.js';
import { officeGateReason } from '../sim/products.js';

const floor = OFFICE_STAGES[1];
const game = (o) => ({ week: 104, cash: 0, stats: { launches: 9 }, staff: new Array(9).fill({}), brand: 50, products: [{ id: 'a', mrr: 210000 }], ...o });
const words = (s) => gateWords(s, floor, officeGateReason(s, floor));

it('says what is met and what is left when savings would count later', () => {
  expect(words(game({ cash: 709000 }))).toBe('Needs $250K MRR (you have $210K). Your $709K in the bank counts from 2021 · Q3 · Wk 32 (in 31 weeks).');
});

it('names the week as the HUD does and counts weeks from the company clock', () => {
  expect(words(game({ week: 123, cash: 709000 }))).toContain('counts from 2021 · Q3 · Wk 32 (in 12 weeks)');
  expect(words(game({ week: 134, cash: 709000 }))).toContain('(in 1 week)');
});

it('inside the target quarter but before its week, the line names the week, not the quarter alone', () => {
  // Company week 130 is 2021 · Q3 · Wk 27 on the HUD; the savings route opens at Wk 32.
  expect(words(game({ week: 130, cash: 709000 }))).toContain('counts from 2021 · Q3 · Wk 32 (in 5 weeks)');
});

it('words the week gate by the HUD date and weeks left', () => {
  expect(words(game({ week: 80 }))).toBe('Available from 2021 · Q1 · Wk 1 (in 24 weeks).');
});

it('lists both ways in when neither is met yet', () => {
  expect(words(game({ cash: 300000 }))).toBe('Needs $250K MRR (you have $210K), or $450K in the bank from 2021 · Q3 · Wk 32 (you have $300K).');
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
