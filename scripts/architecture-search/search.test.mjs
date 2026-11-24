import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configurationKey, neighbors, propose } from './search.mjs';

const incumbent = { box: 'lite', idle: 0 };
const domains = { box: ['lite', 'basic', 'standard'], idle: [0, 30] };

test('neighbors change one architectural parameter and respect compatibility', () => {
  const output = neighbors(incumbent, domains, (candidate) => candidate.box !== 'standard');
  assert.equal(output.length, 2);
  assert.ok(
    output.every(
      (candidate) => Object.keys(incumbent).filter((key) => incumbent[key] !== candidate[key]).length === 1,
    ),
  );
  assert.deepEqual(incumbent, { box: 'lite', idle: 0 });
  assert.throws(() => neighbors({ box: 'unknown', idle: 0 }, domains));
});

test('proposals are deterministic, bounded and do not retry measured configurations', () => {
  const options = { incumbent, domains, attempted: [{ box: 'basic', idle: 0 }], generation: 0, maximum: 2 };
  assert.deepEqual(propose(options), propose(options));
  assert.equal(propose(options).length, 2);
  assert.ok(propose(options).every((candidate) => candidate.box !== 'basic'));
  assert.equal(configurationKey(incumbent), configurationKey({ idle: 0, box: 'lite' }));
});

test('every third generation prioritizes a distant architectural combination', () => {
  const distant = { box: 'standard', idle: 30 };
  assert.deepEqual(
    propose({ incumbent, domains, attempted: [], generation: 2, exploratory: [distant], maximum: 1 }),
    [distant],
  );
  const attempted = [...neighbors(incumbent, domains), distant];
  assert.deepEqual(propose({ incumbent, domains, attempted, generation: 2, exploratory: [distant] }), []);
});
