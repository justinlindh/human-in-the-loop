import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/state.js';
import { B } from '../../src/sim/balance.js';
import { eraLines, eraOnlyAllowsText } from '../../src/sim/eras.js';
import { advice } from '../../src/sim/advisors.js';
import { buildEpilogue } from '../../src/sim/endgame.js';
import { dispatch } from '../../src/sim/actions.js';
import { postOptions } from '../../src/sim/posts.js';
import { safe, visibleStrings } from './_period.js';
import { CHATTER } from '../../src/data/chatter.js';
import { STANDUP } from '../../src/data/standup.js';
import { POSTS } from '../../src/data/posts.js';
import { RESEARCH } from '../../src/data/research.js';
import { TRAITS } from '../../src/data/traits.js';
import { TRENDS } from '../../src/data/trends.js';
import { CHANNELS } from '../../src/data/channels.js';
import { EVENTS } from '../../src/data/events.js';
import { OFFICE_NODS } from '../../src/data/office-nods.js';
import { SV_NODS } from '../../src/data/sv-nods.js';
import { PERIOD_MARKETS, periodChannel, DOTCOM_NAMES } from '../../src/data/early-eras.js';
import { periodChatter, periodCopy, periodPost, periodText, PERIOD_EXCLUDED, PERIOD_COPY } from '../../src/data/period-content.js';
import { productName, WEB2_NAMES } from '../../src/data/product-names.js';
import { pressReviews } from '../../src/sim/projects.js';
import { generateStaff } from '../../src/sim/staff.js';
import { eventFitsEra, raiseDecision } from '../../src/sim/events.js';
import { makeCtx } from '../../src/sim/registry.js';
import { TALK, SAY_SOLO, RUNNING_JOKES } from '../../src/data/talk.js';
import { PROMPTS } from '../../src/data/prompts.js';
import { periodAllows } from '../../src/data/period-content.js';

// Seeded play through each early era is checked in period-content.full.test.js.
const stringPools = (obj) => Object.values(obj).filter((a) => Array.isArray(a) && a.every((v) => typeof v === 'string'));

