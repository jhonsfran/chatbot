import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCountdown } from './countdown';

test('formats short reset windows as minutes and seconds', () => {
  assert.equal(formatCountdown((4 * 60 + 34) * 1_000), '4:34');
});

test('formats hour-scale renewal windows without unbounded minutes', () => {
  assert.equal(formatCountdown((1 * 60 * 60 + 5 * 60) * 1_000), '1:05');
  assert.equal(formatCountdown((23 * 60 * 60 + 59 * 60 + 59) * 1_000), '23:59');
});

test('formats day-scale renewal windows with explicit units', () => {
  assert.equal(
    formatCountdown((30 * 24 * 60 * 60 + 23 * 60 * 60) * 1_000),
    '30d 23h',
  );
});

test('clamps expired countdowns to zero', () => {
  assert.equal(formatCountdown(-1_000), '0:00');
});
