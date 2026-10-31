import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareVersions, sortVersions } from '../../src/semver.ts';

test('semver: numeric order and prerelease rules', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0-alpha.1', '1.0.0-alpha') > 0);
  assert.ok(compareVersions('1.0.0-alpha.beta', '1.0.0-alpha.1') > 0);
  assert.ok(compareVersions('1.0.0-beta.11', '1.0.0-beta.2') > 0);
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0-beta.11') > 0);
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3+build.5', '1.2.3+other'), 0);
});

test('semver: sort newest first, stable, input untouched', () => {
  const input = ['1.0.0-alpha', '1.0.0', '1.0.0-beta.2', '1.0.0-beta.11', '0.9.9', '1.0.0+b1', '1.0.0-alpha.1'];
  const copy = [...input];
  assert.deepEqual(sortVersions(input), ['1.0.0', '1.0.0+b1', '1.0.0-beta.11', '1.0.0-beta.2', '1.0.0-alpha.1', '1.0.0-alpha', '0.9.9']);
  assert.deepEqual(input, copy);
});

test('semver: invalid versions throw a SyntaxError', () => {
  assert.throws(() => compareVersions('01.2.3', '1.2.3'), SyntaxError);
  assert.throws(() => compareVersions('1.2', '1.2.3'), SyntaxError);
  assert.throws(() => compareVersions('1.2.3-01', '1.2.3'), SyntaxError);
  assert.throws(() => compareVersions('1.2.x', '1.2.3'), SyntaxError);
});