describe('historical content boundaries', () => {
  it('uses period wording for wireless networks and code review in dot-com', () => {
    const s = createGame({ seed: 17, startEra: 'dotcom' });
    expect(periodText(s, 'The wifi works best if you do not look directly at it.')).toBe('The network works best if you do not look directly at it.');
    expect(eraLines(s, PROMPTS.find((p) => p.id === 'junior_pr').options[1].reply)).toEqual([
      'Post it in #general. This team loves a small patch.',
    ]);
  });
  it('keeps the ChatGBT strategy outcome before the agent era', () => {
    const s = createGame({ seed: 17, startEra: 'chatgbt' });
    expect(raiseDecision(makeCtx(s), 'era_chatgbt')).toBe(true);
    const result = dispatch(s, { type: 'resolveDecision', choice: 2 });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.events)).not.toMatch(/\bagents?\b/i);
    expect(s.era.id).toBe('chatgbt');
  });
  it.each(['preinternet', 'dotcom', 'web2', 'classic', 'chatgbt'])('has safe nonempty fallbacks in %s', (startEra) => {
    const s = createGame({ seed: 11, startEra });
    for (const pool of [[], ['The agents approved the agentic roadmap.'], ['AI agents use ChatGBT models.']]) {
      const lines = eraLines(s, pool);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l) => eraOnlyAllowsText(s, l))).toBe(true);
    }
  });
  it.each(['preinternet', 'dotcom', 'web2'])('keeps %s advice, posts and endings in period', (startEra) => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame({ seed, startEra });
      expect(JSON.stringify(advice(s))).not.toMatch(/\b(agent|agents|AI|podcast)\b/i);
      const ending = buildEpilogue(s, { won: false, reason: 'runway' });
      expect(ending[0]).toMatch(/money ran out/i);
      expect(ending.join(' ')).not.toMatch(/Yak|livestream|pull requests|memes/i);
      expect(postOptions(s).find((p) => p.id === 'meme').label).toBe('Forward a joke');
      const result = dispatch(s, { type: 'postMessage', id: 'meme' });
      expect(result.ok).toBe(true);
      expect(s.chatLog.at(-1).image ?? null).toBeNull();
      expect(s.chatLog.at(-1).text).not.toMatch(/laptop|tabs I have open|merging on a Friday/i);
    }
  });
  it.each(['preinternet', 'dotcom', 'web2'])('audits every eligible %s content pool and fallback', (startEra) => {
    const s = createGame({ seed: 17, startEra });
    for (const [key, lines] of Object.entries(CHATTER)) {
      const pool = eraLines(s, periodChatter(s, key, lines));
      expect(pool.length, key).toBeGreaterThan(0);
      pool.forEach((text) => safe(text, `chatter ${key}`));
    }
    for (const pool of stringPools(STANDUP)) eraLines(s, pool).forEach((text) => safe(text, 'standup'));
    for (const pool of Object.values(SAY_SOLO)) {
      const lines = pool.map((text) => periodText(s, text)).filter((text) => eraOnlyAllowsText(s, text));
      expect(lines.length).toBeGreaterThan(0);
      lines.forEach((text) => {
        safe(text, 'solo talk');
        if (startEra === 'dotcom') expect(text).not.toMatch(/wi-?fi/i);
      });
    }
    for (const exchange of TALK.filter((t) => (!t.eras || t.eras.includes(startEra)) && periodAllows(s, 'talk', t.id))) {
      for (const [, pool] of exchange.turns) pool.map((text) => periodText(s, text))
        .filter((text) => eraOnlyAllowsText(s, text)).forEach((text) => safe(text, exchange.id));
    }
    for (const joke of RUNNING_JOKES.filter((j) => !j.eras || j.eras.includes(startEra))) {
      for (const beat of joke.beats) for (const [, pool] of beat) pool.map((text) => periodText(s, text))
        .filter((text) => eraOnlyAllowsText(s, text)).forEach((text) => safe(text, joke.id));
    }
    for (const prompt of PROMPTS.filter((p) => !p.eras || p.eras.includes(startEra))) {
      for (const pool of [prompt.text, prompt.ignored.line, ...prompt.options.flatMap((o) => [o.reply, o.answer])]) {
        const lines = eraLines(s, pool);
        expect(lines.length).toBeGreaterThan(0);
        lines.forEach((text) => safe(text, prompt.id));
      }
    }
    for (const original of POSTS) {
      const p = periodPost(s, original);
      safe(`${p.label} ${p.hint}`, p.id);
      for (const pool of [p.text, ...(p.vague ? [p.vague] : []), ...Object.values(p.replies)]) {
        const fit = eraLines(s, pool); expect(fit.length).toBeGreaterThan(0);
        fit.forEach((text) => safe(text, p.id));
      }
    }
    const channels = Object.values(CHANNELS).map((c) => periodChannel(startEra, c)).filter(Boolean);
    expect(channels.length).toBeGreaterThan(0);
    channels.forEach((c) => safe(`${c.name} ${c.desc}`, c.id));
    for (const id of PERIOD_MARKETS[startEra].trends) {
      const t = periodCopy(s, 'trends', TRENDS[id]); safe(`${t.name} ${t.text}`, id);
    }
    const research = Object.values(RESEARCH).filter((r) => !r.ai).map((r) => periodCopy(s, 'research', r));
    expect(research.length).toBeGreaterThan(0);
    research.forEach((r) => safe(`${r.name} ${r.desc}`, r.id));
    expect(research.find((r) => r.id === 'squish')).toEqual(RESEARCH.squish);
    const generated = new Set();
    for (let n = 0; n < 100; n++) {
      const name = productName('notes', (count) => n % count, n, startEra);
      expect(name.length).toBeLessThanOrEqual(B.productNameMax);
      safe(name, 'product name'); generated.add(name);
      for (const id of generateStaff(s, { role: 'engineer', seniority: 'mid' }).traits) {
        const t = periodCopy(s, 'traits', TRAITS[id]); safe(`${t.name} ${t.desc}`, id);
      }
      for (const r of pressReviews(s, n % 10 + 1)) safe(`${r.outlet}: ${r.quote}`, 'press');
    }
    expect(generated.size).toBeGreaterThan(3);
    const events = Object.values(EVENTS).filter((e) => eventFitsEra(s, e));
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) visibleStrings(e).forEach((text) => safe(periodText(s, text), e.id));
    for (const id of PERIOD_EXCLUDED.events) expect(eventFitsEra(s, EVENTS[id]), id).toBe(false);
    for (const id of ['ransomware', 'supply_chain', 'tabs_or_spaces', 'no_show']) {
      s.pendingDecision = null; delete s.flags.lastDecisionWeek;
      expect(raiseDecision(makeCtx(s), id, s.staff[0].id)).toBe(true);
      safe(JSON.stringify(s.pendingDecision), id);
    }
  });
  it('retains every shipped nod and every modern copy object', () => {
    for (const e of [...OFFICE_NODS, ...SV_NODS]) expect(EVENTS[e.id]).toBe(e);
    for (const e of [...OFFICE_NODS, ...SV_NODS]) {
      const eras = e.eras ?? ['dotcom', 'web2', 'classic', 'chatgbt', 'agents', 'consolidation', 'plateau'];
      for (const era of eras) expect(eventFitsEra({ era: { id: era } }, e), `${e.id} in ${era}`).toBe(true);
    }
    expect(SV_NODS.find((e) => e.id === 'oat_milk').eras).toEqual(['agents', 'consolidation', 'plateau']);
    expect(SV_NODS.find((e) => e.id === 'is_it_kielbasa').eras).toEqual(['chatgbt', 'agents']);
    for (const era of ['classic', 'chatgbt', 'agents', 'consolidation', 'plateau']) {
      const s = { era: { id: era } };
      for (const [pool, rows] of Object.entries(PERIOD_COPY.dotcom)) for (const id of Object.keys(rows)) {
        const original = { id, name: 'Original', desc: 'Original words' };
        expect(periodCopy(s, pool, original)).toBe(original);
      }
      for (const p of POSTS) expect(periodPost(s, p)).toBe(p);
    }
    expect(WEB2_NAMES).not.toEqual(DOTCOM_NAMES);
  });
});
