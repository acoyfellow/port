import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classifyCommand, createTierTracker } from '../../shapes/tiered-fleet/src/tiered-core.ts';

test('no comments and no type casts', () => {
  const src = readFileSync(new URL('../../shapes/tiered-fleet/src/tiered-core.ts', import.meta.url), 'utf8');
  const lineComment = `${String.fromCharCode(47, 47)}`;
  const blockComment = `${String.fromCharCode(47, 42)}`;
  assert.equal(src.includes(lineComment) || src.includes(blockComment), false);
  assert.equal(/\bas\s+[A-Za-z{]/.test(src), false);
});

test('routes pure node --test and simple builtins to isolate, subprocesses and chained shells to container', () => {
  assert.equal(classifyCommand('node --test').tier, 'isolate');
  assert.equal(classifyCommand('  node --test test/dates.test.ts  ').tier, 'isolate');
  assert.equal(classifyCommand('ls src').tier, 'isolate');
  assert.equal(classifyCommand('cat package.json').tier, 'isolate');
  assert.equal(classifyCommand('python3 script.py').tier, 'container');
  assert.equal(classifyCommand('git status').tier, 'container');
  assert.equal(classifyCommand('node --test && git status').tier, 'container');
  assert.equal(classifyCommand('cat a | grep b').tier, 'container');
  assert.equal(classifyCommand('echo hi > out.txt').tier, 'container');
  assert.equal(classifyCommand('').tier, 'container');
});

test('tracks escalations and container seconds accurately per seat', () => {
  const tracker = createTierTracker();
  tracker.recordCommand('s1', 'ls src');
  tracker.recordCommand('s1', 'node --test');
  tracker.recordCommand('s2', 'node --test');
  tracker.recordCommand('s2', 'python3 calc.py');
  tracker.recordContainerLease('s2', 4500);
  tracker.recordContainerLease('s2', 1500);

  assert.equal(tracker.isEscalated('s1'), false);
  assert.equal(tracker.isEscalated('s2'), true);
  assert.deepEqual(tracker.stats(), {
    totalCommands: 4,
    isolateCommands: 3,
    containerCommands: 1,
    escalatedSeats: 1,
    totalSeats: 2,
    containerSeconds: 6,
  });
});
