import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = process.argv[2];
const records = {};
for (const label of ['before', 'after']) {
  const index = JSON.parse(fs.readFileSync(`${root}/${label}/index.json`));
  const item = Object.values(index.items)[0];
  assert.equal(item.errors, 0);
  const outage = item.marks.find(m => m.label === 'standup producer');
  const ordinary = item.marks.find(m => m.label === 'ordinary producer');
  const arrivals = item.marks.filter(m => m.label.startsWith('shown '));
  assert.ok(outage.posts.length > 0);
  assert.ok(ordinary.posts.length > 0);
  assert.equal(item.marks.find(m => m.label === 'outage resolved').t, 1);
  assert.equal(arrivals[0].t, 0.033);
  const stale = arrivals.filter(m => outage.posts.some(p => m.label === `shown ${p.id}`));
  const routine = arrivals.filter(m => ordinary.posts.some(p => m.label === `shown ${p.id}`));
  if (label === 'before') {
    assert.equal(stale.length, 1);
    assert.equal(stale[0].t, 6.033);
    assert.equal(stale[0].outage, false);
  } else {
    assert.equal(stale.length, 0);
    assert.equal(routine.length, 1);
    assert.equal(routine[0].t, 6.033);
    assert.equal(routine[0].outage, false);
    for (const post of outage.posts) assert.equal(outage.contexts[post.id], 1);
    for (const post of ordinary.posts) assert.equal(ordinary.contexts[post.id], undefined);
  }
  records[label] = { build: item.build, marks: item.marks, errors: item.errors };
  console.log(`PASS ${label}: ${stale.length} stale outage arrivals, ${routine.length} ordinary async arrivals, zero browser errors`);
}
assert.deepEqual(records.before.marks.find(m => m.label === 'standup producer').posts, records.after.marks.find(m => m.label === 'standup producer').posts);
assert.deepEqual(records.before.marks.find(m => m.label === 'ordinary producer').posts, records.after.marks.find(m => m.label === 'ordinary producer').posts);
fs.writeFileSync(`${root}/repair-traces.json`, JSON.stringify(records, null, 2));
