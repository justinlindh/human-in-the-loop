import { describe, it, expect } from 'vitest';
import { orderGoals } from './goalOrder.js';
import { productSubtitle } from './content.js';

const goals = [
  { id: 'web2', requiredChapter: 'web2', startEras: ['web2', 'dotcom'] },
  { id: 'dot', startEras: ['dotcom'] },
  { id: 'base' },
];
const chapters = [{ id: 'dotcom', weeks: 100 }, { id: 'web2', weeks: 100 }];
const ids = (s) => orderGoals(goals, s).map((g) => g.id);

describe('orderGoals', () => {
  it('keeps the data order without early chapters', () => {
    expect(ids({ week: 5, founding: {} })).toEqual(['web2', 'dot', 'base']);
  });
  it('lists the current chapter first and later chapters last', () => {
    expect(ids({ week: 5, founding: { earlyChapters: chapters } })).toEqual(['dot', 'base', 'web2']);
  });
  it('moves on when the next chapter starts', () => {
    expect(ids({ week: 150, founding: { earlyChapters: chapters } })).toEqual(['web2', 'dot', 'base']);
  });
});

describe('productSubtitle', () => {
  it('leaves out a missing model or angle', () => {
    const t = productSubtitle({ category: 'crm', angle: null, model: null });
    expect(t).not.toMatch(/null|undefined/);
  });
});
