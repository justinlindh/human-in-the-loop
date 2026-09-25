import { describe, it, expect } from 'vitest';
import { promptSig, promptsSig } from './chatPrompts.js';

const prompt = () => ({ id: 'cp1', chatId: 'c1', options: [{ label: 'A', hint: 'x', available: true }, { label: 'B', hint: 'y', available: false, reason: 'Needs $8K' }], resolved: null });

describe('reply prompt signatures', () => {
  it('change when the sim resolves a prompt in place on the same array', () => {
    const list = [prompt()];
    const before = promptsSig(list, 10);
    list[0].resolved = { choice: 0, week: 10, replyId: 'c2' };
    expect(promptsSig(list, 10)).not.toBe(before);
    expect(promptSig(list[0])).toContain('r0');
  });

  it('change when an ignored prompt expires, a reply becomes available, or the week moves', () => {
    const p = prompt();
    const base = promptsSig([p], 10);
    expect(promptsSig([p], 11)).not.toBe(base);
    const q = prompt(); q.options[1].available = true;
    expect(promptSig(q)).not.toBe(promptSig(p));
    const r = prompt(); r.resolved = { choice: null, week: 12, replyId: null };
    expect(promptSig(r)).toContain('rnull');
  });

  it('stay the same when nothing shown changes', () => {
    expect(promptsSig([prompt()], 10)).toBe(promptsSig([prompt()], 10));
  });
});
