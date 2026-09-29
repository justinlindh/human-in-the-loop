#!/usr/bin/env node
import assert from 'node:assert/strict';
import { openScene, sampleMany } from './index.mjs';
import { resolveState } from './state.mjs';
import { createHash } from 'node:crypto';

const scenes = [];
let passed = 0;
const pass = message => { passed++; console.log(`PASS ${message}`); };
try {
  const a = await openScene(), b = await openScene(); scenes.push(a, b);
  const plain = await a.sample(180);
  for (const frame of [0, 30, 60, 90]) await b.sample(frame, { facts: ['visibility', 'intersections', 'occupancy', 'projections'] });
  const observed = await b.sample(180);
  assert.equal(JSON.stringify(plain.result), JSON.stringify(observed.result));
  pass('measurement frequency and fact selection leave the trajectory unchanged');
  const people = plain.result.objects.filter(o => o.kind === 'person');
  assert.equal(people.length, 10);
  for (const person of people) assert.equal(Object.keys(person.person.joints).length, 10);
  pass('all floor staff expose the ten joints from the character API');
  const ids = plain.result.objects.flatMap(o => [o.id, ...o.parts.map(p => p.id)]);
  assert.equal(new Set(ids).size, ids.length);
  pass('object and mesh-part ids are unique');
  await assert.rejects(b.sample(1), /rewind/);
  await assert.rejects(b.sample(180, { who: ['missing-person'] }), /unknown subject/);
  pass('rewind and unknown subjects fail explicitly');
  const serial = await sampleMany([{ mock: 'floor', frame: 30 }, { mock: 'garage', frame: 30 }], { jobs: 1 });
  const parallel = await sampleMany([{ mock: 'floor', frame: 30 }, { mock: 'garage', frame: 30 }], { jobs: 2 });
  assert.deepEqual(serial.map(r => r.result), parallel.map(r => r.result));
  pass('one-worker and two-worker results are byte-identical in input order');
  const saved = await resolveState({ seed: 1, week: 112 });
  assert.equal(saved.week, 112);
  assert.ok(saved.staff.length > 0);
  pass('seed/week uses the simulation and balanced bot');
  await a.close();
  await assert.rejects(a.sample(181), /closed/);
  pass('closed scenes reject work');
  console.log(JSON.stringify({ passed, frame180Sha256: createHash('sha256').update(JSON.stringify(plain.result)).digest('hex') }));
} finally { await Promise.all(scenes.map(scene => scene.close())); }
