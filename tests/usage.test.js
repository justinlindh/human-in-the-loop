import { describe, it, expect } from 'vitest';
import { createTally } from '../scripts/usage-lib.mjs';

const line = (o) => JSON.stringify(o);
const msg = (id, agentName, timestamp, usage) => line({ type: 'assistant', agentName, timestamp, message: { id, usage } });

describe('npm run usage: the per-teammate tally', () => {
  it('counts a streamed message once, sums per teammate, and names the main session lead', () => {
    const t = createTally(new Date('2026-01-01T00:00:00Z'));
    const u = { input_tokens: 2, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 };
    for (const l of [
      msg('a', 'art', '2026-01-01T01:00:00Z', u), msg('a', 'art', '2026-01-01T01:00:00Z', u),
      msg('b', 'art', '2026-01-01T02:00:00Z', u), msg('c', undefined, '2026-01-01T02:00:00Z', u),
      line({ type: 'user', message: { usage: u } }), 'not json',
    ]) t.add(l);
    expect(t.rows()).toEqual([
      { who: 'art', messages: 2, output: 10, freshInput: 24, cacheRead: 200 },
      { who: 'lead', messages: 1, output: 5, freshInput: 12, cacheRead: 100 },
    ]);
  });

  it('leaves out messages before the window', () => {
    const t = createTally(new Date('2026-01-01T05:00:00Z'));
    t.add(msg('x', 'sim', '2026-01-01T04:59:59Z', { output_tokens: 7 }));
    t.add(msg('y', 'sim', '2026-01-01T05:00:01Z', { output_tokens: 3 }));
    expect(t.rows()).toEqual([{ who: 'sim', messages: 1, output: 3, freshInput: 0, cacheRead: 0 }]);
  });
});
