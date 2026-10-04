import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sensitivity, formatSweep } from '../../blender/checks/pose-matrix-sweep.js';
import { parseMatrix, cellsOf, parseRule, judgeCell, margin, worstOf, formatMatrix, valueOf, tally, tallyText, runMatrix, PRESETS, guideOf } from '../../blender/checks/pose-matrix.js';

const POSE = resolve(__dirname, '../../blender/checks/pose.mjs');
const run = (...args) => spawnSync(process.execPath, [POSE, ...args], { encoding: 'utf8', timeout: 180000 });

const frame = (t, cover, faceCam = 10, phase = 'gesture') => ({ t, phase, faceCam, contact: { hand0Head: 0.1, hand1Head: 0.3 }, cover: { coverHandEyeNear: cover } });

describe('pose matrix parsing', () => {
  it('plays the hand the game would at each view unless a side axis says otherwise', () => {
    const sides = (spec) => cellsOf(parseMatrix(`postures=stand,builds=1,rig=on${spec}`)).map((c) => c.side);
    expect(sides('')).toEqual([1, 1, 1, -1]);
    expect(sides(',side=-1')).toEqual([-1, -1, -1, -1]);
    expect(sides(',side=all')).toEqual([1, 1, 1, 1, -1, -1, -1, -1]);
    expect(() => parseMatrix('side=2')).toThrow(/side/);
  });

  it('defaults the slap to the side-on views and one posture, and lets a view list override', () => {
    expect(cellsOf(parseMatrix('', 'slap'))).toHaveLength(2 * 1 * 3 * 2);
    expect(parseMatrix('views=1,3', 'slap').views).toEqual([1, 3]);
    expect(parseMatrix('postures=lie', 'slap').postures).toEqual(['stand']);
    expect(parseMatrix('', 'slap').cause).toEqual(['unplug']);
    expect(parseMatrix('cause=none,emptyDesk', 'slap').cause).toEqual(['none', 'emptyDesk']);
    expect(parseMatrix('').cause).toEqual(['none']);
    expect(() => parseMatrix('cause=fire', 'slap')).toThrow(/cause/);
  });

  it('expands all and lists, one cell per combination', () => {
    const a = parseMatrix('views=all,postures=stand,sit,builds=0,2,rig=on');
    expect(a).toMatchObject({ views: [0, 1, 2, 3], postures: ['stand', 'sit'], builds: [0, 2], rig: ['on'], accessory: ['none'] });
    expect(cellsOf(a)).toHaveLength(4 * 2 * 2 * 1);
    expect(cellsOf(parseMatrix('')).length).toBe(4 * 3 * 3 * 2);
  });

  it('refuses an unknown axis or value', () => {
    expect(() => parseMatrix('view=0')).toThrow(/axis/);
    expect(() => parseMatrix('postures=fly')).toThrow(/posture/);
    expect(() => parseMatrix('builds=3')).toThrow(/builds/);
    expect(() => parseMatrix('views=4')).toThrow(/views/);
  });

  it('reads rules with a share and an if condition, and adds the measures they name', () => {
    const measures = ['coverHandEyeNear'];
    const r = parseRule('coverHandEyeNear>=0.5@0.7 if faceCam<=80', measures);
    expect(r).toMatchObject({ measure: 'coverHandEyeNear', op: '>=', value: 0.5, share: 0.7, when: { measure: 'faceCam', op: '<=', value: 80 } });
    expect(measures).toContain('faceCam');
    expect(() => parseRule('nonsense', measures)).toThrow(/can't read/);
  });
});

describe('pose matrix judging', () => {
  const measures = ['coverHandEyeNear', 'faceCam'];
  const rule = () => parseRule('coverHandEyeNear>=0.5@0.5 if faceCam<=80', [...measures]);

  it('judges the share of gesture frames that hold and ignores warm-up frames', () => {
    const frames = [frame(0.1, 0, 10, 'warm'), frame(1, 0.9), frame(1.1, 0.8), frame(1.2, 0.1), frame(1.3, 0.2)];
    const c = judgeCell(frames, [rule()], measures);
    expect(c.judged).toBe(4);
    expect(c.verdicts[0]).toMatchObject({ share: 0.5, pass: true });
    expect(c.stat.coverHandEyeNear).toEqual({ min: 0.1, median: 0.8, max: 0.9 });
  });

  it('drops frames the condition rules out, and marks a cell with none left n/a, not passing', () => {
    const turned = [frame(1, 0, 120), frame(1.1, 0, 130)];
    expect(judgeCell(turned, [rule()], measures)).toMatchObject({ pass: true, na: true });
    expect(judgeCell([frame(1, 0.9, 20)], [rule()], measures).na).toBe(false);
    const mixed = [frame(1, 0, 120), frame(1.1, 0.9, 20)];
    expect(judgeCell(mixed, [rule()], measures).verdicts[0].share).toBe(1);
  });

  it('counts pass, fail and n/a cells apart, and prints them', () => {
    const r = rule();
    const cell = (fs) => ({ view: 0, ...judgeCell(fs, [r], measures) });
    const cells = [cell([frame(1, 0.9, 20)]), cell([frame(1, 0, 20)]), cell([frame(1, 0, 130)]), cell([frame(1, 0, 130)])];
    expect(tally(cells)).toEqual({ pass: 1, fail: 1, na: 2, total: 4 });
    expect(tallyText(cells)).toBe('1 pass, 1 fail, 2 n/a (4 cells)');
    const axes = parseMatrix('views=0,1,postures=stand,builds=1,rig=on');
    const two = cellsOf(axes).map((c, i) => ({ ...cells[i + 2], ...c }));
    expect(formatMatrix({ axes, cells: two }, [r], 'g').join('\n')).toMatch(/stand b1 rig on\s+n\/a\s+n\/a/);
  });

  it('reads clearance as the smaller hand-to-head distance', () => {
    expect(valueOf(frame(1, 0), 'clearance')).toBe(0.1);
  });

  it('marks the cell with the lowest share as worst, and breaks ties by how far its best frame is', () => {
    const r = parseRule('coverHandEyeNear>=0.5@0.7', ['coverHandEyeNear']);
    const near = { view: 0, ...judgeCell([frame(1, 0.4), frame(1.1, 0.45)], [r], ['coverHandEyeNear']) };
    const far = { view: 1, ...judgeCell([frame(1, 0), frame(1.1, 0.05)], [r], ['coverHandEyeNear']) };
    const good = { view: 2, ...judgeCell([frame(1, 0.9), frame(1.1, 0.9)], [r], ['coverHandEyeNear']) };
    expect(margin(near)).toBe(margin(far));
    expect(worstOf([good, near, far])).toBe(far);
    expect(margin(good)).toBeGreaterThan(0);
  });

  it('prints one grid per rule, stars failures and names the worst cell', () => {
    const axes = parseMatrix('views=0,1,postures=stand,builds=1,rig=on');
    const r = parseRule('coverHandEyeNear>=0.5@0.7', ['coverHandEyeNear']);
    const cells = cellsOf(axes).map((c) => ({ ...c, ...judgeCell([frame(1, c.view ? 0 : 0.9)], [r], ['coverHandEyeNear']) }));
    const text = formatMatrix({ axes, cells }, [r], 'facepalm').join('\n');
    expect(text).toContain('MATRIX facepalm: 1 pass, 1 fail, 0 n/a (2 cells)');
    expect(text).toMatch(/stand b1 rig on\s+100%\s+0%\*</);
    expect(text).toContain('MATRIX worst cell: stand b1 rig on view 1');
  });
});

describe('pose.mjs --matrix', () => {
  const base = ['--gesture', 'facepalm', '--matrix', 'views=0,postures=stand,builds=1,rig=on', '--measure', 'coverHandEyeNear,faceCam,clearance'];

  it('passes and fails by exit code, and a broken palm fails where the shipped one passes', () => {
    const ok = run(...base, '--expect', 'coverHandEyeNear>=0.5@0.7');
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toContain('MATRIX facepalm: 1 pass, 0 fail, 0 n/a (1 cells)');
    const broken = run(...base, '--expect', 'coverHandEyeNear>=0.5@0.7', '--param', 'PALM_STAND=[-2.75,0.14,0.9,-0.6,0.08]');
    expect(broken.status, broken.stdout + broken.stderr).toBe(1);
    expect(broken.stdout).toContain('MATRIX worst cell: stand b1 rig on view 0');
  });

  it('answers which swept value passes every cell', () => {
    const r = run(...base, '--expect', 'coverHandEyeNear>=0.5@0.7', '--sweep', 'PALM_STAND[2]=0.27,0.9');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/PALM_STAND\[2\]=0\.27\s+1 pass\s+0 fail\s+0 n\/a of 1\s+judged \d+ frames\s+ALL PASS/);
    expect(r.stdout).toMatch(/PALM_STAND\[2\]=0\.9\s+0 pass\s+1 fail\s+0 n\/a of 1\s+judged \d+ frames\s+worst/);
    expect(r.stdout).toContain('SWEEP passing every judged cell: PALM_STAND[2]=0.27');
    const src = readFileSync(resolve(__dirname, '../../src/render/character.js'), 'utf8');
    const now = JSON.parse(/^const PALM_STAND = (\[[^\]]*\]);/m.exec(src)[1])[2];
    expect(r.stdout.split('\n')[0]).toBe(`SWEEP PALM_STAND[2] is ${now} in src/render/character.js`);
  });

  it('shows the preset guide per value, a closeness that moves while every cell fails', () => {
    const cell = (h0, h1) => ({ posture: 'sit', build: 1, rig: 'on', accessory: 'none', view: 0, pass: false, na: false, stat: { hand0Eye: { median: h0 }, hand1Eye: h1 == null ? null : { median: h1 } }, verdicts: [{ rule: 'r', pass: false, share: 0, want: 0.7, frames: 10 }] });
    expect(guideOf([cell(0.2, 0.4), cell(0.5, 0.1), { stat: {} }], PRESETS.facepalm.guide)).toBe(0.15);
    expect(guideOf([{ stat: {} }], PRESETS.facepalm.guide)).toBe(null);
    const axes = parseMatrix('views=0,postures=sit,builds=1,rig=on');
    const rows = [['0.2', 0.16], ['0.3', 0.06]].map(([v, g]) => { const cells = [cell(g, null)]; return { c: [['PALM_SIT[0]', v]], ...tally(cells), judged: 10, worst: worstOf(cells), axes, guide: guideOf(cells, PRESETS.facepalm.guide) }; });
    const { lines } = formatSweep(rows, [{ name: 'PALM_SIT[0]', values: ['0.2', '0.3'] }], PRESETS.facepalm.guide);
    expect(lines[0]).toContain('hand-eye (mean over cells of the median hand0Eye or hand1Eye, lower is closer)');
    expect(lines.find((l) => l.includes('=0.2 '))).toMatch(/judged 10 frames\s+hand-eye 0\.160 m\s+worst/);
    expect(lines.find((l) => l.includes('=0.3 '))).toMatch(/hand-eye 0\.060 m/);
    expect(formatSweep(rows, [{ name: 'PALM_SIT[0]', values: ['0.2', '0.3'] }]).lines.join('\n')).not.toContain('hand-eye');
  });

  it('shows the guide in a real sweep of a preset gesture', () => {
    const r = run('--gesture', 'facepalm', '--matrix', 'views=0,postures=sit,builds=1,rig=on', '--sweep', 'PALM_SIT[0]=-2.1,-2.75');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const g = (v) => Number(new RegExp(`PALM_SIT\\[0\\]=${v}\\s.*hand-eye ([\\d.]+) m`).exec(r.stdout)[1]);
    expect(g('-2.75')).toBeLessThan(g('-2.1'));
  });

  it('prints the constants that tune a preset gesture with their values in source', () => {
    const src = readFileSync(resolve(__dirname, '../../src/render/character.js'), 'utf8');
    const sit = /^const PALM_SIT = (\[[^\]]*\]);/m.exec(src)[1];
    const r = run('--gesture', 'facepalm', '--matrix', 'views=0,postures=sit,builds=1,rig=on');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(`pose: tuned by PALM_SIT = ${sit}, PALM_STAND = `);
    expect(r.stdout).toMatch(/PALM_BUILD_K = \S+, PALM_SHOULDER_REF = \S+ in src\/render\/character\.js \(docs\/toolkit\/pose\/constants-map\.md/);
  });

  // The slap's whole matrix is its smallest (the side-on views, one posture).
  it('reads a bare --matrix before another flag as the whole matrix', () => {
    const r = run('--gesture', 'slap', '--matrix', '--param', 'SLAP_AT=0.5');
    expect(r.stderr).not.toContain('--matrix wants');
    const whole = cellsOf(parseMatrix('', 'slap')).length;
    expect(whole).toBeLessThan(cellsOf(parseMatrix('views=all', 'slap')).length);
    expect(r.stdout).toMatch(new RegExp(`MATRIX slap: \\d+ pass, \\d+ fail, \\d+ n/a \\(${whole} cells\\)`));
  }, 120000);

  it('refuses matrix axes split by spaces, and prints the joined flag', () => {
    const r = run('--gesture', 'facepalm', '--matrix', 'postures=sit', 'builds=0', 'views=1');
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('--matrix postures=sit,builds=0,views=1');
  });

  it('counts n/a cells apart from passes, as the matrix does, and warns when a value judges fewer frames', () => {
    const cell = (pass, na, frames) => ({ posture: 'sit', build: 1, rig: 'on', accessory: 'none', view: 0, pass, na, verdicts: [{ rule: 'r', pass, share: pass ? 1 : 0, want: 0.7, frames }] });
    const row = (v, cells) => ({ c: [['PALM_SIT[2]', v]], cells });
    const axes = parseMatrix('views=0,postures=sit,builds=1,rig=on');
    const summarize = ({ c, cells }) => { const t = tally(cells); return { c, ...t, judged: cells.reduce((a, x) => a + x.verdicts[0].frames, 0), worst: worstOf(cells), axes }; };
    const { lines, code } = formatSweep([
      summarize(row('0.2', [cell(true, false, 40), cell(false, false, 40), cell(true, true, 0)])),
      summarize(row('0.3', [cell(true, false, 10), cell(true, false, 5), cell(true, true, 0)])),
    ], [{ name: 'PALM_SIT[2]', values: ['0.2', '0.3'] }]);
    expect(lines.find((l) => l.includes('=0.2 '))).toMatch(/1 pass\s+1 fail\s+1 n\/a of 3\s+judged 80 frames/);
    expect(lines.find((l) => l.includes('=0.3 '))).toMatch(/2 pass\s+0 fail\s+1 n\/a of 3\s+judged 15 frames\s+no cell fails/);
    expect(lines).toContain('SWEEP warning: PALM_SIT[2]=0.3 judges 15 frames against 80 at PALM_SIT[2]=0.2; its extra passes may come from the frames its rule filters out, not a better pose');
    expect(lines.at(-1)).toBe('SWEEP passing every judged cell: PALM_SIT[2]=0.3');
    expect(code).toBe(0);
  });

  it('uses a gesture\'s own pass rule when given no measure or rule, and says so', () => {
    const r = run('--gesture', 'facepalm', '--matrix', 'views=0,postures=sit,builds=1,rig=on');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(`pose: facepalm's pass rule: --measure ${PRESETS.facepalm.measures.join(',')} --expect '${PRESETS.facepalm.rules[0]}'`);
    expect(r.stdout).toContain(`MATRIX ${PRESETS.facepalm.rules[0]} (share of judged frames`);
  });

  it('refuses a swept name declared in two files before running, and prints the flag that works', () => {
    const r = run(...base, '--sweep', 'SEAT_HIP_Y=0.4,0.5');
    expect(r.status).toBe(2);
    expect(r.stdout).not.toContain('SWEEP');
    expect(r.stderr).toContain("--sweep 'src/render/character.js:SEAT_HIP_Y=0.4,0.5'");
  });

  it('refuses a grid over --max-runs before running anything, and names the run count', () => {
    const r = run(...base, '--expect', 'coverHandEyeNear>=0.5@0.7', '--sweep', 'PALM_STAND[2]=0.27,0.9', '--sweep', 'PALM_STAND[3]=-0.6,-0.5', '--max-runs', '3');
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('SWEEP 4 runs (2 x 2; a repeated --sweep multiplies)');
    expect(r.stderr).toContain('4 runs is over --max-runs 3');
  });

  it('runs a grid in parallel and names the param that moves the pass count', () => {
    const r = run(...base, '--expect', 'coverHandEyeNear>=0.5@0.7', '--sweep', 'PALM_STAND[2]=0.27,0.9', '--sweep', 'PALM_STAND[3]=-0.6,-0.55', '--jobs', '2');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('SWEEP 4 runs');
    expect(r.stdout).toMatch(/SWEEP moves the pass count most: PALM_STAND\[2\] \(/);
  });

  it('ranks swept params by how far the mean pass count moves', () => {
    const row = (a, b, pass) => ({ c: [['A', a], ['B', b]], pass });
    const rows = [row('1', 'x', 0), row('1', 'y', 0), row('2', 'x', 1), row('2', 'y', 1)];
    const s = sensitivity(rows, [{ name: 'B', values: ['x', 'y'] }, { name: 'A', values: ['1', '2'] }]);
    expect(s.map((x) => x.name)).toEqual(['A', 'B']);
    expect(s.map((x) => x.spread)).toEqual([1, 0]);
  });

  it('a sweep killed mid-run removes its temp dir and stops its runs', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'msweep-test-'));
    const dirs = () => readdirSync(tmp).filter((n) => n.startsWith('pose-msweep-'));
    try {
      const values = Array.from({ length: 24 }, (_, i) => (0.2 + i * 0.01).toFixed(2)).join(',');
      const child = spawn(process.execPath, [POSE, ...base, '--expect', 'coverHandEyeNear>=0.5@0.7', '--sweep', `PALM_STAND[2]=${values}`, '--jobs', '2'], { stdio: 'ignore', env: { ...process.env, TMPDIR: tmp } });
      const closed = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
      for (let i = 0; i < 300 && !dirs().length; i++) await new Promise((r) => setTimeout(r, 50));
      expect(dirs().length).toBeGreaterThan(0);
      child.kill('SIGTERM');
      const { code, signal } = await closed;
      expect(code === 143 || signal === 'SIGTERM').toBe(true);
      expect(readdirSync(tmp)).toEqual([]);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 60000);

  it('view 3 plays the game hand, so a standing facepalm passes there and the other hand does not', () => {
    const v3 = ['--gesture', 'facepalm', '--matrix', 'views=3,postures=stand,builds=1,rig=on', '--measure', 'coverHandEyeNear,faceCam', '--expect', 'coverHandEyeNear>=0.5@0.7 if faceCam<=80'];
    expect(run(...v3).status).toBe(0);
    expect(run(...v3.map((a) => (a.startsWith('views') ? `${a},side=1` : a))).status).toBe(1);
  });

  it('a sweep whose every value errors passes nothing and exits non-zero', () => {
    const r = run(...base, '--sweep', 'PALM_STAND[2]=nope1,nope2');
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('error:');
    expect(r.stdout).toContain('SWEEP passing every judged cell: none');
    expect(run(...base, '--sweep', 'NO_SUCH_PARAM.x=0.05,0.12').status).toBe(2);
  });

  it('needs a gesture, and a measure for a gesture with no pass rule of its own', () => {
    expect(run('--matrix', 'views=0', '--measure', 'faceCam').status).toBe(2);
    const r = run('--gesture', 'shrug', '--matrix', 'views=0');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('facepalm and slap have a pass rule');
  });

  it('gives the same cells over several processes as over one, and refuses a bad --jobs', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'matrix-jobs-'));
    try {
      const cells = ['--gesture', 'facepalm', '--matrix', 'views=0,3,postures=stand,sit,builds=1,rig=on', '--measure', 'coverHandEyeNear,faceCam', '--expect', 'coverHandEyeNear>=0.5@0.7 if faceCam<=80'];
      const one = run(...cells, '--jobs', '1', '--rows', '--json', join(tmp, '1.json'));
      const three = run(...cells, '--jobs', '3', '--rows', '--json', join(tmp, '3.json'));
      expect(one.status).toBe(three.status);
      const rows = (r) => r.stdout.split('\n').filter((l) => l.startsWith('CELL '));
      expect(rows(one)).toHaveLength(4);
      expect(rows(three)).toEqual(rows(one));
      expect(readFileSync(join(tmp, '3.json'), 'utf8')).toBe(readFileSync(join(tmp, '1.json'), 'utf8'));
      expect(run(...cells, '--jobs', '0').status).toBe(2);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});

describe('runMatrix slices', () => {
  it('plays only the cells of its slice, in matrix order', async () => {
    const axes = parseMatrix('views=all,postures=stand,builds=0,1,rig=on');
    const played = [];
    const playPose = async (o) => { played.push(`${o.look.build}:${o.yawToCamera}`); return { frames: [frame(1, 1)] }; };
    const all = cellsOf(axes).map((c) => `${c.build}:${c.view * 90}`);
    const { cells } = await runMatrix({ playPose, gesture: 'facepalm', axes, measures: ['coverHandEyeNear'], rules: [], slice: [1, 3] });
    expect(played).toEqual(all.filter((_, i) => i % 3 === 1));
    expect(cells.map((c) => `${c.build}:${c.view * 90}`)).toEqual(played);
  });
});
